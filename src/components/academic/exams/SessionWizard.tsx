"use client";
import { EXAM_TERM_LABELS } from "@/lib/academic/exam-terms";

import { Button } from "@/components/ui/button";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Check,
  GraduationCap,
  School,
  Sparkles,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Field, inputClass, selectClass } from "@/components/academic/exams/shared";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * Create one exam for every class in a single pass (§80).
 *
 * The question behind this screen — "do we schedule an exam for all classes,
 * or one per class?" — has a two-part answer, and the wizard is where the two
 * parts meet. The DECISION is school-wide: mid-terms happen, in this window,
 * for these classes. The PAPERS stay per class, because Class 5 does not sit
 * Class 9's maths paper. So one form here writes one session and one exam per
 * class, and everything downstream is unchanged.
 */

interface ClassRow {
  id: string;
  name: string;
  section: string | null;
  academicYear: number;
  _count?: { students: number; subjects: number };
  studentCount?: number;
  subjectCount?: number;
}

const TERMS = EXAM_TERM_LABELS;

const TYPES = [
  {
    value: "MID_TERM",
    label: "Mid-Term Exam",
    blurb: "Halfway through the term. Counts towards the report card.",
    icon: CalendarRange,
  },
  {
    value: "FINAL",
    label: "Final Exam",
    blurb: "End of the term or year. The heaviest weight on the report card.",
    icon: GraduationCap,
  },
] as const;

function labelOf(c: ClassRow) {
  return `${c.name}${c.section ? ` ${c.section}` : ""}`;
}

function countsOf(c: ClassRow) {
  return {
    students: c._count?.students ?? c.studentCount ?? 0,
    subjects: c._count?.subjects ?? c.subjectCount ?? 0,
  };
}

