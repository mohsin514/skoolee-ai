"use client";

import { CalendarX, ChevronDown, Printer, User } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { GridDay, GridPeriod, TeacherOption, TimetableData } from "./TimetableStudio";
import { Select as SystemSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/components/locale/LocaleProvider";


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
  const ui = useUiText();
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
          <SystemSelect
            value={selectedTeacherId}
            onChange={(e) => onSelectTeacher(e.target.value)}
            className="px-4 pe-10 appearance-none"
            aria-label={ui("Teacher")}
          >
            <option value="">{ui("Choose a teacher")}</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </SystemSelect>

        </div>
        {selectedTeacherId && (
          <span className="text-2xs font-bold text-ink-muted">
            {ui(selectedTeacherSlots.length === 1 ? "1 slot across all classes" : "{0} slots across all classes", [selectedTeacherSlots.length])}
          </span>
        )}
        {selectedTeacherId && (
          <Button variant="secondary" size="sm"
            type="button"
            onClick={() => window.print()}
            className="flex justify-start items-center gap-1.5"
          >
            <Printer aria-hidden="true" className="h-3.5 w-3.5" />{ui("Print routine")}
          </Button>
        )}
      </div>

      {!selectedTeacherId && (
        <div className="py-16">
          <EmptyState icon={User} title={ui("Select a teacher")} description={ui("Choose a teacher above to see their full weekly schedule across every class they teach.")} />
        </div>
      )}

      {selectedTeacherId && (
        <div className="sk-panel overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid border-b border-muted" style={{ gridTemplateColumns: gridCols }}>
              <div className="flex items-center justify-center p-3">
                <span className="text-xs font-semibold text-ink-subtle">{ui("Period")}</span>
              </div>
              {visibleDays.map((day) => (
                <div
                  key={day.num}
                  className={`flex flex-col items-center justify-center py-3 border-s border-muted ${
                    weekendDays.includes(day.num) ? "opacity-50 bg-muted/70" : ""
                  }`}
                >
                  <span className="text-xs font-semibold text-ink-subtle">{ui(day.full)}</span>
                </div>
              ))}
            </div>

            {periods.length > 0 ? (
              periods.map((period) => (
                <div
                  key={period.num}
                  className="grid border-b border-muted last:border-b-0"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="flex flex-col items-center justify-center p-2 border-e border-muted">
                    <span className="text-2xs font-bold text-primary" title={ui("Period {0}", [period.num])}>{ui("P{0}", [period.num])}</span>
                    <bdi dir="ltr" className="text-3xs font-bold text-ink-subtle mt-0.5">{period.start}</bdi>
                  </div>
                  {visibleDays.map((day) => {
                    const isOff = weekendDays.includes(day.num);
                    const slotInfo = selectedTeacherSlots.find((s) => s.day === day.num && s.period === period.num);
                    const isConflict =
                      selectedTeacherSlots.filter((s) => s.day === day.num && s.period === period.num).length > 1;
                    return (
                      <div
                        key={day.num}
                        className={`border-s border-muted p-1 ${isOff ? "opacity-40 bg-muted/70" : ""}`}
                      >
                        {slotInfo ? (
                          <div
                            className={`h-full min-h-[48px] rounded-xl p-2 flex flex-col justify-center ${
                              isConflict ? "bg-status-error-surface border border-status-error-border" : "bg-status-success-surface border border-status-success-border"
                            }`}
                          >
                            <bdi
                              className={`block text-2xs font-bold leading-tight ${
                                isConflict ? "text-status-error-text" : "text-status-success-text"
                              }`}
                            >
                              {slotInfo.subject}
                            </bdi>
                            <bdi className="block text-3xs font-semibold text-ink-muted mt-0.5">{slotInfo.classLabel}</bdi>
                            {isConflict && (
                              <Badge variant="danger" size="sm" className="mt-0.5">{ui("Conflict")}</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="h-full min-h-[48px] rounded-xl border border-dashed border-edge/15 flex items-center justify-center">
                            <span className="text-3xs font-semibold text-ink-subtle">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="py-10">
                <EmptyState size="sm" icon={CalendarX} title={ui("No timetable periods yet")} description={ui("Create timetables for classes first.")} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
