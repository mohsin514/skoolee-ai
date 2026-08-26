"use client";

import { CalendarDays } from "lucide-react";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { TeacherPage } from "@/components/teacher/teacher-page";

export default function TeacherCalendarPage() {
  return (
    <TeacherPage
      tone="timetable"
      icon={CalendarDays}
      eyebrow="School Calendar"
      title="Academic Calendar"
      summary="Upcoming events, holidays and scheduled activities"
    >
      <AcademicCalendar readOnly role="TEACHER" />
    </TeacherPage>
  );
}
