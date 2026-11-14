import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1873: the family inbox reads each child's sources together instead of one after another, Today reads its
// lesson chain, catch-up, exams and work together, and /api/parent/data loads the permission matrix and the
// attendance rule together. Items, their order, school scope and permission gating stay exactly as before.
const NOW = new Date("2026-11-10T09:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
let inFlight = 0, maxInFlight = 0;
const reads: { model: string; where: Record<string, unknown> }[] = [];
const reset = () => { inFlight = 0; maxInFlight = 0; reads.length = 0; };
/** Every mocked read takes a little time, so reads issued together overlap and sequential ones do not. */
async function read<T>(model: string, where: Record<string, unknown>, rows: T[]): Promise<T[]> {
  reads.push({ model, where }); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise(resolve => setTimeout(resolve, 15));
  inFlight--;
  return rows;
}
type Where = { schoolId: string; studentId?: string | { in: string[] }; submissionVersion?: { studentId: string | { in: string[] } } };
// SKAI-1976: siblings are read together (studentId IN ...); one child is still read by its own id.
type Ids = string | { in: string[] };
const matches = (ids: Ids | undefined, id: string) => typeof ids === "string" ? ids === id : Boolean(ids?.in.includes(id));
const own = <T extends { schoolId: string; studentId: string }>(rows: T[], where: Where) => rows.filter(r => r.schoolId === where.schoolId && matches(where.studentId ?? where.submissionVersion?.studentId, r.studentId));

const students = [
  { id: "kid-1", schoolId: "school-a", fullName: "Amal", campusId: "north", classId: "class-1", campus: { name: "North", school: { name: "School A" } } },
  { id: "kid-2", schoolId: "school-a", fullName: "Bilal", campusId: "south", classId: "class-2", campus: { name: "South", school: { name: "School A" } } },
  { id: "kid-b", schoolId: "school-b", fullName: "Zara", campusId: "b-main", classId: "class-b", campus: { name: "Main", school: { name: "School B" } } },
];
const attendance = [
  { id: "att-1", schoolId: "school-a", studentId: "kid-1", date: day(2), status: "ABSENT", explanations: [] },
  { id: "att-2", schoolId: "school-a", studentId: "kid-1", date: day(5), status: "LATE", explanations: [{ id: "ex-1", status: "PENDING", submittedById: "mum", reviewNote: null, reviewedAt: null, createdAt: day(4) }] },
  { id: "att-b", schoolId: "school-b", studentId: "kid-b", date: day(1), status: "ABSENT", explanations: [] },
];
const leave = [{ id: "lv-1", schoolId: "school-a", studentId: "kid-1", fromDate: day(-3), toDate: day(-2), status: "PENDING", reviewNote: null, requestedById: "dad", createdAt: day(1), reviewedAt: null }];
const bookings = [{ id: "mt-1", schoolId: "school-a", studentId: "kid-1", startsAt: day(-1), updatedAt: day(1) }];
const actions = [{ id: "ma-1", schoolId: "school-a", studentId: "kid-1", text: "Read together", dueDate: "2026-11-08", status: "OPEN", completedAt: null, createdAt: day(6) }];
const invoices = [
  { id: "inv-1", schoolId: "school-a", studentId: "kid-1", invoiceNumber: "INV-1", dueDate: day(-1), balanceDue: 500, currency: "PKR", status: "UNPAID", generatedAt: day(20) },
  { id: "inv-b", schoolId: "school-b", studentId: "kid-b", invoiceNumber: "INV-B", dueDate: day(3), balanceDue: 900, currency: "PKR", status: "UNPAID", generatedAt: day(20) },
];
const reports = [{ id: "rc-1", schoolId: "school-a", studentId: "kid-1", generatedAt: day(7), exam: { title: "Mid-term" } }];
const feedback = [{ id: "fb-1", schoolId: "school-a", studentId: "kid-1", returnedAt: day(3), submissionVersion: { studentId: "kid-1", assignmentId: "as-1", submission: { assignment: { title: "Essay" } } } }];
const notes = [{ id: "note-1", schoolId: "school-a", studentId: "kid-1", sentence: "Great progress.", sentAt: day(2) }];
const grants: Record<string, Record<string, boolean> | null> = {
  "kid-1": { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false },
  "kid-2": { learningRecords: false, attendance: false, finances: false, communication: false, pickup: false },
  "kid-b": { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false },
};

const prisma = {
  student: {
    findMany: ({ where }: { where: { schoolId: string; id: { in: string[] } } }) => read("student", where, students.filter(s => s.schoolId === where.schoolId && where.id.in.includes(s.id))),
    findFirst: ({ where }: { where: { schoolId: string } }) => read("student", where, [{ id: "kid-1", fullName: "Amal", classId: "class-1", campusId: "north", class: { name: "5", section: "A", academicYear: 2026 } }]).then(rows => where.schoolId === "school-a" ? rows[0] : null),
  },
  attendance: { findMany: ({ where }: { where: Where }) => read("attendance", where, own(attendance, where)) },
  learnerLeaveRequest: { findMany: ({ where }: { where: Where }) => read("leave", where, own(leave, where)) },
  meetingBooking: { findMany: ({ where }: { where: Where }) => read("meetingBooking", where, own(bookings, where)) },
  meetingAction: { findMany: ({ where }: { where: Where }) => read("meetingAction", where, own(actions, where)) },
  invoice: { findMany: ({ where }: { where: Where }) => read("invoice", where, own(invoices, where)) },
  reportCard: { findMany: ({ where }: { where: Where }) => read("reportCard", where, own(reports, where)) },
  assignmentFeedback: { findMany: ({ where }: { where: Where }) => read("feedback", where, own(feedback, where)) },
  familyResultNote: { findMany: ({ where }: { where: Where }) => read("note", where, own(notes, where)) },
  holiday: { findFirst: ({ where }: { where: Where }) => read("holiday", where, []).then(() => null) },
  academicCycle: { findFirst: ({ where }: { where: Where }) => read("cycle", where, []).then(() => null) },
  timetable: { findFirst: ({ where }: { where: Where }) => read("timetable", where, [{ id: "tt-1" }]).then(rows => rows[0]) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ timezone: "UTC", weekend: [6, 0] }) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { currentGuardianPermissionsByStudent: async ({ studentIds }: { studentIds: string[] }) => new Map(studentIds.filter(id => grants[id]).map(id => [id, grants[id]])) } });
