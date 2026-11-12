import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1874 (PERF-01): the timeline note replay, the next roll number and the
// consolidation preview no longer scan whole tables or run one round trip per
// model in series. Rows, scope and answers are unchanged.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

type U = { userId: string; role: string; schoolId: string; campusId: string | null };
type Where = Record<string, unknown>;
type Audit = { id: string; schoolId: string; tableName: string; recordId: string; userId: string; newValue: Record<string, unknown> };
type Event = { id: string; schoolId: string; studentId: string; kind: string; title: string; actorId: string | null };
type Pupil = { id: string; schoolId: string; campusId: string; classId: string | null; rollNo: string };

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const h = {
  user: null as unknown as U,
  denied: new Set<string>(),
  audits: [] as Audit[],
  events: [] as Event[],
  classes: [] as { id: string; schoolId: string; campusId: string; name: string; section: string }[],
  pupils: [] as Pupil[],
  calls: [] as { model: string; op: string; where: Where }[],
  links: {} as Record<string, number>,
  inFlight: 0,
  peak: 0,
};
const inList = (v: string, f: unknown) => typeof f === "object" && f && "in" in f ? (f as { in: string[] }).in.includes(v) : f === undefined || f === v;

const prisma: Record<string, unknown> = {
  auditLog: {
    findFirst: async ({ where }: { where: Where }) => {
      h.calls.push({ model: "auditLog", op: "findFirst", where });
      const path = where.newValue as { path: string[]; equals: string };
      const row = h.audits.find(a => a.schoolId === where.schoolId && a.tableName === where.tableName && a.userId === where.userId
        && inList(a.recordId, where.recordId) && a.newValue[path.path[0]] === path.equals);
      return row ? { recordId: row.recordId } : null;
    },
  },
  studentTimelineEvent: {
    findMany: async ({ where }: { where: Where }) => {
      h.calls.push({ model: "studentTimelineEvent", op: "findMany", where });
      return h.events.filter(e => e.schoolId === where.schoolId && e.studentId === where.studentId && e.actorId === where.actorId && inList(e.kind, where.kind)).map(e => ({ id: e.id }));
    },
    findFirst: async ({ where }: { where: Where }) => h.events.find(e => e.id === where.id && e.studentId === where.studentId) ?? null,
  },
  class: {
    findFirst: async ({ where }: { where: Where }) => h.classes.find(c => c.id === where.id && c.campusId === where.campusId) ?? null,
    findMany: async ({ where }: { where: Where }) => { h.calls.push({ model: "class", op: "findMany", where }); return h.classes.filter(c => c.campusId === where.campusId); },
  },
  student: {
    findMany: async ({ where }: { where: Where }) => {
      h.calls.push({ model: "student", op: "findMany", where });
      if (where.id) return h.pupils.filter(p => (where.id as { in: string[] }).in.includes(p.id) && p.schoolId === h.user.schoolId)
        .map(p => ({ ...p, fullName: p.id, admissionNo: p.id, consolidatedIntoId: null, parentUserId: "g1", dateOfBirth: new Date(0), studentUserId: null, siblingGroupId: "f1" }));
      const classCampus = (where.class as { campusId: string }).campusId;
      return h.pupils.filter(p => p.schoolId === where.schoolId && p.campusId === where.campusId && p.rollNo.startsWith((where.rollNo as { startsWith: string }).startsWith)
        && h.classes.some(c => c.id === p.classId && c.campusId === classCampus)).map(p => ({ rollNo: p.rollNo }));
    },
  },
};
// Every other model the consolidation preview counts: report a slow count and track concurrency.
const slowCount = (name: string) => async () => {
  h.inFlight++; h.peak = Math.max(h.peak, h.inFlight);
  await new Promise(r => setTimeout(r, 2));
  h.inFlight--;
  return h.links[name] ?? 0;
};
const counted = new Proxy(prisma, { get: (target, name: string) => {
  const delegate = target[name];
  if (typeof delegate === "function") return delegate;
  return { count: slowCount(name), ...(delegate as object | undefined) };
} });
(prisma as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => unknown) => fn(counted);

mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: counted } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => {} } });
mock.module(src("lib/api/validate.ts"), { namedExports: { parseBody: async (req: Request) => req.json() } });
mock.module(src("lib/auth/institution.ts"), { namedExports: { isInstitutionAuthority: (u: U) => u.role === "SCHOOL_ADMIN" } });
mock.module(src("lib/students/timeline.ts"), { namedExports: {
  MANUAL_TIMELINE_KINDS: ["NOTE"], TIMELINE_DETAIL_MAX: 2000, TIMELINE_TITLE_MAX: 200, readStudentTimeline: async () => ({}),
  scopedTimelineStudent: async (u: U, id: string) => {
    const p = h.pupils.find(x => x.id === id && x.schoolId === u.schoolId);
    if (!p) throw new ApiError("Student not found", 404);
    return { id: p.id, campusId: p.campusId };
  },
} });
mock.module(src("lib/api/scope.ts"), { namedExports: {
  ApiError,
  requireAuthUser: async () => h.user,
  assertStaffRole: () => {},
  assertPermission: async (u: U, m: string, a: string) => { if (h.denied.has(`${u.role}:${m}.${a}`)) throw new ApiError("Forbidden", 403); },
  assertModuleRead: async (u: U, m: string) => { if (h.denied.has(`${u.role}:${m}.view`)) throw new ApiError("Forbidden", 403); },
  resolveCampusId: async (u: U) => u.campusId,
  errorResponse: (e: unknown) => Response.json({ error: (e as Error).message }, { status: (e as ApiError).status ?? 500 }),
} });

