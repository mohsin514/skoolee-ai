// §4 role packs — the negative cases that matter most, plus §10.2 view-bit
// enforcement. Seeds a real admission-query record so the PII assertions test
// data rather than an empty list (an empty list proves nothing).
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const T1 = fx.tenants.T1;
const out = [];
const check = (id, name, cond, detail = "") => {
  out.push({ id, name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${id.padEnd(9)} ${name}${detail ? "  — " + detail : ""}`);
};
const as = (p, path, opts = {}) => fetch(`${BASE}/api${path}`, {
  ...opts, headers: { cookie: `skoolee_token=${fx.personas[p].token}`, "content-type": "application/json", ...(opts.headers || {}) } });

console.log("\n── §4 Role packs ──\n");

// Real PII to detect, so an empty list cannot masquerade as a pass.
const lead = await prisma.admissionQuery.create({ data: {
  schoolId: T1.schoolId, campusId: T1.campuses[0].id,
  name: "Prospective Parent PII", phone: "+923009998887",
  email: "prospect@example.invalid", source: "WALK_IN", status: "ACTIVE",
  note: "Sensitive follow-up note" } });

for (const persona of ["T1-STUDENT", "T1-PARENT"]) {
  const r = await as(persona, "/admission-queries");
  const body = await r.text();
  check("STU-2/PAR", `${persona} cannot read the admissions pipeline`,
    r.status >= 400 || !body.includes("+923009998887"), `HTTP ${r.status}`);
}
const staff = await as("T1-RECEPTIONIST", "/admission-queries");
const staffBody = await staff.text();
check("REC-2", "RECEPTIONIST still CAN read admissions (no regression)",
  staff.status === 200 && staffBody.includes("+923009998887"), `HTTP ${staff.status}`);
await prisma.admissionQuery.delete({ where: { id: lead.id } }).catch(() => {});

// STU-2 — student is read-only across mutating endpoints.
for (const [path, method] of [["/students", "POST"], ["/students?id=x", "DELETE"], ["/exams", "POST"]]) {
  const r = await as("T1-STUDENT", path, { method, body: method === "POST" ? "{}" : undefined });
  check("STU-2", `student ${method} ${path.split("?")[0]} refused`, r.status >= 400, `HTTP ${r.status}`);
}

// TCH-5 — teacher has students.view but not edit/delete.
let r = await as("T1-TEACHER", "/students?id=" + fx.extra["T1-PARENT-A-children"][0], { method: "DELETE" });
check("TCH-5", "TEACHER cannot delete a student", r.status >= 400, `HTTP ${r.status}`);

// TCH-4 — teacher may create a class test, never a FINAL.
r = await as("T1-TEACHER", "/exams", { method: "POST", body: JSON.stringify({
  title: "Illicit Final", term: "TERM_1", academicYear: 2026,
  classId: fx.extra["T1-TEACHER-A-class"], examType: "FINAL" }) });
check("TCH-4", "TEACHER cannot create a FINAL exam", r.status >= 400, `HTTP ${r.status}`);
const strayFinal = await prisma.exam.count({ where: { title: "Illicit Final" } });
check("TCH-4", "no FINAL exam row created", strayFinal === 0);

// ACC-5 — accountant is walled off from academic marks.
r = await as("T1-ACCOUNTANT", "/marks");
check("ACC-5", "ACCOUNTANT cannot read marks", r.status >= 400, `HTTP ${r.status}`);

// REC-3 — receptionist cannot see money or payroll.
for (const p of ["/payroll", "/accounts/ledger"]) {
  r = await as("T1-RECEPTIONIST", p);
  check("REC-3", `RECEPTIONIST cannot read ${p}`, r.status >= 400, `HTTP ${r.status}`);
}

// LIB-5 — librarian confined to the library.
r = await as("T1-LIBRARIAN", "/payroll");
check("LIB-5", "LIBRARIAN cannot read payroll", r.status >= 400, `HTTP ${r.status}`);
r = await as("T1-LIBRARIAN", "/library/books");
check("LIB-5", "LIBRARIAN can still read the catalogue (no regression)", r.status === 200, `HTTP ${r.status}`);

// SUP-2 — a school admin must never mint a platform owner.
r = await as("T1-SUPER_ADMIN", "/super/users", { method: "POST", body: JSON.stringify({
  email: "owner-escalation@example.invalid", fullName: "X", role: "APP_OWNER" }) });
check("SUP-2", "SUPER_ADMIN cannot grant APP_OWNER", r.status >= 400, `HTTP ${r.status}`);
check("SUP-2", "no APP_OWNER account created",
  (await prisma.user.count({ where: { email: "owner-escalation@example.invalid" } })) === 0);

const failed = out.filter((x) => !x.pass);
console.log(`\n${"=".repeat(64)}\n  ${out.length - failed.length}/${out.length} passed`);
if (failed.length) { console.log("\n  FAILURES:"); failed.forEach((f) => console.log(`   ${f.id} ${f.name} ${f.detail}`)); }
console.log("=".repeat(64));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