mock.module("@/lib/family/trips", { namedExports: { guardianTrips: (_guardian: string, schoolId: string, ids: string[]) => read("trips", { schoolId, studentId: ids.length === 1 ? ids[0] : { in: ids } }, schoolId === "school-a" && ids.includes("kid-1") ? [{ tripId: "trip-1", studentId: "kid-1", canSign: true, myAnswer: null, status: "PENDING", deadlinePassed: false, earlierAnswer: false, answeredByOther: false, version: { title: "Museum", version: 1, respondBy: day(-4), publishedAt: day(2) } }] : []) } });
mock.module("@/lib/academic/exam-brief", { namedExports: { familyExamBriefs: (schoolId: string, kids: { id: string }[]) => read("examBrief", { schoolId, studentId: kids.length === 1 ? kids[0].id : { in: kids.map(k => k.id) } }, []).then(() => new Map(kids.map(k => [k.id, k.id === "kid-1" && schoolId === "school-a" ? [{ versionId: "ds-2", acknowledgedAt: null, publishedAt: day(1), items: [{ kind: "MOVED", subject: "Maths", date: "2026-11-20", previousDate: "2026-11-18" }] }] : []]))) } });
// Today's sources other than prisma.
let examsFail = false;
mock.module("@/lib/timetable/versions", { namedExports: { versionsFor: (id: string) => read("versions", { schoolId: "via-timetable", id }, []).then(() => ({ inForce: { version: 3, slots: [{ id: "slot-1", dayOfWeek: 2, startTime: "08:00", endTime: "08:45", slotType: "CLASS", subjectName: "Maths", teacherName: "Ms Noor", roomNumber: "1" }] } })), slotsOf: (v: { slots: unknown[] } | null) => v?.slots ?? [] } });
mock.module("@/lib/cover/recovery", { namedExports: {
  coverForDay: (schoolId: string, ids: string[]) => read("cover", { schoolId, ids }, []).then(() => new Map([["slot-1", "Mr Ali"]])),
  classCatchUp: (schoolId: string, classId: string) => read("catchUp", { schoolId, classId }, [{ id: "cu-1" }]),
} });
mock.module("@/lib/school-ai/exam-service", { namedExports: { listSchoolAiExams: (user: { schoolId: string }) => read("exams", { schoolId: user.schoolId }, []).then(rows => { if (examsFail) throw new Error("down"); return rows; }) } });
mock.module("@/lib/assignments/service", { namedExports: { listAssignments: (user: { schoolId: string }) => read("assignments", { schoolId: user.schoolId }, []).then(() => ({ mode: "learner", assignments: [] })) } });

