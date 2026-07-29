"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";

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

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
        </div>
      </div>
    );
  }

  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const todaySlots = slots.filter((s) => s.dayOfWeek === (today === 0 ? 7 : today) && s.slotType === "CLASS" && s.subject);

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">My Schedule</p>
        <h2 className="text-3xl font-black tracking-normal text-[#1f1a23] mt-1">Weekly Timetable</h2>
        <p className="text-sm font-semibold text-[#4d4354]/60 mt-2">Your published class schedule across all assigned classes</p>
      </div>

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
    </div>
  );
}
