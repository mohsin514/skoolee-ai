import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1142: interview/assessment bookings, offer respond-by dates and waitlist order, against an in-memory
// transaction client. Everything is scoped by schoolId, so a second school's rows are never found or moved.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError } });

let actOnAssessment: typeof import("../../src/lib/admissions/assessments").actOnAssessment, moveOnWaitlist: typeof import("../../src/lib/admissions/assessments").moveOnWaitlist;
let nextWaitlistRank: typeof import("../../src/lib/admissions/assessments").nextWaitlistRank, offerDeadline: typeof import("../../src/lib/admissions/assessments").offerDeadline, offerLapsed: typeof import("../../src/lib/admissions/assessments").offerLapsed;
before(async () => ({ actOnAssessment, moveOnWaitlist, nextWaitlistRank, offerDeadline, offerLapsed } = await import("../../src/lib/admissions/assessments")));

type Row = Record<string, any>;
const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, value]) => {
  if (key === "OR") return (value as Row[]).some(clause => matches(row, clause));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("not" in value) return row[key] !== value.not;
    if ("notIn" in value) return !value.notIn.includes(row[key]);
    if ("lt" in value) return row[key] !== null && row[key] < value.lt;
    if ("gt" in value) return row[key] !== null && row[key] > value.gt;
  }
  return row[key] === value;
});
function table(rows: Row[]) {
  return {
    rows,
    findFirst: async ({ where, orderBy }: Row) => {
      const found = rows.filter(row => matches(row, where));
      if (orderBy) { const [[key, dir]] = Object.entries(orderBy) as [string, string][]; found.sort((a, b) => (a[key] - b[key]) * (dir === "asc" ? 1 : -1)); }
      return found[0] ?? null;
    },
    create: async ({ data }: Row) => { const row = { id: `id-${rows.length + 1}`, status: "SCHEDULED", ...data }; rows.push(row); return row; },
    update: async ({ where, data }: Row) => { const row = rows.find(r => r.id === where.id)!; for (const [k, v] of Object.entries(data)) if (!(v && typeof v === "object" && "increment" in (v as Row))) row[k] = v; return row; },
    aggregate: async ({ where }: Row) => ({ _max: { waitlistRank: rows.filter(row => matches(row, where)).reduce<number | null>((max, row) => Math.max(max ?? 0, row.waitlistRank ?? 0), null) } }),
  };
}

const user = { userId: "u-admin", schoolId: "school-a", role: "CAMPUS_ADMIN", campusId: "campus-a" } as never;
let db: Record<string, ReturnType<typeof table>>;
const app = (status: string, extra: Row = {}) => ({ id: "app-1", schoolId: "school-a", campusId: "campus-a", status, waitlistRank: null, offerExpiresAt: null, ...extra }) as never;
const ctx = (application: never, officeNote: string | null = null) => ({ db: db as never, user, campusId: "campus-a", application, officeNote });
const future = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

beforeEach(() => {
  db = {
    admissionAssessment: table([]),
    admissionApplicationEvent: table([]),
    user: table([
      { id: "t-1", schoolId: "school-a", campusId: "campus-a", isActive: true, role: "TEACHER" },
      { id: "t-other", schoolId: "school-b", campusId: "campus-b", isActive: true, role: "TEACHER" },
      { id: "p-1", schoolId: "school-a", campusId: "campus-a", isActive: true, role: "PARENT" },
    ]),
    admissionApplication: table([]),
  };
});

test("books an interview and records it on the history", async () => {
  const booking = await actOnAssessment(ctx(app("UNDER_REVIEW")), "schedule-assessment", { kind: "interview", scheduledAt: future(), durationMin: 45, staffId: "t-1", location: "Room 4" });
  assert.equal(booking.kind, "INTERVIEW");
  assert.equal(booking.schoolId, "school-a");
  assert.equal(db.admissionApplicationEvent.rows[0].kind, "ASSESSMENT_SCHEDULED");
});

test("refuses bookings outside the deciding stages, past dates, bad kinds and durations", async () => {
  await assert.rejects(actOnAssessment(ctx(app("OFFERED")), "schedule-assessment", { kind: "INTERVIEW", scheduledAt: future() }), { status: 409 });
  await assert.rejects(actOnAssessment(ctx(app("SUBMITTED")), "schedule-assessment", { kind: "INTERVIEW", scheduledAt: "2020-01-01T09:00:00Z" }), { status: 400 });
  await assert.rejects(actOnAssessment(ctx(app("SUBMITTED")), "schedule-assessment", { kind: "PICNIC", scheduledAt: future() }), { status: 400 });
  await assert.rejects(actOnAssessment(ctx(app("SUBMITTED")), "schedule-assessment", { kind: "TOUR", scheduledAt: future(), durationMin: 2 }), { status: 400 });
  assert.equal(db.admissionAssessment.rows.length, 0);
});

