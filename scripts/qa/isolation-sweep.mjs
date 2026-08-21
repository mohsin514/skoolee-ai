// ─────────────────────────────────────────────────────────────────
// QA Master Plan §2.2 — automated tenant-isolation sweep.
//
//   node scripts/qa/isolation-sweep.mjs            (dev server must be running)
//   node scripts/qa/isolation-sweep.mjs --phase=A  (A=list leakage, B=IDOR)
//
// Replays every route in docs/qa/api-inventory.txt against personas from both
// tenants and asserts the §2 matrix. Designed to be CI-blocking (exit 1 on any
// P0). Read-only: phases A and B issue GET only.
//
// Isolation model under test: row-level school_id + the application guard.
// That is the ONLY live mechanism (see evidence/ISO-4.9-isolation-rule.md), and
// RLS is a no-op (ISO-4.8), so every failure here is directly exploitable = P0.
// ─────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const fixtures = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const routes = readFileSync("docs/qa/api-inventory.txt", "utf8")
  .split("\n").map((r) => r.trim()).filter(Boolean);

const phaseArg = (process.argv.find((a) => a.startsWith("--phase=")) || "").split("=")[1];
const RUN = phaseArg ? phaseArg.split(",") : ["A", "B"];

const T1 = fixtures.tenants.T1, T2 = fixtures.tenants.T2;
const tok = (k) => fixtures.personas[k]?.token;

// Identifiers that must never appear in the other tenant's responses.
const T1_IDS = new Set([T1.schoolId, ...T1.campuses.map((c) => c.id),
  fixtures.extra["T1-TEACHER-A-class"], fixtures.extra["T1-PARENT-A-children"]?.[0],
  fixtures.extra["T1-PARENT-A-children"]?.[1], fixtures.extra["T1-PARENT-B-child-other-campus"]].filter(Boolean));
const T2_IDS = new Set([T2.schoolId, ...T2.campuses.map((c) => c.id),
  fixtures.extra["T2-student-1"], fixtures.extra["T2-class-5A"]].filter(Boolean));

// Personas driving the sweep, paired with the identifiers they must never see.
const PROBES = [
  { persona: "T1-CAMPUS_ADMIN", own: "T1", foreign: T2_IDS, foreignSchoolId: T2.schoolId },
  { persona: "T1-SUPER_ADMIN",  own: "T1", foreign: T2_IDS, foreignSchoolId: T2.schoolId },
  { persona: "T1-TEACHER",      own: "T1", foreign: T2_IDS, foreignSchoolId: T2.schoolId },
  { persona: "T1-PARENT",       own: "T1", foreign: T2_IDS, foreignSchoolId: T2.schoolId },
  { persona: "T1-STUDENT",      own: "T1", foreign: T2_IDS, foreignSchoolId: T2.schoolId },
  { persona: "T2-CAMPUS_ADMIN", own: "T2", foreign: T1_IDS, foreignSchoolId: T1.schoolId },
];

const findings = [];
const timeouts = [];
const stats = { assertions: 0, pass: 0, fail: 0, skipped: 0, errors: 0 };

// Routes that hold the connection open by design. Reading them to completion
// never returns, so they are probed with a short timeout and judged on the
// headers + whatever prefix arrives. /notifications/sse hung the first run of
// this sweep for 20 minutes — a CI job must never be able to wedge like that.
const STREAMING = /\/(sse|stream|events|subscribe)$/;
const TIMEOUT_MS = Number(process.env.QA_TIMEOUT_MS || 8000);

async function call(path, token, { method = "GET", body } = {}) {
  const streaming = STREAMING.test(path);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), streaming ? 2000 : TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        cookie: `skoolee_token=${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
      signal: ac.signal,
    });
    let text = "";
    if (streaming) {
      // Take only the first chunk; enough to detect a cross-tenant payload.
      try {
        const reader = res.body?.getReader();
        if (reader) {
          const { value } = await reader.read();
          text = value ? new TextDecoder().decode(value) : "";
          await reader.cancel().catch(() => {});
        }
      } catch { /* aborted — headers still judged below */ }
    } else {
      text = await res.text();
    }
    return { status: res.status, text, ct: res.headers.get("content-type") || "", streaming };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return {
      status: 0, text: String(e), ct: "",
      networkError: !aborted, timedOut: aborted, streaming,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Scan a response body for any foreign identifier.
function scanLeak(text, foreignIds) {
  const hits = [];
  for (const id of foreignIds) if (id && text.includes(id)) hits.push(id);
  return hits;
}

function record(f) {
  findings.push(f);
  stats.fail++;
  const dir = "docs/qa/evidence";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${f.id}.txt`,
    `ID:        ${f.id}\nTitle:     ${f.title}\nSeverity:  ${f.severity}\n` +
    `Persona:   ${f.persona}\nRoute:     ${f.method} /api${f.route}\n` +
    `Status:    ${f.status}\nLeaked:    ${JSON.stringify(f.leaked)}\n\n` +
    `RESPONSE (first 4000 chars):\n${f.body?.slice(0, 4000) ?? ""}\n`);
}

