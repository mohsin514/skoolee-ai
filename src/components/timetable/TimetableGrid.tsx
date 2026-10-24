"use client";

import { BookOpen, DoorOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiText } from "@/components/locale/LocaleProvider";
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
    subject: "text-2xs",
    meta: "text-3xs",
    pad: "p-1.5",
    gap: "gap-0.5",
    showMeta: false,
    stackMeta: false,
  },
  comfortable: {
    cell: "min-h-[64px]",
    dayMin: 132,
    timeCol: 88,
    subject: "text-2xs",
    meta: "text-2xs",
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
    meta: "text-2xs",
    pad: "p-2.5",
    gap: "gap-1.5",
    showMeta: true,
    stackMeta: true,
  },
} as const;

const SLOT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string; short: string }> = {
  BREAK: { bg: "bg-muted", text: "text-ink-muted", label: "Break", short: "Break" },
  PRAYER: { bg: "bg-status-warning-surface", text: "text-status-warning-text", label: "Prayer / Namaz", short: "Prayer" },
  ASSEMBLY: { bg: "bg-status-info-surface", text: "text-status-info-text", label: "Assembly", short: "Assembly" },
  ACTIVITY: { bg: "bg-status-success-surface", text: "text-status-success-text", label: "Activity", short: "Activity" },
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
  const ui = useUiText();
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
        className="sticky top-0 z-10 grid border-b border-edge/20 bg-card/95 backdrop-blur"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="flex items-center justify-center p-3">
          <span className="text-xs font-semibold text-ink-subtle">{ui("Period")}</span>
        </div>
        {visibleDays.map((day) => {
          const isOff = weekendDays.includes(day.num);
          return (
            <div
              key={day.num}
              className={cn(
                "flex flex-col items-center justify-center border-s border-muted py-2.5",
                isOff && "bg-muted/70 opacity-60",
              )}
            >
              <span className="text-xs font-semibold text-ink-strong">
                {ui(day.full)}
              </span>
              {isOff ? (
                <span className="mt-1 rounded bg-status-error-surface px-1.5 py-px text-2xs font-semibold text-status-error-text">
                  {ui("Off")}
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
              "grid border-b border-muted transition-colors last:border-b-0",
              isSpecial ? specialStyle?.bg || "bg-muted" : "hover:bg-brand-50/20",
            )}
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Time column: the period, the window it covers, and how long it
                runs — the three things anyone reads a timetable row for. */}
            <div className="flex flex-col items-center justify-center border-e border-muted px-1.5 py-2">
              <span className="text-2xs font-bold text-primary" title={ui("Period {0}", [period.num])}>{ui("P{0}", [period.num])}</span>
              <bdi dir="ltr" className="mt-0.5 text-2xs font-bold leading-tight text-ink-muted">
                {period.start}
              </bdi>
              <bdi dir="ltr" className="text-2xs font-semibold leading-tight text-ink-subtle">
                {period.end}
              </bdi>
              {duration && density !== "compact" ? (
                <bdi dir="ltr" className="mt-1 rounded-full bg-muted px-1.5 text-3xs font-semibold text-ink-subtle">
                  {duration}
                </bdi>
              ) : null}
            </div>

            {visibleDays.map((day) => {
              const isOff = weekendDays.includes(day.num);
              const offCls = isOff ? "opacity-40 bg-muted/70" : "";
              const slot = getSlot(day.num, period.num);
              if (!slot) {
                return <div key={day.num} className={cn("border-s border-muted p-1", offCls)} />;
              }

              const change = pendingChanges.get(slot.id);
              const effectiveType = change?.slotType !== undefined ? change.slotType : slot.slotType;

              if (effectiveType !== "CLASS") {
                const style = SLOT_TYPE_STYLES[effectiveType];
                return (
                  <div
                    key={day.num}
                    className={cn(
                      "flex cursor-pointer items-center justify-center border-s border-muted p-1",
                      offCls,
                    )}
                    onClick={() => onCellClick(slot)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCellClick(slot); } }}
                    role="button"
                    tabIndex={0}
                    aria-label={ui("{0} · {1}, period {2}", [ui(style?.label || effectiveType), ui(day.full), period.num])}
                    title={ui(style?.label || effectiveType)}
                  >
                    <span className={cn("text-2xs font-bold", style?.text || "text-ink-subtle")}>
                      {ui(density === "compact" ? style?.short ?? effectiveType : style?.label || effectiveType)}
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
                teacherName ? ui("Teacher: {0}", [teacherName]) : null,
                roomName ? ui("Room: {0}", [roomName]) : null,
                ui("{0} · Period {1} {2}–{3}", [ui(day.full), period.num, period.start, period.end]),
                hasChange ? ui("Unsaved change") : null,
              ]
                .filter(Boolean)
                .join("\n");

              return (
                <div
                  key={day.num}
                  className={cn("group cursor-pointer border-s border-muted p-1 transition-all", offCls)}
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
                        color?.bg || "bg-surface-subtle",
                        color?.border || "border-border",
                        hasChange && "ring-2 ring-status-warning-border",
                      )}
                    >
                      {/* A colour rail reads faster than a tinted background
                          when six subjects share four pastel families. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 start-0 w-[3px]",
                          color?.dot || "bg-ink-faint",
                        )}
                      />
                      <p
                        className={cn(
                          "truncate ps-1.5 font-bold leading-tight",
                          d.subject,
                          color?.text || "text-ink-muted",
                        )}
                      >
                        {subjectName}
                      </p>
                      {d.showMeta && (teacherName || roomName) ? (
                        <div
                          className={cn(
                            "flex min-w-0 ps-1.5",
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
                        <span className={cn("ps-1.5 font-semibold text-status-warning-text", d.meta)}>
                          {ui("No teacher")}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      aria-label={ui("Free · {0}, period {1}, {2}–{3}", [ui(day.full), period.num, period.start, period.end])}
                      className={cn(
                        "flex h-full items-center justify-center rounded-xl border border-dashed border-edge/20 transition-all group-hover:border-primary/30 group-hover:bg-brand-50/30",
                        d.cell,
                      )}
                    >
                      <BookOpen className="h-3.5 w-3.5 text-ink-subtle transition-colors group-hover:text-primary/40" />
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
