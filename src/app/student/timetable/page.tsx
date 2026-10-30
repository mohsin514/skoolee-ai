"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar, Clock } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { TimetableReadOnly } from "@/components/timetable/TimetablePanel";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { MyNextPaper } from "@/components/exams/my-next-paper";
import { TimetableSkeleton } from "@/components/student/student-components";

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
  const [error, setError] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const [ttRes, calRes] = await Promise.all([
        readRequest("/api/timetable/class"),
        readRequest("/api/academic/calendar"),
      ]);
      const [json, calJson] = await Promise.all([checkedJson(ttRes), checkedJson(calRes)]);
      if (version !== loadSequence.current) return;
      if ((json.data !== null && !Array.isArray(json.data?.slots)) || !Array.isArray(calJson.data?.weekends)) throw new RequestFailure("server");
      setData(json.data);
      setWeekendDays(calJson.data.weekends);
    } catch (err) {
      if (version !== loadSequence.current) return;
      setData(null);
      setWeekendDays([]);
      setError(requestFailure(err));
    } finally {
      if (version === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

  if (loading) return <TimetableSkeleton weekendDays={weekendDays} />;
  if (error) return <ErrorState error={error} onRetry={load} />;

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
        {/* SKO-505: paper and online sittings in one list, the next one with a countdown. */}
        <MyNextPaper source="/api/student/exam-timeline" examHref={id => `/ai/exams/${encodeURIComponent(id)}`} />
        <ExamDateSheet classId={data?.classId} />
      </div>
    </StudentPage>
  );
}
