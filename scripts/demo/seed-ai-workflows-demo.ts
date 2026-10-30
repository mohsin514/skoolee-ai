/**
 * AI Workflows Slice 9: the LEAP demo tenant "Al-Noor Grammar, Lahore" and its recorded runs.
 *
 *   DEMO_PASSWORD=… node --import ./tests/support/server-only.mjs --import tsx scripts/demo/seed-ai-workflows-demo.ts           # idempotent
 *   DEMO_PASSWORD=… node --import ./tests/support/server-only.mjs --import tsx scripts/demo/seed-ai-workflows-demo.ts --reset   # delete and seed again
 * (The `server-only` shim is needed because the AI Workflows services import it; Next supplies it in the app.)
 * Idempotent: a tenant whose recorded runs are all complete is reported and left as it is.
 *
 * Guards (the same as scripts/demo/reset-demo-tenant.ts): it refuses a non-loopback database unless
 * DEMO_RESET_ALLOW_REMOTE=1 is set on purpose for the dedicated demo environment; it only ever deletes or
 * writes the one school AL_NOOR_SCHOOL_ID, and refuses if that id is not labelled "[Synthetic demo]".
 * Passwords come from DEMO_PASSWORD only and are never printed or written to a file; the manifest on
 * stdout lists roles and example.invalid emails.
 *
 * Fixtures (written directly, as the other demo seeds do): the school, campus, locale policy, weekend,
 * active 2026–27 cycle, staff accounts (teachers already accepted), Grade 7 B with 33 synthetic pupils
 * (two called Ali), a published 7B timetable, a verified guardian link to Hamza, Bilal's open September and
 * October invoices, and a Delivery Policy requiring a second person for money.
 *
 * Recorded runs (one AiWorkflowJob per beat of docs/leap/ai-workflows-demo.md) go through the real
 * services: startJob → advanceJob (planner) → answer / amend / confirm commands → hand-off claim and the
 * Collect desk's own command → observe. The only stand-in is the planner's model call: a recorded plan
 * returned by `recordedPlanner`, logged with model RECORDED_PLANNER_MODEL and zero tokens (no credit), and
 * still checked by the real planner (retrieval, handle binding, evidence, schema). Every receipt, preview,
 * question and event is what the engine produced. The admin Build compiles without a model at all.
 */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { AL_NOOR_DEMO_SLUG, RECORDED_PLANNER_MODEL, RECORDED_RUN_PREFIX } from "../../src/lib/ai-workflows/demo";
import { DEMO_LABEL } from "./reset-demo-tenant";

export const AL_NOOR_SCHOOL_ID = AL_NOOR_DEMO_SLUG;
const SCHOOL_NAME = `${DEMO_LABEL} Al-Noor Grammar, Lahore`;
const email = (key: string) => `demo-alnoor-${key}@example.invalid`;

type Generate = typeof generateAIDraft;
type Locale = "en" | "ar" | "ur";
type Db = PrismaClient;

/** The typed words of each recorded beat (the presenter script quotes these). */
export const RECORDED_BEATS = {
  adminBuild: { actor: "admin", language: "en" as Locale, text: "Build my workspace (Grade 8 × 2, middle-school subjects, the school day, rooms, fee rules, leave)" },
  teacherRegister: { actor: "teacher", language: "ur" as Locale, text: "7B کا کل کا رجسٹر: علی اور زینب غیر حاضر", answer: "علی رضا" },
  accountantCollect: { actor: "accountant", language: "en" as Locale, text: "Record Rs 12,000 cash from Bilal's father for the September fee" },
  parentLeave: { actor: "parent", language: "ar" as Locale, text: "حمزة سيغيب بعد غد، عنده موعد عند الطبيب" },
  librarianCatalogue: { actor: "librarian", language: "en" as Locale, text: "Add Atlas of the World by Collins, 2 copies" },
  librarianCopies: { actor: "librarian", language: "en" as Locale, text: "Add 3 copies of Atlas of the World, numbered from LB-0101" },
  librarianNotYet: { actor: "librarian", language: "en" as Locale, text: "Publish the Grade 9 results" },
} as const;
export type BeatName = keyof typeof RECORDED_BEATS;
export const recordedKey = (beat: BeatName) => `${RECORDED_RUN_PREFIX}${beat}`;