const as = (role: string, schoolId: string, campusId: string, userId: string) => { h.user = { userId, role, schoolId, campusId }; };
const post = (body: unknown) => ({ json: async () => body }) as never;
const get = (qs: string) => ({ nextUrl: new URL(`http://x/api?${qs}`) }) as never;

beforeEach(() => {
  h.denied = new Set(["LIBRARIAN:students.edit", "LIBRARIAN:students.view", "TEACHER:students.delete"]);
  h.calls = []; h.links = {}; h.inFlight = 0; h.peak = 0;
  h.classes = [
    { id: "c-a1", schoolId: "school-a", campusId: "campus-a", name: "Grade 1", section: "A" },
    { id: "c-a1-old", schoolId: "school-a", campusId: "campus-a", name: "Grade 1", section: "A" },
    { id: "c-b1", schoolId: "school-a", campusId: "campus-b", name: "Grade 1", section: "A" },
    { id: "c-z1", schoolId: "school-b", campusId: "campus-z", name: "Grade 1", section: "A" },
  ];
  h.pupils = [
    { id: "p1", schoolId: "school-a", campusId: "campus-a", classId: "c-a1", rollNo: "GRA-A-007" },
    { id: "p2", schoolId: "school-a", campusId: "campus-a", classId: "c-a1-old", rollNo: "GRA-A-012" },
    { id: "p3", schoolId: "school-a", campusId: "campus-a", classId: null, rollNo: "GRA-A-900" },
    { id: "p4", schoolId: "school-a", campusId: "campus-b", classId: "c-b1", rollNo: "GRA-A-050" },
    { id: "p9", schoolId: "school-b", campusId: "campus-z", classId: "c-z1", rollNo: "GRA-A-300" },
    { id: "p5", schoolId: "school-a", campusId: "campus-a", classId: "c-a1", rollNo: "x" },
  ];
  h.events = [
    { id: "e1", schoolId: "school-a", studentId: "p1", kind: "NOTE", title: "Allergy", actorId: "u-a" },
    { id: "e2", schoolId: "school-a", studentId: "p1", kind: "ADMITTED", title: "Admitted", actorId: "u-a" },
    { id: "e9", schoolId: "school-b", studentId: "p9", kind: "NOTE", title: "Other school", actorId: "u-b" },
  ];
  h.audits = [
    { id: "a1", schoolId: "school-a", tableName: "student_timeline_events", recordId: "e1", userId: "u-a", newValue: { requestId: "req-00001" } },
    { id: "a9", schoolId: "school-b", tableName: "student_timeline_events", recordId: "e9", userId: "u-b", newValue: { requestId: "req-shared" } },
    ...Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, schoolId: "school-a", tableName: "fees", recordId: `f${i}`, userId: "u-a", newValue: {} })),
  ];
});

test("timeline replay probes the audit log only through this author's notes on this pupil", async () => {
  const { POST } = await import("../../src/app/api/students/timeline/route");
  as("SCHOOL_ADMIN", "school-a", "campus-a", "u-a");
  const res = await POST(post({ studentId: "p1", title: "Allergy", requestId: "req-00001" }));
  const body = await res.json();
  assert.equal(body.replayed, true);
  assert.equal(body.data.id, "e1");
  const probe = h.calls.find(c => c.model === "auditLog")!;
  assert.deepEqual(probe.where.recordId, { in: ["e1"] }, "audit lookup is keyed by record id, not the whole school log");
  assert.equal(probe.where.schoolId, "school-a");
  const narrow = h.calls.find(c => c.model === "studentTimelineEvent")!;
  assert.deepEqual(narrow.where, { schoolId: "school-a", studentId: "p1", actorId: "u-a", kind: { in: ["NOTE"] } });
});

test("timeline replay never crosses schools and skips the audit probe when the author has no notes", async () => {
  const { POST } = await import("../../src/app/api/students/timeline/route");
  as("SCHOOL_ADMIN", "school-a", "campus-a", "u-b");
  (prisma as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => unknown) => fn({
    studentTimelineEvent: { create: async ({ data }: { data: Event }) => ({ ...data, id: "new-1" }) },
  });
  const res = await POST(post({ studentId: "p1", title: "Note", requestId: "req-shared" }));
  assert.equal(res.status, 201);
  assert.equal((await res.json()).replayed, false);
  assert.equal(h.calls.filter(c => c.model === "auditLog").length, 0);
  (prisma as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => unknown) => fn(counted);

  as("SCHOOL_ADMIN", "school-b", "campus-z", "u-b");
  const other = await POST(post({ studentId: "p1", title: "Note", requestId: "req-00001" }));
  assert.equal(other.status, 404, "a pupil of another school is not found");
});

