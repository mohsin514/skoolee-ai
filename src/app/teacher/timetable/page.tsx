"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, CalendarRange, CalendarX2, Printer } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Tooltip } from "@/components/ui/tooltip";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { TimetableSkeleton } from "@/components/teacher/teacher-components";
import { ScheduleConflictsBanner } from "@/components/teacher/schedule-conflicts-banner";
import { clashingSlotIds } from "@/lib/timetable/clashes";
import { MyCover } from "@/components/cover/my-cover";

interface TeacherSlot {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  subject: { id: string; name: string } | null;
  className: string;
  classSection: string | null;
  classId: string;
  roomNumber: string | null;
}

/**
 * Timetable & cover: the teacher's published week, exam date sheet and, below them, the lessons they
 * cover and the cover arranged for theirs (MyCover). The read-only duty list that used to sit above
 * the timetable duplicated MyCover and is gone (M67).
 */
export default function TeacherTimetablePage() {
  const ui = useUiText();
  const [slots, setSlots] = useState<TeacherSlot[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load used to fall through to "No classes assigned yet", which
  // told the teacher their schedule was empty when it simply had not arrived.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    let timetableLoaded = false;
    try {
      const [ttRes, calRes] = await Promise.all([
        fetch("/api/timetable/teacher"),
        fetch("/api/academic/calendar"),
      ]);
      const json = await ttRes.json();
      if (json.success) { setSlots(json.data); timetableLoaded = true; }
      else setLoadFailed(true);
      const calJson = await calRes.json();
      if (calJson.success) setWeekendDays(calJson.data.weekends || []);
    } catch {
      // The calendar only supplies weekend shading; losing it is not a failed timetable.
      if (!timetableLoaded) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TimetableSkeleton weekendDays={weekendDays} />;

  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const todaySlots = slots.filter((s) => s.dayOfWeek === (today === 0 ? 7 : today) && s.slotType === "CLASS" && s.subject);
  const clashIds = clashingSlotIds(slots);

  return (
    <TeacherPage
      icon={CalendarRange}
      title="Timetable & cover"
      description="Your published week, your exam date sheet and the cover arranged with you."
      secondaryActions={slots.length ? [{ id: "print", label: "Print", icon: Printer, onClick: () => window.print() }] : []}
    >
      {/* TeacherPage already supplies the scroll area, the tinted ground and
          the padding; repeating them here nested a second scrollbar inside the
          first, so the week grid scrolled independently of the page around it. */}
      <div className="space-y-6">
      {loadFailed ? (
        <div className="sk-panel sk-enter">
          <ErrorState
            title={ui("Couldn't load your timetable")}
            description={ui("Your schedule didn't load. Try again, and if it keeps happening, ask your academic lead.")}
            onRetry={() => { void load(); }}
          />
        </div>
      ) : slots.length === 0 ? (
        <div className="sk-panel sk-enter" style={{ "--sk-delay": "80ms" } as React.CSSProperties}>
          <EmptyState
            icon={CalendarX2}
            title={ui("No classes assigned yet")}
            description={ui("Your timetable appears here once your academic lead publishes a schedule with your classes.")}
          />
        </div>
      ) : (
        <>
          <ScheduleConflictsBanner slots={slots} />

          {/* Today's classes highlight */}
          {todaySlots.length > 0 && (
            <section
              aria-labelledby="today-classes-heading"
              className="sk-enter rounded-[24px] border border-primary/10 bg-gradient-to-r from-primary/5 to-brand-50/50 p-4 shadow-md sm:p-5"
              style={{ "--sk-delay": "80ms" } as React.CSSProperties}
            >
              <div className="mb-3 flex items-center gap-2">
                <div aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-brand">
                  <Calendar className="size-4 text-primary-foreground" />
                </div>
                <h2 id="today-classes-heading" className="text-base font-bold text-ink-strong">{ui("Today's classes")}</h2>
              </div>
              <ul className="flex flex-wrap gap-2">
                {todaySlots.map((s) => {
                  const clashes = clashIds.has(s.id);
                  const chip = (
                    <div
                      tabIndex={clashes ? 0 : undefined}
                      className={`flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border px-3 py-2 ${
                        clashes
                          ? "border-status-error-border bg-status-error-surface"
                          : "border-edge/10 bg-card/80"
                      }`}
                    >
                      {clashes ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-status-error-text" /> : null}
                      <span dir="ltr" className={`text-xs font-bold tabular-nums ${clashes ? "text-status-error-text" : "text-primary"}`}>{s.startTime}</span>
                      <span aria-hidden="true" className="text-xs text-ink-faint">|</span>
                      <bdi className="text-xs font-semibold text-ink-strong">{s.subject?.name}</bdi>
                      <span className="text-xs text-ink-subtle">
                        {s.className}{s.classSection ? ` - ${s.classSection}` : ""}
                      </span>
                    </div>
                  );
                  return (
                    <li key={s.id} className="min-w-0 max-w-full">
                      {/* A clash is shown by colour and icon, so the reason is
                          also a tooltip that keyboard and touch can reach. */}
                      {clashes ? <Tooltip content={ui("You are booked in another class this period")}>{chip}</Tooltip> : chip}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <TimetableReadOnly
            slots={slots.map((s) => ({
              ...s,
              teacher: null,
            }))}
            title={ui("Full week")}
            weekendDays={weekendDays}
          />

          <ExamDateSheet />
        </>
      )}
      {/* SKO-442: handovers, cover outcomes and missed-learning follow-up — also for staff with no lessons of their own. */}
      <div><MyCover /></div>
      </div>
    </TeacherPage>
  );
}
