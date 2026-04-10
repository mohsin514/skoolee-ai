"use client";

import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown, Users } from "lucide-react";

export default function AnalyticsPage() {
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
                  <p className="text-2xl font-bold">—%</p>
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
                  <p className="text-2xl font-bold">—%</p>
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
                  <p className="text-2xl font-bold">—</p>
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
