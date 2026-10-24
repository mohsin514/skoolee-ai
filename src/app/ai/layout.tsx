import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { assertSchoolOperational, BillingAccessError } from "@/lib/billing/entitlements";
import { redirect } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";

export const metadata: Metadata = { title: "School AI" };
export const dynamic = "force-dynamic";
/**
 * Gates for every /ai route, including the candidate exam boundary (/ai/exams). It never renders RoleShell or
 * RoleFrame: shell reads during an exam would hit the proxy's EXAM_SESSION_ACTIVE 409 and its nav would lead
 * out of the exam (K-I2). /ai and /ai/studio frame themselves in their pages.
 */
export default async function SchoolAiLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  // The platform operator goes home, not to /403 (G44); families and students use AI Workflows (Slice 4).
  if (user.role === "APP_OWNER") redirect(dashboardPathForRole(user.role));
  try { await assertSchoolOperational(user.schoolId); }
  catch (error) {
    if (error instanceof BillingAccessError && error.status === 402) redirect("/subscription-suspended");
    throw error;
  }
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
