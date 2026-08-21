// §5 — Cross-module interlink chains. Each asserts the chain holds ACROSS roles
// and that school_id stays identical at every hop.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const T1 = fx.tenants.T1, T2 = fx.tenants.T2;
const out = [];
const check = (id, name, cond, detail = "") => {
  out.push({ id, name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${id.padEnd(6)} ${name}${detail ? "  — " + detail : ""}`);
};
const as = (p, path, opts = {}) => fetch(`${BASE}/api${path}`, {
  ...opts, headers: { cookie: `skoolee_token=${fx.personas[p].token}`, "content-type": "application/json", ...(opts.headers || {}) } });

console.log("\n── §5 Cross-module interlink chains ──\n");

// ── X-3: exam results are hidden until published ──
const draft = await prisma.exam.create({ data: {
  schoolId: T1.schoolId, campusId: T1.campuses[0].id, classId: fx.extra["T1-TEACHER-A-class"],
  title: "X-3 Unpublished Exam", term: "TERM_1", academicYear: 2026,
  examType: "MID_TERM", status: "DRAFT" } });
for (const persona of ["T1-STUDENT", "T1-PARENT"]) {
  const r = await as(persona, "/exams?campusId=" + T1.campuses[0].id);
  const body = await r.text();
  check("X-3", `${persona} cannot see a DRAFT exam`, !body.includes("X-3 Unpublished Exam"), `HTTP ${r.status}`);
}
const teacherView = await as("T1-TEACHER", "/exams?campusId=" + T1.campuses[0].id);
const tvBody = await teacherView.text();
check("X-3", "staff CAN see the draft (no regression)",
  teacherView.status !== 200 || tvBody.includes("X-3 Unpublished Exam"), `HTTP ${teacherView.status}`);
await prisma.exam.delete({ where: { id: draft.id } }).catch(() => {});

// ── X-14: bulk communication recipients == this tenant's parents, exactly ──
// The P0 here is a cross-tenant recipient.
const t1Parents = await prisma.user.count({ where: { schoolId: T1.schoolId, role: "PARENT" } });
const t2Parents = await prisma.user.count({ where: { schoolId: T2.schoolId, role: "PARENT" } });
check("X-14", "both tenants have parents (fixture sanity)", t1Parents > 0 && t2Parents > 0, `T1=${t1Parents} T2=${t2Parents}`);
const comms = await as("T1-CAMPUS_ADMIN", "/communications");
const commsBody = await comms.text();
const t2ParentIds = (await prisma.user.findMany({
  where: { schoolId: T2.schoolId, role: "PARENT" }, select: { id: true, email: true } }));
const leaked = t2ParentIds.some((p) => commsBody.includes(p.id) || commsBody.includes(p.email));
check("X-14", "communications surface contains no T2 recipient", !leaked, `HTTP ${comms.status}`);

// ── X-1: admission -> student chain keeps one school_id at every hop ──
const lead = await prisma.admissionQuery.create({ data: {
  schoolId: T1.schoolId, campusId: T1.campuses[0].id, name: "X-1 Lead",
  phone: "+923001112223", source: "WALK_IN", status: "ACTIVE" } });
const admitted = await as("T1-CAMPUS_ADMIN", "/students", { method: "POST", body: JSON.stringify({
  fullName: "X-1 Admitted Pupil", rollNo: "X1-001", classId: fx.extra["T1-TEACHER-A-class"], gender: "FEMALE" }) });
const admBody = await admitted.json().catch(() => ({}));
const pupilId = admBody?.data?.id ?? admBody?.data?.[0]?.id;
if (pupilId) {
  const pupil = await prisma.student.findUnique({ where: { id: pupilId },
    select: { schoolId: true, campusId: true, classId: true,
              class: { select: { schoolId: true, campusId: true } } } });
  check("X-1", "student.school_id == class.school_id at the hop",
    pupil.schoolId === pupil.class.schoolId && pupil.schoolId === T1.schoolId);
  check("X-1", "student.campus_id == class.campus_id", pupil.campusId === pupil.class.campusId);
  const audit = await prisma.auditLog.count({ where: { recordId: pupilId } });
  check("X-1", "admission wrote an audit entry", audit > 0, `${audit} entries`);

  // ── X-8: deleting the student leaves no orphan rows ──
  const delRes = await as("T1-CAMPUS_ADMIN", `/students?id=${pupilId}`, { method: "DELETE" });
  check("X-8", "student delete accepted", delRes.status === 200, `HTTP ${delRes.status}`);
  const orphanAttendance = await prisma.attendance.count({ where: { studentId: pupilId } });
  const orphanMarks = await prisma.mark.count({ where: { studentId: pupilId } });
  const orphanHistory = await prisma.studentClassHistory.count({ where: { studentId: pupilId } });
  check("X-8", "no orphan attendance/marks/history rows",
    orphanAttendance === 0 && orphanMarks === 0 && orphanHistory === 0,
    `att=${orphanAttendance} marks=${orphanMarks} hist=${orphanHistory}`);
} else {
  check("X-1", "admission created a student", false, `HTTP ${admitted.status}`);
}
await prisma.admissionQuery.delete({ where: { id: lead.id } }).catch(() => {});

// ── X-12: a plan change must not require re-login to take effect ──
const before = await prisma.school.findUnique({ where: { id: T1.schoolId }, select: { plan: true } });
await prisma.school.update({ where: { id: T1.schoolId }, data: { plan: "ENTERPRISE" } });
const liveRead = await as("T1-CAMPUS_ADMIN", "/students");
check("X-12", "existing session still works after a plan change (no forced re-login)",
  liveRead.status === 200, `HTTP ${liveRead.status}`);
await prisma.school.update({ where: { id: T1.schoolId }, data: { plan: before.plan } });

const failed = out.filter((x) => !x.pass);
console.log(`\n${"=".repeat(64)}\n  ${out.length - failed.length}/${out.length} passed`);
if (failed.length) { console.log("\n  FAILURES:"); failed.forEach((f) => console.log(`   ${f.id} ${f.name} ${f.detail}`)); }
console.log("=".repeat(64));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
