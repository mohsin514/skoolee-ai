"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, CalendarX2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { TimetableSkeleton } from "@/components/teacher/teacher-components";
import { ScheduleConflictsBanner } from "@/components/teacher/schedule-conflicts-banner";
import { clashingSlotIds } from "@/lib/timetable/clashes";

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

export default function TeacherTimetablePage() {
  const [slots, setSlots] = useState<TeacherSlot[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ttRes, calRes] = await Promise.all([
        fetch("/api/timetable/teacher"),
        fetch("/api/academic/calendar"),
      ]);
      const json = await ttRes.json();
      if (json.success) setSlots(json.data);
      else toast.error("Failed to load timetable");
      const calJson = await calRes.json();
      if (calJson.success) setWeekendDays(calJson.data.weekends || []);
    } catch {
      toast.error("Failed to load timetable");
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
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border-b border-[#cfc2d6]/12 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <Calendar className="w-4 h-4" />
            <p className="text-[10px] font-semibold uppercase tracking-wider">My Schedule</p>
          </div>
          <h1 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Weekly Timetable</h1>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Your published class schedule across all assigned classes</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">
      {slots.length === 0 ? (
        <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white p-10 text-center shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbf0fe]">
            <CalendarX2 className="h-7 w-7 text-[#8127cf]" />
          </div>
          <h3 className="text-base font-black text-[#1f1a23]">No classes assigned yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold text-ink-muted">
            Your timetable will appear here once the admin publishes a schedule and assigns classes to you. Check back later.
          </p>
        </div>
      ) : (
        <>
          <ScheduleConflictsBanner slots={slots} />

          {/* Today's classes highlight */}
          {todaySlots.length > 0 && (
            <div className="sk-rise rounded-[24px] bg-gradient-to-r from-[#8127cf]/5 to-[#fbf0fe]/50 border border-[#8127cf]/10 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-[#8127cf] flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-white" />
                </div>
                <h3 className="text-xs font-black text-[#1f1a23]">Today&apos;s Classes</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {todaySlots.map((s) => {
                  const clashes = clashIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      title={clashes ? "You are booked in another class this period" : undefined}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                        clashes
                          ? "bg-rose-50 border-rose-200"
                          : "bg-white/80 border-[#cfc2d6]/10"
                      }`}
                    >
                      {clashes ? <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" /> : null}
                      <span className={`text-[10px] font-black ${clashes ? "text-rose-600" : "text-[#8127cf]"}`}>{s.startTime}</span>
                      <span className="text-[10px] font-bold text-ink-subtle">|</span>
                      <span className="text-[10px] font-black text-[#1f1a23]">{s.subject?.name}</span>
                      <span className="text-[9px] font-semibold text-ink-subtle">
                        {s.className}{s.classSection ? ` - ${s.classSection}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <TimetableReadOnly
            slots={slots.map((s) => ({
              ...s,
              teacher: null,
            }))}
            title="Full Week Schedule"
            weekendDays={weekendDays}
          />

          <ExamDateSheet />
        </>
      )}
      </div>
    </section>
  );
}
