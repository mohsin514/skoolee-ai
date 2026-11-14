import assert from "node:assert/strict";
import { test } from "node:test";
import { utcInstant } from "../../src/lib/auth/request-auth";

// SKAI-1971 follow-up: the session-expiry and exam-deadline comparisons in the one-read proxy check must not depend
// on the database session's time zone. The pg driver adapter sends a Date without an offset, which `::timestamptz`
// reads in the session zone (Asia/Karachi: 07:00Z became 02:00, so learners stayed locked after the deadline and
// expired sessions stayed live; a negative offset would release learners early). The instant goes over as ISO + "Z".
test("the raw UTC instant is sent as an ISO string carrying its Z offset, not as a zoneless Date", () => {
  const at = new Date("2026-11-14T07:00:00.000Z");
  const fragment = utcInstant(at);
  assert.deepEqual(fragment.values, ["2026-11-14T07:00:00.000Z"]);
  assert.equal(typeof fragment.values[0], "string");
  assert.match(fragment.sql, /::timestamptz AT TIME ZONE 'UTC'/);
});

test("every instant round-trips exactly, including sub-second precision", () => {
  for (const iso of ["2026-01-01T00:00:00.000Z", "2026-11-14T23:59:59.999Z", "2027-06-30T12:34:56.789Z"]) {
    assert.equal(utcInstant(new Date(iso)).values[0], iso);
  }
});
