"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, CalendarCheck, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Copy, History, ListChecks, Loader2, Plus, TrendingUp,
} from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { Select } from "@/components/ui/select";
import {
  AttendanceSkeleton, classLabel, EmptyInline, StudentMini, todayIso, useTeacherData,
} from "@/components/teacher/teacher-components";
import { cn } from "@/lib/utils";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE";
type ViewTab = "marking" | "monthly";

const STATUS_CONFIG = {
  PRESENT: { label: "Present", short: "P", activeClass: "bg-emerald-500 text-white ring-2 ring-emerald-300", chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100", dot: "bg-emerald-500" },
  ABSENT: { label: "Absent", short: "A", activeClass: "bg-rose-500 text-white ring-2 ring-rose-300", chipClass: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100", dot: "bg-rose-500" },
  LEAVE: { label: "Leave", short: "L", activeClass: "bg-amber-500 text-white ring-2 ring-amber-300", chipClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100", dot: "bg-amber-500" },
};

export default function AttendancePage() {
  const { data, loading, loadData } = useTeacherData();
  const [activeTab, setActiveTab] = useState<ViewTab>("marking");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [attendanceHistoryLoading, setAttendanceHistoryLoading] = useState(false);
  const [attendanceExists, setAttendanceExists] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [copyingPrevious, setCopyingPrevious] = useState(false);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const classHubs = data?.classHubs || [];
  const selectedAttendanceClass = classHubs.find((cls: any) => cls.id === attendanceClassId);
  const isEditingAttendance = attendanceExists && attendanceDate !== todayIso();

  useEffect(() => {
    if (!data) return;
    if (!attendanceClassId && classHubs[0]?.id) setAttendanceClassId(classHubs[0].id);
  }, [data, attendanceClassId, classHubs]);

  const loadAttendance = useCallback(async (classId: string, date: string) => {
    if (!classId || !date) return;
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/attendance?classId=${classId}&date=${date}`);
      const text = await res.text();
      const result = JSON.parse(text);
      const sum = result.summary || {};
      const summary = { total: sum.total || 0, present: sum.present || 0, absent: sum.absent || 0, leave: sum.leave || 0, unmarked: sum.unmarked || 0 };
      setAttendanceSummary(summary);
      if (result.students) {
        setAttendanceRows(result.students.map((s: any) => ({ ...s, status: s.attendance?.status || "PRESENT" })));
      } else {
        setAttendanceRows([]);
      }
      setAttendanceExists(result.students?.some((s: any) => s.attendance !== null) || false);
    } catch { setAttendanceSummary(null); setAttendanceRows([]); setAttendanceExists(false); }
    finally { setAttendanceLoading(false); }
  }, []);

  useEffect(() => { loadAttendance(attendanceClassId, attendanceDate); }, [attendanceClassId, attendanceDate, loadAttendance]);

  const loadAttendanceHistory = useCallback(async (classId: string) => {
    if (!classId) return;
    setAttendanceHistoryLoading(true);
    try {
      const res = await fetch(`/api/attendance/history?classId=${classId}`);
      const text = await res.text();
      const result = JSON.parse(text);
      setAttendanceHistory(result.history || []);
    } catch { setAttendanceHistory([]); }
    finally { setAttendanceHistoryLoading(false); }
  }, []);

  useEffect(() => { if (attendanceClassId) loadAttendanceHistory(attendanceClassId); }, [attendanceClassId, loadAttendanceHistory]);

  const markAllAttendance = useCallback((status: AttendanceStatus) => {
    setAttendanceRows((rows) => rows.map((row) => ({ ...row, status })));
  }, []);

  const saveAttendance = useCallback(async () => {
    if (!attendanceClassId || !attendanceRows.length) return;
    setAttendanceSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: attendanceClassId, date: attendanceDate, entries: attendanceRows.map((s) => ({ studentId: s.id, status: s.status })) }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to save");
      toast.success("Attendance saved");
      await loadAttendance(attendanceClassId, attendanceDate);
      await loadAttendanceHistory(attendanceClassId);
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setAttendanceSaving(false); }
  }, [attendanceClassId, attendanceDate, attendanceRows, loadAttendance, loadAttendanceHistory, loadData]);

  const adjustDate = (delta: number) => {
    const d = new Date(attendanceDate);
    d.setDate(d.getDate() + delta);
    setAttendanceDate(d.toISOString().slice(0, 10));
  };

  const copyFromPrevious = useCallback(async () => {
    if (!attendanceClassId) return;
    setCopyingPrevious(true);
    try {
      const prev = new Date(attendanceDate);
      prev.setDate(prev.getDate() - 1);
      const fromDate = prev.toISOString().slice(0, 10);
      const res = await fetch("/api/attendance/copy-previous", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: attendanceClassId, fromDate, toDate: attendanceDate }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to copy");
      toast.success(`Copied ${result.copiedRecords} records from ${fromDate}`);
      await loadAttendance(attendanceClassId, attendanceDate);
      await loadAttendanceHistory(attendanceClassId);
    } catch (error: any) { toast.error(error.message); }
    finally { setCopyingPrevious(false); }
  }, [attendanceClassId, attendanceDate, loadAttendance, loadAttendanceHistory]);

  const loadMonthlyReport = useCallback(async (classId: string, month: string) => {
    if (!classId || !month) return;
    setMonthlyLoading(true);
    try {
      const res = await fetch(`/api/attendance/monthly?classId=${classId}&month=${month}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to load monthly report");
      setMonthlyData(result);
    } catch { setMonthlyData(null); }
    finally { setMonthlyLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "monthly" && attendanceClassId && selectedMonth) {
      loadMonthlyReport(attendanceClassId, selectedMonth);
    }
  }, [activeTab, attendanceClassId, selectedMonth, loadMonthlyReport]);

  const adjustMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const stats = attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };
  const completion = stats.total ? Math.round(((stats.present + stats.absent + stats.leave) / stats.total) * 100) : 0;

  if (loading && !data) return <AttendanceSkeleton />;
  if (!data) return null;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <header className="relative overflow-hidden p-7 px-9 border-b border-[#cfc2d6]/12 bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CalendarCheck className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Attendance Management</span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Daily Attendance</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">Mark student attendance per class and date.</p>
          <div className="flex gap-2 mt-4">
            {([
              { key: "marking" as ViewTab, label: "Mark Attendance", icon: CalendarCheck },
              { key: "monthly" as ViewTab, label: "Monthly Report", icon: BarChart3 },
            ]).map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setActiveTab(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer active:scale-[0.95]",
                  activeTab === key
                    ? "bg-[#8127cf] text-white border-[#8127cf] shadow-lg shadow-[#8127cf]/20"
                    : "bg-white text-[#4d4354]/70 border-[#cfc2d6]/20 hover:border-[#8127cf]/30 hover:bg-[#fbf0fe]/50"
                )}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">

        {/* Monthly Report View */}
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
        ) : (<>

        {/* Editing banner */}
        {isEditingAttendance && (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3">
            <History className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">Editing past attendance &mdash; <span className="text-amber-600 font-normal">{attendanceDate}</span></p>
          </div>
        )}

        {/* Class & Date picker */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div>
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Class</label>
              <Select value={attendanceClassId} onChange={(e) => setAttendanceClassId(e.target.value)} className="min-w-[240px]">
                {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
                {!classHubs.length ? <option value="">No classes</option> : null}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => adjustDate(-1)} title="Previous day" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
                <ChevronLeft className="w-4 h-4 text-[#4d4354]" />
              </button>
              <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}
                className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 py-2 text-sm font-semibold text-[#1d1b20] transition-all hover:border-[#8127cf]/20" />
              <button type="button" onClick={() => adjustDate(1)} title="Next day" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
                <ChevronRight className="w-4 h-4 text-[#4d4354]" />
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setAttendanceDate(todayIso())} title="Reset to today's date"
            className="text-xs font-semibold text-[#8127cf] hover:underline cursor-pointer active:text-[#6a1fa8]">
            Back to today
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3.5" title="Total students in this class">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Total</p>
            <p className="mt-0.5 text-xl font-bold text-[#1d1b20]">{stats.total}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200/60 px-4 py-3.5 transition-all hover:bg-emerald-100/80" title="Students marked present">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Present</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-700">{stats.present}</p>
          </div>
          <div className="rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3.5 transition-all hover:bg-rose-100/80" title="Students marked absent">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Absent</p>
            <p className="mt-0.5 text-xl font-bold text-rose-700">{stats.absent}</p>
          </div>
          <div className="rounded-2xl bg-amber-50/80 border border-amber-200/60 px-4 py-3.5 transition-all hover:bg-amber-100/80" title="Students on leave">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Leave</p>
            <p className="mt-0.5 text-xl font-bold text-amber-700">{stats.leave}</p>
          </div>
          <div className="rounded-2xl bg-[#fbf0fe]/80 border border-[#8127cf]/10 px-4 py-3.5 transition-all hover:bg-[#fbf0fe]" title="Students not yet marked">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8127cf]">Unmarked</p>
            <p className="mt-0.5 text-xl font-bold text-[#8127cf]">{stats.unmarked}</p>
          </div>
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#f3f4f9] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 transition-all duration-500" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-xs font-semibold text-[#4d4354]/50 whitespace-nowrap">{completion}% marked</span>
          </div>
        )}

        {/* Bulk actions */}
        {attendanceRows.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/45 mb-2.5">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {([
                { status: "PRESENT" as AttendanceStatus, label: "All Present", icon: CheckCheck },
                { status: "ABSENT" as AttendanceStatus, label: "All Absent", icon: Plus },
                { status: "LEAVE" as AttendanceStatus, label: "All Leave", icon: Plus },
              ]).map(({ status, label, icon: Icon }) => (
                <button key={status} type="button" onClick={() => markAllAttendance(status)} title={`Mark all as ${label.toLowerCase()}`}
                  className={cn("inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer active:scale-[0.95]", STATUS_CONFIG[status].chipClass)}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
              <button type="button" onClick={copyFromPrevious} disabled={copyingPrevious}
                title="Copy attendance from previous day"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer active:scale-[0.95] bg-[#fbf0fe] text-[#8127cf] border-[#8127cf]/15 hover:bg-[#f3eeff] hover:border-[#8127cf]/30 disabled:opacity-50">
                {copyingPrevious ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Yesterday
              </button>
            </div>
          </div>
        )}

        {/* Student roster */}
        <div className="rounded-2xl border border-[#f3f4f9] overflow-hidden bg-white">
          {attendanceLoading ? (
            <div className="divide-y divide-[#f3f4f9]">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-pulse bg-[#e8e0ec]/60 h-10 w-10 rounded-xl shrink-0" />
                    <div>
                      <div className="animate-pulse bg-[#e8e0ec]/60 h-4 w-32 mb-1 rounded-2xl" />
                      <div className="animate-pulse bg-[#e8e0ec]/60 h-3 w-24 rounded-2xl" />
                    </div>
                  </div>
                  <div className="animate-pulse bg-[#e8e0ec]/60 h-10 w-44 rounded-xl" />
                </div>
              ))}
            </div>
          ) : attendanceRows.length ? (
            <div className="divide-y divide-[#f3f4f9]">
              <div className="hidden sm:grid sm:grid-cols-[1fr_200px] gap-3 px-6 py-3 bg-[#fbf0fe]/30">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Student</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Status</span>
              </div>
              {attendanceRows.map((student) => (
                <div key={student.id} className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3 px-5 py-3.5 sm:items-center hover:bg-[#fbf0fe]/20 transition-colors">
                  <StudentMini student={student} />
                  <div className="flex gap-1.5 sm:justify-end">
                    {(["PRESENT", "ABSENT", "LEAVE"] as AttendanceStatus[]).map((status) => (
                      <button key={status} type="button"
                        onClick={() => setAttendanceRows((rows) => rows.map((r) => (r.id === student.id ? { ...r, status } : r)))}
                        title={`Mark as ${STATUS_CONFIG[status].label.toLowerCase()}`}
                        className={cn(
                          "flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer active:scale-[0.95]",
                          student.status === status
                            ? STATUS_CONFIG[status].activeClass
                            : "bg-white text-[#4d4354]/60 border-[#cfc2d6]/20 hover:border-[#cfc2d6]/40 hover:bg-[#fbf0fe]/30"
                        )}>
                        {STATUS_CONFIG[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8">
              <EmptyInline text="No students available for this attendance roster." />
            </div>
          )}
        </div>

        {/* Save + history toggle */}
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => setHistoryOpen(!historyOpen)} title={historyOpen ? "Collapse history" : "Expand history"}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#4d4354]/60 hover:text-[#8127cf] transition-colors cursor-pointer active:scale-[0.97]">
            <ChevronRight className={cn("w-4 h-4 transition-transform duration-300", historyOpen && "rotate-90")} />
            Recent Attendance ({attendanceHistory.length})
          </button>
          <BrandButton variant="dark" icon={attendanceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
            onClick={saveAttendance} disabled={attendanceSaving || !attendanceRows.length}
            title={!attendanceRows.length ? "No students to save" : isEditingAttendance ? "Update existing attendance record" : "Save today's attendance"}>
            {attendanceSaving ? "Saving..." : isEditingAttendance ? "Update Attendance" : "Save Attendance"}
          </BrandButton>
        </div>

        {/* History section */}
        {historyOpen && attendanceHistory.length > 0 && (
          <div className="rounded-2xl border border-[#f3f4f9] overflow-hidden bg-white">
            <div className="divide-y divide-[#f3f4f9] max-h-[320px] overflow-y-auto custom-scrollbar">
              {attendanceHistory.slice(0, 15).map((entry) => {
                const isSelected = entry.date === attendanceDate;
                return (
                  <button key={entry.date} type="button" onClick={() => setAttendanceDate(entry.date)} title={`View attendance for ${entry.date}`}
                    className={cn("w-full cursor-pointer px-5 py-3.5 text-left transition-all hover:bg-[#fbf0fe]/50 flex items-center justify-between gap-4 active:bg-[#fbf0fe]", isSelected && "bg-[#fbf0fe]/70")}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors", isSelected ? "bg-[#8127cf] text-white" : "bg-[#fbf0fe] text-[#8127cf]")}>
                        <CalendarCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", isSelected ? "text-[#8127cf]" : "text-[#1d1b20]")}>{entry.date}</p>
                        <p className="text-[11px] text-[#4d4354]/50">
                          {entry.marked !== undefined ? (entry.marked ? "Complete" : `${entry.unmarked} unmarked`) : `${entry.present + entry.absent + entry.leave} marked`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{entry.present}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{entry.absent}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{entry.leave}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        </>)}
      </div>
    </section>
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
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Class</label>
            <Select value={attendanceClassId} onChange={(e: any) => setAttendanceClassId(e.target.value)} className="min-w-[240px]">
              {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
              {!classHubs.length ? <option value="">No classes</option> : null}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => adjustMonth(-1)} title="Previous month" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
              <ChevronLeft className="w-4 h-4 text-[#4d4354]" />
            </button>
            <div className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-4 flex items-center text-sm font-semibold text-[#1d1b20] min-w-[140px] justify-center">{monthLabel}</div>
            <button type="button" onClick={() => adjustMonth(1)} title="Next month" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
              <ChevronRight className="w-4 h-4 text-[#4d4354]" />
            </button>
          </div>
        </div>
      </div>

      {monthlyLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-5">
              <div className="animate-pulse bg-[#e8e0ec]/50 h-5 w-40 rounded-lg mb-3" />
              <div className="animate-pulse bg-[#e8e0ec]/50 h-3 w-64 rounded-lg" />
            </div>
          ))}
        </div>
      ) : monthlyData ? (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Students</p>
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
                  <div key={s.studentId} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-rose-100 px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-rose-100 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-rose-700">{s.rollNo || "#"}</span>
                      </div>
                      <p className="text-sm font-bold text-[#1d1b20] truncate">{s.studentName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-700">{s.percentage}%</span>
                      <span className="text-[10px] font-semibold text-[#4d4354]/50">{s.absentDays} absent</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student breakdown table */}
          <div className="rounded-2xl border border-[#f3f4f9] overflow-hidden bg-white">
            <div className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_80px_100px] gap-3 px-6 py-3 bg-[#fbf0fe]/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Student</span>
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
                      <img src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.name)}`} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1d1b20] truncate">{student.name}</p>
                      <p className="text-[10px] font-semibold text-[#4d4354]/45">{student.rollNo || "No roll"}</p>
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
