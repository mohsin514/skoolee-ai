import { PrismaClient, UserRole, AttendanceStatus, InvoiceStatus } from "@prisma/client";
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

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Split into ~2000-row batches for createMany (keeps query size sane). */
function chunkRows<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += 2000) out.push(rows.slice(i, i + 2000));
  return out;
}

async function upsertUser(opts: {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  schoolId: string;
  campusId?: string;
  subjectSpecialties?: string[];
  teachesAllSubjects?: boolean;
  qualification?: string;
  specialization?: string;
  experience?: string;
  joiningDate?: Date;
  phone?: string;
}) {
  return prisma.user.upsert({
    // FINDING-D: email is unique per school now, not globally.
    where: { schoolId_email: { schoolId: opts.schoolId, email: opts.email } },
    update: {
      password: opts.password,
      role: opts.role,
      schoolId: opts.schoolId,
      campusId: opts.campusId,
      isActive: true,
      onboardingComplete: true,
      ...(opts.subjectSpecialties ? { subjectSpecialties: opts.subjectSpecialties } : {}),
      ...(opts.teachesAllSubjects !== undefined ? { teachesAllSubjects: opts.teachesAllSubjects } : {}),
      ...(opts.qualification ? { qualification: opts.qualification } : {}),
      ...(opts.specialization ? { specialization: opts.specialization } : {}),
      ...(opts.experience ? { experience: opts.experience } : {}),
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
      subjectSpecialties: opts.subjectSpecialties ?? [],
      teachesAllSubjects: opts.teachesAllSubjects ?? false,
      qualification: opts.qualification,
      specialization: opts.specialization,
      experience: opts.experience,
      joiningDate: opts.joiningDate,
      phone: opts.phone,
    },
  });
}

// ---------------------------------------------------------------------------
// Demo data pools — realistic Pakistani names, subjects, organisations
// ---------------------------------------------------------------------------

const FIRST_MALE = [
  "Ahmed", "Ali", "Usman", "Hassan", "Bilal", "Hamza", "Omar", "Ibrahim", "Zain", "Arsalan",
  "Faisal", "Imran", "Shahzaib", "Rehan", "Taha", "Abdullah", "Salman", "Moiz", "Danish", "Haris",
  "Saim", "Talha", "Umer", "Noman", "Adeel", "Waleed", "Kashif", "Junaid", "Farhan", "Aamir",
] as const;

const FIRST_FEMALE = [
  "Fatima", "Ayesha", "Sana", "Zainab", "Mariam", "Iqra", "Hira", "Aleena", "Mahnoor", "Noor",
  "Areeba", "Khadija", "Hania", "Dua", "Eman", "Aiza", "Rabia", "Saba", "Alina", "Maham",
  "Nimra", "Amna", "Hina", "Sadia", "Komal", "Rida", "Laiba", "Mehak", "Zoya", "Fiza",
] as const;

const SURNAMES = [
  "Khan", "Ahmed", "Hussain", "Malik", "Raza", "Ali", "Sheikh", "Qureshi", "Siddiqui", "Bhatti",
  "Chaudhry", "Butt", "Farooq", "Iqbal", "Shah", "Abbasi", "Gilani", "Haider", "Javed", "Mirza",
  "Nasir", "Pervaiz", "Rasheed", "Saleem", "Tariq",
] as const;

const OCCUPATIONS = [
  "Businessman", "Engineer", "Doctor", "Teacher", "Government Officer", "Lawyer",
  "Shopkeeper", "IT Professional", "Banker", "Army Officer",
] as const;

const CLASS_NAMES = [
  "Pre-Nursery", "Nursery", "KG", "Grade 1", "Grade 2", "Grade 3",
  "Grade 4", "Grade 5", "Grade 6", "Grade 7",
] as const;

/** Subject sets — younger classes keep a lighter load. */
const SUBJECTS_EARLY = ["Math", "English", "Urdu", "Islamiat", "Science", "General Knowledge"] as const;
const SUBJECTS_SENIOR = ["Math", "English", "Urdu", "Islamiat", "Science", "Social Studies", "Computer", "Art"] as const;

/** Normalise a class name into a roll-number prefix: "Grade 5" → "Grade5". */
const rollPrefix = (name: string) => name.replace(/\s+/g, "");

// ---------------------------------------------------------------------------
// 1. School + 4 Campuses
// ---------------------------------------------------------------------------

