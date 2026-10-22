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
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import type { GridDay, SlotChange, StudioSlot, SubjectOption, TimetableData } from "./TimetableStudio";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useUiText } from "@/components/locale/LocaleProvider";


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
  const ui = useUiText();
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
      if (!res.ok) throw new Error(data.error || "");
      setReport(data.data);
    } catch (e: any) {
      setError(friendlyErrorMessage(e, ui("Could not load conflicts")));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [timetableId, ui]);

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
      if (!res.ok) throw new Error(data.error || "");

      const next: SuggestionReport = data.data.report;
      setReport(next);
      // Say what the re-validation found, including when the fix caused a new
      // problem — reporting plain success there would be a lie.
      if (next.validation.counts.critical === 0) {
        toast.success(ui("Applied — no blocking conflicts remain"));
      } else {
        const n = next.validation.counts.critical;
        toast.warning(ui(n === 1 ? "Applied, but 1 blocking conflict remains on the board" : "Applied, but {0} blocking conflicts remain on the board", [n]));
      }
      onApplied?.();
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e, ui("Could not apply the fix")));
      load();
    } finally {
      setApplying(null);
    }
  };

  if (!timetableId) return null;

  const critical = report?.validation?.counts?.critical ?? 0;
  const warning = report?.validation?.counts?.warning ?? 0;

  return (
    <div className="rounded-xl border border-edge/15 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-semibold text-primary">
          <Wand2 aria-hidden="true" className="h-3 w-3" />
          {ui("Fix conflicts")}
        </p>
        <Button variant="secondary" size="sm"
          type="button"
          onClick={load}
          loading={loading}
          className="flex justify-start items-center gap-1"
        >
          {loading ? null : <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />}
          {ui("Recheck")}
        </Button>
      </div>

      {error ? (
        <Alert tone="danger" compact live="off" className="mt-1.5" actions={<Button size="sm" variant="outline" type="button" onClick={load}>{ui("Retry")}</Button>}>{error}</Alert>
      ) : loading && !report ? (
        <p role="status" className="mt-1.5 text-2xs font-semibold text-ink-subtle">{ui("Checking the saved board…")}</p>
      ) : critical === 0 && warning === 0 ? (
        <p className="mt-1.5 flex items-center gap-1 text-2xs font-medium text-status-success-text">
          <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
          {ui("The saved board has no conflicts.")}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-2xs font-medium text-ink-muted tabular-nums">
            {ui("{0} blocking · {1} advisory on the saved board", [critical, warning])}
          </p>
          <ul className="mt-2 space-y-1.5">
            {(report?.suggestions ?? []).map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-edge/20 bg-surface-subtle p-2"
              >
                <div className="flex items-start gap-1.5">
                  <AlertTriangle
                    aria-hidden="true"
                    className={`mt-0.5 h-3 w-3 shrink-0 ${
                      s.severity === "CRITICAL" ? "text-status-error-text" : "text-status-warning-text"
                    }`}
                  />
                  <p className="text-2xs font-semibold leading-relaxed text-ink">
                    {s.description}
                  </p>
                </div>
                <Button variant="default" size="sm"
                  type="button"
                  onClick={() => apply(s)}
                  disabled={applying !== null}
                  className="mt-1.5 flex justify-start items-center gap-1"
                >
                  {applying === s.id ? (
                    <Loader2 aria-hidden="true" className="h-2.5 w-2.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Wand2 aria-hidden="true" className="h-2.5 w-2.5" />
                  )}
                  {ui("Apply this fix")}
                </Button>
              </li>
            ))}
          </ul>
          {(report?.unresolvable?.length ?? 0) > 0 && (
            <p className="mt-2 text-2xs font-bold text-ink-subtle">
              {ui(report!.unresolvable.length === 1
                ? "1 conflict needs a manual decision — no free teacher, room or period was available to propose."
                : "{0} conflicts need a manual decision — no free teacher, room or period was available to propose.", [report!.unresolvable.length])}
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
  const ui = useUiText();
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
    if (!teacherNames.has(slot.teacherId)) teacherNames.set(slot.teacherId, slot.teacher?.fullName || ui("Teacher"));
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
      if (!byKey.has(key)) byKey.set(key, { teacher: s.teacher?.fullName || ui("Teacher"), classes: new Set() });
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
      suggestions.push(ui(w.remaining > 1 ? "Place {0} in {1} more slots this week." : "Place {0} in 1 more slot this week.", [w.subject.name, w.remaining]))
    );
  }
  if (clashes.size > 0) {
    const first = [...clashes.values()][0];
    suggestions.push(ui("{0} is double-booked — reassign one of: {1}.", [first.teacher, first.classes.join(" / ")]));
  }
  const emptyClassSlots = slots.filter((s) => s.slotType === "CLASS" && !s.subjectId).length;
  if (emptyClassSlots > 0) {
    suggestions.push(ui(emptyClassSlots > 1 ? "{0} class slots still empty — drop a subject from the palette to fill them." : "1 class slot still empty — drop a subject from the palette to fill it.", [emptyClassSlots]));
  }
  if (suggestions.length === 0) {
    suggestions.push(ui("Everything looks balanced. Publish when ready."));
  }

  return (
    <div className="sk-panel flex h-full flex-col gap-4 p-4">
      <div>
        <p className="text-xs font-semibold text-primary">{ui("Checks")}</p>
        <h3 className="text-sm font-bold text-ink-strong mt-1">{ui("Live intelligence")}</h3>
      </div>

      {/* Double-bookings */}
      <div className="rounded-xl border border-edge/15 bg-surface-subtle p-3">
        <div className="flex items-center gap-1.5">
          {clashes.size === 0 ? (
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-status-success-text" />
          ) : (
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-status-error-text" />
          )}
          <span className="text-xs font-semibold text-ink-muted">
            {ui("Teacher double-bookings")}
          </span>
        </div>
        {clashes.size === 0 ? (
          <p className="mt-1.5 text-2xs font-medium text-status-success-text">{ui("None detected — assignments are conflict-free.")}</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {[...clashes.values()].map((c, i) => (
              <li key={i} className="text-2xs font-bold text-status-error-text">
                <bdi>{c.teacher}</bdi>: <bdi>{c.classes.join(" & ")}</bdi>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Subject coverage */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-subtle">{ui("Subject coverage")}</p>
        <div className="space-y-1.5">
          {subjects.length === 0 && (
            <EmptyState size="sm" title={ui("No subjects to track")} description={ui("Add subjects to this class to track weekly coverage.")} />
          )}
          {subjects.map((s) => {
            const placed = placedBySubject.get(s.id) || 0;
            const short = placed < targetDays;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <bdi className="truncate text-2xs font-bold text-ink-strong">{s.name}</bdi>
                <Badge variant={short ? "warning" : "success"} size="sm" className="tabular-nums">
                  {placed}/{targetDays}
                </Badge>
              </div>
            );
          })}
        </div>
        {subjectWarnings.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-2xs font-medium text-status-warning-text">
            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
            {ui(subjectWarnings.length > 1 ? "{0} subjects below the weekly target." : "1 subject below the weekly target.", [subjectWarnings.length])}
          </p>
        )}
      </div>

      {/* Teacher workload per day */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-subtle">{ui("Teacher workload / day")}</p>
        {workload.size === 0 ? (
          <EmptyState size="sm" title={ui("No teachers assigned yet")} description={ui("Assign teachers to lessons to see their daily workload.")} />
        ) : (
          <div className="space-y-2.5">
            {[...workload.entries()].map(([tid, dayMap]) => (
              <div key={tid}>
                <bdi className="mb-1 block text-2xs font-bold text-ink-strong">{teacherNames.get(tid)}</bdi>
                <div className="flex items-end gap-1">
                  {visibleDays.map((day) => {
                    const count = dayMap.get(day.num) || 0;
                    const h = Math.round((count / maxWorkload) * 28);
                    return (
                      <div key={day.num} className="flex flex-1 flex-col items-center gap-0.5">
                        <Tooltip content={ui(count === 1 ? "{0}: 1 period" : "{0}: {1} periods", [ui(day.full), count])}>
                          <span
                            tabIndex={0}
                            aria-label={ui(count === 1 ? "{0}: 1 period" : "{0}: {1} periods", [ui(day.full), count])}
                            className={`block w-full rounded-t-md ${count > 2 ? "bg-status-warning-text" : "bg-primary/70"}`}
                            style={{ height: `${Math.max(h, count > 0 ? 4 : 2)}px` }}
                          />
                        </Tooltip>
                        <span aria-hidden="true" className="text-3xs font-bold text-ink-subtle">{ui(day.short)}</span>
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
      <div className="mt-auto rounded-xl bg-gradient-to-br from-primary/5 to-brand-50 p-3">
        <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary">
          <Lightbulb aria-hidden="true" className="h-3 w-3" />{ui("Drafting hints")}
        </p>
        <ul className="space-y-1">
          {suggestions.map((sug, i) => (
            <li key={i} className="flex items-start gap-1 text-2xs font-semibold text-ink">
              <Info aria-hidden="true" className="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary/60" />
              {sug}
            </li>
          ))}
        </ul>
        {clashes.size === 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-2xs font-bold text-ink-subtle">
            <UserX aria-hidden="true" className="h-2.5 w-2.5" />{ui("Prevention is on: dropdowns only offer free teachers & rooms.")}
          </p>
        )}
      </div>
    </div>
  );
}
