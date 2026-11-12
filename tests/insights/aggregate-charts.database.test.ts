import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { campusRows, enrolmentTrend, gradeDistribution, networkEnrolments, networkGrades } from "../../src/components/insights/metrics";
import { ARCHIVED_STUDENT_STATUSES } from "../../src/lib/students/roster-status";

// SKAI-1856: the librarian and group consoles count in SQL. Their charts must match what the replaced per-row reads
// produced (same buckets, latest card per pupil, on-roll pupils on live campuses only), and the scope stays one
// school and, for the librarian, one campus. Two schools, two campuses (plus an archived one) and a denied role.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

type Who = { userId: string; schoolId: string; campusId: string | null; role: string; email: string; fullName: string };
let current: Who | null = null;
mock.module(pathToFileURL(join(__dirname, "..", "..", "src", "lib", "auth.ts")).href, { namedExports: { getAuthUser: async () => current } });

const raw = new PrismaClient();
const schoolA = `agg-a-${randomUUID()}`, schoolB = `agg-b-${randomUUID()}`;
const a1 = randomUUID(), a2 = randomUUID(), archived = randomUUID(), b1 = randomUUID();
const who = (role: string, schoolId: string, campusId: string | null): Who => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: `Synthetic ${role}` });
const monthsBack = (months: number, day = 1) => { const d = new Date(); d.setDate(day); d.setHours(0, 30, 0, 0); d.setMonth(d.getMonth() - months); return d; };
let dashboard: typeof import("../../src/app/actions/dashboard");
let seq = 0;

async function library(schoolId: string, campusId: string, loans: { issued: Date; returned?: Date; fine?: number }[]) {
  const reader = await raw.user.create({ data: { schoolId, campusId, role: "STUDENT", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic reader", onboardingComplete: true } });
  const member = await raw.libraryMember.create({ data: { schoolId, campusId, userId: reader.id, memberNo: `LM-${++seq}` } });
  const book = await raw.book.create({ data: { schoolId, campusId, title: "Synthetic title", copiesTotal: 1, copiesAvailable: 1 } });
  for (const loan of loans) {
    await raw.bookIssue.create({ data: { schoolId, bookId: book.id, memberId: member.id, issuedAt: loan.issued, dueAt: new Date(loan.issued.getTime() + 7 * 86_400_000), returnedAt: loan.returned ?? null, fine: loan.fine ?? 0 } });
  }
}

async function pupils(schoolId: string, campusId: string, rows: { enrolled: Date; status?: string; cards: { grade: string | null; percentage: number; at: Date }[] }[]) {
  const klass = await raw.class.create({ data: { schoolId, campusId, name: `C${++seq}`, academicYear: 2026 } });
  const exams = await Promise.all([0, 1, 2].map((i) => raw.exam.create({ data: { schoolId, campusId, classId: klass.id, title: `Synthetic exam ${i}`, term: `T${i}`, academicYear: 2026 } })));
  for (const row of rows) {
    const student = await raw.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: `Synthetic Pupil ${++seq}`, rollNo: `R-${seq}`, gender: "MALE", enrollmentDate: row.enrolled } });
    for (const [i, card] of row.cards.entries()) {
      await raw.reportCard.create({ data: { schoolId, campusId, studentId: student.id, examId: exams[i].id, grade: card.grade, percentage: card.percentage, generatedAt: card.at } });
    }
    if (row.status) await raw.student.update({ where: { id: student.id }, data: { status: row.status } });
  }
}

before(async () => {
  dashboard = await import("../../src/app/actions/dashboard");
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic Aggregates school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, a1], [schoolA, a2], [schoolA, archived], [schoolB, b1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Multan" } });

  await library(schoolA, a1, [
    { issued: monthsBack(0) }, { issued: monthsBack(0), returned: monthsBack(0) }, { issued: monthsBack(2), fine: 40 },
    { issued: monthsBack(5, 1), returned: monthsBack(3) }, { issued: monthsBack(6), returned: monthsBack(5, 3) },
    { issued: monthsBack(9), fine: 25 }, { issued: monthsBack(1), returned: monthsBack(1, 20), fine: 999 },
  ]);
  await library(schoolA, a2, [{ issued: monthsBack(0), fine: 700 }, { issued: monthsBack(1) }]);
  await library(schoolB, b1, [{ issued: monthsBack(0), fine: 800 }, { issued: monthsBack(2) }]);

  const t = (days: number) => new Date(Date.now() - days * 86_400_000);
  await pupils(schoolA, a1, [
    { enrolled: monthsBack(14), cards: [{ grade: "B", percentage: 70, at: t(90) }, { grade: "a", percentage: 92, at: t(10) }] },
    { enrolled: monthsBack(3), cards: [{ grade: "C", percentage: 0, at: t(5) }] },
    { enrolled: monthsBack(3, 20), cards: [] },
    { enrolled: monthsBack(1), status: "graduated", cards: [{ grade: "A", percentage: 99, at: t(1) }] },
  ]);
  await pupils(schoolA, a2, [{ enrolled: monthsBack(20), cards: [{ grade: "D", percentage: 45.5, at: t(3) }, { grade: "B", percentage: 75, at: t(60) }] }]);
  await raw.campus.update({ where: { id: archived }, data: { archivedAt: new Date() } });
  await pupils(schoolA, archived, [{ enrolled: monthsBack(2), cards: [{ grade: "F", percentage: 10, at: t(2) }] }]);
  await pupils(schoolB, b1, [{ enrolled: monthsBack(4), cards: [{ grade: "E", percentage: 33, at: t(2) }] }]);
});

