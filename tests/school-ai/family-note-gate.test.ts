import assert from "node:assert/strict";
import { test } from "node:test";
import type { TxClient } from "../../src/lib/db/prisma";
import { familyNoteGates } from "../../src/lib/school-ai/family-note-service";

function fixture(options: { scheduleExists?: boolean; onRelease?: boolean; published?: string[] } = {}) {
  const queries: Array<{ table: string; args: unknown }> = [];
  const model = (table: string, result: unknown) => async (args: unknown) => { queries.push({ table, args }); return result; };
  const tx = {
    examSchedule: { findFirst: model("schedule", options.scheduleExists === false ? null : { examId: "formal-exam" }) },
    examPaperSlot: { findFirst: model("slot", { examSession: { familyNotesOnRelease: !!options.onRelease } }) },
    exam: { findFirst: model("exam", { session: { familyNotesOnRelease: !!options.onRelease } }) },
    reportCard: { findMany: model("report", (options.published ?? []).map(studentId => ({ studentId }))) },
  } as unknown as TxClient;
  return { tx, queries };
}

test("a scheduled sitting opens notes for only the published learner without requiring a gradebook export", async () => {
  const { tx, queries } = fixture({ published: ["s1"] });
  const gates = await familyNoteGates(tx, { schoolId: "school", paperSlotId: "slot", examScheduleId: "schedule", gradebookPublication: null }, ["s1", "s2"]);
  assert.deepEqual([...gates], [["s1", "OPEN"], ["s2", "WAITING_FOR_REPORT_CARD"]]);
  assert.deepEqual(queries.find(query => query.table === "schedule")?.args, { where: { id: "schedule", schoolId: "school" }, select: { examId: true } });
  const report = queries.find(query => query.table === "report")?.args as { where: { schoolId: string; examId: string; studentId: unknown } };
  assert.equal(report.where.examId, "formal-exam");
  assert.equal(report.where.schoolId, "school");
  assert.deepEqual(report.where.studentId, { in: ["s1", "s2"] });
});

test("classroom notes open on release while a broken formal schedule fails closed", async () => {
  const { tx } = fixture({ scheduleExists: false });
  assert.equal((await familyNoteGates(tx, { schoolId: "school", paperSlotId: null, gradebookPublication: null }, ["s1"])).get("s1"), "OPEN");
  assert.equal((await familyNoteGates(tx, { schoolId: "school", paperSlotId: null, examScheduleId: "missing", gradebookPublication: null }, ["s1"])).get("s1"), "WAITING_FOR_REPORT_CARD");
});

test("an explicit formal-session release policy opens notes before report publication", async () => {
  const { tx, queries } = fixture({ onRelease: true });
  const gates = await familyNoteGates(tx, { schoolId: "school", paperSlotId: "slot", examScheduleId: "schedule", gradebookPublication: null }, ["s1"]);
  assert.equal(gates.get("s1"), "OPEN");
  assert.equal(queries.some(query => query.table === "report"), false);
});
