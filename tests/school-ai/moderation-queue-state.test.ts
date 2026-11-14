// SKAI-1456: the moderation queue distinguishes loading, failed and loaded states. A failed read is never an empty
// queue, a refresh that fails keeps the last loaded papers, a denied role sees no queue, and every new string has
// English, Arabic and Urdu copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { failureForStatus, requestFailure } from "../../src/lib/http/request-state";
import { STUDIO_SLOTS_COPY } from "../../src/lib/school-ai/exam-studio-copy-slots";

const queue = readFileSync("src/components/school-ai/exam-studio/moderation-queue.tsx", "utf8");
const NEW_KEYS = ["moderateLoading", "moderateRefreshFailed", "moderateRetry"] as const;

test("an unauthorised or forbidden read is a session or access state, not an empty list", () => {
  assert.equal(failureForStatus(401), "session");
  assert.equal(failureForStatus(403), "denied");
  assert.equal(failureForStatus(500), "server");
});

test("a network failure is classified as a failure, not as an empty queue", () => {
  assert.equal(requestFailure(new TypeError("fetch failed")).kind, "offline");
});

test("the queue never maps a failed read to an empty list or hides itself on failure", () => {
  assert.doesNotMatch(queue, /\?\s*payload\s*:\s*\[\]/u, "no empty-list fallback on failure");
  assert.doesNotMatch(queue, /\.catch\(\(\) => null\)/u, "no null fallback on failure");
  assert.match(queue, /queueView\(\{ slots, failure \}\)/u, "the queue decides its view from the pure state");
  assert.match(queue, /view === "denied" \|\| view === "hidden"\) return null;/u, "a denied role or a valid empty list sees no queue");
});

test("a refresh failure keeps the last loaded papers and offers an accessible retry", () => {
  assert.match(queue, /data-queue-refresh-failed/u);
  assert.match(queue, /role="alert"/u);
  assert.match(queue, /onClick=\{\(\) => void load\(\)\}/u);
  assert.match(queue, /<ul className="grid gap-2 md:grid-cols-2">/u, "the list still renders after a refresh failure");
});

test("an initial failure shows the error state with retry", () => {
  assert.match(queue, /<ErrorState error=\{failure\} onRetry=\{load\} variant="panel" \/>/u);
  assert.match(queue, /data-queue-state="failed"/u);
});

test("every new string has English, Arabic and Urdu copy", () => {
  for (const key of NEW_KEYS) {
    for (const language of ["en", "ar", "ur"] as const) {
      const copy = STUDIO_SLOTS_COPY[language] as Record<string, string>;
      assert.equal(typeof copy[key], "string", `${language}.${key}`);
      assert.ok(copy[key].length > 0, `${language}.${key} is not empty`);
    }
  }
});
