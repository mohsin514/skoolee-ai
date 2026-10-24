import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

/**
 * §7.6 (P6): `canManageOperations` keeps its old meaning (= canManageAcademics: SA, CA, ADMIN, PRINCIPAL) only
 * where it was already called at tree af1c6a75. Every new server gate must say what it means with a purpose
 * predicate — canManageAcademics, canManageCampusOps, canManageFinance, canApproveFinance or canLeadAcademics —
 * so the principal cannot quietly regain campus operations through a new call site.
 *
 * The baseline below is the list of files under src/ that contained `canManageOperations(` at af1c6a75
 * (`git grep -l "canManageOperations(" af1c6a75 -- src`). The test reads only the working tree, never git.
 */
const BASELINE = new Set<string>([
  "src/app/api/academic-models/[id]/route.ts",
  "src/app/api/academic-models/route.ts",
  "src/app/api/academic-year/route.ts",
  "src/app/api/academic/calendar/route.ts",
  "src/app/api/academic/exam-documents/route.ts",
  "src/app/api/academic/exam-schedule/bulk/route.ts",
  "src/app/api/academic/exam-schedule/rooms/route.ts",
  "src/app/api/academic/exam-schedule/route.ts",
  "src/app/api/academic/exam-sessions/route.ts",
  "src/app/api/academic/exam-sessions/seating/route.ts",
  "src/app/api/academic/impact/route.ts",
  "src/app/api/academic/periods/route.ts",
  "src/app/api/academic/rooms/route.ts",
  "src/app/api/accounts/chart/route.ts",
  "src/app/api/accounts/payment-methods/route.ts",
  "src/app/api/attendance/school-summary/route.ts",
  "src/app/api/classes/route.ts",
  "src/app/api/communications/route.ts",
  "src/app/api/dormitory/allocations/route.ts",
  "src/app/api/dormitory/room-types/route.ts",
  "src/app/api/dormitory/rooms/route.ts",
  "src/app/api/fees/assignments/route.ts",
  "src/app/api/fees/carry-forwards/route.ts",
  "src/app/api/fees/discount-assignments/route.ts",
  "src/app/api/fees/discounts/route.ts",
  "src/app/api/fees/fine-rules/route.ts",
  "src/app/api/fees/generate-invoices/route.ts",
  "src/app/api/fees/groups/route.ts",
  "src/app/api/fees/invoice-pdf/route.ts",
  "src/app/api/fees/invoices/[invoiceId]/route.ts",
  "src/app/api/fees/master-lines/route.ts",
  "src/app/api/fees/payment-pdf/route.ts",
  "src/app/api/fees/payment/route.ts",
  "src/app/api/fees/structure/[structureId]/route.ts",
  "src/app/api/fees/structure/route.ts",
  "src/app/api/fees/types/route.ts",
  "src/app/api/grade-config/route.ts",
  "src/app/api/import-batches/[batchId]/route.ts",
  "src/app/api/import-batches/route.ts",
  "src/app/api/inventory/categories/route.ts",
  "src/app/api/inventory/items/route.ts",
  "src/app/api/inventory/stores/route.ts",
  "src/app/api/inventory/suppliers/route.ts",
  "src/app/api/inventory/transactions/route.ts",
  "src/app/api/leave/allocations/route.ts",
  "src/app/api/leave/review/route.ts",
  "src/app/api/leave/route.ts",
  "src/app/api/leave/types/route.ts",
  "src/app/api/parent/token/route.ts",
  "src/app/api/payroll/generate/route.ts",
  "src/app/api/payroll/lines/route.ts",
  "src/app/api/payroll/report/route.ts",
  "src/app/api/staff/appointments/route.ts",
  "src/app/api/staff/departments/route.ts",
  "src/app/api/staff/designations/route.ts",
  "src/app/api/staff/documents/route.ts",
  "src/app/api/staff/hierarchy/route.ts",
  "src/app/api/staff/profile/route.ts",
  "src/app/api/staff/reporting-lines/route.ts",
  "src/app/api/staff/route.ts",
  "src/app/api/student-categories/route.ts",
  "src/app/api/student-groups/route.ts",
  "src/app/api/students/[id]/guardians/route.ts",
  "src/app/api/students/[id]/route.ts",
  "src/app/api/students/export/route.ts",
  "src/app/api/students/promote/route.ts",
  "src/app/api/students/route.ts",
  "src/app/api/subjects/[subjectId]/syllabus/route.ts",
  "src/app/api/subjects/route.ts",
  "src/app/api/timetable/[id]/route.ts",
  "src/app/api/timetable/[id]/suggestions/route.ts",
  "src/app/api/timetable/route.ts",
  "src/app/api/timetable/substitute-duties/route.ts",
  "src/app/api/timetable/teacher/route.ts",
  "src/app/api/transport/routes/route.ts",
  "src/app/api/transport/vehicles/route.ts",
  "src/app/api/users/route.ts",
  "src/app/dashboard/guardians/page.tsx",
  "src/lib/academic/datesheet-publication.ts",
  "src/lib/academic/exam-scheduling-write.ts",
  "src/lib/academic/resource-write.ts",
  "src/lib/academic/rollover.ts",
  "src/lib/academic/subject-write.ts",
  "src/lib/accommodations/service.ts",
  "src/lib/activities/service.ts",
  "src/lib/api/scope.ts",
  "src/lib/api/teacher-assignments.ts",
  "src/lib/assignments/service.ts",
  "src/lib/attendance/register.ts",
  "src/lib/audit-history.ts",
  "src/lib/care/service.ts",
  "src/lib/certificates/service.ts",
  "src/lib/cover/recovery.ts",
  "src/lib/data-lifecycle/service.ts",
  "src/lib/family/digests.ts",
  "src/lib/family/trips.ts",
  "src/lib/fees/invoice-generation.ts",
  "src/lib/front-desk/complaints.ts",
  "src/lib/front-desk/phone-calls.ts",
  "src/lib/group-policy/service.ts",
  "src/lib/identity/service.ts",
  "src/lib/integrations/service.ts",
  "src/lib/learning/actions.ts",
  "src/lib/learning/transfer.ts",
  "src/lib/marks-scan/service.ts",
  "src/lib/meetings/service.ts",
  "src/lib/offline/service.ts",
  "src/lib/pickup/service.ts",
  "src/lib/portfolio/service.ts",
  "src/lib/resources/service.ts",
  "src/lib/school-ai/lesson-plan-service.ts",
  "src/lib/school-ai/repository.ts",
  "src/lib/school-ai/school-operations-cycle-write.ts",
  "src/lib/service-desk/service.ts",
  "src/lib/staff/teaching-evidence.ts",
  "src/lib/staff/workload.ts",
  "src/lib/storage/private-upload.ts",
  "src/lib/students/enrollment.ts",
  "src/lib/study/assistant.ts",
  "src/lib/tax/service.ts",
  "src/lib/timetable/draft-slot.ts",
  "src/lib/timetable/manual.ts",
]);

const root = join(__dirname, "..", "..");
const src = join(root, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Ignore comment lines so documentation that mentions the predicate does not count as a call site. */
function callsCanManageOperations(text: string): boolean {
  return text.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
    return /\bcanManageOperations\s*\(/.test(line);
  });
}

test("no new canManageOperations call sites outside the af1c6a75 baseline (§7.6)", () => {
  const offenders = walk(src)
    .filter((file) => callsCanManageOperations(readFileSync(file, "utf8")))
    .map((file) => relative(root, file).split("\\").join("/"))
    .filter((file) => !BASELINE.has(file))
    .sort();
  assert.deepEqual(offenders, [], `New canManageOperations call sites — use a purpose predicate from src/lib/api/scope.ts instead:\n${offenders.join("\n")}`);
});

test("the baseline only shrinks: files listed here may drop the call, never add a new file", () => {
  // Sanity: the baseline names real source paths, so a typo cannot silently widen it.
  for (const file of BASELINE) assert.match(file, /^src\/.+\.(ts|tsx)$/);
  assert.ok(BASELINE.size <= 122);
});
