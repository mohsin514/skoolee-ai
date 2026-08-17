// ─────────────────────────────────────────────────────────────────
// QA environment seed.
//
//   node scripts/qa-seed.mjs
//
// Creates one clearly-marked test school and everything a full academic
// lifecycle needs. Every record is prefixed "QA " and every account uses an
// @example.invalid address, so QA data can never be mistaken for a real school.
//
// Idempotent: it deletes and recreates the QA school only — matched on the
// fixed slug below. It never touches any other tenant.
//
// Uses PrismaClient directly rather than src/lib/db/prisma.ts: the tenant guard
// there fails closed outside a request, which is correct for the app and wrong
// for a seed.
// ─────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-testing-school";
const PASSWORD = "QaTest#2026";
const YEAR_1 = 2025;
const YEAR_2 = 2026;

const log = (...a) => console.log(...a);

async function main() {
  log("── QA seed ──────────────────────────────────────────");

  const existing = await prisma.school.findUnique({ where: { slug: SLUG } });
  if (existing) {
    log(`Removing previous QA school ${existing.id}…`);
    // StudentClassHistory.campusId also has no cascade — deliberately: it's
    // a historical record, and promoting a student (which this QA run does)
    // is exactly what populates it. Silently cascading it on campus deletion
    // would be the wrong default for real data, so it's cleared explicitly
    // here instead, same as the login/password tables below.
    await prisma.studentClassHistory.deleteMany({ where: { schoolId: existing.id } });

    // School -> User is the one relation without a cascade, and users are
    // themselves referenced by classes, subjects and students. Dropping the
    // campus first cascades all the academic data out of the way, which frees
    // the users, which frees the school.
    await prisma.campus.deleteMany({ where: { schoolId: existing.id } });

    // LoginSession and PasswordHistory hold *required* references
    // to User, so Prisma restricts the delete rather than nulling them. These
    // accumulate as soon as the QA accounts log in, which is why a second seed
    // run fails where the first succeeded.
    const doomed = await prisma.user.findMany({
      where: { schoolId: existing.id },
      select: { id: true },
    });
    const userIds = doomed.map((u) => u.id);
    if (userIds.length) {
      await prisma.loginSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordHistory.deleteMany({ where: { userId: { in: userIds } } });
    }
    await prisma.user.deleteMany({ where: { schoolId: existing.id } });
    await prisma.school.delete({ where: { id: existing.id } });
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  const school = await prisma.school.create({
    data: {
      name: "QA Testing School",
      slug: SLUG,
      status: "ACTIVE",
      plan: "PRO",
      aiCreditsLimit: 1000,
      city: "QA City",
      address: "1 QA Street",
      regId: "QA-REG-0001",
      contactEmail: "qa+school@example.invalid",
      phone: "+920000000000",
      establishedYear: 2000,
    },
  });

  const campus = await prisma.campus.create({
    data: {
      schoolId: school.id,
      name: "QA Main Campus",
      city: "QA City",
      address: "1 QA Street",
      regId: "QA-CAMPUS-0001",
      principalName: "QA Principal",
      board: "QA Board",
    },
  });

  const mkUser = (email, fullName, role, extra = {}) =>
    prisma.user.create({
      data: {
        schoolId: school.id,
        campusId: campus.id,
        email,
        password: hash,
        fullName,
        role,
        isActive: true,
        // Real schools finish onboarding once; a QA account that hasn't
        // lands in the setup wizard instead of its dashboard on every login.
        onboardingComplete: true,
        ...extra,
      },
    });

  const admin = await mkUser("qa+admin@example.invalid", "QA Admin", "CAMPUS_ADMIN");
  const principal = await mkUser("qa+principal@example.invalid", "QA Principal", "PRINCIPAL");

  const teachers = [];
  const specialties = [
    ["Mathematics", "Computer Science"],
    ["English", "Urdu"],
    ["Science"],
  ];
  for (let i = 1; i <= 3; i++) {
    teachers.push(
      await mkUser(
        `qa+teacher0${i}@example.invalid`,
        `QA Teacher 0${i}`,
        "TEACHER",
        { subjectSpecialties: specialties[i - 1] }
      )
    );
  }

  // The three operations roles. Each has its own portal and its own permission
  // matrix, and none of them had an account to test with — so none of those
  // matrices had ever been exercised in either direction.
  const accountant = await mkUser("qa+accountant@example.invalid", "QA Accountant", "ACCOUNTANT");
  const librarian = await mkUser("qa+librarian@example.invalid", "QA Librarian", "LIBRARIAN");
  const receptionist = await mkUser("qa+receptionist@example.invalid", "QA Receptionist", "RECEPTIONIST");

  const parents = [];
  for (let i = 1; i <= 3; i++) {
    parents.push(
      await mkUser(`qa+parent0${i}@example.invalid`, `QA Parent 0${i}`, "PARENT")
    );
  }

  const studentUsers = [];
  for (let i = 1; i <= 6; i++) {
    studentUsers.push(
      await mkUser(`qa+student0${i}@example.invalid`, `QA Student 0${i}`, "STUDENT")
    );
  }

  // ── Academic structure ────────────────────────────────────────
  await prisma.academicCycle.create({
    data: {
      schoolId: school.id,
      campusId: campus.id,
      label: `QA ${YEAR_1}-${YEAR_1 + 1}`,
      academicYear: YEAR_1,
      status: "ACTIVE",
      startDate: new Date(`${YEAR_1}-04-01`),
      endDate: new Date(`${YEAR_1 + 1}-03-31`),
    },
  });

  // Sunday off, so date-sheet weekend validation has something to catch.
  await prisma.weekend.create({
    data: { schoolId: school.id, campusId: campus.id, dayOfWeek: 7 },
  });

  // Deliberately undersized rooms so the exam-capacity rule is exercised.
  const rooms = {};
  for (const [n, cap] of [["QA-A", 20], ["QA-B", 30], ["QA-C", 40], ["QA-TINY", 2]]) {
    rooms[n] = await prisma.classRoom.create({
      data: { schoolId: school.id, campusId: campus.id, roomNumber: n, capacity: cap },
    });
  }

  const periods = [];
  for (let p = 1; p <= 4; p++) {
    periods.push(
      await prisma.periodDefinition.create({
        data: {
          schoolId: school.id,
          campusId: campus.id,
          periodNumber: p,
          startTime: `0${7 + p}:00`,
          endTime: `0${7 + p}:40`,
          timeType: "CLASS",
        },
      })
    );
  }
  const examPeriods = [];
  for (let p = 1; p <= 2; p++) {
    examPeriods.push(
      await prisma.periodDefinition.create({
        data: {
          schoolId: school.id,
          campusId: campus.id,
          periodNumber: p,
          startTime: p === 1 ? "09:00" : "11:30",
          endTime: p === 1 ? "11:00" : "13:30",
          timeType: "EXAM",
        },
      })
    );
  }

  // Year 1 classes, plus the Year 2 destinations promotion needs.
  const mkClass = (name, section, year, teacherId) =>
    prisma.class.create({
      data: {
        schoolId: school.id,
        campusId: campus.id,
        name,
        section,
        academicYear: year,
        classTeacherId: teacherId,
        teachingMode: "SUBJECT",
      },
    });

  const g5a = await mkClass("QA Grade 5", "A", YEAR_1, teachers[0].id);
  const g5b = await mkClass("QA Grade 5", "B", YEAR_1, teachers[1].id);
  const g6aY2 = await mkClass("QA Grade 6", "A", YEAR_2, teachers[0].id);
  const g5aY2 = await mkClass("QA Grade 5", "A", YEAR_2, teachers[1].id);

  const SUBJECTS = [
    ["Mathematics", 100, 0],
    ["English", 100, 1],
    ["Science", 100, 2],
    ["Computer Science", 50, 0],
    ["Urdu", 75, 1],
  ];

  const subjectsByClass = {};
  for (const cls of [g5a, g5b, g6aY2, g5aY2]) {
    subjectsByClass[cls.id] = [];
    for (const [name, total, tIdx] of SUBJECTS) {
      subjectsByClass[cls.id].push(
        await prisma.subject.create({
          data: {
            schoolId: school.id,
            campusId: campus.id,
            classId: cls.id,
            name,
            totalMarks: total,
            teacherId: teachers[tIdx].id,
          },
        })
      );
    }
  }

  // ── Students ──────────────────────────────────────────────────
  // 01-04 in 5A, 05-06 in 5B, so cross-class isolation is testable.
  const students = [];
  const plan = [
    [1, g5a, 0], [2, g5a, 0], [3, g5a, 1], [4, g5a, 1], [5, g5b, 2], [6, g5b, 2],
  ];
  for (const [n, cls, parentIdx] of plan) {
    const s = await prisma.student.create({
      data: {
        schoolId: school.id,
        campusId: campus.id,
        classId: cls.id,
        studentUserId: studentUsers[n - 1].id,
        parentUserId: parents[parentIdx].id,
        admissionNo: `QA-ADM-00${n}`,
        fullName: `QA Student 0${n}`,
        rollNo: `${cls.name.includes("5") ? "QA5" : "QA6"}-${cls.section}-00${n}`,
        gender: n % 2 === 0 ? "FEMALE" : "MALE",
        dateOfBirth: new Date("2014-05-0" + ((n % 9) + 1)),
        guardianName: `QA Parent 0${parentIdx + 1}`,
        guardianPhone: `+92300000000${n}`,
        guardianEmail: `qa+parent0${parentIdx + 1}@example.invalid`,
        status: "active",
        city: "QA City",
      },
    });
    students.push(s);
  }

  // ── Grade rules ───────────────────────────────────────────────
  for (const cls of [g5a, g5b]) {
    await prisma.gradeWeightConfig.create({
      data: {
        schoolId: school.id,
        campusId: campus.id,
        classId: cls.id,
        academicYear: YEAR_1,
        quizWeight: 10,
        classTestWeight: 20,
        midTermWeight: 30,
        finalWeight: 40,
        passingPercentage: 50,
        weightMode: "NORMALIZED",
      },
    });
  }

  const summary = {
    password: PASSWORD,
    school: { id: school.id, slug: SLUG },
    campus: campus.id,
    users: {
      admin: admin.email,
      principal: principal.email,
      teachers: teachers.map((t) => ({ id: t.id, email: t.email })),
      accountant: { id: accountant.id, email: accountant.email },
      librarian: { id: librarian.id, email: librarian.email },
      receptionist: { id: receptionist.id, email: receptionist.email },
      parents: parents.map((p) => ({ id: p.id, email: p.email })),
      students: studentUsers.map((s) => ({ id: s.id, email: s.email })),
    },
    classes: {
      g5a: g5a.id, g5b: g5b.id, g6aY2: g6aY2.id, g5aY2: g5aY2.id,
    },
    subjects: Object.fromEntries(
      Object.entries(subjectsByClass).map(([k, v]) => [k, v.map((s) => ({ id: s.id, name: s.name, totalMarks: s.totalMarks }))])
    ),
    students: students.map((s) => ({ id: s.id, name: s.fullName, classId: s.classId, rollNo: s.rollNo })),
    rooms: Object.fromEntries(Object.entries(rooms).map(([k, v]) => [k, { id: v.id, capacity: v.capacity }])),
    periods: periods.map((p) => p.id),
    examPeriods: examPeriods.map((p) => p.id),
    years: { y1: YEAR_1, y2: YEAR_2 },
  };

  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/qa-env.json", JSON.stringify(summary, null, 2));

  log(`school   ${school.id}`);
  log(`campus   ${campus.id}`);
  log(`users    1 admin, 1 principal, 3 teachers, 3 parents, 6 students,`);
  log(`         1 accountant, 1 librarian, 1 receptionist`);
  log(`classes  4 (5A/5B in ${YEAR_1}; 6A/5A in ${YEAR_2})`);
  log(`subjects ${SUBJECTS.length} per class`);
  log(`rooms    QA-A(20) QA-B(30) QA-C(40) QA-TINY(2)`);
  log(`password ${PASSWORD}`);
  log(`written  /tmp/qa-env.json`);
  log("── done ─────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("QA seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