const CAMPUS_DEFS = [
  { regId: "CAM-DEMO-001", name: "Main Campus", city: "Lahore", board: "Lahore Board", students: 100 },
  { regId: "CAM-DEMO-002", name: "Garden Campus", city: "Lahore", board: "Lahore Board", students: 200 },
  { regId: "CAM-DEMO-003", name: "Model Campus", city: "Islamabad", board: "FBISE", students: 300 },
  { regId: "CAM-DEMO-004", name: "City Campus", city: "Karachi", board: "Sindh Board", students: 400 },
] as const;

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

  const campuses = [];
  for (const def of CAMPUS_DEFS) {
    const campus = await prisma.campus.upsert({
      where: { regId: def.regId },
      update: {},
      create: {
        schoolId: school.id,
        name: def.name,
        city: def.city,
        regId: def.regId,
        board: def.board,
      },
    });
    campuses.push(campus);
    console.log(`  ✓ Campus: ${campus.name} (${campus.city}, ${campus.board})`);
  }

  // Academic cycle for each campus + a standard Sat/Sun weekend
  for (const campus of campuses) {
    await prisma.academicCycle.upsert({
      where: { campusId_academicYear: { campusId: campus.id, academicYear: ACADEMIC_YEAR } },
      update: {},
      create: {
        campusId: campus.id,
        label: `Annual Cycle ${ACADEMIC_YEAR}`,
        academicYear: ACADEMIC_YEAR,
        status: "ACTIVE",
        startDate: new Date(ACADEMIC_YEAR, 3, 1),
        endDate: new Date(ACADEMIC_YEAR + 1, 2, 31),
      },
    });
    for (const day of [6, 7]) {
      await prisma.weekend.upsert({
        where: { campusId_dayOfWeek: { campusId: campus.id, dayOfWeek: day } },
        update: {},
        create: { campusId: campus.id, dayOfWeek: day },
      });
    }
  }
  console.log("  ✓ Academic cycles + weekends: 4 campuses");

  return { school, campuses };
}

// ---------------------------------------------------------------------------
// 2. Users for every role, per campus
// ---------------------------------------------------------------------------

interface TeacherSpec {
  name: string;
  specialties: string[];
  teachesAll?: boolean;
  qualification: string;
  specialization: string;
}

const TEACHER_SPECS: TeacherSpec[] = [
  { name: "Mathematics", specialties: ["MATH", "PHYSICS"], qualification: "M.Sc. Mathematics", specialization: "Algebra & Calculus" },
  { name: "English Language", specialties: ["ENGLISH"], qualification: "M.A. English", specialization: "Literature & Grammar" },
  { name: "Urdu & Islamiat", specialties: ["URDU", "ISLAMIAT"], qualification: "M.A. Urdu", specialization: "Urdu Literature" },
  { name: "General Science", specialties: ["SCIENCE"], qualification: "M.Sc. Chemistry", specialization: "Chemistry & Biology" },
  { name: "Social Studies", specialties: ["SOCIAL_STUDIES"], qualification: "M.A. History", specialization: "History & Geography" },
  { name: "Computer Science", specialties: ["COMPUTER"], qualification: "B.S. Computer Science", specialization: "Programming & ICT" },
  { name: "Primary Section", specialties: [], teachesAll: true, qualification: "B.Ed.", specialization: "Early Years Education" },
  { name: "Arts & Physical Education", specialties: ["ART", "PHYSICAL_EDUCATION"], qualification: "M.A. Fine Arts", specialization: "Arts & Sports" },
];

const SPECIALTY_INDEX: Record<string, number> = {
  MATH: 0, PHYSICS: 0,
  ENGLISH: 1,
  URDU: 2, ISLAMIAT: 2,
  SCIENCE: 3,
  SOCIAL_STUDIES: 3,
  COMPUTER: 5,
  ART: 7, PHYSICAL_EDUCATION: 7,
};

const TEACHER_FIRST = ["Mohammad", "Abdul", "Syed", "Muhammad", "Khalid", "Naveed", "Aamir", "Zeeshan", "Kamran", "Javed"] as const;

