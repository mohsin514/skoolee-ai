"use client";

import { BookOpen, DoorOpen, User } from "lucide-react";
import type {
  GridDay,
  GridPeriod,
  RoomOption,
  SlotChange,
  StudioSlot,
  SubjectColor,
  SubjectOption,
  TeacherOption,
} from "./TimetableStudio";

const SLOT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  BREAK: { bg: "bg-[#f3f4f9]", text: "text-ink-muted", label: "Break" },
  PRAYER: { bg: "bg-amber-50/80", text: "text-amber-600/60", label: "Prayer / Namaz" },
  ASSEMBLY: { bg: "bg-blue-50/80", text: "text-blue-600/60", label: "Assembly" },
  ACTIVITY: { bg: "bg-emerald-50/80", text: "text-emerald-600/60", label: "Activity" },
};

function resolveName<T extends { id: string; name?: string; fullName?: string; roomNumber?: string }>(
  list: T[] | undefined,
  id: string | null
): string | null {
  if (!id) return null;
  const item = list?.find((l) => l.id === id);
  if (!item) return null;
  return (item.fullName || item.roomNumber || item.name) ?? null;
}

export function TimetableGrid({
  slots,
  periods,
  visibleDays,
  subjects,
  teachers,
  rooms,
  pendingChanges,
  subjectColorMap,
  weekendDays,
  onCellClick,
  onDropSubject,
}: {
  slots: StudioSlot[];
  periods: GridPeriod[];
  visibleDays: GridDay[];
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  pendingChanges: Map<string, SlotChange>;
  subjectColorMap: Map<string, SubjectColor>;
  weekendDays: number[];
  onCellClick: (slot: StudioSlot) => void;
  onDropSubject?: (slot: StudioSlot, subjectId: string) => void;
}) {
  const getSlot = (day: number, period: number): StudioSlot | undefined =>
    slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);

  const gridCols = `80px repeat(${visibleDays.length}, 1fr)`;

  return (
    <div className="min-w-[760px]">
      {/* Header row */}
      <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: gridCols }}>
        <div className="flex items-center justify-center p-3">
          <span className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">Period</span>
        </div>
        {visibleDays.map((day) => {
          const isOff = weekendDays.includes(day.num);
          return (
            <div
              key={day.num}
              className={`flex flex-col items-center justify-center py-3 border-l border-[#f3f4f9] ${
                isOff ? "opacity-50 bg-[#f3f4f9]/70" : ""
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">{day.short}</span>
              <span className="text-[8px] font-bold text-ink-subtle mt-0.5">{day.full}</span>
              {isOff && (
                <span className="mt-0.5 rounded bg-rose-50 px-1 py-px text-[7px] font-black uppercase text-rose-500">Off</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Period rows */}
      {periods.map((period) => {
        const isSpecial = period.type !== "CLASS";
        const specialStyle = SLOT_TYPE_STYLES[period.type];

        return (
          <div
            key={period.num}
            className={`grid border-b border-[#f3f4f9] last:border-b-0 transition-colors ${
              isSpecial ? specialStyle?.bg || "bg-[#f3f4f9]" : "hover:bg-[#fbf0fe]/20"
            }`}
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Time column */}
            <div className="flex flex-col items-center justify-center p-2 border-r border-[#f3f4f9]">
              <span className="text-[10px] font-black text-[#8127cf]">P{period.num}</span>
              <span className="text-[8px] font-bold text-ink-subtle mt-0.5">{period.start}</span>
              <span className="text-[7px] font-semibold text-ink-subtle">{period.end}</span>
            </div>

            {/* Day cells */}
            {visibleDays.map((day) => {
              const isOff = weekendDays.includes(day.num);
              const offCls = isOff ? "opacity-40 bg-[#f3f4f9]/70" : "";
              const slot = getSlot(day.num, period.num);
              if (!slot) return <div key={day.num} className={`border-l border-[#f3f4f9] p-1 ${offCls}`} />;

              const change = pendingChanges.get(slot.id);
              const effectiveType = change?.slotType !== undefined ? change.slotType : slot.slotType;

              if (effectiveType !== "CLASS") {
                const style = SLOT_TYPE_STYLES[effectiveType];
                return (
                  <div
                    key={day.num}
                    className={`border-l border-[#f3f4f9] flex items-center justify-center p-1 cursor-pointer ${offCls}`}
                    onClick={() => onCellClick(slot)}
                  >
                    <span className={`text-[9px] font-bold ${style?.text || "text-ink-subtle"}`}>
                      {style?.label || effectiveType}
                    </span>
                  </div>
                );
              }

              const effectiveSubjectId =
                change?.subjectId !== undefined ? change.subjectId : slot.subjectId;
              const effectiveTeacherId =
                change?.teacherId !== undefined ? change.teacherId : slot.teacherId;
              const effectiveRoomId = change?.roomId !== undefined ? change.roomId : slot.roomId;

              const subjectName =
                effectiveSubjectId != null
                  ? (subjects.find((s) => s.id === effectiveSubjectId)?.name ?? slot.subject?.name ?? null)
                  : null;
              const teacherName =
                effectiveTeacherId != null
                  ? (resolveName(teachers, effectiveTeacherId) ?? slot.teacher?.fullName ?? null)
                  : null;
              const roomName =
                effectiveRoomId != null
                  ? (resolveName(rooms, effectiveRoomId) ?? slot.room?.roomNumber ?? null)
                  : null;
              const color = effectiveSubjectId ? subjectColorMap.get(effectiveSubjectId) : null;
              const hasChange = pendingChanges.has(slot.id);

              return (
                <div
                  key={day.num}
                  className={`border-l border-[#f3f4f9] p-1 cursor-pointer group transition-all ${offCls}`}
                  onClick={() => onCellClick(slot)}
                  onDragOver={(e) => {
                    if (onDropSubject) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!onDropSubject) return;
                    e.preventDefault();
                    const subjectId = e.dataTransfer.getData("text/subject-id");
                    if (subjectId) onDropSubject(slot, subjectId);
                  }}
                >
                  {subjectName ? (
                    <div
                      className={`h-full min-h-[48px] rounded-xl ${color?.bg || "bg-gray-50"} ${
                        color?.border || "border-gray-200"
                      } border p-2 flex flex-col justify-between transition-all group-hover:shadow-md group-hover:scale-[1.02] ${
                        hasChange ? "ring-2 ring-amber-300" : ""
                      }`}
                    >
                      <p className={`text-[10px] font-black leading-tight ${color?.text || "text-gray-600"}`}>
                        {subjectName}
                      </p>
                      <div>
                        {teacherName && (
                          <p className="text-[8px] font-semibold text-ink-subtle mt-1 flex items-center gap-0.5">
                            <User className="w-2.5 h-2.5" />
                            {teacherName}
                          </p>
                        )}
                        {roomName && (
                          <p className="text-[8px] font-semibold text-ink-subtle mt-0.5 flex items-center gap-0.5">
                            <DoorOpen className="w-2.5 h-2.5" />
                            {roomName}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[48px] rounded-xl border border-dashed border-[#cfc2d6]/20 flex items-center justify-center transition-all group-hover:border-[#8127cf]/30 group-hover:bg-[#fbf0fe]/30">
                      <BookOpen className="w-3.5 h-3.5 text-ink-subtle group-hover:text-[#8127cf]/40 transition-colors" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
