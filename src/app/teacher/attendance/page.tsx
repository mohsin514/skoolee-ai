"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ViewTabs } from "@/components/ui/view-tabs";
import { AvatarImage } from "@/components/ui/avatar-image";
import { AlertTriangle, BarChart3, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, SearchX, TrendingUp, Users } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskStats, StatTile, deskRow, urgencyFirst } from "@/components/ui/desk";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { Select } from "@/components/ui/select";
import { IconButton } from "@/components/ui/icon-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { InfoTip } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { AttendanceSkeleton, classLabel, TeacherErrorState, useTeacherData } from "@/components/teacher/teacher-components";
import { AttendanceExceptions, ClassRegister } from "@/components/attendance/class-register";
import { OfflineRegister } from "@/components/offline/offline-register";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// SKO-405: marking is the dated class register (unmarked state, review before submit, conflict review and
// reasoned corrections); Exceptions lists absences to follow up and family explanations to decide.
type ViewTab = "marking" | "exceptions" | "monthly" | "offline";
const VIEW_TABS: ViewTab[] = ["marking", "exceptions", "monthly", "offline"];
const isViewTab = (value: string | null): value is ViewTab => VIEW_TABS.includes(value as ViewTab);

export default function AttendancePage() {
  const ui = useUiText();
  const { data, loading, error, loadData } = useTeacherData();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // The section is part of the URL (?tab=), so Back, a reload and a shared link keep it.
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<ViewTab>(isViewTab(requestedTab) ? requestedTab : "marking");
  const setActiveTab = (tab: ViewTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams.toString());
    if (tab === "marking") next.delete("tab"); else next.set("tab", tab);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  // A failed load used to fall through to the "select a class" prompt, so a
  // teacher could not tell an outage from an empty month.
  const [monthlyFailed, setMonthlyFailed] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const classHubs = data?.classHubs || [];

  useEffect(() => {
    if (!data || attendanceClassId) return;
    // A class card on "My Classes" links here with its own id.
    const requested = searchParams.get("classId");
    if (requested && classHubs.some((cls: any) => cls.id === requested)) { setAttendanceClassId(requested); return; }
    if (classHubs[0]?.id) setAttendanceClassId(classHubs[0].id);
  }, [data, attendanceClassId, classHubs, searchParams]);

  const loadMonthlyReport = useCallback(async (classId: string, month: string) => {
    if (!classId || !month) return;
    setMonthlyLoading(true);
    setMonthlyFailed(false);
    try {
      const res = await fetch(`/api/attendance/monthly?classId=${classId}&month=${month}`);
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to load monthly report"));
      setMonthlyData(result);
    } catch { setMonthlyData(null); setMonthlyFailed(true); }
    finally { setMonthlyLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "monthly" && attendanceClassId && selectedMonth) loadMonthlyReport(attendanceClassId, selectedMonth);
  }, [activeTab, attendanceClassId, selectedMonth, loadMonthlyReport]);

  const adjustMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (loading && !data) return <AttendanceSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  return (
    <TeacherPage
      icon={CalendarCheck}
      title="Attendance"
      description="Mark and submit each class register, decide absence explanations and follow up absences."
      tabs={
        <ViewTabs
          ariaLabel="Attendance sections"
          value={activeTab}
          onChange={(id) => setActiveTab(id as ViewTab)}
          items={[
            { id: "marking", label: "Mark" },
            { id: "exceptions", label: "Exceptions" },
            { id: "monthly", label: "Monthly" },
            // SKO-448: marking that keeps working without a connection.
            { id: "offline", label: "Offline" },
          ]}
        />
      }
    >
      <div className="space-y-3">
        {activeTab === "monthly" ? (
          <MonthlyReportView
            classHubs={classHubs}
            attendanceClassId={attendanceClassId}
            setAttendanceClassId={setAttendanceClassId}
            selectedMonth={selectedMonth}
            adjustMonth={adjustMonth}
            monthlyData={monthlyData}
            monthlyLoading={monthlyLoading}
            monthlyFailed={monthlyFailed}
            onRetry={() => loadMonthlyReport(attendanceClassId, selectedMonth)}
          />
        ) : activeTab === "exceptions" ? <AttendanceExceptions /> : activeTab === "offline" ? <OfflineRegister classes={classHubs.map((cls: any) => ({ id: cls.id, label: classLabel(cls) }))} /> : classHubs.length ? (
          <ClassRegister key={attendanceClassId} classes={classHubs.map((cls: any) => ({ id: cls.id, label: classLabel(cls) }))} initialClassId={attendanceClassId} />
        ) : (
          <div className="sk-panel sk-enter">
            <EmptyState
              icon={GraduationCap}
              title={ui("No classes are assigned to you.")}
              description={ui("Your classes appear here once a school administrator assigns them to you. Until then there is no register to mark.")}
            />
          </div>
        )}
      </div>
    </TeacherPage>
  );
}

