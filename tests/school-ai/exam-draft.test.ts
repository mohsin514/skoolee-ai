import assert from "node:assert/strict";
import { test } from "node:test";
import { answerStatus, changedQuestions, readDraft, reconcileDraft, retryDelay, writeDraft, type LocalDraft } from "../../src/lib/school-ai/exam-draft";

// SKO-411: honest save state and safe recovery of unsent edits.
const attempt = { id: "att-1", sequence: 4, status: "IN_PROGRESS", responses: { q1: "a1", q2: "Old answer" } };
const draft = (baseSequence: number, responses: Record<string, string>): LocalDraft => ({ attemptId: "att-1", baseSequence, responses, savedAt: "2026-10-17T05:00:00Z" });

test("an answer is confirmed only when the server holds it; otherwise pending while saving and failed after an error", () => {
  assert.equal(answerStatus("a1", "a1", { saving: false, failed: false }), "CONFIRMED");
  assert.equal(answerStatus(" a1 ", "a1", { saving: false, failed: false }), "CONFIRMED", "whitespace does not make a saved answer look unsaved");
  assert.equal(answerStatus("a2", "a1", { saving: true, failed: false }), "PENDING");
  assert.equal(answerStatus("a2", "a1", { saving: false, failed: true }), "FAILED");
  assert.equal(answerStatus("a2", "a1", { saving: true, failed: true }), "PENDING", "a retry in flight is pending, not failed");
  assert.equal(answerStatus("", undefined, { saving: false, failed: false }), "EMPTY");
});

test("a draft against the current server version is restorable; an older one is never applied over newer saved work", () => {
  assert.deepEqual(reconcileDraft(draft(4, { q1: "a1", q2: "New answer" }), attempt), { kind: "RESTORABLE", changed: ["q2"] });
  assert.deepEqual(reconcileDraft(draft(3, { q1: "a2", q2: "Old answer" }), attempt), { kind: "OUTDATED", changed: ["q1"] });
  assert.deepEqual(reconcileDraft(draft(4, attempt.responses), attempt), { kind: "NONE" }, "an identical draft is nothing to restore");
  assert.deepEqual(reconcileDraft(draft(4, { q1: "a9" }), { ...attempt, status: "SUBMITTED" }), { kind: "NONE" }, "a finished attempt never takes local edits");
  assert.deepEqual(reconcileDraft({ ...draft(4, { q1: "a9" }), attemptId: "other" }, attempt), { kind: "NONE" }, "another attempt's draft is ignored");
  assert.deepEqual(changedQuestions({ q1: "x", q3: "y" }, { q1: "x", q2: "z" }), ["q2", "q3"]);
});

test("draft storage tolerates blocked or corrupt storage, and retries back off with a cap", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
  writeDraft(storage, draft(4, { q2: "x" }), "att-1");
  assert.equal(readDraft(storage, "att-1")?.baseSequence, 4);
  writeDraft(storage, null, "att-1");
  assert.equal(readDraft(storage, "att-1"), null);
  store.set("skoolee:exam-draft:att-1", "{not json");
  assert.equal(readDraft(storage, "att-1"), null);
  const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => { throw new Error("SecurityError"); } };
  assert.equal(readDraft(blocked, "att-1"), null);
  assert.doesNotThrow(() => writeDraft(blocked, draft(4, {}), "att-1"));
  assert.deepEqual([0, 1, 2, 3, 10].map(retryDelay), [2000, 4000, 8000, 16000, 30000]);
});
