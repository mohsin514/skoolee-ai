// SKAI-882: per-plan feature matrix rows for the public pricing page.
// Each row reads an existing boolean flag from PLANS (src/config/plans.ts), so the
// matrix cannot drift from what entitlements enforce. Labels live in the
// pricing page copy (EN/AR/UR). Support tier is not a plan flag and is not shown.

import type { PlanFeature } from "@/config/plans";

export const PLAN_MATRIX_GROUPS = [
  {
    key: "modules",
    features: ["timetableEnabled", "examPlanningEnabled", "analyticsEnabled", "pdfBulkExport", "groupConsoleEnabled", "apiAccessEnabled"],
  },
  {
    key: "whatsapp",
    features: ["whatsappEnabled"],
  },
  {
    key: "ai",
    features: ["aiWorkflowsEnabled", "examStudioEnabled", "markSheetScanEnabled", "aiRemarksEnabled"],
  },
] as const satisfies ReadonlyArray<{ key: "modules" | "whatsapp" | "ai"; features: readonly PlanFeature[] }>;

export type PlanMatrixGroup = (typeof PLAN_MATRIX_GROUPS)[number];
export type PlanMatrixFeature = PlanMatrixGroup["features"][number];
