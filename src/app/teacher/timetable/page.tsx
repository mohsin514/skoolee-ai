"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, CalendarX2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";
import { TimetableSkeleton } from "@/components/teacher/teacher-components";

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/timetable/teacher");
      const json = await res.json();
      if (json.success) setSlots(json.data);
      else toast.error("Failed to load timetable");
    } catch {
      toast.error("Failed to load timetable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TimetableSkeleton />;

  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const todaySlots = slots.filter((s) => s.dayOfWeek === (today === 0 ? 7 : today) && s.slotType === "CLASS" && s.subject);

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">My Schedule</p>
        <h2 className="text-3xl font-black tracking-normal text-[#1f1a23] mt-1">Weekly Timetable</h2>
        <p className="text-sm font-semibold text-[#4d4354]/60 mt-2">Your published class schedule across all assigned classes</p>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbf0fe]">
            <CalendarX2 className="h-7 w-7 text-[#8127cf]" />
          </div>
          <h3 className="text-base font-black text-[#1f1a23]">No classes assigned yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold text-[#4d4354]/55">
            Your timetable will appear here once the admin publishes a schedule and assigns classes to you. Check back later.
          </p>
        </div>
      ) : (
        <>
          {/* Today's classes highlight */}
          {todaySlots.length > 0 && (
            <div className="rounded-[24px] bg-gradient-to-r from-[#8127cf]/5 to-[#fbf0fe]/50 border border-[#8127cf]/10 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-[#8127cf] flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-white" />
                </div>
                <h3 className="text-xs font-black text-[#1f1a23]">Today&apos;s Classes</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {todaySlots.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white/80 border border-[#cfc2d6]/10 px-3 py-2">
                    <span className="text-[10px] font-black text-[#8127cf]">{s.startTime}</span>
                    <span className="text-[10px] font-bold text-[#4d4354]/30">|</span>
                    <span className="text-[10px] font-black text-[#1f1a23]">{s.subject?.name}</span>
                    <span className="text-[9px] font-semibold text-[#4d4354]/40">
                      {s.className}{s.classSection ? ` - ${s.classSection}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <TimetableReadOnly
            slots={slots.map((s) => ({
              ...s,
              teacher: null,
            }))}
            title="Full Week Schedule"
          />
        </>
      )}
    </div>
  );
}
