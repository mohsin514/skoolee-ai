"use client";

import { DoorOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import type {
  GridDay,
  GridPeriod,
  RoomOption,
  TimetableData,
} from "./TimetableStudio";

const ROOM_COLORS = [
  { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-700", dot: "bg-sky-500" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-700", dot: "bg-indigo-500" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-700", dot: "bg-teal-500" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-700", dot: "bg-pink-500" },
];

function classColorMap(timetables: TimetableData[]) {
  const m = new Map<string, (typeof ROOM_COLORS)[number]>();
  timetables.forEach((tt, i) => m.set(tt.classId, ROOM_COLORS[i % ROOM_COLORS.length]));
  return m;
}

export function RoomView({
  timetables,
  rooms,
  visibleDays,
  periods,
  weekendDays,
}: {
  timetables: TimetableData[];
  rooms: RoomOption[];
  visibleDays: GridDay[];
  periods: GridPeriod[];
  weekendDays: number[];
}) {
  const ui = useUiText();
  const colorMap = classColorMap(timetables);

  // roomId -> list of occupancies resolved from all timetables
  const occupancy = new Map<
    string,
    { day: number; period: number; clsLabel: string; color: (typeof ROOM_COLORS)[number] }[]
  >();
  for (const tt of timetables) {
    const clsLabel = `${tt.class.name}${tt.class.section ? ` - ${tt.class.section}` : ""}`;
    const color = colorMap.get(tt.classId)!;
    for (const s of tt.slots) {
      if (s.slotType !== "CLASS" || !s.roomId) continue;
      const list = occupancy.get(s.roomId) || [];
      list.push({ day: s.dayOfWeek, period: s.periodNumber, clsLabel, color });
      occupancy.set(s.roomId, list);
    }
  }

  const gridCols = `160px repeat(${visibleDays.length}, minmax(120px, 1fr))`;

  return (
    <div className="sk-panel sk-rise overflow-x-auto" style={{ animationDelay: "160ms" }}>
      <div className="min-w-[760px]">
        {/* Header */}
        <div className="grid border-b border-muted" style={{ gridTemplateColumns: gridCols }}>
          <div className="flex items-center gap-1.5 p-3">
            <DoorOpen aria-hidden="true" className="w-4 h-4 text-ink-subtle" />
            <span className="text-xs font-semibold text-ink-subtle">{ui("Room")}</span>
          </div>
          {visibleDays.map((day) => {
            const isOff = weekendDays.includes(day.num);
            return (
              <div
                key={day.num}
                className={`flex flex-col items-center justify-center py-3 border-s border-muted ${
                  isOff ? "opacity-50 bg-muted/70" : ""
                }`}
              >
                <span className="text-xs font-semibold text-ink-subtle">{ui(day.full)}</span>
              </div>
            );
          })}
        </div>

        {rooms.length === 0 ? (
          <div className="py-10">
            <EmptyState size="sm" icon={DoorOpen} title={ui("No rooms configured")} description={ui("Your campus admin adds rooms under Campus setup; room occupancy appears here.")} />
          </div>
        ) : (
          rooms.map((room) => {
            const used = occupancy.get(room.id) || [];
            return (
              <div
                key={room.id}
                className="grid border-b border-muted last:border-b-0 hover:bg-brand-50/20 transition-colors"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="flex flex-col justify-center p-3 border-e border-muted">
                  <bdi className="text-2xs font-bold text-ink-strong">{room.roomNumber}</bdi>
                  <span className="text-3xs font-bold text-ink-subtle mt-0.5">
                    {ui("Capacity {0}", [room.capacity || "—"])}
                  </span>
                </div>
                {visibleDays.map((day) => {
                  const isOff = weekendDays.includes(day.num);
                  const daySlots = used
                    .filter((u) => u.day === day.num)
                    .sort((a, b) => a.period - b.period);
                  const occupied = daySlots.length > 0;
                  return (
                    <div
                      key={day.num}
                      className={`border-s border-muted p-1.5 ${isOff ? "opacity-40 bg-muted/70" : ""}`}
                    >
                      {occupied ? (
                        <div className="space-y-1">
                          {daySlots.map((u, i) => (
                            <div
                              key={i}
                              className={`rounded-lg ${u.color.bg}  ${u.color.border} border px-2 py-1`}
                            >
                              <p className={`text-2xs font-bold leading-tight ${u.color.text}`}>
                                {ui("P{0}", [u.period])} · <bdi>{u.clsLabel}</bdi>
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[40px] items-center justify-center rounded-lg border border-dashed border-edge/15">
                          <span className="text-3xs font-semibold text-ink-subtle">{ui("Free")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
