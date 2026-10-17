"use client";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import { AlertTriangle, BarChart3, CalendarCheck, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { Select } from "@/components/ui/select";
import { AttendanceSkeleton, classLabel, EmptyInline, TeacherErrorState, useTeacherData } from "@/components/teacher/teacher-components";
import { AttendanceExceptions, ClassRegister } from "@/components/attendance/class-register";
import { useUiText } from "@/components/locale/LocaleProvider";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// SKO-405: marking is the dated class register (unmarked state, review before submit, conflict review and
// reasoned corrections); Exceptions lists absences to follow up and family explanations to decide.
type ViewTab = "marking" | "exceptions" | "monthly";

export default function AttendancePage() {
  const ui = useUiText();
  const { data, loading, error, loadData } = useTeacherData();
  const [activeTab, setActiveTab] = useState<ViewTab>("marking");
  const searchParams = useSearchParams();
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
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
    try {
      const res = await fetch(`/api/attendance/monthly?classId=${classId}&month=${month}`);
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to load monthly report"));
      setMonthlyData(result);
    } catch { setMonthlyData(null); }
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
        <div className="flex h-10 items-center gap-0.5 rounded-xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-1">
          {([
            { key: "marking" as ViewTab, label: ui("Mark"), icon: CalendarCheck },
            { key: "exceptions" as ViewTab, label: ui("Exceptions"), icon: ListChecks },
            { key: "monthly" as ViewTab, label: ui("Monthly"), icon: BarChart3 },
          ]).map(({ key, label, icon: Icon }) => (
            <Button variant="choice" key={key} type="button" onClick={() => setActiveTab(key)} aria-pressed={activeTab === key} className="shrink-0 whitespace-nowrap px-2 justify-start" data-attendance-tab={key}>
              <Icon className="h-3.5 w-3.5" />
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
          />
        ) : activeTab === "exceptions" ? <AttendanceExceptions /> : classHubs.length ? (
          <ClassRegister key={attendanceClassId} classes={classHubs.map((cls: any) => ({ id: cls.id, label: classLabel(cls) }))} initialClassId={attendanceClassId} />
        ) : <EmptyInline text={ui("No classes are assigned to you.")} />}
      </div>
    </TeacherPage>
  );
}

/* ── Monthly Report Sub-View ── */

function MonthlyReportView({ classHubs, attendanceClassId, setAttendanceClassId, selectedMonth, adjustMonth, monthlyData, monthlyLoading }: {
  classHubs: any[]; attendanceClassId: string; setAttendanceClassId: (id: string) => void;
  selectedMonth: string; adjustMonth: (d: number) => void; monthlyData: any; monthlyLoading: boolean;
}) {
  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();

  return (
    <>
      {/* Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] items-end">
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Class</label>
            <Select value={attendanceClassId} onChange={(e: any) => setAttendanceClassId(e.target.value)} className={"min-w-[240px]"}>
              {classHubs.map((cls: any) => (
                <option key={cls.id} value={cls.id}>
                  {classLabel(cls)}{cls.inActiveCycle === false ? " (outside active cycle)" : ""}
                </option>
              ))}
              {!classHubs.length ? <option value="">No classes</option> : null}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" type="button" onClick={() => adjustMonth(-1)} title="Previous month" aria-label="Previous month" className="items-center justify-center">
              <ChevronLeft className="w-4 h-4 text-ink" />
            </Button>
            <div className="sk-panel h-10 px-4 flex items-center text-sm font-semibold text-[#1d1b20] min-w-[140px] justify-center">{monthLabel}</div>
            <Button size="icon" variant="outline" type="button" onClick={() => adjustMonth(1)} title="Next month" aria-label="Next month" className="items-center justify-center">
              <ChevronRight className="w-4 h-4 text-ink" />
            </Button>
          </div>
        </div>
      </div>

      {monthlyLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sk-panel p-5">
              <div className="skeleton-shimmer bg-[#e8e0ec]/50 h-5 w-40 rounded-lg mb-3" />
              <div className="skeleton-shimmer bg-[#e8e0ec]/50 h-3 w-64 rounded-lg" />
            </div>
          ))}
        </div>
      ) : monthlyData ? (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="sk-panel px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Students</p>
              <p className="mt-0.5 text-xl font-bold text-[#1d1b20]">{monthlyData.totalStudents}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200/60 px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Avg Attendance</p>
              <p className="mt-0.5 text-xl font-bold text-emerald-700">{monthlyData.classAveragePercentage}%</p>
            </div>
            <div className="rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">At-Risk</p>
              <p className="mt-0.5 text-xl font-bold text-rose-700">{monthlyData.atRiskStudents?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-[#fbf0fe]/80 border border-[#8127cf]/10 px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8127cf]">Total Days</p>
              <p className="mt-0.5 text-xl font-bold text-[#8127cf]">{monthlyData.summary ? monthlyData.summary.totalPresent + monthlyData.summary.totalAbsent + monthlyData.summary.totalLeave : 0}</p>
            </div>
          </div>

          {/* At-risk students */}
          {monthlyData.atRiskStudents?.length > 0 && (
            <div className="rounded-2xl border border-rose-200/40 bg-rose-50/30 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">At-Risk Students (&lt; 75% Attendance)</p>
              </div>
              <div className="space-y-2">
                {monthlyData.atRiskStudents.map((s: any) => (
                  <div key={s.studentId} className="sk-panel flex items-center justify-between gap-3 border-rose-100 px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-rose-100 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-rose-700">{s.rollNo || "#"}</span>
                      </div>
                      <p className="text-sm font-bold text-[#1d1b20] truncate">{s.studentName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-700">{s.percentage}%</span>
                      <span className="text-[10px] font-semibold text-ink-muted">{s.absentDays} absent</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student breakdown table */}
          <div className="sk-panel overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_80px_100px] gap-3 px-6 py-3 bg-[#fbf0fe]/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Student</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 text-center">Present</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 text-center">Absent</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 text-center">Leave</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8127cf] text-center">Rate</span>
            </div>
            <div className="divide-y divide-[#f3f4f9]">
              {(monthlyData.students || []).map((student: any) => (
                <div key={student.studentId} className={cn(
                  "grid grid-cols-1 sm:grid-cols-[1fr_80px_80px_80px_100px] gap-3 px-5 py-3.5 sm:items-center hover:bg-[#fbf0fe]/20 transition-colors",
                  student.percentage < 75 && "bg-rose-50/30"
                )}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-slate-50 shadow-sm">
                      <AvatarImage src={student.profileImageUrl} name={student.name} alt={student.name} initialsClassName="text-[10px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1d1b20] truncate">{student.name}</p>
                      <p className="text-[10px] font-semibold text-ink-subtle">{student.rollNo || "No roll"}</p>
                    </div>
                  </div>
                  <p className="text-center text-sm font-bold text-emerald-700">{student.present}</p>
                  <p className="text-center text-sm font-bold text-rose-700">{student.absent}</p>
                  <p className="text-center text-sm font-bold text-amber-700">{student.leave}</p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 max-w-[60px] h-1.5 bg-[#f3f4f9] rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", student.percentage >= 75 ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${Math.min(student.percentage, 100)}%` }} />
                    </div>
                    <span className={cn("text-xs font-bold", student.percentage >= 75 ? "text-emerald-700" : "text-rose-700")}>{student.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyInline text="Select a class and month to view attendance reports." />
      )}
    </>
  );
}