const inbox = async (schoolId: string, ids: string[]) => (await import("@/lib/parent/inbox")).familyInbox({ guardianUserId: "mum", schoolId, children: ids.map(id => ({ id })), singleStudentId: null, linkQuery: id => `?studentId=${id}` }, NOW);

test("SKAI-1873: a child's inbox sources are read together and the items keep their order", async () => {
  reset();
  const result = await inbox("school-a", ["kid-1"]);
  // The same list and order the sequential version produced. The meeting and the invoice share a due time, so the
  // stable sort keeps them in source order: the fetches overlap, but items are still added in the old order.
  assert.deepEqual(result.items.map(item => `${item.state}:${item.id}`), [
    "ACTION:meeting-action:ma-1", "ACTION:meeting:mt-1", "ACTION:invoice:inv-1", "ACTION:trip:trip-1:kid-1",
    "ACTION:attendance:att-1", "ACTION:exam-change:ds-2:kid-1",
    "WAITING:leave:lv-1", "WAITING:attendance:att-2",
    "UPDATE:result-note:note-1", "UPDATE:feedback:fb-1", "UPDATE:report:rc-1",
  ]);
  assert.deepEqual(result.counts, { action: 6, waiting: 2, completed: 0 });
  assert.deepEqual(result.unavailable, []);
  // Eleven source reads (attendance, leave, trips, two meeting reads, invoices, three learning reads, exam brief) overlap.
  assert.ok(maxInFlight >= 10, `expected the sources to overlap, saw at most ${maxInFlight} at once`);
});

test("SKAI-1873: every read stays inside the school and the child; another school's child is never read", async () => {
  reset();
  const result = await inbox("school-a", ["kid-1", "kid-b"]);
  assert.deepEqual(result.children.map(c => c.id), ["kid-1"]);
  for (const r of reads.filter(r => r.model !== "student")) {
    assert.equal(r.where.schoolId, "school-a", `${r.model} read without the school`);
    assert.equal((r.where.studentId ?? (r.where.submissionVersion as { studentId: string } | undefined)?.studentId), "kid-1", `${r.model} read another child`);
  }
  reset();
  const b = await inbox("school-b", ["kid-b"]);
  assert.deepEqual(b.items.map(i => i.id), ["invoice:inv-b", "attendance:att-b"]);
  assert.ok(reads.every(r => r.where.schoolId === "school-b"));
});

test("SKAI-1873: a child without grants is not read, and a revoked relationship reads nothing", async () => {
  reset();
  const result = await inbox("school-a", ["kid-2"]);
  assert.deepEqual(result.items, []);
  assert.deepEqual(reads.map(r => r.model).sort(), ["student", "trips"], "only the roster and the trip list (which applies its own signatory rule)");
  grants["kid-1"] = null;
  reset();
  assert.deepEqual((await inbox("school-a", ["kid-1"])).items, []);
  assert.deepEqual(reads.map(r => r.model), ["student"]);
  grants["kid-1"] = { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false };
});

const student = { userId: "u-1", role: "STUDENT", schoolId: "school-a" } as never;

test("SKAI-1873: Today reads its lesson chain, catch-up, exams and work together, all in the student's school", async () => {
  reset(); examsFail = false;
  const today = await (await import("@/lib/student/today")).studentToday(student, "2026-11-10", NOW);
  assert.ok(maxInFlight >= 4, `expected versions, catch-up, exams and work to overlap, saw ${maxInFlight}`);
  assert.deepEqual(today.lessons.map(l => [l.id, l.teacher, (l as { cover?: boolean }).cover]), [["slot-1", "Mr Ali", true]]);
  assert.equal(today.timetableVersion, 3);
  assert.deepEqual(today.catchUp, [{ id: "cu-1" }]);
  assert.ok(reads.filter(r => r.model !== "versions").every(r => r.where.schoolId === "school-a"));
  // The cover lookup still follows the version it depends on.
  assert.ok(reads.findIndex(r => r.model === "cover") > reads.findIndex(r => r.model === "versions"));
});

test("SKAI-1873: Today still reports a failed exam lookup, and refuses other schools and roles", async () => {
  reset(); examsFail = true;
  const svc = await import("@/lib/student/today");
  const today = await svc.studentToday(student, "2026-11-10", NOW);
  assert.equal(today.examsUnavailable, true);
  assert.equal(today.nextAction, null);
  examsFail = false;
  await assert.rejects(svc.studentToday({ userId: "u-1", role: "STUDENT", schoolId: "school-b" } as never, null, NOW), /active student record/);
  await assert.rejects(svc.studentToday({ userId: "u-2", role: "PARENT", schoolId: "school-a" } as never, null, NOW), /own account/);
});