async function seedUsers(schoolId: string, campusId: string, campusIdx: number) {
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

  // Super Admin is school-wide; attach to the first campus so dashboards load.
  const admin = await upsertUser({
    email: "admin@demo.com",
    fullName: "Super Admin",
    role: "SUPER_ADMIN",
    password: adminPassword,
    schoolId,
    campusId: campusIdx === 0 ? campusId : undefined,
  });
  if (campusIdx === 0) console.log(`  ✓ Super Admin: ${admin.email} / Admin@123`);

  // ── Per-campus leadership ──
  const campusAdmin = await upsertUser({
    email: campusIdx === 0 ? "campusadmin@demo.com" : `campus${campusIdx + 1}admin@demo.com`,
    fullName: campusIdx === 0 ? "Campus Admin" : `Campus Admin — ${CAMPUS_DEFS[campusIdx].name}`,
    role: "CAMPUS_ADMIN",
    password: adminPassword,
    schoolId,
    campusId,
    qualification: "MBA",
    specialization: "School Administration",
    joiningDate: new Date(ACADEMIC_YEAR - 2, 0, 15),
    phone: "+92 300 111000" + campusIdx,
  });

  const principal = await upsertUser({
    email: campusIdx === 0 ? "principal@demo.com" : `campus${campusIdx + 1}principal@demo.com`,
    fullName: campusIdx === 0 ? "Principal" : `Principal — ${CAMPUS_DEFS[campusIdx].name}`,
    role: "PRINCIPAL",
    password: adminPassword,
    schoolId,
    campusId,
    qualification: "M.Phil. Education",
    specialization: "Academic Leadership",
    joiningDate: new Date(ACADEMIC_YEAR - 4, 6, 1),
    phone: "+92 321 22200" + campusIdx,
  });

  // ── Teachers — one per specialty (+ dedicated pairs on campus 1) ──
  const teachers: Array<{
    id: string;
    specialties: string[];
    teachesAll: boolean;
    fullName: string;
  }> = [];
  for (let i = 0; i < TEACHER_SPECS.length; i++) {
    const spec = TEACHER_SPECS[i];
    const email =
      campusIdx === 0 && i === 0 ? "teacher@demo.com"
      : campusIdx === 0 && i === 1 ? "teacher2@demo.com"
      : `campus${campusIdx + 1}-teacher${i + 1}@demo.com`;
    const fullName = `${pick(seededRandom(400 + campusIdx * 31 + i * 7), TEACHER_FIRST)} ${spec.name}`;
    const teacher = await upsertUser({
      email,
      fullName,
      role: "TEACHER",
      password: adminPassword,
      schoolId,
      campusId,
      subjectSpecialties: spec.specialties,
      teachesAllSubjects: spec.teachesAll ?? false,
      qualification: spec.qualification,
      specialization: spec.specialization,
      experience: `${2 + ((i + campusIdx) % 12)} years`,
      joiningDate: new Date(ACADEMIC_YEAR - 1 - (i % 3), (i + campusIdx) % 12, 10),
      phone: `+92 322 3330${campusIdx}${i}`,
    });
    teachers.push({ id: teacher.id, specialties: spec.specialties, teachesAll: spec.teachesAll ?? false, fullName });
  }

  // ── Remaining roles live on campus 1 (keeps the classic demo emails) ──
  if (campusIdx === 0) {
    await upsertUser({
      email: "accountant@demo.com",
      fullName: "Accountant",
      role: "ACCOUNTANT",
      password: adminPassword,
      schoolId,
      campusId,
      specialization: "Fee & Accounts Management",
      joiningDate: new Date(ACADEMIC_YEAR - 1, 2, 1),
    });
    await upsertUser({
      email: "librarian@demo.com",
      fullName: "Librarian",
      role: "LIBRARIAN",
      password: adminPassword,
      schoolId,
      campusId,
      specialization: "Library Sciences",
      joiningDate: new Date(ACADEMIC_YEAR - 1, 5, 1),
    });
    await upsertUser({
      email: "receptionist@demo.com",
      fullName: "Receptionist",
      role: "RECEPTIONIST",
      password: adminPassword,
      schoolId,
      campusId,
      specialization: "Front Desk & Admissions",
      joiningDate: new Date(ACADEMIC_YEAR - 1, 8, 1),
    });
  }

  // ── Per-campus student + parent demo accounts (linked later) ──
  const studentUser = await upsertUser({
    email: campusIdx === 0 ? "student@demo.com" : `campus${campusIdx + 1}student@demo.com`,
    fullName: "Student Demo",
    role: "STUDENT",
    password: adminPassword,
    schoolId,
    campusId,
  });
  const parentUser = await upsertUser({
    email: campusIdx === 0 ? "parent@demo.com" : `campus${campusIdx + 1}parent@demo.com`,
    fullName: "Parent Demo",
    role: "PARENT",
    password: adminPassword,
    schoolId,
    campusId,
  });

  if (campusIdx === 0) {
    console.log("  ✓ Campus admin / Principal / Teachers (8) / Accountant / Librarian / Receptionist / Student / Parent");
  } else {
    console.log(`  ✓ ${CAMPUS_DEFS[campusIdx].name}: Campus admin, Principal, 8 teachers, Student, Parent`);
  }

  return { owner, admin, campusAdmin, principal, teachers, studentUser, parentUser, adminPassword };
}

// ---------------------------------------------------------------------------
// 3. Classes, Subjects, Grade config
// ---------------------------------------------------------------------------

async function seedClassesAndSubjects(
  campusId: string,
  teachers: Array<{ id: string; specialties: string[]; teachesAll: boolean; fullName: string }>
) {
  const classes: Array<{ id: string; name: string; section: string | null }> = [];

  for (let ci = 0; ci < CLASS_NAMES.length; ci++) {
    const name = CLASS_NAMES[ci];
    const section = "A";
    const id = `${campusId}-${name}-${section}-${ACADEMIC_YEAR}`;

    // Early years run SINGLE-teacher mode (one generalist takes everything);
    // Grade 3+ runs SUBJECT mode with the specialty teachers.
    const early = ci <= 2;
    const classTeacher = early
      ? teachers.find((t) => t.teachesAll)?.id ?? teachers[0].id
      : teachers[Math.min(1, teachers.length - 1)].id;

    const cls = await prisma.class.upsert({
      where: { id },
      update: {},
      create: {
        id,
        campusId,
        name,
        section,
        classTeacherId: classTeacher,
        academicYear: ACADEMIC_YEAR,
        status: "ACTIVE",
        teachingMode: early ? "SINGLE" : "SUBJECT",
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
        passingPercentage: 50,
        weightMode: "NORMALIZED",
      },
    });

    const subjects = early ? SUBJECTS_EARLY : SUBJECTS_SENIOR;
    for (const subjectName of subjects) {
      // Map the subject to its specialty teacher; the generalist takes GK.
      const teacherIdx =
        subjectName === "General Knowledge"
          ? teachers.findIndex((t) => t.teachesAll)
          : SPECIALTY_INDEX[subjectName];
      const teacherId = (teacherIdx >= 0 ? teachers[teacherIdx] : teachers[0]).id;

      await prisma.subject.upsert({
        where: { id: `${cls.id}-${subjectName}` },
        update: {},
        create: {
          id: `${cls.id}-${subjectName}`,
          campusId,
          classId: cls.id,
          name: subjectName,
          teacherId,
          totalMarks: 100,
        },
      });
    }
  }

  const subjectCount = await prisma.subject.count({ where: { campusId } });
  console.log(`  ✓ ${CLASS_NAMES.length} classes, ${subjectCount} subjects`);
  return classes;
}

