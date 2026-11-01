import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-737: the bulk PDF job announces completion only after every report-card PDF is saved.
test("bulk PDF job notifies staff after the PDFs, not before", () => {
  const source = readFileSync("src/workers/pdf-worker.ts", "utf8");
  const loop = source.indexOf("for (const reportCard of reportCards)");
  const notify = source.indexOf("await notifyReportCardsGenerated({ examId })");
  assert.ok(loop > 0 && notify > loop, "notification must follow the PDF loop");
  assert.equal(source.split("notifyReportCardsGenerated(").length - 1, 1, "exactly one notification call");
});
