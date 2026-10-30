import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { kindFor } from "@/lib/auth/institution";
import { getSubscriptionOwners } from "@/lib/auth/institution-server";
import { BILLING_RETURN_PARAMS, billingHubPath, pickParams } from "@/lib/billing/hub";
import { dashboardPathForRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { getDisplayLocale } from "@/lib/locale/display";
import { translateUi } from "@/lib/locale/ui-messages";
import { AccessNotice } from "@/components/ui/access-notice";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";

export const dynamic = "force-dynamic";

/**
 * `/billing` resolver (§6.2, C12). Every external return URL lands here — Stripe success/cancel, SafePay, the
 * subscription notifications and the suspended screen — and this page sends the payer to their own Billing & plan
 * view with the provider's return parameters kept. Everyone else sees who manages the subscription (a name, never
 * an email) inside their own shell; families go home.
 */
export default async function BillingResolver({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageSession();
  const query = await searchParams;
  const target = billingHubPath(user, pickParams(query, BILLING_RETURN_PARAMS));
  // redirect() throws by design, so every call stays outside any try/catch.
  if (target) redirect(target);
  if (user.role === "PARENT" || user.role === "STUDENT" || user.role === "APP_OWNER") redirect(dashboardPathForRole(user.role));
  // A paused school: the recovery screen already says who can renew it, without a shell whose reads would 402.
  if (user.schoolStatus === "SUSPENDED") redirect("/subscription-suspended");

  const [[payer], brand, locale] = await Promise.all([
    getSubscriptionOwners(user.schoolId, undefined, kindFor(user) ?? undefined).catch(() => []),
    // Campus logo, else school logo: the same image the console sidebar shows (as every frame layout passes it).
    prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null),
    getDisplayLocale(user),
  ]);
  const home = dashboardPathForRole(user.role);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null}>
      {/* Addendum 2026-10-22 §2: the frame's one page card holds the view, so no outer card or page padding here.
          §8.1 R1 / §4.3: one PageHeader, one h1, titled with the registry label (no icon prop: a component cannot
          cross from this server page into the client header). The notice names who manages the plan (a name, never
          an email) and offers the way back as the one action. */}
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
        <PageHeader title="Billing & plan" description="The school's SkooleeAI plan, AI credits and payment method." />
        <AccessNotice
          reason={payer ? "The SkooleeAI subscription is managed by the account owner." : "Contact SkooleeAI support to restore billing access."}
          owner={payer?.fullName ?? null}
          action={<Link href={home} className={buttonVariants()}>{translateUi("Go to my dashboard", locale.language)}</Link>}
        />
      </div>
    </RoleFrame>
  );
}
