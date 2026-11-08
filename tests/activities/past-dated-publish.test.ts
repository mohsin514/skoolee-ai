import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

// SKAI-1712: an activity that has already ended is refused (400) instead of publishing to no family;
// every activity that does publish passes the family listing's endsAt > now filter.
const HOUR = 3_600_000;
type Row = { id: string; schoolId: string; campusId: string; status: string; startsAt: Date; endsAt: Date; capacity: number; classIds: string[] };
const rows: Row[] = [];
const prisma = {
  activity: {
    create: async ({ data }: { data: Omit<Row, "id" | "status"> }) => { const row = { ...data, id: `act-${rows.length + 1}`, status: "PUBLISHED" }; rows.push(row); return row; },
    findMany: async ({ where }: { where: { schoolId: string; campusId: string; status: string; endsAt: { gt: Date } } }) =>
      rows.filter((r) => r.schoolId === where.schoolId && r.campusId === where.campusId && r.status === where.status && r.endsAt > where.endsAt.gt),
  },
  class: { count: async () => 0 },
  trip: { count: async () => 0 },
  // SKAI-601: createActivity runs in a transaction with a replay lookup; nothing here repeats a create.
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ activity: { ...prisma.activity, findFirst: async () => null }, $executeRaw: async () => 0 }),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ currency: "PKR", timezone: "Asia/Karachi" }) } });

const coordinator = (school: "a" | "b") => ({ userId: `teacher-${school}`, role: "TEACHER", schoolId: `school-${school}`, campusId: `campus-${school}` }) as never;
const body = (endsInHours: number) => ({
  kind: "CLUB", title: "Synthetic chess club", location: "Room 4", cancellationTerms: "Full refund before the first session.", capacity: 10,
  startsAt: new Date(Date.now() + (endsInHours - 2) * HOUR).toISOString(), endsAt: new Date(Date.now() + endsInHours * HOUR).toISOString(),
});
const create = async (user: never, b: Record<string, unknown>) => (await import("../../src/lib/activities/service")).createActivity(user, b);

beforeEach(() => { rows.length = 0; });

test("an activity that ended yesterday is refused with 400 and nothing is published", async () => {
  await assert.rejects(create(coordinator("a"), body(-24)), { status: 400, message: /already ended/ });
  await assert.rejects(create(coordinator("a"), body(-0.01)), { status: 400 });
  assert.equal(rows.length, 0);
});

test("an activity later today publishes", async () => {
  const row = await create(coordinator("a"), body(1));
  assert.equal(row.status, "PUBLISHED");
});

test("two schools each publish to their own campus, and every published activity passes the family filter", async () => {
  await create(coordinator("a"), body(6));
  await create(coordinator("b"), body(6));
  assert.deepEqual(rows.map((r) => [r.schoolId, r.campusId]), [["school-a", "campus-a"], ["school-b", "campus-b"]]);
  // familyActivities lists PUBLISHED rows of the child's school and campus with endsAt > now.
  const listed = await prisma.activity.findMany({ where: { schoolId: "school-a", campusId: "campus-a", status: "PUBLISHED", endsAt: { gt: new Date() } } });
  assert.deepEqual(listed.map((r) => r.id), [rows[0].id]);
});

test("roles that do not publish are refused with 403", async () => {
  await assert.rejects(create({ ...(coordinator("a") as object), role: "PARENT" } as never, body(6)), { status: 403 });
  await assert.rejects(create({ ...(coordinator("a") as object), role: "PRINCIPAL" } as never, body(6)), { status: 403 });
});
