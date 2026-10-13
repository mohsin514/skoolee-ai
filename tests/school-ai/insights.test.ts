import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewInsights } from "../../src/lib/school-ai/insights";
const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
test("review observations use the first approval, retain an empty denominator and count only prior saves", () => {
 const result = reviewInsights([{kind:"SOURCE",createdAt:at(0),revisions:[{action:"CREATE",createdAt:at(0)},{action:"SAVE",createdAt:at(1)},{action:"APPROVE",createdAt:at(4)},{action:"SAVE",createdAt:at(5)},{action:"APPROVE",createdAt:at(6)}]},{kind:"SOURCE",createdAt:at(0),revisions:[{action:"APPROVE",createdAt:at(10)}]},{kind:"PAPER",createdAt:at(1),revisions:[]}]);
 assert.deepEqual(result[1], {kind:"SOURCE",records:2,approved:2,medianElapsedMinutes:7,meanSavesBeforeApproval:.5});assert.equal(result[2].medianElapsedMinutes,null);assert.equal(result[0].meanSavesBeforeApproval,null);
});
test("invalid backwards approval dates do not fabricate speed improvements",()=>{assert.equal(reviewInsights([{kind:"ONBOARDING",createdAt:at(10),revisions:[{action:"APPROVE",createdAt:at(0)}]}])[0].approved,0);});
