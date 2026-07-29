"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  Download,
  TrendingUp,
  BarChart3,
  User,
  UserX,
  Clock,
  Search,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { BrandButton } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AttendanceOverviewProps {
  campusId?: string;
}

type Period = "today" | "week" | "month";

interface SummaryData {
  period: string;
  totalStudents: number;
  present: number;
  absent: number;
  leave: number;
  totalRecords: number;
  attendanceRate: number;
  daysTracked: number;
  classBreakdown: ClassBreakdownItem[];
}

interface ClassBreakdownItem {
  classId: string;
  className: string;
  totalStudents: number;
  present: number;
  absent: number;
  leave: number;
  marked: number;
  unmarked: number;
}

interface MonthlyData {
  type: "campus";
  month: string;
  overallPercentage: number;
  totalPresent: number;
  totalAbsent: number;
  totalLeave: number;
  totalRecords: number;
  atRiskCount: number;
  classes: MonthlyClassSummary[];
}

interface MonthlyClassSummary {
  classId: string;
  className: string;
  studentCount: number;
  present: number;
  absent: number;
  leave: number;
  total: number;
  percentage: number;
}

interface ClassDetailData {
  type: "class";
  classId: string;
  className: string;
  month: string;
  totalStudents: number;
  classAveragePercentage: number;
  summary: { totalPresent: number; totalAbsent: number; totalLeave: number };
  atRiskStudents: AtRiskStudent[];
  students: StudentAttendance[];
}

interface AtRiskStudent {
  studentId: string;
  studentName: string;
  rollNo: string;
  profileImageUrl: string | null;
  percentage: number;
  absentDays: number;
  consecutiveAbsences: number;
}