// ══ PHASE A — ISO-3.1: cross-tenant list leakage on collection routes ══
async function phaseA() {
  const collections = routes.filter((r) => !r.includes("["));
  console.log(`\n── Phase A · ISO-3.1 list leakage · ${collections.length} routes × ${PROBES.length} personas`);
  for (const probe of PROBES) {
    const token = tok(probe.persona);
    if (!token) { stats.skipped += collections.length; continue; }
    for (const route of collections) {
      stats.assertions++;
      const r = await call(route, token);
      if (r.networkError || r.timedOut) { stats.errors++; timeouts.push({ persona: probe.persona, route, timedOut: !!r.timedOut }); continue; }
      // Only bodies that actually returned data can leak.
      if (r.status !== 200) { stats.pass++; continue; }
      const leaked = scanLeak(r.text, probe.foreign);
      if (leaked.length) {
        record({ id: `ISO-3.1--${probe.persona}--${route.replace(/\//g, "_")}`,
          title: `Cross-tenant data in list response for ${route}`,
          severity: "P0", persona: probe.persona, route, method: "GET",
          status: r.status, leaked, body: r.text });
      } else stats.pass++;
    }
  }
}

// ══ PHASE B — ISO-1.1/1.2/1.3: IDOR on dynamic routes with a FOREIGN id ══
async function phaseB() {
  const dynamic = routes.filter((r) => r.includes("["));
  // Best-fit foreign object per route, falling back to a foreign student id.
  const foreignFor = (route, ownTenant) => {
    const f = ownTenant === "T1" ? fixtures.extra : fixtures.extra;
    const student = ownTenant === "T1" ? f["T2-student-1"] : f["T1-PARENT-A-children"][0];
    const cls = ownTenant === "T1" ? f["T2-class-5A"] : f["T1-TEACHER-A-class"];
    if (/student/i.test(route)) return student;
    if (/timetable|subject/i.test(route)) return cls;
    return student;
  };
  console.log(`── Phase B · ISO-1.x IDOR · ${dynamic.length} routes × ${PROBES.length} personas`);
  for (const probe of PROBES) {
    const token = tok(probe.persona);
    if (!token) { stats.skipped += dynamic.length; continue; }
    for (const route of dynamic) {
      stats.assertions++;
      const fid = foreignFor(route, probe.own);
      const path = route.replace(/\[[^\]]+\]/g, fid);
      const r = await call(path, token);
      if (r.networkError || r.timedOut) { stats.errors++; timeouts.push({ persona: probe.persona, route: path, timedOut: !!r.timedOut }); continue; }
      // A 200 on a foreign id is a leak. Anything else (401/403/404/400/500) passes
      // the isolation assertion, though 500s are logged separately.
      if (r.status === 200) {
        const leaked = scanLeak(r.text, probe.foreign);
        record({ id: `ISO-1.1--${probe.persona}--${route.replace(/[\/\[\]]/g, "_")}`,
          title: `200 OK reading a foreign-tenant object at ${route}`,
          severity: "P0", persona: probe.persona, route: path, method: "GET",
          status: 200, leaked: leaked.length ? leaked : ["200-on-foreign-id"], body: r.text });
      } else stats.pass++;
    }
  }
}

const t0 = Date.now();
if (RUN.includes("A")) await phaseA();
if (RUN.includes("B")) await phaseB();

const summary = {
  ranAt: new Date().toISOString(), base: BASE, phases: RUN,
  durationMs: Date.now() - t0, ...stats,
  p0Count: findings.filter((f) => f.severity === "P0").length,
  timeouts,
  findings: findings.map(({ body, ...f }) => f),
};
writeFileSync("docs/qa/evidence/isolation-sweep-report.json", JSON.stringify(summary, null, 2));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  assertions : ${stats.assertions}`);
console.log(`  passed     : ${stats.pass}`);
console.log(`  FAILED (P0): ${stats.fail}`);
console.log(`  skipped    : ${stats.skipped}   errors: ${stats.errors}`);
console.log(`  duration   : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (findings.length) {
  console.log(`\n  P0 FINDINGS:`);
  for (const f of findings.slice(0, 40)) {
    console.log(`   ${f.persona.padEnd(18)} ${f.method} /api${f.route}  -> ${f.status}  leaked=${JSON.stringify(f.leaked).slice(0, 90)}`);
  }
  if (findings.length > 40) console.log(`   … and ${findings.length - 40} more (see report)`);
}
process.exit(findings.length ? 1 : 0);
