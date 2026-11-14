import { test } from "node:test";
import assert from "node:assert/strict";
import { dropTypesFor, fileMatchesAccept } from "../../src/lib/drop/client";

// SKAI-1848: the phone may only send what the page's own file input accepts.
test("phone types follow the input's accept list", () => {
  assert.deepEqual(dropTypesFor("image/*"), ["image/jpeg", "image/png", "image/webp"]);
  assert.deepEqual(dropTypesFor(".pdf,.jpg"), ["image/jpeg", "application/pdf"]);
  assert.deepEqual(dropTypesFor("application/pdf,image/png"), ["image/png", "application/pdf"]);
  assert.deepEqual(dropTypesFor("audio/*"), []);
  assert.equal(dropTypesFor("").length, 8);
});

test("dropped, pasted and phone files are checked against accept", () => {
  assert.equal(fileMatchesAccept({ name: "Scan.JPG", type: "image/jpeg" }, "image/*"), true);
  assert.equal(fileMatchesAccept({ name: "notes.pdf", type: "application/pdf" }, "image/*"), false);
  assert.equal(fileMatchesAccept({ name: "notes.pdf", type: "" }, ".pdf,.docx"), true);
  assert.equal(fileMatchesAccept({ name: "evil.svg", type: "image/svg+xml" }, "image/png,image/jpeg"), false);
  assert.equal(fileMatchesAccept({ name: "anything.bin", type: "" }, ""), true);
});

// SKAI-1980: the computer polls every 1.5 s while pages arrive, then backs off to at most 5 s.
test("phone handoff poll backs off while idle and resets when a page arrives", async () => {
  const { DROP_POLL_MAX_MS, DROP_POLL_MIN_MS, nextDropPollDelay } = await import("../../src/lib/drop/client");
  const idle: number[] = [];
  let delay = DROP_POLL_MIN_MS;
  for (let i = 0; i < 5; i++) idle.push(delay = nextDropPollDelay(delay, false));
  assert.deepEqual(idle, [3000, 5000, 5000, 5000, 5000]);
  assert.ok(idle.every(value => value <= DROP_POLL_MAX_MS), "a phone page is never more than 5 s late");
  assert.equal(nextDropPollDelay(DROP_POLL_MAX_MS, true), DROP_POLL_MIN_MS);
  assert.equal(nextDropPollDelay(0, false), 3000);
});
