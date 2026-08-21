// §2 Phase C — ISO-2.x cross-tenant WRITE isolation + SEC-6 mass assignment.
// These deliberately attempt to corrupt data across the tenant boundary.
// Local DB only.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const T1 = fx.tenants.T1, T2 = fx.tenants.T2;
const admin1 = fx.personas["T1-CAMPUS_ADMIN"];
const t1Class = fx.extra["T1-TEACHER-A-class"];
const t2Class = fx.extra["T2-class-5A"];
const t2Student = fx.extra["T2-student-1"];

const out = [];
const check = (id, name, cond, detail = "") => {
  out.push({ id, name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${id.padEnd(9)} ${name}${detail ? "  — " + detail : ""}`);
};
const api = (path, opts = {}) => fetch(`${BASE}/api${path}`, {
  ...opts,
  headers: { cookie: `skoolee_token=${admin1.token}`, "content-type": "application/json", ...(opts.headers || {}) },
});

console.log("\n── §2 Phase C · cross-tenant writes (T1-CAMPUS_ADMIN attacking T2) ──\n");

// ISO-2.3 — client-supplied schoolId/campusId must be ignored.
const created = await api("/students", { method: "POST", body: JSON.stringify({
  fullName: "ISO-2.3 Probe", rollNo: "ISO-23-001", classId: t1Class, gender: "MALE",
  schoolId: T2.schoolId, campusId: T2.campuses[0].id,   // hostile
}) });
const createdBody = await created.json().catch(() => ({}));
const newId = createdBody?.data?.id ?? createdBody?.data?.[0]?.id;
if (newId) {
  const row = await prisma.student.findUnique({ where: { id: newId }, select: { schoolId: true, campusId: true } });
  check("ISO-2.3", "body schoolId ignored; record lands in T1",
    row?.schoolId === T1.schoolId, `landed in ${row?.schoolId === T1.schoolId ? "T1" : row?.schoolId}`);
  check("SEC-6", "body campusId did not override caller's campus",
    row?.campusId !== T2.campuses[0].id, `campus=${row?.campusId}`);
  await prisma.student.delete({ where: { id: newId } }).catch(() => {});
} else {
  check("ISO-2.3", "create rejected outright (also acceptable)", created.status >= 400, `HTTP ${created.status}`);
}

// ISO-2.4 — foreign FK: T1 admin assigning a student to a T2 class.
const fk = await api("/students", { method: "POST", body: JSON.stringify({
  fullName: "ISO-2.4 Probe", rollNo: "ISO-24-001", classId: t2Class, gender: "MALE",
}) });
const fkBody = await fk.text();
check("ISO-2.4", "foreign classId rejected — no dangling cross-tenant FK",
  fk.status >= 400, `HTTP ${fk.status}`);
const strayCount = await prisma.student.count({ where: { rollNo: "ISO-24-001" } });
check("ISO-2.4", "no student row created from the foreign-FK attempt", strayCount === 0);

// ISO-2.1 — cross-tenant UPDATE.
const before = await prisma.student.findUnique({ where: { id: t2Student },
  select: { fullName: true, status: true, schoolId: true } });
const patch = await api("/students", { method: "PATCH", body: JSON.stringify({
  ids: [t2Student], status: "inactive" }) });
const after = await prisma.student.findUnique({ where: { id: t2Student },
  select: { fullName: true, status: true, schoolId: true } });
check("ISO-2.1", "cross-tenant PATCH refused", patch.status >= 400 || after.status === before.status, `HTTP ${patch.status}`);
check("ISO-2.1", "T2 record byte-unchanged",
  JSON.stringify(before) === JSON.stringify(after));

// ISO-2.2 — cross-tenant DELETE.
const del = await api(`/students?id=${t2Student}`, { method: "DELETE" });
const stillThere = await prisma.student.findUnique({ where: { id: t2Student }, select: { id: true } });
check("ISO-2.2", "cross-tenant DELETE refused", del.status >= 400, `HTTP ${del.status}`);
check("ISO-2.2", "T2 record still present", !!stillThere);

// ISO-1.1 — direct read of the T2 student.
const read = await api(`/students/${t2Student}`);
check("ISO-1.1", "cross-tenant GET by id refused", read.status >= 400, `HTTP ${read.status}`);

const failed = out.filter((r) => !r.pass);
console.log(`\n${"=".repeat(60)}\n  ${out.length - failed.length}/${out.length} passed`);
if (failed.length) { console.log("\n  P0 FAILURES:"); failed.forEach((f) => console.log(`   ${f.id} ${f.name} ${f.detail}`)); }
console.log("=".repeat(60));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
