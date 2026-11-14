import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1976: the family inbox read ~14 queries per child (50 for a 3-child qa-big parent). Siblings now share one
// read per source (studentId IN the children allowed to see it) plus one relationship read and one exam-brief chain.
// Each child stays under its own permissions, capped sources are cut per child, and another school is never read.
const NOW = new Date("2026-11-10T09:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
type Ids = string | { in: string[] };
type Where = { schoolId: string; studentId?: Ids; submissionVersion?: { studentId: Ids }; classId?: { in: string[] }; sessionId?: { in: string[] } };
const reads: { model: string; where: Where }[] = [];
const failing = new Set<string>();
const hit = (ids: Ids | undefined, id: string) => typeof ids === "string" ? ids === id : Boolean(ids?.in.includes(id));
const read = async <T extends { schoolId: string; studentId?: string }>(model: string, where: Where, rows: T[], take?: number) => {
  reads.push({ model, where });
  if (failing.has(model)) throw new Error(`${model} down`);
  const own = rows.filter(r => r.schoolId === where.schoolId && (r.studentId === undefined || hit(where.studentId ?? where.submissionVersion?.studentId, r.studentId)));
  return take ? own.slice(0, take) : own;
};

const kid = (id: string, schoolId: string, classId: string, campusId = "north") => ({ id, schoolId, fullName: id, campusId, classId, campus: { name: campusId, school: { name: schoolId } } });
const students = [kid("amal", "school-a", "class-1"), kid("bilal", "school-a", "class-1", "south"), kid("cara", "school-a", "class-2"), kid("zara", "school-b", "class-b")];
const all = { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false };
const grants: Record<string, Record<string, boolean>> = { amal: all, bilal: { ...all, finances: false }, cara: all, zara: all };
const relationships = students.map(s => ({ schoolId: s.schoolId, studentId: s.id, accessVersions: [{ permissions: grants[s.id], effectiveFrom: day(100), effectiveUntil: null }] }));
const invoice = (id: string, studentId: string, schoolId = "school-a", dueIn = 5) => ({ id, schoolId, studentId, invoiceNumber: id, dueDate: day(-dueIn), balanceDue: 100, currency: "PKR", status: "UNPAID", generatedAt: day(10) });
// Amal has 25 open invoices, more than the 20 the inbox shows per child; Cara's single invoice must still show.
const invoices = [...Array.from({ length: 25 }, (_, i) => invoice(`amal-inv-${i}`, "amal", "school-a", i + 1)), invoice("bilal-inv", "bilal"), invoice("cara-inv", "cara", "school-a", 40), invoice("zara-inv", "zara", "school-b")];
const papers = (date: string) => ({ papers: [{ scheduleId: "p1", classId: "class-1", subjectName: "Maths", date }] });
const versions = [
  { id: "v2", schoolId: "school-a", sessionId: "sess-1", version: 2, publishedAt: day(1), snapshot: papers("2026-11-20"), changes: [{ scheduleId: "p1", kind: "MOVED" }], campusId: "north" },
  { id: "v1", schoolId: "school-a", sessionId: "sess-1", version: 1, publishedAt: day(9), snapshot: papers("2026-11-18"), changes: [], campusId: "north" },
];

const prisma = {
  student: { findMany: ({ where }: { where: { schoolId: string; id: { in: string[] } } }) => read("student", { schoolId: where.schoolId }, students.filter(s => where.id.in.includes(s.id))) },
  guardianRelationship: { findMany: ({ where }: { where: Where }) => read("guardianRelationship", where, relationships) },
  attendance: { findMany: ({ where }: { where: Where }) => read("attendance", where, []) },
  learnerLeaveRequest: { findMany: ({ where }: { where: Where }) => read("leave", where, []) },
  meetingBooking: { findMany: ({ where }: { where: Where }) => read("meetingBooking", where, []) },
  meetingAction: { findMany: ({ where }: { where: Where }) => read("meetingAction", where, []) },
  invoice: { findMany: ({ where, take }: { where: Where; take?: number }) => read("invoice", where, invoices, take) },
  reportCard: { findMany: ({ where }: { where: Where }) => read("reportCard", where, []) },
  assignmentFeedback: { findMany: ({ where }: { where: Where }) => read("feedback", where, []) },
  familyResultNote: { findMany: ({ where }: { where: Where }) => read("note", where, []) },
  exam: { findMany: ({ where }: { where: Where }) => read("exam", where, [{ schoolId: "school-a", classId: "class-1", sessionId: "sess-1" }, { schoolId: "school-a", classId: "class-2", sessionId: "sess-2" }].filter(e => where.classId!.in.includes(e.classId))) },
  examDatesheetVersion: { findMany: ({ where }: { where: Where & { version?: { gt: number }; OR?: { sessionId: string; version: number }[] } }) => read("datesheetVersion", where, versions.filter(v => where.OR ? where.OR.some(o => o.sessionId === v.sessionId && o.version === v.version) : where.sessionId!.in.includes(v.sessionId) && v.version > 1)) },
  examBriefReceipt: { findMany: ({ where }: { where: Where }) => read("briefReceipt", where, [{ schoolId: "school-a", studentId: "bilal", versionId: "v2", acknowledgedAt: day(0) }]) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async (schoolId: string, campusId: string) => { reads.push({ model: "locale", where: { schoolId } }); return { timezone: campusId === "south" ? "Asia/Karachi" : "UTC" }; } } });
