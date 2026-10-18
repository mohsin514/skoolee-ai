"use client";

import { UiText, useUiText } from "@/components/locale/LocaleProvider";

import { useLocale } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { CalendarCheck, CheckCircle2, Clock, X } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useParentData } from "../parent-data-context";
import { GuardianAttendanceExplanations } from "@/components/attendance/class-register";
import { GuardianLeave, GuardianTrips } from "@/components/family/family-requests";
import { FamilyPickups } from "@/components/pickup/pickup";
import { FamilyActivities } from "@/components/activities/activities";
import { FamilyCareMessages } from "@/components/care/care";
import { FamilyJourney } from "@/components/transport/transport";

export const dynamic = "force-dynamic";

export default function ParentAttendancePage() {
  const tr = useUiText();
  const locale = useLocale();
  const { data, loading, error, refetch, selectedStudentId, children, token } = useParentData();
  const pickupChildId = token ? null : selectedStudentId ?? children[0]?.id ?? null;

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const { attendance, student } = data;

  const statusColors: Record<string, string> = {
    PRESENT: "bg-emerald-500",
    ABSENT: "bg-rose-500",
    LATE: "bg-amber-500",
    PARTIAL: "bg-sky-500",
    EXCUSED: "bg-violet-500",
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
              <ParentStat icon={Clock} label={tr("Attendance Rate")} value={attendance.rate !== null ? `${attendance.rate}%` : "N/A"} sub={attendance.rate === null ? tr("No rate yet") : attendance.rate >= 75 ? tr("Good standing") : tr("Below 75%")} />
              <ParentStat icon={CheckCircle2} label={tr("Present")} value={attendance.present} sub={`${attendance.total ? Math.round((attendance.present / attendance.total) * 100) : 0}% ${tr("of total")}`} tone="green" />
              <ParentStat icon={X} label={tr("Absent / Leave")} value={(attendance.counted ?? attendance.total) - (attendance.attended ?? attendance.present)} sub={tr("Days missed")} tone="rose" />
              <ParentStat icon={CalendarCheck} label={tr("Total Days")} value={attendance.total} sub={tr("School days recorded")} tone="violet" />
            </div>

            <div className="sk-panel sk-rise p-4" style={{ animationDelay: "120ms" }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="text-base font-bold text-ink-strong"><UiText>{"Recent Attendance"}</UiText></h3>
                <span className="text-xs tabular-nums text-ink-subtle">{tr("Recent school days: {0}", [attendance.recent.length])}
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
                      {/* The date and status show on hover, keyboard focus or a
                          long press; the old native title= only worked with a mouse. */}
                      <Tooltip content={label} describe={false}>
                        <span
                          role="img"
                          aria-label={label}
                          className={`block h-6 w-6 rounded-lg shadow-xs transition-transform motion-safe:hover:scale-110 ${statusColors[a.status] || "bg-ink-faint"}`}
                        />
                      </Tooltip>
                      <span className="text-3xs font-semibold tabular-nums text-ink-subtle">
                        {new Intl.NumberFormat(localeTag(locale)).format(new Date(a.date).getUTCDate())}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {presentStatuses.map((status) => (
                  <Badge key={status} variant="neutral" className="capitalize">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusColors[status]}`} />
                    {tr(status)}
                    <span className="tabular-nums text-ink-subtle">
                      {attendance.recent.filter((a) => a.status === status).length}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
        {selectedStudentId ? <GuardianAttendanceExplanations studentId={selectedStudentId} /> : null}
        {/* SKO-421: leave for future days and trip permission for this child. */}
        {selectedStudentId ? <GuardianLeave key={`leave-${selectedStudentId}`} studentId={selectedStudentId} /> : null}
        {/* SKO-438: who may collect this child; shown only to guardians with the pickup permission. */}
        {pickupChildId ? <div className="mt-6"><FamilyPickups key={`pickup-${pickupChildId}`} studentId={pickupChildId} /></div> : null}
        {/* SKO-440: clubs, sports and trips for this child. */}
        {pickupChildId ? <div className="mt-6"><FamilyActivities key={`act-${pickupChildId}`} studentId={pickupChildId} /></div> : null}
        {selectedStudentId ? <GuardianTrips key={`trips-${selectedStudentId}`} studentId={selectedStudentId} /> : null}
        {/* SKO-437: today's school transport status for this child, as recorded by the attendant. */}
        {selectedStudentId ? <div className="mt-6"><FamilyJourney key={`bus-${selectedStudentId}`} studentId={selectedStudentId} /></div> : null}
        {/* SKO-439: only messages a safeguarding lead approved for this guardian; nothing is sent automatically. */}
        <div className="mt-6"><FamilyCareMessages /></div>
      </div>
    </ParentPage>
  );
}

