"use client";

import { useCallback, useEffect, useState } from "react";
import { friendlyErrorMessage } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar, Clock } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
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
  const ui = useUiText();
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
      else setError(friendlyErrorMessage(json.error, "We couldn't load your timetable. Please try again."));
      const calJson = await calRes.json();
      if (calJson.success) setWeekendDays(calJson.data.weekends || []);
    } catch (err) {
      // The full-page error below already says this and offers a retry, so no toast on top of it.
      setError(friendlyErrorMessage(err, "We couldn't load your timetable. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TimetableSkeleton weekendDays={weekendDays} />;
  if (error) return <StudentErrorState error={error} onRetry={load} />;

  return (
    <StudentPage
      icon={Clock}
      title="Timetable"
      description="Your week, lesson by lesson, and your exam date sheet."
      status={data ? <bdi className="text-sm font-semibold text-ink-muted">{data.className}{data.classSection ? ` · ${data.classSection}` : ""}</bdi> : undefined}
    >
      <div className="space-y-3">
        {data ? (
          <TimetableReadOnly slots={data.slots} weekendDays={weekendDays} />
        ) : (
          <EmptyState
            icon={Calendar}
            className="sk-panel"
            title={ui("No timetable published")}
            description={ui("Your class timetable appears here once the administration publishes it.")}
          />
        )}
        <ExamDateSheet classId={data?.classId} />
      </div>
    </StudentPage>
  );
}