mock.module("@/lib/family/trips", { namedExports: { guardianTrips: async (_g: string, schoolId: string, ids: string[]) => { reads.push({ model: "trips", where: { schoolId, studentId: { in: ids } } }); return []; } } });

const inbox = async (schoolId: string, ids: string[]) => (await import("@/lib/parent/inbox")).familyInbox({ guardianUserId: "mum", schoolId, children: ids.map(id => ({ id })), singleStudentId: null, linkQuery: id => `?student=${id}` }, NOW);
const studentIdsOf = (where: Where) => { const ids = where.studentId ?? where.submissionVersion?.studentId; return ids === undefined ? null : typeof ids === "string" ? [ids] : ids.in; };

test("SKAI-1976: siblings share one read per source, so the query count no longer grows per child", async () => {
  reads.length = 0;
  const three = await inbox("school-a", ["amal", "bilal", "cara"]);
  assert.deepEqual(three.unavailable, []);
  const perModel = new Map<string, number>();
  for (const r of reads) perModel.set(r.model, (perModel.get(r.model) ?? 0) + 1);
  // The date sheet is read twice in all (the republished versions, then their priors), not twice per child.
  const expected = (model: string) => model === "locale" || model === "datesheetVersion" ? 2 : 1;
  for (const [model, count] of perModel) assert.equal(count, expected(model), `${model} was read ${count} times`);
  // student, relationships, two campus locales, 9 sources (trips included) and the exam-brief chain of four.
  assert.ok(reads.length <= 17, `expected at most 17 reads for three children, saw ${reads.length}`);
});

test("SKAI-1976: each child keeps its own permissions and its own cap; a sibling never crowds another out", async () => {
  reads.length = 0;
  const result = await inbox("school-a", ["amal", "bilal", "cara"]);
  const fees = result.items.filter(i => i.kind === "PAY_FEE");
  assert.equal(fees.filter(i => i.childId === "amal").length, 20, "the per-child cap of 20 still applies");
  assert.ok(fees.some(i => i.id === "invoice:cara-inv"), "Cara's invoice still shows behind Amal's 25");
  assert.ok(!fees.some(i => i.childId === "bilal"), "Bilal's guardian has no finance grant, so his invoices stay hidden");
  assert.deepEqual(studentIdsOf(reads.find(r => r.model === "invoice")!.where)!.sort(), ["amal", "cara"], "the denied child is not even read");
  // The exam brief is per child: Amal and Bilal share class-1's change; Bilal's guardian already acknowledged it.
  const briefs = result.items.filter(i => i.kind === "EXAM_CHANGED").map(i => `${i.childId}:${i.state}`).sort();
  assert.deepEqual(briefs, ["amal:ACTION", "bilal:COMPLETED"]);
  // Each child is labelled with its own campus timezone.
  assert.equal(result.items.find(i => i.childId === "bilal")!.timezone, "Asia/Karachi");
});

test("SKAI-1976: every read stays inside the school; another school's child and rows never appear", async () => {
  reads.length = 0;
  const result = await inbox("school-a", ["amal", "zara"]);
  assert.deepEqual(result.children.map(c => c.id), ["amal"]);
  assert.ok(result.items.every(i => i.childId === "amal"));
  for (const r of reads) {
    assert.equal(r.where.schoolId, "school-a", `${r.model} read without the school`);
    assert.ok(!(studentIdsOf(r.where) ?? []).includes("zara"), `${r.model} read another school's child`);
  }
});

test("SKAI-1976: a failed source marks only the children it covered as unavailable", async () => {
  failing.add("invoice");
  const result = await inbox("school-a", ["amal", "bilal"]);
  failing.clear();
  assert.deepEqual(result.unavailable, ["amal"], "Bilal has no finance grant, so the failed invoice read never covered him");
  assert.ok(result.items.some(i => i.childId === "bilal"));
  failing.add("guardianRelationship");
  const none = await inbox("school-a", ["amal", "bilal"]);
  failing.clear();
  assert.deepEqual(none.unavailable.sort(), ["amal", "bilal"]);
  assert.deepEqual(none.items, []);
});
