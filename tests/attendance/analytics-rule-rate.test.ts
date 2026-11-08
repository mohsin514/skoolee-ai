import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_ATTENDANCE_RULE, groupedRuleRate, ruleRate } from "@/lib/attendance";

// SKAI-1604: the analytics attendance rate uses the published counting rule.
const five = ["PRESENT", "LATE", "PARTIAL", "LEAVE", "EXCUSED"];

test("default rule over the five attended statuses gives 100%, matching ruleRate", () => {
  const groups = five.map((status) => ({ status, count: 1 }));
  assert.equal(groupedRuleRate(groups, DEFAULT_ATTENDANCE_RULE), 100);
  assert.equal(ruleRate(five.map((status) => ({ status })), DEFAULT_ATTENDANCE_RULE), 100);
});

test("a custom rule changes the rate and excluded statuses leave the denominator", () => {
  const rule = { version: 2, attended: ["PRESENT"], excluded: ["EXCUSED"] };
  assert.equal(groupedRuleRate([{ status: "PRESENT", count: 3 }, { status: "ABSENT", count: 1 }, { status: "EXCUSED", count: 4 }], rule), 75);
  assert.equal(groupedRuleRate([{ status: "EXCUSED", count: 2 }], rule), null);
  assert.equal(groupedRuleRate([], rule), null);
});

test("the analytics route uses the school's rule, not PRESENT only", () => {
  const src = readFileSync("src/app/api/analytics/route.ts", "utf8");
  assert.match(src, /const attendanceRate = groupedRuleRate\([^;]+, await attendanceRuleFor\(user\.schoolId\)\);/);
  assert.doesNotMatch(src, /a\.status === "PRESENT"\)\?\._count/);
});
