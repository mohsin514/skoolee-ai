import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { assertSchoolOperational, BillingAccessError } from "@/lib/billing/entitlements";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "School AI" };
export const dynamic = "force-dynamic";
/**
 * Gates for every /ai route, including the candidate exam boundary (/ai/exams). It never renders RoleShell or
 * RoleFrame: shell reads during an exam would hit the proxy's EXAM_SESSION_ACTIVE 409 and its nav would lead
 * out of the exam (K-I2). /ai and /ai/studio frame themselves in their pages.
 */
export default async function SchoolAiLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  // Every role reaches AI Workflows: families and students since Slice 4, the platform owner since Slice 8.
  // The platform owner has no school subscription to check.
  try { if (user.role !== "APP_OWNER") await assertSchoolOperational(user.schoolId); }
  catch (error) {
    if (error instanceof BillingAccessError && error.status === 402) redirect("/subscription-suspended");
    throw error;
  }
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
