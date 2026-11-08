"use client";

import { BookOpen, Check } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { SubjectColor, SubjectOption } from "./TimetableStudio";
import { useUiText } from "@/components/locale/LocaleProvider";

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
  const ui = useUiText();
  const placedTotal = subjects.reduce((sum, s) => sum + (placedBySubject.get(s.id) || 0), 0);
  const coverage = totalClassSlots > 0 ? Math.min(100, Math.round((placedTotal / totalClassSlots) * 100)) : 0;

  return (
    <div className="sk-panel flex h-full flex-col p-4">
      <p className="text-xs font-semibold text-primary">{ui("Subjects")}</p>
      <h3 className="text-sm font-bold text-ink-strong mt-1">{ui("Plan the week")}</h3>

      {/* Overall coverage */}
      <div className="mt-3 rounded-xl bg-brand-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-muted">{ui("Periods placed")}</span>
          <bdi dir="ltr" className="text-2xs font-bold text-primary">
            {placedTotal}/{totalClassSlots}
          </bdi>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border-subtle/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-brand-700 transition-all duration-500 motion-reduce:transition-none"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      <p className="mt-4 mb-1 text-xs font-semibold text-ink-subtle">
        {ui("Subjects ({0})", [subjects.length])}
      </p>
      {subjects.length > 0 && <p className="text-xs leading-relaxed text-ink-subtle">{ui("Drag a subject onto a grid cell to place it.")}</p>}

      <div className="mt-1 flex-1 space-y-2 overflow-y-auto custom-scrollbar pe-1">
        {subjects.length === 0 && (
          <EmptyState size="sm" icon={BookOpen} title={ui("No subjects for this class yet")} description={ui("Add subjects under Classes & subjects first.")} />
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
              className={`group cursor-grab rounded-xl border border-edge/15 bg-card p-2.5 transition-all hover:border-primary/30 hover:shadow-sm active:cursor-grabbing ${
                complete ? "ring-1 ring-status-success-border" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${c?.dot || "bg-ink-faint"}`} />
                  <bdi className="truncate text-2xs font-bold text-ink-strong">{s.name}</bdi>
                </div>
                {complete ? (
                  <span className="flex items-center gap-1 rounded-full bg-status-success-surface px-1.5 py-0.5 text-2xs font-semibold text-status-success-text">
                    <Check aria-hidden="true" className="h-2.5 w-2.5" />{ui("Done")}
                  </span>
                ) : (
                  <bdi dir="ltr" className="text-2xs font-bold text-ink-subtle">
                    {placed}/{targetDays}
                  </bdi>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${complete ? "bg-status-success-text" : c?.dot || "bg-primary"}`}
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