interface StudentAttendance {
  studentId: string;
  name: string;
  rollNo: string;
  profileImageUrl: string | null;
  present: number;
  absent: number;
  leave: number;
  percentage: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */

function StatSkeleton() {
  return (
    <div className="bg-white rounded-[28px] border border-[#cfc2d6]/10 shadow-lg p-6 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3 flex-1">
          <div className="h-3 w-20 rounded-full bg-[#e8e0ec]/50" />
          <div className="h-8 w-16 rounded-full bg-[#e8e0ec]/50" />
        </div>
        <div className="h-11 w-11 rounded-2xl bg-[#e8e0ec]/50" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl bg-[#e8e0ec]/20 p-4"
        >
          <div className="h-4 w-32 rounded-full bg-[#e8e0ec]/50" />
          <div className="h-4 flex-1 rounded-full bg-[#e8e0ec]/50" />
          <div className="h-4 w-16 rounded-full bg-[#e8e0ec]/50" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center animate-pulse">
      <div className="h-40 w-40 rounded-full bg-[#e8e0ec]/50" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const DONUT_COLORS = ["#10b981", "#f43f5e", "#f59e0b"]; // emerald, rose, amber

function AttendanceDonut({
  present,
  absent,
  leave,
}: {
  present: number;
  absent: number;
  leave: number;
}) {
  const total = present + absent + leave;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm font-semibold text-[#4d4354]/40">
        No data
      </div>
    );
  }

  const data = [
    { name: "Present", value: present },
    { name: "Absent", value: absent },
    { name: "Leave", value: leave },
  ];

  return (
    <div className="relative h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={3}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={DONUT_COLORS[idx]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-black text-[#1f1a23]">{total}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/40">
          Records
        </span>
      </div>
    </div>
  );
}

function DonutLegend({
  present,
  absent,
  leave,
}: {
  present: number;
  absent: number;
  leave: number;
}) {
  const items = [
    { label: "Present", value: present, color: "bg-emerald-500" },
    { label: "Absent", value: absent, color: "bg-rose-500" },
    { label: "Leave", value: leave, color: "bg-amber-500" },
  ];
  return (
    <div className="flex items-center justify-center gap-5 mt-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", it.color)} />
          <span className="text-[10px] font-bold text-[#4d4354]/60">
            {it.label}
          </span>
          <span className="text-[10px] font-black text-[#1f1a23]">
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cn(
        "h-2 w-full rounded-full bg-[#e8e0ec]/40 overflow-hidden",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function StatusBadge({ percentage }: { percentage: number }) {
  if (percentage < 75) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600">
        <AlertTriangle className="h-3 w-3" />
        At Risk
      </span>
    );
  }
  if (percentage < 85) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-600">
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
      Good
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AttendanceOverview({ campusId }: AttendanceOverviewProps) {
  // --------------- state ---------------
  const [period, setPeriod] = useState<Period>("today");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [classDetail, setClassDetail] = useState<ClassDetailData | null>(null);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingClass, setLoadingClass] = useState(false);

  const [classSearch, setClassSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  // --------------- fetchers ---------------

  const fetchSummary = useCallback(
    async (p: Period) => {
      setLoadingSummary(true);
      try {
        const qs = new URLSearchParams({ period: p });
        if (campusId) qs.set("campusId", campusId);
        const res = await fetch(`/api/attendance/school-summary?${qs}`);
        if (!res.ok) throw new Error("Failed to load summary");
        const data: SummaryData = await res.json();
        setSummaryData(data);
      } catch {
        setSummaryData(null);
      } finally {
        setLoadingSummary(false);
      }
    },
    [campusId]
  );

  const fetchMonthly = useCallback(
    async (month: string) => {
      setLoadingMonthly(true);
      try {
        const qs = new URLSearchParams({ month });
        if (campusId) qs.set("campusId", campusId);
        const res = await fetch(`/api/attendance/monthly?${qs}`);
        if (!res.ok) throw new Error("Failed to load monthly data");
        const data: MonthlyData = await res.json();
        setMonthlyData(data);
      } catch {
        setMonthlyData(null);
      } finally {
        setLoadingMonthly(false);
      }
    },
    [campusId]
  );

  const fetchClassDetail = useCallback(
    async (classId: string, month: string) => {
      setLoadingClass(true);
      try {
        const qs = new URLSearchParams({ classId, month });
        if (campusId) qs.set("campusId", campusId);
        const res = await fetch(`/api/attendance/monthly?${qs}`);
        if (!res.ok) throw new Error("Failed to load class detail");
        const data: ClassDetailData = await res.json();
        setClassDetail(data);
      } catch {
        setClassDetail(null);
      } finally {
        setLoadingClass(false);
      }
    },
    [campusId]
  );

  // --------------- effects ---------------

  useEffect(() => {
    fetchSummary(period);
  }, [period, fetchSummary]);

  useEffect(() => {
    fetchMonthly(selectedMonth);
  }, [selectedMonth, fetchMonthly]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassDetail(selectedClassId, selectedMonth);
    } else {
      setClassDetail(null);
    }
  }, [selectedClassId, selectedMonth, fetchClassDetail]);

  // --------------- derived ---------------

  const summaryPresent = summaryData?.present ?? 0;
  const summaryAbsent = summaryData?.absent ?? 0;
  const summaryLeave = summaryData?.leave ?? 0;
  const summaryTotal = summaryData?.totalStudents ?? 0;
  const summaryRate = summaryData?.attendanceRate ?? 0;

  // classes from monthly data for the table
  const monthlyClasses = monthlyData?.classes ?? [];
  const filteredClasses = classSearch
    ? monthlyClasses.filter((c) =>
        c.className.toLowerCase().includes(classSearch.toLowerCase())
      )
    : monthlyClasses;

  // at-risk students from class detail
  const atRiskStudents = classDetail?.atRiskStudents ?? [];

  // filtered students in class detail
  const classStudents = classDetail?.students ?? [];
  const filteredStudents = studentSearch
    ? classStudents.filter(
        (s) =>
          s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
          s.rollNo?.toLowerCase().includes(studentSearch.toLowerCase())
      )
    : classStudents;

  // campus-wide at-risk (collected from monthly classes with low %)
  const campusAtRiskClasses = monthlyClasses.filter(
    (c) => c.percentage > 0 && c.percentage < 75
  );

  // --------------- handlers ---------------

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    setSelectedClassId(null);
  }

  function handleClassClick(classId: string) {
    setSelectedClassId(classId);
    setStudentSearch("");
  }

  function handleBackToOverview() {
    setSelectedClassId(null);
    setClassDetail(null);
    setStudentSearch("");
  }

  function handlePrevMonth() {
    setSelectedMonth((m) => shiftMonth(m, -1));
  }

  function handleNextMonth() {
    const next = shiftMonth(selectedMonth, 1);
    if (next <= currentMonthStr()) {
      setSelectedMonth(next);
    }
  }

