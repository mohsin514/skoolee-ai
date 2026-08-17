import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TENANT_MODELS } from "../src/lib/db/tenant-models";

/** Set once the demo school exists, then stamped onto every tenant-scoped row
 *  the seed writes. The seed predates the school_id migration and threads only
 *  campusId through its helpers, so injecting here beats touching every call. */
let DEMO_SCHOOL_ID: string | null = null;

const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
        if (DEMO_SCHOOL_ID && TENANT_MODELS.has(modelKey)) {
          const a = args as Record<string, unknown>;
          if (operation === "create" || operation === "update") {
            const data = a.data as Record<string, unknown> | undefined;
            if (data && operation === "create" && data.schoolId === undefined) {
              data.schoolId = DEMO_SCHOOL_ID;
            }
          } else if (operation === "upsert") {
            const create = a.create as Record<string, unknown> | undefined;
            if (create && create.schoolId === undefined) create.schoolId = DEMO_SCHOOL_ID;
          } else if (operation === "createMany") {
            const data = a.data as Record<string, unknown>[] | Record<string, unknown>;
            for (const row of Array.isArray(data) ? data : [data]) {
              if (row.schoolId === undefined) row.schoolId = DEMO_SCHOOL_ID;
            }
          }
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;

const ACADEMIC_YEAR = 2026;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeForPercentage(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

// Deterministic pseudo-random for stable demo data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function upsertUser(opts: {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  schoolId: string;
  campusId?: string;
}) {
  return prisma.user.upsert({
    where: { email: opts.email },
    update: {
      password: opts.password,
      role: opts.role,
      schoolId: opts.schoolId,
      campusId: opts.campusId,
      isActive: true,
      onboardingComplete: true,
    },
    create: {
      email: opts.email,
      fullName: opts.fullName,
      role: opts.role,
      password: opts.password,
      schoolId: opts.schoolId,
      campusId: opts.campusId,
      isActive: true,
      onboardingComplete: true,
    },
  });
}

// ---------------------------------------------------------------------------
// 1. School + Campus
// ---------------------------------------------------------------------------

async function seedSchool() {
  const school = await prisma.school.upsert({
    where: { contactEmail: "admin@demo.com" },
    update: {},
    create: {
      name: "Demo School",
      slug: "demo",
      city: "Lahore",
      regId: "SCH-DEMO-001",
      contactEmail: "admin@demo.com",
      plan: "PRO",
      status: "ACTIVE",
      aiCreditsLimit: 1000,
    },
  });
  console.log(`  ✓ School: ${school.name} (${school.id})`);
  DEMO_SCHOOL_ID = school.id;

  const campus = await prisma.campus.upsert({
    where: { regId: "CAM-DEMO-001" },
    update: {},
    create: {
      schoolId: school.id,
      name: "Main Campus",
      city: "Lahore",
      regId: "CAM-DEMO-001",
      board: "Lahore Board",
    },
  });
  console.log(`  ✓ Campus: ${campus.name} (${campus.id})`);

  return { school, campus };
}

// ---------------------------------------------------------------------------
// 2. Users for every role
// ---------------------------------------------------------------------------

