"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  Loader2,
  RefreshCw,
  UserX,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import type { GridDay, SlotChange, StudioSlot, SubjectOption, TimetableData } from "./TimetableStudio";

function effectiveSlots(slots: StudioSlot[], pending: Map<string, SlotChange>): StudioSlot[] {
  return slots.map((s) => {
    const c = pending.get(s.id);
    if (!c) return s;
    return {
      ...s,
      subjectId: c.subjectId !== undefined ? c.subjectId : s.subjectId,
      teacherId: c.teacherId !== undefined ? c.teacherId : s.teacherId,
      roomId: c.roomId !== undefined ? c.roomId : s.roomId,
      roomNumber: c.roomNumber !== undefined ? c.roomNumber : s.roomNumber,
      slotType: c.slotType !== undefined ? c.slotType : s.slotType,
    };
  });
}

interface ServerSuggestion {
  id: string;
  conflictType: string;
  severity: "CRITICAL" | "WARNING";
  dayOfWeek: number;
  periodNumber: number;
  description: string;
  action: Record<string, unknown>;
}

interface SuggestionReport {
  validation: { counts: { critical: number; warning: number } };
  suggestions: ServerSuggestion[];
  unresolvable: { message: string }[];
}

/**
 * Server-backed conflict resolution (§66–69).
 *
 * The panel's own analysis below is drafting aid computed from what is on
 * screen. This section is different: it asks the server what is actually
 * wrong with the *saved* board and what it proposes to do about it, and each
 * proposal can be applied in one click. After applying, the server re-validates
 * and hands back the new state — which may contain a conflict the fix caused.
 */
