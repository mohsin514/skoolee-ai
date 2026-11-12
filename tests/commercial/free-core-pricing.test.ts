import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PLANS, PLAN_ORDER, billableStudents, canUseFeature, type PlanFeature } from "@/config/plans";
import { createPlanContract, decodePlanContractMetadata, encodePlanContractMetadata, validateCommercialContract } from "@/config/commercial-contract";
import { aiCreditLimit, billedStudentCount, billedUnits, monthlyAiCreditAllowance, periodUnitPrice, planPeriodAmount, planPriceLabel } from "@/lib/billing/plan-pricing";

// "Free core, paid flagship" (catalogue 2026-11-12.1): the billing maths, the credit allowance, the plan flags and
// the server entry points that enforce them.

test("the catalogue is the approved free-core model and passes the claims check", () => {
  assert.deepEqual(validateCommercialContract(), []);
  const row = (plan: keyof typeof PLANS) => [PLANS[plan].name, PLANS[plan].pricing, PLANS[plan].price, PLANS[plan].minBilledStudents, PLANS[plan].aiCreditsPerStudent];
  assert.deepEqual(PLAN_ORDER.map(row), [
    ["Core", "per_student", 0, 0, 0],
    ["Plus", "per_student", 15, 100, 0],
    ["Flagship", "per_student", 40, 100, 10],
    ["Network", "per_student", 60, 600, 15],
  ]);
  for (const plan of PLAN_ORDER) {
    assert.equal(PLANS[plan].maxStudents, -1, `${plan}: no student limit`);
    assert.equal(PLANS[plan].maxTeachers, -1, `${plan}: no teacher limit`);
    assert.equal(PLANS[plan].maxCampuses, -1, `${plan}: no campus limit`);
  }
});

test("billed students are the active count raised to the plan's minimum; free and flat plans bill none", () => {
  assert.equal(billedStudentCount(PLANS.BASIC, 40), 100);
  assert.equal(billedStudentCount(PLANS.BASIC, 340), 340);
  assert.equal(billedStudentCount(PLANS.ENTERPRISE, 450), 600);
  assert.equal(billedStudentCount(PLANS.FREE, 5000), 0);
  assert.equal(billedStudentCount({ price: 4000, pricing: "per_school", minBilledStudents: 0 }, 900), 0);
  assert.equal(billedStudentCount(PLANS.BASIC, Number.NaN), 100, "a bad count never bills below the minimum");
  assert.equal(billableStudents("BASIC", 40), 100, "the catalogue helper agrees");
  assert.equal(billedUnits(PLANS.PRO, 250), 250);
  assert.equal(billedUnits({ price: 7000, pricing: "per_school" }, 250), 1);
});

test("period amounts: monthly is price × billed students, yearly takes the annual discount off the unit price", () => {
  assert.equal(planPeriodAmount(PLANS.BASIC, 80, "monthly"), 1500);
  assert.equal(planPeriodAmount(PLANS.BASIC, 80, "annual"), 14400);
  assert.equal(planPeriodAmount(PLANS.PRO, 300, "monthly"), 12000);
  assert.equal(planPeriodAmount(PLANS.PRO, 300, "annual"), 115200);
  assert.equal(planPeriodAmount(PLANS.ENTERPRISE, 1500, "monthly"), 90000);
  assert.equal(planPeriodAmount(PLANS.FREE, 1500, "annual"), 0);
  assert.equal(planPeriodAmount({ price: null, pricing: "per_student", minBilledStudents: 100 }, 10, "monthly"), null);
  assert.equal(periodUnitPrice(40, "annual"), 384);
  assert.equal(planPriceLabel(PLANS.BASIC), "PKR 15 per student/mo");
  assert.equal(planPriceLabel({ price: 4000, pricing: "per_school" }), "PKR 4,000/mo");
  assert.equal(planPriceLabel(PLANS.FREE), "Free");
});

test("the monthly AI credit allowance is the larger of the fixed credits and per-student credits × active students", () => {
  assert.equal(monthlyAiCreditAllowance(PLANS.PRO, 50), 1000, "the floor");
  assert.equal(monthlyAiCreditAllowance(PLANS.PRO, 300), 3000);
  assert.equal(monthlyAiCreditAllowance(PLANS.ENTERPRISE, 1500), 22500);
  assert.equal(monthlyAiCreditAllowance(PLANS.BASIC, 900), 0, "Plus has no AI credits");
  assert.equal(monthlyAiCreditAllowance({ aiCredits: 5000, aiCreditsPerStudent: 0 }, 900), 5000, "older flat terms keep their credits");
  // A charge checks the stored monthly allowance, never below the fixed floor; flat terms ignore the stored column.
  assert.equal(aiCreditLimit(PLANS.PRO, 3000), 3000);
  assert.equal(aiCreditLimit(PLANS.PRO, 200), 1000);
  assert.equal(aiCreditLimit({ aiCredits: 5000, aiCreditsPerStudent: 0 }, 99999), 5000);
});

