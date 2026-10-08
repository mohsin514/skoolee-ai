"use client";

import { UiText, useUiText } from "@/components/locale/LocaleProvider";

import { useLocale } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { useEffect, useMemo, useState } from "react";
import { ATTENDANCE_RISK_THRESHOLD, summarizeAttendance } from "@/lib/attendance";
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, X, Clock } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { AttendanceSkeleton, StudentErrorState } from "@/components/student/student-components";
import { StatCard, StudentEmptyState } from "@/components/student/student-ui";
import { useStudentData } from "../student-data-context";

export default function StudentAttendancePage() {
  const tr = useUiText();
  const locale = useLocale();
  const { data, loading, error, refetch } = useStudentData();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => { const parts = new Intl.DateTimeFormat("en", {timeZone:locale.timezone,year:"numeric",month:"2-digit"}).formatToParts(new Date()); setSelectedMonth(`${parts.find(part=>part.type==="year")!.value}-${parts.find(part=>part.type==="month")!.value}`); }, [locale.timezone]);

  // Shared helper so this page, the dashboard, the parent portal, and the
  // office's monthly report all quote the same percentage.
  const stats = useMemo(
    () => summarizeAttendance(data?.user?.attendance || []),
    [data],
  );

  const monthRecords = useMemo(() => {
    if (!data?.user?.attendance?.length) return [];
    const [y, m] = selectedMonth.split("-").map(Number);
    return data.user.attendance.filter((e: any) => {
      const d = new Date(e.date);
      return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m;
    }).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, selectedMonth]);

  const monthStats = useMemo(() => summarizeAttendance(monthRecords), [monthRecords]);

  const calendarDays = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const firstDay = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() - locale.weekStartsOn + 7) % 7;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const recordMap = new Map<number, any>();
    monthRecords.forEach((r: any) => {
      const d = new Date(r.date).getUTCDate();
      recordMap.set(d, r);
    });
    const days: ({ day: number; record: any } | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push({ day: d, record: recordMap.get(d) || null });
    return days;
  }, [selectedMonth, monthRecords, locale.weekStartsOn]);

  const consecutiveAbsences = useMemo(() => {
    if (!data?.user?.attendance?.length) return 0;
    const sorted = [...data.user.attendance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let count = 0;
    for (const r of sorted) {
      if (r.status === "ABSENT") count++;
      else break;
    }
    return count;
  }, [data, locale]);

  const groupedByMonth = useMemo(() => {
    if (!data?.user?.attendance?.length) return [];
    const groups: { label: string; key: string; entries: any[] }[] = [];
    const sorted = [...data.user.attendance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sorted.forEach((entry: any) => {
      const d = new Date(entry.date);
      const label = d.toLocaleDateString(localeTag(locale), { month: "long", year: "numeric", timeZone:"UTC" });
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.entries.push(entry);
      else groups.push({ label, key, entries: [entry] });
    });
    return groups;
  }, [data, locale]);

  function adjustMonth(dir: number) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dir, 1));
    setSelectedMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1)).toLocaleDateString(localeTag(locale), { month: "long", year: "numeric", timeZone:"UTC" });
  })();

  if (loading && !data) return <AttendanceSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  const isAtRisk = stats.rate !== null && stats.rate < ATTENDANCE_RISK_THRESHOLD;

  return (
    <StudentPage
      tone="attendance"
      icon={CalendarCheck}
      eyebrow={<>{stats.total ? tr("Overall: {0}% · Days recorded: {1}", [stats.rate, stats.total]) : tr("No attendance data yet")}</>}
      title={tr("My Attendance")}
      summary={<>{`${data.user.className} · ${data.user.campusName}`}</>}
    >
      <div className="space-y-3">
        {isAtRisk && (
          <div className="flex items-center gap-3 rounded-[18px] border border-amber-200/60 bg-amber-50 px-4 py-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800"><UiText>{"Attendance Below 75%"}</UiText></p>
              <p className="text-xs font-semibold text-amber-700/70"><UiText>{"Your attendance is at"}</UiText>{stats.rate}<UiText>{"%. Regular attendance is important for academic success."}</UiText>{consecutiveAbsences >= 3 && ` You have ${consecutiveAbsences} consecutive absences.`}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={CalendarDays} label={tr("Total Days")} value={stats.total} sub={tr("School days recorded")} delay={40} />
          <StatCard icon={CheckCircle2} label={tr("Present")} value={stats.present} sub={`${stats.total ? Math.round((stats.present / stats.total) * 100) : 0}% ${tr("of total")}`} tone="green" ring={stats.total ? Math.round((stats.present / stats.total) * 100) : null} delay={80} />
          <StatCard icon={X} label={tr("Absent")} value={stats.absent} sub={consecutiveAbsences > 0 ? tr("Consecutive: {0}", [consecutiveAbsences]) : tr("No consecutive")} tone="rose" delay={120} />
          <StatCard icon={Clock} label={tr("Leave")} value={stats.leave} sub={tr("Approved leaves")} tone="amber" delay={160} />
        </div>

        <div className="sk-rise rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]" style={{ animationDelay: "120ms" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black tracking-tight text-[#1d1b20]"><UiText>{"Monthly Calendar"}</UiText></h3>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {monthStats.rate ?? 0}<UiText>{"% this month"}</UiText></p>
              </div>
            </div>
            {/* The arrows had no accessible name and no pointer cursor, and
                their glow fired on any hover of the whole card. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustMonth(-1)}
                aria-label={tr("Previous month")}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[130px] text-center text-xs font-black tabular-nums text-[#1d1b20]">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => adjustMonth(1)}
                aria-label={tr("Next month")}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[
              { label: tr("Present"), value: monthStats.present, dot: "bg-emerald-500", text: "text-emerald-600" },
              { label: tr("Absent"), value: monthStats.absent, dot: "bg-rose-500", text: "text-rose-600" },
              { label: tr("Leave"), value: monthStats.leave, dot: "bg-amber-500", text: "text-amber-600" },
            ].map((k) => (
              <span
                key={k.label}
                className={`inline-flex items-center gap-1.5 rounded-full bg-[#faf7fc] px-2.5 py-1 text-[10px] font-bold ${k.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
                {k.label}
                <span className="tabular-nums opacity-70">{k.value}</span>
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({length:7}, (_, index) => new Intl.DateTimeFormat(localeTag(locale), {weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2024,0,7+(locale.weekStartsOn+index)%7)))).map(d => (
              <div key={d} className="text-center text-[9px] font-bold text-ink-subtle uppercase tracking-wider py-2">{d}</div>
            ))}
            {calendarDays.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} />;
              const status = cell.record?.status;
              const label = `${monthLabel} ${cell.day} — ${
                status === "PRESENT"
                  ? tr("Present")
                  : status === "ABSENT"
                    ? tr("Absent")
                    : status === "LEAVE"
                      ? tr("Approved leave")
                      : tr("No record")
              }`;
              const bg = status === "PRESENT"
                ? "bg-emerald-50 border-emerald-200/50 text-emerald-700"
                : status === "ABSENT"
                ? "bg-rose-50 border-rose-200/50 text-rose-700"
                : status === "LEAVE"
                ? "bg-amber-50 border-amber-200/50 text-amber-700"
                : "bg-[#f3f4f9]/30 border-transparent text-ink-subtle";
              return (
                <div
                  key={cell.day}
                  title={label}
                  aria-label={label}
                  role="img"
                  className={`relative flex flex-col items-center justify-center rounded-xl border py-2 transition-all ${bg} ${status ? "hover:-translate-y-0.5 hover:shadow-md" : ""}`}
                >
                  <span className="text-xs font-bold">{cell.day}</span>
                  {status && (
                    <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5">
                      {tr(status).slice(0,1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black tracking-tight text-[#1d1b20]"><UiText>{"Attendance History"}</UiText></h3>
            <span className="text-[10px] font-semibold text-ink-subtle">
              {tr("Days recorded: {0}", [stats.total])}</span>
          </div>
          {data.user.attendance.length > 0 ? (
            <div className="space-y-3">
              {groupedByMonth.map((group) => (
                <div key={group.key}>
                  <p className="text-[11px] font-bold text-ink-subtle uppercase tracking-wider mb-2.5 px-1">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.entries.map((entry: any) => (
                      <AttendanceRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <StudentEmptyState
              icon={CalendarCheck}
              title={tr("No attendance recorded yet")}
              description={tr("Attendance will appear here after your teacher marks it.")}
            />
          )}
        </div>
      </div>
    </StudentPage>
  );
}

function AttendanceRow({ entry }: { entry: any }) {
 const tr = useUiText();
  const locale = useLocale();
  const date = new Date(entry.date);
  const dayName = date.toLocaleDateString(localeTag(locale), { weekday: "short", timeZone:"UTC" });
  const formatted = date.toLocaleDateString(localeTag(locale), { month: "short", day: "numeric", timeZone:"UTC" });

  const statusConfig: Record<string, { label: string; bg: string; dot: string }> = {
    PRESENT: { label: tr("Present"), bg: "bg-emerald-50 text-emerald-600 border-emerald-200/50 hover:bg-emerald-100 hover:border-emerald-300", dot: "bg-emerald-500" },
    ABSENT: { label: tr("Absent"), bg: "bg-rose-50 text-rose-600 border-rose-200/50 hover:bg-rose-100 hover:border-rose-300", dot: "bg-rose-500" },
    LEAVE: { label: tr("Leave"), bg: "bg-amber-50 text-amber-600 border-amber-200/50 hover:bg-amber-100 hover:border-amber-300", dot: "bg-amber-500" },
  };
  const cfg = statusConfig[entry.status] || { label: entry.status, bg: "bg-[#fbf0fe] text-[#8127cf] border-[#cfc2d6]/20", dot: "bg-[#8127cf]" };

  return (
    <div className="group flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3.5 border border-[#cfc2d6]/8 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-[#cfc2d6]/20">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center w-10">
          <span className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider">{dayName}</span>
          <span className="text-sm font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{new Intl.NumberFormat(localeTag(locale)).format(date.getUTCDate())}</span>
        </div>
        <div className="h-8 w-[1px] bg-[#cfc2d6]/15" />
        <div>
          <p className="text-xs font-semibold text-ink">{formatted}</p>
          {entry.notes && <p className="text-[9px] font-semibold text-ink-subtle">{entry.notes}</p>}
          {entry.marker?.fullName && (
            <p className="text-[9px] font-semibold text-ink-subtle"><UiText>{"Marked by"}</UiText>{entry.marker.fullName}</p>
          )}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider border shadow-sm transition-all duration-200 group-hover:shadow-md ${cfg.bg}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    </div>
  );
}
