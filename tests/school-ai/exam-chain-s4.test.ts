import assert from "node:assert/strict";
import { test } from "node:test";
import { boardState, BOARD_UNSAVED_SECONDS, TEACHER_EXTEND_LIMIT_MINUTES, MANAGER_EXTEND_LIMIT_MINUTES } from "../../src/lib/school-ai/control-room-service";

const now = new Date("2026-10-31T09:30:00.000Z");
const at = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const later = new Date(now.getTime() + 600_000);

test("board state: not started, saved, unsaved after two minutes, paused, submitted, time over", () => {
  assert.equal(boardState(null, now), "NOT_STARTED");
  assert.equal(boardState({ status: "IN_PROGRESS", pausedAt: null, deadlineAt: later, updatedAt: at(30) }, now), "SAVED");
  assert.equal(boardState({ status: "IN_PROGRESS", pausedAt: null, deadlineAt: later, updatedAt: at(BOARD_UNSAVED_SECONDS + 1) }, now), "UNSAVED");
  assert.equal(boardState({ status: "IN_PROGRESS", pausedAt: at(60), deadlineAt: at(5), updatedAt: at(400) }, now), "PAUSED", "a paused attempt past its old deadline is still paused, never expired");
  assert.equal(boardState({ status: "SUBMITTED", pausedAt: null, deadlineAt: later, updatedAt: at(10) }, now), "SUBMITTED");
  assert.equal(boardState({ status: "IN_PROGRESS", pausedAt: null, deadlineAt: at(1), updatedAt: at(10) }, now), "EXPIRED");
  assert.ok(TEACHER_EXTEND_LIMIT_MINUTES === 15 && MANAGER_EXTEND_LIMIT_MINUTES === 60);
});
