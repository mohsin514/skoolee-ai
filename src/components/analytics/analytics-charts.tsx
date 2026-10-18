"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { NO_ENTRY_ANIMATION } from "@/components/insights";
import {
  Award, BarChart3, TrendingDown, TrendingUp, Users,
  GraduationCap, AlertTriangle, BookOpen, Calendar,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";

interface AnalyticsData {
  summary: {
    avgPerformance: number;
    passRate: number;
    needsAttention: number;
    totalStudents: number;
    attendanceRate: number | null;
  };
  classPerformance: { className: string; average: number; students: number }[];
  subjectPerformance: { subject: string; average: number; entries: number }[];
  gradeDistribution: { grade: string; count: number }[];
  examTrends: { examId: string; title: string; term: string; type: string; average: number; students: number; className: string }[];
  topStudents: { name: string; rollNo: string; percentage: number; grade: string }[];
  atRiskStudents: { name: string; rollNo: string; percentage: number; attendancePct: number | null }[];
  academicYear: number;
}

const COLORS = ["#8127cf", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#6366f1"];
const GRADE_COLORS: Record<string, string> = {
  "A+": "#22c55e", A: "#4ade80", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444",
};

export function AnalyticsCharts() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/analytics");
      const json = await res.json();
      if (json.success) setData(json.data);
      else {
        setFailed(true);
        toast.error("Could not load the analytics. Try again in a moment.");
      }
    } catch {
      setFailed(true);
      toast.error("Could not load the analytics. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SkeletonBlock label="Loading chart" />
    );
  }

  if (!data) {
    return failed ? (
      <ErrorState
        title="Analytics could not be loaded"
        description="Reload to try again."
        onRetry={load}
      />
    ) : null;
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      <div className="sk-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={TrendingUp} label="Avg Performance" value={`${summary.avgPerformance}%`} color="emerald" />
        <StatCard icon={Award} label="Pass Rate" value={`${summary.passRate}%`} color="blue" />
        <StatCard icon={AlertTriangle} label="Needs Attention" value={summary.needsAttention} color="amber" />
        <StatCard icon={Users} label="Total Students" value={summary.totalStudents} color="purple" />
        <StatCard icon={Calendar} label="Attendance" value={summary.attendanceRate !== null ? `${summary.attendanceRate}%` : "N/A"} color="teal" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Class Performance Comparison" icon={BarChart3}>
          {data.classPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.classPerformance} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f9" />
                <XAxis dataKey="className" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(value) => [`${value}%`, "Average"]}
                />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="average" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {data.classPerformance.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Grade Distribution" icon={GraduationCap}>
          {data.gradeDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  {...NO_ENTRY_ANIMATION}
                  data={data.gradeDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="grade"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {data.gradeDistribution.map((entry) => (
                    <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Subject Performance" icon={BookOpen}>
          {data.subjectPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.subjectPerformance} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis dataKey="subject" type="category" tick={{ fontSize: 10 }} width={55} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(value) => [`${value}%`, "Average"]}
                />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="average" radius={[0, 6, 6, 0]} maxBarSize={24} fill="#8127cf" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Exam Trends" icon={TrendingUp}>
          {data.examTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.examTrends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f9" />
                <XAxis dataKey="title" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(value) => [`${value}%`, "Average"]}
                  labelFormatter={(label) => `Exam: ${label}`}
                />
                <Legend />
                <Line {...NO_ENTRY_ANIMATION} type="monotone" dataKey="average" stroke="#8127cf" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Class Average" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="sk-panel min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-ink-strong">Top Performers</h3>
          </div>
          {data.topStudents.length > 0 ? (
            <div className="space-y-2">
              {data.topStudents.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-hover">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-bold ${
                      i < 3 ? "bg-primary text-white" : "bg-muted text-ink-muted"
                    }`}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-strong">{s.name}</p>
                      <p className="text-xs text-ink-subtle tabular-nums">{s.rollNo}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-primary">{s.percentage}%</span>
                    <Badge variant="neutral" size="sm">{s.grade}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState size="sm" icon={Award} title="No top performers yet" description="Rankings appear once exam results are published." />}
        </div>

        <div className="sk-panel min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-base font-semibold text-ink-strong">Students Needing Attention</h3>
          </div>
          {data.atRiskStudents.length > 0 ? (
            <div className="space-y-2">
              {data.atRiskStudents.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-hover">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-strong">{s.name}</p>
                    <p className="text-xs text-ink-subtle tabular-nums">{s.rollNo}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-status-error-text">{s.percentage}%</span>
                    {s.attendancePct !== null && (
                      <Badge variant={s.attendancePct < 75 ? "danger" : "success"} size="sm" dot className="tabular-nums">
                        {s.attendancePct}% att.
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState size="sm" icon={Users} title="No students need attention" description="No student is currently flagged by their results or attendance." />}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    emerald: { bg: "bg-emerald-50/50", text: "text-emerald-600", iconBg: "bg-emerald-100" },
    blue: { bg: "bg-blue-50/50", text: "text-blue-600", iconBg: "bg-blue-100" },
    amber: { bg: "bg-amber-50/50", text: "text-amber-600", iconBg: "bg-amber-100" },
    purple: { bg: "bg-brand-50/50", text: "text-primary", iconBg: "bg-brand-50" },
    teal: { bg: "bg-teal-50/50", text: "text-teal-600", iconBg: "bg-teal-100" },
  };
  const c = colorMap[color] || colorMap.purple;

  return (
    <div className={`sk-hover-lift rounded-[20px] border border-edge/10 ${c.bg} p-5 shadow-sm`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-xl ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <div className="min-w-0">
          <p className="sk-eyebrow truncate">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-ink-strong">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="sk-panel min-w-0 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-xl bg-brand-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-ink-strong">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center">
      <EmptyState size="sm" icon={BarChart3} title="No chart data yet" description="Charts appear after exam results are published." />
    </div>
  );
}
