import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { runInterleaved, runProfile, type Workload } from "../../src/lib/capacity/harness";
import { evaluate } from "../../src/lib/capacity/objectives";
import { renderRunMarkdown } from "../../src/lib/capacity/report-md";
import { examProctorFixture, removeProctorFixture } from "../school-ai/exam-proctor-fixture";

/**
 * SKO-451 morning-peak profile on synthetic data: a noisy school floods whole-roster exports while a second school
 * marks attendance and its pupils autosave exam answers. Only the isolated database and a localhost app are allowed.
 */
export const ISOLATED = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
export function assertIsolated(origin: string) {
  if (process.env.DATABASE_URL !== ISOLATED) throw new Error("Only the isolated database 127.0.0.1:55438/postgres is allowed.");
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Only a localhost app is allowed.");
}

export async function signIn(origin: string, email: string, password: string) {
  const jar = new Map<string, string>();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const post = async (path: string, data: unknown) => {
    const r = await fetch(origin + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie() }, body: JSON.stringify(data), redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const kv = c.split(";")[0]; const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return r;
  };
  const login = await post("/api/auth/login", { email, password });
  assert.equal(login.status, 200, `synthetic sign-in failed for ${email}`);
  const { secret } = await (await post("/api/auth/mfa", { action: "setup" })).json().catch(() => ({}));
  if (secret) { await post("/api/auth/mfa", { action: "verify-setup", code: totp(String(secret).replace(/\s+/g, "")) }); await post("/api/auth/mfa", { action: "acknowledge", acknowledged: true }); }
  return cookie();
}

export async function peakFixtures(db: PrismaClient, origin: string, opts: { pupils: number; noisyStudents: number }) {
  assertIsolated(origin);
  const password = `Synthetic-capacity-${randomUUID()}`, hash = await bcrypt.hash(password, 10);
  const person = async (schoolId: string, campusId: string, role: string, name: string) => {
    const id = randomUUID(), email = `${id}@example.invalid`;
    await db.user.create({ data: { id, schoolId, campusId, role: role as never, fullName: name, email, password: hash, onboardingComplete: true, isActive: true } });
    return { id, email };
  };
  // Noisy school: one large roster and an administrator exporting it.
  const noisyId = `cap-noisy-${randomUUID()}`, noisyCampus = randomUUID(), noisyClass = randomUUID();
  await db.school.create({ data: { id: noisyId, name: "Synthetic Busy Export School", slug: noisyId, regId: noisyId, city: "Lahore", contactEmail: `${noisyId}@example.invalid`, status: "ACTIVE", plan: "PRO" } as never });
  await db.campus.create({ data: { id: noisyCampus, schoolId: noisyId, name: "Busy campus", regId: noisyCampus, city: "Lahore" } });
  await db.class.create({ data: { id: noisyClass, schoolId: noisyId, campusId: noisyCampus, name: "Grade 7", section: "A", academicYear: 2026 } });
  await db.student.createMany({ data: Array.from({ length: opts.noisyStudents }, (_, i) => ({ schoolId: noisyId, campusId: noisyCampus, classId: noisyClass, fullName: `Synthetic roster pupil ${i + 1}`, rollNo: String(i + 1), gender: "OTHER", status: "active", guardianName: `Synthetic guardian ${i + 1}`, guardianPhone: `0300${String(i).padStart(7, "0")}` })) as never });
  const noisyAdmin = await person(noisyId, noisyCampus, "ADMIN", "Synthetic busy administrator");
  // Quiet school: an exam in progress, a class teacher marking, and its own small export.
  const fx = await examProctorFixture(db, { start: false, enabled: false });
  const teacher = await person(fx.schoolId, fx.campusId, "TEACHER", "Synthetic morning teacher");
  await db.class.update({ where: { id: fx.classId }, data: { classTeacherId: teacher.id } });
  const quietAdmin = await person(fx.schoolId, fx.campusId, "ADMIN", "Synthetic quiet administrator");
  const pupils: { userId: string; studentId: string; email: string; cookie: string; sequence: number }[] = [];
  for (let i = 0; i < opts.pupils; i++) {
    const p = await person(fx.schoolId, fx.campusId, "STUDENT", `Synthetic exam pupil ${i + 1}`);
    const s = await db.student.create({ data: { schoolId: fx.schoolId, campusId: fx.campusId, classId: fx.classId, fullName: `Synthetic exam pupil ${i + 1}`, rollNo: String(100 + i), gender: "OTHER", status: "active", studentUserId: p.id } });
    pupils.push({ userId: p.id, studentId: s.id, email: p.email, cookie: "", sequence: 0 });
  }
  await db.schoolAiExamAssignment.update({ where: { id: fx.assignment.id }, data: { studentIds: pupils.map(p => p.studentId) } });
  await db.authAttempt.deleteMany({});
  const exam = `/api/school-ai/exams/${fx.assignment.id}`;
  for (const p of pupils) {
    p.cookie = await signIn(origin, p.email, password);
    for (let retry = 0; ; retry++) {
      const meta = await (await fetch(origin + exam, { headers: { Cookie: p.cookie, Origin: origin } })).json();
      const start = await fetch(origin + exam + "/attempt", { method: "POST", headers: { Cookie: p.cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ version: meta.exam.version }) });
      if (start.status === 200) { p.sequence = (await start.json()).attempt.sequence ?? 0; break; }
      assert.ok(start.status === 409 && retry < 3, `exam start failed: ${start.status}`);
      await new Promise(r => setTimeout(r, 200 * (retry + 1)));
    }
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return {
    password, today, exam,
    noisy: { schoolId: noisyId, admin: await signIn(origin, noisyAdmin.email, password) },
    quiet: { schoolId: fx.schoolId, classId: fx.classId, teacher: await signIn(origin, teacher.email, password), admin: await signIn(origin, quietAdmin.email, password), pupils, assignmentId: fx.assignment.id },
    async cleanup() { await removeProctorFixture(db, fx.schoolId); await db.school.delete({ where: { id: noisyId } }).catch(() => undefined); },
  };
}
export type PeakFixtures = Awaited<ReturnType<typeof peakFixtures>>;

