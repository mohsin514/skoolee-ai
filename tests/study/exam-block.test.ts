import test from "node:test";
import assert from "node:assert/strict";
import { examBlock } from "../../src/lib/study/assistant";

const now = new Date("2026-11-05T10:00:00Z");
const later = new Date("2026-11-05T11:00:00Z");

test("SKAI-830: a failing exam lookup blocks the assistant (fail closed)", async () => {
  assert.deepEqual(await examBlock(async () => { throw new Error("db down"); }, now), { title: "", href: "/ai/exams" });
});

test("an in-progress, unexpired attempt blocks with its exam link", async () => {
  assert.deepEqual(await examBlock(async () => [{ id: "e1", title: "Maths", endsAt: later, attempts: [{ status: "IN_PROGRESS" }] }], now), { title: "Maths", href: "/ai/exams/e1" });
});

test("no live attempt leaves the assistant open", async () => {
  assert.equal(await examBlock(async () => [{ id: "e1", title: "Maths", endsAt: later, attempts: [{ status: "SUBMITTED" }] }, { id: "e2", title: "Old", endsAt: new Date("2026-11-05T09:00:00Z"), attempts: [{ status: "IN_PROGRESS" }] }], now), null);
});