// ---------------------------------------------------------------------------
// 4. Students — deterministic names, spread evenly across the class ladder
// ---------------------------------------------------------------------------

async function seedStudents(
  campusId: string,
  campusIdx: number,
  targetCount: number,
  classes: Array<{ id: string; name: string; section: string | null }>,
  studentUser: { id: string },
  parentUser: { id: string }
) {
  const random = seededRandom(1000 + campusIdx * 777);

  const rows: Array<{
    id: string;
    campusId: string;
    classId: string;
    fullName: string;
    rollNo: string;
    gender: "MALE" | "FEMALE";
    dateOfBirth: Date;
    admissionNo: string;
    guardianName: string;
    guardianOccupation: string;
    phone: string;
    city: string;
    province: string;
    enrollmentDate: Date;
    studentUserId?: string;
    parentUserId?: string;
  }> = [];

  for (let i = 0; i < targetCount; i++) {
    const cls = classes[i % classes.length];
    const seq = Math.floor(i / classes.length) + 1;
    const rollNo = `${rollPrefix(cls.name)}-${cls.section}-${String(seq).padStart(3, "0")}`;
    const gender = random() < 0.46 ? "FEMALE" : "MALE";
    const first = gender === "MALE" ? pick(random, FIRST_MALE) : pick(random, FIRST_FEMALE);
    const surname = pick(random, SURNAMES);
    const age = 4 + classes.findIndex((c) => c.id === cls.id);

    rows.push({
      id: `${campusId}-${rollNo}`,
      campusId,
      classId: cls.id,
      fullName: `${first} ${surname}`,
      rollNo,
      gender,
      dateOfBirth: new Date(
        ACADEMIC_YEAR - age,
        Math.floor(random() * 12),
        1 + Math.floor(random() * 27)
      ),
      admissionNo: `ADM-${campusIdx + 1}-${String(i + 1).padStart(4, "0")}`,
      guardianName: `Mr. ${pick(random, FIRST_MALE)} ${surname}`,
      guardianOccupation: pick(random, OCCUPATIONS),
      phone: `+92 3${Math.floor(random() * 9)}${Math.floor(random() * 10000000).toString().padStart(7, "0")}`,
      city: CAMPUS_DEFS[campusIdx].city,
      province: CAMPUS_DEFS[campusIdx].city === "Karachi" ? "Sindh" : CAMPUS_DEFS[campusIdx].city === "Islamabad" ? "Islamabad" : "Punjab",
      enrollmentDate: new Date(ACADEMIC_YEAR, 2, 1),
    });
  }

  // First student carries the campus's demo STUDENT + PARENT logins.
  rows[0].studentUserId = studentUser.id;
  rows[0].parentUserId = parentUser.id;

  const students = [];
  for (const batch of chunkRows(rows)) {
    const res = await prisma.student.createMany({ data: batch, skipDuplicates: true });
    students.push(res.count);
  }

  const exists = await prisma.student.findMany({
    where: { campusId },
    select: { id: true, rollNo: true, classId: true },
    orderBy: { rollNo: "asc" },
  });

  // Roll numbers are per-class; find the created first student to link logins.
  const linked = await prisma.student.findUnique({ where: { id: rows[0].id } });
  if (linked && (!linked.studentUserId || !linked.parentUserId)) {
    await prisma.student.update({
      where: { id: linked.id },
      data: { studentUserId: studentUser.id, parentUserId: parentUser.id },
    });
  }

  console.log(`  ✓ Students: ${exists.length} (target ${targetCount})`);
  return { students: exists, linkTargetId: rows[0].id };
}

// ---------------------------------------------------------------------------
// 5. Exams + exam schedules + marks
// ---------------------------------------------------------------------------