after(async () => {
  for (const schoolId of [schoolA, schoolB]) await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await raw.$disconnect();
});

/** The per-row reads and browser maths these consoles used before SKAI-1856, run against the same rows. */
function oldMonths(dates: Date[]) {
  return Array.from({ length: 6 }, (_, i) => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(1); start.setMonth(start.getMonth() - 5 + i);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, count: dates.filter((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === key).length, value: 0 };
  });
}

test("SKAI-1856: librarian loan months match the per-loan buckets and stay on the librarian's school and campus", async () => {
  current = who("LIBRARIAN", schoolA, a1);
  const { summary } = await dashboard.getOperationsStaffDashboardData() as any;
  const window = new Date(); window.setHours(0, 0, 0, 0); window.setDate(1); window.setMonth(window.getMonth() - 5);
  const loans = await raw.bookIssue.findMany({ where: { schoolId: schoolA, issuedAt: { gte: window }, book: { campusId: a1 } } });
  assert.deepEqual(summary.issuesByMonth, oldMonths(loans.map((l) => l.issuedAt)));
  assert.deepEqual(summary.returnsByMonth, oldMonths(loans.filter((l) => l.returnedAt).map((l) => l.returnedAt!)));
  assert.deepEqual(summary.issuesByMonth.map((m: any) => m.count), [1, 0, 0, 1, 1, 2]);
  assert.equal(summary.finesOutstanding, 65, "open-loan fines at this campus only, including the 9-month-old one");
  assert.equal(summary.onLoan, 3);

  current = who("LIBRARIAN", schoolB, b1);
  const other = (await dashboard.getOperationsStaffDashboardData() as any).summary;
  assert.deepEqual(other.issuesByMonth.map((m: any) => m.count), [0, 0, 0, 1, 0, 1]);
  assert.equal(other.finesOutstanding, 800);
});

test("SKAI-1856: group charts match the per-pupil reads for on-roll pupils on live campuses of one school", async () => {
  current = who("SUPER_ADMIN", schoolA, null);
  const data = await dashboard.getSuperAdminDashboardData() as any;
  const before = await raw.campus.findMany({
    where: { schoolId: schoolA, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: { students: { where: { status: { notIn: ARCHIVED_STUDENT_STATUSES } }, select: { enrollmentDate: true, reportCards: { select: { percentage: true, grade: true }, orderBy: [{ generatedAt: "desc" }, { id: "desc" }], take: 1 } } } },
  });
  const pupilsBefore = before.flatMap((c) => c.students);
  assert.deepEqual(data.campuses.map((c: any) => c.id).sort(), [a1, a2].sort());
  assert.deepEqual(enrolmentTrend(networkEnrolments(data.campuses), 12), enrolmentTrend(pupilsBefore, 12));
  assert.deepEqual(gradeDistribution(networkGrades(data.campuses)), gradeDistribution(pupilsBefore.map((p) => p.reportCards[0]).filter(Boolean)));
  assert.deepEqual(gradeDistribution(networkGrades(data.campuses)).map((g) => [g.grade, g.count]), [["A", 1], ["C", 1], ["D", 1]]);
  for (const campus of data.campuses) {
    const listed = before.find((c) => c.id === campus.id)!;
    assert.equal(campusRows([campus])[0].average, campusRows([{ ...listed, currency: "PKR" }])[0].average, `average at ${campus.id}`);
  }
  assert.equal(data.campuses.find((c: any) => c.id === a1).averageScore, 46);
});

test("SKAI-1856: a principal is denied the group console", async () => {
  current = who("PRINCIPAL", schoolA, a1);
  await assert.rejects(() => dashboard.getSuperAdminDashboardData(), /Permission Denied/);
});
