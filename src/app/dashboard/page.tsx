import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  GraduationCap,
  BookOpen,
  Brain,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
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
        {/* ─── Setup Wizard (Step J in Flowchart) ─────────── */}
        <Card className="border-primary/20 bg-primary/5 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Welcome to SkooleeAI! Complete your setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "1. Create Classes", href: "/dashboard/classes", done: false },
                { label: "2. Add Teachers", href: "/dashboard/settings/members", done: false },
                { label: "3. Set up First Exam", href: "/dashboard/marks", done: false },
              ].map((step, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-sidebar-border rounded-lg group hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted text-xs font-bold text-muted-foreground group-hover:border-primary group-hover:text-primary transition-colors">
                      {i + 1}
                    </div>
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                  <Link href={step.href}>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      Start <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

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
