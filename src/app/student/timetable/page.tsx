"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock } from "lucide-react";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { StudentErrorState, TimetableSkeleton } from "@/components/student/student-components";

interface ClassTimetableData {
  classId: string;
  className: string;
  classSection: string | null;
  slots: Array<{
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
    slotType: string;
    subject: { id: string; name: string } | null;
    teacher: { id: string; fullName: string } | null;
    roomNumber: string | null;
  }>;
}

export default function StudentTimetablePage() {
  const [data, setData] = useState<ClassTimetableData | null>(null);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ttRes, calRes] = await Promise.all([
        fetch("/api/timetable/class"),
        fetch("/api/academic/calendar"),
      ]);
      const json = await ttRes.json();
      if (json.success) setData(json.data);
      else setError(json.error || "Failed to load timetable");
      const calJson = await calRes.json();
      if (calJson.success) setWeekendDays(calJson.data.weekends || []);
    } catch {
      setError("Failed to load timetable");
      toast.error("Failed to load timetable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TimetableSkeleton weekendDays={weekendDays} />;
  if (error) return <StudentErrorState error={error} onRetry={load} />;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {data ? `${data.slots.length} class slots scheduled` : "Weekly schedule"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Weekly Timetable</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">
            {data ? `${data.className}${data.classSection ? ` - ${data.classSection}` : ""}` : "Your class timetable"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        {data ? (
          <TimetableReadOnly slots={data.slots} weekendDays={weekendDays} />
        ) : (
          <div className="sk-rise flex flex-col items-center justify-center py-24 text-center rounded-[40px] border border-dashed border-[#cfc2d6]/20 bg-[#fbf0fe]/10" style={{ animationDelay: "80ms" }}>
            <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
              <Calendar className="w-8 h-8 text-[#8127cf]/40" />
            </div>
            <h3 className="text-xl font-bold text-[#1d1b20] tracking-tight">No Timetable Published</h3>
            <p className="mt-2 text-sm font-semibold text-[#4d4354]/55 max-w-sm">
              Your class timetable will appear here once it has been published by the administration.
            </p>
          </div>
        )}
        <ExamDateSheet classId={data?.classId} />
      </div>
    </section>
  );
}
