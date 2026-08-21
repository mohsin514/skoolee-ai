// ─────────────────────────────────────────────────────────────────
// QA Master Plan §1 — Test Environment & Fixture Data
//
//   node scripts/qa/seed-fixtures.mjs
//
// Builds tenants T1–T6 per §1.1, the collision fixtures of §1.2, and the
// persona matrix of §1.3. DETERMINISTIC: every id is derived by SHA-1 from a
// stable label, so re-running produces byte-identical ids and fixtures.json
// never churns. This is Wave-0 deliverable §10.8.
//
// Uses PrismaClient directly, not src/lib/db/prisma.ts: the tenant guard there
// fails closed outside a request, which is right for the app and wrong here.
//
// LOCAL ONLY. Refuses to run against a non-localhost DATABASE_URL.
// ─────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

// ── Safety gate (mirrors the work-order gate; defence in depth) ──
const RAW_URL = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(RAW_URL)) {
  console.error("ABORT — DATABASE_URL is not localhost. Refusing to seed.");
  process.exit(1);
}

const prisma = new PrismaClient();
export const PASSWORD = "QaFixture#2026";
const YEAR = 2026;

// Deterministic uuid-v4-shaped id from a label.
const mkId = (label) => {
  const h = createHash("sha1").update(`skoolee-qa::${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const MODULES = ["students","fees","payroll","leave","attendance","timetable","exams",
  "reports","staff","admissions","accounts","ai","library","front-desk","transport",
  "inventory","dormitory"];

const ROLES = ["APP_OWNER","SUPER_ADMIN","CAMPUS_ADMIN","ADMIN","PRINCIPAL","TEACHER",
  "PARENT","STUDENT","ACCOUNTANT","LIBRARIAN","RECEPTIONIST"];

const SLUGS = ["t1-alpha","t2-beta","t3-gamma","t4-delta","t5-epsilon","t6-zeta"];
const log = (...a) => console.log(...a);

// ── Teardown: only our six fixture tenants, matched on fixed slugs ──
async function teardown() {
  const schools = await prisma.school.findMany({ where: { slug: { in: SLUGS } } });
  for (const s of schools) {
    // Tables whose FKs are not ON DELETE CASCADE must be cleared explicitly.
    await prisma.studentClassHistory.deleteMany({ where: { schoolId: s.id } });
    await prisma.loginSession.deleteMany({ where: { schoolId: s.id } }).catch(() => {});
    await prisma.passwordReset.deleteMany({
      where: { user: { schoolId: s.id } },
    }).catch(() => {});
    await prisma.student.updateMany({ where: { schoolId: s.id }, data: { parentUserId: null, studentUserId: null } });
    await prisma.class.updateMany({ where: { schoolId: s.id }, data: { classTeacherId: null } });
    // School->User and School->AIUsageLog are the ONLY two of 89 school-child
    // relations without onDelete: Cascade, so school.delete() fails on the FK
    // unless they are cleared first. See INT-1 finding.
    await prisma.aIUsageLog.deleteMany({ where: { schoolId: s.id } }).catch(() => {});
    // SuperAdminAuditLog->User also lacks cascade, and SuperAdminAuditLog is a
    // GLOBAL model (no school_id), so it must be cleared by userId. See INT-1.
    const us = await prisma.user.findMany({ where: { schoolId: s.id }, select: { id: true } });
    await prisma.superAdminAuditLog.deleteMany({
      where: { userId: { in: us.map((u) => u.id) } },
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { schoolId: s.id } });
    await prisma.school.delete({ where: { id: s.id } });
    log(`  removed previous ${s.slug}`);
  }
}

// ── Builders ──
async function mkSchool({ tag, name, slug, status = "ACTIVE", plan = "PRO" }) {
  return prisma.school.create({
    data: {
      id: mkId(`school:${tag}`),
      name, slug, status, plan,
      city: "QA City",
      address: `1 ${name} Road`,
      regId: `QA-${tag}-SCHOOL`,
      contactEmail: `${slug}@example.invalid`,
      phone: "+920000000000",
      establishedYear: 2000,
      aiCreditsLimit: 1000,
    },
  });
}

async function mkCampus({ tag, schoolId, name }) {
  return prisma.campus.create({
    data: {
      id: mkId(`campus:${tag}`),
      schoolId, name,
      city: "QA City",
      address: `1 ${name} Road`,
      regId: `QA-${tag}-CAMPUS`,
      principalName: `${name} Principal`,
      board: "QA Board",
    },
  });
}

async function mkUser({ tag, schoolId, campusId, email, fullName, role, isActive = true, hash }) {
  return prisma.user.create({
    data: {
      id: mkId(`user:${tag}`),
      schoolId, campusId, email, fullName, role, isActive,
      password: hash,
      onboardingComplete: true,
    },
  });
}

async function main() {
  log("── QA fixture seed (§1) ─────────────────────────────");
  log(`target: ${RAW_URL.replace(/:\/\/[^@]*@/, "://***:***@")}`);
  await teardown();

  const hash = await bcrypt.hashSync(PASSWORD, 10);
  const out = { generatedAt: new Date().toISOString(), password: PASSWORD, tenants: {}, personas: {}, collisions: {}, notes: [] };

  // ══ T1 — Alpha School Group (multi-campus, primary) ══
  const t1 = await mkSchool({ tag: "T1", name: "Alpha School Group", slug: "t1-alpha" });
  const t1n = await mkCampus({ tag: "T1-NORTH", schoolId: t1.id, name: "Alpha-North" });
  const t1s = await mkCampus({ tag: "T1-SOUTH", schoolId: t1.id, name: "Alpha-South" });
  // §1.2 — a campus whose NAME collides with one in T2.
  const t1c = await mkCampus({ tag: "T1-CENTRAL", schoolId: t1.id, name: "Central Campus" });

  // ══ T2 — Beta Academy (isolation counterparty) ══
  const t2 = await mkSchool({ tag: "T2", name: "Beta Academy", slug: "t2-beta" });
  const t2m = await mkCampus({ tag: "T2-MAIN", schoolId: t2.id, name: "Beta-Main" });
  const t2c = await mkCampus({ tag: "T2-CENTRAL", schoolId: t2.id, name: "Central Campus" });

  // ══ T3 — Gamma standalone (also hosts the null-permission persona) ══
  const t3 = await mkSchool({ tag: "T3", name: "Gamma Standalone", slug: "t3-gamma" });
  const t3m = await mkCampus({ tag: "T3-MAIN", schoolId: t3.id, name: "Gamma-Main" });

  // ══ T4 — Delta SUSPENDED (licence enforcement) ══
  const t4 = await mkSchool({ tag: "T4", name: "Delta Suspended", slug: "t4-delta", status: "SUSPENDED", plan: "BASIC" });
  const t4m = await mkCampus({ tag: "T4-MAIN", schoolId: t4.id, name: "Delta-Main" });

  // ══ T5 — Epsilon: deleted AFTER tokens are captured (see capture-tokens.mjs) ══
  const t5 = await mkSchool({ tag: "T5", name: "Epsilon Doomed", slug: "t5-epsilon" });
  const t5m = await mkCampus({ tag: "T5-MAIN", schoolId: t5.id, name: "Epsilon-Main" });

  // ══ T6 — Zeta EMPTY (onboarded, zero data) ══
  const t6 = await mkSchool({ tag: "T6", name: "Zeta Empty", slug: "t6-zeta" });
  const t6m = await mkCampus({ tag: "T6-MAIN", schoolId: t6.id, name: "Zeta-Main" });

  for (const [k, s, campuses] of [
    ["T1", t1, [t1n, t1s, t1c]], ["T2", t2, [t2m, t2c]], ["T3", t3, [t3m]],
    ["T4", t4, [t4m]], ["T5", t5, [t5m]], ["T6", t6, [t6m]],
  ]) {
    out.tenants[k] = { schoolId: s.id, name: s.name, slug: s.slug, status: s.status,
      campuses: campuses.map((c) => ({ id: c.id, name: c.name })) };
  }

  // ── §1.3 persona matrix: all 11 roles in T1 and T2 ──
  const persona = async (tenantKey, tag, role, campusId, schoolId, extra = {}) => {
    const key = `${tenantKey}-${tag}`;
    const email = `${key.toLowerCase()}@example.invalid`;
    const u = await mkUser({ tag: key, schoolId, campusId, email,
      fullName: `${tenantKey} ${tag}`, role, hash, ...extra });
    out.personas[key] = { userId: u.id, email, role, schoolId, campusId,
      isActive: u.isActive, tenant: tenantKey };
    return u;
  };

  const t1Users = {}, t2Users = {};
  for (const role of ROLES) {
    t1Users[role] = await persona("T1", role, role, t1n.id, t1.id);
    t2Users[role] = await persona("T2", role, role, t2m.id, t2.id);
  }

  // Extra T1 personas required by §1.3
  const t1TeacherA = t1Users.TEACHER;                                    // Grade 5-A only
  const t1TeacherB = await persona("T1", "TEACHER-B", "TEACHER", t1n.id, t1.id); // Grade 6-B only
  const t1ParentA  = t1Users.PARENT;                                     // 2 children
  const t1ParentB  = await persona("T1", "PARENT-B", "PARENT", t1s.id, t1.id);   // 1 child, other campus
  await persona("T1", "TEACHER-DISABLED", "TEACHER", t1n.id, t1.id, { isActive: false });
  await persona("T2", "TEACHER-DISABLED", "TEACHER", t2m.id, t2.id, { isActive: false });

  // T3 hosts the null-permission persona — see notes below.
  const t3Admin = await persona("T3", "CAMPUS_ADMIN", "CAMPUS_ADMIN", t3m.id, t3.id);
  await persona("T3", "SUPER_ADMIN", "SUPER_ADMIN", t3m.id, t3.id);
  await persona("T4", "SUPER_ADMIN", "SUPER_ADMIN", t4m.id, t4.id);
  await persona("T4", "TEACHER", "TEACHER", t4m.id, t4.id);
  await persona("T5", "SUPER_ADMIN", "SUPER_ADMIN", t5m.id, t5.id);
  await persona("T6", "SUPER_ADMIN", "SUPER_ADMIN", t6m.id, t6.id);

  // Revoke every module for CAMPUS_ADMIN in T3 -> T3-CAMPUS_ADMIN is the
  // "all permissions revoked" persona (§1.3 T1-ADMIN-NULL equivalent).
  for (const module of MODULES) {
    await prisma.rolePermission.create({
      data: { id: mkId(`perm:T3:CAMPUS_ADMIN:${module}`), schoolId: t3.id,
        role: "CAMPUS_ADMIN", module,
        canView: false, canAdd: false, canEdit: false, canDelete: false },
    });
  }
  out.personas["T3-CAMPUS_ADMIN"].allPermissionsRevoked = true;

  // ── §1.3 invite fixtures ──
  const inviteLive = await prisma.staffInvitation.create({
    data: { id: mkId("invite:T1:live"), schoolId: t1.id, campusId: t1n.id,
      email: "t1-invitee-live@example.invalid", role: "TEACHER",
      token: "qa-invite-live-t1", status: "pending",
      expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  const inviteExpired = await prisma.staffInvitation.create({
    data: { id: mkId("invite:T1:expired"), schoolId: t1.id, campusId: t1n.id,
      email: "t1-invitee-expired@example.invalid", role: "TEACHER",
      token: "qa-invite-expired-t1", status: "pending",
      expiresAt: new Date(Date.now() - 864e5) },
  });
  const inviteT2 = await prisma.staffInvitation.create({
    data: { id: mkId("invite:T2:live"), schoolId: t2.id, campusId: t2m.id,
      email: "t2-invitee-live@example.invalid", role: "TEACHER",
      token: "qa-invite-live-t2", status: "pending",
      expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  out.invites = {
    "T1-INVITE-LIVE": { token: inviteLive.token, email: inviteLive.email, schoolId: t1.id },
    "T1-INVITE-EXPIRED": { token: inviteExpired.token, email: inviteExpired.email, schoolId: t1.id },
    "T2-INVITE-LIVE": { token: inviteT2.token, email: inviteT2.email, schoolId: t2.id },
  };

  // ── §1.2 COLLISION FIXTURES: identical-looking records in T1 and T2 ──
  const mkAcademics = async (tagPrefix, school, campus, teacherId, parentA, parentB) => {
    const cls5a = await prisma.class.create({
      data: { id: mkId(`class:${tagPrefix}:5A`), schoolId: school.id, campusId: campus.id,
        name: "Grade 5", section: "A", academicYear: YEAR,
        classTeacherId: teacherId, teachingMode: "SUBJECT" },
    });
    const cls6b = await prisma.class.create({
      data: { id: mkId(`class:${tagPrefix}:6B`), schoolId: school.id, campusId: campus.id,
        name: "Grade 6", section: "B", academicYear: YEAR, teachingMode: "SUBJECT" },
    });
    const maths = await prisma.subject.create({
      data: { id: mkId(`subject:${tagPrefix}:maths`), schoolId: school.id, campusId: campus.id,
        classId: cls5a.id, name: "Mathematics", totalMarks: 100, teacherId },
    });
    const exam = await prisma.exam.create({
      data: { id: mkId(`exam:${tagPrefix}:mid`), schoolId: school.id, campusId: campus.id,
        classId: cls5a.id, title: "Mid Term 2026", term: "TERM_1",
        academicYear: YEAR, examType: "MID_TERM" },
    });
    const book = await prisma.book.create({
      data: { id: mkId(`book:${tagPrefix}:isbn`), schoolId: school.id, campusId: campus.id,
        title: "Introduction to Algorithms", author: "CLRS",
        isbn: "978-0-262-03384-8", copiesTotal: 3, copiesAvailable: 3 },
    });
    // IDENTICAL name + roll number across tenants. rollNo is @@unique([campusId, rollNo]),
    // so this collision is representable — it is the sharpest leak detector we have.
    const stu1 = await prisma.student.create({
      data: { id: mkId(`student:${tagPrefix}:1`), schoolId: school.id, campusId: campus.id,
        classId: cls5a.id, parentUserId: parentA,
        admissionNo: `${tagPrefix}-ADM-001`,   // global unique -> cannot collide. See INT-2 finding.
        fullName: "Ayesha Khan", rollNo: "R-001", gender: "FEMALE",
        dateOfBirth: new Date("2014-03-11"), guardianName: "Guardian A",
        guardianPhone: "+923000000001", status: "active", city: "QA City" },
    });
    const stu2 = await prisma.student.create({
      data: { id: mkId(`student:${tagPrefix}:2`), schoolId: school.id, campusId: campus.id,
        classId: cls6b.id, parentUserId: parentA,
        admissionNo: `${tagPrefix}-ADM-002`,
        fullName: "Bilal Ahmed", rollNo: "R-002", gender: "MALE",
        dateOfBirth: new Date("2013-07-22"), guardianName: "Guardian A",
        guardianPhone: "+923000000002", status: "active", city: "QA City" },
    });
    return { cls5a, cls6b, maths, exam, book, stu1, stu2 };
  };

  const a1 = await mkAcademics("T1", t1, t1n, t1TeacherA.id, t1ParentA.id, t1ParentB.id);
  const a2 = await mkAcademics("T2", t2, t2m, t2Users.TEACHER.id, t2Users.PARENT.id, null);

  // T1-TEACHER-B owns Grade 6-B only (TCH-1 needs a same-tenant negative case).
  await prisma.class.update({ where: { id: a1.cls6b.id }, data: { classTeacherId: t1TeacherB.id } });

  // T1-PARENT-B: one child on the OTHER campus (ISO-6.4).
  const t1SouthClass = await prisma.class.create({
    data: { id: mkId("class:T1:south5A"), schoolId: t1.id, campusId: t1s.id,
      name: "Grade 5", section: "A", academicYear: YEAR, teachingMode: "SINGLE" },
  });
  const stuSouth = await prisma.student.create({
    data: { id: mkId("student:T1:south"), schoolId: t1.id, campusId: t1s.id,
      classId: t1SouthClass.id, parentUserId: t1ParentB.id,
      admissionNo: "T1-ADM-S01", fullName: "Sana Iqbal", rollNo: "R-001",
      gender: "FEMALE", dateOfBirth: new Date("2014-01-05"),
      guardianName: "Guardian B", guardianPhone: "+923000000003",
      status: "active", city: "QA City" },
  });

  out.collisions = {
    student: { field: "fullName + rollNo", value: "Ayesha Khan / R-001",
      T1: a1.stu1.id, T2: a2.stu1.id, collides: true },
    class: { field: "name + section + academicYear", value: `Grade 5-A / ${YEAR}`,
      T1: a1.cls5a.id, T2: a2.cls5a.id, collides: true },
    subject: { field: "name", value: "Mathematics", T1: a1.maths.id, T2: a2.maths.id, collides: true },
    exam: { field: "title", value: "Mid Term 2026", T1: a1.exam.id, T2: a2.exam.id, collides: true },
    book: { field: "isbn", value: "978-0-262-03384-8", T1: a1.book.id, T2: a2.book.id, collides: true },
    campus: { field: "name", value: "Central Campus", T1: t1c.id, T2: t2c.id, collides: true },
    admissionNo: { field: "admissionNo", collides: false,
      reason: "Student.admissionNo is a GLOBAL @unique — a cross-tenant collision is unrepresentable. See INT-2." },
    invoiceNumber: { field: "invoiceNumber", collides: false,
      reason: "Invoice.invoiceNumber is a GLOBAL @unique — same. See INT-2." },
    userEmail: { field: "email", collides: false,
      reason: "User.email is a GLOBAL @unique — the same person cannot exist in two tenants. See FINDING-D / EDGE-1.7." },
  };
  out.extra = {
    "T1-TEACHER-A-class": a1.cls5a.id, "T1-TEACHER-B-class": a1.cls6b.id,
    "T1-PARENT-A-children": [a1.stu1.id, a1.stu2.id],
    "T1-PARENT-B-child-other-campus": stuSouth.id,
    "T2-student-1": a2.stu1.id, "T2-class-5A": a2.cls5a.id,
  };
  out.notes = [
    "Permissions are keyed (schoolId, role, module) — there is no per-USER override. §1.3's T1-ADMIN-NULL was therefore placed in T3 as T3-CAMPUS_ADMIN; revoking in T1 would have nulled every CAMPUS_ADMIN in the primary tenant.",
    "T5 (t5-epsilon) is deleted by scripts/qa/capture-tokens.mjs AFTER its token is captured, producing a live session for a deleted school (AUTH-1.7 / FINDING-G).",
    "T6 (t6-zeta) intentionally has a campus and one SUPER_ADMIN and no academic data — the empty-state fixture for §6.3.",
  ];

  const counts = {
    schools: await prisma.school.count({ where: { slug: { in: SLUGS } } }),
    users: Object.keys(out.personas).length,
    students: await prisma.student.count({ where: { schoolId: { in: [t1.id, t2.id] } } }),
  };
  log(`\n  schools: ${counts.schools}  personas: ${counts.users}  students(T1+T2): ${counts.students}`);
  return out;
}

main()
  .then(async (out) => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync("docs/qa/fixtures.json", JSON.stringify(out, null, 2));
    log("  wrote docs/qa/fixtures.json");
    log("── seed complete ────────────────────────────────────");
  })
  .catch((e) => { console.error("SEED FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
