"use client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { InputGroup } from "@/components/ui/input-group";
import { Tooltip } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";


import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  ChevronRight,
  RotateCcw,
  Scale,
  Sparkles,
  Users,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { BrandButton } from "@/components/role-dashboard";
import { Field, Panel, StepEmpty, inputClass } from "@/components/academic/exams/shared";
import { Input as SystemInput } from "@/components/ui/input";
import { UiText, useUiText } from "@/components/locale/LocaleProvider";

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
  missingMarkPolicy: "COUNT_AS_ZERO" | "EXCLUDE" | "BLOCK";
  absentMarkPolicy: "COUNT_AS_ZERO" | "EXCLUDE" | "BLOCK";
  exemptMarkPolicy: "COUNT_AS_ZERO" | "EXCLUDE" | "BLOCK";
  roundingRule: "WHOLE" | "ONE_DECIMAL" | "TWO_DECIMALS";
}

interface ClassGroup {
  className: string;
  sections: { id: string; section: string | null; students: number; hasConfig: boolean }[];
  config: Config;
  drifted: boolean;
  configured: boolean;
  /** SKAI-152: the save this editor opened from; a later save by someone else is refused. */
  version?: string | null;
  students: number;
  subjects: number;
}

interface WeightImpact {
  students: number;
  changed: number;
  gradeChanged: number;
  newlyFailing: number;
  newlyPassing: number;
  largestShift: number;
  skipped: number;
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

/** Host-driven save (§4.4 "Save (sticky, per tab)"): a new nonce runs once. */
export type GradingRulesCommand = { id: "save"; nonce: number };

/** `hideHeading`: the hosting page's PageHeader (and its tabs) already name this view, so the hero is dropped
 *  and only its one-line explanation stays (§4.3).
 *
 *  Host-owned Save (§4.4): rules are edited one class at a time in a dialog, and a dialog always keeps its own
 *  Save (R2), so there is nothing on the page itself to hide. `onDirtyChange(dirty, saving)` reports the open
 *  class editor's unsaved changes (`(false, false)` when it closes), so a sticky per-tab Save and a leave guard can
 *  account for them; `command {id:"save"}` saves that editor when its rules are valid (nothing happens when no
 *  editor is open or the weights/boundaries are invalid — the dialog shows why). */
export function GradingRulesPanel({ campusId, hideHeading = false, command, onDirtyChange }: {
  campusId?: string;
  hideHeading?: boolean;
  command?: GradingRulesCommand;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
}) {
  const ui = useUiText();
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // R4: a load failure is an inline ErrorState with retry, never a toast over an empty screen.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClassGroup | null>(null);
  const academicYear = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sp = new URLSearchParams({ scope: "all", academicYear: String(academicYear) });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/grade-config?${sp}`, { cache: "no-store" }).then((r) => r.json());
      if (!res.success) throw new Error(typeof res.error === "string" ? res.error : "");
      setGroups(res.data as ClassGroup[]);
    } catch (e) {
      setLoadError(friendlyErrorMessage(e, ui("Check your connection and try again.")));
    } finally {
      setLoading(false);
    }
  }, [campusId, academicYear, ui]);

  useEffect(() => {
    load();
  }, [load]);

  const unset = groups.filter((g) => !g.configured).length;
  const drifted = groups.filter((g) => g.drifted).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-[20px] bg-border-subtle/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return <ErrorState title={ui("Grading rules could not be loaded")} description={loadError} onRetry={() => void load()} />;
  }

  if (groups.length === 0) {
    return (
      <StepEmpty
        icon={Scale}
        title="No classes for this year"
        body={ui("Grading rules are set per class for {0}. Create classes first and each one appears here with its own pass mark and grade boundaries.", [academicYear])}
      />
    );
  }

  return (
    <div className="sk-rise space-y-4">
      {hideHeading ? (
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          {ui("What counts as a pass, how each exam type is weighted, and where the grade boundaries fall. Set per class — every section of that class gets the same rules.")}
        </p>
      ) : (
      <header className="relative overflow-hidden rounded-[28px] border border-edge/25 bg-gradient-to-br from-ink-strong via-brand-900 to-brand-800 px-6 py-5 text-white shadow-xl">
        <span
          aria-hidden
          className="pointer-events-none absolute -end-14 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12">
            <Scale className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold text-white/60">
              {ui("Assess")} · <bdi>{academicYear}</bdi>
            </p>
            <h2 className="mt-0.5 text-2xl font-bold tracking-tight">{ui("Grading & passing rules")}</h2>
            <p className="mt-1 text-sm font-normal leading-relaxed text-white/70">
              {ui("What counts as a pass, how each exam type is weighted, and where the grade boundaries fall. Set per class — every section of that class gets the same rules.")}
            </p>
          </div>
        </div>
      </header>
      )}

      {drifted > 0 ? (
        <Alert tone="warning" compact live="off">
          <p className="min-w-0 text-sm leading-relaxed">
            {drifted === 1
              ? ui("1 class has sections with different rules — two children in the same year passing at different marks. Open the class and save once to bring every section back into line.")
              : ui("{0} classes have sections with different rules — two children in the same year passing at different marks. Open the class and save once to bring every section back into line.", [drifted])}
          </p>
        </Alert>
      ) : null}

      {unset > 0 ? (
        <Alert tone="brand" compact live="off" icon={Sparkles}>
          <p className="min-w-0 text-sm leading-relaxed">
            {unset === 1
              ? ui("1 class is still on the default rules — a 50% pass mark and a 10 / 20 / 30 / 40 weighting. That is a working default, not a decision anyone made.")
              : ui("{0} classes are still on the default rules — a 50% pass mark and a 10 / 20 / 30 / 40 weighting. That is a working default, not a decision anyone made.", [unset])}
          </p>
        </Alert>
      ) : null}

      <Panel
        title={ui("Classes")}
        subtitle={`${groups.length === 1 ? ui("1 class") : ui("{0} classes", [groups.length])} · ${ui("rules apply to every section")}`}
        icon={Award}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-edge/12">
          {groups.map((group) => (
            <li key={group.className}>
              <Button variant="secondary"
                type="button"
                onClick={() => setEditing(group)}
                className="justify-start group flex w-full flex-wrap items-center gap-3 px-5 py-3 text-start"
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                    group.drifted
                      ? "bg-status-warning-surface text-status-warning-text"
                      : group.configured
                      ? "bg-status-success-surface text-status-success-text"
                      : "bg-muted text-ink-subtle",
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
                    <bdi className="text-sm font-bold text-ink-strong">{group.className}</bdi>
                    <span className="flex items-center gap-1 text-2xs font-bold text-ink-subtle">
                      <Users className="h-3 w-3" aria-hidden="true" />
                      <bdi>{group.students}</bdi>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {group.sections.map((s) => (
                        <Badge key={s.id} variant="secondary" size="sm">
                          {s.section ?? "—"}
                        </Badge>
                      ))}
                    </span>
                    {group.drifted ? (
                      <Badge variant="warning" size="sm" dot>
                        {ui("Sections disagree")}
                      </Badge>
                    ) : !group.configured ? (
                      <Badge variant="neutral" size="sm">
                        {ui("Default")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-2xs font-bold text-ink-subtle">
                    {ui("Pass at {0}% · A+ from {1}% · Mid {2}% / Final {3}% / Tests {4}% / Quiz {5}%", [group.config.passingPercentage, group.config.gradeAplus, group.config.midTermWeight, group.config.finalWeight, group.config.classTestWeight, group.config.quizWeight])}
                  </span>
                </span>

                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:text-primary rtl:rotate-180" />
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      {editing ? (
        <RulesEditor
          group={editing}
          academicYear={academicYear}
          campusId={campusId}
          command={command}
          onDirtyChange={onDirtyChange}
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
  command,
  onDirtyChange,
  onClose,
  onSaved,
}: {
  group: ClassGroup;
  academicYear: number;
  campusId?: string;
  command?: GradingRulesCommand;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useUiText();
  const [cfg, setCfg] = useState<Config>(group.config);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<{ cfg: string; result: WeightImpact } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [stale, setStale] = useState(false);

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

  const payload = (extra: Record<string, unknown>) => JSON.stringify({
    campusId,
    className: group.className,
    academicYear,
    ...cfg,
    ...extra,
  });

  // SKAI-152: show what the proposed weights do to results already marked, before saving.
  const preview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/grade-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload({ preview: true }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "");
      setImpact({ cfg: JSON.stringify(cfg), result: json.preview });
    } catch (e) {
      toast.error(friendlyErrorMessage(e, tr("Could not preview the effect of these rules. Try again.")));
    } finally {
      setPreviewing(false);
    }
  };
  const impactCurrent = impact && impact.cfg === JSON.stringify(cfg) ? impact.result : null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/grade-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload({ expectedVersion: group.version ?? null }),
      });
      const json = await res.json();
      if (res.status === 409 && json.code === "STALE_VERSION") {
        setStale(true);
        return;
      }
      if (!res.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "");
      toast.success(
        json.sectionsUpdated === 1
          ? tr("Grading rules saved for {0} (1 section)", [group.className])
          : tr("Grading rules saved for {0} ({1} sections)", [group.className, json.sectionsUpdated]),
      );
      onSaved();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, tr("Could not save the grading rules. Try again.")));
    } finally {
      setSaving(false);
    }
  };

  const roundedTotal = Math.round(total * 100) / 100;
  const blockedReason = stale
    ? tr("Someone else changed these rules. Close and reopen to load the latest version.")
    : Math.abs(roundedTotal - 100) > 0.01
    ? tr("The weights add up to {0}% — they must add up to 100%.", [roundedTotal])
    : ladderBroken
    ? tr("Each grade must start below the one above it.")
    : null;

  // Host-owned Save (§4.4): report this editor's state while it is open, and clear it when it closes.
  const dirtyListener = useRef(onDirtyChange);
  useEffect(() => { dirtyListener.current = onDirtyChange; });
  useEffect(() => { dirtyListener.current?.(dirty, saving); }, [dirty, saving]);
  // Reads the latest listener at unmount (kept current by the effect above).
  useEffect(() => () => dirtyListener.current?.(false, false), []);
  // Seeded with the command present when the editor opened, so only a later Save runs here.
  const handledCommand = useRef<number | null>(command?.nonce ?? null);
  useEffect(() => {
    if (!command || handledCommand.current === command.nonce) return;
    handledCommand.current = command.nonce;
    if (command.id === "save" && dirty && !saving && !blockedReason) void save();
    // Only a new nonce runs a command; it reads the rules on screen at that moment.
  }, [command?.nonce]);

  return (
    <Modal
      title={group.className}
      eyebrow="Grading rules"
      subtitle={tr(group.sections.length === 1 ? "Applies to 1 section ({0}) and {1} students." : "Applies to {2} sections ({0}) and {1} students.", [group.sections.map((s) => s.section ?? "—").join(", "), group.students, group.sections.length])}
      icon={Scale}
      tone="violet"
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel={tr("Saving…")}
          actionLabel={group.sections.length === 1 ? tr("Save for this section") : tr("Save for all {0} sections", [group.sections.length])}
          onCancel={onClose}
          onAction={save}
          blockedReason={blockedReason}
        />
      }
    >
      <div className="space-y-5">
        {/* ── Pass mark ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge/20 bg-gradient-to-r from-brand-50 to-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink-strong">{tr("Pass mark")}</p>
              <p className="mt-0.5 text-xs font-normal leading-snug text-ink-muted">
                {tr("A student below this in the weighted total does not pass the year. This is the single number parents ask about.")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={cfg.passingPercentage}
                onChange={(e) => set("passingPercentage", Number(e.target.value))}
                aria-label={tr("Pass mark")}
                className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-border-subtle accent-primary"
              />
              <SystemInput
                type="number"
                min={0}
                max={100}
                value={cfg.passingPercentage}
                onChange={(e) => set("passingPercentage", Number(e.target.value))}
                aria-label={tr("Pass mark (%)")}
                className={cn(inputClass, "w-20 text-center")}
              />
              <span className="text-sm font-bold text-primary">%</span>
            </div>
          </div>
        </div>

        {/* ── Weights ───────────────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="ps-0.5 text-xs font-semibold text-ink-muted">
              {tr("How each exam type is weighted")}
            </p>
            <span
              className={cn(
                "rounded-lg px-2 py-0.5 text-2xs font-bold tabular-nums",
                Math.abs(roundedTotal - 100) <= 0.01
                  ? "bg-status-success-surface text-status-success-text"
                  : "bg-status-error-surface text-status-error-text",
              )}
            >
              {tr("{0}% of 100", [roundedTotal])}
            </span>
            <div className="ms-auto flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Tooltip key={p.name} content={tr(p.blurb)}>
                  <Button variant="secondary"
                    type="button"
                    onClick={() => setCfg((c) => ({ ...c, ...p.values }))}
                    className="px-2.5 py-1"
                  >
                    {tr(p.name)}
                  </Button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* One stacked bar makes the split legible without reading four numbers. */}
          <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-border-subtle/60">
            {WEIGHTS.map((w, i) => (
              <span
                key={w.key}
                aria-hidden="true"
                className={cn(
                  "h-full transition-[width] duration-500",
                  ["bg-primary", "bg-brand-300", "bg-teal-500", "bg-amber-500"][i],
                )}
                style={{ width: `${Math.min(100, cfg[w.key])}%` }}
              />
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {WEIGHTS.map((w, i) => (
              <div
                key={w.key}
                className="sk-panel p-3"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      ["bg-primary", "bg-brand-300", "bg-teal-500", "bg-amber-500"][i],
                    )}
                  />
                  <p className="truncate text-2xs font-bold text-ink-strong">{tr(w.label)}</p>
                </div>
                <p className="mt-0.5 text-2xs font-semibold text-ink-subtle">
                  {tr("Created by {0}", [tr(w.who)])}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <SystemInput
                    type="number"
                    min={0}
                    max={100}
                    value={cfg[w.key]}
                    onChange={(e) => set(w.key, Number(e.target.value))}
                    aria-label={tr("{0} weight (%)", [tr(w.label)])}
                    className={cn(inputClass, "text-center")}
                  />
                  <span className="text-xs font-bold text-ink-subtle">%</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 ps-0.5 text-2xs font-medium leading-snug text-ink-subtle">
            {tr("Set a type to 0% and it stops counting towards the report card — useful when a school grades on term exams alone.")}
          </p>
          {/* SKAI-152: recalculation preview before saving. */}
          <div className="sk-panel mt-3 p-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs font-semibold text-ink-muted">
                {tr("See how these rules change results already marked, before you save.")}
              </p>
              <Button variant="secondary" type="button" onClick={preview} disabled={previewing || !!blockedReason} className="px-2.5 py-1">
                {previewing ? tr("Calculating…") : tr("Preview effect")}
              </Button>
            </div>
            {impactCurrent ? (
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="grade-weight-impact">
                <Badge variant="neutral">{tr("{0} of {1} students change", [impactCurrent.changed, impactCurrent.students])}</Badge>
                <Badge variant="neutral">{tr("{0} change grade", [impactCurrent.gradeChanged])}</Badge>
                <Badge variant={impactCurrent.newlyFailing ? "danger" : "neutral"}>{tr("{0} would now fail", [impactCurrent.newlyFailing])}</Badge>
                <Badge variant={impactCurrent.newlyPassing ? "success" : "neutral"}>{tr("{0} would now pass", [impactCurrent.newlyPassing])}</Badge>
                <Badge variant="neutral">{tr("Largest shift {0} points", [impactCurrent.largestShift])}</Badge>
                {impactCurrent.skipped ? <Badge variant="warning">{tr("{0} could not be calculated", [impactCurrent.skipped])}</Badge> : null}
              </div>
            ) : impact ? (
              <p className="mt-2 text-2xs font-medium text-ink-subtle">{tr("The rules changed since the last preview. Preview again.")}</p>
            ) : null}
          </div>
        </div>

        {/* ── Mode ──────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 ps-0.5 text-xs font-semibold text-ink-muted">
            {tr("Mid-year percentages")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {MODES.map((m) => {
              const on = cfg.weightMode === m.key;
              return (
                <Button variant="choice"
                  key={m.key}
                  type="button"
                  onClick={() => setCfg((c) => ({ ...c, weightMode: m.key }))}
                  aria-pressed={on}
                  className={cn(
                    "block p-3 text-start",
                    "",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {on ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                    <span className="text-xs font-bold text-ink-strong">{tr(m.label)}</span>
                  </span>
                  <span className="mt-1 block text-xs font-normal leading-snug text-ink-muted">
                    {tr(m.help)}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <section className="rounded-2xl border border-edge/20 bg-surface-subtle p-4" aria-labelledby="result-semantics-title">
          <h3 id="result-semantics-title" className="text-xs font-bold text-ink-strong"><UiText>Missing, absent and exempt results</UiText></h3>
          <p className="mt-1 text-2xs leading-snug text-ink-muted"><UiText>A zero is a scored result. These rules keep it distinct from an unentered mark, absence or approved exemption.</UiText></p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ["missingMarkPolicy", "No mark entered", "Used when a student has no mark row for a completed component."],
              ["absentMarkPolicy", "Absent", "Used when the student did not sit the assessment."],
              ["exemptMarkPolicy", "Exempt", "Used for an approved exemption; excluded is the default."],
            ] as const).map(([key, label, help]) => (
              <label key={key} className="space-y-1.5 text-sm font-semibold text-ink">
                <span>{tr(label)}</span>
                <Select
                  value={cfg[key]}
                  onChange={(event) => setCfg((current) => ({ ...current, [key]: event.target.value as Config[typeof key] }))}
                  className="w-full"
                >
                  <option value="COUNT_AS_ZERO">{tr("Count as zero")}</option>
                  <option value="EXCLUDE">{tr("Exclude from the result")}</option>
                  <option value="BLOCK">{tr("Block until resolved")}</option>
                </Select>
                <span className="block text-2xs font-medium">{tr(help)}</span>
              </label>
            ))}
            <label className="space-y-1.5 text-sm font-semibold text-ink">
              <span><UiText>Rounding</UiText></span>
              <Select
                value={cfg.roundingRule}
                onChange={(event) => setCfg((current) => ({ ...current, roundingRule: event.target.value as Config["roundingRule"] }))}
                className="w-full"
              >
                <option value="WHOLE">{tr("Whole percentage (half up)")}</option>
                <option value="ONE_DECIMAL">{tr("One decimal place (half up)")}</option>
                <option value="TWO_DECIMALS">{tr("Two decimal places (half up)")}</option>
              </Select>
              <span className="block text-2xs font-medium"><UiText>For example, 82.5 rounds to 83 with whole percentage.</UiText></span>
            </label>
          </div>
        </section>

        {/* ── Grade boundaries ──────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="ps-0.5 text-xs font-semibold text-ink-muted">
              {tr("Grade boundaries")}
            </p>
            {ladderBroken ? (
              <Alert tone="danger" compact live="polite">
                {tr("Each grade must start below the one above it.")}
              </Alert>
            ) : null}
            <Button variant="secondary"
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
              className="justify-start ms-auto flex items-center gap-1 px-2.5 py-1"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {tr("Reset")}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-5">
            {GRADES.map((g) => (
              <Field key={String(g.key)} label={tr("Grade {0} from", [g.label])}>
                <InputGroup className="relative">
                  <span data-field-affix="start"
                    aria-hidden
                    className={cn(
                      "absolute start-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
                      g.tone,
                    )}
                  />
                  <SystemInput
                    type="number"
                    min={0}
                    max={100}
                    value={cfg[g.key] as number}
                    onChange={(e) => set(g.key, Number(e.target.value))}
                    className={cn(inputClass, "ps-7 text-center")}
                  />
                </InputGroup>
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
                  aria-hidden="true"
                  className={cn(
                    "flex items-center justify-center text-2xs font-bold text-white transition-[width] duration-500",
                    g.tone,
                  )}
                  style={{ width: `${width}%` }}
                >
                  {width > 6 ? g.label : ""}
                </span>
              );
            })}
            <span
              aria-hidden="true"
              className="flex items-center justify-center bg-status-error-text text-2xs font-bold text-white"
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
