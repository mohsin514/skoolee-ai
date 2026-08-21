"use client";

import { ChevronDown, Printer, User } from "lucide-react";
import type { GridDay, GridPeriod, TeacherOption, TimetableData } from "./TimetableStudio";

interface TeacherSlot {
  classLabel: string;
  day: number;
  period: number;
  subject: string;
  start: string;
  end: string;
}

export function TeacherView({
  timetables,
  teachers,
  periods,
  visibleDays,
  weekendDays,
  selectedTeacherId,
  onSelectTeacher,
}: {
  timetables: TimetableData[];
  teachers: TeacherOption[];
  periods: GridPeriod[];
  visibleDays: GridDay[];
  weekendDays: number[];
  selectedTeacherId: string;
  onSelectTeacher: (id: string) => void;
}) {
  const teacherSlotMap = new Map<string, TeacherSlot[]>();
  for (const tt of timetables) {
    const clsLabel = `${tt.class.name}${tt.class.section ? ` ${tt.class.section}` : ""}`;
    for (const s of tt.slots) {
      if (!s.teacherId) continue;
      const existing = teacherSlotMap.get(s.teacherId) || [];
      existing.push({
        classLabel: clsLabel,
        day: s.dayOfWeek,
        period: s.periodNumber,
        subject: s.subject?.name || "",
        start: s.startTime,
        end: s.endTime,
      });
      teacherSlotMap.set(s.teacherId, existing);
    }
  }

  const selectedTeacherSlots = selectedTeacherId ? teacherSlotMap.get(selectedTeacherId) || [] : [];
  const gridCols = `80px repeat(${visibleDays.length}, 1fr)`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={selectedTeacherId}
            onChange={(e) => onSelectTeacher(e.target.value)}
            className="h-11 rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 pr-10 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 appearance-none cursor-pointer"
          >
            <option value="">— Select teacher —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
        </div>
        {selectedTeacherId && (
          <span className="text-[10px] font-bold text-ink-muted">
            {selectedTeacherSlots.length} slot{selectedTeacherSlots.length !== 1 ? "s" : ""} across all classes
          </span>
        )}
        {selectedTeacherId && (
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-3 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-all hover:bg-[#8127cf]/10 hover:text-[#8127cf] cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />Print Routine
          </button>
        )}
      </div>

      {!selectedTeacherId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#fbf0fe]">
            <User className="h-8 w-8 text-[#8127cf]/30" />
          </div>
          <h3 className="text-lg font-black text-[#1f1a23]">Select a Teacher</h3>
          <p className="mt-2 max-w-sm text-sm font-semibold text-ink-muted">
            Choose a teacher above to see their full weekly schedule across every class they teach.
          </p>
        </div>
      )}

      {selectedTeacherId && (
        <div className="overflow-x-auto rounded-[28px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <div className="min-w-[760px]">
            <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: gridCols }}>
              <div className="flex items-center justify-center p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">Period</span>
              </div>
              {visibleDays.map((day) => (
                <div
                  key={day.num}
                  className={`flex flex-col items-center justify-center py-3 border-l border-[#f3f4f9] ${
                    weekendDays.includes(day.num) ? "opacity-50 bg-[#f3f4f9]/70" : ""
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">{day.short}</span>
                  <span className="text-[8px] font-bold text-ink-subtle mt-0.5">{day.full}</span>
                </div>
              ))}
            </div>

            {periods.length > 0 ? (
              periods.map((period) => (
                <div
                  key={period.num}
                  className="grid border-b border-[#f3f4f9] last:border-b-0"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="flex flex-col items-center justify-center p-2 border-r border-[#f3f4f9]">
                    <span className="text-[10px] font-black text-[#8127cf]">P{period.num}</span>
                    <span className="text-[8px] font-bold text-ink-subtle mt-0.5">{period.start}</span>
                  </div>
                  {visibleDays.map((day) => {
                    const isOff = weekendDays.includes(day.num);
                    const slotInfo = selectedTeacherSlots.find((s) => s.day === day.num && s.period === period.num);
                    const isConflict =
                      selectedTeacherSlots.filter((s) => s.day === day.num && s.period === period.num).length > 1;
                    return (
                      <div
                        key={day.num}
                        className={`border-l border-[#f3f4f9] p-1 ${isOff ? "opacity-40 bg-[#f3f4f9]/70" : ""}`}
                      >
                        {slotInfo ? (
                          <div
                            className={`h-full min-h-[48px] rounded-xl p-2 flex flex-col justify-center ${
                              isConflict ? "bg-rose-100 border border-rose-300" : "bg-emerald-50 border border-emerald-200"
                            }`}
                          >
                            <p
                              className={`text-[10px] font-black leading-tight ${
                                isConflict ? "text-rose-700" : "text-emerald-700"
                              }`}
                            >
                              {slotInfo.subject}
                            </p>
                            <p className="text-[8px] font-semibold text-ink-muted mt-0.5">{slotInfo.classLabel}</p>
                            {isConflict && (
                              <span className="mt-0.5 text-[7px] font-black uppercase text-rose-600">CONFLICT</span>
                            )}
                          </div>
                        ) : (
                          <div className="h-full min-h-[48px] rounded-xl border border-dashed border-[#cfc2d6]/15 flex items-center justify-center">
                            <span className="text-[8px] font-semibold text-ink-subtle">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-16 text-sm font-semibold text-ink-subtle">
                No timetable periods found. Create timetables for classes first.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
