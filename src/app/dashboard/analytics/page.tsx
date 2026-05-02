import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { BarChart3, TrendingUp, TrendingDown, Users, Lock, ArrowUpRight } from "lucide-react";

export default async function AnalyticsPage() {
  const session = await getAuthUser();
  if (!session) redirect("/login");

  const billing = await getBillingSnapshot(session.schoolId);
  if (!billing.isOperational || !billing.limits.analyticsEnabled) {
    const isSuspended = !billing.isOperational;
    return (
      <>
        <Header
          title="Analytics"
          description="School performance insights and AI usage metrics"
        />
        <div className="p-6">
          <Card className="border-amber-200 bg-amber-50/60 shadow-none">
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <Badge className="mb-3 bg-white text-amber-700">
                      {isSuspended ? "Billing paused" : "Pro feature"}
                    </Badge>
                    <h2 className="text-xl font-bold tracking-normal">
                      {isSuspended ? "Restore billing to use analytics" : "Analytics unlocks on Pro"}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {isSuspended
                        ? "Subscription access is paused. Restore billing before using analytics and other operational workflows."
                        : `Your current ${billing.limits.name} plan includes core records, but AI performance analytics, cohort trends, and intervention summaries require Pro or Enterprise.`}
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
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Avg. Class Performance
                  </p>
                  <p className="text-2xl font-bold">N/A</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Pass Rate
                  </p>
                  <p className="text-2xl font-bold">N/A</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <TrendingDown className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Students Needing Attention
                  </p>
                  <p className="text-2xl font-bold">N/A</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts placeholder */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Class Performance Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Charts will appear once marks are entered.
                <br />
                (Powered by Recharts)
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Top & Bottom Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Student rankings will appear after exam results are published.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
