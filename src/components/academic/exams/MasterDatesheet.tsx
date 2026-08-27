"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarX,
  Check,
  Clock,
  Download,
  Layers,
  Loader2,
  RefreshCw,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function prettyDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY[dt.getDay()]} ${String(d).padStart(2, "0")} ${dt.toLocaleString("en", { month: "short" })}`;
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
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<SubjectState | null>(null);
  const [removing, setRemoving] = useState<SubjectState | null>(null);
  const [showConflicts, setShowConflicts] = useState(true);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const sp = new URLSearchParams({ sessionId });
        if (campusId) sp.set("campusId", campusId);
        const res = await fetch(`/api/academic/exam-schedule/bulk?${sp}`).then((r) => r.json());
        if (!res.success) throw new Error(res.error || "Could not load the date sheet");
        setData(res.data as GridData);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load the date sheet");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sessionId, campusId],
  );

  useEffect(() => {
    load();
  }, [load]);

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
      toast.success(`${subject.name} taken off the date sheet`);
      setRemoving(null);
      await load(true);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the paper");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-[20px] bg-[#e8e0ec]/40 skeleton-shimmer" />
        ))}
      </div>
    );
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
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[#cfc2d6]/20 bg-white/85 px-4 py-3 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_24px_-16px_rgba(31,26,35,0.35)] backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
            Date sheet
          </p>
          <p className="text-sm font-black text-[#1f1a23]">
            {totals.placed} of {totals.expected} papers placed
            <span className="ml-2 text-[11px] font-bold text-ink-subtle">
              {totals.subjects} subject{totals.subjects === 1 ? "" : "s"} · {data.rows.length}{" "}
              class{data.rows.length === 1 ? "" : "es"}
            </span>
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {blocking > 0 ? (
            <span className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {blocking} to fix
            </span>
          ) : totals.placed === totals.expected ? (
            <span className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              Complete
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-[#cfc2d6]/25 bg-white text-ink-muted transition-colors hover:border-[#8127cf]/35 hover:text-[#8127cf]"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
          <BrandButton
            variant="dark"
            icon={<Download className="h-4 w-4" />}
            onClick={download}
            disabled={totals.placed === 0}
          >
            Download PDF
          </BrandButton>
        </div>
      </div>

      {/* ── Conflicts ───────────────────────────────────────────────────── */}
      {showConflicts ? (
        <ConflictPanel conflicts={data.conflicts} onDismiss={() => setShowConflicts(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowConflicts(true)}
          className="cursor-pointer text-[11px] font-black uppercase tracking-wider text-[#8127cf] hover:underline"
        >
          Show conflicts ({data.conflicts.length})
        </button>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* ── Subject rows ──────────────────────────────────────────────── */}
        <Panel
          title="Papers"
          subtitle="Set a date once and it applies to every class that takes the subject."
          icon={Layers}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-[#cfc2d6]/12">
            {subjects.map((subject) => {
              const period = data.periods.find((p) => p.id === subject.periodDefinitionId);
              const complete = subject.placed === subject.classCount;
              const weekendHit = subject.date && data.weekends.includes(isoDow(subject.date));
              return (
                <li
                  key={subject.name}
                  className="group flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-[#faf7fc]"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black transition-colors",
                      complete
                        ? "bg-emerald-50 text-emerald-600"
                        : subject.placed > 0
                        ? "bg-amber-50 text-amber-600"
                        : "bg-[#f3f4f9] text-ink-subtle",
                    )}
                  >
                    {subject.placed}/{subject.classCount}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold text-ink-subtle">
                      {subject.date ? (
                        <>
                          <span
                            className={cn(
                              "flex items-center gap-1",
                              weekendHit ? "text-rose-600" : "text-[#8127cf]",
                            )}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {prettyDate(subject.date)}
                          </span>
                          {period ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {period.startTime}–{period.endTime}
                            </span>
                          ) : (
                            <span className="text-amber-600">No time set</span>
                          )}
                        </>
                      ) : subject.mixed ? (
                        <span className="text-amber-600">
                          Classes sit this on different days — open to align them
                        </span>
                      ) : (
                        <span>Not placed yet</span>
                      )}
                      {subject.seatedPapers > 0 ? (
                        <span className="text-emerald-600">
                          {subject.seatedPapers} seated
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(subject)}
                      className={cn(
                        "h-9 cursor-pointer rounded-xl px-3 text-[11px] font-black uppercase tracking-wider transition-all",
                        subject.date
                          ? "bg-[#f3eeff] text-[#8127cf] hover:bg-[#e9dcfb]"
                          : "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-[0_8px_20px_-10px_rgba(129,39,207,0.6)] hover:scale-[1.03]",
                      )}
                    >
                      {subject.date ? "Change" : "Set date"}
                    </button>
                    {subject.placed > 0 ? (
                      <button
                        type="button"
                        onClick={() => setRemoving(subject)}
                        aria-label={`Remove ${subject.name} from the date sheet`}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-ink-subtle opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
            <p className="rounded-2xl border border-dashed border-[#cfc2d6]/30 p-8 text-center text-xs font-bold text-ink-muted">
              Nothing placed yet. Set a date on a paper and it appears here.
            </p>
          ) : (
            <ol className="relative space-y-2.5 pl-5">
              <span
                aria-hidden
                className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-[#8127cf]/40 via-[#cfc2d6]/40 to-transparent"
              />
              {calendar.map(({ date, entries }) => {
                const weekend = data.weekends.includes(isoDow(date));
                return (
                  <li key={date} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-5 top-3 h-[9px] w-[9px] rounded-full ring-4 ring-white",
                        weekend ? "bg-rose-500" : "bg-[#8127cf]",
                      )}
                    />
                    <div
                      className={cn(
                        "rounded-2xl border p-3 transition-colors",
                        weekend
                          ? "border-rose-200/70 bg-rose-50/40"
                          : "border-[#cfc2d6]/20 bg-[#faf7fc]",
                      )}
                    >
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] font-black",
                          weekend ? "text-rose-600" : "text-[#8127cf]",
                        )}
                      >
                        {prettyDate(date)}
                        {weekend ? (
                          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
                            <CalendarX className="h-2.5 w-2.5" />
                            Weekend
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {entries.map((e) => (
                          <div
                            key={e.subject}
                            className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#f3eeff] text-[9px] font-black text-[#8127cf]">
                              P{e.period?.periodNumber ?? "—"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-black text-[#1f1a23]">
                              {e.subject}
                            </span>
                            <span className="shrink-0 text-[9px] font-bold text-ink-subtle">
                              {e.period ? `${e.period.startTime}–${e.period.endTime}` : "No time"} ·{" "}
                              {e.classes} class{e.classes === 1 ? "" : "es"}
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

      {removing ? (
        <Modal
          title={`Remove ${removing.name}?`}
          subtitle={`This takes the paper off the date sheet for all ${removing.placed} class${removing.placed === 1 ? "" : "es"}${removing.seatedPapers > 0 ? ", and discards its seating plan" : ""}. Marks already entered are not touched.`}
          icon={Trash2}
          tone="rose"
          size="sm"
          role="alertdialog"
          onClose={() => setRemoving(null)}
          footer={
            <ModalActions
              actionLabel="Remove paper"
              cancelLabel="Keep it"
              tone="rose"
              onCancel={() => setRemoving(null)}
              onAction={() => removeSubject(removing)}
            />
          }
        >
          <p className="text-sm font-semibold text-ink-muted">
            You can place it again at any time.
          </p>
        </Modal>
      ) : null}
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
      if (!json.data) throw new Error(json.error || "Could not check that slot");
      setPreview({ wouldPlace: json.data.wouldPlace ?? [], conflicts: json.data.conflicts ?? [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check that slot");
      setPreview(null);
    } finally {
      setChecking(false);
    }
  }, [date, periodId, campusId, sessionId, subject.name]);

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
    if (!date) return toast.error("Pick a date");
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
      if (!res.ok || !json.success) throw new Error(json.error || "Could not place the paper");
      toast.success(
        `${subject.name} placed for ${json.data.placed} class${json.data.placed === 1 ? "" : "es"}`,
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place the paper");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={subject.name}
      eyebrow="Place a paper"
      subtitle={`Applies to all ${subject.classCount} class${subject.classCount === 1 ? "" : "es"} that take this subject.`}
      icon={CalendarDays}
      tone="violet"
      size="md"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel="Placing…"
          actionLabel={`Place for ${preview?.wouldPlace.length ?? subject.classCount} class${(preview?.wouldPlace.length ?? subject.classCount) === 1 ? "" : "es"}`}
          onCancel={onClose}
          onAction={save}
          blockedReason={
            !date
              ? "Pick a date."
              : checking
              ? "Checking that slot against every class…"
              : blocking.length > 0
              ? blocking[0].message
              : preview && preview.wouldPlace.length === 0
              ? "Nothing can be placed in this slot."
              : null
          }
        />
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input
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
            <select
              className={selectClass}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              disabled={periods.length === 0}
            >
              <option value="">No fixed time</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  Period {p.periodNumber} · {p.startTime}–{p.endTime}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[#faf7fc] px-4 py-3 text-xs font-bold text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-[#8127cf]" />
            Checking that slot against every class…
          </div>
        ) : preview ? (
          <>
            <ConflictPanel conflicts={preview.conflicts} />
            {preview.wouldPlace.length > 0 ? (
              <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-3.5">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                  Will be placed for
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.wouldPlace.map((c) => (
                    <span
                      key={c}
                      className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-[#8127cf] shadow-sm"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl bg-amber-50/70 px-4 py-3 text-xs font-bold text-amber-700">
                <X className="h-4 w-4" />
                Nothing can be placed in this slot — every class is blocked.
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