// What the teacher last saw for each pupil, kept across phases; a conflict answer carries the server's mark.
const seen = new WeakMap<object, Map<string, string | null>>();
export function morningPeakWorkloads(f: PeakFixtures, opts: { noisyConcurrency: number; ignoreRetryAfter?: boolean }): Workload[] {
  if (!seen.has(f)) seen.set(f, new Map(f.quiet.pupils.map(p => [p.studentId, null])));
  const marks = seen.get(f)!;
  return [
    { name: "noisy-roster-export", serviceClass: "BACKGROUND", schoolId: f.noisy.schoolId, concurrency: opts.noisyConcurrency, honorRetryAfter: !opts.ignoreRetryAfter, step: () => ({ path: "/api/students/export", cookie: f.noisy.admin }) },
    { name: "quiet-roster-export", serviceClass: "BACKGROUND", schoolId: f.quiet.schoolId, concurrency: 1, pauseMs: 500, honorRetryAfter: true, step: () => ({ path: "/api/students/export", cookie: f.quiet.admin }) },
    { name: "exam-answer-save", serviceClass: "CRITICAL", schoolId: f.quiet.schoolId, concurrency: f.quiet.pupils.length, pauseMs: 250, step: (slot, i) => {
      const p = f.quiet.pupils[slot];
      return { path: `${f.exam}/attempt`, method: "PATCH", cookie: p.cookie, body: { sequence: p.sequence + 1, responses: { q1: i % 2 ? "a2" : "a1", q3: `Synthetic answer revision ${i + 1}` }, submit: false },
        after: (status, payload) => { if (status === 200) p.sequence = (payload as { attempt: { sequence: number } }).attempt.sequence; } };
    } },
    { name: "attendance-register", serviceClass: "INTERACTIVE", schoolId: f.quiet.schoolId, concurrency: 1, pauseMs: 50, step: (_slot, i) => {
      const pupil = f.quiet.pupils[i % f.quiet.pupils.length], known = marks.get(pupil.studentId) ?? null, next = known === "PRESENT" ? "ABSENT" : "PRESENT";
      return { path: "/api/attendance/register", method: "POST", cookie: f.quiet.teacher, body: { classId: f.quiet.classId, date: f.today, entries: [{ studentId: pupil.studentId, status: next, knownStatus: known }] },
        after: (status, payload) => {
          if (status === 200) marks.set(pupil.studentId, next);
          const conflict = status === 409 ? (payload as { data?: { conflicts?: { studentId: string; current: string | null }[] } }).data?.conflicts?.find(c => c.studentId === pupil.studentId) : undefined;
          if (conflict) marks.set(pupil.studentId, conflict.current);
        } };
    } },
  ];
}