test("timeline notes stay denied to a role without students.edit", async () => {
  const { POST } = await import("../../src/app/api/students/timeline/route");
  as("LIBRARIAN", "school-a", "campus-a", "u-a");
  const res = await POST(post({ studentId: "p1", title: "Note", requestId: "req-00001" }));
  assert.equal(res.status, 403);
  assert.equal(h.calls.length, 0);
});

test("next roll reads one scoped student query and keeps the numeric max per campus", async () => {
  const { GET } = await import("../../src/app/api/students/next-roll/route");
  as("SCHOOL_ADMIN", "school-a", "campus-a", "u-a");
  assert.deepEqual(await (await GET(get("classId=c-a1"))).json(), { rollNo: "GRA-A-013", prefix: "GRA-A-" });
  assert.equal(h.calls.filter(c => c.model === "class" && c.op === "findMany").length, 0, "no list of every class id");
  const q = h.calls.find(c => c.model === "student")!;
  assert.deepEqual(q.where, { schoolId: "school-a", campusId: "campus-a", class: { campusId: "campus-a" }, rollNo: { startsWith: "GRA-A-" } });

  as("SCHOOL_ADMIN", "school-a", "campus-b", "u-a");
  assert.equal((await (await GET(get("classId=c-b1"))).json()).rollNo, "GRA-A-051");
  as("SCHOOL_ADMIN", "school-b", "campus-z", "u-b");
  assert.equal((await (await GET(get("classId=c-z1"))).json()).rollNo, "GRA-A-301");
  assert.equal((await GET(get("classId=c-a1"))).status, 404, "another school's class is not found");
});

test("next roll stays numeric past 999 and denied without students read", async () => {
  const { GET } = await import("../../src/app/api/students/next-roll/route");
  h.pupils.push({ id: "p6", schoolId: "school-a", campusId: "campus-a", classId: "c-a1", rollNo: "GRA-A-999" }, { id: "p7", schoolId: "school-a", campusId: "campus-a", classId: "c-a1", rollNo: "GRA-A-1000" });
  as("SCHOOL_ADMIN", "school-a", "campus-a", "u-a");
  assert.equal((await (await GET(get("classId=c-a1"))).json()).rollNo, "GRA-A-1001");
  as("LIBRARIAN", "school-a", "campus-a", "u-a");
  assert.equal((await GET(get("classId=c-a1"))).status, 403);
});

test("consolidation preview runs counts concurrently and confirm reproduces the same token", async () => {
  const { POST } = await import("../../src/app/api/students/consolidation/route");
  as("SCHOOL_ADMIN", "school-a", "campus-a", "u-a");
  h.pupils.push({ id: "p8", schoolId: "school-a", campusId: "campus-a", classId: "c-a1", rollNo: "GRA-A-020" });
  h.links = { studentEnrollment: 2, studentTimelineEvent: 3 };
  const preview = await (await POST(post({ action: "preview", sourceId: "p1", targetId: "p8" }))).json();
  assert.ok(Object.keys(preview.counts).length > 4, "every Student-linked model is counted");
  assert.equal(preview.counts.studentEnrollment, 2);
  assert.ok(h.peak > 1 && h.peak <= 4, `preview ran ${h.peak} counts at once`);
  assert.deepEqual(preview.blockers, []);

  h.peak = 0;
  let confirmed: unknown = null;
  (prisma as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => unknown) => {
    const tx = new Proxy({}, { get: (_t, name: string) => name === "student" ? { ...(counted as Record<string, object>).student, update: async () => ({}) }
      : ["studentEnrollment", "studentTimelineEvent", "auditLog"].includes(name) ? { ...(counted as Record<string, object>)[name], updateMany: async () => ({}), create: async () => ({}) }
        : (counted as Record<string, unknown>)[name] });
    confirmed = await fn(tx);
    return confirmed;
  };
  const res = await POST(post({ action: "confirm", sourceId: "p1", targetId: "p8", verifiedSourceId: "p1", verifiedTargetId: "p8", reason: "Same child entered twice", token: preview.token }));
  (prisma as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => unknown) => fn(counted);
  assert.equal(res.status, 200, "token from the concurrent preview matches the sequential recheck");
  assert.equal(h.peak, 1, "inside the transaction counts stay sequential");
});

test("consolidation stays scoped to the caller's school and denied to non-authorities", async () => {
  const { POST } = await import("../../src/app/api/students/consolidation/route");
  as("SCHOOL_ADMIN", "school-b", "campus-z", "u-b");
  assert.equal((await POST(post({ action: "preview", sourceId: "p1", targetId: "p9" }))).status, 404);
  as("TEACHER", "school-a", "campus-a", "u-a");
  assert.equal((await POST(post({ action: "preview", sourceId: "p1", targetId: "p8" }))).status, 403);
});
