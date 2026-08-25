"use client";

import { BookOpen, DoorOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";
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

export type GridDensity = "compact" | "comfortable" | "roomy";

/**
 * How much room a cell gets, and how much it is allowed to say.
 *
 * The grid used to render every cell at 48px with 8px labels, so a teacher's
 * name and a room number were both present and both unreadable. Density makes
 * that a choice: at `compact` the cell shows the subject only and keeps the
 * rest in its tooltip, and at `roomy` everything gets its own line.
 */
const DENSITY = {
  compact: {
    cell: "min-h-[42px]",
    dayMin: 104,
    timeCol: 76,
    subject: "text-[10px]",
    meta: "text-[8px]",
    pad: "p-1.5",
    gap: "gap-0.5",
    showMeta: false,
    stackMeta: false,
  },
  comfortable: {
    cell: "min-h-[64px]",
    dayMin: 132,
    timeCol: 88,
    subject: "text-[11px]",
    meta: "text-[9px]",
    pad: "p-2",
    gap: "gap-1",
    showMeta: true,
    stackMeta: false,
  },
  roomy: {
    cell: "min-h-[92px]",
    dayMin: 168,
    timeCol: 96,
    subject: "text-[13px]",
    meta: "text-[10px]",
    pad: "p-2.5",
    gap: "gap-1.5",
    showMeta: true,
    stackMeta: true,
  },
} as const;

const SLOT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string; short: string }> = {
  BREAK: { bg: "bg-[#f3f4f9]", text: "text-ink-muted", label: "Break", short: "Break" },
  PRAYER: { bg: "bg-amber-50/80", text: "text-amber-600/70", label: "Prayer / Namaz", short: "Prayer" },
  ASSEMBLY: { bg: "bg-blue-50/80", text: "text-blue-600/70", label: "Assembly", short: "Assembly" },
  ACTIVITY: { bg: "bg-emerald-50/80", text: "text-emerald-600/70", label: "Activity", short: "Activity" },
};

function resolveName<T extends { id: string; name?: string; fullName?: string; roomNumber?: string }>(
  list: T[] | undefined,
  id: string | null,
): string | null {
  if (!id) return null;
  const item = list?.find((l) => l.id === id);
  if (!item) return null;
  return (item.fullName || item.roomNumber || item.name) ?? null;
}