const operator = async (origin: string, cookie: string, method: "GET" | "POST", body?: unknown) => {
  const r = await fetch(origin + "/api/owner/capacity", { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); assert.ok(r.ok, JSON.stringify(j)); return j.data;
};

/** Run the profile, read server-measured background peaks, write the report files and record the run. */
export async function runMorningPeak(origin: string, operatorCookie: string, f: PeakFixtures, opts: { durationMs: number; noisyConcurrency: number; outDir: string; noisyStudents: number; ignoreRetryAfter?: boolean }) {
  // Before and during, interleaved: the quiet school's critical and interactive work alone, then the same work
  // while the noisy school floods exports, in alternating windows after a short warm-up.
  const quietOnly = () => morningPeakWorkloads(f, opts).filter(w => w.serviceClass !== "BACKGROUND");
  await runProfile({ origin, durationMs: 3000, workloads: quietOnly() });
  await operator(origin, operatorCookie, "POST", { action: "reset-peaks" });
  const rounds = 3;
  const run = await runInterleaved({ origin, rounds, quietMs: Math.round(opts.durationMs / rounds / 2), noisyMs: Math.round(opts.durationMs / rounds), quiet: quietOnly, noisy: () => morningPeakWorkloads(f, opts) });
  const baseline = { results: run.baseline };
  const live = await operator(origin, operatorCookie, "GET");
  const backgroundPeaks = (live.requests.schools as { schoolId: string; peakBackground: { peak: number; limit: number } | null }[])
    .filter(s => s.peakBackground && [f.noisy.schoolId, f.quiet.schoolId].includes(s.schoolId)).map(s => ({ schoolId: s.schoolId, ...s.peakBackground! }));
  let release = "unknown";
  try { release = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim() + (execFileSync("git", ["status", "--porcelain"]).toString().trim() ? "+local-changes" : ""); } catch { /* not a checkout */ }
  const runId = `LOAD-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${randomUUID().slice(0, 6)}`;
  const report = {
    runId, profile: opts.ignoreRetryAfter ? "Tested limit: noisy client ignoring Retry-After" : "Morning peak with a noisy roster export", release,
    environment: `next dev on ${origin}, isolated Postgres 127.0.0.1:55438, shared developer machine, one app instance`,
    dataset: { synthetic: true, schools: 2, noisyRosterStudents: opts.noisyStudents, examPupils: f.quiet.pupils.length, examQuestions: 3, registerClassSize: f.quiet.pupils.length + 2 },
    concurrency: Object.fromEntries(Object.entries(run.results).map(([k, v]) => [k, (v as { concurrency: number }).concurrency])),
    results: run.results, baseline: baseline.results, backgroundPeaks, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt.toISOString(),
    notes: opts.ignoreRetryAfter
      ? "Synthetic only. Explicitly tested limit: a client that ignores Retry-After keeps sending refused requests; in-app admission bounds its concurrency but not its request rate, which needs an edge rate limit."
      : "Synthetic only. The noisy client honours Retry-After as the product UI does. Objectives are proposed for this environment; they are not a production SLO or capacity claim.",
  };
  const objectives = evaluate(report);
  const recorded = await operator(origin, operatorCookie, "POST", { action: "record-run", ...report });
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(`${opts.outDir}/${runId}.json`, JSON.stringify({ ...report, objectives }, null, 2) + "\n");
  await writeFile(`${opts.outDir}/${runId}.md`, renderRunMarkdown({ ...report, objectives, policies: (live.policy.active as { schoolName: string | null; scope: string; limitValue: number }[]).map(p => `${p.schoolName ?? "Platform default"} ${p.scope}=${p.limitValue}`) }));
  return { report, objectives, recorded };
}
