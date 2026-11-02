import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { announcementChannelCopy } from "../../src/components/school-ai/announcement-channel-copy";

const panel = readFileSync("src/components/school-ai/announcement-preferences-panel.tsx", "utf8");

test("guardian Stop asks for confirmation before posting the withdrawal", () => {
  assert.match(panel, /onClick=\{\(\) => setConfirming\(value\)\}>\{t\.stop\}/);
  assert.doesNotMatch(panel, /onClick=\{\(\) => void save\(value\)\}>\{t\.stop\}/);
  assert.match(panel, /setConfirming\(null\)\}>\{t\.keepChannel\}/);
});

test("confirmation names the channel and the school-action consequence in EN/AR/UR", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const t = announcementChannelCopy(language);
    assert.match(t.confirmStop, /\{0\}/);
    assert.match(t.confirmStopAction, /\{0\}/);
    assert.ok(t.keepChannel.length > 0);
  }
  assert.match(announcementChannelCopy("en").confirmStop, /school must verify your contact and record consent again/);
});
