import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1678: Confirm resolved follows the server's requester rule, so agent-requesters can confirm their own requests.
const service = readFileSync("src/lib/service-desk/service.ts", "utf8");
const ui = readFileSync("src/components/service-desk/service-desk.tsx", "utf8");

test("the request view reports whether the caller is the requester", () => {
  assert.match(service, /agent, isRequester: req\.requesterId === user\.userId, watchers:/);
  assert.match(service, /if \(req\.requesterId !== user\.userId\) throw new ApiError\("Only the requester confirms the work\.", 403\);/);
});

test("Confirm resolved renders for the requester, not for every non-agent", () => {
  assert.match(ui, /open\.status === "RESOLVED" && \(open\.isRequester \?\? !open\.agent\) \? <Button disabled=\{busy\} onClick=\{\(\) => void act\(\{ action: "confirm"/);
  assert.doesNotMatch(ui, /open\.status === "RESOLVED" && !open\.agent \? <Button disabled=\{busy\} onClick=\{\(\) => void act\(\{ action: "confirm"/);
});