export function SessionWizard({
  campusId,
  academicYear,
  onClose,
  onCreated,
}: {
  campusId?: string;
  academicYear: number;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}) {
  const ui = useUiText();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [examType, setExamType] = useState<string>("MID_TERM");
  const [term, setTerm] = useState("Term 1");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/classes${campusId ? `?campusId=${campusId}` : ""}`).then((r) =>
          r.json(),
        );
        if (cancelled) return;
        const list: ClassRow[] = (res.classes ?? res.data ?? []).filter(
          (c: ClassRow) => c.academicYear === academicYear || !c.academicYear,
        );
        setClasses(list);
        // Every class is the normal case — a school holds mid-terms for all of
        // them — so start with everything that has subjects already ticked.
        setSelected(new Set(list.filter((c) => countsOf(c).subjects > 0).map((c) => c.id)));
      } catch {
        if (!cancelled) toast.error(ui("Could not load classes"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campusId, academicYear]);

  // The title writes itself until the admin types their own.
  const suggestedTitle = useMemo(() => {
    const type = TYPES.find((t) => t.value === examType)?.label ?? "Exam";
    return `${type} — ${term} ${academicYear}`;
  }, [examType, term, academicYear]);

  useEffect(() => {
    if (!titleTouched) setTitle(suggestedTitle);
  }, [suggestedTitle, titleTouched]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    classes.forEach((c) => map.set(c.name, [...(map.get(c.name) ?? []), c]));
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
  }, [classes]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((rows: ClassRow[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = rows.every((r) => next.has(r.id));
      rows.forEach((r) => (allOn ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  }, []);

  const chosen = classes.filter((c) => selected.has(c.id));
  const totals = chosen.reduce(
    (acc, c) => {
      const n = countsOf(c);
      acc.students += n.students;
      acc.papers += n.subjects;
      return acc;
    },
    { students: 0, papers: 0 },
  );
  const withoutSubjects = chosen.filter((c) => countsOf(c).subjects === 0);

  const submit = async () => {
    if (!title.trim()) return toast.error(ui("Give the exam a title"));
    if (selected.size === 0) return toast.error(ui("Pick at least one class"));
    setBusy(true);
    try {
      const res = await fetch("/api/academic/exam-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId,
          title: title.trim(),
          term,
          academicYear,
          examType,
          classIds: [...selected],
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      const json = await res.json();
      if (json.code === "EXAM_SESSION_ALL_CLASSES_HAVE_EXAM") {
        // SKAI-1040: nothing was created — every chosen class already has this exam.
        toast.error(ui("Every selected class already has this exam, so nothing was created: {0}", [chosen.map(labelOf).join(", ")]));
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || "");

      const skipped: string[] = json.skipped ?? [];
      const created = ui(json.created === 1 ? "1 class scheduled" : "{0} classes scheduled", [json.created]);
      toast.success(skipped.length ? ui("{0} · {1} already had this exam", [created, skipped.length]) : created);
      onCreated(json.session.id);
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not create the exam")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={ui("Schedule an exam")}
      eyebrow={ui("Exams & results")}
      subtitle={ui("One announcement, one exam per class. Dates and rooms come next.")}
      icon={Sparkles}
      tone="violet"
      size="lg"
      onClose={onClose}
      dirty={titleTouched || startDate !== "" || endDate !== ""}
      footer={
        <ModalActions
          busy={busy}
          busyLabel={ui("Scheduling…")}
          actionLabel={ui(selected.size === 1 ? "Schedule for 1 class" : "Schedule for {0} classes", [selected.size])}
          cancelLabel={ui("Cancel")}
          onCancel={onClose}
          onAction={submit}
          blockedReason={
            selected.size === 0
              ? ui("Pick at least one class to sit this exam.")
              : !title.trim()
              ? ui("Give the exam a title.")
              : null
          }
        />
      }
    >
      <div className="space-y-5">
        {/* ── What kind of exam ─────────────────────────────────────────── */}
        <div>
          <p className="mb-2 ps-0.5 text-xs font-semibold text-ink-subtle">
            {ui("What kind of exam")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TYPES.map((t) => {
              const active = examType === t.value;
              return (
                <Button variant="choice"
                  key={t.value}
                  type="button"
                  onClick={() => setExamType(t.value)}
                  aria-pressed={active}
                  className={"justify-start " + (cn(
                    "group relative flex items-start gap-3 overflow-hidden p-3.5 text-start",
                    active
                      ? ""
                      : "hover:-translate-y-0.5",
                  ))}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-primary text-primary-foreground" : "bg-brand-100 text-primary",
                    )}
                    aria-hidden="true"
                  >
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink-strong">{ui(t.label)}</span>
                    <span className="mt-0.5 block text-2xs font-semibold leading-snug text-ink-muted">
                      {ui(t.blurb)}
                    </span>
                  </span>
                  {active ? (
                    <Check aria-hidden="true" className="absolute end-3 top-3 h-4 w-4 text-primary" />
                  ) : null}
                </Button>
              );
            })}
          </div>
          <p className="mt-2 ps-0.5 text-2xs font-semibold text-ink-subtle">
            {ui("Quizzes and class tests are created by teachers for their own subjects — they never need a date sheet or a seating plan.")}
          </p>
        </div>

        {/* ── When ──────────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Term">
            <SystemSelect className={selectClass} value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {ui(t)}
                </option>
              ))}
            </SystemSelect>
          </Field>
          <Field label="Title" className="sm:col-span-1 lg:col-span-1">
            <SystemInput
              className={inputClass}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder={suggestedTitle}
            />
          </Field>
          <Field label="Starts" hint="Optional — it just frames the planner">
            <SystemInput
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Ends" hint="Optional">
            <SystemInput
              type="date"
              className={inputClass}
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        {/* ── Which classes ─────────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="ps-0.5 text-xs font-semibold text-ink-subtle">
              {ui("Which classes sit it")}
            </p>
            <div className="ms-auto flex gap-1.5">
              <Button variant="secondary"
                type="button"
                onClick={() => setSelected(new Set(classes.map((c) => c.id)))}
                className="px-2.5 py-1"
              >
                {ui("All")}
              </Button>
              <Button variant="secondary"
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-2.5 py-1"
              >
                {ui("None")}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 rounded-2xl bg-border-subtle/40 skeleton-shimmer" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              size="sm"
              icon={School}
              title={ui("No classes for {0} yet", [academicYear])}
              description={ui("Create classes for this academic year first, then schedule the exam.")}
            />
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-edge/20 bg-surface-subtle p-2.5 custom-scrollbar">
              {grouped.map(([name, rows]) => {
                const allOn = rows.every((r) => selected.has(r.id));
                const someOn = !allOn && rows.some((r) => selected.has(r.id));
                return (
                  <div
                    key={name}
                    className="sk-panel p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Button aria-pressed={allOn} variant="choice" size="icon"
                        type="button"
                        onClick={() => toggleGroup(rows)}
                        className={cn(
                          "flex shrink-0 items-center justify-center",
                          allOn
                            ? ""
                            : "",
                        )}
                        aria-label={ui("Select all sections of {0}", [name])}
                      >
                        {allOn ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
                        {someOn ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-sm bg-primary" /> : null}
                      </Button>
                      <School aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <bdi className="text-xs font-bold text-ink-strong">{name}</bdi>
                      <span className="text-2xs font-bold text-ink-subtle">
                        {ui(rows.length === 1 ? "{0} section" : "{0} sections", [rows.length])}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 ps-7">
                      {rows.map((row) => {
                        const on = selected.has(row.id);
                        const n = countsOf(row);
                        return (
                          <Button variant="choice"
                            key={row.id}
                            type="button"
                            onClick={() => toggle(row.id)}
                            aria-pressed={on}
                            className={"justify-start " + (cn(
                              "flex items-center gap-1.5 px-2.5 py-1",
                              "",
                              n.subjects === 0 && "",
                            ))}
                          >
                            <bdi>{labelOf(row)}</bdi>
                            <span className="text-xs font-normal text-ink-subtle tabular-nums">
                              {ui("{0} students · {1} subjects", [n.students, n.subjects])}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── What this will create ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-gradient-to-r from-brand-100 to-surface-subtle px-4 py-3">
          <p className="text-xs font-semibold text-primary">
            {ui("This creates")}
          </p>
          <p className="text-xs font-bold text-ink-strong">
            {ui(selected.size === 1 ? "{0} exam" : "{0} exams", [selected.size])}
          </p>
          <p className="text-xs font-bold text-ink-strong">
            {ui(totals.papers === 1 ? "{0} paper to date" : "{0} papers to date", [totals.papers])}
          </p>
          <p className="text-xs font-bold text-ink-strong">
            {ui(totals.students === 1 ? "{0} candidate to seat" : "{0} candidates to seat", [totals.students])}
          </p>
          {withoutSubjects.length > 0 ? (
            <p className="w-full text-2xs font-bold text-status-warning-text">
              {ui(withoutSubjects.length === 1 ? "{0} has no subjects, so it will be skipped." : "{0} have no subjects, so they will be skipped.", [withoutSubjects.map(labelOf).join(", ")])}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