const ACCOUNTS = [
  { key: "admin", role: "ADMIN", name: "Imran Qureshi", owner: true },
  { key: "approver", role: "ADMIN", name: "Farah Naz", owner: false },
  { key: "teacher", role: "TEACHER", name: "Ayesha Siddiqui", owner: false },
  { key: "teacher2", role: "TEACHER", name: "Usman Ghani", owner: false },
  { key: "parent", role: "PARENT", name: "Tariq Mehmood", owner: false },
  { key: "librarian", role: "LIBRARIAN", name: "Nadia Perveen", owner: false },
  // Created after the admin Build, so that Build ran with the finance desk vacant (it has a fee beat).
  { key: "accountant", role: "ACCOUNTANT", name: "Sana Malik", owner: false },
] as const;
type AccountKey = (typeof ACCOUNTS)[number]["key"];

/** 7B: 33 synthetic pupils. Two are called Ali (the disambiguation beat); Hamza is the parent's child; Bilal has the invoices. */
const PUPILS: Array<[string, string, "MALE" | "FEMALE"]> = [
  ["Ali Raza", "علی رضا", "MALE"], ["Ali Hassan", "علی حسن", "MALE"], ["Zainab Bibi", "زینب بی بی", "FEMALE"], ["Hamza Tariq", "حمزہ طارق", "MALE"],
  ["Bilal Ahmed", "بلال احمد", "MALE"], ["Ayesha Noor", "عائشہ نور", "FEMALE"], ["Fatima Zahra", "فاطمہ زہرا", "FEMALE"], ["Umar Farooq", "عمر فاروق", "MALE"],
  ["Hira Khan", "حرا خان", "FEMALE"], ["Saad Iqbal", "سعد اقبال", "MALE"], ["Maryam Javed", "مریم جاوید", "FEMALE"], ["Hassan Javed", "حسن جاوید", "MALE"],
  ["Iqra Shahid", "اقرا شاہد", "FEMALE"], ["Danish Mirza", "دانش مرزا", "MALE"], ["Sana Ullah", "ثناء اللہ", "MALE"], ["Mahnoor Aslam", "ماہ نور اسلم", "FEMALE"],
  ["Rayan Butt", "ریان بٹ", "MALE"], ["Areeba Saleem", "اریبہ سلیم", "FEMALE"], ["Taha Qureshi", "طہٰ قریشی", "MALE"], ["Laiba Riaz", "لائبہ ریاض", "FEMALE"],
  ["Abdullah Nadeem", "عبداللہ ندیم", "MALE"], ["Eman Fatima", "ایمان فاطمہ", "FEMALE"], ["Hamid Rasheed", "حامد رشید", "MALE"], ["Noor ul Ain", "نور العین", "FEMALE"],
  ["Shayan Malik", "شایان ملک", "MALE"], ["Kinza Imran", "کنزہ عمران", "FEMALE"], ["Zaid Anwar", "زید انور", "MALE"], ["Aiman Yousaf", "ایمن یوسف", "FEMALE"],
  ["Moiz Akhtar", "معز اختر", "MALE"], ["Rida Kamal", "ردا کمال", "FEMALE"], ["Talha Sarwar", "طلحہ سرور", "MALE"], ["Minahil Asif", "مناہل آصف", "FEMALE"],
  ["Huzaifa Latif", "حذیفہ لطیف", "MALE"],
];

/** Tables keyed by school_id without a foreign key to the school, so the school's delete does not reach them. */
const UNLINKED_TABLES = ["familyResultNote", "examBriefReceipt", "examException", "pilotLedgerSnapshot", "pilotLedgerSetting", "bookCopy", "libraryLoanPolicy", "bookReservation", "libraryCharge", "paymentAllocation", "paymentReceipt", "activityItem"] as const;

export function assertDatabaseAllowed(url: string | undefined, env: Record<string, string | undefined> = process.env) {
  const host = new URL(url ?? "http://invalid").hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && env.DEMO_RESET_ALLOW_REMOTE !== "1") throw new Error(`Refusing to seed the AI Workflows demo tenant on ${host}. Set DEMO_RESET_ALLOW_REMOTE=1 only for the dedicated demo environment.`);
}

export interface DemoRun { beat: BeatName; jobId: string; actor: string; status: string; outcome: string | null; steps: string[]; receipts: number }
export interface AiWorkflowsDemoManifest { schoolId: string; slug: string; created: boolean; accounts: Array<{ role: string; email: string }>; counts: Record<string, number>; runs: DemoRun[]; fingerprint: string }

