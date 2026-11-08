// ─────────────────────────────────────────────────────────────────
// QA Master Plan §1.4 — capture a real skoolee_token per persona.
//
//   node scripts/qa/capture-tokens.mjs          (dev server must be running)
//
// Logs every persona in through the REAL /api/auth/login route rather than
// minting JWTs locally, so the captured cookie is exactly what a browser gets
// and AUTH-1.1 is evidenced for all personas at the same time.
//
// Privileged roles get an MFA ticket first (SKAI-1267). Unenrolled accounts
// "Do it later" by default (QA_MFA_MODE=enrol runs setup instead); enrolled
// accounts are reported as a labelled MFA skip, not a failed login.
//
// Finally deletes T5 (t5-epsilon) so its already-captured token becomes a live
// session for a deleted school — the AUTH-1.7 / FINDING-G fixture.
// ─────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { captureSession, verdict } from "./login-capture.mjs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const fixtures = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();

const MFA_MODE = process.env.QA_MFA_MODE === "enrol" ? "enrol" : "defer";
const results = [];
let ok = 0, fail = 0, skipped = 0;

for (const [key, p] of Object.entries(fixtures.personas)) {
  let r;
  try {
    r = await captureSession({ base: BASE, email: p.email, password: fixtures.password, mode: MFA_MODE });
  } catch (e) {
    r = { status: null, loginAccepted: false, mfa: "none", mfaNote: null, token: null, error: String(e) };
  }

  const expectedLogin = p.isActive !== false;   // disabled users SHOULD fail
  const outcome = verdict(r, expectedLogin);
  if (outcome === "pass") ok++; else if (outcome === "skipped") skipped++; else fail++;

  results.push({
    persona: key, email: p.email, role: p.role, tenant: p.tenant,
    status: r.status, expectedLogin,
    loginAccepted: r.loginAccepted, mfa: r.mfa, mfaNote: r.mfaNote,
    authenticated: Boolean(r.token), outcome,
    error: r.error,
  });
  if (r.token) fixtures.personas[key].token = r.token;
}

// ── T5: delete the school AFTER its token was captured ──
const t5 = fixtures.tenants.T5;
let t5Deleted = false;
if (t5) {
  try {
    await prisma.studentClassHistory.deleteMany({ where: { schoolId: t5.schoolId } });
    await prisma.loginSession.deleteMany({ where: { schoolId: t5.schoolId } }).catch(() => {});
    // School->User has no onDelete: Cascade (INT-1) — clear it explicitly or
    // school.delete() dies on users_school_id_fkey.
    await prisma.aIUsageLog.deleteMany({ where: { schoolId: t5.schoolId } }).catch(() => {});
    await prisma.student.updateMany({ where: { schoolId: t5.schoolId }, data: { parentUserId: null, studentUserId: null } });
    await prisma.class.updateMany({ where: { schoolId: t5.schoolId }, data: { classTeacherId: null } });
    // SuperAdminAuditLog->User also lacks cascade, AND SuperAdminAuditLog is one
    // of the 5 GLOBAL models (no school_id) so it cannot be cleared by tenant.
    // It must be cleared by userId. See INT-1.
    const t5Users = await prisma.user.findMany({ where: { schoolId: t5.schoolId }, select: { id: true } });
    await prisma.superAdminAuditLog.deleteMany({
      where: { userId: { in: t5Users.map((u) => u.id) } },
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { schoolId: t5.schoolId } });
    await prisma.school.delete({ where: { id: t5.schoolId } });
    t5Deleted = true;
  } catch (e) {
    console.error("T5 delete failed:", String(e));
  }
}
fixtures.tenants.T5.deletedAfterTokenCapture = t5Deleted;
fixtures.tokenCapture = { at: new Date().toISOString(), base: BASE, pass: ok, fail, mfaSkipped: skipped, mfaMode: MFA_MODE };

writeFileSync("docs/qa/fixtures.json", JSON.stringify(fixtures, null, 2));
writeFileSync("docs/qa/evidence/AUTH-1.1-login-matrix.json", JSON.stringify(results, null, 2));

console.log(`\n  personas attempted : ${results.length}`);
console.log(`  behaved as expected: ${ok}`);
console.log(`  MFA skipped (label): ${skipped}`);
console.log(`  unexpected         : ${fail}`);
console.log(`  T5 deleted post-capture: ${t5Deleted}`);
if (fail) {
  console.log("\n  UNEXPECTED:");
  for (const r of results.filter((r) => r.outcome === "fail")) {
    console.log(`   ${r.persona.padEnd(24)} status=${r.status} expectedLogin=${r.expectedLogin} accepted=${r.loginAccepted} mfa=${r.mfa} session=${r.authenticated} err=${JSON.stringify(r.error)}`);
  }
}
await prisma.$disconnect();
