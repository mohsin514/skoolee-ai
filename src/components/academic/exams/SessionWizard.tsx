"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Check,
  GraduationCap,
  School,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Field, inputClass, selectClass } from "@/components/academic/exams/shared";

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

const TERMS = ["Term 1", "Term 2", "Term 3", "Annual"];

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
        if (!cancelled) toast.error("Could not load classes");
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
    if (!title.trim()) return toast.error("Give the exam a title");
    if (selected.size === 0) return toast.error("Pick at least one class");
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
      if (!res.ok || !json.success) throw new Error(json.error || "Could not create the exam");

      const skipped: string[] = json.skipped ?? [];
      toast.success(
        `${json.created} class${json.created === 1 ? "" : "es"} scheduled` +
          (skipped.length ? ` · ${skipped.length} already had this exam` : ""),
      );
      onCreated(json.session.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the exam");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Schedule an exam"
      eyebrow="Exams & Results"
      subtitle="One announcement, one exam per class. Dates and rooms come next."
      icon={Sparkles}
      tone="violet"
      size="lg"
      onClose={onClose}
      dirty={titleTouched || startDate !== "" || endDate !== ""}
      footer={
        <ModalActions
          busy={busy}
          busyLabel="Scheduling…"
          actionLabel={`Schedule for ${selected.size} class${selected.size === 1 ? "" : "es"}`}
          onCancel={onClose}
          onAction={submit}
          blockedReason={
            selected.size === 0
              ? "Pick at least one class to sit this exam."
              : !title.trim()
              ? "Give the exam a title."
              : null
          }
        />
      }
    >
      <div className="space-y-5">
        {/* ── What kind of exam ─────────────────────────────────────────── */}
        <div>
          <p className="mb-2 pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
            What kind of exam
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TYPES.map((t) => {
              const active = examType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setExamType(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200",
                    active
                      ? "border-[#8127cf] bg-gradient-to-br from-[#faf5ff] to-white shadow-[0_0_0_1px_rgba(129,39,207,0.35),0_12px_28px_-16px_rgba(129,39,207,0.5)]"
                      : "border-[#cfc2d6]/25 bg-white hover:-translate-y-0.5 hover:border-[#8127cf]/35",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-[#8127cf] text-white" : "bg-[#f3eeff] text-[#8127cf]",
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-[#1f1a23]">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-ink-muted">
                      {t.blurb}
                    </span>
                  </span>
                  {active ? (
                    <Check className="absolute right-3 top-3 h-4 w-4 text-[#8127cf]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-2 pl-0.5 text-[10px] font-semibold text-ink-subtle">
            Quizzes and class tests are created by teachers for their own subjects — they
            never need a date sheet or a seating plan.
          </p>
        </div>

        {/* ── When ──────────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Term">
            <select className={selectClass} value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" className="sm:col-span-1 lg:col-span-1">
            <input
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
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Ends" hint="Optional">
            <input
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
            <p className="pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
              Which classes sit it
            </p>
            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={() => setSelected(new Set(classes.map((c) => c.id)))}
                className="cursor-pointer rounded-lg bg-[#f3eeff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#e9dcfb]"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="cursor-pointer rounded-lg bg-[#f6f2fa] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:bg-[#eee7f4]"
              >
                None
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#cfc2d6]/35 p-6 text-center text-xs font-bold text-ink-muted">
              No classes for {academicYear} yet. Create classes first.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-2.5 custom-scrollbar">
              {grouped.map(([name, rows]) => {
                const allOn = rows.every((r) => selected.has(r.id));
                const someOn = !allOn && rows.some((r) => selected.has(r.id));
                return (
                  <div
                    key={name}
                    className="rounded-xl border border-[#cfc2d6]/20 bg-white p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(rows)}
                        className={cn(
                          "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-all",
                          allOn
                            ? "border-[#8127cf] bg-[#8127cf] text-white"
                            : someOn
                            ? "border-[#8127cf] bg-[#f3eeff]"
                            : "border-[#cfc2d6]/50 bg-white hover:border-[#8127cf]/50",
                        )}
                        aria-label={`Select all sections of ${name}`}
                      >
                        {allOn ? <Check className="h-3 w-3" /> : null}
                        {someOn ? <span className="h-1.5 w-1.5 rounded-sm bg-[#8127cf]" /> : null}
                      </button>
                      <School className="h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
                      <span className="text-xs font-black text-[#1f1a23]">{name}</span>
                      <span className="text-[10px] font-bold text-ink-subtle">
                        {rows.length} section{rows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                      {rows.map((row) => {
                        const on = selected.has(row.id);
                        const n = countsOf(row);
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => toggle(row.id)}
                            aria-pressed={on}
                            title={`${n.students} students · ${n.subjects} subjects`}
                            className={cn(
                              "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black transition-all",
                              on
                                ? "border-[#8127cf]/40 bg-[#f3eeff] text-[#8127cf]"
                                : "border-[#cfc2d6]/30 bg-white text-ink-muted hover:border-[#8127cf]/30",
                              n.subjects === 0 && "opacity-60",
                            )}
                          >
                            {labelOf(row)}
                            <span className="flex items-center gap-0.5 text-[9px] font-bold opacity-70">
                              <Users className="h-2.5 w-2.5" />
                              {n.students}
                            </span>
                          </button>
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-gradient-to-r from-[#f3eeff] to-[#faf7fc] px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
            This creates
          </p>
          <p className="text-xs font-bold text-[#1f1a23]">
            <span className="tabular-nums">{selected.size}</span> exam
            {selected.size === 1 ? "" : "s"}
          </p>
          <p className="text-xs font-bold text-[#1f1a23]">
            <span className="tabular-nums">{totals.papers}</span> paper
            {totals.papers === 1 ? "" : "s"} to date
          </p>
          <p className="text-xs font-bold text-[#1f1a23]">
            <span className="tabular-nums">{totals.students}</span> candidate
            {totals.students === 1 ? "" : "s"} to seat
          </p>
          {withoutSubjects.length > 0 ? (
            <p className="w-full text-[10px] font-bold text-amber-600">
              {withoutSubjects.map(labelOf).join(", ")} {withoutSubjects.length === 1 ? "has" : "have"}{" "}
              no subjects, so {withoutSubjects.length === 1 ? "it" : "they"} will be skipped.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
