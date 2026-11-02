import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Win = { id: string; schoolId: string; campusId: string; teacherId: string; localDate: string; startTime: string; endTime: string; status: string };
let windows: Win[] = [];
let seq = 0;

const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise((r) => setTimeout(r, 5));
const matches = (w: Win, where: Partial<Win>) => Object.entries(where).every(([k, v]) => (w as unknown as Record<string, unknown>)[k] === v);

function fakeTx(held: Array<() => void>) {
  return {
    $queryRaw: async (_s: TemplateStringsArray, teacherId: unknown) => {
      held.push(await acquire(`teacher:${teacherId}`));
      return [];
    },
    meetingWindow: {
      findFirst: async ({ where }: { where: Partial<Win> }) => {
        await pause();
        return windows.find((w) => matches(w, where)) ?? null;
      },
      create: async ({ data }: { data: Omit<Win, "id"> & Record<string, unknown> }) => {
        await pause();
        const row = { id: `mw-${++seq}`, status: "OPEN", ...data } as Win; // status defaults to OPEN in the database
        windows.push(row);
        return row;
      },
    },
  };
}

const fakePrisma = {
  meetingWindow: fakeTx([]).meetingWindow,
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeTx(held)); } finally { held.forEach((r) => r()); }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });
mock.module("@/lib/datetime", { namedExports: { calendarDateIn: () => "2026-01-01" } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ timezone: "Asia/Karachi" }) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async () => true } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => fakePrisma.$transaction(fn) } });

const loadService = () => import("@/lib/meetings/service");
const teacher = (userId = "t-1", schoolId = "school-a", campusId = "campus-a") => ({ userId, role: "TEACHER", schoolId, campusId }) as never;
const body = (over: Record<string, unknown> = {}) => ({ localDate: "2026-06-10", startTime: "09:00", endTime: "10:00", slotMinutes: 15, location: "Room 4", cancellationPolicy: "Tell us 24 hours ahead.", mode: "IN_PERSON", ...over });

test("a retried identical create returns the window it already made and creates no second one", async () => {
  windows = []; seq = 0;
  const { createWindow } = await loadService();
  const first = await createWindow(teacher(), body());
  const retry = await createWindow(teacher(), body());
  assert.equal(retry.id, first.id);
  assert.equal(windows.length, 1);
});

test("two simultaneous identical creates produce one window", async () => {
  windows = []; seq = 0;
  const { createWindow } = await loadService();
  const [a, b] = await Promise.all([createWindow(teacher(), body()), createWindow(teacher(), body())]);
  assert.equal(a.id, b.id);
  assert.equal(windows.length, 1);
});

test("a different time on the same day is a separate, deliberate window", async () => {
  windows = []; seq = 0;
  const { createWindow } = await loadService();
  await createWindow(teacher(), body());
  await createWindow(teacher(), body({ startTime: "11:00", endTime: "12:00" }));
  assert.equal(windows.length, 2);
});

test("another teacher with the same slot gets their own window", async () => {
  windows = []; seq = 0;
  const { createWindow } = await loadService();
  await createWindow(teacher("t-1"), body());
  await createWindow(teacher("t-2"), body());
  assert.equal(windows.length, 2);
});

test("a withdrawn window does not block a new one at the same slot", async () => {
  windows = []; seq = 0;
  const { createWindow } = await loadService();
  const first = await createWindow(teacher(), body());
  windows.find((w) => w.id === first.id)!.status = "WITHDRAWN";
  const again = await createWindow(teacher(), body());
  assert.notEqual(again.id, first.id);
  assert.equal(windows.filter((w) => w.status === "OPEN").length, 1);
});