  // --------------- render ---------------

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8127cf]">
            Attendance
          </p>
          <h2 className="text-2xl font-black text-[#1f1a23] tracking-tight mt-1">
            {selectedClassId && classDetail
              ? classDetail.className
              : "Attendance Overview"}
          </h2>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {selectedClassId && (
            <BrandButton
              variant="soft"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={handleBackToOverview}
            >
              Back
            </BrandButton>
          )}
          <BrandButton
            variant="soft"
            icon={<Download className="h-4 w-4" />}
            onClick={() => {}}
          >
            Download Report
          </BrandButton>
        </div>
      </div>

      {/* ===== Period tabs + month nav ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Period selector */}
        <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={cn(
                "rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                period === p
                  ? "bg-white text-[#8127cf] shadow-md"
                  : "text-[#4d4354]/50 hover:text-[#8127cf]"
              )}
            >
              {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="h-9 w-9 rounded-xl bg-white border border-[#cfc2d6]/20 flex items-center justify-center text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-all cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-black text-[#1f1a23] min-w-[140px] text-center">
            {formatMonthLabel(selectedMonth)}
          </span>
          <button
            onClick={handleNextMonth}
            disabled={shiftMonth(selectedMonth, 1) > currentMonthStr()}
            className="h-9 w-9 rounded-xl bg-white border border-[#cfc2d6]/20 flex items-center justify-center text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ===== Class Detail View ===== */}
      {selectedClassId ? (
        <ClassDetailView
          data={classDetail}
          loading={loadingClass}
          month={selectedMonth}
          studentSearch={studentSearch}
          onStudentSearch={setStudentSearch}
          filteredStudents={filteredStudents}
          atRiskStudents={atRiskStudents}
        />
      ) : (
        /* ===== Overview View ===== */
        <>
          {/* Summary Stats Row */}
          {loadingSummary ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <SummaryStatCard
                icon={Users}
                label="Total Students"
                value={summaryTotal}
                tone="purple"
              />
              <SummaryStatCard
                icon={CalendarCheck}
                label="Present"
                value={summaryPresent}
                tone="green"
                sub={
                  summaryData?.totalRecords
                    ? `${pct(summaryPresent, summaryData.totalRecords)}%`
                    : undefined
                }
              />
              <SummaryStatCard
                icon={UserX}
                label="Absent"
                value={summaryAbsent}
                tone="rose"
                sub={
                  summaryData?.totalRecords
                    ? `${pct(summaryAbsent, summaryData.totalRecords)}%`
                    : undefined
                }
              />
              <SummaryStatCard
                icon={Clock}
                label="On Leave"
                value={summaryLeave}
                tone="amber"
                sub={
                  summaryData?.totalRecords
                    ? `${pct(summaryLeave, summaryData.totalRecords)}%`
                    : undefined
                }
              />
              <SummaryStatCard
                icon={TrendingUp}
                label="Attendance Rate"
                value={`${summaryRate}%`}
                tone="dark"
              />
            </div>
          )}

          {/* Donut + Monthly Class Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Donut chart card */}
            <div className="bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50 mb-4">
                Distribution
              </p>
              {loadingSummary ? (
                <ChartSkeleton />
              ) : (
                <>
                  <AttendanceDonut
                    present={summaryPresent}
                    absent={summaryAbsent}
                    leave={summaryLeave}
                  />
                  <DonutLegend
                    present={summaryPresent}
                    absent={summaryAbsent}
                    leave={summaryLeave}
                  />
                </>
              )}
            </div>

            {/* Class Breakdown Table */}
            <div className="lg:col-span-2 bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
              <div className="flex items-center justify-between gap-4 mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">
                  Class Breakdown &mdash; {formatMonthLabel(selectedMonth)}
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4d4354]/30" />
                  <input
                    type="text"
                    placeholder="Search class..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    className="h-9 w-44 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] pl-9 pr-3 text-xs font-semibold text-[#1f1a23] placeholder:text-[#4d4354]/30 outline-none focus:border-[#8127cf]/30 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
                  />
                </div>
              </div>

              {loadingMonthly ? (
                <TableSkeleton />
              ) : filteredClasses.length === 0 ? (
                <div className="py-12 text-center">
                  <BarChart3 className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                  <p className="text-sm font-bold text-[#4d4354]/40">
                    No class data for this month
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                    <span className="col-span-3">Class</span>
                    <span className="col-span-1 text-center">Students</span>
                    <span className="col-span-1 text-center text-emerald-600">P</span>
                    <span className="col-span-1 text-center text-rose-500">A</span>
                    <span className="col-span-1 text-center text-amber-500">L</span>
                    <span className="col-span-3">Progress</span>
                    <span className="col-span-2 text-right">Rate</span>
                  </div>

                  {filteredClasses.map((cls) => {
                    const rate = cls.percentage;
                    return (
                      <button
                        key={cls.classId}
                        onClick={() => handleClassClick(cls.classId)}
                        className="w-full grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl bg-[#f3f4f9]/50 hover:bg-[#fbf0fe] border border-transparent hover:border-[#8127cf]/10 transition-all cursor-pointer text-left group"
                      >
                        <span className="col-span-3 text-sm font-bold text-[#1f1a23] group-hover:text-[#8127cf] transition-colors truncate">
                          {cls.className}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-[#4d4354]/60 text-center">
                          {cls.studentCount}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-emerald-600 text-center">
                          {cls.present}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-rose-500 text-center">
                          {cls.absent}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-amber-500 text-center">
                          {cls.leave}
                        </span>
                        <span className="col-span-3">
                          <ProgressBar value={rate} />
                        </span>
                        <span
                          className={cn(
                            "col-span-2 text-right text-sm font-black",
                            rate >= 85
                              ? "text-emerald-600"
                              : rate >= 75
                                ? "text-amber-600"
                                : "text-rose-500"
                          )}
                        >
                          {rate}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* At-Risk Classes (campus-wide) */}
          {!loadingMonthly && campusAtRiskClasses.length > 0 && (
            <div className="bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-5">
                <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">
                    Attention Required
                  </p>
                  <p className="text-sm font-black text-[#1f1a23]">
                    Classes Below 75% Attendance
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {campusAtRiskClasses.map((cls) => (
                  <button
                    key={cls.classId}
                    onClick={() => handleClassClick(cls.classId)}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-rose-50/50 border border-rose-100 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer text-left"
                  >
                    <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                      <BarChart3 className="h-4 w-4 text-rose-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#1f1a23] truncate">
                        {cls.className}
                      </p>
                      <p className="text-[10px] font-bold text-rose-500">
                        {cls.percentage}% attendance &middot; {cls.absent} absences
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary Stat Card                                                  */
/* ------------------------------------------------------------------ */

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  tone: "purple" | "green" | "rose" | "amber" | "dark";
}) {
  const toneStyles: Record<string, string> = {
    purple: "bg-[#fbf0fe] text-[#8127cf]",
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-500",
    amber: "bg-amber-50 text-amber-600",
    dark: "bg-[#1f1a23] text-white",
  };

  return (
    <div className="bg-white p-5 rounded-[28px] border border-[#cfc2d6]/10 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-normal mb-2">
            {label}
          </p>
          <p className="text-2xl md:text-3xl font-black text-[#1f1a23] leading-none">
            {value}
          </p>
          {sub && (
            <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-normal mt-2">
              {sub}
            </p>
          )}
        </div>
        <div
          className={cn(
            "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0",
            toneStyles[tone]
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Class Detail View                                                  */
/* ------------------------------------------------------------------ */

function ClassDetailView({
  data,
  loading,
  month,
  studentSearch,
  onStudentSearch,
  filteredStudents,
  atRiskStudents,
}: {
  data: ClassDetailData | null;
  loading: boolean;
  month: string;
  studentSearch: string;
  onStudentSearch: (s: string) => void;
  filteredStudents: StudentAttendance[];
  atRiskStudents: AtRiskStudent[];
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
        <div className="py-16 text-center">
          <CalendarCheck className="mx-auto h-12 w-12 text-[#4d4354]/20 mb-4" />
          <p className="text-lg font-black text-[#1f1a23]">No attendance data</p>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            No records found for this class in {formatMonthLabel(month)}
          </p>
        </div>
      </div>
    );
  }

  const { totalStudents, classAveragePercentage, summary } = data;

  return (
    <div className="space-y-6">
      {/* Class-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryStatCard
          icon={Users}
          label="Total Students"
          value={totalStudents}
          tone="purple"
        />
        <SummaryStatCard
          icon={CalendarCheck}
          label="Total Present"
          value={summary.totalPresent}
          tone="green"
        />
        <SummaryStatCard
          icon={UserX}
          label="Total Absent"
          value={summary.totalAbsent}
          tone="rose"
        />
        <SummaryStatCard
          icon={TrendingUp}
          label="Class Average"
          value={`${classAveragePercentage}%`}
          tone="dark"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student table */}
        <div className="lg:col-span-2 bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
          <div className="flex items-center justify-between gap-4 mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">
              Student Attendance &mdash; {formatMonthLabel(month)}
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4d4354]/30" />
              <input
                type="text"
                placeholder="Search student..."
                value={studentSearch}
                onChange={(e) => onStudentSearch(e.target.value)}
                className="h-9 w-44 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] pl-9 pr-3 text-xs font-semibold text-[#1f1a23] placeholder:text-[#4d4354]/30 outline-none focus:border-[#8127cf]/30 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
              />
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="py-12 text-center">
              <User className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
              <p className="text-sm font-bold text-[#4d4354]/40">
                No students found
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                <span className="col-span-1">Roll</span>
                <span className="col-span-3">Name</span>
                <span className="col-span-1 text-center text-emerald-600">P</span>
                <span className="col-span-1 text-center text-rose-500">A</span>
                <span className="col-span-1 text-center text-amber-500">L</span>
                <span className="col-span-3">Progress</span>
                <span className="col-span-2 text-right">Status</span>
              </div>

              {filteredStudents.map((student) => (
                <div
                  key={student.studentId}
                  className={cn(
                    "grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl transition-all",
                    student.percentage < 75
                      ? "bg-rose-50/50 border border-rose-100"
                      : "bg-[#f3f4f9]/50 border border-transparent"
                  )}
                >
                  <span className="col-span-1 text-xs font-bold text-[#4d4354]/60">
                    {student.rollNo || "-"}
                  </span>
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center shrink-0 text-[10px] font-black text-[#8127cf]">
                      {student.profileImageUrl ? (
                        <img
                          src={student.profileImageUrl}
                          alt=""
                          className="h-full w-full rounded-xl object-cover"
                        />
                      ) : (
                        student.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      )}
                    </div>
                    <span className="text-sm font-bold text-[#1f1a23] truncate">
                      {student.name}
                    </span>
                  </div>
                  <span className="col-span-1 text-xs font-bold text-emerald-600 text-center">
                    {student.present}
                  </span>
                  <span className="col-span-1 text-xs font-bold text-rose-500 text-center">
                    {student.absent}
                  </span>
                  <span className="col-span-1 text-xs font-bold text-amber-500 text-center">
                    {student.leave}
                  </span>
                  <span className="col-span-3">
                    <ProgressBar value={student.percentage} />
                  </span>
                  <span className="col-span-2 flex justify-end">
                    <StatusBadge percentage={student.percentage} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* At-Risk Sidebar */}
        <div className="bg-white rounded-[30px] border border-[#cfc2d6]/10 p-6 shadow-lg">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">
                Below 75%
              </p>
              <p className="text-sm font-black text-[#1f1a23]">
                At-Risk Students ({atRiskStudents.length})
              </p>
            </div>
          </div>

          {atRiskStudents.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarCheck className="mx-auto h-8 w-8 text-emerald-300 mb-3" />
              <p className="text-sm font-bold text-emerald-600">All good!</p>
              <p className="text-xs font-semibold text-[#4d4354]/40 mt-1">
                No at-risk students this month
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {atRiskStudents.map((student) => (
                <div
                  key={student.studentId}
                  className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 text-[10px] font-black text-rose-600">
                      {student.profileImageUrl ? (
                        <img
                          src={student.profileImageUrl}
                          alt=""
                          className="h-full w-full rounded-xl object-cover"
                        />
                      ) : (
                        student.studentName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#1f1a23] truncate">
                        {student.studentName}
                      </p>
                      <p className="text-[10px] font-bold text-[#4d4354]/40">
                        Roll: {student.rollNo || "-"}
                      </p>
                    </div>
                    <span className="text-sm font-black text-rose-500 shrink-0">
                      {student.percentage}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[10px] font-bold">
                    <span className="text-rose-500">
                      {student.absentDays} days absent
                    </span>
                    {student.consecutiveAbsences > 0 && (
                      <span className="text-amber-600">
                        {student.consecutiveAbsences} consecutive
                      </span>
                    )}
                  </div>
                  <ProgressBar value={student.percentage} className="mt-2" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
