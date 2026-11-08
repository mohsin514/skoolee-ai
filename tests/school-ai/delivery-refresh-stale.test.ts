import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a failed delivery refresh clears the previous delivery rows before showing the error", () => {
  const src = readFileSync("src/components/school-ai/announcement-panel.tsx", "utf8");
  const start = src.indexOf("function AnnouncementDeliveryStatus");
  const body = src.slice(start, src.indexOf("\n}\n", start));
  assert.match(body, /\.catch\(\(\) => \{ if \(!controller\.signal\.aborted\) \{ setResult\(null\); setError\(true\); setLoading\(false\); \} \}/);
});