function ResolutionSection({
  timetableId,
  campusId,
  onApplied,
}: {
  timetableId: string | null;
  campusId?: string;
  onApplied?: () => void;
}) {
  const [report, setReport] = useState<SuggestionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!timetableId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/timetable/${timetableId}/suggestions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load conflicts");
      setReport(data.data);
    } catch (e: any) {
      setError(e?.message || "Could not load conflicts");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [timetableId]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async (s: ServerSuggestion) => {
    if (!timetableId) return;
    setApplying(s.id);
    try {
      const res = await fetch(`/api/timetable/${timetableId}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: s.action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not apply the fix");

      const next: SuggestionReport = data.data.report;
      setReport(next);
      // Say what the re-validation found, including when the fix caused a new
      // problem — reporting plain success there would be a lie.
      if (next.validation.counts.critical === 0) {
        toast.success("Applied — no blocking conflicts remain");
      } else {
        const n = next.validation.counts.critical;
        toast.warning(
          `Applied, but ${n} blocking conflict${n === 1 ? " remains" : "s remain"} on the board`,
        );
      }
      onApplied?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not apply the fix");
      load();
    } finally {
      setApplying(null);
    }
  };

  if (!timetableId) return null;

  const critical = report?.validation?.counts?.critical ?? 0;
  const warning = report?.validation?.counts?.warning ?? 0;

  return (
    <div className="rounded-xl border border-[#cfc2d6]/15 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
          <Wand2 className="h-3 w-3" />
          Fix conflicts
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-[#fbf0fe] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf] hover:bg-[#fdf0fe] disabled:opacity-50"
        >
          <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
          Recheck
        </button>
      </div>

      {error ? (
        <p className="mt-1.5 text-[10px] font-bold text-rose-500">{error}</p>
      ) : loading && !report ? (
        <p className="mt-1.5 text-[10px] font-semibold text-[#4d4354]/40">Checking the saved board…</p>
      ) : critical === 0 && warning === 0 ? (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          The saved board has no conflicts.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[10px] font-bold text-[#4d4354]/60">
            {critical} blocking · {warning} advisory on the saved board
          </p>
          <ul className="mt-2 space-y-1.5">
            {(report?.suggestions ?? []).map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-[#cfc2d6]/20 bg-[#faf7fc] p-2"
              >
                <div className="flex items-start gap-1.5">
                  <AlertTriangle
                    className={`mt-0.5 h-3 w-3 shrink-0 ${
                      s.severity === "CRITICAL" ? "text-rose-500" : "text-amber-500"
                    }`}
                  />
                  <p className="text-[10px] font-semibold leading-relaxed text-[#4d4354]/80">
                    {s.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => apply(s)}
                  disabled={applying !== null}
                  className="mt-1.5 flex cursor-pointer items-center gap-1 rounded-lg bg-[#8127cf] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white hover:bg-[#6f1fb3] disabled:opacity-50"
                >
                  {applying === s.id ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-2.5 w-2.5" />
                  )}
                  Apply this fix
                </button>
              </li>
            ))}
          </ul>
          {(report?.unresolvable?.length ?? 0) > 0 && (
            <p className="mt-2 text-[9px] font-bold text-[#4d4354]/45">
              {report!.unresolvable.length} conflict
              {report!.unresolvable.length === 1 ? "" : "s"} need a manual decision — no free
              teacher, room or period was available to propose.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ConflictPanel({
  timetables,
  activeTimetable,
  subjects,
  placedBySubject,
  targetDays,
  visibleDays,
  pendingChanges,
  campusId,
  onApplied,
}: {
  timetables: TimetableData[];
  activeTimetable: TimetableData | null;
  subjects: SubjectOption[];
  placedBySubject: Map<string, number>;
  targetDays: number;
  visibleDays: GridDay[];
  pendingChanges: Map<string, SlotChange>;
  campusId?: string;
  onApplied?: () => void;
}) {
  const slots = activeTimetable ? effectiveSlots(activeTimetable.slots, pendingChanges) : [];

  // Subject coverage warnings
  const subjectWarnings = subjects
    .map((s) => {
      const placed = placedBySubject.get(s.id) || 0;
      return { subject: s, placed, remaining: Math.max(0, targetDays - placed) };
    })
    .filter((w) => w.placed < targetDays);

  // Teacher workload per day (within the active timetable)
  const workload = new Map<string, Map<number, number>>();
  const teacherNames = new Map<string, string>();
  for (const slot of slots) {
    if (slot.slotType !== "CLASS" || !slot.teacherId) continue;
    if (!workload.has(slot.teacherId)) workload.set(slot.teacherId, new Map());
    const dayMap = workload.get(slot.teacherId)!;
    dayMap.set(slot.dayOfWeek, (dayMap.get(slot.dayOfWeek) || 0) + 1);
    if (!teacherNames.has(slot.teacherId)) teacherNames.set(slot.teacherId, slot.teacher?.fullName || "Teacher");
  }
  const maxWorkload = Math.max(1, ...[...workload.values()].flatMap((m) => [...m.values()]));

  // Cross-timetable double-bookings: same teacher, same day+period, >1 class
  const clashes = new Map<string, { teacher: string; label: string; classes: string[] }>();
  // The map has to span every timetable: a teacher standing in two places at
  // once is by definition two different classes, so building it per-timetable
  // (as this did) put exactly one class label in each entry and the
  // `size > 1` test could never fire — the section always read "None detected"
  // no matter what was on the board.
  const byKey = new Map<string, { teacher: string; classes: Set<string> }>();
  for (const tt of timetables) {
    const clsLabel = `${tt.class.name}${tt.class.section ? ` ${tt.class.section}` : ""}`;
    for (const s of tt.slots) {
      if (s.slotType !== "CLASS" || !s.teacherId) continue;
      const key = `${s.teacherId}__${s.dayOfWeek}-${s.periodNumber}`;
      if (!byKey.has(key)) byKey.set(key, { teacher: s.teacher?.fullName || "Teacher", classes: new Set() });
      byKey.get(key)!.classes.add(clsLabel);
    }
  }
  for (const [, v] of byKey) {
    if (v.classes.size > 1) {
      const sorted = [...v.classes];
      const clsKey = `${v.teacher}|${sorted.join("|")}`;
      if (!clashes.has(clsKey)) {
        clashes.set(clsKey, { teacher: v.teacher, label: "", classes: sorted });
      }
    }
  }

  // Suggestions
  const suggestions: string[] = [];
  if (subjectWarnings.length > 0) {
    subjectWarnings.slice(0, 3).forEach((w) =>
      suggestions.push(`Place ${w.subject.name} in ${w.remaining} more slot${w.remaining > 1 ? "s" : ""} this week.`)
    );
  }
  if (clashes.size > 0) {
    const first = [...clashes.values()][0];
    suggestions.push(`${first.teacher} is double-booked — reassign one of: ${first.classes.join(" / ")}.`);
  }
  const emptyClassSlots = slots.filter((s) => s.slotType === "CLASS" && !s.subjectId).length;
  if (emptyClassSlots > 0) {
    suggestions.push(`${emptyClassSlots} class slot${emptyClassSlots > 1 ? "s" : ""} still empty — drop a subject from the palette to fill them.`);
  }
  if (suggestions.length === 0) {
    suggestions.push("Everything looks balanced. Publish when ready.");
  }

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm">
      <div>
        <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Conflict Panel</p>
        <h3 className="text-sm font-black text-[#1f1a23] mt-1">Live intelligence</h3>
      </div>

      {/* Double-bookings */}
      <div className="rounded-xl border border-[#cfc2d6]/15 bg-[#faf7fc] p-3">
        <div className="flex items-center gap-1.5">
          {clashes.size === 0 ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-[#f43f5e]" />
          )}
          <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">
            Teacher double-bookings
          </span>
        </div>
        {clashes.size === 0 ? (
          <p className="mt-1.5 text-[10px] font-semibold text-[#10b981]">None detected — assignments are conflict-free.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {[...clashes.values()].map((c, i) => (
              <li key={i} className="text-[10px] font-bold text-[#f43f5e]">
                {c.teacher}: {c.classes.join(" & ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Subject coverage */}
      <div>
        <p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Subject coverage</p>
        <div className="space-y-1.5">
          {subjects.length === 0 && (
            <p className="text-[10px] font-semibold text-[#4d4354]/40">No subjects to track.</p>
          )}
          {subjects.map((s) => {
            const placed = placedBySubject.get(s.id) || 0;
            const short = placed < targetDays;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold text-[#1f1a23]">{s.name}</span>
                <span className={`text-[9px] font-black ${short ? "text-amber-600" : "text-emerald-600"}`}>
                  {placed}/{targetDays}
                </span>
              </div>
            );
          })}
        </div>
        {subjectWarnings.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {subjectWarnings.length} subject{subjectWarnings.length > 1 ? "s" : ""} below the weekly target.
          </p>
        )}
      </div>

      {/* Teacher workload per day */}
      <div>
        <p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Teacher workload / day</p>
        {workload.size === 0 ? (
          <p className="text-[10px] font-semibold text-[#4d4354]/40">No teachers assigned yet.</p>
        ) : (
          <div className="space-y-2.5">
            {[...workload.entries()].map(([tid, dayMap]) => (
              <div key={tid}>
                <p className="mb-1 text-[10px] font-bold text-[#1f1a23]">{teacherNames.get(tid)}</p>
                <div className="flex items-end gap-1">
                  {visibleDays.map((day) => {
                    const count = dayMap.get(day.num) || 0;
                    const h = Math.round((count / maxWorkload) * 28);
                    return (
                      <div key={day.num} className="flex flex-1 flex-col items-center gap-0.5">
                        <div
                          className={`w-full rounded-t-md ${count > 2 ? "bg-amber-400" : "bg-[#8127cf]/70"}`}
                          style={{ height: `${Math.max(h, count > 0 ? 4 : 2)}px` }}
                          title={`${day.short}: ${count} period(s)`}
                        />
                        <span className="text-[7px] font-bold text-[#4d4354]/30">{day.short}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* §66-69: server-checked conflicts with one-click fixes */}
      <ResolutionSection
        timetableId={activeTimetable?.id ?? null}
        campusId={campusId}
        onApplied={onApplied}
      />

      {/* Drafting hints, computed from what is on screen right now */}
      <div className="mt-auto rounded-xl bg-gradient-to-br from-[#8127cf]/5 to-[#fbf0fe] p-3">
        <p className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
          <Lightbulb className="h-3 w-3" />Drafting hints
        </p>
        <ul className="space-y-1">
          {suggestions.map((sug, i) => (
            <li key={i} className="flex items-start gap-1 text-[10px] font-semibold text-[#4d4354]/70">
              <Info className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[#8127cf]/60" />
              {sug}
            </li>
          ))}
        </ul>
        {clashes.size === 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-[#4d4354]/35">
            <UserX className="h-2.5 w-2.5" />Prevention is on: dropdowns only offer free teachers & rooms.
          </p>
        )}
      </div>
    </div>
  );
}
