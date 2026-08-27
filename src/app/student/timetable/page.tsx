"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { StudentErrorState, TimetableSkeleton } from "@/components/student/student-components";
import { StudentEmptyState } from "@/components/student/student-ui";

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
    <StudentPage
      tone="timetable"
      icon={Clock}
      eyebrow={<>{data ? `${data.slots.length} class slots scheduled` : "Weekly schedule"}</>}
      title="Weekly Timetable"
      summary={
        <>
          {data
            ? `${data.className}${data.classSection ? ` - ${data.classSection}` : ""}`
            : "Your class timetable"}
        </>
      }
    >
      <div className="space-y-3">
        {data ? (
          <TimetableReadOnly slots={data.slots} weekendDays={weekendDays} />
        ) : (
          <StudentEmptyState
            icon={Calendar}
            title="No timetable published"
            description="Your class timetable appears here once the administration publishes it."
          />
        )}
        <ExamDateSheet classId={data?.classId} />
      </div>
    </StudentPage>
  );
}
