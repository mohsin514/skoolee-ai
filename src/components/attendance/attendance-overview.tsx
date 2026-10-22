"use client";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
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
import { NO_ENTRY_ANIMATION } from "@/components/insights";
import { STATUS } from "@/components/insights/palette";
import { BrandButton } from "@/components/role-dashboard";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";


/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AttendanceOverviewProps {
  campusId?: string;
  /**
   * Host-owned header (§4.4b "Attendance": Export secondary): each new number downloads what is on screen, and the
   * in-panel "Download report" button is not rendered (the PageHeader carries it).
   */
  exportRequest?: number;
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

function formatMonthLabel(ym: string, language?: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString(language, {
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
    <div className="sk-panel p-6 animate-skeleton-in">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3 flex-1">
          <div className="h-3 w-20 rounded-full bg-border-subtle/50 skeleton-shimmer" />
          <div className="h-8 w-16 rounded-full bg-border-subtle/50 skeleton-shimmer" />
        </div>
        <div className="h-11 w-11 rounded-2xl bg-border-subtle/50 skeleton-shimmer" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl bg-border-subtle/20 p-4 animate-skeleton-in"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="h-4 w-32 rounded-full bg-border-subtle/50 skeleton-shimmer" />
          <div className="h-4 flex-1 rounded-full bg-border-subtle/50 skeleton-shimmer" />
          <div className="h-4 w-16 rounded-full bg-border-subtle/50 skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center animate-skeleton-in">
      <div className="h-40 w-40 rounded-full bg-border-subtle/50 skeleton-shimmer" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

// The chart palette's status colours (one source for every chart) — present, absent, on leave.
const DONUT_COLORS = [STATUS.good, STATUS.critical, STATUS.warning];

function AttendanceDonut({
  present,
  absent,
  leave,
}: {
  present: number;
  absent: number;
  leave: number;
}) {
  const ui = useUiText();
  const total = present + absent + leave;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-ink-subtle">
        {ui("No records yet")}
      </div>
    );
  }

  const data = [
    { name: ui("Present"), value: present },
    { name: ui("Absent"), value: absent },
    { name: ui("On leave"), value: leave },
  ];

  return (
    <div className="relative h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            {...NO_ENTRY_ANIMATION}
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
        <span className="text-2xl font-bold text-ink-strong">{total}</span>
        <span className="text-xs font-semibold text-ink-subtle">
          {ui("Records")}
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
  const ui = useUiText();
  const items = [
    { label: ui("Present"), value: present, color: "bg-status-success-text" },
    { label: ui("Absent"), value: absent, color: "bg-status-error-text" },
    { label: ui("On leave"), value: leave, color: "bg-status-warning-text" },
  ];
  return (
    <div className="flex items-center justify-center gap-5 mt-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", it.color)} />
          <span className="text-2xs font-bold text-ink-muted">
            {it.label}
          </span>
          <span className="text-2xs font-bold text-ink-strong">
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
        "h-2 w-full rounded-full bg-border-subtle/40 overflow-hidden",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-brand-400 transition-all duration-500 motion-reduce:transition-none"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function StatusBadge({ percentage }: { percentage: number }) {
  const ui = useUiText();
  if (percentage < 75) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-error-surface px-2.5 py-0.5 text-2xs font-semibold text-status-error-text">
        <AlertTriangle aria-hidden="true" className="h-3 w-3" />
        {ui("At risk")}
      </span>
    );
  }
  if (percentage < 85) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-warning-surface px-2.5 py-0.5 text-2xs font-semibold text-status-warning-text">
        {ui("Watch")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-success-surface px-2.5 py-0.5 text-2xs font-semibold text-status-success-text">
      {ui("Good")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AttendanceOverview({ campusId, exportRequest }: AttendanceOverviewProps) {
  const ui = useUiText();
  const { language } = useLocale();
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
  // R4: a failed read is one inline alert with retry, never a toast (it used to fire up to three).
  const [loadError, setLoadError] = useState<null | "summary" | "monthly" | "class">(null);

  const [classSearch, setClassSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  // --------------- fetchers ---------------

  const fetchSummary = useCallback(
    async (p: Period) => {
      setLoadingSummary(true);
      setLoadError((e) => (e === "summary" ? null : e));
      try {
        const qs = new URLSearchParams({ period: p });
        if (campusId) qs.set("campusId", campusId);
        const res = await fetch(`/api/attendance/school-summary?${qs}`);
        if (!res.ok) throw new Error("Failed to load summary");
        const data: SummaryData = await res.json();
        setSummaryData(data);
      } catch {
        setSummaryData(null);
        setLoadError("summary");
      } finally {
        setLoadingSummary(false);
      }
    },
    [campusId]
  );

  const fetchMonthly = useCallback(
    async (month: string) => {
      setLoadingMonthly(true);
      setLoadError((e) => (e === "monthly" ? null : e));
      try {
        const qs = new URLSearchParams({ month });
        if (campusId) qs.set("campusId", campusId);
        const res = await fetch(`/api/attendance/monthly?${qs}`);
        if (!res.ok) throw new Error("Failed to load monthly data");
        const data: MonthlyData = await res.json();
        setMonthlyData(data);
      } catch {
        setMonthlyData(null);
        setLoadError("monthly");
      } finally {
        setLoadingMonthly(false);
      }
    },
    [campusId]
  );

  const fetchClassDetail = useCallback(
    async (classId: string, month: string) => {
      setLoadingClass(true);
      setLoadError((e) => (e === "class" ? null : e));
      try {
        const qs = new URLSearchParams({ classId, month });
        if (campusId) qs.set("campusId", campusId);
        const res = await fetch(`/api/attendance/monthly?${qs}`);
        if (!res.ok) throw new Error("Failed to load class detail");
        const data: ClassDetailData = await res.json();
        setClassDetail(data);
      } catch {
        setClassDetail(null);
        setLoadError("class");
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

  /**
   * Exports whatever is currently on screen, not a fixed report — the button
   * sits above three different views and used to be wired to nothing at all.
   * Inside a class it writes the per-student register; on the monthly view the
   * per-class roll-up; on today/week the class breakdown behind the stat cards.
   */
  function handleDownloadReport() {
    if (classDetail) {
      downloadCSV(
        `attendance-${classDetail.className.replace(/\s+/g, "-")}-${classDetail.month}`,
        [
          [ui("Roll no."), ui("Student"), ui("Present"), ui("Absent"), ui("Leave"), ui("Attendance %")],
          ...classDetail.students.map((st) => [
            st.rollNo,
            st.name,
            st.present,
            st.absent,
            st.leave,
            st.percentage,
          ]),
        ]
      );
      toast.success(ui("Exported {0} students", [classDetail.students.length]));
      return;
    }

    if (period === "month" && monthlyData) {
      downloadCSV(`attendance-by-class-${monthlyData.month}`, [
        [ui("Class"), ui("Students"), ui("Present"), ui("Absent"), ui("Leave"), ui("Marked"), ui("Attendance %")],
        ...monthlyData.classes.map((c) => [
          c.className,
          c.studentCount,
          c.present,
          c.absent,
          c.leave,
          c.total,
          c.percentage,
        ]),
      ]);
      toast.success(ui("Exported {0} classes", [monthlyData.classes.length]));
      return;
    }

    if (summaryData) {
      downloadCSV(`attendance-${summaryData.period}-${currentMonthStr()}`, [
        [ui("Class"), ui("Students"), ui("Present"), ui("Absent"), ui("Leave"), ui("Marked"), ui("Not marked")],
        ...summaryData.classBreakdown.map((c) => [
          c.className,
          c.totalStudents,
          c.present,
          c.absent,
          c.leave,
          c.marked,
          c.unmarked,
        ]),
      ]);
      toast.success(ui("Exported {0} classes", [summaryData.classBreakdown.length]));
      return;
    }

    toast.error(ui("Nothing to export yet. Attendance appears here once registers are marked."));
  }

  // Header-driven export: only a new number downloads (never on mount).
  const seenExport = useRef(exportRequest);
  useEffect(() => {
    if (exportRequest === undefined || seenExport.current === exportRequest) return;
    seenExport.current = exportRequest;
    handleDownloadReport();
    // Reads the data on screen at the moment of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRequest]);

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

  const retryLoad = () => {
    if (loadError === "summary") void fetchSummary(period);
    else if (loadError === "monthly") void fetchMonthly(selectedMonth);
    else if (loadError === "class" && selectedClassId) void fetchClassDetail(selectedClassId, selectedMonth);
  };

  return (
    <div className="space-y-6">
      {loadError ? (
        <Alert
          tone="danger"
          live="polite"
          title={ui(loadError === "summary" ? "The attendance summary could not be loaded" : loadError === "monthly" ? "This month's attendance could not be loaded" : "This class's attendance could not be loaded")}
          actions={<Button type="button" variant="outline" size="sm" onClick={retryLoad}>{ui("Try again")}</Button>}
        >
          {ui("Check your connection and try again.")}
        </Alert>
      ) : null}
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          {selectedClassId && classDetail ? (
            <h2 className="text-2xl font-bold text-ink-strong tracking-tight mt-1">
              <bdi>{classDetail.className}</bdi>
            </h2>
          ) : null}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {selectedClassId && (
            <BrandButton
              variant="soft"
              icon={<ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />}
              onClick={handleBackToOverview}
            >
              {ui("All classes")}
            </BrandButton>
          )}
          {exportRequest === undefined ? (
            <BrandButton
              variant="soft"
              icon={<Download aria-hidden="true" className="h-4 w-4" />}
              onClick={handleDownloadReport}
            >
              {ui("Download report")}
            </BrandButton>
          ) : null}
        </div>
      </div>

      {/* ===== Period tabs + month nav ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Period selector */}
        <div role="group" aria-label={ui("Period")} className="flex items-center gap-1 rounded-2xl bg-muted p-1">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <Button variant="ghost" size="sm"
              key={p}
              aria-pressed={period === p}
              onClick={() => handlePeriodChange(p)}
              className={cn(
                "",
                period === p
                  ? "bg-card shadow-md"
                  : "text-ink-muted"
              )}
            >
              {ui(p === "today" ? "Today" : p === "week" ? "This week" : "This month")}
            </Button>
          ))}
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <IconButton variant="outline" size="sm" label={ui("Previous month")} onClick={handlePrevMonth}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
          </IconButton>
          <span className="text-sm font-bold text-ink-strong min-w-[140px] text-center">
            {formatMonthLabel(selectedMonth, language)}
          </span>
          <IconButton variant="outline" size="sm" label={ui("Next month")}
            onClick={handleNextMonth}
            disabled={shiftMonth(selectedMonth, 1) > currentMonthStr()}
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
          </IconButton>
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
                label={ui("Students")}
                value={summaryTotal}
                tone="purple"
              />
              <SummaryStatCard
                icon={CalendarCheck}
                label={ui("Present")}
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
                label={ui("Absent")}
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
                label={ui("On leave")}
                value={summaryLeave}
                tone="amber"
                sub={
                  summaryData?.totalRecords
                    ? `${pct(summaryLeave, summaryData.totalRecords)}%`
                    : undefined
                }
              />
              {/*
                No records for the period is not a 0% attendance rate. Marking
                simply has not happened yet, and a big dark "0%" read as though
                every student were absent.
              */}
              <SummaryStatCard
                icon={TrendingUp}
                label={ui("Attendance rate")}
                value={summaryData?.totalRecords ? `${summaryRate}%` : "—"}
                tone="dark"
                sub={summaryData?.totalRecords ? undefined : ui("Not marked yet")}
              />
            </div>
          )}

          {/* Donut + Monthly Class Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Donut chart card */}
            <div className="sk-panel min-w-0 p-5 sm:p-6">
              <h3 className="text-sm font-bold text-ink-strong mb-4">
                {ui("Distribution")}
              </h3>
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
            <div className="lg:col-span-2 sk-panel min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <h3 className="text-sm font-bold text-ink-strong">
                  {ui("Classes — {0}", [formatMonthLabel(selectedMonth, language)])}
                </h3>
                <InputGroup surfaceClassName="bg-muted" className="relative">
                  <Search aria-hidden="true" data-field-affix="start" className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle" />
                  <SystemInput
                    type="text"
                    aria-label={ui("Search classes")}
                    placeholder={ui("Search classes…")}
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    className="w-full ps-9 pe-3 sm:w-44"
                  />
                </InputGroup>
              </div>

              {loadingMonthly ? (
                <TableSkeleton />
              ) : filteredClasses.length === 0 ? (
                <EmptyState size="sm" icon={BarChart3} title={ui("No class data for this month")} description={ui(classSearch ? "No class matches your search." : "Classes appear here once their registers are marked.")} />
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pe-1">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-ink-subtle">
                    <span className="col-span-3">{ui("Class")}</span>
                    <span className="col-span-1 text-center">{ui("Students")}</span>
                    <abbr title={ui("Present")} className="col-span-1 text-center text-status-success-text no-underline">{ui("Pres.")}</abbr>
                    <abbr title={ui("Absent")} className="col-span-1 text-center text-status-error-text no-underline">{ui("Abs.")}</abbr>
                    <abbr title={ui("On leave")} className="col-span-1 text-center text-status-warning-text no-underline">{ui("Lv.")}</abbr>
                    <span className="col-span-3">{ui("Progress")}</span>
                    <span className="col-span-2 text-end">{ui("Rate")}</span>
                  </div>

                  {filteredClasses.map((cls) => {
                    const rate = cls.percentage;
                    return (
                      <Button variant="outline"
                        key={cls.classId}
                        onClick={() => handleClassClick(cls.classId)}
                        className="sk-row-interactive w-full grid grid-cols-12 gap-2 items-center text-start tabular-nums group"
                      >
                        <bdi className="col-span-3 text-sm font-bold text-ink-strong group-hover:text-primary transition-colors truncate">
                          {cls.className}
                        </bdi>
                        <span className="col-span-1 text-xs font-bold text-ink-muted text-center">
                          {cls.studentCount}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-status-success-text text-center">
                          {cls.present}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-status-error-text text-center">
                          {cls.absent}
                        </span>
                        <span className="col-span-1 text-xs font-bold text-status-warning-text text-center">
                          {cls.leave}
                        </span>
                        <span className="col-span-3">
                          <ProgressBar value={rate} />
                        </span>
                        <span
                          className={cn(
                            "col-span-2 text-end text-sm font-bold",
                            rate >= 85
                              ? "text-status-success-text"
                              : rate >= 75
                                ? "text-status-warning-text"
                                : "text-status-error-text"
                          )}
                        >
                          {rate}%
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* At-Risk Classes (campus-wide) */}
          {!loadingMonthly && campusAtRiskClasses.length > 0 && (
            <div className="sk-panel min-w-0 p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <div aria-hidden="true" className="h-8 w-8 rounded-xl bg-status-error-surface flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-status-error-text" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-muted">
                    {ui("Attention required")}
                  </p>
                  <h3 className="text-sm font-bold text-ink-strong">
                    {ui("Classes below 75% attendance")}
                  </h3>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {campusAtRiskClasses.map((cls) => (
                  <Button variant="outline"
                    key={cls.classId}
                    onClick={() => handleClassClick(cls.classId)}
                    className="flex justify-start items-center gap-4 text-start"
                  >
                    <div className="h-10 w-10 rounded-xl bg-status-error-surface flex items-center justify-center shrink-0">
                      <BarChart3 aria-hidden="true" className="h-4 w-4 text-status-error-text" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <bdi className="block text-sm font-bold text-ink-strong truncate">
                        {cls.className}
                      </bdi>
                      <p className="text-xs font-medium tabular-nums text-status-error-text">
                        {ui("{0}% attendance · {1} absences", [cls.percentage, cls.absent])}
                      </p>
                    </div>
                  </Button>
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
    purple: "bg-brand-50 text-primary",
    green: "bg-status-success-surface text-status-success-text",
    rose: "bg-status-error-surface text-status-error-text",
    amber: "bg-status-warning-surface text-status-warning-text",
    dark: "bg-ink-strong text-primary-foreground",
  };

  return (
    <div className="bg-card p-5 rounded-[28px] border border-edge/10 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-subtle mb-2">
            {label}
          </p>
          <p className="text-2xl md:text-3xl font-extrabold text-ink-strong leading-none">
            {value}
          </p>
          {sub && (
            <p className="text-xs font-semibold text-ink-subtle mt-2">
              {sub}
            </p>
          )}
        </div>
        <div
          aria-hidden="true"
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
  const ui = useUiText();
  const { language } = useLocale();
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="sk-panel min-w-0 p-5 sm:p-6">
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sk-panel min-w-0 p-5 sm:p-6">
        <EmptyState icon={CalendarCheck} title={ui("No attendance data")} description={ui("No records found for this class in {0}.", [formatMonthLabel(month, language)])} />
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
          label={ui("Students")}
          value={totalStudents}
          tone="purple"
        />
        <SummaryStatCard
          icon={CalendarCheck}
          label={ui("Present")}
          value={summary.totalPresent}
          tone="green"
        />
        <SummaryStatCard
          icon={UserX}
          label={ui("Absent")}
          value={summary.totalAbsent}
          tone="rose"
        />
        <SummaryStatCard
          icon={TrendingUp}
          label={ui("Class average")}
          value={`${classAveragePercentage}%`}
          tone="dark"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student table */}
        <div className="lg:col-span-2 sk-panel min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <h3 className="text-sm font-bold text-ink-strong">
              {ui("Students — {0}", [formatMonthLabel(month, language)])}
            </h3>
            <InputGroup surfaceClassName="bg-muted" className="relative">
              <Search aria-hidden="true" data-field-affix="start" className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle" />
              <SystemInput
                type="text"
                aria-label={ui("Search students")}
                placeholder={ui("Search students…")}
                value={studentSearch}
                onChange={(e) => onStudentSearch(e.target.value)}
                className="w-full ps-9 pe-3 sm:w-44"
              />
            </InputGroup>
          </div>

          {filteredStudents.length === 0 ? (
            <EmptyState size="sm" icon={User} title={ui("No students found")} description={ui("Try a different name or roll number.")} />
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pe-1">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-ink-subtle">
                <span className="col-span-1">{ui("Roll")}</span>
                <span className="col-span-3">{ui("Name")}</span>
                <abbr title={ui("Present")} className="col-span-1 text-center text-status-success-text no-underline">{ui("Pres.")}</abbr>
                <abbr title={ui("Absent")} className="col-span-1 text-center text-status-error-text no-underline">{ui("Abs.")}</abbr>
                <abbr title={ui("On leave")} className="col-span-1 text-center text-status-warning-text no-underline">{ui("Lv.")}</abbr>
                <span className="col-span-3">{ui("Progress")}</span>
                <span className="col-span-2 text-end">{ui("Status")}</span>
              </div>

              {filteredStudents.map((student) => (
                <div
                  key={student.studentId}
                  className={cn(
                    "grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl transition-all",
                    student.percentage < 75
                      ? "bg-status-error-surface border border-status-error-border"
                      : "bg-muted/50 border border-transparent"
                  )}
                >
                  <span className="col-span-1 text-xs font-bold text-ink-muted">
                    {student.rollNo || "-"}
                  </span>
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 text-2xs font-bold text-primary">
                      {(() => {
                        const imgSrc = resolveMediaUrl(student.profileImageUrl);
                        return imgSrc ? (
                          <img
                            src={imgSrc}
                            alt=""
                            className="h-full w-full rounded-xl object-cover"
                          />
                        ) : null;
                      })()}
                      {!resolveMediaUrl(student.profileImageUrl) && (
                        student.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      )}
                    </div>
                    <bdi className="text-sm font-bold text-ink-strong truncate">
                      {student.name}
                    </bdi>
                  </div>
                  <span className="col-span-1 text-xs font-bold text-status-success-text text-center">
                    {student.present}
                  </span>
                  <span className="col-span-1 text-xs font-bold text-status-error-text text-center">
                    {student.absent}
                  </span>
                  <span className="col-span-1 text-xs font-bold text-status-warning-text text-center">
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
        <div className="sk-panel min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div aria-hidden="true" className="h-8 w-8 rounded-xl bg-status-error-surface flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-status-error-text" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-muted">
                {ui("Below {0}%", [75])}
              </p>
              <h3 className="text-sm font-bold text-ink-strong">
                {ui("Students at risk ({0})", [atRiskStudents.length])}
              </h3>
            </div>
          </div>

          {atRiskStudents.length === 0 ? (
            <EmptyState size="sm" icon={CalendarCheck} title={ui("All good")} description={ui("No students are at risk this month.")} />
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pe-1">
              {atRiskStudents.map((student) => (
                <div
                  key={student.studentId}
                  className="p-4 rounded-2xl bg-status-error-surface border border-status-error-border"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-card flex items-center justify-center shrink-0 text-2xs font-bold text-status-error-text">
                      {(() => {
                        const imgSrc = resolveMediaUrl(student.profileImageUrl);
                        return imgSrc ? (
                          <img
                            src={imgSrc}
                            alt=""
                            className="h-full w-full rounded-xl object-cover"
                          />
                        ) : null;
                      })()}
                      {!resolveMediaUrl(student.profileImageUrl) && (
                        student.studentName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <bdi className="block text-sm font-bold text-ink-strong truncate">
                        {student.studentName}
                      </bdi>
                      <p className="text-2xs font-bold text-ink-subtle">
                        {ui("Roll: {0}", [student.rollNo || "-"])}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-status-error-text shrink-0">
                      {student.percentage}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-2xs font-bold">
                    <span className="text-status-error-text">
                      {ui(student.absentDays === 1 ? "1 day absent" : "{0} days absent", [student.absentDays])}
                    </span>
                    {student.consecutiveAbsences > 0 && (
                      <span className="text-status-warning-text">
                        {ui("{0} in a row", [student.consecutiveAbsences])}
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
