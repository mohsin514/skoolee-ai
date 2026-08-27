"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  ChevronRight,
  Loader2,
  RotateCcw,
  Scale,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { BrandButton } from "@/components/role-dashboard";
import { Field, Panel, StepEmpty, inputClass } from "@/components/academic/exams/shared";

/**
 * Grading rules, set per class and applied to every section of it (§80).
 *
 * These used to live inside the exam drawer, on a tab beside marks entry —
 * which put a decision about the whole year ("what counts as a pass?") inside a
 * dialog about one exam of one section. Two consequences followed. Admins never
 * found it, so most classes ran on defaults nobody had chosen; and those who
 * did find it set the rules for the section they happened to have open, so 5-A
 * could pass at 50% while 5-B passed at 40%.
 *
 * A class is the right unit. Every section of Class 5 sits the same paper on
 * the same day, so they pass at the same mark — and saving here writes all of
 * them at once, so the rows cannot drift apart again.
 */

interface Config {
  quizWeight: number;
  classTestWeight: number;
  midTermWeight: number;
  finalWeight: number;
  passingPercentage: number;
  weightMode: "NORMALIZED" | "ABSOLUTE";
  gradeAplus: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
}

interface ClassGroup {
  className: string;
  sections: { id: string; section: string | null; students: number; hasConfig: boolean }[];
  config: Config;
  drifted: boolean;
  configured: boolean;
  students: number;
  subjects: number;
}

const WEIGHTS: {
  key: "midTermWeight" | "finalWeight" | "classTestWeight" | "quizWeight";
  label: string;
  who: string;
}[] = [
  { key: "midTermWeight", label: "Mid-term exam", who: "Office" },
  { key: "finalWeight", label: "Final exam", who: "Office" },
  { key: "classTestWeight", label: "Class tests", who: "Teachers" },
  { key: "quizWeight", label: "Quizzes", who: "Teachers" },
];

const GRADES: { key: keyof Config; label: string; tone: string }[] = [
  { key: "gradeAplus", label: "A+", tone: "bg-emerald-500" },
  { key: "gradeA", label: "A", tone: "bg-teal-500" },
  { key: "gradeB", label: "B", tone: "bg-sky-500" },
  { key: "gradeC", label: "C", tone: "bg-amber-500" },
  { key: "gradeD", label: "D", tone: "bg-orange-500" },
];

const MODES: { key: Config["weightMode"]; label: string; help: string }[] = [
  {
    key: "NORMALIZED",
    label: "Rescale to the exams held",
    help: "Exams of the same type are averaged, then the weights of the types that have actually happened are rescaled to 100. Full marks in the only exam so far reads as 100%.",
  },
  {
    key: "ABSOLUTE",
    label: "Score against the whole year",
    help: "Every exam scores against the full 100-point year, so exam types that have not happened yet count as zero. Percentages stay low until the year is complete.",
  },
];

const PRESETS: { name: string; blurb: string; values: Partial<Config> }[] = [
  {
    name: "Term exams only",
    blurb: "50 / 50 between mid-term and final. Classroom work is not weighted.",
    values: { quizWeight: 0, classTestWeight: 0, midTermWeight: 50, finalWeight: 50 },
  },
  {
    name: "Balanced",
    blurb: "Classroom work counts for 30%, term exams for 70%.",
    values: { quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40 },
  },
  {
    name: "Final-heavy",
    blurb: "The final exam carries most of the year.",
    values: { quizWeight: 0, classTestWeight: 10, midTermWeight: 25, finalWeight: 65 },
  },
];

