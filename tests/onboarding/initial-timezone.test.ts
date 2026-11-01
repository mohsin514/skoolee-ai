import assert from "node:assert/strict";
import test from "node:test";
import { initialTimezone, timezoneForCountry, TIMEZONES } from "../../src/app/onboarding/_wizard/helpers";

// SKAI-891: a new setup never silently becomes Asia/Karachi after a non-Pakistan country choice.
test("opening time zone follows the browser, then the chosen country, then UTC", () => {
  const offered = TIMEZONES.map((zone) => zone.value);
  assert.equal(initialTimezone("Europe/London", "SA", offered), "Europe/London");
  assert.equal(initialTimezone("Mars/Base", "KW", offered), "Asia/Kuwait");
  assert.equal(initialTimezone(undefined, "sa", offered), "Asia/Riyadh");
  assert.equal(initialTimezone(undefined, "AE", offered), "Asia/Dubai");
  assert.equal(initialTimezone(undefined, "PK", offered), "Asia/Karachi");
  assert.equal(initialTimezone(undefined, "OTHER", offered), "UTC");
  assert.equal(initialTimezone(undefined, null, offered), "UTC");
  assert.equal(timezoneForCountry("US"), null); // spans zones: the school picks one
  assert.ok(offered.includes("Asia/Kuwait"));
});
