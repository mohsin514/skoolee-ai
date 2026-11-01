import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reportRemarkSchema } from "@/lib/validators/schemas";

const command = readFileSync("src/lib/reports/edit-remarks-command.ts", "utf8");

test("SKAI-1491: the remark schema accepts the remarks the editor loaded", () => {
  const parsed = reportRemarkSchema.parse({ remarksEn: "New", expectedRemarks: { remarksEn: "Old", remarksUr: null } });
  assert.deepEqual(parsed.expectedRemarks, { remarksEn: "Old", remarksUr: null });
});

test("SKAI-1491: a save against newer remarks is a 409 before anything is written", () => {
  const check = command.indexOf("if (editing && data.expectedRemarks)");
  assert.ok(check > 0);
  assert.ok(check < command.indexOf("await tx.reportCard.update("), "checked before the update");
  assert.ok(check < command.indexOf("await writeAuditEvent(tx, user, {\n        table: \"report_cards\", recordId: id, action: data.requestCorrection"), "and before the audit row");
  assert.match(command, /throw new ApiError\("Someone saved newer remarks for this report\. Reload to review them before saving\.", 409\)/);
});

test("SKAI-1491: the teacher editor sends its loaded remarks", () => {
  const page = readFileSync("src/app/teacher/reports/page.tsx", "utf8");
  assert.match(page, /expectedRemarks: \{ remarksEn: selectedReportCard\.remarksEn \?\? null, remarksUr: selectedReportCard\.remarksUr \?\? null \}/);
});
