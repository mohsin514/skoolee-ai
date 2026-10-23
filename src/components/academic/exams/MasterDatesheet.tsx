"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarX,
  Clock,
  Download,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { Modal, ModalActions } from "@/components/ui/modal";
import type { BulkConflict } from "@/lib/academic/exam-conflicts";
import {
  ConflictPanel,
  Field,
  Panel,
  StepEmpty,
  inputClass,
  selectClass,
} from "@/components/academic/exams/shared";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";

/**
 * The master date sheet (§80).
 *
 * A date sheet is one document for the whole school, so it is built as one
 * document here: a row per subject, and placing that row places the paper for
 * every class that takes the subject. Building it class by class was the same
 * decision retyped once per class, and — because each form only validated
 * itself — the twentieth entry could clash with the first with nothing to say
 * so until the morning of the exam.
 *
 * Conflicts are therefore checked for the whole session on every change, and
 * every placement is dry-run before it is written.
 */

interface PaperCell {
  subjectId: string;
  subjectName: string;
  totalMarks: number;
  scheduleId: string | null;
  date: string | null;
  periodDefinitionId: string | null;
  roomCount: number;
  seatCount: number;
}

interface GridRow {
  examId: string;
  classId: string;
  classLabel: string;
  studentCount: number;
  papers: PaperCell[];
}

interface Period {
  id: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
}

interface GridData {
  session: { id: string; title: string; startDate: string | null; endDate: string | null };
  rows: GridRow[];
  subjects: { name: string; classIds: string[] }[];
  periods: Period[];
  weekends: number[];
  conflicts: BulkConflict[];
}

/** "Mon 14 Oct" in the viewer's language (R7: dates through Intl, never a hard-coded English weekday). */
function prettyDate(ymd: string, language = "en") {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  try {
    return new Intl.DateTimeFormat(language, { weekday: "short", day: "2-digit", month: "short" }).format(dt);
  } catch {
    return dt.toDateString();
  }
}