/** "Abdul Rehman Khan" → "A. Rehman Khan": keeps the identifying part, drops width. */
function shortenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0].charAt(0)}. ${parts.slice(1).join(" ")}`;
}

/** Minutes between two "HH:mm" strings, for the period column's duration. */
function durationLabel(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? `${mins}m` : null;
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
  density = "comfortable",
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
  density?: GridDensity;
  onCellClick: (slot: StudioSlot) => void;
  onDropSubject?: (slot: StudioSlot, subjectId: string) => void;
}) {
  const d = DENSITY[density];
  const getSlot = (day: number, period: number): StudioSlot | undefined =>
    slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);

  const gridCols = `${d.timeCol}px repeat(${visibleDays.length}, minmax(0, 1fr))`;
  // Grow with the number of days rather than assuming six of them: a five-day
  // week no longer forces a horizontal scrollbar it does not need.
  const minWidth = d.timeCol + visibleDays.length * d.dayMin;

  return (
    <div style={{ minWidth }}>
      {/* Header row — sticky so the day you are looking at stays named while
          you scroll a long list of periods. */}
      <div
        className="sticky top-0 z-10 grid border-b border-[#cfc2d6]/20 bg-white/95 backdrop-blur"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="flex items-center justify-center p-3">
          <span className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">Period</span>
        </div>
        {visibleDays.map((day) => {
          const isOff = weekendDays.includes(day.num);
          return (
            <div
              key={day.num}
              className={cn(
                "flex flex-col items-center justify-center border-l border-[#f3f4f9] py-2.5",
                isOff && "bg-[#f3f4f9]/70 opacity-60",
              )}
            >
              <span className="text-[11px] font-black uppercase tracking-wider text-[#1f1a23]">
                {day.short}
              </span>
              <span className="mt-0.5 text-[9px] font-semibold text-ink-subtle">{day.full}</span>
              {isOff ? (
                <span className="mt-1 rounded bg-rose-50 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-rose-500">
                  Off
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {periods.map((period) => {
        const isSpecial = period.type !== "CLASS";
        const specialStyle = SLOT_TYPE_STYLES[period.type];
        const duration = durationLabel(period.start, period.end);

        return (
          <div
            key={period.num}
            className={cn(
              "grid border-b border-[#f3f4f9] transition-colors last:border-b-0",
              isSpecial ? specialStyle?.bg || "bg-[#f3f4f9]" : "hover:bg-[#fbf0fe]/20",
            )}
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Time column: the period, the window it covers, and how long it
                runs — the three things anyone reads a timetable row for. */}
            <div className="flex flex-col items-center justify-center border-r border-[#f3f4f9] px-1.5 py-2">
              <span className="text-[11px] font-black text-[#8127cf]">P{period.num}</span>
              <span className="mt-0.5 text-[9px] font-bold leading-tight text-ink-muted">
                {period.start}
              </span>
              <span className="text-[9px] font-semibold leading-tight text-ink-subtle">
                {period.end}
              </span>
              {duration && density !== "compact" ? (
                <span className="mt-1 rounded-full bg-[#f3f4f9] px-1.5 text-[8px] font-black uppercase tracking-wider text-ink-subtle">
                  {duration}
                </span>
              ) : null}
            </div>

            {visibleDays.map((day) => {
              const isOff = weekendDays.includes(day.num);
              const offCls = isOff ? "opacity-40 bg-[#f3f4f9]/70" : "";
              const slot = getSlot(day.num, period.num);
              if (!slot) {
                return <div key={day.num} className={cn("border-l border-[#f3f4f9] p-1", offCls)} />;
              }

              const change = pendingChanges.get(slot.id);
              const effectiveType = change?.slotType !== undefined ? change.slotType : slot.slotType;

              if (effectiveType !== "CLASS") {
                const style = SLOT_TYPE_STYLES[effectiveType];
                return (
                  <div
                    key={day.num}
                    className={cn(
                      "flex cursor-pointer items-center justify-center border-l border-[#f3f4f9] p-1",
                      offCls,
                    )}
                    onClick={() => onCellClick(slot)}
                    title={style?.label || effectiveType}
                  >
                    <span className={cn("text-[9px] font-bold", style?.text || "text-ink-subtle")}>
                      {density === "compact" ? style?.short : style?.label || effectiveType}
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

              // Everything the cell knows, so a compact cell is abbreviated
              // rather than lossy.
              const fullTitle = [
                subjectName,
                teacherName ? `Teacher: ${teacherName}` : null,
                roomName ? `Room: ${roomName}` : null,
                `${day.full} · P${period.num} ${period.start}–${period.end}`,
                hasChange ? "Unsaved change" : null,
              ]
                .filter(Boolean)
                .join("\n");

              return (
                <div
                  key={day.num}
                  className={cn("group cursor-pointer border-l border-[#f3f4f9] p-1 transition-all", offCls)}
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
                      title={fullTitle}
                      className={cn(
                        "relative flex h-full flex-col justify-between overflow-hidden rounded-xl border transition-all group-hover:shadow-md",
                        d.cell,
                        d.pad,
                        d.gap,
                        color?.bg || "bg-gray-50",
                        color?.border || "border-gray-200",
                        hasChange && "ring-2 ring-amber-300",
                      )}
                    >
                      {/* A colour rail reads faster than a tinted background
                          when six subjects share four pastel families. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 left-0 w-[3px]",
                          color?.dot?.replace("bg-", "bg-") || "bg-gray-300",
                        )}
                      />
                      <p
                        className={cn(
                          "truncate pl-1.5 font-black leading-tight",
                          d.subject,
                          color?.text || "text-gray-600",
                        )}
                      >
                        {subjectName}
                      </p>
                      {d.showMeta && (teacherName || roomName) ? (
                        <div
                          className={cn(
                            "flex min-w-0 pl-1.5",
                            d.stackMeta ? "flex-col gap-0.5" : "items-center gap-2",
                          )}
                        >
                          {teacherName ? (
                            <span
                              className={cn(
                                "flex min-w-0 items-center gap-0.5 font-semibold text-ink-muted",
                                d.meta,
                              )}
                            >
                              <User className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">
                                {d.stackMeta ? teacherName : shortenName(teacherName)}
                              </span>
                            </span>
                          ) : null}
                          {roomName ? (
                            <span
                              className={cn(
                                "flex shrink-0 items-center gap-0.5 font-semibold text-ink-subtle",
                                d.meta,
                              )}
                            >
                              <DoorOpen className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{roomName}</span>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {/* An unplaced teacher is the thing that breaks a
                          timetable, so say so instead of leaving a blank. */}
                      {d.showMeta && !teacherName ? (
                        <span className={cn("pl-1.5 font-bold text-amber-600", d.meta)}>
                          No teacher
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      title={`Free · ${day.full} P${period.num} ${period.start}–${period.end}`}
                      className={cn(
                        "flex h-full items-center justify-center rounded-xl border border-dashed border-[#cfc2d6]/20 transition-all group-hover:border-[#8127cf]/30 group-hover:bg-[#fbf0fe]/30",
                        d.cell,
                      )}
                    >
                      <BookOpen className="h-3.5 w-3.5 text-ink-subtle transition-colors group-hover:text-[#8127cf]/40" />
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