async function seedExamsAndMarks(
  campusId: string,
  campusIdx: number,
  classes: Array<{ id: string; name: string; section: string | null }>,
  adminUser: { id: string }
) {
  const subjects = await prisma.subject.findMany({
    where: { campusId, classId: { in: classes.map((c) => c.id) } },
    select: { id: true, classId: true, name: true, totalMarks: true, teacherId: true },
    orderBy: { name: "asc" },
  });
  const students = await prisma.student.findMany({
    where: { campusId },
    select: { id: true, classId: true },
  });

  let examCounter = 0;

  for (const cls of classes) {
    const classSubjects = subjects.filter((s) => s.classId === cls.id);
    const classStudents = students.filter((s) => s.classId === cls.id);
    const totalMarks = classSubjects.reduce((sum, s) => sum + s.totalMarks, 0);
    if (classStudents.length === 0 || classSubjects.length === 0) continue;

    const random = seededRandom(examCounter + 1 + campusIdx * 91);

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
    const quizSubject = classSubjects.find((s) => s.name === "Math") ?? classSubjects[0];
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

    // Exam schedules (date sheet) for the two term exams
    const scheduleRows: Array<{
      campusId: string;
      examId: string;
      subjectId: string;
      date: Date;
    }> = [];
    for (const [examId, baseMonth] of [
      [midExamId, 5] as const,
      [finalExamId, 10] as const,
    ]) {
      for (let si = 0; si < classSubjects.length; si++) {
        scheduleRows.push({
          campusId,
          examId,
          subjectId: classSubjects[si].id,
          date: new Date(ACADEMIC_YEAR, baseMonth, 1 + si),
        });
      }
    }
    await prisma.examSchedule.createMany({ data: scheduleRows, skipDuplicates: true });

    // Marks for Mid Term + Final — every student, every subject
    const markRows: Array<{
      campusId: string;
      examId: string;
      studentId: string;
      subjectId: string;
      marksObtained: number;
      grade: string;
      enteredBy: string;
    }> = [];
    for (const examId of [midExamId, finalExamId]) {
      for (const student of classStudents) {
        for (const subject of classSubjects) {
          // Slightly different ability curve per student, so class
          // rankings look natural rather than flat.
          const ability = 45 + random() * 50;
          const obtained = Math.min(
            subject.totalMarks,
            Math.max(30, Math.round((ability + (random() - 0.5) * 18) * subject.totalMarks / 100))
          );
          markRows.push({
            campusId,
            examId,
            studentId: student.id,
            subjectId: subject.id,
            marksObtained: obtained,
            grade: gradeForPercentage((obtained / subject.totalMarks) * 100),
            enteredBy: subject.teacherId ?? adminUser.id,
          });
        }
      }
    }

    // Partial quiz marks — the teacher can finish the rest
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
        enteredBy: quizSubject.teacherId ?? adminUser.id,
      });
    }

    for (const batch of chunkRows(markRows)) {
      await prisma.mark.createMany({ data: batch, skipDuplicates: true });
    }

    examCounter++;
  }

  const markCount = await prisma.mark.count({ where: { campusId } });
  console.log(`  ✓ Exams + schedules + ${markCount} marks`);
}

// ---------------------------------------------------------------------------
// 6. Report Cards (from PUBLISHED mid-term marks)
// ---------------------------------------------------------------------------

const REMARKS = [
  { en: "Excellent work. A model student this term.", ur: "شاندار کارکردگی۔ اس ٹرم کا رول ماڈل طالب علم۔", min: 85 },
  { en: "Very good progress. Keep the focus through the final term.", ur: "بہت اچھی پیشرفت۔ فائنل ٹرم تک توجہ برقرار رکھیں۔", min: 70 },
  { en: "Good progress. A little more revision will do wonders.", ur: "اچھی پیشرفت۔ تھوڑی زیادہ تیاری سے بہت فرق پڑے گا۔", min: 55 },
  { en: "Satisfactory. More practice at home is recommended, especially in core subjects.", ur: "اطمینان بخش۔ گھر پر مشق بڑھانے کی سفارش کی جاتی ہے، خاص طور پر مرکزی مضامین میں۔", min: 40 },
  { en: "Needs support. Reach out to the class teacher to build a focused plan.", ur: "اضافی معاونت درکار۔ کلاس ٹیچر سے رابطہ کر کے منصوبہ بنائیں۔", min: 0 },
];

