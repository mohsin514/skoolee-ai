import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1662: a failed staff-record load shows Retry, not empty-history copy, and blocks uploads.
const source = readFileSync("src/components/shared-admin/index.tsx", "utf8");

test("non-OK, unsuccessful and rejected loads mark the record failed", () => {
  assert.match(source, /if \(!res\.ok \|\| !json\.success\) \{ setStaffRecordsState\("failed"\); return; \}/);
  assert.match(source, /\} catch \{\n\s+setStaffRecordsState\("failed"\);/);
});

test("empty states only render after a successful load, and upload waits for it", () => {
  assert.match(source, /staffDocs\.length === 0 && staffRecordsState === "loaded"/);
  assert.match(source, /staffTimeline\.length === 0 && staffRecordsState === "loaded"/);
  assert.match(source, /disabled=\{staffRecordsState !== "loaded"\} onClick=\{\(\) => fileInput\.current\?\.click\(\)\}/);
  assert.match(source, /data-staff-records-failed>.*onClick=\{\(\) => void loadStaffRecords\(\)\}/);
});
