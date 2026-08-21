import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { Lock, ArrowUpRight } from "lucide-react";
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
        <div className="p-6">
          <Card className="sk-rise border-amber-200 bg-amber-50/60 shadow-none" style={{ animationDelay: "0ms" }}>
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <Badge className="mb-3 bg-white text-amber-700">Billing paused</Badge>
                    <h2 className="text-xl font-bold tracking-normal">
                      Restore billing to use analytics
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Subscription access is paused. Restore billing before using analytics and other operational workflows.
                    </p>
                  </div>
                </div>
                <Link href="/dashboard/billing">
                  <Button>
                    Upgrade
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
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
      <div className="p-6 space-y-6">
        {!billing.limits.analyticsEnabled && (
          <Card className="sk-rise border-[#8127cf]/20 bg-[#fbf0fe]/50 shadow-none" style={{ animationDelay: "0ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink">
                  Upgrade to <span className="font-bold text-[#8127cf]">Pro</span> for AI-powered insights, cohort trends, and intervention summaries.
                </p>
                <Link href="/dashboard/billing">
                  <Button size="sm" variant="outline" className="border-[#8127cf]/30 text-[#8127cf] hover:bg-[#8127cf] hover:text-white">
                    Upgrade
                    <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
        <AnalyticsCharts />
      </div>
    </>
  );
}