export async function seedAiWorkflowsDemo(db: Db, password: string, options: { reset?: boolean } = {}): Promise<AiWorkflowsDemoManifest> {
  const existing = await db.school.findUnique({ where: { id: AL_NOOR_SCHOOL_ID }, select: { name: true } });
  if (existing && !existing.name.startsWith(DEMO_LABEL)) throw new Error(`School ${AL_NOOR_SCHOOL_ID} is not labelled "${DEMO_LABEL}". Nothing was changed.`);
  // Idempotent: a tenant whose recorded runs are all complete is reported, not rewritten.
  if (existing && !options.reset && await complete(db)) return manifest(db, false);
  if (!password || password.length < 12) throw new Error("Set DEMO_PASSWORD (12+ characters) for the synthetic demo accounts.");
  if (existing) await removeTenant(db);
  await seedFixtures(db, await bcrypt.hash(password, 12));
  await recordRuns(db);
  if (!(await complete(db))) throw new Error("A recorded demo run did not complete; see the manifest. Re-run with --reset after fixing it.");
  return manifest(db, true);
}

export async function removeTenant(db: Db) {
  // The school goes first: append-only money and evidence rows accept a delete only once their school is gone.
  await db.school.deleteMany({ where: { id: AL_NOOR_SCHOOL_ID, name: { startsWith: DEMO_LABEL } } });
  if (await db.school.count({ where: { id: AL_NOOR_SCHOOL_ID } })) return;
  for (const table of UNLINKED_TABLES) await (db[table] as unknown as { deleteMany: (args: { where: { schoolId: string } }) => Promise<unknown> }).deleteMany({ where: { schoolId: AL_NOOR_SCHOOL_ID } });
}

// ─── fixtures ─────────────────────────────────────────────────────────────

