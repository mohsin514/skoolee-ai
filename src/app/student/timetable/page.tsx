"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";

interface ClassTimetableData {
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/timetable/class");
      const json = await res.json();
      if (json.success) setData(json.data);
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Class Schedule</p>
        <h2 className="text-3xl font-black tracking-normal text-[#1f1a23] mt-1">
          Weekly Timetable
        </h2>
        {data && (
          <p className="text-sm font-semibold text-[#4d4354]/60 mt-2">
            {data.className}{data.classSection ? ` - ${data.classSection}` : ""}
          </p>
        )}
      </div>

      {data ? (
        <TimetableReadOnly slots={data.slots} />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
            <Calendar className="w-8 h-8 text-[#8127cf]/30" />
          </div>
          <h3 className="text-lg font-black text-[#1f1a23]">No Timetable Published</h3>
          <p className="mt-2 text-sm font-semibold text-[#4d4354]/50 max-w-sm">
            Your class timetable will appear here once it has been published by the administration.
          </p>
        </div>
      )}
    </div>
  );
}