/* ── Monthly Report Sub-View ── */

function MonthlyReportView({ classHubs, attendanceClassId, setAttendanceClassId, selectedMonth, adjustMonth, monthlyData, monthlyLoading, monthlyFailed = false, onRetry }: {
  classHubs: any[]; attendanceClassId: string; setAttendanceClassId: (id: string) => void;
  selectedMonth: string; adjustMonth: (d: number) => void; monthlyData: any; monthlyLoading: boolean;
  monthlyFailed?: boolean; onRetry?: () => void;
}) {
  const ui = useUiText();
  const locale = useLocale();
  // The month is named in the document's language (F23), not the browser's.
  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString(localeTag(locale), { month: "long", year: "numeric" });
  })();
  const students: any[] = useMemo(() => monthlyData?.students || [], [monthlyData]);
  // The At-risk tile filters the list; the lowest rates come first so the pupils to follow up lead.
  const [riskOnly, setRiskOnly] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = students.filter((student) => (!riskOnly || student.percentage < 75)
      && (!q || `${student.name || ""} ${student.rollNo || ""}`.toLowerCase().includes(q)));
    return urgencyFirst(list, (student) => (student.percentage < 75 ? 0 : 1));
  }, [students, riskOnly, query]);
  const clearFilters = () => { setRiskOnly(false); setQuery(""); };
  const atRiskCount = monthlyData?.atRiskStudents?.length || 0;

  return (
    <>
      {/* Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="grid w-full grid-cols-1 items-end gap-3 sm:w-auto sm:grid-cols-[minmax(240px,1fr)_auto]">
          <FormField name="monthlyClass" id="attendance-monthly-class" label={ui("Class")}>
            <Select value={attendanceClassId} onChange={(e: any) => setAttendanceClassId(e.target.value)}>
              {classHubs.map((cls: any) => (
                <option key={cls.id} value={cls.id}>
                  {classLabel(cls)}{cls.inActiveCycle === false ? ` ${ui("(outside active cycle)")}` : ""}
                </option>
              ))}
              {!classHubs.length ? <option value="">{ui("No classes")}</option> : null}
            </Select>
          </FormField>
          <div role="group" aria-label={ui("Month")} className="flex items-center gap-2">
            <IconButton variant="outline" label={ui("Previous month")} onClick={() => adjustMonth(-1)}>
              <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
            </IconButton>
            <div aria-live="polite" className="sk-panel flex min-h-11 min-w-[140px] flex-1 items-center justify-center px-4 text-sm font-semibold text-ink-strong sm:flex-none">{monthLabel}</div>
            <IconButton variant="outline" label={ui("Next month")} onClick={() => adjustMonth(1)}>
              <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
            </IconButton>
          </div>
        </div>
      </div>

      {monthlyLoading ? (
        <SkeletonRegion className="space-y-3" label={ui("Loading monthly report")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sk-panel px-4 py-3.5">
                <Skeleton className="h-3 w-20" delay={i * 60} />
                <Skeleton className="mt-2 h-6 w-12" delay={i * 60} />
              </div>
            ))}
          </div>
          <div className="sk-panel space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" delay={i * 60} />
                <Skeleton className="h-4 w-40" delay={i * 60} />
                <Skeleton className="ms-auto h-3 w-24" delay={i * 60} />
              </div>
            ))}
          </div>
        </SkeletonRegion>
      ) : monthlyFailed ? (
        <div className="sk-panel">
          <ErrorState
            title={ui("Couldn't load the monthly report")}
            description={ui("Check your connection and try again. Nothing in the register has changed.")}
            onRetry={onRetry}
          />
        </div>
      ) : monthlyData ? (
        <>
          {/* Summary stats — At risk is a filter for the list below. */}
          <DeskStats>
            <StatTile index={0} icon={Users} tone="brand" label={ui("Students")} value={<bdi>{monthlyData.totalStudents}</bdi>} />
            <StatTile index={1} icon={TrendingUp} tone="success" label={<span className="inline-flex items-center gap-0.5">{ui("Average attendance")}<InfoTip className="-my-1" content={ui("The average of every student's attendance rate this month, counted with your school's attendance rule.")} /></span>} value={<bdi>{monthlyData.classAveragePercentage}%</bdi>} />
            <StatTile index={2} icon={AlertTriangle} tone={atRiskCount ? "danger" : "neutral"} label={ui("At risk")} value={<bdi>{atRiskCount}</bdi>}
              onSelect={atRiskCount ? () => setRiskOnly((value) => !value) : undefined} selected={riskOnly} />
            <StatTile index={3} icon={CalendarDays} tone="info" label={<span className="inline-flex items-center gap-0.5">{ui("Total days")}<InfoTip className="-my-1" content={ui("Every present, absent and leave entry recorded for this class this month, added together.")} /></span>} value={<bdi>{monthlyData.summary ? monthlyData.summary.totalPresent + monthlyData.summary.totalAbsent + monthlyData.summary.totalLeave : 0}</bdi>} />
          </DeskStats>

          {/* At-risk students */}
          {monthlyData.atRiskStudents?.length > 0 && !riskOnly && (
            <Alert tone="warning" live="off" title={ui("At-risk students (below 75% attendance)")}>
              <ul className="mt-2 space-y-2">
                {monthlyData.atRiskStudents.map((s: any) => (
                  <li key={s.studentId} className="sk-panel flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-status-error-surface px-1.5">
                        <span className="text-2xs font-bold tabular-nums text-status-error-text">{s.rollNo || "#"}</span>
                      </div>
                      <p className="truncate text-sm font-semibold text-ink-strong">{s.studentName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="danger" size="sm" dot data-numeric>{s.percentage}%</Badge>
                      <span className="text-xs tabular-nums text-ink-subtle">{ui("{0} absent", [s.absentDays])}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Student breakdown table */}
          {students.length === 0 ? (
            <div className="sk-panel">
              <EmptyState
                size="sm"
                icon={CalendarCheck}
                title={ui("No attendance recorded yet")}
                description={ui("Nothing has been marked for this class in {0} yet. The report fills in as you mark the register.", [monthLabel])}
              />
            </div>
          ) : (
            <>
            {students.length > 8 ? <DeskQuickFilter value={query} onChange={setQuery} label={ui("Filter this list")} /> : null}
            <DeskFilterStatus shown={shown.length} total={students.length} onClear={clearFilters} />
            {shown.length === 0 ? (
              <div className="sk-panel">
                <EmptyState size="sm" icon={SearchX} title={ui("No pupils found")} description={ui("Try adjusting your search or filter.")} />
              </div>
            ) : (
            <div className="sk-panel overflow-hidden">
              <div className="hidden gap-3 bg-surface-subtle px-5 py-3 sm:grid sm:grid-cols-[1fr_80px_80px_80px_100px]">
                <span className="text-2xs font-semibold text-ink-muted">{ui("Student")}</span>
                <span className="text-center text-2xs font-semibold text-status-success-text">{ui("Present")}</span>
                <span className="text-center text-2xs font-semibold text-status-error-text">{ui("Absent")}</span>
                <span className="text-center text-2xs font-semibold text-status-warning-text">{ui("Leave")}</span>
                <span className="text-center text-2xs font-semibold text-primary">{ui("Rate")}</span>
              </div>
              <div className="divide-y divide-muted">
                {shown.map((student: any) => (
                  <div key={student.studentId} data-tone={student.percentage < 75 ? "danger" : undefined} className={cn(
                    deskRow,
                    "grid grid-cols-4 gap-x-3 gap-y-2.5 rounded-none border-0 shadow-none px-5 py-3.5 sm:grid-cols-[1fr_80px_80px_80px_100px] sm:items-center",
                  )}>
                    <div className="col-span-4 flex min-w-0 items-center gap-3 sm:col-span-1">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border-2 border-card bg-surface-subtle shadow-sm">
                        <AvatarImage src={student.profileImageUrl} name={student.name} alt={student.name} initialsClassName="text-2xs" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-strong">{student.name}</p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">{student.rollNo || ui("No roll")}{student.percentage < 75 ? <DeskPill tone="danger">{ui("At risk")}</DeskPill> : null}</p>
                      </div>
                    </div>
                    <p className="text-center text-sm font-bold tabular-nums text-status-success-text">
                      <span className="block text-2xs font-semibold text-ink-subtle sm:hidden">{ui("Present")}</span>
                      {student.present}
                    </p>
                    <p className="text-center text-sm font-bold tabular-nums text-status-error-text">
                      <span className="block text-2xs font-semibold text-ink-subtle sm:hidden">{ui("Absent")}</span>
                      {student.absent}
                    </p>
                    <p className="text-center text-sm font-bold tabular-nums text-status-warning-text">
                      <span className="block text-2xs font-semibold text-ink-subtle sm:hidden">{ui("Leave")}</span>
                      {student.leave}
                    </p>
                    <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2">
                      <span className="text-2xs font-semibold text-ink-subtle sm:hidden">{ui("Rate")}</span>
                      <Progress
                        className="hidden max-w-[60px] flex-1 sm:block"
                        size="sm"
                        value={Math.min(student.percentage, 100)}
                        tone={student.percentage >= 75 ? "success" : "danger"}
                        label={ui("Attendance rate for {0}", [student.name])}
                      />
                      <span className={cn("text-xs font-bold tabular-nums", student.percentage >= 75 ? "text-status-success-text" : "text-status-error-text")}>{student.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
            </>
          )}
        </>
      ) : (
        <div className="sk-panel">
          <EmptyState
            size="sm"
            icon={BarChart3}
            title={ui("Monthly report")}
            description={ui("Select a class and month to view attendance reports.")}
          />
        </div>
      )}
    </>
  );
}