const day = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, n: number) => new Date(day(date).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const WEEKEND = new Set([0]); // Sunday (JS getUTCDay); Monday to Saturday are school days.
const schoolDay = (date: string) => !WEEKEND.has(day(date).getUTCDay());
function shiftSchoolDays(date: string, n: number) {
  let at = date;
  for (let moved = 0; moved < Math.abs(n);) { at = addDays(at, Math.sign(n)); if (schoolDay(at)) moved++; }
  return at;
}

async function seedFixtures(db: Db, hash: string) {
  const schoolId = AL_NOOR_SCHOOL_ID;
  await db.school.create({ data: { id: schoolId, name: SCHOOL_NAME, slug: AL_NOOR_DEMO_SLUG, regId: "DEMO-ALNOOR-01", contactEmail: "synthetic-al-noor@example.invalid", city: "Lahore", timezone: "Asia/Karachi", status: "ACTIVE", plan: "PRO" } });
  const campus = await db.campus.create({ data: { schoolId, name: `${DEMO_LABEL} Al-Noor Grammar · Gulberg campus`, regId: "DEMO-ALNOOR-C1", city: "Lahore" } });
  const campusId = campus.id;
  const firstDay = new Date("2026-04-01T00:00:00Z");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", country: "PK", currency: "PKR", weekend: [0] }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: "demo-seed" } });
  await db.weekend.create({ data: { schoolId, campusId, dayOfWeek: 7 } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026–27", academicYear: 2026, status: "ACTIVE", startDate: firstDay, endDate: new Date("2027-03-31T00:00:00Z") } });

  const ids = {} as Record<AccountKey, string>;
  for (const account of ACCOUNTS.filter(row => row.key !== "accountant")) {
    ids[account.key] = (await db.user.create({ data: { email: email(account.key), password: hash, fullName: account.name, role: account.role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: account.key === "teacher" ? "ur" : account.key === "parent" ? "ar" : "en", ...(account.owner ? { isInstitutionOwner: true, canManageMemberships: true } : {}) } })).id;
  }

  // Grade 7 B is already running: Ayesha is its class teacher and teaches Science; Usman teaches Mathematics.
  const sevenB = await db.class.create({ data: { schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026, status: "ACTIVE", classTeacherId: ids.teacher, capacity: 35, teachingMode: "SUBJECT" } });
  const science = await db.subject.create({ data: { schoolId, campusId, classId: sevenB.id, name: "Science", teacherId: ids.teacher, totalMarks: 100 } });
  const maths = await db.subject.create({ data: { schoolId, campusId, classId: sevenB.id, name: "Mathematics", teacherId: ids.teacher2, totalMarks: 100 } });
  const pupils: Record<string, string> = {};
  for (const [index, [fullName, nameUr, gender]] of PUPILS.entries()) {
    pupils[fullName] = (await db.student.create({ data: { schoolId, campusId, classId: sevenB.id, fullName, nameUr, rollNo: String(index + 1), gender, status: "active", enrollmentDate: firstDay } })).id;
  }

  // A published 7B timetable: Mathematics in period 2 and Science in period 3, Monday to Saturday.
  const { recordTimetableVersion } = await import("../../src/lib/timetable/versions");
  const timetable = await db.timetable.create({ data: { schoolId, campusId, classId: sevenB.id, academicYear: 2026, status: "PUBLISHED", publishedAt: new Date() } });
  for (let weekday = 1; weekday <= 6; weekday++) {
    await db.timetableSlot.create({ data: { schoolId, timetableId: timetable.id, dayOfWeek: weekday, periodNumber: 2, subjectId: maths.id, teacherId: ids.teacher2, startTime: "08:40", endTime: "09:20" } });
    await db.timetableSlot.create({ data: { schoolId, timetableId: timetable.id, dayOfWeek: weekday, periodNumber: 3, subjectId: science.id, teacherId: ids.teacher, startTime: "09:20", endTime: "10:00" } });
  }
  await recordTimetableVersion(db as unknown as Parameters<typeof recordTimetableVersion>[0], { schoolId, campusId, timetableId: timetable.id, effectiveFrom: "2026-04-01", publishedById: ids.admin });

  // Tariq is Hamza's verified guardian (attendance and communication shared; finances not).
  const link = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: pupils["Hamza Tariq"], guardianUserId: ids.parent, createdByUserId: ids.admin, fullName: "Tariq Mehmood", email: email("parent"), relationship: "Father", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: link.id, createdByUserId: ids.admin, reason: "Synthetic demo fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });

  // Bilal's September invoice (paid in the recorded run) and his open October invoice (the live beat), Rs 12,000 each.
  for (const [month, tail] of [["2026-09", "00901"], ["2026-10", "01001"]] as const) {
    const amount = 1_200_000;
    await db.invoice.create({ data: { schoolId, campusId, studentId: pupils["Bilal Ahmed"], invoiceDate: day(`${month}-01`), dueDate: day(`${month}-10`), currency: "PKR", invoiceNumber: `INV-2026-DEMO-${tail}`, monthlyFee: amount, subtotal: amount, totalAmount: amount, balanceDue: amount } });
  }
}

/** Money needs a second person on this campus (the campus Delivery Policy), so Sana's collection goes to an admin. */
async function requireSecondPersonForMoney(db: Db, campusId: string, adminId: string) {
  const { PLATFORM_DEFAULT_DELIVERY_POLICY, DELIVERY_POLICY_KIND } = await import("../../src/lib/school-ai/delivery-policy");
  const record = await db.schoolAiRecord.create({ data: { schoolId: AL_NOOR_SCHOOL_ID, campusId, kind: DELIVERY_POLICY_KIND, title: `${DEMO_LABEL} Delivery policy`, status: "APPROVED", data: {}, createdById: adminId, updatedById: adminId, idempotencyKey: "demo-alnoor-delivery-policy", requestHash: "0".repeat(64) } });
  await db.schoolAiRevision.create({ data: { schoolId: AL_NOOR_SCHOOL_ID, campusId, recordId: record.id, version: 1, action: "APPROVE", title: `${DEMO_LABEL} Delivery policy`, status: "APPROVED", actorId: adminId, data: { ...PLATFORM_DEFAULT_DELIVERY_POLICY, separationOfDuties: "REQUIRED" } as unknown as Prisma.InputJsonValue } });
}

// ─── recorded runs ────────────────────────────────────────────────────────

async function actor(db: Db, key: AccountKey): Promise<AuthUser> {
  const row = await db.user.findFirstOrThrow({ where: { schoolId: AL_NOOR_SCHOOL_ID, email: email(key) } });
  return { userId: row.id, schoolId: row.schoolId, campusId: row.campusId, role: row.role as AuthUser["role"], email: row.email, fullName: row.fullName, accessVersion: row.accessVersion ?? 0, institutionKind: "STANDALONE", ...(row.isInstitutionOwner ? { isInstitutionOwner: true } : {}), ...(row.canManageMemberships ? { canManageMemberships: true } : {}) };
}

interface PlanStep { key: string; capability: string; dependsOn?: string[]; input: Record<string, unknown>; evidence: Array<{ pointer: string; quote: string }> }
type Proposal = { kind: "plan"; steps: PlanStep[] } | { kind: "unsupported"; unsupportedNearest: string | null };
interface PlannerView { capabilities: string[]; unavailable: string[]; handles: Record<string, Array<{ handle: string; label: string }>> }

/**
 * The recorded stand-in for the planner's one model call. It reads the same masked payload the model
 * would, answers with the plan written for the beat, and refuses to name a capability the real retrieval
 * did not offer. Zero tokens: the attempt is logged, nothing is charged.
 */
function recordedPlanner(script: (view: PlannerView, call: number) => Proposal): Generate {
  let call = 0;
  return (async ({ prompt }: { prompt: string }) => { try {
    // The payload is masked text, not guaranteed JSON (masking can replace a number with a token), so it
    // is read the way a model reads it: by its keys.
    const at = prompt.indexOf('"unavailable":');
    const keys = (text: string) => [...text.matchAll(/"capability":"([a-z_.]+)"/g)].map(match => match[1]);
    const handles: PlannerView["handles"] = {};
    for (const [, handle, label] of prompt.matchAll(/\\"handle\\":\\"([a-z]+:\d+)\\",\\"label\\":\\"((?:[^"\\]|\\\\.)*)\\"/g)) (handles[handle.split(":")[0]] ??= []).push({ handle, label });
    const view: PlannerView = { capabilities: keys(prompt.slice(prompt.indexOf('"capabilities":'), at)), unavailable: keys(prompt.slice(at)), handles };
    const proposal = script(view, call++);
    if (proposal.kind === "plan") for (const step of proposal.steps) if (!view.capabilities.includes(step.capability)) {
      // The engine records this as a provider failure; say why here, where the seed is run.
      const message = `demo seed: ${step.capability} was not retrieved (got ${view.capabilities.join(", ")})`;
      console.error(message);
      throw new Error(message);
    }
    return { text: JSON.stringify({ question: null, answer: null, unsupportedNearest: null, steps: [], ...proposal }), model: RECORDED_PLANNER_MODEL, tokensUsed: 0, promptVersion: "demo-recorded" };
  } catch (error) { console.error("demo seed planner stand-in:", error); throw error; } }) as unknown as Generate;
}

const handleFor = (view: PlannerView, kind: string, label: string) => {
  const found = view.handles[kind]?.find(item => item.label === label);
  if (!found) throw new Error(`demo seed: no ${kind} handle labelled ${label}`);
  return found.handle;
};

async function services() {
  const jobs = await import("../../src/lib/ai-workflows/jobs/job-service");
  const { runCommand } = await import("../../src/lib/ai-workflows/jobs/commands");
  const { toRunView } = await import("../../src/lib/ai-workflows/view");
  const questionnaire = await import("../../src/lib/ai-workflows/questionnaire/service");
  const { claimHandoff } = await import("../../src/lib/ai-workflows/executor/handoff");
  const { inTenant } = await import("../../src/lib/ai-workflows/jobs/actor");
  const { collectPaymentCore } = await import("../../src/lib/fees/collect-command");
  const { schoolToday } = await import("../../src/lib/datetime");
  const { prisma: prismaClient } = await import("../../src/lib/db/prisma");
  return { ...jobs, runCommand, toRunView, ...questionnaire, claimHandoff, inTenant, collectPaymentCore, schoolToday, prismaClient };
}
type Services = Awaited<ReturnType<typeof services>>;

const commandId = (jobId: string, label: string, n: number) => `demo-${label}-${n}-${jobId.slice(0, 8)}`;

/** Confirms each step that waits with a preview, one command each (as a person pressing its button would). */
async function confirmWaiting(s: Services, user: AuthUser, jobId: string, generate?: Generate) {
  for (let round = 0; round < 60; round++) {
    const run = s.toRunView(await s.getJob(user, jobId));
    const waiting = run.steps.find(step => step.state === "awaiting_confirm" && step.preview);
    if (!waiting) return run;
    await s.runCommand(user, jobId, { type: "confirm", jobVersion: run.version, clientCommandId: commandId(jobId, "confirm", round), steps: [{ stepId: waiting.id, previewVersion: waiting.preview!.version, previewHash: waiting.preview!.hash, inputHash: waiting.preview!.inputHash }] }, null, generate);
  }
  throw new Error("demo seed: too many confirmations");
}

/**
 * The platform-wide provider limiter (jobs/provider-limit.ts) can pause a planning job when the shared
 * window is full. The seed then does what the worker sweep does after the backoff: back to PLANNING, and
 * plan again. The stand-in itself never reaches a provider.
 */
async function wakeIfPaused(s: Services, user: AuthUser, jobId: string, generate: Generate) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const job = await s.getJob(user, jobId);
    if (job.status !== "PAUSED" || job.errorCode !== "PROVIDER_UNAVAILABLE") return;
    await new Promise(resolve => setTimeout(resolve, 1_200));
    await s.inTenant(user, () => s.prismaClient.aiWorkflowJob.updateMany({ where: { id: jobId, schoolId: user.schoolId, status: "PAUSED", errorCode: "PROVIDER_UNAVAILABLE" }, data: { status: "PLANNING", nextWakeAt: null, version: { increment: 1 } } }));
    await s.advanceJob(user, jobId, "request", generate);
  }
}

