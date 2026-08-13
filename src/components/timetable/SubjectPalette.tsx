"use client";

import { Check } from "lucide-react";
import type { SubjectColor, SubjectOption } from "./TimetableStudio";

export function SubjectPalette({
  subjects,
  placedBySubject,
  targetDays,
  totalClassSlots,
  subjectColorMap,
}: {
  subjects: SubjectOption[];
  placedBySubject: Map<string, number>;
  targetDays: number;
  totalClassSlots: number;
  subjectColorMap: Map<string, SubjectColor>;
}) {
  const placedTotal = subjects.reduce((sum, s) => sum + (placedBySubject.get(s.id) || 0), 0);
  const coverage = totalClassSlots > 0 ? Math.min(100, Math.round((placedTotal / totalClassSlots) * 100)) : 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Subject Palette</p>
      <h3 className="text-sm font-black text-[#1f1a23] mt-1">Plan the week</h3>

      {/* Overall coverage */}
      <div className="mt-3 rounded-xl bg-[#fbf0fe] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">Periods placed</span>
          <span className="text-[10px] font-black text-[#8127cf]">
            {placedTotal}/{totalClassSlots}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e8e0ec]/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] transition-all duration-500"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      <p className="mt-4 mb-1 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
        Subjects ({subjects.length})
      </p>

      <div className="mt-1 flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
        {subjects.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#cfc2d6]/20 p-4 text-center text-[10px] font-semibold text-[#4d4354]/40">
            No subjects for this class yet. Add subjects first.
          </p>
        )}
        {subjects.map((s) => {
          const placed = placedBySubject.get(s.id) || 0;
          const complete = placed >= targetDays && targetDays > 0;
          const pct = totalClassSlots > 0 ? Math.min(100, Math.round((placed / totalClassSlots) * 100)) : 0;
          const c = subjectColorMap.get(s.id);
          return (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/subject-id", s.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`group cursor-grab rounded-xl border border-[#cfc2d6]/15 bg-white p-2.5 transition-all hover:border-[#8127cf]/30 hover:shadow-sm active:cursor-grabbing ${
                complete ? "ring-1 ring-emerald-200" : ""
              }`}
              title="Drag onto a grid cell to place this subject"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c?.dot || "bg-gray-400"}`} />
                  <span className="truncate text-[11px] font-black text-[#1f1a23]">{s.name}</span>
                </div>
                {complete ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-600">
                    <Check className="h-2.5 w-2.5" />Done
                  </span>
                ) : (
                  <span className="text-[9px] font-black text-[#4d4354]/40">
                    {placed}/{targetDays}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e8e0ec]/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${complete ? "bg-emerald-500" : c?.dot || "bg-[#8127cf]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