export function GradingRulesPanel({ campusId }: { campusId?: string }) {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClassGroup | null>(null);
  const academicYear = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ scope: "all", academicYear: String(academicYear) });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/grade-config?${sp}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error || "Could not load grading rules");
      setGroups(res.data as ClassGroup[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load grading rules");
    } finally {
      setLoading(false);
    }
  }, [campusId, academicYear]);

  useEffect(() => {
    load();
  }, [load]);

  const unset = groups.filter((g) => !g.configured).length;
  const drifted = groups.filter((g) => g.drifted).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-[20px] bg-[#e8e0ec]/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <StepEmpty
        icon={Scale}
        title="No classes for this year"
        body={`Grading rules are set per class for ${academicYear}. Create classes first and each one appears here with its own pass mark and grade boundaries.`}
      />
    );
  }

  return (
    <div className="sk-rise space-y-4">
      <header className="relative overflow-hidden rounded-[28px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#1f1a23] via-[#2d2338] to-[#3d2a52] px-6 py-5 text-white shadow-[0_18px_48px_-24px_rgba(31,26,35,0.6)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-[#8127cf]/25 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12">
            <Scale className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
              Assess · {academicYear}
            </p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight">Grading &amp; passing rules</h2>
            <p className="mt-1 text-xs font-semibold text-white/65">
              What counts as a pass, how each exam type is weighted, and where the grade
              boundaries fall. Set per class — every section of that class gets the same rules.
            </p>
          </div>
        </div>
      </header>

      {drifted > 0 ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-amber-200/70 bg-amber-50/60 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-xs font-bold text-amber-700">
            {drifted} class{drifted === 1 ? " has" : "es have"} sections with different rules — two
            children in the same year passing at different marks. Open the class and save once to
            bring every section back into line.
          </p>
        </div>
      ) : null}

      {unset > 0 ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#cfc2d6]/25 bg-[#faf7fc] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-[#8127cf]" />
          <p className="min-w-0 flex-1 text-xs font-bold text-ink-muted">
            {unset} class{unset === 1 ? "" : "es"} are still on the default rules — a 50% pass mark
            and a 10 / 20 / 30 / 40 weighting. That is a working default, not a decision anyone
            made.
          </p>
        </div>
      ) : null}

      <Panel
        title="Classes"
        subtitle={`${groups.length} class${groups.length === 1 ? "" : "es"} · rules apply to every section`}
        icon={Award}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-[#cfc2d6]/12">
          {groups.map((group) => (
            <li key={group.className}>
              <button
                type="button"
                onClick={() => setEditing(group)}
                className="group flex w-full cursor-pointer flex-wrap items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#faf7fc]"
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black",
                    group.drifted
                      ? "bg-amber-50 text-amber-600"
                      : group.configured
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-[#f3f4f9] text-ink-subtle",
                  )}
                >
                  {group.drifted ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : group.configured ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    group.className.replace(/\D/g, "").slice(0, 2) || "—"
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[#1f1a23]">{group.className}</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-ink-subtle">
                      <Users className="h-3 w-3" />
                      {group.students}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {group.sections.map((s) => (
                        <span
                          key={s.id}
                          className="rounded bg-[#f3eeff] px-1.5 py-px text-[9px] font-black text-[#8127cf]"
                        >
                          {s.section ?? "—"}
                        </span>
                      ))}
                    </span>
                    {group.drifted ? (
                      <span className="rounded bg-amber-100 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-amber-700">
                        Sections disagree
                      </span>
                    ) : !group.configured ? (
                      <span className="rounded bg-[#f3f4f9] px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[10px] font-bold text-ink-subtle">
                    Pass at {group.config.passingPercentage}% · A+ from {group.config.gradeAplus}%
                    · Mid {group.config.midTermWeight}% / Final {group.config.finalWeight}% / Tests{" "}
                    {group.config.classTestWeight}% / Quiz {group.config.quizWeight}%
                  </span>
                </span>

                <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-[#8127cf]" />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {editing ? (
        <RulesEditor
          group={editing}
          academicYear={academicYear}
          campusId={campusId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function RulesEditor({
  group,
  academicYear,
  campusId,
  onClose,
  onSaved,
}: {
  group: ClassGroup;
  academicYear: number;
  campusId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cfg, setCfg] = useState<Config>(group.config);
  const [saving, setSaving] = useState(false);

  const total =
    cfg.quizWeight + cfg.classTestWeight + cfg.midTermWeight + cfg.finalWeight;
  const dirty = JSON.stringify(cfg) !== JSON.stringify(group.config);

  const ladderBroken = useMemo(() => {
    const order = [cfg.gradeAplus, cfg.gradeA, cfg.gradeB, cfg.gradeC, cfg.gradeD];
    for (let i = 1; i < order.length; i++) if (order[i] >= order[i - 1]) return true;
    return false;
  }, [cfg]);

  const set = (key: keyof Config, value: number) =>
    setCfg((c) => ({ ...c, [key]: Math.max(0, Math.min(100, value)) }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/grade-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId,
          className: group.className,
          academicYear,
          ...cfg,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not save");
      toast.success(
        `${group.className} updated across ${json.sectionsUpdated} section${json.sectionsUpdated === 1 ? "" : "s"}`,
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={group.className}
      eyebrow="Grading rules"
      subtitle={`Applies to ${group.sections.length} section${group.sections.length === 1 ? "" : "s"} (${group.sections.map((s) => s.section ?? "—").join(", ")}) and ${group.students} students.`}
      icon={Scale}
      tone="violet"
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel="Saving…"
          actionLabel={`Save for all ${group.sections.length} section${group.sections.length === 1 ? "" : "s"}`}
          onCancel={onClose}
          onAction={save}
          blockedReason={
            Math.round(total) !== 100
              ? `The weights add up to ${Math.round(total)}% — they must add up to 100%.`
              : ladderBroken
              ? "Each grade must start below the one above it."
              : null
          }
        />
      }
    >
      <div className="space-y-5">
        {/* ── Pass mark ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[#cfc2d6]/20 bg-gradient-to-r from-[#faf5ff] to-white p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-[#1f1a23]">Pass mark</p>
              <p className="mt-0.5 text-[11px] font-semibold leading-snug text-ink-muted">
                A student below this in the weighted total does not pass the year. This is the
                single number parents ask about.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={cfg.passingPercentage}
                onChange={(e) => set("passingPercentage", Number(e.target.value))}
                className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-[#e8e0ec] accent-[#8127cf]"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={cfg.passingPercentage}
                onChange={(e) => set("passingPercentage", Number(e.target.value))}
                className={cn(inputClass, "w-20 text-center")}
              />
              <span className="text-sm font-black text-[#8127cf]">%</span>
            </div>
          </div>
        </div>

        {/* ── Weights ───────────────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
              How each exam type is weighted
            </p>
            <span
              className={cn(
                "rounded-lg px-2 py-0.5 text-[10px] font-black tabular-nums",
                Math.round(total) === 100
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600",
              )}
            >
              {Math.round(total)}% of 100
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  title={p.blurb}
                  onClick={() => setCfg((c) => ({ ...c, ...p.values }))}
                  className="cursor-pointer rounded-lg bg-[#f3eeff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#e9dcfb]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* One stacked bar makes the split legible without reading four numbers. */}
          <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-[#e8e0ec]/60">
            {WEIGHTS.map((w, i) => (
              <span
                key={w.key}
                title={`${w.label} ${cfg[w.key]}%`}
                className={cn(
                  "h-full transition-[width] duration-500",
                  ["bg-[#8127cf]", "bg-[#b06bea]", "bg-teal-500", "bg-amber-500"][i],
                )}
                style={{ width: `${Math.min(100, cfg[w.key])}%` }}
              />
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {WEIGHTS.map((w, i) => (
              <div
                key={w.key}
                className="rounded-2xl border border-[#cfc2d6]/20 bg-white p-3"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      ["bg-[#8127cf]", "bg-[#b06bea]", "bg-teal-500", "bg-amber-500"][i],
                    )}
                  />
                  <p className="truncate text-[11px] font-black text-[#1f1a23]">{w.label}</p>
                </div>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-subtle">
                  Created by {w.who}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={cfg[w.key]}
                    onChange={(e) => set(w.key, Number(e.target.value))}
                    className={cn(inputClass, "h-9 text-center")}
                  />
                  <span className="text-xs font-black text-ink-subtle">%</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 pl-0.5 text-[10px] font-semibold leading-snug text-ink-subtle">
            Set a type to 0% and it stops counting towards the report card — useful when a school
            grades on term exams alone.
          </p>
        </div>

        {/* ── Mode ──────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
            Mid-year percentages
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {MODES.map((m) => {
              const on = cfg.weightMode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setCfg((c) => ({ ...c, weightMode: m.key }))}
                  aria-pressed={on}
                  className={cn(
                    "cursor-pointer rounded-2xl border p-3 text-left transition-all",
                    on
                      ? "border-[#8127cf] bg-gradient-to-br from-[#faf5ff] to-white shadow-[0_0_0_1px_rgba(129,39,207,0.3)]"
                      : "border-[#cfc2d6]/25 bg-white hover:border-[#8127cf]/35",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {on ? <Check className="h-3.5 w-3.5 shrink-0 text-[#8127cf]" /> : null}
                    <span className="text-xs font-black text-[#1f1a23]">{m.label}</span>
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold leading-snug text-ink-muted">
                    {m.help}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Grade boundaries ──────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
              Grade boundaries
            </p>
            {ladderBroken ? (
              <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-600">
                Each grade must start below the one above
              </span>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setCfg((c) => ({
                  ...c,
                  gradeAplus: 90,
                  gradeA: 80,
                  gradeB: 70,
                  gradeC: 60,
                  gradeD: 50,
                }))
              }
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-lg bg-[#f6f2fa] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:bg-[#f3eeff] hover:text-[#8127cf]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-5">
            {GRADES.map((g) => (
              <Field key={String(g.key)} label={`Grade ${g.label} from`}>
                <div className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
                      g.tone,
                    )}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={cfg[g.key] as number}
                    onChange={(e) => set(g.key, Number(e.target.value))}
                    className={cn(inputClass, "pl-7 text-center")}
                  />
                </div>
              </Field>
            ))}
          </div>

          {/* The ladder, drawn. */}
          <div className="mt-3 flex h-7 overflow-hidden rounded-xl">
            {GRADES.map((g, i) => {
              const from = cfg[g.key] as number;
              const to = i === 0 ? 100 : (cfg[GRADES[i - 1].key] as number);
              const width = Math.max(0, to - from);
              return (
                <span
                  key={String(g.key)}
                  title={`${g.label}: ${from}–${to}%`}
                  className={cn(
                    "flex items-center justify-center text-[9px] font-black text-white transition-[width] duration-500",
                    g.tone,
                  )}
                  style={{ width: `${width}%` }}
                >
                  {width > 6 ? g.label : ""}
                </span>
              );
            })}
            <span
              title={`Below ${cfg.gradeD}% — fail`}
              className="flex items-center justify-center bg-rose-500 text-[9px] font-black text-white"
              style={{ width: `${Math.max(0, cfg.gradeD)}%` }}
            >
              {cfg.gradeD > 6 ? "F" : ""}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
