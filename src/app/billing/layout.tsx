import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

export const metadata: Metadata = {
  // Rendered as "Billing & plan | SkooleeAI" by the root title template.
  title: "Billing & plan",
};

/**
 * `/billing` is the one return address for payment providers, notifications and the suspended screen (§6.2).
 * Seeding the display locale here makes the first paint use the right language and direction (K-m12). No
 * suspension redirect: a paused school must still reach its billing workspace.
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
