"use client";

import { CalendarDays } from "lucide-react";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";

export default function TeacherCalendarPage() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border-b border-[#cfc2d6]/12 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CalendarDays className="w-4 h-4" />
            <p className="text-[10px] font-semibold uppercase tracking-wider">School Calendar</p>
          </div>
          <h1 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Academic Calendar</h1>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Upcoming events, holidays and scheduled activities</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20">
        <AcademicCalendar readOnly role="TEACHER" />
      </div>
    </section>
  );
}