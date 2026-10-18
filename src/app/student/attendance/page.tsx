"use client";

import { UiText, useUiText } from "@/components/locale/LocaleProvider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { InfoTip } from "@/components/ui/tooltip";

import { useLocale } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { useEffect, useMemo, useState } from "react";
import { ATTENDANCE_RISK_THRESHOLD, summarizeAttendance } from "@/lib/attendance";
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, X, Clock } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { AttendanceSkeleton, StudentErrorState } from "@/components/student/student-components";
import { StatCard } from "@/components/student/student-ui";
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
    () => summarizeAttendance(data?.user?.attendance || [], data?.user?.attendanceRule),
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

  const monthStats = useMemo(() => summarizeAttendance(monthRecords, data?.user?.attendanceRule), [monthRecords, data]);

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
          <Alert tone="warning" live="off" title={tr("Attendance below {0}%", [ATTENDANCE_RISK_THRESHOLD])}>
            {tr("Your attendance is at {0}%. Regular attendance is important for academic success.", [stats.rate])}
            {consecutiveAbsences >= 3 ? ` ${tr("You have {0} consecutive absences.", [consecutiveAbsences])}` : null}
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={CalendarDays} label={tr("Total Days")} value={stats.total} sub={tr("School days recorded")} delay={40} />
          <StatCard icon={CheckCircle2} label={tr("Present")} value={stats.present} sub={`${stats.total ? Math.round((stats.present / stats.total) * 100) : 0}% ${tr("of total")}`} tone="green" ring={stats.total ? Math.round((stats.present / stats.total) * 100) : null} delay={80} />
          <StatCard icon={X} label={tr("Absent")} value={stats.absent} sub={consecutiveAbsences > 0 ? tr("Consecutive: {0}", [consecutiveAbsences]) : tr("No consecutive")} tone="rose" delay={120} />
          <StatCard icon={Clock} label={tr("Leave")} value={stats.leave} sub={tr("Approved leaves")} tone="amber" delay={160} />
        </div>

        <section aria-labelledby="attendance-calendar-title" className="sk-panel sk-rise p-3 sm:p-4" style={{ animationDelay: "120ms" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                <CalendarDays className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 id="attendance-calendar-title" className="truncate text-sm font-bold tracking-tight text-ink-strong"><UiText>{"Monthly Calendar"}</UiText></h2>
                <p className="flex items-center gap-0.5 text-xs text-ink-subtle">
                  <span className="tabular-nums">{monthStats.rate ?? 0}<UiText>{"% this month"}</UiText></span>
                  <InfoTip content={tr("Days attended as a share of this month's counted school days, using your school's attendance rule.")} />
                </p>
              </div>
            </div>
            {/* The arrows had no accessible name and no pointer cursor, and
                their glow fired on any hover of the whole card. */}
            <div className="flex items-center gap-1.5">
              <IconButton variant="outline" label={tr("Previous month")} onClick={() => adjustMonth(-1)}>
                <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
              </IconButton>
              <span aria-live="polite" className="min-w-[8.5rem] text-center text-sm font-semibold tabular-nums text-ink-strong">
                {monthLabel}
              </span>
              <IconButton variant="outline" label={tr("Next month")} onClick={() => adjustMonth(1)}>
                <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
              </IconButton>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[
              { label: tr("Present"), value: monthStats.present, variant: "success" as const },
              { label: tr("Absent"), value: monthStats.absent, variant: "danger" as const },
              { label: tr("Leave"), value: monthStats.leave, variant: "warning" as const },
            ].map((k) => (
              <Badge key={k.label} variant={k.variant} size="sm" dot>
                {k.label}
                <span className="tabular-nums opacity-80">{k.value}</span>
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({length:7}, (_, index) => new Intl.DateTimeFormat(localeTag(locale), {weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2024,0,7+(locale.weekStartsOn+index)%7)))).map(d => (
              <div key={d} className="truncate py-2 text-center text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{d}</div>
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
                : "bg-muted/30 border-transparent text-ink-subtle";
              return (
                <div
                  key={cell.day}
                  title={label}
                  aria-label={label}
                  role="img"
                  className={`relative flex min-h-11 flex-col items-center justify-center rounded-xl border py-1.5 transition-shadow duration-200 ${bg} ${status ? "hover:shadow-sm" : ""}`}
                >
                  <span className="text-xs font-bold tabular-nums">{cell.day}</span>
                  {status && (
                    <span className="text-3xs font-semibold uppercase tracking-wider mt-0.5">
                      {tr(status).slice(0,1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="attendance-history-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id="attendance-history-title" className="text-sm font-bold tracking-tight text-ink-strong"><UiText>{"Attendance History"}</UiText></h2>
            <span className="text-xs tabular-nums text-ink-subtle">
              {tr("Days recorded: {0}", [stats.total])}</span>
          </div>
          {data.user.attendance.length > 0 ? (
            <div className="space-y-3">
              {groupedByMonth.map((group) => (
                <div key={group.key}>
                  <p className="sk-eyebrow mb-2 px-1">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.entries.map((entry: any) => (
                      <AttendanceRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              className="sk-panel"
              title={tr("No attendance recorded yet")}
              description={tr("Attendance will appear here after your teacher marks it.")}
            />
          )}
        </section>
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

  const statusConfig: Record<string, { label: string; variant: "success" | "danger" | "warning" }> = {
    PRESENT: { label: tr("Present"), variant: "success" },
    ABSENT: { label: tr("Absent"), variant: "danger" },
    LEAVE: { label: tr("Leave"), variant: "warning" },
  };
  const cfg: { label: string; variant: "success" | "danger" | "warning" | "secondary" } = statusConfig[entry.status] || { label: entry.status, variant: "secondary" };

  return (
    <div className="sk-panel flex min-w-0 items-center justify-between gap-3 px-3 py-3 shadow-xs sm:px-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex w-10 shrink-0 flex-col items-center">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{dayName}</span>
          <span className="text-sm font-bold tabular-nums text-ink-strong">{new Intl.NumberFormat(localeTag(locale)).format(date.getUTCDate())}</span>
        </div>
        <div aria-hidden="true" className="h-8 w-px shrink-0 bg-edge/15" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{formatted}</p>
          {entry.notes && <p className="break-words text-xs text-ink-muted">{entry.notes}</p>}
          {entry.marker?.fullName && (
            <p className="truncate text-xs text-ink-subtle"><UiText>{"Marked by"}</UiText>{entry.marker.fullName}</p>
          )}
        </div>
      </div>
      <Badge variant={cfg.variant} size="sm" dot className="shrink-0">
        {cfg.label}
      </Badge>
    </div>
  );
}
