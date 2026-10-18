"use client";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import { BarChart3, CalendarCheck, ChevronLeft, ChevronRight, GraduationCap, ListChecks, WifiOff } from "lucide-react";
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
import { useUiText } from "@/components/locale/LocaleProvider";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// SKO-405: marking is the dated class register (unmarked state, review before submit, conflict review and
// reasoned corrections); Exceptions lists absences to follow up and family explanations to decide.
type ViewTab = "marking" | "exceptions" | "monthly" | "offline";

export default function AttendancePage() {
  const ui = useUiText();
  const { data, loading, error, loadData } = useTeacherData();
  const [activeTab, setActiveTab] = useState<ViewTab>("marking");
  const searchParams = useSearchParams();
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
      tone="attendance"
      icon={CalendarCheck}
      eyebrow={ui("Attendance")}
      title={ui("Daily Attendance")}
      summary={ui("Mark student attendance per class and date")}
      actions={
        <div role="group" aria-label={ui("Attendance views")} className="flex flex-wrap items-center gap-0.5 rounded-xl border border-edge/20 bg-surface-subtle p-1">
          {([
            { key: "marking" as ViewTab, label: ui("Mark"), icon: CalendarCheck },
            { key: "exceptions" as ViewTab, label: ui("Exceptions"), icon: ListChecks },
            { key: "monthly" as ViewTab, label: ui("Monthly"), icon: BarChart3 },
            // SKO-448: marking that keeps working without a connection.
            { key: "offline" as ViewTab, label: ui("Offline"), icon: WifiOff },
          ]).map(({ key, label, icon: Icon }) => (
            <Button variant="choice" size="sm" key={key} type="button" onClick={() => setActiveTab(key)} aria-pressed={activeTab === key} className="shrink-0 justify-start whitespace-nowrap px-2.5" data-attendance-tab={key}>
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>
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
  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();
  const students: any[] = monthlyData?.students || [];

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
          {/* Summary stats */}
          <div className="sk-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="sk-panel px-4 py-3.5">
              <p className="sk-eyebrow">{ui("Students")}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-ink-strong">{monthlyData.totalStudents}</p>
            </div>
            <div className="rounded-2xl border border-status-success-border bg-status-success-surface px-4 py-3.5 shadow-xs">
              <p className="flex items-center gap-0.5 text-2xs font-semibold uppercase tracking-wider text-emerald-700">
                <span className="min-w-0 truncate">{ui("Average attendance")}</span>
                <InfoTip className="-my-1" content={ui("The average of every student's attendance rate this month, counted with your school's attendance rule.")} />
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-emerald-700">{monthlyData.classAveragePercentage}%</p>
            </div>
            <div className="rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3.5 shadow-xs">
              <p className="flex items-center gap-0.5 text-2xs font-semibold uppercase tracking-wider text-rose-700">
                <span className="min-w-0 truncate">{ui("At risk")}</span>
                <InfoTip className="-my-1" content={ui("Students below 75% attendance this month who have at least one day recorded.")} />
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-rose-700">{monthlyData.atRiskStudents?.length || 0}</p>
            </div>
            <div className="rounded-2xl border border-status-brand-border bg-status-brand-surface px-4 py-3.5 shadow-xs">
              <p className="flex items-center gap-0.5 text-2xs font-semibold uppercase tracking-wider text-primary">
                <span className="min-w-0 truncate">{ui("Total Days")}</span>
                <InfoTip className="-my-1" content={ui("Every present, absent and leave entry recorded for this class this month, added together.")} />
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-primary">{monthlyData.summary ? monthlyData.summary.totalPresent + monthlyData.summary.totalAbsent + monthlyData.summary.totalLeave : 0}</p>
            </div>
          </div>

          {/* At-risk students */}
          {monthlyData.atRiskStudents?.length > 0 && (
            <Alert tone="warning" live="off" title={ui("At-risk students (below 75% attendance)")}>
              <ul className="mt-2 space-y-2">
                {monthlyData.atRiskStudents.map((s: any) => (
                  <li key={s.studentId} className="sk-panel flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 px-1.5">
                        <span className="text-2xs font-bold tabular-nums text-rose-700">{s.rollNo || "#"}</span>
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
            <div className="sk-panel overflow-hidden">
              <div className="hidden gap-3 bg-surface-subtle px-5 py-3 sm:grid sm:grid-cols-[1fr_80px_80px_80px_100px]">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{ui("Student")}</span>
                <span className="text-center text-2xs font-semibold uppercase tracking-wider text-emerald-700">{ui("Present")}</span>
                <span className="text-center text-2xs font-semibold uppercase tracking-wider text-rose-700">{ui("Absent")}</span>
                <span className="text-center text-2xs font-semibold uppercase tracking-wider text-amber-700">{ui("Leave")}</span>
                <span className="text-center text-2xs font-semibold uppercase tracking-wider text-primary">{ui("Rate")}</span>
              </div>
              <div className="divide-y divide-muted">
                {students.map((student: any) => (
                  <div key={student.studentId} className={cn(
                    "grid grid-cols-4 gap-x-3 gap-y-2.5 px-5 py-3.5 transition-colors hover:bg-surface-hover sm:grid-cols-[1fr_80px_80px_80px_100px] sm:items-center",
                    student.percentage < 75 && "bg-rose-50/30"
                  )}>
                    <div className="col-span-4 flex min-w-0 items-center gap-3 sm:col-span-1">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-slate-50 shadow-sm">
                        <AvatarImage src={student.profileImageUrl} name={student.name} alt={student.name} initialsClassName="text-2xs" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-strong">{student.name}</p>
                        <p className="text-xs text-ink-subtle">{student.rollNo || ui("No roll")}</p>
                      </div>
                    </div>
                    <p className="text-center text-sm font-bold tabular-nums text-emerald-700">
                      <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-subtle sm:hidden">{ui("Present")}</span>
                      {student.present}
                    </p>
                    <p className="text-center text-sm font-bold tabular-nums text-rose-700">
                      <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-subtle sm:hidden">{ui("Absent")}</span>
                      {student.absent}
                    </p>
                    <p className="text-center text-sm font-bold tabular-nums text-amber-700">
                      <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-subtle sm:hidden">{ui("Leave")}</span>
                      {student.leave}
                    </p>
                    <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle sm:hidden">{ui("Rate")}</span>
                      <Progress
                        className="hidden max-w-[60px] flex-1 sm:block"
                        size="sm"
                        value={Math.min(student.percentage, 100)}
                        tone={student.percentage >= 75 ? "success" : "danger"}
                        label={ui("Attendance rate for {0}", [student.name])}
                      />
                      <span className={cn("text-xs font-bold tabular-nums", student.percentage >= 75 ? "text-emerald-700" : "text-rose-700")}>{student.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
