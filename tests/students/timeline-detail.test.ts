import { test } from "node:test";
import assert from "node:assert/strict";
import { readableTimelineDetail } from "../../src/lib/students/timeline-detail";

// SKAI-65: a fee payment on the student timeline reads as money, never as "USD 10000 minor units".
const money = (minor: number, currency: string) => `${currency}:${minor}`;

test("a stored payment amount in minor units is shown through the money formatter", () => {
  assert.equal(readableTimelineDetail("USD 10000 minor units", money), "USD:10000");
  assert.equal(readableTimelineDetail("PKR 0 minor units", money), "PKR:0");
});

test("other details are shown unchanged", () => {
  assert.equal(readableTimelineDetail("Class Grade 7 - A · Roll 1", money), "Class Grade 7 - A · Roll 1");
  assert.equal(readableTimelineDetail("We paid USD 10000 minor units twice", money), "We paid USD 10000 minor units twice", "only the whole stored shape is rewritten");
});