function isoDow(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

/** How one subject currently sits across every class in the session. */
interface SubjectState {
  name: string;
  classCount: number;
  placed: number;
  /** The date, when every placed class agrees on one. */
  date: string | null;
  periodDefinitionId: string | null;
  mixed: boolean;
  seatedPapers: number;
}

export function MasterDatesheet({
  sessionId,
  campusId,
  onChanged,
}: {
  sessionId: string;
  campusId?: string;
  onChanged?: () => void;
}) {
  const ui = useUiText();
  const { language } = useLocale();
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<SubjectState | null>(null);
  const [removing, setRemoving] = useState<SubjectState | null>(null);
  const [showConflicts, setShowConflicts] = useState(true);
  // R4: a failed first load is an inline ErrorState with retry; a failed silent refresh keeps the last figures.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const sp = new URLSearchParams({ sessionId });
        if (campusId) sp.set("campusId", campusId);
        const [res, slots] = await Promise.all([
          fetch(`/api/academic/exam-schedule/bulk?${sp}`).then((r) => r.json()),
          // SKO-500: each grade's paper request beside its subject (absent or unreadable: no chips).
          fetch(`/api/academic/exam-sessions/${encodeURIComponent(sessionId)}/paper-slots`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (!res.success) throw new Error(res.error || "");
        setData(res.data as GridData);
        setPaperSlots(Array.isArray(slots?.data?.slots) ? slots.data.slots : []);
        setLoadFailed(false);
      } catch (e) {
        if (silent) toast.error(friendlyErrorMessage(e, ui("Could not refresh the date sheet")));
        else setLoadFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sessionId, campusId, ui],
  );

  useEffect(() => {
    load();
  }, [load]);

  const [paperSlots, setPaperSlots] = useState<Array<{ id: string; subjectName: string; gradeName: string; status: string; overdue: boolean }>>([]);
  const slotCopy = studioSlotsCopy(language);
  const slotsFor = (name: string) => paperSlots.filter((slot) => slot.subjectName.trim().toLowerCase() === name.trim().toLowerCase());

  /** Roll the per-class grid up into one row per subject name. */
  const subjects = useMemo<SubjectState[]>(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; cells: PaperCell[]; classIds: Set<string> }>();
    for (const row of data.rows) {
      for (const paper of row.papers) {
        const key = paper.subjectName.trim().toLowerCase();
        const entry = map.get(key) ?? { name: paper.subjectName, cells: [], classIds: new Set() };
        entry.cells.push(paper);
        entry.classIds.add(row.classId);
        map.set(key, entry);
      }
    }

    return [...map.values()]
      .map(({ name, cells, classIds }) => {
        const placed = cells.filter((c) => c.date);
        const dates = new Set(placed.map((c) => c.date));
        const periods = new Set(placed.map((c) => c.periodDefinitionId ?? ""));
        return {
          name,
          classCount: classIds.size,
          placed: placed.length,
          date: dates.size === 1 ? [...dates][0] : null,
          periodDefinitionId: periods.size === 1 ? [...periods][0] || null : null,
          mixed: dates.size > 1 || periods.size > 1,
          seatedPapers: cells.filter((c) => c.seatCount > 0).length,
        };
      })
      .sort((a, b) => {
        // Papers already on the calendar sort by when they sit; unplaced ones
        // sink to the bottom, which is also the worklist order.
        if (!!a.date !== !!b.date) return a.date ? -1 : 1;
        if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
        return a.name.localeCompare(b.name);
      });
  }, [data]);

  /** The exam calendar: what sits on each day, across every class. */
  const calendar = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { subject: string; period: Period | null; classes: number }[]>();
    for (const subject of subjects) {
      if (!subject.date) continue;
      const period = data.periods.find((p) => p.id === subject.periodDefinitionId) ?? null;
      map.set(subject.date, [
        ...(map.get(subject.date) ?? []),
        { subject: subject.name, period, classes: subject.placed },
      ]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        entries: entries.sort(
          (a, b) => (a.period?.periodNumber ?? 99) - (b.period?.periodNumber ?? 99),
        ),
      }));
  }, [subjects, data]);

  const totals = useMemo(() => {
    const expected = subjects.reduce((n, s) => n + s.classCount, 0);
    const placed = subjects.reduce((n, s) => n + s.placed, 0);
    return { expected, placed, subjects: subjects.length };
  }, [subjects]);

  const download = () => {
    const sp = new URLSearchParams({ doc: "datesheet", sessionId });
    if (campusId) sp.set("campusId", campusId);
    window.open(`/api/academic/exam-documents?${sp}`, "_blank", "noopener");
  };

  const removeSubject = async (subject: SubjectState) => {
    try {
      const sp = new URLSearchParams({ sessionId, subjectName: subject.name });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/exam-schedule/bulk?${sp}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not remove the paper");
      toast.success(ui("{0} taken off the date sheet", [subject.name]));
      setRemoving(null);
      await load(true);
      onChanged?.();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not remove the paper")));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-[20px] bg-border-subtle/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (loadFailed && !data) {
    return <ErrorState title={ui("The date sheet could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />;
  }

  if (!data || data.rows.length === 0) {
    return (
      <StepEmpty
        icon={CalendarDays}
        title="No classes in this exam yet"
        body="This exam has no classes attached, so there are no papers to place. Schedule the exam again and pick the classes that sit it."
      />
    );
  }

  if (subjects.length === 0) {
    return (
      <StepEmpty
        icon={Layers}
        title="These classes have no subjects"
        body="A date sheet is built from subjects. Add subjects to the classes in this exam, then come back — every subject becomes one row you can place for the whole school at once."
      />
    );
  }

  const blocking = data.conflicts.filter((c) => c.blocking).length;

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-edge/20 bg-card/85 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">
            {ui("Date sheet")}
          </p>
          <p className="text-sm font-bold text-ink-strong">
            {ui("{0} of {1} papers placed", [totals.placed, totals.expected])}
            <span className="ms-2 text-2xs font-bold text-ink-subtle">
              {[
                ui(totals.subjects === 1 ? "{0} subject" : "{0} subjects", [totals.subjects]),
                ui(data.rows.length === 1 ? "{0} class" : "{0} classes", [data.rows.length]),
              ].join(" · ")}
            </span>
          </p>
        </div>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {blocking > 0 ? (
            <Badge variant="danger" dot>
              {ui("{0} to fix", [blocking])}
            </Badge>
          ) : totals.placed === totals.expected ? (
            <Badge variant="success" dot>
              {ui("Complete")}
            </Badge>
          ) : null}
          <Button variant="outline" size="icon"
            type="button"
            onClick={() => load(true)}
            aria-label={ui("Refresh")}
            className="flex items-center justify-center"
          >
            <RefreshCw aria-hidden="true" className={cn("h-4 w-4", refreshing && "animate-spin motion-reduce:animate-none")} />
          </Button>
          <BrandButton
            variant="dark"
            icon={<Download aria-hidden="true" className="h-4 w-4" />}
            onClick={download}
            disabled={totals.placed === 0}
          >
            {ui("Download PDF")}
          </BrandButton>
        </div>
      </div>

      {/* ── Conflicts ───────────────────────────────────────────────────── */}
      {showConflicts ? (
        <ConflictPanel conflicts={data.conflicts} onDismiss={() => setShowConflicts(false)} />
      ) : (
        <Button variant="link"
          type="button"
          onClick={() => setShowConflicts(true)}
          className="hover:underline"
        >
          {ui("Show conflicts ({0})", [data.conflicts.length])}
        </Button>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* ── Subject rows ──────────────────────────────────────────────── */}
        <Panel
          title="Papers"
          subtitle="Set a date once and it applies to every class that takes the subject."
          icon={Layers}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-edge/12">
            {subjects.map((subject) => {
              const period = data.periods.find((p) => p.id === subject.periodDefinitionId);
              const complete = subject.placed === subject.classCount;
              const weekendHit = subject.date && data.weekends.includes(isoDow(subject.date));
              return (
                <li
                  key={subject.name}
                  className="group flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-subtle"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-2xs font-bold transition-colors",
                      complete
                        ? "bg-status-success-surface text-status-success-text"
                        : subject.placed > 0
                        ? "bg-status-warning-surface text-status-warning-text"
                        : "bg-muted text-ink-subtle",
                    )}
                  >
                    <bdi dir="ltr">{subject.placed}/{subject.classCount}</bdi>
                  </span>

                  <div className="min-w-0 flex-1">
                    <bdi className="block truncate text-sm font-bold text-ink-strong">{subject.name}</bdi>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs font-bold text-ink-subtle">
                      {subject.date ? (
                        <>
                          <span
                            className={cn(
                              "flex items-center gap-1",
                              weekendHit ? "text-status-error-text" : "text-primary",
                            )}
                          >
                            <CalendarDays aria-hidden="true" className="h-3 w-3" />
                            {prettyDate(subject.date, language)}
                          </span>
                          {period ? (
                            <span className="flex items-center gap-1">
                              <Clock aria-hidden="true" className="h-3 w-3" />
                              <bdi dir="ltr">{period.startTime}–{period.endTime}</bdi>
                            </span>
                          ) : (
                            <span className="text-status-warning-text">{ui("No time set")}</span>
                          )}
                        </>
                      ) : subject.mixed ? (
                        <span className="text-status-warning-text">
                          {ui("Classes sit this on different days — open to align them")}
                        </span>
                      ) : (
                        <span>{ui("Not placed yet")}</span>
                      )}
                      {subject.seatedPapers > 0 ? (
                        <span className="text-status-success-text">
                          {ui("{0} seated", [subject.seatedPapers])}
                        </span>
                      ) : null}
                      {slotsFor(subject.name).map((slot) => (
                        <span key={slot.id} data-paper-slot-chip className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-px", slot.overdue ? "border-status-error-border text-status-error-text" : "border-border-subtle text-ink-muted")}>
                          <FileText aria-hidden="true" className="h-3 w-3" />
                          <bdi>{slot.gradeName}</bdi>
                          <span>{(slotCopy as Record<string, string>)[`status${slot.status}`] ?? slot.status}</span>
                        </span>
                      ))}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="default"
                      type="button"
                      onClick={() => setEditing(subject)}
                      className={cn(
                        "px-3",
                        "",
                      )}
                    >
                      {ui(subject.date ? "Change" : "Set date")}
                    </Button>
                    {subject.placed > 0 ? (
                      <Button variant="secondary" size="icon"
                        type="button"
                        onClick={() => setRemoving(subject)}
                        aria-label={ui("Remove {0} from the date sheet", [subject.name])}
                        className="flex items-center justify-center"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* ── Calendar preview ──────────────────────────────────────────── */}
        <Panel
          title="Exam calendar"
          subtitle="What the school sits, day by day."
          icon={CalendarDays}
          bodyClassName="p-4"
        >
          {calendar.length === 0 ? (
            <EmptyState
              size="sm"
              icon={CalendarDays}
              title={ui("Nothing placed yet")}
              description={ui("Set a date on a paper and it appears here.")}
            />
          ) : (
            <ol className="relative space-y-2.5 ps-5">
              <span
                aria-hidden
                className="absolute start-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-edge/40 to-transparent"
              />
              {calendar.map(({ date, entries }) => {
                const weekend = data.weekends.includes(isoDow(date));
                return (
                  <li key={date} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -start-5 top-3 h-[9px] w-[9px] rounded-full ring-4 ring-card",
                        weekend ? "bg-status-error-text" : "bg-primary",
                      )}
                    />
                    <div
                      className={cn(
                        "rounded-2xl border p-3 transition-colors",
                        weekend
                          ? "border-status-error-border bg-status-error-surface"
                          : "border-edge/20 bg-surface-subtle",
                      )}
                    >
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-2xs font-bold",
                          weekend ? "text-status-error-text" : "text-primary",
                        )}
                      >
                        {prettyDate(date, language)}
                        {weekend ? (
                          <span className="flex items-center gap-1 rounded-full bg-card px-1.5 py-0.5 text-2xs">
                            <CalendarX aria-hidden="true" className="h-2.5 w-2.5" />
                            {ui("Weekend")}
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {entries.map((e) => (
                          <div
                            key={e.subject}
                            className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-1.5"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-2xs font-bold text-primary" title={e.period ? ui("Period {0}", [e.period.periodNumber]) : undefined}>
                              <bdi dir="ltr">{e.period?.periodNumber ?? "—"}</bdi>
                            </span>
                            <bdi className="min-w-0 flex-1 truncate text-2xs font-bold text-ink-strong">
                              {e.subject}
                            </bdi>
                            <span className="shrink-0 text-2xs font-bold text-ink-subtle">
                              {e.period ? <bdi dir="ltr">{e.period.startTime}–{e.period.endTime}</bdi> : ui("No time")}
                              {" · "}
                              {ui(e.classes === 1 ? "{0} class" : "{0} classes", [e.classes])}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      {editing ? (
        <PlacePaperModal
          sessionId={sessionId}
          campusId={campusId}
          subject={editing}
          periods={data.periods}
          window={data.session}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load(true);
            onChanged?.();
          }}
        />
      ) : null}

      {/* R2/R3: one confirmation dialog — the shared ConfirmAction. */}
      <ConfirmAction
        open={Boolean(removing)}
        tone="danger"
        title={removing ? ui("Remove {0}?", [removing.name]) : ""}
        description={removing
          ? [
              removing.placed === 1 ? ui("This takes the paper off the date sheet for 1 class.") : ui("This takes the paper off the date sheet for all {0} classes.", [removing.placed]),
              removing.seatedPapers > 0 ? ui("Its seating plan is discarded.") : null,
              ui("Marks already entered are not touched. You can place it again at any time."),
            ].filter(Boolean).join(" ")
          : ""}
        confirmLabel={ui("Remove paper")}
        cancelLabel={ui("Keep editing")}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing) void removeSubject(removing); }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Placing one paper across every class
 * ────────────────────────────────────────────────────────────────────────── */

function PlacePaperModal({
  sessionId,
  campusId,
  subject,
  periods,
  window: examWindow,
  onClose,
  onSaved,
}: {
  sessionId: string;
  campusId?: string;
  subject: SubjectState;
  periods: Period[];
  window: { startDate: string | null; endDate: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const ui = useUiText();
  const [date, setDate] = useState(subject.date ?? examWindow.startDate ?? "");
  const [periodId, setPeriodId] = useState(subject.periodDefinitionId ?? periods[0]?.id ?? "");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    wouldPlace: string[];
    conflicts: BulkConflict[];
  } | null>(null);

  const dirty = date !== (subject.date ?? "") || periodId !== (subject.periodDefinitionId ?? "");

  /**
   * Dry-run before every save.
   *
   * Placing a paper touches up to twenty classes at once, so "try it and see"
   * is not an acceptable interaction — the conflicts are shown first, for all
   * of them, and the save button only commits what was already checked.
   */
  const check = useCallback(async () => {
    if (!date) return;
    setChecking(true);
    try {
      const res = await fetch("/api/academic/exam-schedule/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId,
          sessionId,
          subjectName: subject.name,
          date,
          periodDefinitionId: periodId || null,
          mode: "check",
        }),
      });
      const json = await res.json();
      if (!json.data) throw new Error(json.error || "");
      setPreview({ wouldPlace: json.data.wouldPlace ?? [], conflicts: json.data.conflicts ?? [] });
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not check that slot")));
      setPreview(null);
    } finally {
      setChecking(false);
    }
  }, [date, periodId, campusId, sessionId, subject.name, ui]);

  // Re-check whenever the slot changes, debounced so typing a date does not
  // fire four requests as the day, month and year fill in.
  useEffect(() => {
    if (!date) {
      setPreview(null);
      return;
    }
    const t = setTimeout(check, 350);
    return () => clearTimeout(t);
  }, [date, periodId, check]);

  const blocking = preview?.conflicts.filter((c) => c.blocking) ?? [];

  const save = async () => {
    if (!date) return toast.error(ui("Pick a date"));
    setSaving(true);
    try {
      const res = await fetch("/api/academic/exam-schedule/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId,
          sessionId,
          subjectName: subject.name,
          date,
          periodDefinitionId: periodId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "");
      toast.success(ui(json.data.placed === 1 ? "{0} placed for 1 class" : "{0} placed for {1} classes", [subject.name, json.data.placed]));
      onSaved();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not place the paper")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={subject.name}
      eyebrow={ui("Place a paper")}
      subtitle={ui(subject.classCount === 1 ? "Applies to the 1 class that takes this subject." : "Applies to all {0} classes that take this subject.", [subject.classCount])}
      icon={CalendarDays}
      tone="violet"
      size="md"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel={ui("Placing…")}
          actionLabel={ui((preview?.wouldPlace.length ?? subject.classCount) === 1 ? "Place for 1 class" : "Place for {0} classes", [preview?.wouldPlace.length ?? subject.classCount])}
          cancelLabel={ui("Cancel")}
          onCancel={onClose}
          onAction={save}
          blockedReason={
            !date
              ? ui("Pick a date.")
              : checking
              ? ui("Checking that slot against every class…")
              : blocking.length > 0
              ? blocking[0].message
              : preview && preview.wouldPlace.length === 0
              ? ui("Nothing can be placed in this slot.")
              : null
          }
        />
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <SystemInput
              type="date"
              className={inputClass}
              value={date}
              min={examWindow.startDate ?? undefined}
              max={examWindow.endDate ?? undefined}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field
            label="Exam period"
            hint={periods.length === 0 ? "No exam periods defined — set them under Daily Periods." : undefined}
          >
            <SystemSelect
              className={selectClass}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              disabled={periods.length === 0}
            >
              <option value="">{ui("No fixed time")}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {ui("Period {0} · {1}–{2}", [p.periodNumber, p.startTime, p.endTime])}
                </option>
              ))}
            </SystemSelect>
          </Field>
        </div>

        {checking ? (
          <Alert tone="neutral" compact live="polite" icon={false}>
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              {ui("Checking that slot against every class…")}
            </span>
          </Alert>
        ) : preview ? (
          <>
            <ConflictPanel conflicts={preview.conflicts} />
            {preview.wouldPlace.length > 0 ? (
              <div className="rounded-2xl border border-edge/20 bg-surface-subtle p-3.5">
                <p className="mb-2 text-xs font-semibold text-ink-subtle">
                  {ui("Will be placed for")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.wouldPlace.map((c) => (
                    <bdi
                      key={c}
                      className="rounded-lg bg-card px-2 py-1 text-2xs font-bold text-primary shadow-sm"
                    >
                      {c}
                    </bdi>
                  ))}
                </div>
              </div>
            ) : (
              <Alert tone="warning" compact live="off">
                {ui("Nothing can be placed in this slot — every class is blocked.")}
              </Alert>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
