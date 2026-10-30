"use client";

import { useState } from "react";
import { CalendarCheck, CalendarPlus, CheckCircle2, Clock, X } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton, ParentStat } from "@/components/parent/parent-components";
import { DeskStats } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useParentData } from "../parent-data-context";
import { GuardianAttendanceExplanations, statusLabel } from "@/components/attendance/class-register";
import { GuardianLeave } from "@/components/family/family-requests";

export const dynamic = "force-dynamic";

/** Status colours from the status tokens, so the calendar reads the same in every theme. */
const STATUS_DOT: Record<string, string> = {
  PRESENT: "bg-status-success-text",
  ABSENT: "bg-status-error-text",
  LATE: "bg-status-warning-text",
  PARTIAL: "bg-status-info-text",
  EXCUSED: "bg-primary",
  LEAVE: "bg-brand-300",
};

/**
 * Attendance (family) — only what the family does about attendance: the rate, the recent-days calendar,
 * explaining an absence and asking for leave (primary). Pickup & transport, activities & trips and care
 * messages each moved to their own page or to Home (M89–M91).
 */
export default function ParentAttendancePage() {
  const tr = useUiText();
  const locale = useLocale();
  const { data, error, refetch, selectedStudentId } = useParentData();
  const [requestSignal, setRequestSignal] = useState(0);

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton />;
  const { attendance, student } = data;

  // The legend lists only the statuses this child's record actually contains.
  const presentStatuses = Object.keys(STATUS_DOT).filter((status) =>
    attendance.recent.some((a) => a.status === status),
  );
  const tag = localeTag(locale);
  const missed = (attendance.counted ?? attendance.total) - (attendance.attended ?? attendance.present);

  return (
    <ParentPage
      icon={CalendarCheck}
      title="Attendance"
      description={attendance.rate !== null
        ? tr("{0} · {1}% attendance over {2} recorded days", [`\u2068${student.fullName}\u2069`, attendance.rate, attendance.total])
        : tr("{0} · no attendance recorded yet", [`\u2068${student.fullName}\u2069`])}
      primaryAction={selectedStudentId ? { id: "request-leave", label: "Request leave", icon: CalendarPlus, onClick: () => setRequestSignal((n) => n + 1) } : undefined}
    >
      <div className="space-y-3">
        {attendance.total === 0 ? (
          <div className="sk-panel">
            <EmptyState icon={CalendarCheck} title={tr("No attendance data")} description={tr("Attendance records will appear here once marked.")} />
          </div>
        ) : (
          <>
            <DeskStats>
              <ParentStat icon={Clock} label={tr("Attendance rate")} value={attendance.rate !== null ? `${attendance.rate}%` : "—"} sub={attendance.rate === null ? tr("No rate yet") : attendance.rate >= 75 ? tr("Good standing") : tr("Below 75%")} />
              <ParentStat icon={CheckCircle2} label={tr("Present")} value={attendance.present} sub={tr("{0}% of recorded days", [attendance.total ? Math.round((attendance.present / attendance.total) * 100) : 0])} tone="green" index={1} />
              <ParentStat icon={X} label={tr("Absent / leave")} value={missed} sub={tr("Days missed")} tone="rose" index={2} />
            </DeskStats>

            <section aria-labelledby="recent-attendance-heading" className="sk-panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 id="recent-attendance-heading" className="text-base font-bold text-ink-strong">{tr("Recent school days")}</h2>
                <span className="text-xs tabular-nums text-ink-subtle"><bdi>{tr("{0} days", [attendance.recent.length])}</bdi></span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                {attendance.recent.map((a, i) => {
                  const label = `${new Date(a.date).toLocaleDateString(tag, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })} — ${statusLabel(tr, a.status)}`;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      {/* The date and status show on hover, keyboard focus or a long press. */}
                      <Tooltip content={label} describe={false}>
                        <span
                          role="img"
                          aria-label={label}
                          className={`block size-6 rounded-lg shadow-xs transition-transform motion-safe:hover:scale-110 ${STATUS_DOT[a.status] || "bg-ink-faint"}`}
                        />
                      </Tooltip>
                      <span className="text-3xs font-semibold tabular-nums text-ink-subtle">
                        {new Intl.NumberFormat(tag).format(new Date(a.date).getUTCDate())}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {presentStatuses.map((status) => (
                  <Badge key={status} variant="neutral">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
                    {statusLabel(tr, status)}
                    <bdi className="tabular-nums text-ink-subtle">
                      {attendance.recent.filter((a) => a.status === status).length}
                    </bdi>
                  </Badge>
                ))}
              </div>
            </section>
          </>
        )}
        {selectedStudentId ? <GuardianAttendanceExplanations studentId={selectedStudentId} /> : null}
        {/* SKO-421: leave for future days; the PageHeader's Request leave opens the form. */}
        {selectedStudentId ? <GuardianLeave key={`leave-${selectedStudentId}`} studentId={selectedStudentId} requestSignal={requestSignal} hideRequestButton /> : null}
      </div>
    </ParentPage>
  );
}