async function seedReportCards(
  campusId: string,
  classes: Array<{ id: string; name: string; section: string | null }>,
  campusIdx: number
) {
  const publishedExams = await prisma.exam.findMany({
    where: { campusId, status: "PUBLISHED" },
    select: { id: true, classId: true },
  });
  const students = await prisma.student.findMany({
    where: { campusId },
    select: { id: true, classId: true },
  });
  const marks = await prisma.mark.findMany({
    where: { campusId, examId: { in: publishedExams.map((e) => e.id) } },
    select: { examId: true, studentId: true, subjectId: true, marksObtained: true },
  });

  const random = seededRandom(2026 + campusIdx * 13);
  const rows: Array<{
    campusId: string;
    studentId: string;
    examId: string;
    totalMarks: number;
    obtainedMarks: number;
    percentage: number;
    grade: string;
    rank: number;
    attendancePresent: number;
    attendanceTotal: number;
    remarksEn: string;
    remarksUr: string;
    remarksApproved: boolean;
    status: string;
    isSent: boolean;
    deliveryStatus: string;
  }> = [];

  for (const exam of publishedExams) {
    const classStudents = students.filter((s) => s.classId === exam.classId);
    const examMarks = marks.filter((m) => m.examId === exam.id);
    const subjectIds = new Set(examMarks.map((m) => m.subjectId));
    const totalMarks = subjectIds.size * 100;

    const aggregates = classStudents
      .map((student) => {
        const studentMarks = examMarks.filter((m) => m.studentId === student.id);
        const obtained = studentMarks.reduce((sum, m) => sum + m.marksObtained, 0);
        const pct = totalMarks > 0 ? Math.round((obtained / totalMarks) * 100) : 0;
        return { student, obtained, pct, grade: gradeForPercentage(pct) };
      })
      .sort((a, b) => b.pct - a.pct);

    const attendanceTotal = 30;
    aggregates.forEach((agg, idx) => {
      const rank = aggregates.findIndex((x) => x.pct === agg.pct) + 1;
      const present = Math.min(attendanceTotal, Math.max(18, Math.round(attendanceTotal * (0.82 + agg.pct / 300))));
      const remark = REMARKS.find((r) => agg.pct >= r.min) ?? REMARKS[REMARKS.length - 1];
      rows.push({
        campusId,
        studentId: agg.student.id,
        examId: exam.id,
        totalMarks,
        obtainedMarks: agg.obtained,
        percentage: agg.pct,
        grade: agg.grade,
        rank,
        attendancePresent: present,
        attendanceTotal,
        remarksEn: remark.en,
        remarksUr: remark.ur,
        remarksApproved: true,
        status: "PUBLISHED",
        isSent: random() < 0.3,
        deliveryStatus: "NOT_SENT",
      });
    });
  }

  for (const batch of chunkRows(rows)) {
    await prisma.reportCard.createMany({ data: batch, skipDuplicates: true });
  }

  const count = await prisma.reportCard.count({ where: { campusId } });
  console.log(`  ✓ Report cards: ${count}`);
}

// ---------------------------------------------------------------------------
// 7. Student + Teacher attendance
// ---------------------------------------------------------------------------

async function seedAttendance(
  campusId: string,
  campusIdx: number,
  adminUser: { id: string },
  staffUsers: Array<{ id: string }>
) {
  const students = await prisma.student.findMany({
    where: { campusId },
    select: { id: true, classId: true },
  });
  const random = seededRandom(99 + campusIdx * 17);

  // Last 30 school days (Mon–Fri)
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

  const rows: Array<{ campusId: string; classId: string; studentId: string; date: Date; status: AttendanceStatus; markedBy: string; markedAt: Date }> = [];
  for (const student of students) {
    for (const [y, m, day] of days) {
      const roll = random();
      const status: AttendanceStatus = roll < 0.85 ? "PRESENT" : roll < 0.94 ? "ABSENT" : "LEAVE";
      rows.push({
        campusId,
        classId: student.classId,
        studentId: student.id,
        date: new Date(y, m, day),
        status,
        markedBy: adminUser.id,
        markedAt: new Date(y, m, day, 8, 0),
      });
    }
  }
  for (const batch of chunkRows(rows)) {
    await prisma.attendance.createMany({ data: batch, skipDuplicates: true });
  }

  // Staff attendance for the same trailing week (Mon–Fri)
  const staffDays = days.slice(-5);
  const staffRows: Array<{ campusId: string; userId: string; date: Date; status: AttendanceStatus; checkInTime?: string }> = [];
  for (const user of staffUsers) {
    for (const [y, m, day] of staffDays) {
      const roll = random();
      const status: AttendanceStatus = roll < 0.9 ? "PRESENT" : roll < 0.96 ? "LEAVE" : "ABSENT";
      staffRows.push({
        campusId,
        userId: user.id,
        date: new Date(y, m, day),
        status,
        checkInTime: status === "PRESENT" ? `08:${String(0 + Math.floor(random() * 25)).padStart(2, "0")}` : undefined,
      });
    }
  }
  for (const batch of chunkRows(staffRows)) {
    await prisma.teacherAttendance.createMany({ data: batch, skipDuplicates: true });
  }

  const count = await prisma.attendance.count({ where: { campusId } });
  console.log(`  ✓ Student attendance: ${count}, staff attendance: ${staffRows.length}`);
}

// ---------------------------------------------------------------------------
// 8. Fee structures, Invoices, Payments
// ---------------------------------------------------------------------------