test("each plan unlocks exactly its advertised features", () => {
  const flags: PlanFeature[] = ["whatsappEnabled", "pdfExportEnabled", "pdfBulkExport", "analyticsEnabled", "timetableEnabled", "examPlanningEnabled", "aiWorkflowsEnabled", "examStudioEnabled", "markSheetScanEnabled", "aiRemarksEnabled", "groupConsoleEnabled", "apiAccessEnabled"];
  const on = (plan: string) => flags.filter((flag) => canUseFeature(plan, flag));
  assert.deepEqual(on("FREE"), ["pdfExportEnabled"]);
  assert.deepEqual(on("BASIC"), ["whatsappEnabled", "pdfExportEnabled", "pdfBulkExport", "timetableEnabled", "examPlanningEnabled"]);
  assert.deepEqual(on("PRO"), flags.filter((flag) => flag !== "groupConsoleEnabled" && flag !== "apiAccessEnabled"));
  assert.deepEqual(on("ENTERPRISE"), flags);
  assert.deepEqual(on("UNKNOWN"), on("FREE"), "an unknown plan reads as Core");
});

test("checkout metadata fits the provider limit for every plan, and an open checkout quoted before the change decodes as flat terms", () => {
  for (const plan of PLAN_ORDER) {
    assert.ok(encodePlanContractMetadata(createPlanContract(plan, { billedStudents: 999_999 })).length <= 500, plan);
  }
  const legacy = JSON.stringify(["2026-10-08.1", "2026-10-20T00:00:00.000Z", "BASIC", "Pro", 4000, "PKR", "PKR 4,000/mo", 1000, 500, 10, 1, "1110", ["Up to 500 students"], ["plan-monthly", "expire-at-calendar-month-reset", "zero-used-on-calendar-month-boundary"]]);
  const decoded = decodePlanContractMetadata(legacy, "BASIC");
  assert.ok(decoded);
  assert.equal(decoded.pricing, "per_school");
  assert.equal(decoded.price, 4000);
  assert.equal(decoded.billedStudents, null);
  assert.equal(decoded.analyticsEnabled, false);
  assert.equal(decoded.aiWorkflowsEnabled, true);
  assert.equal(planPeriodAmount(decoded, 0, "monthly"), 4000);
});

test("every new flag is enforced at its server entry points with the neutral PLAN_FEATURE gate", () => {
  const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const gates: Array<[string, PlanFeature | "aiWorkflows"]> = [
    ["src/lib/timetable/manual.ts", "timetableEnabled"],
    ["src/app/api/timetable/[id]/slots/route.ts", "timetableEnabled"],
    ["src/app/api/timetable/[id]/suggestions/route.ts", "timetableEnabled"],
    ["src/lib/staff/workload.ts", "timetableEnabled"],
    ["src/lib/cover/recovery.ts", "timetableEnabled"],
    ["src/lib/school-ai/execution.ts", "timetableEnabled"],
    ["src/lib/school-ai/execution.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-sessions/seating/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-sessions/[id]/exceptions/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-sessions/[id]/exceptions/[exceptionId]/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-schedule/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-schedule/bulk/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-schedule/rooms/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/exam-schedule/invigilation/route.ts", "examPlanningEnabled"],
    ["src/app/api/academic/datesheet-publication/route.ts", "examPlanningEnabled"],
    ["src/lib/school-ai/access.ts", "examStudioEnabled"],
    ["src/lib/school-ai/paper-slot-service.ts", "examStudioEnabled"],
    ["src/lib/school-ai/exam-service.ts", "examStudioEnabled"],
    ["src/app/api/school-ai/generate-paper/route.ts", "examStudioEnabled"],
    ["src/app/api/school-ai/generate-paper/stream/route.ts", "examStudioEnabled"],
    ["src/lib/marks-scan/service.ts", "markSheetScanEnabled"],
    ["src/app/api/ai/generate-remarks/route.ts", "aiRemarksEnabled"],
    ["src/app/api/ai/translate/route.ts", "aiRemarksEnabled"],
    ["src/app/api/ai/insights/route.ts", "aiRemarksEnabled"],
    ["src/app/api/group-policy/route.ts", "groupConsoleEnabled"],
    ["src/lib/academic/model-draft-command.ts", "groupConsoleEnabled"],
    ["src/app/api/integrations/route.ts", "apiAccessEnabled"],
    ["src/lib/integrations/service.ts", "apiAccessEnabled"],
  ];
  for (const [file, flag] of gates) assert.match(read(file), new RegExp(flag), `${file} gates ${flag}`);
  for (const file of ["src/lib/ai-workflows/jobs/job-service.ts", "src/lib/ai-workflows/jobs/questionnaire.ts", "src/lib/ai-workflows/questionnaire/service.ts"]) {
    assert.match(read(file), /aiWorkflowsAvailable\(/, `${file} checks the plan alongside the rollout flag`);
  }
  assert.match(read("src/lib/ai-workflows/flag.ts"), /aiWorkflowsEnabled/);
  // Session scheduling stays free: marks and standard report cards hang off it.
  assert.doesNotMatch(read("src/app/api/academic/exam-sessions/route.ts"), /assertPlanFeature/);
  // G51: the gate's copy is neutral and never says "Upgrade".
  assert.doesNotMatch(read("src/lib/billing/entitlements.ts"), /PLAN_FEATURE_MESSAGE = "[^"]*Upgrade/);
});
