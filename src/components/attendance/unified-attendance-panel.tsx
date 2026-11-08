"use client";

/**
 * Attendance for the campus office (SPEC §10.11, M53).
 *
 * `tabs` decides which sections a console shows: campus operations get all four (students · teachers ·
 * rules · trips); the principal gets the student registers only (teacher check-ins, attendance rules and
 * trips are campus operations). The hosting console renders the PageHeader; with more than one section
 * the panel shows its own ViewTabs. Load failures are an inline ErrorState with retry, never a toast.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CalendarCheck, ChevronLeft, ChevronRight, Clock, Search, Users, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { localToday, shiftDateOnly } from "@/lib/date-only";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { InputGroup } from "@/components/ui/input-group";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SkeletonCards, SkeletonList } from "@/components/ui/skeleton";
import { ViewTabs, type ViewTabItem } from "@/components/ui/view-tabs";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { AttendanceOverview } from "./attendance-overview";
import { AttendanceExceptions, AttendanceRulePanel } from "./class-register";
import { LearnerLeaveQueue, TripsDesk } from "@/components/family/staff-requests";

export type AttendanceTab = "students" | "teachers" | "rules" | "trips";
const ALL_TABS: AttendanceTab[] = ["students", "teachers", "rules", "trips"];
const TAB_LABELS: Record<AttendanceTab, string> = {
  students: "Students",
  teachers: "Teacher check-ins",
  rules: "Attendance rules",
  trips: "Trips",
};

export interface UnifiedAttendancePanelProps {
  /** Sections this console may show, in order. Default: all four (campus operations). The principal passes ["students"]. */
  tabs?: AttendanceTab[];
  /** Host-owned "Export" (§4.4b): each new number downloads the student register on screen (students section). */
  exportRequest?: number;
  /**
   * Controlled section (optional). With `tab` the host owns the selection — e.g. so its PageHeader shows "Export"
   * only on Students; `onTabChange` reports every switch (also when uncontrolled). A `tab` outside `tabs` falls
   * back to the first allowed section.
   */
  tab?: AttendanceTab;
  onTabChange?: (tab: AttendanceTab) => void;
}

export function UnifiedAttendancePanel({ tabs = ALL_TABS, exportRequest, tab, onTabChange }: UnifiedAttendancePanelProps = {}) {
  const ui = useUiText();
  const allowed = useMemo(() => ALL_TABS.filter((item) => tabs.includes(item)), [tabs]);
  const [activeTab, setActiveTab] = useState<AttendanceTab>(allowed[0] ?? "students");
  const selected = tab ?? activeTab;
  const current = allowed.includes(selected) ? selected : allowed[0] ?? "students";
  const items: ViewTabItem[] = allowed.map((id) => ({ id, label: TAB_LABELS[id] }));
  const select = (id: AttendanceTab) => {
    if (tab === undefined) setActiveTab(id);
    onTabChange?.(id);
  };

  return (
    <div className="space-y-6">
      {allowed.length > 1 ? (
        <ViewTabs items={items} value={current} onChange={(id) => select(id as AttendanceTab)} ariaLabel="Attendance sections" />
      ) : null}
      {current === "students" ? (
        <>
          <AttendanceOverview exportRequest={exportRequest} />
          <div className="grid gap-6 lg:grid-cols-2"><AttendanceExceptions /><LearnerLeaveQueue /></div>
        </>
      ) : null}
      {current === "rules" ? <AttendanceRulePanel /> : null}
      {current === "trips" ? <TripsDesk /> : null}
      {current === "teachers" ? <TeacherCheckIns /> : null}
      {allowed.length === 0 ? <EmptyState size="sm" icon={CalendarCheck} title={ui("Nothing to show")} description={ui("Attendance is not part of this workspace.")} /> : null}
    </div>
  );
}

