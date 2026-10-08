"use client";

import { UiText, useUiText } from "@/components/locale/LocaleProvider";

import { useLocale } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { CalendarCheck, CheckCircle2, Clock, X } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

export default function ParentAttendancePage() {
  const tr = useUiText();
  const locale = useLocale();
  const { data, loading, error, refetch } = useParentData();

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const { attendance, student } = data;

  const statusColors: Record<string, string> = {
    PRESENT: "bg-emerald-500",
    ABSENT: "bg-rose-500",
    LATE: "bg-amber-500",
    LEAVE: "bg-blue-500",
  };

  // The legend used to list all four statuses whatever the child's record
  // actually contained, so a guardian looking at a full-attendance term was
  // told to look for three colours that were not on screen.
  const presentStatuses = Object.keys(statusColors).filter((status) =>
    attendance.recent.some((a) => a.status === status),
  );

  return (
    <ParentPage
      tone="attendance"
      icon={CalendarCheck}
      eyebrow={<>{attendance.rate !== null ? tr("Overall: {0}% · Days recorded: {1}", [attendance.rate, attendance.total]) : tr("No attendance data yet")}</>}
      title={tr("Attendance")}
      summary={<>{`${student.className} · ${student.fullName}`}</>}
    >
      <div className="space-y-3">
        {attendance.total === 0 ? (
          <ParentEmptyState icon={CalendarCheck} title={tr("No attendance data")} description={tr("Attendance records will appear here once marked.")} />
        ) : (
          <>
            <div className="sk-rise grid grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "40ms" }}>
              <ParentStat icon={Clock} label={tr("Attendance Rate")} value={attendance.rate !== null ? `${attendance.rate}%` : "N/A"} sub={attendance.rate !== null && attendance.rate >= 75 ? tr("Good standing") : tr("Below 75%")} />
              <ParentStat icon={CheckCircle2} label={tr("Present")} value={attendance.present} sub={`${attendance.total ? Math.round((attendance.present / attendance.total) * 100) : 0}% ${tr("of total")}`} tone="green" />
              <ParentStat icon={X} label={tr("Absent / Leave")} value={attendance.total - attendance.present} sub={tr("Days missed")} tone="rose" />
              <ParentStat icon={CalendarCheck} label={tr("Total Days")} value={attendance.total} sub={tr("School days recorded")} tone="violet" />
            </div>

            <div className="sk-rise rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]" style={{ animationDelay: "120ms" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black tracking-tight text-[#1d1b20]"><UiText>{"Recent Attendance"}</UiText></h3>
                <span className="text-[10px] font-semibold text-ink-subtle">{tr("Recent school days: {0}", [attendance.recent.length])}
                </span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {attendance.recent.map((a, i) => {
                  const label = `${new Date(a.date).toLocaleDateString(localeTag(locale), {timeZone:"UTC",
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })} — ${tr(a.status)}`;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div
                        role="img"
                        aria-label={label}
                        title={label}
                        className={`h-6 w-6 rounded-lg transition-transform hover:scale-110 ${statusColors[a.status] || "bg-gray-300"}`}
                      />
                      <span className="text-[8px] font-semibold tabular-nums text-ink-subtle">
                        {new Intl.NumberFormat(localeTag(locale)).format(new Date(a.date).getUTCDate())}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {presentStatuses.map((status) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#faf7fc] px-2.5 py-1 text-[10px] font-bold capitalize text-ink-muted"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${statusColors[status]}`} />
                    {tr(status)}
                    <span className="tabular-nums opacity-70">
                      {attendance.recent.filter((a) => a.status === status).length}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ParentPage>
  );
}