async function answer(s: Services, user: AuthUser, jobId: string, text: string, generate: Generate) {
  const run = s.toRunView(await s.getJob(user, jobId));
  if (run.status !== "NEEDS_INPUT") throw new Error(`demo seed: expected a question, job is ${await describe(s, user, jobId)}`);
  await s.runCommand(user, jobId, { type: "answer", jobVersion: run.version, clientCommandId: commandId(jobId, "answer", 0), text }, null, generate);
  await wakeIfPaused(s, user, jobId, generate);
}

async function freeform(s: Services, user: AuthUser, beat: BeatName, generate: Generate) {
  const { text, language } = RECORDED_BEATS[beat];
  const job = await s.startJob(user, { message: text, language, idempotencyKey: recordedKey(beat), ...(user.campusId && user.role !== "PARENT" ? { campusId: user.campusId } : {}) });
  await s.advanceJob(user, job.id, "request", generate);
  await wakeIfPaused(s, user, job.id, generate);
  return job.id;
}

async function recordRuns(db: Db) {
  const s = await services();
  const admin = await actor(db, "admin");
  const campusId = admin.campusId!;
  const today = await s.inTenant(admin, () => s.schoolToday(AL_NOOR_SCHOOL_ID, campusId));

  // 1. Admin Build (no model call): typed answers compile to reviewed setup steps; each school record is saved
  //    by its own confirmation. The finance desk is vacant, so fee rules are part of this Build.
  const sheet = await s.getSheet(admin, "admin", "en");
  const answers = {
    gradeLadder: { G8: 2 }, teachingMode: { MIDDLE: "SUBJECT" },
    subjectsByGrade: { MIDDLE: ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Computer Science"] },
    dayShape: { start: "08:00", periods: 8, minutes: 40, breakAfter: 4, breakMinutes: 20 },
    rooms: { classrooms: 4, labs: 1, halls: 0, rows: 5, benches: 4, seats: 2 },
    feePlan: { monthly_MIDDLE: 12000, admission: 15000, lateFinePerDay: 50 },
    leavePolicy: { Casual: 10, Sick: 8 },
  };
  const { version } = await s.saveAnswers(admin, "admin", { version: sheet.version, answers, confirmedKeys: Object.keys(answers) });
  const built = await s.buildSetup(admin, "admin", { version, language: "en" });
  await confirmWaiting(s, admin, built.id);

  // Sana takes the finance desk after the Build; money now needs a second person on this campus.
  const accountantRow = ACCOUNTS.find(row => row.key === "accountant")!;
  const hash = (await db.user.findFirstOrThrow({ where: { id: admin.userId }, select: { password: true } })).password;
  await db.user.create({ data: { email: email("accountant"), password: hash, fullName: accountantRow.name, role: "ACCOUNTANT", schoolId: AL_NOOR_SCHOOL_ID, campusId, isActive: true, onboardingComplete: true, preferredLanguage: "en" } });
  await requireSecondPersonForMoney(db, campusId, admin.userId);

  // 2. Teacher register in Urdu, for the previous school day: two Alis → a question → "Mark the other 31 present" → save.
  const teacher = await actor(db, "teacher");
  const registerDay = shiftSchoolDays(today, -1);
  const said = "علی اور زینب غیر حاضر";
  const teacherPlan = recordedPlanner((view, call) => ({ kind: "plan", steps: [{
    key: "s1", capability: "attendance.mark_class",
    input: { classId: handleFor(view, "class", "Grade 7 B"), date: registerDay, entries: [{ student: call === 0 ? "علی" : RECORDED_BEATS.teacherRegister.answer, status: "ABSENT", said }, { student: "زینب", status: "ABSENT", said }] },
    evidence: [{ pointer: "/entries/0/said", quote: said }, { pointer: "/entries/1/said", quote: said }],
  }] }));
  const registerJob = await freeform(s, teacher, "teacherRegister", teacherPlan);
  await answer(s, teacher, registerJob, RECORDED_BEATS.teacherRegister.answer, teacherPlan);
  {
    const run = s.toRunView(await s.getJob(teacher, registerJob));
    const step = run.steps.find(item => item.state === "awaiting_confirm");
    const action = step?.preview?.actions?.find(item => item.id === "rest-present");
    if (!step?.preview || !action) throw new Error(`demo seed: the register did not offer "Mark the other … present" (${await describe(s, teacher, registerJob)})`);
    await s.runCommand(teacher, registerJob, { type: "amend", jobVersion: run.version, stepId: step.id, previewVersion: step.preview.version, actionId: action.id, expect: action.expect }, null);
  }
  await confirmWaiting(s, teacher, registerJob, teacherPlan);

  // 3. Accountant: Sana's collection is prepared for an admin (separation of duties); Farah claims it and records
  //    it on the Collect desk through its own command; the engine then observes the payment.
  const accountant = await actor(db, "accountant");
  const collectPlan = recordedPlanner(() => ({ kind: "plan", steps: [{
    key: "s1", capability: "fees.collect_payment", input: { student: "Bilal", month: "2026-09", amount: 12000, method: "CASH" },
    evidence: [{ pointer: "/student", quote: "Bilal's father" }, { pointer: "/amount", quote: "Rs 12,000" }],
  }] }));
  const collectJob = await freeform(s, accountant, "accountantCollect", collectPlan);
  const handoff = await db.aiWorkflowHandoff.findFirst({ where: { schoolId: AL_NOOR_SCHOOL_ID, jobId: collectJob } });
  if (!handoff) throw new Error(`demo seed: the collection was not prepared as a hand-off ${await describe(s, accountant, collectJob)}`);
  const approver = await actor(db, "approver");
  await s.inTenant(approver, async () => {
    const claimed = await s.claimHandoff(approver, handoff.id);
    const prefill = claimed.prefill as { invoiceId: string; studentId: string; amount: number; method: string | null };
    await s.collectPaymentCore(approver, { studentId: prefill.studentId, invoiceId: prefill.invoiceId, amount: prefill.amount, paymentMethod: prefill.method ?? "CASH", paymentDate: today, idempotencyKey: `demo-alnoor-collect-${handoff.id.slice(0, 8)}`, workflowHandoffId: handoff.id });
  });
  await s.advanceJob(accountant, collectJob);

  // 4. Parent in Arabic: leave for Hamza two school days ahead. The day is asked (relative words are not
  //    evidence for a date), answered with the picked date, then the note is sent by its own confirmation.
  const parent = await actor(db, "parent");
  const leaveDay = shiftSchoolDays(today, 2);
  const reason = "عنده موعد عند الطبيب";
  const leavePlan = recordedPlanner((_view, call) => ({ kind: "plan", steps: [{
    key: "s1", capability: "family.request_leave",
    input: call === 0 ? { reason } : { from: leaveDay, reason },
    evidence: [{ pointer: "/reason", quote: reason }, ...(call === 0 ? [] : [{ pointer: "/from", quote: leaveDay }])],
  }] }));
  const leaveJob = await freeform(s, parent, "parentLeave", leavePlan);
  await answer(s, parent, leaveJob, leaveDay, leavePlan);
  await confirmWaiting(s, parent, leaveJob, leavePlan);

  // 5. Librarian: the Atlas joins the catalogue (A, runs at once), three labelled copies are registered (B),
  //    and publishing results is not something AI does for a librarian (not supported, nothing sent).
  const librarian = await actor(db, "librarian");
  await freeform(s, librarian, "librarianCatalogue", recordedPlanner(() => ({ kind: "plan", steps: [{
    key: "s1", capability: "library.book_create", input: { books: [{ title: "Atlas of the World", author: "Collins", copiesTotal: 2 }] },
    evidence: [{ pointer: "/books/0/title", quote: "Atlas of the World" }],
  }] })));
  const copiesPlan = recordedPlanner(() => ({ kind: "plan", steps: [{
    key: "s1", capability: "library.desk_add_copies", input: { title: "Atlas of the World", numberFrom: "LB-0101", count: 3 },
    evidence: [{ pointer: "/title", quote: "Atlas of the World" }],
  }] }));
  const copiesJob = await freeform(s, librarian, "librarianCopies", copiesPlan);
  await confirmWaiting(s, librarian, copiesJob, copiesPlan);
  await freeform(s, librarian, "librarianNotYet", recordedPlanner(view => ({ kind: "unsupported", unsupportedNearest: view.unavailable.find(key => /result|report/.test(key)) ?? null })));
}

// ─── state and manifest ───────────────────────────────────────────────────

const BEAT_ACTOR: Record<BeatName, AccountKey> = { adminBuild: "admin", teacherRegister: "teacher", accountantCollect: "accountant", parentLeave: "parent", librarianCatalogue: "librarian", librarianCopies: "librarian", librarianNotYet: "librarian" };

/** Every recorded run of the tenant, newest plan only, with its receipts. */
export async function recordedRuns(db: Db): Promise<DemoRun[]> {
  const runs: DemoRun[] = [];
  for (const beat of Object.keys(RECORDED_BEATS) as BeatName[]) {
    const user = await db.user.findFirst({ where: { schoolId: AL_NOOR_SCHOOL_ID, email: email(BEAT_ACTOR[beat]) }, select: { id: true } });
    if (!user) continue;
    const job = beat === "adminBuild"
      ? await db.aiWorkflowJob.findFirst({ where: { schoolId: AL_NOOR_SCHOOL_ID, actorId: user.id, origin: "QUESTIONNAIRE" }, orderBy: { createdAt: "asc" }, include: { steps: { orderBy: [{ createdAt: "asc" }, { stepKey: "asc" }] } } })
      : await db.aiWorkflowJob.findUnique({ where: { schoolId_actorId_idempotencyKey: { schoolId: AL_NOOR_SCHOOL_ID, actorId: user.id, idempotencyKey: recordedKey(beat) } }, include: { steps: { orderBy: [{ createdAt: "asc" }, { stepKey: "asc" }] } } });
    if (!job) continue;
    const steps = job.steps.filter(step => step.planVersion === job.planVersion);
    runs.push({ beat, jobId: job.id, actor: BEAT_ACTOR[beat], status: job.status, outcome: job.outcome, steps: steps.map(step => `${step.capabilityKey}:${step.status}`), receipts: steps.filter(step => step.receipt).length });
  }
  return runs;
}

async function complete(db: Db) {
  const runs = await recordedRuns(db);
  return runs.length === Object.keys(RECORDED_BEATS).length && runs.every(run => run.status === "COMPLETED");
}

async function manifest(db: Db, created: boolean): Promise<AiWorkflowsDemoManifest> {
  const where = { schoolId: AL_NOOR_SCHOOL_ID };
  const counts = {
    users: await db.user.count({ where }), classes: await db.class.count({ where }), pupils: await db.student.count({ where }),
    guardianLinks: await db.guardianRelationship.count({ where }), invoices: await db.invoice.count({ where }), payments: await db.payment.count({ where }),
    attendance: await db.attendance.count({ where }), books: await db.book.count({ where }), bookCopies: await db.bookCopy.count({ where }),
    leaveRequests: await db.learnerLeaveRequest.count({ where }), jobs: await db.aiWorkflowJob.count({ where }),
  };
  const runs = await recordedRuns(db);
  const accounts = (await db.user.findMany({ where, select: { role: true, email: true }, orderBy: { email: "asc" } }));
  const fingerprint = createHash("sha256").update(JSON.stringify({ counts, runs: runs.map(({ beat, jobId, status, outcome, steps, receipts }) => ({ beat, jobId, status, outcome, steps, receipts })), accounts })).digest("hex");
  return { schoolId: AL_NOOR_SCHOOL_ID, slug: AL_NOOR_DEMO_SLUG, created, accounts, counts, runs, fingerprint };
}

async function main() {
  assertDatabaseAllowed(process.env.DATABASE_URL);
  const db = new PrismaClient();
  try {
    const result = await seedAiWorkflowsDemo(db, process.env.DEMO_PASSWORD ?? "", { reset: process.argv.includes("--reset") });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
    const { prisma } = await import("../../src/lib/db/prisma");
    await prisma.$disconnect();
    const { redis } = await import("../../src/lib/queue/connection");
    redis.disconnect();
  }
}

if (process.argv[1]?.endsWith("seed-ai-workflows-demo.ts")) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

async function describe(s: Services, user: AuthUser, jobId: string) {
  const run = s.toRunView(await s.getJob(user, jobId));
  return JSON.stringify({ status: run.status, errorCode: run.errorCode, outcome: run.outcome, steps: run.steps.map(step => [step.capabilityKey, step.state, step.errorCode]), questions: run.questions.map(question => [question.promptKey, question.pointer]) });
}