type TeacherRow = { id: string; fullName?: string; email?: string; profileImageUrl?: string | null; status?: string; attendance?: { checkInTime?: string | null } | null };
type MonthlyRow = { id?: string; userId?: string; fullName?: string; profileImageUrl?: string | null; presentDays?: number; present?: number; absentDays?: number; absent?: number; leaveDays?: number; leave?: number; totalDays?: number; total?: number };
const EMPTY_SUMMARY = { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };
// Calendar days are `YYYY-MM-DD` keys (the API reads them as local dates): "today" is the viewer's local day and
// day steps use the shared UTC arithmetic, so Previous/Next day never slip a day east of Greenwich (Asia/Karachi).
const todayIso = localToday;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** Teacher check-in records (campus operations). */
function TeacherCheckIns() {
  const ui = useUiText();
  const { language } = useLocale();
  const { date: formatDate, number } = useLocaleFormat();
  const rtl = language !== "en";
  const [teacherDate, setTeacherDate] = useState(todayIso);
  const [roster, setRoster] = useState<TeacherRow[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [rosterError, setRosterError] = useState(false);
  const [search, setSearch] = useState("");
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState(false);
  const [teacherSelectedMonth, setTeacherSelectedMonth] = useState(thisMonth);

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : language, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  };
  const shiftMonth = (delta: number) => {
    const [y, m] = teacherSelectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (delta > 0 && next > thisMonth()) return;
    setTeacherSelectedMonth(next);
  };
  const shiftDate = (days: number) => {
    const next = shiftDateOnly(teacherDate, days);
    if (days > 0 && next > todayIso()) return;
    setTeacherDate(next);
  };

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setRosterError(false);
    try {
      const res = await fetch(`/api/teacher-attendance?date=${teacherDate}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRoster(Array.isArray(json.data) ? json.data : []);
      setSummary(json.summary || EMPTY_SUMMARY);
    } catch {
      setRosterError(true);
    } finally {
      setLoading(false);
    }
  }, [teacherDate]);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    setMonthlyError(false);
    try {
      const res = await fetch(`/api/teacher-attendance?month=${teacherSelectedMonth}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMonthly(json.success && Array.isArray(json.data) ? json.data : []);
    } catch {
      setMonthlyError(true);
      setMonthly([]);
    } finally {
      setMonthlyLoading(false);
    }
  }, [teacherSelectedMonth]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);
  useEffect(() => { void loadMonthly(); }, [loadMonthly]);

  const q = search.trim().toLowerCase();
  const filtered = q ? roster.filter((t) => t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)) : roster;
  const rate = summary.total > 0 ? Math.round(((summary.present + summary.leave) / summary.total) * 1000) / 10 : 0;
  const isToday = teacherDate === todayIso();
  const statusVariant = (s: string) => (s === "PRESENT" ? "success" : s === "ABSENT" ? "danger" : s === "LEAVE" ? "warning" : "neutral") as "success" | "danger" | "warning" | "neutral";
  const statusLabel = (s: string) => ui(s === "PRESENT" ? "Present" : s === "ABSENT" ? "Absent" : s === "LEAVE" ? "On leave" : "Not marked");
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  const stats: Array<{ label: string; value: string; icon: LucideIcon; tone: string }> = [
    { label: "Teachers", value: number(summary.total, 0), icon: Users, tone: "border-status-brand-border bg-status-brand-surface text-status-brand-text" },
    { label: "Present", value: number(summary.present, 0), icon: CalendarCheck, tone: "border-status-success-border bg-status-success-surface text-status-success-text" },
    { label: "Absent", value: number(summary.absent, 0), icon: X, tone: "border-status-error-border bg-status-error-surface text-status-error-text" },
    { label: "On leave", value: number(summary.leave, 0), icon: Clock, tone: "border-status-warning-border bg-status-warning-surface text-status-warning-text" },
    { label: "Attendance rate", value: `${number(rate)}%`, icon: Award, tone: "border-status-info-border bg-status-info-surface text-status-info-text" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton variant="outline" label={ui("Previous day")} onClick={() => shiftDate(-1)}><Prev aria-hidden="true" /></IconButton>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-card px-4 text-sm font-bold text-ink-strong">
            <CalendarCheck aria-hidden="true" className="size-4 text-primary" />
            <bdi>{formatDate(teacherDate)}</bdi>
            {isToday ? <Badge variant="success" size="sm">{ui("Today")}</Badge> : null}
          </span>
          <IconButton variant="outline" label={ui("Next day")} onClick={() => shiftDate(1)} disabled={isToday}><Next aria-hidden="true" /></IconButton>
          {!isToday ? <Button type="button" variant="outline" size="sm" onClick={() => setTeacherDate(todayIso())}>{ui("Today")}</Button> : null}
        </div>
        <InputGroup className="w-full sm:w-64">
          <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
          <SystemInput type="text" aria-label={ui("Search teachers")} placeholder={ui("Search teachers")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
      </div>

      {rosterError ? (
        <Card className="p-0"><ErrorState title={ui("Teacher check-ins could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void loadRoster()} /></Card>
      ) : (
        <>
          {loading ? (
            <SkeletonCards count={5} className="grid grid-cols-2 gap-4 md:grid-cols-5" label={ui("Loading teacher check-ins")} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
              {stats.map((stat) => (
                <Card key={stat.label} className="min-w-0 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-muted">{ui(stat.label)}</p>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-ink-strong tabular-nums"><bdi>{stat.value}</bdi></p>
                    </div>
                    <span aria-hidden="true" className={cn("hidden size-10 shrink-0 items-center justify-center rounded-xl border sm:flex", stat.tone)}><stat.icon className="size-4" /></span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="min-w-0 p-4 sm:p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-ink-strong">{ui("Daily roster")}</h2>
                <span className="text-xs font-semibold text-primary tabular-nums">{ui("{0} teachers", [number(filtered.length, 0)])}</span>
              </div>
              {loading ? (
                <SkeletonList rows={5} label={ui("Loading teacher check-ins")} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={Users}
                  title={ui(q ? "No teachers match your search" : "No teachers found")}
                  description={ui(q ? "Try a different name or clear the search." : "Teachers appear here once they are added to the school.")}
                  secondaryAction={q ? <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>{ui("Clear search")}</Button> : undefined}
                />
              ) : (
                <ul className="custom-scrollbar max-h-[500px] space-y-2 overflow-y-auto pe-1">
                  {filtered.map((teacher) => {
                    const status = teacher.status || "UNMARKED";
                    return (
                      <li key={teacher.id} className={cn("flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 sm:px-4",
                        status === "ABSENT" ? "border-status-error-border bg-status-error-surface" : status === "LEAVE" ? "border-status-warning-border bg-status-warning-surface" : "border-transparent bg-surface-subtle")}>
                        <div className="size-9 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                          <AvatarImage src={teacher.profileImageUrl ?? undefined} name={teacher.fullName ?? ""} alt={teacher.fullName ?? ""} initialsClassName="text-2xs" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink-strong"><bdi>{teacher.fullName}</bdi></p>
                          <p className="truncate text-xs text-ink-subtle"><bdi>{teacher.email}</bdi></p>
                        </div>
                        <span className="hidden text-xs font-medium tabular-nums text-ink-muted sm:inline"><bdi>{teacher.attendance?.checkInTime || "—"}</bdi></span>
                        <Badge variant={statusVariant(status)} dot size="sm">{statusLabel(status)}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="min-w-0 p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-ink-strong">{ui("Monthly records")}</h2>
              </div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <IconButton variant="outline" label={ui("Previous month")} onClick={() => shiftMonth(-1)}><Prev aria-hidden="true" /></IconButton>
                <span className="text-sm font-bold text-ink-strong"><bdi>{monthLabel(teacherSelectedMonth)}</bdi></span>
                <IconButton variant="outline" label={ui("Next month")} onClick={() => shiftMonth(1)} disabled={teacherSelectedMonth >= thisMonth()}><Next aria-hidden="true" /></IconButton>
              </div>
              {monthlyLoading ? (
                <SkeletonList rows={4} label={ui("Loading monthly records")} />
              ) : monthlyError ? (
                <ErrorState title={ui("Monthly records could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void loadMonthly()} />
              ) : monthly.length === 0 ? (
                <EmptyState size="sm" icon={CalendarCheck} title={ui("No records this month")} description={ui("Teacher check-ins for {0} will appear here.", [monthLabel(teacherSelectedMonth)])} />
              ) : (
                <ul className="custom-scrollbar max-h-[400px] space-y-2 overflow-y-auto pe-1">
                  {monthly.map((record) => {
                    const present = record.presentDays ?? record.present ?? 0;
                    const total = record.totalDays ?? record.total ?? 0;
                    const monthRate = total > 0 ? Math.round((present / total) * 100) : 0;
                    const tone = monthRate >= 85 ? "text-status-success-text" : monthRate >= 75 ? "text-status-warning-text" : "text-status-error-text";
                    const bar = monthRate >= 85 ? "bg-status-success-text" : monthRate >= 75 ? "bg-status-warning-text" : "bg-status-error-text";
                    return (
                      <li key={record.userId || record.id} className="rounded-2xl bg-surface-subtle p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                            <AvatarImage src={record.profileImageUrl ?? undefined} name={record.fullName || ""} alt={record.fullName || ""} initialsClassName="text-2xs" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-ink-strong"><bdi>{record.fullName || ui("Teacher")}</bdi></p>
                            <p className="mt-0.5 text-2xs font-medium text-ink-subtle tabular-nums">
                              {ui("{0} present · {1} absent · {2} on leave", [present, record.absentDays ?? record.absent ?? 0, record.leaveDays ?? record.leave ?? 0])}
                            </p>
                          </div>
                          <span className={cn("shrink-0 text-xs font-bold tabular-nums", tone)}><bdi>{monthRate}%</bdi></span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
                          <div className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", bar)} style={{ width: `${Math.min(monthRate, 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
