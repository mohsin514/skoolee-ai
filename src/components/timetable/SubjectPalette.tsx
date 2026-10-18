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
    <div className="sk-panel flex h-full flex-col p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-primary">Subject Palette</p>
      <h3 className="text-sm font-bold text-ink-strong mt-1">Plan the week</h3>

      {/* Overall coverage */}
      <div className="mt-3 rounded-xl bg-brand-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Periods placed</span>
          <span className="text-2xs font-bold text-primary">
            {placedTotal}/{totalClassSlots}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border-subtle/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-brand-700 transition-all duration-500"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      <p className="mt-4 mb-1 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
        Subjects ({subjects.length})
      </p>
      {subjects.length > 0 && <p className="text-xs leading-relaxed text-ink-subtle">Drag a subject onto a grid cell to place it.</p>}

      <div className="mt-1 flex-1 space-y-2 overflow-y-auto custom-scrollbar pe-1">
        {subjects.length === 0 && (
          <p className="rounded-xl border border-dashed border-edge/20 p-4 text-center text-2xs font-semibold text-ink-subtle">
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
              className={`group cursor-grab rounded-xl border border-edge/15 bg-white p-2.5 transition-all hover:border-primary/30 hover:shadow-sm active:cursor-grabbing ${
                complete ? "ring-1 ring-emerald-200" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c?.dot || "bg-gray-400"}`} />
                  <span className="truncate text-2xs font-bold text-ink-strong">{s.name}</span>
                </div>
                {complete ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-3xs font-semibold uppercase text-emerald-600">
                    <Check className="h-2.5 w-2.5" />Done
                  </span>
                ) : (
                  <span className="text-2xs font-bold text-ink-subtle">
                    {placed}/{targetDays}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${complete ? "bg-emerald-500" : c?.dot || "bg-primary"}`}
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
