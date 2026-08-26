"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, Command, Copy, History, Keyboard, Loader2, Plane, Search, UserX, X,
} from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { BrandButton } from "@/components/role-dashboard";
import { Select } from "@/components/ui/select";
import {
  AttendanceSkeleton, classLabel, EmptyInline, StudentMini, TeacherErrorState, todayIso, useTeacherData,
} from "@/components/teacher/teacher-components";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { shiftDateOnly } from "@/lib/date-only";
import { StickySaveBar } from "@/components/teacher/sticky-save-bar";
import { useNavGuard, useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE";
type ViewTab = "marking" | "monthly";

const STATUS_CONFIG = {
  PRESENT: { label: "Present", short: "P", key: "P", activeClass: "bg-emerald-500 text-white ring-2 ring-emerald-300", chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100", dot: "bg-emerald-500" },
  ABSENT: { label: "Absent", short: "A", key: "A", activeClass: "bg-rose-500 text-white ring-2 ring-rose-300", chipClass: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100", dot: "bg-rose-500" },
  LEAVE: { label: "Leave", short: "L", key: "L", activeClass: "bg-amber-500 text-white ring-2 ring-amber-300", chipClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100", dot: "bg-amber-500" },
};

/** Keystroke → status, for the roster's keyboard mode. */
const KEY_TO_STATUS: Record<string, AttendanceStatus> = {
  p: "PRESENT", "1": "PRESENT",
  a: "ABSENT", "2": "ABSENT",
  l: "LEAVE", "3": "LEAVE",
};

export default function AttendancePage() {
  const { data, loading, error, loadData } = useTeacherData();
  const [activeTab, setActiveTab] = useState<ViewTab>("marking");
  const searchParams = useSearchParams();
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
  /* Statuses exactly as the server last returned them. Every "is this dirty"
     question on this page is answered against this snapshot, so the teacher is
     told what *they* changed rather than what merely differs from a default. */
  const [baseline, setBaseline] = useState<Record<string, AttendanceStatus>>({});
  const [rosterQuery, setRosterQuery] = useState("");
  const [keyboardMode, setKeyboardMode] = useState(false);
  const rosterRef = useRef<HTMLDivElement>(null);
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
    if (attendanceClassId) return;
    // A class card on "My Classes" links here with its own id. Landing on the
    // first class in the list instead would quietly discard the one the
    // teacher actually clicked.
    const requested = searchParams.get("classId");
    if (requested && classHubs.some((cls: any) => cls.id === requested)) {
      setAttendanceClassId(requested);
      return;
    }
    if (classHubs[0]?.id) setAttendanceClassId(classHubs[0].id);
  }, [data, attendanceClassId, classHubs, searchParams]);

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
        const rows = result.students.map((s: any) => ({ ...s, status: s.attendance?.status || "PRESENT" }));
        setAttendanceRows(rows);
        setBaseline(Object.fromEntries(rows.map((r: any) => [r.id, r.status as AttendanceStatus])));
      } else {
        setAttendanceRows([]);
        setBaseline({});
      }
      setAttendanceExists(result.students?.some((s: any) => s.attendance !== null) || false);
    } catch { setAttendanceSummary(null); setAttendanceRows([]); setBaseline({}); setAttendanceExists(false); }
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

  const setStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setAttendanceRows((rows) => rows.map((r) => (r.id === studentId ? { ...r, status } : r)));
  }, []);

  /* Bulk actions only ever touched every row, which is wrong the moment the
     roster is filtered — "All Absent" while searching "Ahmed" is a request
     about Ahmed. Scope it to what is on screen. */
  const markAllAttendance = useCallback((status: AttendanceStatus, ids?: Set<string>) => {
    setAttendanceRows((rows) => rows.map((row) => (!ids || ids.has(row.id) ? { ...row, status } : row)));
  }, []);

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of attendanceRows) {
      if (baseline[row.id] !== undefined && baseline[row.id] !== row.status) set.add(row.id);
    }
    return set;
  }, [attendanceRows, baseline]);

  const resetChanges = useCallback(() => {
    setAttendanceRows((rows) => rows.map((r) => ({ ...r, status: baseline[r.id] ?? r.status })));
  }, [baseline]);

  /* A roster is a list of names; searching it is how a teacher finds one. */
  const visibleRows = useMemo(() => {
    const q = rosterQuery.trim().toLowerCase();
    if (!q) return attendanceRows;
    return attendanceRows.filter(
      (r) => r.fullName?.toLowerCase().includes(q) || String(r.rollNo || "").toLowerCase().includes(q),
    );
  }, [attendanceRows, rosterQuery]);

  const unsavedSheet = attendanceRows.length > 0 && !attendanceExists;
  useUnsavedGuard(dirtyIds.size > 0);
  useNavGuard(
    dirtyIds.size > 0,
    "You have unsaved attendance changes. Leave this page and lose them?",
  );

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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to save"));
      toast.success("Attendance saved");
      await loadAttendance(attendanceClassId, attendanceDate);
      await loadAttendanceHistory(attendanceClassId);
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setAttendanceSaving(false); }
  }, [attendanceClassId, attendanceDate, attendanceRows, loadAttendance, loadAttendanceHistory, loadData]);

  const adjustDate = (delta: number) => {
    // UTC arithmetic throughout — see shiftDateOnly. The previous version mixed
    // a UTC-parsed date with local getDate/setDate, which lands a day out for
    // any browser west of UTC.
    setAttendanceDate(shiftDateOnly(attendanceDate, delta));
  };

  const copyFromPrevious = useCallback(async () => {
    if (!attendanceClassId) return;
    setCopyingPrevious(true);
    try {
      const fromDate = shiftDateOnly(attendanceDate, -1);
      const res = await fetch("/api/attendance/copy-previous", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: attendanceClassId, fromDate, toDate: attendanceDate }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to copy"));
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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to load monthly report"));
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
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  return (
    <TeacherPage
      tone="attendance"
      icon={CalendarCheck}
      eyebrow="Attendance"
      title="Daily Attendance"
      summary="Mark student attendance per class and date"
      actions={
        // The two views were tabs stacked under the description; as a segmented
        // control in the header they cost no extra row.
        <div className="flex h-10 items-center gap-0.5 rounded-xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-1">
          {([
            { key: "marking" as ViewTab, label: "Mark", icon: CalendarCheck },
            { key: "monthly" as ViewTab, label: "Monthly", icon: BarChart3 },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-pressed={activeTab === key}
              className={cn(
                "flex h-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black uppercase tracking-wider transition-all",
                activeTab === key
                  ? "bg-white text-[#8127cf] shadow-[0_1px_3px_rgba(31,26,35,0.12)]"
                  : "text-ink-muted hover:text-[#8127cf]",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-3">

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
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Class</label>
              <Select value={attendanceClassId} onChange={(e) => setAttendanceClassId(e.target.value)} className="min-w-[240px]">
                {classHubs.map((cls: any) => (
                  <option key={cls.id} value={cls.id}>
                    {classLabel(cls)}{cls.inActiveCycle === false ? " (outside active cycle)" : ""}
                  </option>
                ))}
                {!classHubs.length ? <option value="">No classes</option> : null}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => adjustDate(-1)} title="Previous day" aria-label="Previous day" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
                <ChevronLeft className="w-4 h-4 text-ink" />
              </button>
              <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}
                className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 py-2 text-sm font-semibold text-[#1d1b20] transition-all hover:border-[#8127cf]/20" />
              <button type="button" onClick={() => adjustDate(1)} title="Next day" aria-label="Next day" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
                <ChevronRight className="w-4 h-4 text-ink" />
              </button>
            </div>
          </div>
          {attendanceDate !== todayIso() ? (
            <button type="button" onClick={() => setAttendanceDate(todayIso())} title="Reset to today's date"
              className="text-xs font-semibold text-[#8127cf] hover:underline cursor-pointer active:text-[#6a1fa8]">
              Back to today
            </button>
          ) : null}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="sk-rise rounded-2xl bg-white border border-[#cfc2d6]/25 px-4 py-3.5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "0ms" }} title="Total students in this class">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Total</p>
            <p className="mt-0.5 text-xl font-bold text-[#1d1b20]">{stats.total}</p>
          </div>
          <div className="sk-rise rounded-2xl bg-emerald-50/80 border border-emerald-200/60 px-4 py-3.5 transition-all hover:bg-emerald-100/80" style={{ animationDelay: "60ms" }} title="Students marked present">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Present</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-700">{stats.present}</p>
          </div>
          <div className="sk-rise rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3.5 transition-all hover:bg-rose-100/80" style={{ animationDelay: "120ms" }} title="Students marked absent">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Absent</p>
            <p className="mt-0.5 text-xl font-bold text-rose-700">{stats.absent}</p>
          </div>
          <div className="sk-rise rounded-2xl bg-amber-50/80 border border-amber-200/60 px-4 py-3.5 transition-all hover:bg-amber-100/80" style={{ animationDelay: "180ms" }} title="Students on leave">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Leave</p>
            <p className="mt-0.5 text-xl font-bold text-amber-700">{stats.leave}</p>
          </div>
          <div className="sk-rise rounded-2xl bg-[#fbf0fe]/80 border border-[#8127cf]/10 px-4 py-3.5 transition-all hover:bg-[#fbf0fe]" style={{ animationDelay: "240ms" }} title="Students not yet marked">
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
            <span className="text-xs font-semibold text-ink-muted whitespace-nowrap">{completion}% marked</span>
          </div>
        )}

        {/* Bulk actions + roster search */}
        {attendanceRows.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Scoped to whatever the search is currently showing — the label
                  says so, so "All Present" can never quietly overwrite the
                  thirty-eight students the teacher has filtered out. */}
              {([
                { status: "PRESENT" as AttendanceStatus, label: "Present", icon: CheckCheck },
                { status: "ABSENT" as AttendanceStatus, label: "Absent", icon: UserX },
                { status: "LEAVE" as AttendanceStatus, label: "Leave", icon: Plane },
              ]).map(({ status, label, icon: Icon }) => (
                <button key={status} type="button"
                  onClick={() => markAllAttendance(status, new Set(visibleRows.map((r) => r.id)))}
                  title={`Mark ${visibleRows.length} shown student${visibleRows.length === 1 ? "" : "s"} as ${label.toLowerCase()}`}
                  className={cn("inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer active:scale-[0.95] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25", STATUS_CONFIG[status].chipClass)}>
                  <Icon className="w-3.5 h-3.5" />
                  All {label}
                  {rosterQuery ? <span className="opacity-60">({visibleRows.length})</span> : null}
                </button>
              ))}
              <button type="button" onClick={copyFromPrevious} disabled={copyingPrevious}
                title="Copy attendance from previous day"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer active:scale-[0.95] bg-[#fbf0fe] text-[#8127cf] border-[#8127cf]/15 hover:bg-[#f3eeff] hover:border-[#8127cf]/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                {copyingPrevious ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Yesterday
              </button>

              {/* Roster search — a forty-name list is not something you scroll
                  to find one child in. */}
              <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                <input
                  value={rosterQuery}
                  onChange={(e) => setRosterQuery(e.target.value)}
                  placeholder="Find a student…"
                  aria-label="Search this roster"
                  className="h-9 w-full rounded-xl border border-[#cfc2d6]/25 bg-white pl-9 pr-8 text-xs font-semibold text-[#1d1b20] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:ring-4 focus:ring-[#8127cf]/12"
                />
                {rosterQuery ? (
                  <button type="button" onClick={() => setRosterQuery("")} aria-label="Clear roster search"
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]">
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>

              <button type="button" onClick={() => setKeyboardMode((v) => !v)} aria-pressed={keyboardMode}
                title="Show the keyboard shortcuts for marking a roster without the mouse"
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all active:scale-[0.95] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
                  keyboardMode
                    ? "border-[#8127cf]/30 bg-[#8127cf] text-white"
                    : "border-[#cfc2d6]/25 bg-white text-ink-muted hover:border-[#8127cf]/25 hover:text-[#8127cf]",
                )}>
                <Keyboard className="h-3.5 w-3.5" />
                Keys
              </button>
            </div>

            {keyboardMode ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[#8127cf]/15 bg-[#fbf0fe]/60 px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                  <Command className="h-3 w-3" /> Roster shortcuts
                </span>
                {[
                  ["P / 1", "Present"], ["A / 2", "Absent"], ["L / 3", "Leave"],
                  ["↑ ↓", "Move between students"], ["⌘S", "Save"],
                ].map(([k, meaning]) => (
                  <span key={k} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
                    <kbd className="rounded-md border border-[#cfc2d6]/50 bg-white px-1.5 py-0.5 text-[10px] font-black text-[#1d1b20]">{k}</kbd>
                    {meaning}
                  </span>
                ))}
                <span className="text-[11px] font-semibold text-ink-subtle">Click any row first, then type.</span>
              </div>
            ) : null}
          </div>
        )}

        {/* Student roster */}
        <div className="sk-rise rounded-2xl border border-[#cfc2d6]/25 overflow-hidden bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "60ms" }}>
          {attendanceLoading ? (
            <div className="divide-y divide-[#f3f4f9]">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-10 w-10 rounded-xl shrink-0" />
                    <div>
                      <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-4 w-32 mb-1 rounded-2xl" />
                      <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-3 w-24 rounded-2xl" />
                    </div>
                  </div>
                  <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-10 w-44 rounded-xl" />
                </div>
              ))}
            </div>
          ) : visibleRows.length ? (
            /* The roster is one keyboard surface: a row takes focus, P/A/L set
               its status and the arrows walk the list, so a class of forty is a
               forty-keystroke job instead of forty round trips to the mouse. */
            <div
              ref={rosterRef}
              className="divide-y divide-[#f3f4f9]"
              onKeyDown={(event) => {
                const row = (event.target as HTMLElement).closest<HTMLElement>("[data-row-idx]");
                if (!row) return;
                const idx = Number(row.dataset.rowIdx);
                const move = (delta: number) => {
                  event.preventDefault();
                  const next = rosterRef.current?.querySelector<HTMLElement>(
                    `[data-row-idx="${Math.min(Math.max(idx + delta, 0), visibleRows.length - 1)}"]`,
                  );
                  next?.focus();
                  next?.scrollIntoView({ block: "nearest" });
                };
                if (event.key === "ArrowDown") return move(1);
                if (event.key === "ArrowUp") return move(-1);
                const status = KEY_TO_STATUS[event.key.toLowerCase()];
                if (!status) return;
                event.preventDefault();
                setStatus(visibleRows[idx].id, status);
                // Marking one student almost always means the next one is up.
                move(1);
              }}
            >
              <div className="sticky top-0 z-10 hidden gap-3 border-b border-[#f3f4f9] bg-[#fbf0fe]/80 px-6 py-3 backdrop-blur-sm sm:grid sm:grid-cols-[1fr_240px]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Student
                  {rosterQuery ? (
                    <span className="ml-2 normal-case text-[#8127cf]">
                      {visibleRows.length} of {attendanceRows.length} shown
                    </span>
                  ) : null}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Status</span>
              </div>
              {visibleRows.map((student, idx) => {
                const changed = dirtyIds.has(student.id);
                return (
                  <div
                    key={student.id}
                    data-row-idx={idx}
                    tabIndex={0}
                    role="radiogroup"
                    aria-label={`Attendance for ${student.fullName}`}
                    className={cn(
                      "group relative grid grid-cols-1 gap-3 px-5 py-3.5 outline-none transition-colors sm:grid-cols-[1fr_240px] sm:items-center",
                      "hover:bg-[#fbf0fe]/20 focus-visible:bg-[#fbf0fe]/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8127cf]/40",
                      changed && "bg-amber-50/40",
                    )}
                  >
                    {/* An edited row is worth marking: without it, "12 unsaved
                        changes" gives no way to see which twelve. */}
                    {changed ? (
                      <span
                        aria-label="Changed, not yet saved"
                        title={`Changed from ${STATUS_CONFIG[baseline[student.id] as AttendanceStatus]?.label ?? "unmarked"}`}
                        className="absolute inset-y-0 left-0 w-1 bg-amber-400"
                      />
                    ) : null}
                    <StudentMini student={student} />
                    <div className="flex gap-1.5 sm:justify-end">
                      {(["PRESENT", "ABSENT", "LEAVE"] as AttendanceStatus[]).map((status) => (
                        <button key={status} type="button" tabIndex={-1}
                          role="radio"
                          aria-checked={student.status === status}
                          onClick={() => setStatus(student.id, status)}
                          title={`Mark ${student.fullName} as ${STATUS_CONFIG[status].label.toLowerCase()} (${STATUS_CONFIG[status].key})`}
                          className={cn(
                            "flex-1 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-[0.95] sm:flex-none",
                            student.status === status
                              ? STATUS_CONFIG[status].activeClass
                              : "bg-white text-ink-muted border-[#cfc2d6]/20 hover:border-[#cfc2d6]/40 hover:bg-[#fbf0fe]/30"
                          )}>
                          {STATUS_CONFIG[status].label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : attendanceRows.length ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm font-bold text-[#1d1b20]">No student matches “{rosterQuery}”</p>
              <button type="button" onClick={() => setRosterQuery("")}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f3eeff] active:scale-[0.97]">
                <X className="h-3.5 w-3.5" /> Clear search
              </button>
            </div>
          ) : (
            <div className="p-8">
              <EmptyInline text="No students available for this attendance roster." />
            </div>
          )}
        </div>

        {/* Save bar — floats with the roster instead of sitting below forty
            rows the teacher would have to scroll past to reach it. */}
        <StickySaveBar
          dirtyCount={dirtyIds.size}
          forceShow={unsavedSheet}
          label={dirtyIds.size === 0 ? "This day has not been saved yet" : undefined}
          saving={attendanceSaving}
          onSave={saveAttendance}
          onReset={resetChanges}
          saveLabel={isEditingAttendance ? "Update" : "Save attendance"}
          savingLabel="Saving…"
          hint={
            <>
              {selectedAttendanceClass ? `${classLabel(selectedAttendanceClass)} · ` : ""}
              {attendanceDate}
              {` · ${stats.present} present, ${stats.absent} absent, ${stats.leave} leave`}
            </>
          }
        />

        {/* History toggle */}
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => setHistoryOpen(!historyOpen)} title={historyOpen ? "Collapse history" : "Expand history"}
            className="inline-flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-[#8127cf] transition-colors cursor-pointer active:scale-[0.97]">
            <ChevronRight className={cn("w-4 h-4 transition-transform duration-300", historyOpen && "rotate-90")} />
            Recent Attendance ({attendanceHistory.length})
          </button>
          {attendanceHistoryLoading ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-subtle">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading history
            </span>
          ) : null}
        </div>

        {/* History section */}
        {historyOpen && attendanceHistory.length > 0 && (
          <div className="sk-rise rounded-2xl border border-[#cfc2d6]/25 overflow-hidden bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
            <div className="divide-y divide-[#f3f4f9] max-h-[320px] overflow-y-auto custom-scrollbar">
              {attendanceHistory.slice(0, 15).map((entry) => {
                const isSelected = entry.date === attendanceDate;
                return (
                  <button key={entry.date} type="button" onClick={() => setAttendanceDate(entry.date)} title={`View attendance for ${entry.date}`}
                    className={cn("group w-full cursor-pointer px-5 py-3.5 text-left transition-all hover:bg-[#fbf0fe]/50 flex items-center justify-between gap-4 active:bg-[#fbf0fe]", isSelected && "bg-[#fbf0fe]/70")}>
                    <div className="relative flex items-center gap-3 min-w-0">
                      <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
                      <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors", isSelected ? "bg-[#8127cf] text-white" : "bg-[#fbf0fe] text-[#8127cf]")}>
                        <CalendarCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", isSelected ? "text-[#8127cf]" : "text-[#1d1b20]")}>{entry.date}</p>
                        <p className="text-[11px] text-ink-muted">
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
            <Select value={attendanceClassId} onChange={(e: any) => setAttendanceClassId(e.target.value)} className="min-w-[240px]">
              {classHubs.map((cls: any) => (
                <option key={cls.id} value={cls.id}>
                  {classLabel(cls)}{cls.inActiveCycle === false ? " (outside active cycle)" : ""}
                </option>
              ))}
              {!classHubs.length ? <option value="">No classes</option> : null}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => adjustMonth(-1)} title="Previous month" aria-label="Previous month" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
              <ChevronLeft className="w-4 h-4 text-ink" />
            </button>
            <div className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-4 flex items-center text-sm font-semibold text-[#1d1b20] min-w-[140px] justify-center">{monthLabel}</div>
            <button type="button" onClick={() => adjustMonth(1)} title="Next month" aria-label="Next month" className="h-10 w-10 rounded-xl border border-[#cfc2d6]/20 flex items-center justify-center hover:bg-[#fbf0fe] hover:border-[#8127cf]/20 transition-all cursor-pointer active:scale-[0.9]">
              <ChevronRight className="w-4 h-4 text-ink" />
            </button>
          </div>
        </div>
      </div>

      {monthlyLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-5">
              <div className="skeleton-shimmer bg-[#e8e0ec]/50 h-5 w-40 rounded-lg mb-3" />
              <div className="skeleton-shimmer bg-[#e8e0ec]/50 h-3 w-64 rounded-lg" />
            </div>
          ))}
        </div>
      ) : monthlyData ? (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3.5">
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
                  <div key={s.studentId} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-rose-100 px-4 py-2.5">
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
          <div className="rounded-2xl border border-[#f3f4f9] overflow-hidden bg-white">
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
                      <AvatarImage src={student.profileImageUrl} alt={student.name} />
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
