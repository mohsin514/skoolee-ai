/**
 * SKAI-1249: richer synthetic academics for a QA school (default qa-alpha) so blocked
 * live-QA flows can run: classes, students (linked to the QA guardian/student accounts),
 * subjects + syllabus topics (curriculum), a published and a draft exam with schedules and
 * marks, a published weekly timetable, and a draft payroll run for last month.
 *
 * Idempotent: every record is looked up by its natural key first, so re-running is safe.
 * Requires the base QA seed (pnpm run qa:seed) to have created the school and accounts.
 * Same fail-closed environment guard as the base seed; never creates credentials.
 *
 * Run:  pnpm run qa:seed:academics                  (qa-alpha)
 *       pnpm run qa:seed:academics -- --school=qa-beta
 */
import { PrismaClient } from "@prisma/client";
import { assertSeedAllowed } from "./seed-env-guard";
import {
  ACADEMIC_CLASSES, ACADEMIC_EXAMS, ACADEMIC_SUBJECTS, PERIODS, SCHOOL_DAYS, STAFF_SALARIES,
  markFor, previousMonth, studentsFor, subjectIndexFor,
} from "./academics-seed-plan";

const prisma = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  const decision = assertSeedAllowed();
  const slug = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "qa-alpha";
  if (!slug.startsWith("qa-")) throw new Error(`[qa-academics] refusing: "${slug}" is not a synthetic QA school`);
  console.log(`🧪 QA academics seed for ${slug} (${decision.name} @ ${decision.host})`);

  const school = await prisma.school.findUnique({ where: { slug }, include: { campuses: { orderBy: [{ createdAt: "asc" }, { regId: "asc" }] } } });
  if (!school || school.campuses.length === 0) throw new Error(`[qa-academics] ${slug} is missing; run pnpm run qa:seed first`);
  const schoolId = school.id;
  // Default to the school's original (main) campus: ordering by regId picked QA-created
  // campuses such as "BR-…" ahead of "QA-A-C1", so the data landed where admins never look.
  const campusArg = process.argv.find((a) => a.startsWith("--campus="))?.split("=")[1];
  const campus = campusArg ? school.campuses.find((c) => c.regId === campusArg) : school.campuses[0];
  if (!campus) throw new Error(`[qa-academics] campus "${campusArg}" not found in ${slug}`);
  const campusId = campus.id;
  console.log(`   campus: ${campus.name} (${campus.regId})`);
  const userByKey = async (key: string) =>
    prisma.user.findUnique({ where: { schoolId_email: { schoolId, email: `${key}@${slug}.qa.local` } } });
  const teacher = await userByKey("teacher");
  const guardian = await userByKey("guardian");
  const studentUser = await userByKey("student");
  const year = new Date().getUTCFullYear();

  // Periods (class + exam time types).
  for (const timeType of ["CLASS", "EXAM"]) {
    for (const p of PERIODS) {
      await prisma.periodDefinition.upsert({
        where: { campusId_timeType_periodNumber: { campusId, timeType, periodNumber: p.periodNumber } },
        update: { startTime: p.startTime, endTime: p.endTime },
        create: { schoolId, campusId, timeType, ...p },
      });
    }
  }
  const examPeriod = await prisma.periodDefinition.findUnique({
    where: { campusId_timeType_periodNumber: { campusId, timeType: "EXAM", periodNumber: 1 } },
  });

  let studentCount = 0;
  for (const [ci, c] of ACADEMIC_CLASSES.entries()) {
    const cls = (await prisma.class.findFirst({ where: { schoolId, campusId, name: c.name, section: c.section, academicYear: year } }))
      ?? await prisma.class.create({ data: { schoolId, campusId, name: c.name, section: c.section, academicYear: year, capacity: c.capacity, classTeacherId: teacher?.id } });

    const subjects = [];
    for (const s of ACADEMIC_SUBJECTS) {
      const subject = (await prisma.subject.findFirst({ where: { schoolId, classId: cls.id, code: s.code } }))
        ?? await prisma.subject.create({ data: { schoolId, campusId, classId: cls.id, name: s.name, code: s.code, teacherId: teacher?.id } });
      for (const [order, title] of s.topics.entries()) {
        const exists = await prisma.syllabusTopic.findFirst({ where: { schoolId, subjectId: subject.id, title } });
        if (!exists) await prisma.syllabusTopic.create({ data: { schoolId, subjectId: subject.id, title, order, status: order === 0 ? "COMPLETED" : "NOT_STARTED", completedAt: order === 0 ? new Date() : null } });
      }
      subjects.push(subject);
    }

    const students = [];
    for (const [si, st] of studentsFor(ci).entries()) {
      // The first student of the first class is the QA student/guardian accounts' child.
      // studentUserId is unique, so only link it when no other student row already holds it.
      const linked = ci === 0 && si === 0 && !!studentUser
        && !(await prisma.student.findFirst({ where: { schoolId, studentUserId: studentUser.id } }));
      // An earlier run may have used another campus; enrollment placement cannot be moved by a
      // seed (DB trigger), so this campus gets its own campus-suffixed admission numbers.
      const prior = await prisma.student.findFirst({ where: { schoolId, admissionNo: st.admissionNo } });
      const admissionNo = prior && prior.campusId !== campusId ? `${st.admissionNo}-${campus.regId}` : st.admissionNo;
      const existing = admissionNo === st.admissionNo ? prior
        : await prisma.student.findFirst({ where: { schoolId, admissionNo } });
      students.push(existing ?? await prisma.student.create({ data: {
        schoolId, campusId, classId: cls.id, ...st, admissionNo, guardianName: "QA Guardian",
        parentUserId: si < 2 && ci === 0 ? guardian?.id : undefined,
        studentUserId: linked ? studentUser?.id : undefined,
      } }));
    }
    studentCount += students.length;

    const timetable = await prisma.timetable.upsert({
      where: { classId_academicYear_term: { classId: cls.id, academicYear: year, term: "ANNUAL" } },
      update: {},
      create: { schoolId, campusId, classId: cls.id, academicYear: year, status: "PUBLISHED", publishedAt: new Date() },
    });
    for (const day of SCHOOL_DAYS) {
      for (const p of PERIODS) {
        const subject = subjects[subjectIndexFor(day, p.periodNumber)];
        await prisma.timetableSlot.upsert({
          where: { timetableId_dayOfWeek_periodNumber: { timetableId: timetable.id, dayOfWeek: day, periodNumber: p.periodNumber } },
          update: {},
          create: { schoolId, timetableId: timetable.id, dayOfWeek: day, periodNumber: p.periodNumber, subjectId: subject.id, teacherId: teacher?.id, startTime: p.startTime, endTime: p.endTime, roomNumber: `R-${ci + 1}0${p.periodNumber}` },
        });
      }
    }

    for (const e of ACADEMIC_EXAMS) {
      const published = e.status === "PUBLISHED";
      const start = new Date(Date.now() + e.offsetDays * DAY);
      const exam = (await prisma.exam.findFirst({ where: { schoolId, classId: cls.id, title: e.title, academicYear: year } }))
        ?? await prisma.exam.create({ data: {
          schoolId, campusId, classId: cls.id, title: e.title, term: e.term, academicYear: year, examType: e.examType,
          status: e.status, totalMarks: subjects.length * 100, isLocked: published, lockedAt: published ? start : null,
          publishedAt: published ? start : null,
        } });
      for (const [i, subject] of subjects.entries()) {
        const date = new Date(start.getTime() + i * DAY);
        const has = await prisma.examSchedule.findFirst({ where: { schoolId, examId: exam.id, subjectId: subject.id } });
        if (!has) await prisma.examSchedule.create({ data: { schoolId, campusId, examId: exam.id, subjectId: subject.id, date, periodDefinitionId: examPeriod?.id } });
        if (!published) continue;
        for (const [si, student] of students.entries()) {
          const mark = await prisma.mark.findFirst({ where: { schoolId, examId: exam.id, studentId: student.id, subjectId: subject.id } });
          if (!mark) await prisma.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: student.id, subjectId: subject.id, marksObtained: markFor(si, i) } });
        }
      }
    }
    console.log(`  ✓ ${c.name}-${c.section}: ${students.length} students, ${subjects.length} subjects, timetable, ${ACADEMIC_EXAMS.length} exams`);
  }

  // Payroll: staff salary profiles + a DRAFT run for last month on the first campus.
  const { month, year: payYear } = previousMonth(new Date());
  const run = await prisma.payrollRun.upsert({
    where: { campusId_month_year: { campusId, month, year: payYear } },
    update: {},
    create: { schoolId, campusId, month, year: payYear, status: "DRAFT" },
  });
  let lines = 0;
  for (const [key, basic] of Object.entries(STAFF_SALARIES)) {
    const user = await userByKey(key);
    if (!user) continue;
    await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { schoolId, userId: user.id, designation: key, contractType: "PERMANENT", basicSalary: basic, employeeCode: `QA-${key.toUpperCase()}` },
    });
    const allowances = Math.round(basic * 0.1);
    await prisma.payrollLine.upsert({
      where: { payrollRunId_userId: { payrollRunId: run.id, userId: user.id } },
      update: {},
      create: { schoolId, payrollRunId: run.id, userId: user.id, basic, allowances, net: basic + allowances },
    });
    lines++;
  }
  console.log(`  ✓ payroll run ${month}/${payYear} (DRAFT) with ${lines} lines`);
  console.log(`\n✅ ${slug}: ${ACADEMIC_CLASSES.length} classes, ${studentCount} students seeded (synthetic).`);
}

main().catch((e) => { console.error("❌ QA academics seed failed:", e); process.exit(1); }).finally(() => prisma.$disconnect());