async function seedFees(campusId: string, campusIdx: number, recordedById: string) {
  const classes = await prisma.class.findMany({
    where: { campusId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const students = await prisma.student.findMany({
    where: { campusId },
    select: { id: true, classId: true },
  });

  // Fee per class rises with the grade ladder
  const classFees = new Map(classes.map((c, i) => [c.id, 4000 + i * 300]));

  for (const cls of classes) {
    await prisma.feeStructure.upsert({
      where: { classId_activeFrom: { classId: cls.id, activeFrom: new Date(ACADEMIC_YEAR, 0, 1) } },
      update: {},
      create: {
        campusId,
        classId: cls.id,
        monthlyFee: classFees.get(cls.id) ?? 5000,
        lateFeePercentage: 2,
        compoundLateFee: true,
        taxPercentage: 0,
        activeFrom: new Date(ACADEMIC_YEAR, 0, 1),
      },
    });
  }

  // 3 months per student — Jul paid, Aug partial, Sep pending
  const months = [
    { m: 6, dueM: 7, status: "PAID" as const, paidPct: 1 },
    { m: 7, dueM: 8, status: "PARTIAL" as const, paidPct: 0.5 },
    { m: 8, dueM: 9, status: "PENDING" as const, paidPct: 0 },
  ];

  const invoiceRows: Array<{
    invoiceNumber: string;
    campusId: string;
    studentId: string;
    invoiceDate: Date;
    dueDate: Date;
    monthlyFee: number;
    subtotal: number;
    discountAmount: number;
    lateFeeAmount: number;
    taxAmount: number;
    totalAmount: number;
    totalAmountPaid: number;
    balanceDue: number;
    status: InvoiceStatus;
    generatedAt: Date;
  }> = [];
  const paymentIntents: Array<{
    invoiceNumber: string;
    campusId: string;
    studentId: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
    referenceNumber: string;
    receiptNo: string;
    recordedBy: string;
  }> = [];
  const random = seededRandom(500 + campusIdx * 29);

  let invNumber = 0;
  let payNumber = 0;
  for (const student of students) {
    const fee = classFees.get(student.classId) ?? 5000;
    for (const { m, dueM, status, paidPct } of months) {
      invNumber++;
      const total = fee;
      const paid = Math.round(total * paidPct);
      const invoiceNumber = `INV-${ACADEMIC_YEAR}-${String(invNumber + campusIdx * 100_000).padStart(5, "0")}`;
      invoiceRows.push({
        invoiceNumber,
        campusId,
        studentId: student.id,
        invoiceDate: new Date(ACADEMIC_YEAR, m, 1),
        dueDate: new Date(ACADEMIC_YEAR, dueM, 1),
        monthlyFee: fee,
        subtotal: fee,
        discountAmount: 0,
        lateFeeAmount: 0,
        taxAmount: 0,
        totalAmount: total,
        totalAmountPaid: paid,
        balanceDue: total - paid,
        status,
        generatedAt: new Date(ACADEMIC_YEAR, m, 1),
      });

      if (paid > 0) {
        payNumber++;
        paymentIntents.push({
          invoiceNumber,
          campusId,
          studentId: student.id,
          amount: paid,
          paymentDate: new Date(ACADEMIC_YEAR, m, 15 + Math.floor(random() * 10)),
          paymentMethod: random() < 0.6 ? "CASH" : "BANK_TRANSFER",
          referenceNumber: `REF-${ACADEMIC_YEAR}-${String(payNumber + campusIdx * 100_000).padStart(5, "0")}`,
          receiptNo: `RCP-${ACADEMIC_YEAR}-${String(payNumber + campusIdx * 100_000).padStart(5, "0")}`,
          recordedBy: recordedById,
        });
      }
    }
  }

  // Bulk-insert invoices, then map the created ids back into payments.
  const existingInvoiceNumbers = new Set(
    (await prisma.invoice.findMany({
      where: { invoiceNumber: { in: invoiceRows.map((r) => r.invoiceNumber) } },
      select: { invoiceNumber: true },
    })).map((r) => r.invoiceNumber)
  );
  for (const batch of chunkRows(invoiceRows.filter((r) => !existingInvoiceNumbers.has(r.invoiceNumber)))) {
    await prisma.invoice.createMany({ data: batch, skipDuplicates: true });
  }
  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: invoiceRows.map((r) => r.invoiceNumber) } },
    select: { id: true, invoiceNumber: true },
  });
  const invoiceIdByNumber = new Map(invoices.map((i) => [i.invoiceNumber, i.id]));

  const studentByInvoiceNumber = new Map(paymentIntents.map((p) => [p.invoiceNumber, p.studentId]));
  const paymentRows = paymentIntents.flatMap((p) => {
    const invoiceId = invoiceIdByNumber.get(p.invoiceNumber);
    return invoiceId
      ? [{
          campusId: p.campusId,
          studentId: studentByInvoiceNumber.get(p.invoiceNumber)!,
          invoiceId,
          amount: p.amount,
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          referenceNumber: p.referenceNumber,
          receiptNo: p.receiptNo,
          recordedBy: p.recordedBy,
        }]
      : [];
  });

  const existingRefs = new Set(
    (await prisma.payment.findMany({
      where: { referenceNumber: { in: paymentRows.map((r) => r.referenceNumber) } },
      select: { referenceNumber: true },
    })).map((r) => r.referenceNumber)
  );
  for (const batch of chunkRows(paymentRows.filter((r) => !existingRefs.has(r.referenceNumber)))) {
    await prisma.payment.createMany({ data: batch, skipDuplicates: true });
  }

  const invCount = await prisma.invoice.count({ where: { campusId } });
  const payCount = await prisma.payment.count({ where: { campusId } });
  console.log(`  ✓ Invoices: ${invCount}, Payments: ${payCount}`);
}

// ---------------------------------------------------------------------------
// 9. Published timetable per class
// ---------------------------------------------------------------------------

