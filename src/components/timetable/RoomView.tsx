"use client";

import { DoorOpen } from "lucide-react";
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
    <div className="sk-rise overflow-x-auto rounded-[28px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
      <div className="min-w-[760px]">
        {/* Header */}
        <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: gridCols }}>
          <div className="flex items-center gap-1.5 p-3">
            <DoorOpen className="w-4 h-4 text-ink-subtle" />
            <span className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">Room</span>
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
              </div>
            );
          })}
        </div>

        {rooms.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm font-semibold text-ink-subtle">
            No rooms configured. Add rooms in Academic settings.
          </div>
        ) : (
          rooms.map((room) => {
            const used = occupancy.get(room.id) || [];
            return (
              <div
                key={room.id}
                className="grid border-b border-[#f3f4f9] last:border-b-0 hover:bg-[#fbf0fe]/20 transition-colors"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="flex flex-col justify-center p-3 border-r border-[#f3f4f9]">
                  <span className="text-[11px] font-black text-[#1f1a23]">{room.roomNumber}</span>
                  <span className="text-[8px] font-bold text-ink-subtle mt-0.5">
                    cap {room.capacity || "—"}
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
                      className={`border-l border-[#f3f4f9] p-1.5 ${isOff ? "opacity-40 bg-[#f3f4f9]/70" : ""}`}
                    >
                      {occupied ? (
                        <div className="space-y-1">
                          {daySlots.map((u, i) => (
                            <div
                              key={i}
                              className={`rounded-lg ${u.color.bg} ${u.color.border} border px-2 py-1`}
                            >
                              <p className={`text-[9px] font-black leading-tight ${u.color.text}`}>
                                P{u.period} · {u.clsLabel}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[40px] items-center justify-center rounded-lg border border-dashed border-[#cfc2d6]/15">
                          <span className="text-[8px] font-semibold text-ink-subtle">free</span>
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
