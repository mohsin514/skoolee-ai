import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";

export default async function AnalyticsPage() {
  const session = await getAuthUser();
  if (!session) redirect("/login");

  const billing = await getBillingSnapshot(session.schoolId);

  if (!billing.isOperational) {
    return (
      <>
        <Header
          title="Analytics"
          description="School performance insights and AI usage metrics"
        />
        <div className="p-4 sm:p-6">
          <Alert
            tone="warning"
            live="off"
            className="sk-enter p-5 sm:p-6"
            title="Restore billing to use analytics"
            actions={
              <Link href="/dashboard/billing" className={cn(buttonVariants(), "sk-nudge-trigger")}>
                Open billing
                <ArrowUpRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:-scale-x-100" />
              </Link>
            }
          >
            <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
              Subscription access is paused. Restore billing before using analytics and other operational workflows.
            </p>
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Analytics"
        description="School performance insights and AI usage metrics"
      />
      <div className="space-y-6 p-4 sm:p-6">
        {!billing.limits.analyticsEnabled && (
          <Alert
            tone="brand"
            live="off"
            compact
            className="sk-enter"
            actions={
              <Link href="/dashboard/billing" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-nudge-trigger border-primary/30 text-primary")}>
                Upgrade
                <ArrowUpRight aria-hidden="true" className="sk-nudge h-3.5 w-3.5 rtl:-scale-x-100" />
              </Link>
            }
          >
            <p className="text-sm text-ink">
              Upgrade to <span className="font-semibold text-primary">Pro</span> for AI-powered insights, cohort trends, and intervention summaries.
            </p>
          </Alert>
        )}
        <AnalyticsCharts />
      </div>
    </>
  );
}
