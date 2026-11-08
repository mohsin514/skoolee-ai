import assert from "node:assert/strict";
import test from "node:test";
import { assertExamSessionTransition } from "../../src/lib/academic/exam-session-transition";
import { ApiError } from "../../src/lib/api/scope";

// SKAI-1306: readiness is counted only inside the caller's campus (school A/campus A vs school B/campus B).
type Data = { exams: number; schedules: { rooms: number; seats: number }[]; marks: number };
function fakeDb(byCampus: Record<string, Data>) {
  const get = (c: string) => byCampus[c] ?? { exams: 0, schedules: [], marks: 0 };
  return {
    exam: { count: async (a: { where: { campusId: string } }) => get(a.where.campusId).exams },
    examSchedule: { findMany: async (a: { where: { campusId: string } }) => get(a.where.campusId).schedules.map((s) => ({ _count: s })) },
    mark: { count: async (a: { where: { campusId: string } }) => get(a.where.campusId).marks },
  } as never;
}
const is409 = (msg: RegExp) => (e: unknown) => e instanceof ApiError && e.status === 409 && msg.test(e.message);
const ready: Data = { exams: 1, schedules: [{ rooms: 1, seats: 30 }], marks: 5 };
const empty: Data = { exams: 1, schedules: [], marks: 0 };

test("an empty session cannot advance past PLANNING", async () => {
  const db = fakeDb({ campusA: empty });
  await assert.rejects(() => assertExamSessionTransition(db, "campusA", "s", "PLANNING", "SCHEDULED"), is409(/Schedule at least one paper/));
});

test("another school's ready data does not satisfy this campus", async () => {
  const db = fakeDb({ campusA: empty, campusB: ready });
  await assert.rejects(() => assertExamSessionTransition(db, "campusA", "s", "SCHEDULED", "SEATED"), is409(/room and seat/));
  await assert.rejects(() => assertExamSessionTransition(db, "campusA", "s", "RUNNING", "COMPLETED"), is409(/Enter marks/));
  await assertExamSessionTransition(db, "campusB", "s", "SCHEDULED", "SEATED");
});

test("a ready session walks the full lifecycle", async () => {
  const db = fakeDb({ campusA: ready });
  const steps = ["PLANNING", "SCHEDULED", "SEATED", "RUNNING", "COMPLETED"];
  for (let i = 0; i < steps.length - 1; i++) await assertExamSessionTransition(db, "campusA", "s", steps[i], steps[i + 1]);
});

test("jumps and reversals are refused; COMPLETED is terminal with a clear message", async () => {
  const db = fakeDb({ campusA: ready });
  await assert.rejects(() => assertExamSessionTransition(db, "campusA", "s", "PLANNING", "COMPLETED"), is409(/can only move to SCHEDULED/));
  await assert.rejects(() => assertExamSessionTransition(db, "campusA", "s", "COMPLETED", "PLANNING"), is409(/completed and cannot change/));
});
