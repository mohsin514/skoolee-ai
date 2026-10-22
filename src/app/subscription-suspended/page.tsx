import { Alert } from "@/components/ui/alert";
import { PageCard } from "@/components/ui/page-card";
import { PageHeader } from "@/components/ui/page-header";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { kindFor } from "@/lib/auth/institution";
import { getSubscriptionOwners } from "@/lib/auth/institution-server";
import { billingHubPath } from "@/lib/billing/hub";
import { getDisplayLocale } from "@/lib/locale/display";
import { translateUi } from "@/lib/locale/ui-messages";
import { SignOutLink } from "@/app/403/sign-out-link";

export const dynamic = "force-dynamic";

/**
 * SKO-373 / §6.3: the suspended screen keeps recovery one click away for the payer, names who can renew it for
 * everyone else (a name, never an email, and no button they cannot use), and always offers a way out.
 * §8.1 R1: one PageHeader (one h1, at most one primary action — "Open Billing & plan" for the payer only); the
 * role-specific state is a warning Alert under it. Seeded with the viewer's display locale, so the first paint is
 * already translated and mirrored. Addendum 2026-10-22: the screen sits on the shared app canvas (painted on <body>,
 * so the page stays transparent) inside exactly one shared PageCard; Sign out closes the card below a divider.
 */
export default async function SubscriptionSuspendedPage() {
  const user = await requirePageSession();
  const locale = await getDisplayLocale(user);
  const language = locale.language;
  const t = (source: string) => translateUi(source, language);
  const payer = billingHubPath(user) !== null;
  const family = user.role === "PARENT" || user.role === "STUDENT";
  const [owner] = payer || family ? [] : await getSubscriptionOwners(user.schoolId, undefined, kindFor(user) ?? undefined).catch(() => []);
  const [ownerBefore, ownerAfter = ""] = t("Your plan is paused. {0} can renew it.").split("{0}");

  const status = payer
    ? t("Renew the plan or update the payment method in Billing & plan.")
    : family
      ? t("The school's SkooleeAI plan is paused. Your records stay in place, and you can sign back in once the school renews it.")
      : owner
        ? <>{ownerBefore}<bdi className="font-semibold">{owner.fullName}</bdi>{ownerAfter}</>
        : t("Contact SkooleeAI support to restore billing access.");

  return (
    <LocaleProvider initialLocale={locale}>
      <main lang={language} dir={language === "en" ? "ltr" : "rtl"} className="sk-app-canvas flex min-h-dvh items-center justify-center px-4 py-10 text-ink-strong sm:px-6 sm:py-12">
        <PageCard className="sk-enter-scale flex w-full max-w-2xl flex-col gap-6">
          <PageHeader
            title="Your school's plan is paused"
            description={family ? undefined : "Your records stay in place, and your workspace opens again as soon as the plan is renewed."}
            primaryAction={payer ? { id: "open-billing", label: "Open Billing & plan", href: "/billing" } : undefined}
            status={<Alert tone="warning" live="off" className="w-full" data-suspended-status="">{status}</Alert>}
          />
          <div className="flex flex-col border-t border-border-subtle pt-5 sm:flex-row sm:justify-end">
            <div className="w-full sm:w-auto"><SignOutLink label={t("Sign out")} /></div>
          </div>
        </PageCard>
      </main>
    </LocaleProvider>
  );
}