async function seedUsers(schoolId: string, campusId: string) {
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const ownerPassword = await bcrypt.hash("Hussain?512", 10);

  const owner = await upsertUser({
    email: "mohsin@skooleeai.com",
    fullName: "Mohsin — Platform Owner",
    role: "APP_OWNER",
    password: ownerPassword,
    schoolId,
  });
  console.log(`  ✓ Owner: ${owner.email} / Hussain?512`);

  const admin = await upsertUser({
    email: "admin@demo.com",
    fullName: "Super Admin",
    role: "SUPER_ADMIN",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Super Admin: ${admin.email} / Admin@123`);

  const campusAdmin = await upsertUser({
    email: "campusadmin@demo.com",
    fullName: "Campus Admin",
    role: "CAMPUS_ADMIN",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Campus Admin: ${campusAdmin.email} / Admin@123`);

  const principal = await upsertUser({
    email: "principal@demo.com",
    fullName: "Principal",
    role: "PRINCIPAL",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Principal: ${principal.email} / Admin@123`);

  const teacher = await upsertUser({
    email: "teacher@demo.com",
    fullName: "Demo Teacher",
    role: "TEACHER",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Teacher 1: ${teacher.email} / Admin@123`);

  const teacher2 = await upsertUser({
    email: "teacher2@demo.com",
    fullName: "Second Teacher",
    role: "TEACHER",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Teacher 2: ${teacher2.email} / Admin@123`);

  const studentUser = await upsertUser({
    email: "student@demo.com",
    fullName: "Student Demo",
    role: "STUDENT",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Student user: ${studentUser.email} / Admin@123`);

  const parentUser = await upsertUser({
    email: "parent@demo.com",
    fullName: "Parent Demo",
    role: "PARENT",
    password: adminPassword,
    schoolId,
    campusId,
  });
  console.log(`  ✓ Parent user: ${parentUser.email} / Admin@123`);

  return {
    owner,
    admin,
    campusAdmin,
    principal,
    teacher,
    teacher2,
    studentUser,
    parentUser,
    adminPassword,
  };
}

// ---------------------------------------------------------------------------
// 3. Classes, Subjects, Grade config
// ---------------------------------------------------------------------------

const SUBJECT_NAMES = ["Math", "English", "Urdu", "Islamiat", "Science", "Social Studies"];

async function seedClassesAndSubjects(campusId: string, teacherId: string, teacher2Id: string) {
  const classDefs = [
    { name: "Pre-Nursery", section: "Yellow", classTeacherId: teacherId },
    { name: "Nursery", section: "A", classTeacherId: teacher2Id },
    { name: "Grade 1", section: "A", classTeacherId: teacherId },
  ];

  const classes = [];
  for (const def of classDefs) {
    const cls = await prisma.class.upsert({
      where: { id: `${campusId}-${def.name}-${def.section}-${ACADEMIC_YEAR}` },
      update: {},
      create: {
        id: `${campusId}-${def.name}-${def.section}-${ACADEMIC_YEAR}`,
        campusId,
        name: def.name,
        section: def.section,
        classTeacherId: def.classTeacherId,
        academicYear: ACADEMIC_YEAR,
        status: "ACTIVE",
      },
    });
    classes.push(cls);

    await prisma.gradeWeightConfig.upsert({
      where: { classId_academicYear: { classId: cls.id, academicYear: ACADEMIC_YEAR } },
      update: {},
      create: {
        campusId,
        classId: cls.id,
        academicYear: ACADEMIC_YEAR,
      },
    });

    // Subjects split between the two teachers
    for (let i = 0; i < SUBJECT_NAMES.length; i++) {
      const name = SUBJECT_NAMES[i];
      await prisma.subject.upsert({
        where: { id: `${cls.id}-${name}` },
        update: {},
        create: {
          id: `${cls.id}-${name}`,
          campusId,
          classId: cls.id,
          name,
          teacherId: i % 2 === 0 ? teacherId : teacher2Id,
          totalMarks: 100,
        },
      });
    }
    console.log(`  ✓ Class ${cls.name} ${cls.section}: ${SUBJECT_NAMES.length} subjects`);
  }

  return classes;
}

// ---------------------------------------------------------------------------
// 4. Students (with linked STUDENT + PARENT accounts)
// ---------------------------------------------------------------------------

async function seedStudents(campusId: string, classes: Array<{ id: string; name: string; section: string | null }>) {
  const studentDefs: Array<{
    classId: string;
    fullName: string;
    rollNo: string;
    gender: "MALE" | "FEMALE";
    guardian: string;
  }> = [];

  const pool: Record<string, Array<[string, "MALE" | "FEMALE"]>> = {
    "Pre-Nursery": [
      ["Ahmed Raza", "MALE"],
      ["Fatima Noor", "FEMALE"],
      ["Hassan Ali", "MALE"],
      ["Ayesha Khan", "FEMALE"],
      ["Bilal Ahmed", "MALE"],
    ],
    Nursery: [
      ["Zainab Fatima", "FEMALE"],
      ["Usman Tariq", "MALE"],
      ["Mariam Javed", "FEMALE"],
      ["Hamza Yousaf", "MALE"],
    ],
    "Grade 1": [
      ["Ali Haider", "MALE"],
      ["Sana Malik", "FEMALE"],
      ["Omar Farooq", "MALE"],
      ["Iqra Saleem", "FEMALE"],
    ],
  };

  for (const cls of classes) {
    const names = pool[cls.name] || [];
    names.forEach(([fullName, gender], idx) => {
      studentDefs.push({
        classId: cls.id,
        fullName,
        rollNo: `${cls.name.replace(/\s+/g, "")}-${String(idx + 1).padStart(2, "0")}`,
        gender,
        guardian: `${fullName.split(" ")[0]}'s Guardian`,
      });
    });
  }

  // Link student + parent accounts to the first student
  let linkTargetId: string | null = null;

  const students = [];
  for (let i = 0; i < studentDefs.length; i++) {
    const def = studentDefs[i];
    const campusClassRoll = `${campusId}-${def.rollNo}`;
    const existing = await prisma.student.findUnique({
      where: { id: campusClassRoll },
    });
    if (existing) {
      students.push(existing);
      if (linkTargetId === null) linkTargetId = existing.id;
      continue;
    }

    const created = await prisma.student.create({
      data: {
        id: campusClassRoll,
        campusId,
        classId: def.classId,
        fullName: def.fullName,
        rollNo: def.rollNo,
        gender: def.gender,
        guardianName: def.guardian,
        guardianPhone: "+92 300 1234567",
        guardianWhatsapp: "+92 300 1234567",
        guardianEmail: "guardian@demo.com",
        guardianRelationship: "Father",
        nationality: "Pakistan",
        admissionNo: `ADM-${String(i + 1).padStart(3, "0")}`,
        phone: "+92 321 7654321",
        city: "Lahore",
        province: "Punjab",
        enrollmentDate: new Date(ACADEMIC_YEAR, 2, 1),
        status: "active",
      },
    });
    students.push(created);

    if (linkTargetId === null) linkTargetId = created.id;
  }

  console.log(`  ✓ Students: ${students.length}`);
  return { students, linkTargetId };
}

// ---------------------------------------------------------------------------
// 5. Exams + Marks + Report Cards
// ---------------------------------------------------------------------------

async function seedExamsAndMarks(campusId: string, classes: Array<{ id: string; name: string; section: string | null }>) {
  const subjects = await prisma.subject.findMany({
    where: { campusId, classId: { in: classes.map((c) => c.id) } },
    select: { id: true, classId: true, name: true, totalMarks: true },
    orderBy: { name: "asc" },
  });
  const students = await prisma.student.findMany({ where: { campusId }, select: { id: true, classId: true } });

  let examCounter = 0;

  for (const cls of classes) {
    const classSubjects = subjects.filter((s) => s.classId === cls.id);
    const classStudents = students.filter((s) => s.classId === cls.id);
    const totalMarks = classSubjects.reduce((sum, s) => sum + s.totalMarks, 0);
    if (classStudents.length === 0 || classSubjects.length === 0) continue;

    const random = seededRandom(examCounter + 1);

    // --- Mid Term (PUBLISHED) ---
    const midExamId = `${campusId}-${cls.id}-MIDTERM-${ACADEMIC_YEAR}`;
    await prisma.exam.upsert({
      where: { id: midExamId },
      update: {},
      create: {
        id: midExamId,
        campusId,
        classId: cls.id,
        title: `Mid Term ${ACADEMIC_YEAR}`,
        term: "1st Term",
        academicYear: ACADEMIC_YEAR,
        examType: "MID_TERM",
        totalMarks,
        status: "PUBLISHED",
        isLocked: true,
        activatedAt: new Date(ACADEMIC_YEAR, 5, 1),
        marksEntryAt: new Date(ACADEMIC_YEAR, 5, 5),
        lockedAt: new Date(ACADEMIC_YEAR, 5, 10),
        reviewedAt: new Date(ACADEMIC_YEAR, 5, 12),
        publishedAt: new Date(ACADEMIC_YEAR, 5, 15),
      },
    });

    // --- Final Term (LOCKED, ready for report cards) ---
    const finalExamId = `${campusId}-${cls.id}-FINAL-${ACADEMIC_YEAR}`;
    await prisma.exam.upsert({
      where: { id: finalExamId },
      update: {},
      create: {
        id: finalExamId,
        campusId,
        classId: cls.id,
        title: `Final Term ${ACADEMIC_YEAR}`,
        term: "Final Term",
        academicYear: ACADEMIC_YEAR,
        examType: "FINAL",
        totalMarks,
        status: "LOCKED",
        isLocked: true,
        activatedAt: new Date(ACADEMIC_YEAR, 10, 1),
        marksEntryAt: new Date(ACADEMIC_YEAR, 10, 5),
        lockedAt: new Date(ACADEMIC_YEAR, 10, 10),
      },
    });

    // --- A Quiz still in MARKS_ENTRY so teachers have work to do ---
    const quizSubject = classSubjects[0];
    const quizExamId = `${campusId}-${cls.id}-QUIZ1-${ACADEMIC_YEAR}`;
    await prisma.exam.upsert({
      where: { id: quizExamId },
      update: {},
      create: {
        id: quizExamId,
        campusId,
        classId: cls.id,
        title: `Quiz 1 ${ACADEMIC_YEAR}`,
        term: "1st Term",
        academicYear: ACADEMIC_YEAR,
        examType: "QUIZ",
        subjectId: quizSubject.id,
        totalMarks: quizSubject.totalMarks,
        status: "MARKS_ENTRY",
        isLocked: false,
        activatedAt: new Date(ACADEMIC_YEAR, 2, 15),
        marksEntryAt: new Date(ACADEMIC_YEAR, 2, 16),
      },
    });

    // Marks for Mid Term (PUBLISHED) and Final (LOCKED)
    const markRows: Array<{
      campusId: string;
      examId: string;
      studentId: string;
      subjectId: string;
      marksObtained: number;
      grade: string;
    }> = [];
    for (const examId of [midExamId, finalExamId]) {
      for (const student of classStudents) {
        for (const subject of classSubjects) {
          const obtained = Math.min(
            subject.totalMarks,
            Math.max(
              35,
              Math.round((55 + random() * 40) * subject.totalMarks / 100)
            )
          );
          markRows.push({
            campusId,
            examId,
            studentId: student.id,
            subjectId: subject.id,
            marksObtained: obtained,
            grade: gradeForPercentage((obtained / subject.totalMarks) * 100),
          });
        }
      }
    }

    // Partial marks for the quiz (only some students) — teacher can finish it
    for (const student of classStudents.slice(0, Math.ceil(classStudents.length / 2))) {
      const obtained = Math.min(
        quizSubject.totalMarks,
        Math.max(30, Math.round((60 + random() * 30) * quizSubject.totalMarks / 100))
      );
      markRows.push({
        campusId,
        examId: quizExamId,
        studentId: student.id,
        subjectId: quizSubject.id,
        marksObtained: obtained,
        grade: gradeForPercentage((obtained / quizSubject.totalMarks) * 100),
      });
    }

    await prisma.mark.createMany({ data: markRows, skipDuplicates: true });

    examCounter++;
    console.log(`  ✓ Exam set for ${cls.name} ${cls.section} (${classStudents.length} students)`);
  }
}

// ---------------------------------------------------------------------------
// 6. Report Cards (from PUBLISHED mid-term marks)
// ---------------------------------------------------------------------------

async function seedReportCards(campusId: string, classes: Array<{ id: string; name: string; section: string | null }>) {
  const marks = await prisma.mark.findMany({
    where: { campusId },
    select: {
      examId: true,
      studentId: true,
      subjectId: true,
      marksObtained: true,
      exam: { select: { status: true, title: true, term: true } },
    },
  });
  const students = await prisma.student.findMany({
    where: { campusId },
    select: { id: true, classId: true },
  });

  // Group marks by published exam per class
  const publishedExams = await prisma.exam.findMany({
    where: { campusId, status: "PUBLISHED" },
    select: { id: true, classId: true },
  });

  for (const exam of publishedExams) {
    const classStudents = students.filter((s) => s.classId === exam.classId);
    const examMarks = marks.filter((m) => m.examId === exam.id);
    const subjectIds = new Set(examMarks.map((m) => m.subjectId));
    const totalMarks = subjectIds.size * 100;

    // Per student aggregates + rank
    const aggregates = classStudents
      .map((student) => {
        const studentMarks = examMarks.filter((m) => m.studentId === student.id);
        const obtained = studentMarks.reduce((sum, m) => sum + m.marksObtained, 0);
        const pct = totalMarks > 0 ? Math.round((obtained / totalMarks) * 100) : 0;
        return { student, obtained, pct, grade: gradeForPercentage(pct) };
      })
      .sort((a, b) => b.pct - a.pct);

    const reportCardRows = aggregates.map((agg) => {
      const rank = aggregates.findIndex((x) => x.pct === agg.pct) + 1;
      return {
        campusId,
        studentId: agg.student.id,
        examId: exam.id,
        totalMarks,
        obtainedMarks: agg.obtained,
        percentage: agg.pct,
        grade: agg.grade,
        rank,
        attendancePresent: 20,
        attendanceTotal: 22,
        remarksEn: "Good progress. Keep up the hard work!",
        remarksUr: "اچھی پیشرفت۔ محنت جاری رکھیں!",
        remarksApproved: true,
        status: "PUBLISHED" as const,
        isSent: false,
        deliveryStatus: "NOT_SENT" as const,
      };
    });

    await prisma.reportCard.createMany({ data: reportCardRows, skipDuplicates: true });
  }

  const count = await prisma.reportCard.count({ where: { campusId } });
  console.log(`  ✓ Report cards: ${count}`);
}

// ---------------------------------------------------------------------------
// 7. Attendance
// ---------------------------------------------------------------------------

async function seedAttendance(campusId: string) {
  const students = await prisma.student.findMany({ where: { campusId }, select: { id: true } });
  const random = seededRandom(99);

  const days: Array<[number, number, number]> = [];
  const today = new Date();
  const cursor = new Date(today);
  while (days.length < 30) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      days.push([cursor.getFullYear(), cursor.getMonth(), cursor.getDate()]);
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  days.reverse();

  const rows: Array<{ campusId: string; studentId: string; date: Date; status: "PRESENT" | "ABSENT" | "LEAVE" }> = [];
  for (const student of students) {
    for (const [y, m, day] of days) {
      const roll = random();
      const status: "PRESENT" | "ABSENT" | "LEAVE" = roll < 0.85 ? "PRESENT" : roll < 0.94 ? "ABSENT" : "LEAVE";
      rows.push({ campusId, studentId: student.id, date: new Date(y, m, day), status });
    }
  }

  const res = await prisma.attendance.createMany({ data: rows, skipDuplicates: true });
  console.log(`  ✓ Attendance records: ${res.count}`);
}

// ---------------------------------------------------------------------------
// 8. Fee structures, Invoices, Payments
// ---------------------------------------------------------------------------

async function seedFees(campusId: string) {
  const classes = await prisma.class.findMany({ where: { campusId }, select: { id: true, name: true } });
  const students = await prisma.student.findMany({ where: { campusId }, select: { id: true, classId: true } });

  for (const cls of classes) {
    await prisma.feeStructure.upsert({
      where: { classId_activeFrom: { classId: cls.id, activeFrom: new Date(ACADEMIC_YEAR, 0, 1) } },
      update: {},
      create: {
        campusId,
        classId: cls.id,
        monthlyFee: 5000,
        lateFeePercentage: 2,
        compoundLateFee: true,
        taxPercentage: 0,
        activeFrom: new Date(ACADEMIC_YEAR, 0, 1),
      },
    });
  }

  // Invoices: 3 months per student (Jul, Aug, Sep 2026)
  const months = [
    { m: 6, dueM: 7, status: "PAID" as const },
    { m: 7, dueM: 8, status: "PARTIAL" as const },
    { m: 8, dueM: 9, status: "PENDING" as const },
  ];

  let invCount = 0;
  let payCount = 0;
  for (const student of students) {
    for (const { m, dueM, status } of months) {
      invCount++;
      const invoiceNumber = `INV-${ACADEMIC_YEAR}-${String(invCount).padStart(4, "0")}`;
      const monthlyFee = 5000;
      const total = monthlyFee;
      const paid = status === "PAID" ? total : status === "PARTIAL" ? Math.floor(total / 2) : 0;
      const invoice = await prisma.invoice.upsert({
        where: { invoiceNumber },
        update: {},
        create: {
          campusId,
          studentId: student.id,
          invoiceNumber,
          invoiceDate: new Date(ACADEMIC_YEAR, m, 1),
          dueDate: new Date(ACADEMIC_YEAR, dueM, 1),
          monthlyFee,
          subtotal: monthlyFee,
          discountAmount: 0,
          lateFeeAmount: 0,
          taxAmount: 0,
          totalAmount: total,
          totalAmountPaid: paid,
          balanceDue: total - paid,
          status,
          generatedAt: new Date(ACADEMIC_YEAR, m, 1),
        },
      });
      invCount++;

      if (paid > 0) {
        payCount++;
        const referenceNumber = `REF-${ACADEMIC_YEAR}-${String(payCount).padStart(4, "0")}`;
        await prisma.payment.upsert({
          where: {
            campusId_paymentDate_referenceNumber: {
              campusId,
              paymentDate: new Date(ACADEMIC_YEAR, m, 20),
              referenceNumber,
            },
          },
          update: {},
          create: {
            campusId,
            invoiceId: invoice.id,
            studentId: student.id,
            amount: paid,
            paymentDate: new Date(ACADEMIC_YEAR, m, 20),
            paymentMethod: "CASH",
            referenceNumber,
            receiptNo: `RCP-${String(payCount).padStart(4, "0")}`,
          },
        });
      }
    }
  }

  const invCountTotal = await prisma.invoice.count({ where: { campusId } });
  const payCountTotal = await prisma.payment.count({ where: { campusId } });
  console.log(`  ✓ Invoices: ${invCountTotal}, Payments: ${payCountTotal}`);
}

// ---------------------------------------------------------------------------
// 9. Published timetable
// ---------------------------------------------------------------------------

async function seedTimetable(campusId: string) {
  const classes = await prisma.class.findMany({ where: { campusId }, select: { id: true, name: true, section: true } });
  const subjects = await prisma.subject.findMany({ where: { campusId }, select: { id: true, classId: true, name: true, teacherId: true } });

  for (const cls of classes) {
    const timetableId = `${campusId}-${cls.id}-TT-${ACADEMIC_YEAR}-ANNUAL`;
    await prisma.timetable.upsert({
      where: { classId_academicYear_term: { classId: cls.id, academicYear: ACADEMIC_YEAR, term: "ANNUAL" } },
      update: {},
      create: {
        id: timetableId,
        campusId,
        classId: cls.id,
        academicYear: ACADEMIC_YEAR,
        term: "ANNUAL",
        status: "PUBLISHED",
        publishedAt: new Date(ACADEMIC_YEAR, 2, 1),
      },
    });

    const classSubjects = subjects.filter((s) => s.classId === cls.id);
    const periods = 8;
    const startHour = 8;

    const slotRows: Array<{
      id: string;
      timetableId: string;
      dayOfWeek: number;
      periodNumber: number;
      subjectId: string | null;
      teacherId: string | null;
      roomNumber: string;
      startTime: string;
      endTime: string;
      slotType: string;
    }> = [];

    for (let day = 1; day <= 6; day++) {
      for (let period = 1; period <= periods; period++) {
        const slotId = `${timetableId}-D${day}-P${period}`;
        const subject = classSubjects[(period - 1) % Math.max(1, classSubjects.length)];

        const startMinutes = startHour * 60 + (period - 1) * 40;
        const endMinutes = startMinutes + 40;
        const fmt = (mins: number) => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        };

        slotRows.push({
          id: slotId,
          timetableId,
          dayOfWeek: day,
          periodNumber: period,
          subjectId: subject?.id || null,
          teacherId: subject?.teacherId || null,
          roomNumber: `Room ${String(cls.name.charAt(0)).toUpperCase()}${period}`,
          startTime: fmt(startMinutes),
          endTime: fmt(endMinutes),
          slotType: period === 4 ? "BREAK" : "CLASS",
        });
      }
    }

    await prisma.timetableSlot.createMany({ data: slotRows, skipDuplicates: true });
  }

  const slots = await prisma.timetableSlot.count({ where: { timetable: { campusId } } });
  console.log(`  ✓ Timetable slots: ${slots}`);
}

// ---------------------------------------------------------------------------
// 10. AI insights for demo teacher
// ---------------------------------------------------------------------------

async function seedAIInsights(schoolId: string, campusId: string, userId: string) {
  const insights = [
    {
      feature: "at_risk_students",
      action: "batch_remark",
      title: "At-risk students identified",
      summary: "2 students in Pre-Nursery Yellow are showing a downward trend in Math. Consider focused intervention.",
    },
    {
      feature: "generate_remarks",
      action: "single_remark",
      title: "Report card remarks generated",
      summary: "Generated draft remarks for 8 students in the mid-term exam. Review pending items.",
    },
  ];

  for (const ins of insights) {
    await prisma.aIInsight.upsert({
      where: { id: `${campusId}-${ins.action}-${ins.title}` },
      update: {},
      create: {
        id: `${campusId}-${ins.action}-${ins.title}`,
        schoolId,
        campusId,
        userId,
        role: "TEACHER",
        feature: ins.feature,
        action: ins.action,
        title: ins.title,
        summary: ins.summary,
        promptVersion: "v1",
        model: "gpt-4o",
        tokensUsed: 1200,
        approvalStatus: "APPROVED",
        status: "ACTIVE",
      },
    });
  }
  console.log(`  ✓ AI insights: ${insights.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding database...");

  const { school, campus } = await seedSchool();

  const users = await seedUsers(school.id, campus.id);

  const classes = await seedClassesAndSubjects(campus.id, users.teacher.id, users.teacher2.id);

  const { students, linkTargetId } = await seedStudents(campus.id, classes);

  // Link the demo STUDENT and PARENT accounts to the first student
  if (linkTargetId) {
    await prisma.student.update({
      where: { id: linkTargetId },
      data: { studentUserId: users.studentUser.id, parentUserId: users.parentUser.id },
    });
    console.log(`  ✓ Linked student/parent accounts to student ${linkTargetId}`);
  }
  void students;

  await seedExamsAndMarks(campus.id, classes);

  await seedReportCards(campus.id, classes);

  await seedAttendance(campus.id);

  await seedFees(campus.id);

  await seedTimetable(campus.id);

  await seedAIInsights(school.id, campus.id, users.teacher.id);

  console.log("\n✅ Seeding complete!");
  console.log("");
  console.log("   Login accounts (password Admin@123 unless noted):");
  console.log("   - mohsin@skooleeai.com  / Hussain?512  → App Owner console (/owner)");
  console.log("   - admin@demo.com        → Super Admin (/super)");
  console.log("   - campusadmin@demo.com  → Campus Admin (/admin)");
  console.log("   - principal@demo.com    → Principal (/principal)");
  console.log("   - teacher@demo.com      → Teacher (/teacher)");
  console.log("   - teacher2@demo.com     → Teacher 2 (/teacher)");
  console.log("   - student@demo.com      → Student (/student)");
  console.log("   - parent@demo.com       → Parent (/parent)");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
