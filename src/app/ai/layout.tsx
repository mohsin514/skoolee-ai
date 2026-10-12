import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { assertSchoolOperational, BillingAccessError } from "@/lib/billing/entitlements";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "School AI" };
export const dynamic = "force-dynamic";
export default async function SchoolAiLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  if (["APP_OWNER", "PARENT"].includes(user.role)) redirect("/403");
  try { await assertSchoolOperational(user.schoolId); }
  catch (error) {
    if (error instanceof BillingAccessError && error.status === 402) redirect("/subscription-suspended");
    throw error;
  }
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