test("the person running it must be active staff of this school — not another school, not a parent", async () => {
  await assert.rejects(actOnAssessment(ctx(app("SUBMITTED")), "schedule-assessment", { kind: "INTERVIEW", scheduledAt: future(), staffId: "t-other" }), { status: 400 });
  await assert.rejects(actOnAssessment(ctx(app("SUBMITTED")), "schedule-assessment", { kind: "INTERVIEW", scheduledAt: future(), staffId: "p-1" }), { status: 400 });
});

test("records an outcome once; a no-show carries no recommendation", async () => {
  const booking = await actOnAssessment(ctx(app("UNDER_REVIEW")), "schedule-assessment", { kind: "ASSESSMENT", scheduledAt: future() });
  await assert.rejects(actOnAssessment(ctx(app("UNDER_REVIEW")), "record-assessment", { assessmentId: booking.id, recommendation: "MAYBE" }), { status: 400 });
  await assert.rejects(actOnAssessment(ctx(app("UNDER_REVIEW")), "record-assessment", { assessmentId: booking.id, recommendation: "RECOMMEND", score: 140 }), { status: 400 });
  const done = await actOnAssessment(ctx(app("UNDER_REVIEW")), "record-assessment", { assessmentId: booking.id, recommendation: "recommend", score: 82 });
  assert.equal(done.status, "COMPLETED"); assert.equal(done.recommendation, "RECOMMEND"); assert.equal(done.score, 82);
  await assert.rejects(actOnAssessment(ctx(app("UNDER_REVIEW")), "record-assessment", { assessmentId: booking.id, recommendation: "CONSIDER" }), { status: 409 });

  const second = await actOnAssessment(ctx(app("UNDER_REVIEW")), "schedule-assessment", { kind: "TOUR", scheduledAt: future() });
  const missed = await actOnAssessment(ctx(app("UNDER_REVIEW")), "record-assessment", { assessmentId: second.id, attended: false });
  assert.equal(missed.status, "NO_SHOW"); assert.equal(missed.recommendation, null);
});

test("cancelling needs an office note; another school's booking is not found", async () => {
  const booking = await actOnAssessment(ctx(app("UNDER_REVIEW")), "schedule-assessment", { kind: "INTERVIEW", scheduledAt: future() });
  await assert.rejects(actOnAssessment(ctx(app("UNDER_REVIEW")), "cancel-assessment", { assessmentId: booking.id }), { status: 400 });
  assert.equal((await actOnAssessment(ctx(app("UNDER_REVIEW"), "Family asked to move it"), "cancel-assessment", { assessmentId: booking.id })).status, "CANCELLED");
  db.admissionAssessment.rows.push({ id: "foreign", schoolId: "school-b", applicationId: "app-1", status: "SCHEDULED", kind: "INTERVIEW" });
  await assert.rejects(actOnAssessment(ctx(app("UNDER_REVIEW"), "note"), "cancel-assessment", { assessmentId: "foreign" }), { status: 404 });
});

test("offer respond-by date: optional, future, within a year; lapsed only while still offered", () => {
  assert.equal(offerDeadline(undefined), null);
  assert.equal(offerDeadline(""), null);
  assert.throws(() => offerDeadline("2020-01-01"), { status: 400 });
  assert.throws(() => offerDeadline(new Date(Date.now() + 400 * 86_400_000).toISOString()), { status: 400 });
  assert.ok(offerDeadline(future()) instanceof Date);
  const past = new Date(Date.now() - 1000);
  assert.equal(offerLapsed({ status: "OFFERED", offerExpiresAt: past }), true);
  assert.equal(offerLapsed({ status: "ACCEPTED", offerExpiresAt: past }), false);
  assert.equal(offerLapsed({ status: "OFFERED", offerExpiresAt: null }), false);
});

test("waitlist: next place per campus and school; moves swap with the neighbour", async () => {
  db.admissionApplication.rows.push(
    { id: "w1", schoolId: "school-a", campusId: "campus-a", status: "WAITLISTED", waitlistRank: 1 },
    { id: "w2", schoolId: "school-a", campusId: "campus-a", status: "WAITLISTED", waitlistRank: 2 },
    { id: "x9", schoolId: "school-b", campusId: "campus-a", status: "WAITLISTED", waitlistRank: 9 },
  );
  assert.equal(await nextWaitlistRank(db as never, "school-a", "campus-a"), 3);
  assert.equal(await nextWaitlistRank(db as never, "school-c", "campus-a"), 1);

  const w2 = db.admissionApplication.rows[1];
  assert.deepEqual(await moveOnWaitlist(ctx(w2 as never), "up"), { rank: 1, moved: true });
  assert.equal(db.admissionApplication.rows[0].waitlistRank, 2);
  assert.equal(db.admissionApplicationEvent.rows.at(-1)!.kind, "WAITLIST_MOVED");
  assert.deepEqual(await moveOnWaitlist(ctx({ ...w2, waitlistRank: 1 } as never), "up"), { rank: 1, moved: false });
  assert.equal(db.admissionApplication.rows[2].waitlistRank, 9, "another school's waitlist is untouched");
  await assert.rejects(moveOnWaitlist(ctx(app("OFFERED")), "up"), { status: 409 });
  await assert.rejects(moveOnWaitlist(ctx(w2 as never), "sideways"), { status: 400 });
});
