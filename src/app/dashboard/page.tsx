import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  BookOpen,
  Brain,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";

const stats = [
  {
    title: "Total Students",
    value: "—",
    change: "+0",
    icon: Users,
    color: "text-blue-600 bg-blue-500/10",
  },
  {
    title: "Active Classes",
    value: "—",
    change: "+0",
    icon: GraduationCap,
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    title: "Subjects",
    value: "—",
    change: "",
    icon: BookOpen,
    color: "text-violet-600 bg-violet-500/10",
  },
  {
    title: "AI Credits Used",
    value: "0 / 100",
    change: "",
    icon: Brain,
    color: "text-amber-600 bg-amber-500/10",
  },
];

export default function DashboardPage() {
  return (
    <>
      <Header
        title="Dashboard"
        description="Overview of your school's performance"
      />

      <div className="p-6 space-y-8">
        {/* ─── Stats Grid ────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                    {stat.change && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                        <ArrowUpRight className="h-3 w-3" />
                        {stat.change} this month
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
                  >
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ─── Recent Exams + Top Students ────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Recent Exams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                No exams yet. Create your first exam to get started.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Top Performing Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                No results yet. Enter marks to see analytics.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── AI Usage ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              AI Credit Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Credits used this month</span>
                <span className="font-medium">0 / 100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500"
                  style={{ width: "0%" }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Upgrade to Basic for 1,000 credits/month or Pro for 5,000.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