async function seedTimetable(campusId: string) {
  const classes = await prisma.class.findMany({ where: { campusId }, select: { id: true, name: true, section: true } });
  const subjects = await prisma.subject.findMany({
    where: { campusId },
    select: { id: true, classId: true, name: true, teacherId: true },
  });

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
          roomNumber: `Room ${rollPrefix(cls.name)}${period}`,
          startTime: fmt(startMinutes),
          endTime: fmt(endMinutes),
          slotType: period === 4 ? "BREAK" : "CLASS",
        });
      }
    }

    for (const batch of chunkRows(slotRows)) {
      await prisma.timetableSlot.createMany({ data: batch, skipDuplicates: true });
    }
  }

  const slots = await prisma.timetableSlot.count({ where: { timetable: { campusId } } });
  console.log(`  ✓ Timetable slots: ${slots}`);
}

// ---------------------------------------------------------------------------
// 10. Dummy AI insights — one set per campus
// ---------------------------------------------------------------------------

async function seedAIInsights(schoolId: string, campusId: string, campusName: string, teacherId: string, adminId: string) {
  const insights = [
    {
      id: `${campusId}-batch_remark-at-risk`,
      userId: teacherId,
      role: "TEACHER" as const,
      feature: "at_risk_students",
      action: "batch_remark",
      title: "At-risk students identified",
      summary: `3 students in ${campusName} are showing a downward trend in Math across the last two exams. Consider a focused revision plan before the final term.`,
    },
    {
      id: `${campusId}-single_remark-remarks`,
      userId: teacherId,
      role: "TEACHER" as const,
      feature: "generate_remarks",
      action: "single_remark",
      title: "Report card remarks generated",
      summary: `Drafted report card remarks for the mid-term exam in ${campusName}. Review the pending queue before publishing.`,
    },
    {
      id: `${campusId}-recommend_plan-intervention`,
      userId: teacherId,
      role: "TEACHER" as const,
      feature: "intervention_plan",
      action: "recommend_plan",
      title: "Intervention plan suggested",
      summary: `A 4-week intervention plan for weak performers in English was drafted. Assign it to the class teacher for approval.`,
    },
    {
      id: `${campusId}-draft_parent_update-attendance`,
      userId: adminId,
      role: "CAMPUS_ADMIN" as const,
      feature: "parent_communication",
      action: "draft_parent_update",
      title: "Draft parent update ready",
      summary: `Attendance below 80% this week for 12 students in ${campusName}. A WhatsApp draft is ready to send to their parents.`,
    },
  ];

  for (const ins of insights) {
    await prisma.aIInsight.upsert({
      where: { id: ins.id },
      update: {},
      create: {
        id: ins.id,
        schoolId,
        campusId,
        userId: ins.userId,
        role: ins.role,
        feature: ins.feature,
        action: ins.action,
        title: ins.title,
        summary: ins.summary,
        promptVersion: "demo-v1",
        model: "gpt-4o-mini",
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

  const { school, campuses } = await seedSchool();

  for (let ci = 0; ci < campuses.length; ci++) {
    const campus = campuses[ci];
    const campusDef = CAMPUS_DEFS[ci];
    console.log(`\n── ${campus.name} — ${campusDef.students} students ──`);

    const users = await seedUsers(school.id, campus.id, ci);

    const classes = await seedClassesAndSubjects(campus.id, users.teachers);

    await seedStudents(campus.id, ci, campusDef.students, classes, users.studentUser, users.parentUser);

    await seedExamsAndMarks(campus.id, ci, classes, users.campusAdmin);

    await seedReportCards(campus.id, classes, ci);

    const staff = [users.campusAdmin, users.principal, ...users.teachers];
    await seedAttendance(campus.id, ci, users.campusAdmin, staff);

    await seedFees(campus.id, ci, users.campusAdmin.id);

    await seedTimetable(campus.id);

    await seedAIInsights(school.id, campus.id, campus.name, users.teachers[0].id, users.campusAdmin.id);
  }

  console.log("\n✅ Seeding complete!");
  console.log("");
  console.log("   Login accounts (password Admin@123 unless noted):");
  console.log("   - mohsin@skooleeai.com      / Hussain?512  → App Owner console (/owner)");
  console.log("   - admin@demo.com            → Super Admin (/super)");
  console.log("");
  console.log("   Main Campus (/admin):");
  console.log("   - campusadmin@demo.com      → Campus Admin");
  console.log("   - principal@demo.com        → Principal");
  console.log("   - teacher@demo.com          → Teacher (Math)");
  console.log("   - teacher2@demo.com         → Teacher (English)");
  console.log("   - accountant@demo.com       → Accountant");
  console.log("   - librarian@demo.com        → Librarian");
  console.log("   - receptionist@demo.com     → Receptionist");
  console.log("   - student@demo.com          → Student   - parent@demo.com     → Parent");
  console.log("");
  console.log("   Garden Campus / Model Campus / City Campus:");
  console.log("   - campus2admin@demo.com, campus3admin@demo.com, campus4admin@demo.com");
  console.log("   - campus2principal@demo.com … campus4principal@demo.com");
  console.log("   - campus2-teacher1@demo.com … campus4-teacher8@demo.com (per campus)");
  console.log("   - Student/Parent: campus2student@demo.com … campus4student@demo.com");
  console.log("");
  console.log("   Tip: for a clean slate run `npm run db:reset` first, then `npm run db:seed`.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());