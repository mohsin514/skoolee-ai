"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { InfoTip } from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Check, ChevronRight, CircleHelp, Copy, Plus, Save, Scale, Trash2 } from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { UiText, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { currentCycle } from "@/lib/academic/cycle-rules";
import { cn } from "@/lib/utils";
import { DEFAULT_ACADEMIC_MODEL, type AcademicModelConfiguration, type ResultPolicy, type RoundingRule } from "@/lib/academic/model-config";

type SchoolSubject = { id: string; name: string; totalMarks: number };
type ClassSection = { id: string; name: string; section: string | null; academicYear: number; subjects: SchoolSubject[] };
type ModelVersion = {
  id: string; title: string; cohortLabel: string; cohortKey: string; academicYear: number; version: number; status: string;
  effectiveFrom: string; effectiveTo: string | null; configuration: AcademicModelConfiguration; templateSourceId: string | null;
  delegatedOverrideKeys: string[]; localOverrideKeys: string[]; isSharedTemplate: boolean; updatedAt?: string;
};
type YearBounds = { label: string; status: string; startDate: string | null; endDate: string | null };
type Preview = {
  success: boolean; problems: { code: string; message: string; repairHref: string; template?: string; params?: string[] }[]; changedSections: string[];
  simulation: { blocked: boolean; components: { label: string; contribution: number; message: string }[]; overallPercentage: number; overallGrade: string; passed: boolean };
  impact: { students: number; exams: number; publishedReports: number; pendingReports: number };
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const keyFor = (value: string) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const dateValue = (value: string | Date | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : "";

function newTerm(index: number) {
  return { id: `term-${Date.now()}-${index}`, label: `Term ${index + 1}`, startDate: "", endDate: "", teachingWeeks: 16, reportingPeriod: true };
}

function initialConfiguration(): AcademicModelConfiguration {
  const config = clone(DEFAULT_ACADEMIC_MODEL);
  config.terms = [newTerm(0), newTerm(1)];
  return config;
}

function mappingsForClasses(classes: ClassSection[]) {
  const byName = new Map<string, { code: string; label: string; subjectIds: string[] }>();
  for (const cls of classes) for (const subject of cls.subjects) {
    const norm = subject.name.trim().toLocaleLowerCase();
    const current = byName.get(norm) ?? { code: keyFor(subject.name), label: subject.name, subjectIds: [] };
    current.subjectIds.push(subject.id);
    byName.set(norm, current);
  }
  return [...byName.values()];
}

function cloneTemplateConfiguration(template: ModelVersion, classes: ClassSection[]): AcademicModelConfiguration {
  const config = clone(template.configuration);
  config.classIds = classes.map((item) => item.id);
  const localByName = new Map<string, string[]>();
  for (const cls of classes) for (const subject of cls.subjects) {
    const key = subject.name.trim().toLocaleLowerCase();
    localByName.set(key, [...(localByName.get(key) ?? []), subject.id]);
  }
  const seen = new Set<string>();
  const mappings = config.subjectMappings.map((mapping) => {
    const key = mapping.label.trim().toLocaleLowerCase();
    const ids = localByName.get(key) ?? [];
    seen.add(key);
    return { ...mapping, subjectIds: ids };
  });
  for (const [key, subjectIds] of localByName) if (!seen.has(key)) {
    const name = classes.flatMap((item) => item.subjects).find((subject) => subject.id === subjectIds[0])?.name ?? key;
    mappings.push({ code: keyFor(name), label: name, subjectIds });
  }
  config.subjectMappings = mappings;
  config.terms = config.terms.map((term, index) => ({ ...term, id: `${term.id}-${Date.now()}-${index}` }));
  return config;
}

export interface AcademicModelPanelProps {
  campusId?: string;
  /** The group's curriculum templates (group console Group standards). */
  templatesOnly?: boolean;
  /**
   * §4.3: the hosting page's PageHeader already names the view, so `hideHeading` swaps the dark hero for a
   * compact toolbar (description + academic year). Each change of `requestCreate` starts a new draft (a new
   * template version when `templatesOnly`) and moves focus to its title — the host's "New template version"
   * primary action (§4.4, P4).
   */
  hideHeading?: boolean;
  requestCreate?: number;
  /**
   * Host-owned header (§4.4b "Curriculum & grading": **Save** primary, Change history secondary): `hideActions`
   * drops the in-panel "Save new draft" and "Approve" buttons; the host's PageHeader shows the one primary the
   * workflow needs next (`onActionState().next`: save the edits as a draft, or approve the clean draft) and runs
   * it through `command` (a new nonce runs once). `history` scrolls to the version list (the model's change history).
   */
  hideActions?: boolean;
  command?: AcademicModelCommand;
  onActionState?: (state: AcademicModelActionState) => void;
  /**
   * Sticky per-tab Save (§4.4, admin Campus setup): `hideSave` drops only "Save new draft" (Approve stays in the
   * panel); the host's Save sends `command {id:"save"}`. `onDirtyChange(dirty, saving)` reports unsaved edits and a
   * running save (`(false, false)` on unmount) — the same contract as YearSetupWizard and GradingRulesPanel.
   */
  hideSave?: boolean;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
}

export type AcademicModelCommand = { id: "save" | "approve" | "history"; nonce: number };
export type AcademicModelActionState = {
  next: "save" | "approve";
  canSave: boolean; saveReason: string | null;
  canApprove: boolean; approveReason: string | null;
  busy: boolean; dirty: boolean;
};

const VERSION_TITLE_ID = "academic-model-version-title";
const VERSIONS_ID = "academic-model-versions";
/** Version statuses as translated words (R7: never a raw enum on screen). */
const VERSION_STATUS: Record<string, string> = { DRAFT: "Draft", ACTIVE: "Active", TEMPLATE: "Approved", APPROVED: "Approved", RETIRED: "Retired", SUPERSEDED: "Replaced", ARCHIVED: "Archived" };

export function AcademicModelPanel({ campusId, templatesOnly = false, hideHeading = false, requestCreate, hideActions = false, command, onActionState, hideSave = false, onDirtyChange }: AcademicModelPanelProps) {
  const tr = useUiText();
  const { date: formatDay } = useLocaleFormat();
  const [yearBounds, setYearBounds] = useState<YearBounds | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [templates, setTemplates] = useState<ModelVersion[]>([]);
  const [cohort, setCohort] = useState("");
  const [sourceTemplateId, setSourceTemplateId] = useState("");
  const [selected, setSelected] = useState<ModelVersion | null>(null);
  const [configuration, setConfiguration] = useState<AcademicModelConfiguration>(initialConfiguration);
  const [title, setTitle] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [delegatedOverrideKeys, setDelegatedOverrideKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [simulation, setSimulation] = useState<Preview["simulation"] | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ClassSection[]>();
    for (const cls of classes) map.set(cls.name, [...(map.get(cls.name) ?? []), cls]);
    return [...map.entries()].map(([name, sections]) => ({ name, sections }));
  }, [classes]);
  const selectedClasses = useMemo(() => groups.find((group) => group.name === cohort)?.sections ?? [], [groups, cohort]);
  const classIds = useMemo(() => selectedClasses.map((cls) => cls.id), [selectedClasses]);
  const availableSubjects = useMemo(() => selectedClasses.flatMap((cls) => cls.subjects.map((subject) => ({ ...subject, section: cls.section, classId: cls.id, className: cls.name }))), [selectedClasses]);
  const candidateVersions = useMemo(() => {
    if (templatesOnly) return versions;
    return versions.filter((version) => version.cohortKey === keyFor(cohort));
  }, [cohort, templatesOnly, versions]);
  const dirty = selected ? JSON.stringify(selected.configuration) !== JSON.stringify(configuration) || selected.title !== title || dateValue(selected.effectiveFrom) !== effectiveFrom || dateValue(selected.effectiveTo) !== effectiveTo : false;
  // SKAI-117: the period running today (or the next one) is marked so the office sees which cycle is live.
  const inSession = useMemo(() => currentCycle(configuration.terms, new Date().toISOString().slice(0, 10)), [configuration.terms]);
  const selectedTemplate = templates.find((template) => template.id === sourceTemplateId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = templatesOnly ? "templates=1" : new URLSearchParams({ academicYear: String(year), ...(campusId ? { campusId } : {}) }).toString();
      const response = await fetch(`/api/academic-models?${params}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || tr("Could not load academic models"));
      setClasses(json.classes ?? []);
      setYearBounds(templatesOnly ? null : json.year ?? null);
      setVersions(templatesOnly ? json.templates ?? [] : json.versions ?? []);
      setTemplates(templatesOnly ? json.templates ?? [] : json.templates ?? []);
      if (!templatesOnly && !cohort && json.classes?.length) setCohort(json.classes[0].name);
    } catch (error) {
      // R4: inline ErrorState with retry instead of a toast over an empty editor.
      setLoadError(friendlyErrorMessage(error, tr("Could not load academic models")));
    } finally {
      setLoading(false);
    }
  }, [campusId, cohort, templatesOnly, tr, year]);

  useEffect(() => { void load(); }, [load]);

  const resetDraft = (selectedCohort = cohort) => {
    const group = groups.find((item) => item.name === selectedCohort);
    setSelected(null);
    setSourceTemplateId("");
    setPreview(null);
    setSimulation(null);
    setConfiguration({ ...initialConfiguration(), classIds: group?.sections.map((section) => section.id) ?? [], subjectMappings: mappingsForClasses(group?.sections ?? []) });
    setTitle(templatesOnly ? tr("Group academic template") : selectedCohort ? `${selectedCohort} · ${year}` : "");
    // SKAI-117: a new version starts and ends with the dated academic year by default.
    setEffectiveFrom(dateValue(yearBounds?.startDate) || `${year}-01-01`);
    setEffectiveTo(dateValue(yearBounds?.endDate));
    setDelegatedOverrideKeys([]);
  };

  const chooseCohort = (name: string) => {
    setCohort(name);
    resetDraft(name);
  };

  // Host-owned "New template version" / "New draft": only a change of the counter fires.
  const lastCreate = useRef(requestCreate);
  const [focusTitle, setFocusTitle] = useState(0);
  useEffect(() => {
    if (requestCreate === undefined || requestCreate === lastCreate.current) return;
    lastCreate.current = requestCreate;
    resetDraft();
    setFocusTitle((n) => n + 1);
    // resetDraft reads the latest cohort/year from this render; the counter is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestCreate]);
  useEffect(() => {
    if (!focusTitle) return;
    const field = document.getElementById(VERSION_TITLE_ID);
    field?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    (field as HTMLInputElement | null)?.focus({ preventScroll: true });
  }, [focusTitle]);

  const chooseVersion = (version: ModelVersion) => {
    setSelected(version);
    setSourceTemplateId(version.templateSourceId ?? "");
    setConfiguration(clone(version.configuration));
    setTitle(version.title);
    setEffectiveFrom(dateValue(version.effectiveFrom));
    setEffectiveTo(dateValue(version.effectiveTo));
    setDelegatedOverrideKeys(version.delegatedOverrideKeys ?? []);
    setPreview(null);
    setSimulation(null);
  };

  const addFromTemplate = (templateId: string) => {
    setSourceTemplateId(templateId);
    setPreview(null);
    const template = templates.find((item) => item.id === templateId);
    if (template && !templatesOnly) {
      setConfiguration(cloneTemplateConfiguration(template, selectedClasses));
      setTitle(`${selectedClasses[0]?.name ?? tr("Cohort")} · ${year}`);
      setEffectiveFrom(`${year}-01-01`);
      setEffectiveTo("");
      setSelected(null);
    }
  };

  const updateConfiguration = <K extends keyof AcademicModelConfiguration>(key: K, value: AcademicModelConfiguration[K]) => setConfiguration((current) => ({ ...current, [key]: value }));
  const updateGrading = (key: keyof AcademicModelConfiguration["grading"], value: number | string) => setConfiguration((current) => ({ ...current, grading: { ...current.grading, [key]: value } as AcademicModelConfiguration["grading"] }));
  const updateProgression = (key: keyof AcademicModelConfiguration["progression"], value: number | boolean) => setConfiguration((current) => ({ ...current, progression: { ...current.progression, [key]: value } }));
  const updateTerm = (index: number, key: keyof AcademicModelConfiguration["terms"][number], value: string | number | boolean) => setConfiguration((current) => ({ ...current, terms: current.terms.map((term, i) => i === index ? { ...term, [key]: value } : term) }));

  const component = (key: "quizWeight" | "classTestWeight" | "midTermWeight" | "finalWeight", label: string) => (
    <label className="space-y-1.5 text-xs font-semibold text-ink-muted" key={key}>
      <span className="inline-flex items-center gap-1">{tr(label)}<InfoTip content={tr("Weights must total 100.")} /></span>
      <div className="flex items-center gap-2"><Input aria-label={tr(label)} type="number" min={0} max={100} step="0.1" value={configuration.grading[key]} onChange={(event) => updateGrading(key, Number(event.target.value))} className="w-full min-w-0" /><span>%</span></div>
    </label>
  );

  const saveDraft = async () => {
    setSaving(true);
    try {
      const action = templatesOnly ? "create-template" : "create";
      const response = await fetch("/api/academic-models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, campusId, academicYear: year, title, effectiveFrom, effectiveTo: effectiveTo || null, configuration: templatesOnly ? { ...configuration, classIds: [] } : { ...configuration, classIds }, sourceVersionId: templatesOnly && sourceTemplateId ? sourceTemplateId : undefined, templateSourceId: !templatesOnly && sourceTemplateId ? sourceTemplateId : undefined, delegatedOverrideKeys }) });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || json.error?.message || json.error || tr("Could not save the draft"));
      toast.success(tr("Draft saved as version {0}", [json.model.version]));
      await load();
      chooseVersion(json.model as ModelVersion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save the draft"));
    } finally {
      setSaving(false);
    }
  };

  const requestPreview = async (action: "preview" | "simulate" = "preview") => {
    if (!selected) { toast.error(tr("Save a draft version before you preview or approve it.")); return; }
    setPreviewBusy(true);
    setPreview(null);
    try {
      const response = await fetch(`/api/academic-models/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, campusId }) });
      const json = await response.json();
      if (action === "simulate") {
        if (!response.ok && !json.simulation) throw new Error(json.error || tr("Could not run the sample calculation"));
        setSimulation(json.simulation);
        return;
      }
      setPreview(json as Preview);
      if (json.success) toast.success(tr("Impact and configuration checks are ready"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not prepare the review"));
    } finally {
      setPreviewBusy(false);
    }
  };

  const approve = async () => {
    if (!selected || !preview?.success || dirty) return;
    setSaving(true);
    try {
      const action = templatesOnly ? "approve-template" : "activate";
      const response = await fetch(`/api/academic-models/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, campusId, expectedUpdatedAt: selected.updatedAt }) });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPreview(json as Preview);
        throw new Error(json.error || json.problems?.[0]?.message || tr("This version needs a repair before approval"));
      }
      toast.success(templatesOnly ? tr("Template approved for campus adoption") : tr("Version {0} approved and effective", [json.model.version]));
      await load();
      chooseVersion(json.model as ModelVersion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not approve this version"));
    } finally {
      setSaving(false);
    }
  };

  const cloneActive = () => {
    if (!selected || selected.status !== "ACTIVE") return;
    setSelected(null);
    setSourceTemplateId("");
    setTitle(`${selected.cohortLabel} · ${year} · ${tr("New version")}`);
    setPreview(null);
  };

  // Header-driven save/approve/history (each nonce runs once) and the state the header needs to show them.
  const canSave = !saving && Boolean(title.trim()) && (templatesOnly || Boolean(cohort));
  const saveReason = title.trim() ? (templatesOnly || cohort ? null : "Choose a cohort first.") : "Give this version a title first.";
  const canApprove = !saving && Boolean(selected) && Boolean(preview?.success) && !dirty && selected?.status === "DRAFT";
  const approveReason = !preview ? "Review the impact before you approve this version." : !preview.success ? "Fix the problems the review found first." : null;
  const next: AcademicModelActionState["next"] = selected?.status === "DRAFT" && !dirty ? "approve" : "save";
  const actionKey = `${next}:${canSave}:${saveReason ?? ""}:${canApprove}:${approveReason ?? ""}:${saving || previewBusy}:${dirty}`;
  useEffect(() => {
    onActionState?.({ next, canSave, saveReason, canApprove, approveReason, busy: saving || previewBusy, dirty });
    // actionKey captures every input; the callback identity may change on each host render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionKey]);
  const dirtyListener = useRef(onDirtyChange);
  useEffect(() => { dirtyListener.current = onDirtyChange; });
  // A new version that has never been saved (no `selected`) counts as unsaved once it could be saved.
  const unsaved = dirty || (!selected && canSave);
  useEffect(() => { dirtyListener.current?.(unsaved, saving); }, [unsaved, saving]);
  // Reads the latest listener at unmount (kept current by the effect above).
  useEffect(() => () => dirtyListener.current?.(false, false), []);
  const handledCommand = useRef<number | null>(command?.nonce ?? null); // seeded: a remount never replays the last command
  useEffect(() => {
    if (!command || handledCommand.current === command.nonce) return;
    handledCommand.current = command.nonce;
    if (command.id === "history") {
      const list = document.getElementById(VERSIONS_ID);
      list?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      list?.focus({ preventScroll: true });
    } else if (command.id === "save" && canSave) void saveDraft();
    else if (command.id === "approve" && canApprove) void approve();
    // Only a new nonce runs a command.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce]);

  if (loading) return <div className="space-y-4" aria-busy="true"><div className="h-24 animate-pulse rounded-3xl bg-muted"/><div className="h-72 animate-pulse rounded-3xl bg-muted"/></div>;
  if (loadError && !classes.length && !versions.length) return <ErrorState title={tr("Could not load academic models")} description={loadError} onRetry={() => void load()} />;

  return (
    <div className="space-y-5" aria-live="polite">
      {hideHeading ? (
        <div className="sk-panel flex flex-wrap items-end justify-between gap-3 p-4">
          <p className="min-w-0 max-w-3xl flex-1 text-sm leading-relaxed text-ink-muted">{templatesOnly ? <UiText>Approve a version once for your school group, then let each campus adopt only the rules you delegate.</UiText> : <UiText>Set one version for a cohort and reporting period. Published reports keep their original grading snapshot.</UiText>}</p>
          {!templatesOnly ? <FormField name="academic-model-year" label={tr("Academic year")}><Input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-28" /></FormField> : null}
        </div>
      ) : (
      // A calm section header on card tokens (R10: no dark hero inside the page card).
      <header className="sk-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-status-brand-surface text-status-brand-text"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink-muted">{templatesOnly ? <UiText>School group</UiText> : <UiText>Academic setup</UiText>} · {templatesOnly ? <UiText>Shared rules</UiText> : <bdi>{year}</bdi>}</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-ink-strong">{templatesOnly ? <UiText>Curriculum templates</UiText> : <UiText>Curriculum, grading &amp; terms</UiText>}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{templatesOnly ? <UiText>Approve a version once for your school group, then let each campus adopt only the rules you delegate.</UiText> : <UiText>Set one version for a cohort and reporting period. Published reports keep their original grading snapshot.</UiText>}</p>
            </div>
            {!templatesOnly ? <FormField name="academic-model-year" label={tr("Academic year")}><Input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-28" /></FormField> : null}
          </div>
        </header>
      )}

      {templatesOnly ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {versions.map((version) => <Button aria-pressed={selected?.id === version.id} variant="choice" key={version.id} type="button" onClick={() => chooseVersion(version)} className={"justify-start " + (cn("p-4 text-start", ""))}><span className="flex items-center justify-between gap-3"><span className="font-bold text-ink-strong">{version.title}</span><span className="rounded-lg bg-muted px-2 py-1 text-2xs font-semibold text-ink-subtle">{version.status === "TEMPLATE" ? <UiText>Approved</UiText> : <UiText>Draft</UiText>} · <bdi>v{version.version}</bdi></span></span><span className="mt-1 block text-xs text-ink-muted">{version.delegatedOverrideKeys.length ? tr("Delegated local changes: {0}", [version.delegatedOverrideKeys.length]) : <UiText>No local changes delegated</UiText>}{version.delegatedOverrideKeys.length ? ` · ${version.delegatedOverrideKeys.join(", ")}` : ""}</span></Button>)}
          {/* When the page header owns "New template version" (requestCreate), no second create tile competes with it. */}
          {requestCreate === undefined ? <Button variant="outline" type="button" onClick={() => resetDraft()} className="flex min-h-24 items-center justify-center gap-2"><Plus aria-hidden="true" className="h-4 w-4"/><UiText>Create a template version</UiText></Button> : null}
          {requestCreate !== undefined && versions.length === 0 ? <div className="sm:col-span-2"><EmptyState size="sm" icon={BookOpen} title={tr("No template versions yet")} description={tr("Use New template version to draft the first one for your school group.")} /></div> : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(14rem,0.7fr)_minmax(0,2fr)]">
          <aside className="space-y-3">
            <section className="sk-panel p-4">
              <label htmlFor="academic-cohort" className="text-xs font-bold text-ink-strong"><UiText>Cohort</UiText></label>
              <Select id="academic-cohort" value={cohort} onChange={(event) => chooseCohort(event.target.value)} className="mt-2 w-full">
                {!groups.length ? <option value=""><UiText>No active classes this year</UiText></option> : null}
                {groups.map((group) => <option key={group.name} value={group.name}>{group.name} · {group.sections.map((section) => section.section || "—").join(", ")}</option>)}
              </Select>
              <p className="mt-2 text-2xs leading-relaxed text-ink-muted"><UiText>All sections with the same class name use the same version. Each section subject is mapped below.</UiText></p>
            </section>
            {templates.length ? <section className="sk-panel p-4"><label htmlFor="academic-template" className="text-xs font-bold text-ink-strong"><UiText>Approved group template</UiText></label><Select id="academic-template" value={sourceTemplateId} onChange={(event) => addFromTemplate(event.target.value)} className="mt-2 w-full"><option value=""><UiText>Start with custom rules</UiText></option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title} · v{template.version}</option>)}</Select>{selectedTemplate ? <p className="mt-2 flex gap-2 text-2xs leading-relaxed text-ink-muted"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success-text"/><span>{tr("Inherited rules from {0}", [selectedTemplate.title])} <bdi>v{selectedTemplate.version}</bdi>. {selectedTemplate.delegatedOverrideKeys.length ? tr("Delegated exceptions: {0}.", [selectedTemplate.delegatedOverrideKeys.join(", ")]) : tr("No delegated exceptions.")}</span></p> : null}</section> : null}
            <section id={VERSIONS_ID} tabIndex={-1} className="sk-panel scroll-mt-4 p-2 outline-none">
              <div className="flex items-center justify-between px-2 py-2"><h3 className="text-xs font-bold text-ink-strong"><UiText>Versions</UiText></h3><span className="text-2xs font-bold text-ink-subtle">{candidateVersions.length}</span></div>
              {candidateVersions.length ? <ul className="space-y-1">{candidateVersions.map((version) => <li key={version.id}><Button aria-pressed={selected?.id === version.id} variant="choice" type="button" onClick={() => chooseVersion(version)} className={"justify-start " + (cn("flex w-full items-center gap-2 px-3 py-2.5 text-start", ""))}><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-ink-strong">{version.title}</span><span className="mt-0.5 block text-2xs font-semibold text-ink-subtle"><bdi>v{version.version}</bdi> · {tr(VERSION_STATUS[version.status] ?? "Draft")} · <bdi>{dateValue(version.effectiveFrom)}</bdi></span></span><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle rtl:rotate-180"/></Button></li>)}</ul> : <p className="px-3 py-4 text-xs text-ink-muted"><UiText>No versions yet. Save a draft to begin.</UiText></p>}
              <Button variant="outline" type="button" onClick={() => resetDraft()} disabled={!cohort} className="mt-2 flex w-full items-center justify-center gap-2 px-3 py-2.5"><Plus aria-hidden="true" className="h-3.5 w-3.5"/><UiText>Start a new draft</UiText></Button>
            </section>
          </aside>
          <div className="space-y-4">
            {!groups.length && !templatesOnly ? <div className="sk-panel border-dashed p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-ink-subtle"/><h3 className="mt-3 font-bold text-ink-strong"><UiText>No active classes this year</UiText></h3><p className="mt-1 text-sm text-ink-muted"><UiText>Create classes before configuring a cohort.</UiText></p></div> : null}
            {(groups.length || templatesOnly) ? <>
              <section className="sk-panel p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-ink-strong"><UiText>Academic model builder</UiText></h3><p className="mt-1 text-xs text-ink-muted"><UiText>Complex rules stay in focused forms, and each field works with a keyboard.</UiText></p></div>{selected?.status === "ACTIVE" ? <Button variant="outline" type="button" onClick={cloneActive} className="justify-start inline-flex items-center gap-2 px-3 py-2"><Copy className="h-3.5 w-3.5"/><UiText>Make a new version</UiText></Button> : null}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Version title</UiText></span><Input id={VERSION_TITLE_ID} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="w-full" /></label>
                  {!templatesOnly ? <><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Effective from</UiText></span><Input aria-describedby="academic-effective-help" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="w-full" /></label><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Effective through (optional)</UiText></span><Input type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} className="w-full" /></label><p id="academic-effective-help" className="text-2xs text-ink-muted sm:col-span-2"><UiText>New versions start on this date. Published reports keep the grading version already captured in their approval snapshot.</UiText></p></> : null}
                </div>
                {!templatesOnly ? <div className="mt-4 flex flex-wrap gap-2">{selectedClasses.map((cls) => <span key={cls.id} className="rounded-lg bg-brand-100 px-2.5 py-1 text-2xs font-bold text-primary">{cls.name} · {cls.section || <UiText>Unsectioned</UiText>}</span>)}</div> : null}
                {templatesOnly ? <div className="mt-5 border-t border-edge/15 pt-4"><h4 className="text-xs font-bold text-ink-strong"><UiText>Delegated campus exceptions</UiText></h4><p className="mt-1 text-2xs text-ink-muted"><UiText>Campuses may only change the sections the group explicitly delegates.</UiText></p><div className="mt-3 grid gap-2 sm:grid-cols-2">{(["terms", "subjectMappings", "grading", "progression", "report"] as const).map((key) => <label key={key} className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2.5 text-xs font-semibold text-ink-strong"><Checkbox  checked={delegatedOverrideKeys.includes(key)} onChange={(event) => setDelegatedOverrideKeys((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} className="" />{tr(key === "subjectMappings" ? "Subject mappings" : key[0].toUpperCase() + key.slice(1))}</label>)}</div></div> : null}
              </section>

              <section id="academic-model-periods" className="sk-panel scroll-mt-6 p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-ink-strong"><UiText>Terms and reporting periods</UiText></h3><p className="mt-1 text-2xs text-ink-muted"><UiText>Periods may not overlap. Teaching weeks are explicit calendar rules.</UiText></p>{yearBounds?.startDate && yearBounds.endDate ? <p className="mt-1 text-2xs font-semibold text-ink-muted">{tr("Every period stays inside {0}: {1} to {2}.", [yearBounds.label, formatDay(yearBounds.startDate), formatDay(yearBounds.endDate)])}</p> : null}</div><Button variant="secondary" type="button" onClick={() => updateConfiguration("terms", [...configuration.terms, newTerm(configuration.terms.length)])} className="justify-start inline-flex items-center gap-1.5 px-3 py-2"><Plus aria-hidden="true" className="h-3.5 w-3.5"/><UiText>Add period</UiText></Button></div>
                {!templatesOnly && (!yearBounds || !yearBounds.startDate || !yearBounds.endDate) ? <Alert tone="warning" live="off" className="mb-3" title={tr("Set the academic year dates first")} actions={<a href="/admin?view=year-cycle" className="text-xs font-bold text-primary underline underline-offset-2"><UiText>Open academic year</UiText></a>}><UiText>Terms can be drafted now, but activation waits until the academic year has start and end dates.</UiText></Alert> : null}
                <div className="space-y-3">{configuration.terms.map((term, index) => <article key={term.id} className="rounded-xl border border-edge/20 bg-surface-subtle/60 p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h4 className="flex flex-wrap items-center gap-2 text-xs font-bold text-ink-strong">{tr("Period {0}", [index + 1])}{inSession?.cycle.id === term.id ? <Badge size="sm" dot variant={inSession.state === "current" ? "success" : "info"}>{tr(inSession.state === "current" ? "In session" : "Starts next")}</Badge> : null}</h4><div className="flex items-center gap-1"><IconButton variant="ghost" size="sm" label={tr("Move period up")} disabled={!index} onClick={() => { const next = [...configuration.terms]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateConfiguration("terms", next); }}><ArrowUp aria-hidden="true" className="h-4 w-4"/></IconButton><IconButton variant="ghost" size="sm" label={tr("Move period down")} disabled={index === configuration.terms.length - 1} onClick={() => { const next = [...configuration.terms]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; updateConfiguration("terms", next); }}><ArrowDown aria-hidden="true" className="h-4 w-4"/></IconButton><IconButton variant="ghost" size="sm" label={tr("Remove period")} disabled={configuration.terms.length < 2} onClick={() => updateConfiguration("terms", configuration.terms.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" className="h-4 w-4"/></IconButton></div></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Period name</UiText></span><Input aria-label={tr("Period name")} value={term.label} onChange={(event) => updateTerm(index, "label", event.target.value)} className="w-full"/></label><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Starts</UiText></span><Input aria-label={tr("Starts") + ` — ${term.label}`} type="date" value={term.startDate} onChange={(event) => updateTerm(index, "startDate", event.target.value)} className="w-full"/></label><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Ends</UiText></span><Input aria-label={tr("Ends") + ` — ${term.label}`} type="date" value={term.endDate} onChange={(event) => updateTerm(index, "endDate", event.target.value)} className="w-full"/></label><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Teaching weeks</UiText></span><Input aria-label={tr("Teaching weeks") + ` — ${term.label}`} type="number" min={1} max={52} value={term.teachingWeeks} onChange={(event) => updateTerm(index, "teachingWeeks", Number(event.target.value))} className="w-full"/></label></div><label className="mt-3 inline-flex items-center gap-2 text-2xs font-semibold text-ink-muted"><Checkbox  checked={term.reportingPeriod} onChange={(event) => updateTerm(index, "reportingPeriod", event.target.checked)} className=""/><UiText>Issue a report for this period</UiText></label></article>)}</div>
              </section>

              {!templatesOnly ? <section id="academic-model-subject-mapping" className="sk-panel scroll-mt-6 p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-ink-strong"><UiText>Curriculum subject map</UiText></h3><p className="mt-1 text-2xs text-ink-muted"><UiText>Every active section subject needs one curriculum code. Matching names across sections share one mapping.</UiText></p></div><Button variant="secondary" type="button" onClick={() => { const subject = availableSubjects.find((item) => !configuration.subjectMappings.some((mapping) => mapping.subjectIds.includes(item.id))); if (subject) updateConfiguration("subjectMappings", [...configuration.subjectMappings, { code: keyFor(subject.name), label: subject.name, subjectIds: [subject.id] }]); }} className="justify-start inline-flex items-center gap-1.5 px-3 py-2"><Plus aria-hidden="true" className="h-3.5 w-3.5"/><UiText>Add mapping</UiText></Button></div><div className="space-y-2">{configuration.subjectMappings.map((mapping, index) => <div key={`${mapping.code}-${index}`} className="grid gap-2 rounded-xl border border-edge/15 p-3 sm:grid-cols-[minmax(5rem,.7fr)_minmax(8rem,1fr)_minmax(0,1.2fr)_auto] sm:items-center"><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Curriculum code</UiText></span><Input aria-label={tr("Curriculum code")} value={mapping.code} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, code: event.target.value } : item))} className="w-full"/></label><label className="space-y-1 text-xs font-semibold text-ink-muted"><span><UiText>Curriculum subject</UiText></span><Input aria-label={tr("Curriculum subject")} value={mapping.label} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className="w-full"/></label><div className="min-w-0"><p className="text-2xs font-bold text-ink-muted"><UiText>Mapped school subjects</UiText></p><p className="mt-1 break-words text-xs text-ink-strong">{availableSubjects.filter((subject) => mapping.subjectIds.includes(subject.id)).map((subject) => `${subject.name}${subject.section ? ` · ${subject.section}` : ""}`).join(", ") || <UiText>None selected</UiText>}</p></div><IconButton variant="ghost" size="sm" label={tr("Remove mapping")} onClick={() => updateConfiguration("subjectMappings", configuration.subjectMappings.filter((_, i) => i !== index))} className="justify-self-end"><Trash2 aria-hidden="true" className="h-4 w-4"/></IconButton></div>)}</div><p className="mt-3 flex items-start gap-2 text-2xs text-ink-muted"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0"/><span><UiText>Activation is blocked until every section subject is mapped exactly once. Use Add mapping to repair missing subjects.</UiText></span></p></section> : <section id="academic-model-subject-mapping" className="sk-panel p-4"><h3 className="text-sm font-bold text-ink-strong"><UiText>Canonical subject names</UiText></h3><p className="mt-1 text-2xs text-ink-muted"><UiText>Campus subject IDs are linked when a campus adopts this template.</UiText></p><div className="mt-3 space-y-2">{configuration.subjectMappings.map((mapping, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(6rem,.7fr)_1fr_auto]"><Input aria-label={tr("Curriculum code")} value={mapping.code} placeholder={tr("Code")} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, code: event.target.value } : item))} className=""/><Input aria-label={tr("Curriculum subject")} value={mapping.label} placeholder={tr("Subject name")} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className=""/><IconButton variant="ghost" size="sm" label={tr("Remove mapping")} onClick={() => updateConfiguration("subjectMappings", configuration.subjectMappings.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" className="h-4 w-4"/></IconButton></div>)}</div><Button variant="secondary" type="button" onClick={() => updateConfiguration("subjectMappings", [...configuration.subjectMappings, { code: "", label: "", subjectIds: [] }])} className="justify-start mt-3 inline-flex items-center gap-2 px-3 py-2"><Plus aria-hidden="true" className="h-3.5 w-3.5"/><UiText>Add canonical subject</UiText></Button></section>}

              <section id="academic-model-grading" className="sk-panel scroll-mt-6 p-4 sm:p-5"><div className="mb-3"><h3 className="text-sm font-bold text-ink-strong"><UiText>Grade and missing-work rules</UiText></h3><p className="mt-1 text-2xs text-ink-muted"><UiText>Weights must total 100. Grade boundaries descend; ties round half up.</UiText></p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{component("quizWeight", "Quiz weight")}{component("classTestWeight", "Class test weight")}{component("midTermWeight", "Mid-term weight")}{component("finalWeight", "Final exam weight")}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-semibold text-ink-muted"><span className="inline-flex items-center gap-1"><UiText>Pass mark</UiText><InfoTip content={tr("Minimum overall percentage a learner needs to pass.")} /></span><Input type="number" min={0} max={100} step="0.1" value={configuration.grading.passingPercentage} onChange={(event) => updateGrading("passingPercentage", Number(event.target.value))} className="w-full"/></label><label className="space-y-1.5 text-xs font-semibold text-ink-muted"><span><UiText>Mid-year calculation</UiText></span><Select value={configuration.grading.weightMode} onChange={(event) => updateGrading("weightMode", event.target.value)} className="w-full"><option value="NORMALIZED"><UiText>Rescale to assessments held</UiText></option><option value="ABSOLUTE"><UiText>Score against the full year</UiText></option></Select></label>{(["missingPolicy", "absentPolicy", "exemptPolicy"] as const).map((key) => <label key={key} className="space-y-1.5 text-xs font-semibold text-ink-muted"><span>{tr(key === "missingPolicy" ? "Missing mark" : key === "absentPolicy" ? "Absent" : "Exempt")}</span><Select value={configuration.grading[key]} onChange={(event) => updateGrading(key, event.target.value)} className="w-full"><option value="COUNT_AS_ZERO"><UiText>Count as zero</UiText></option><option value="EXCLUDE"><UiText>Exclude from the result</UiText></option><option value="BLOCK"><UiText>Block until resolved</UiText></option></Select></label>)}<label className="space-y-1.5 text-xs font-semibold text-ink-muted"><span><UiText>Rounding</UiText></span><Select value={configuration.grading.roundingRule} onChange={(event) => updateGrading("roundingRule", event.target.value)} className="w-full"><option value="WHOLE"><UiText>Whole percentage</UiText></option><option value="ONE_DECIMAL"><UiText>One decimal place</UiText></option><option value="TWO_DECIMALS"><UiText>Two decimal places</UiText></option></Select></label></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{configuration.grading.thresholds.map((threshold, index) => <label key={index} className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2 text-xs font-semibold"><Input aria-label={tr("Grade label")} value={threshold.label} onChange={(event) => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: current.grading.thresholds.map((item, i) => i === index ? { ...item, label: event.target.value } : item) } }))} className="w-16 text-center"/><span><UiText>from</UiText></span><Input aria-label={tr("Minimum percentage") + ` ${threshold.label}`} type="number" min={0} max={100} step="0.1" value={threshold.minimum} onChange={(event) => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: current.grading.thresholds.map((item, i) => i === index ? { ...item, minimum: Number(event.target.value) } : item) } }))} className="w-20 text-center"/><span>%</span>{index < configuration.grading.thresholds.length - 1 ? <IconButton variant="ghost" size="sm" label={tr("Remove grade")} onClick={() => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: current.grading.thresholds.filter((_, i) => i !== index) } }))} className="ms-auto"><Trash2 aria-hidden="true" className="h-4 w-4"/></IconButton> : null}</label>)}</div><Button variant="outline" type="button" onClick={() => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: [...current.grading.thresholds.slice(0, -1), { label: "New grade", minimum: current.grading.thresholds.at(-1)?.minimum ?? 0 }, current.grading.thresholds.at(-1) ?? { label: "F", minimum: 0 }] } }))} className="justify-start mt-3 inline-flex items-center gap-2 px-3 py-2"><Plus aria-hidden="true" className="h-3.5 w-3.5"/><UiText>Add grade boundary</UiText></Button><p className="mt-3 text-2xs text-ink-muted"><UiText>Missing means no mark row. Absent is stored separately from a scored zero. Exempt marks have their own rule. EXCLUDE removes that component's weight before normalized calculation.</UiText></p></section>

              <section id="academic-model-progression" className="sk-panel scroll-mt-6 p-4 sm:p-5"><h3 className="text-sm font-bold text-ink-strong"><UiText>Progression and report rules</UiText></h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-semibold text-ink-muted"><span className="inline-flex items-center gap-1"><UiText>Progression pass threshold</UiText><InfoTip content={tr("Progression rule: the overall percentage a learner must reach, from 0 to 100.")} /></span><Input type="number" min={0} max={100} value={configuration.progression.passPercentage} onChange={(event) => updateProgression("passPercentage", Number(event.target.value))} className="w-full"/></label><label className="space-y-1 text-xs font-semibold text-ink-muted"><span className="inline-flex items-center gap-1"><UiText>Minimum attendance</UiText><InfoTip content={tr("Progression rule: the attendance percentage a learner must reach, from 0 to 100.")} /></span><Input type="number" min={0} max={100} value={configuration.progression.attendanceMinimum} onChange={(event) => updateProgression("attendanceMinimum", Number(event.target.value))} className="w-full"/></label></div><label className="mt-3 flex items-center gap-2 text-xs font-semibold"><Checkbox  checked={configuration.progression.conditionalPromotion} onChange={(event) => updateProgression("conditionalPromotion", event.target.checked)} className=""/><UiText>Allow conditional promotion review</UiText></label><div className="mt-3 flex flex-wrap gap-3 border-t border-edge/15 pt-3">{([["showComponentBreakdown", "Show component breakdown"], ["showAttendance", "Show attendance"], ["showRank", "Show rank"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs font-semibold"><Checkbox  checked={configuration.report[key]} onChange={(event) => setConfiguration((current) => ({ ...current, report: { ...current.report, [key]: event.target.checked } }))} className=""/>{tr(label)}</label>)}</div></section>

              <section className="sk-panel p-4 sm:p-5"><div className="flex flex-wrap gap-2">{hideActions || hideSave ? null : <Button variant="outline" type="button" onClick={saveDraft} disabled={saving || !title.trim() || (!templatesOnly && !cohort)} className="inline-flex min-h-11 items-center justify-center gap-2 px-4"><Save aria-hidden="true" className="h-4 w-4"/><UiText>Save new draft</UiText></Button>}<Button variant="outline" type="button" onClick={() => void requestPreview("preview")} disabled={previewBusy || !selected || dirty || selected.status !== "DRAFT"} className="inline-flex min-h-11 items-center justify-center gap-2 px-4"><Scale className="h-4 w-4"/><UiText>Review impact &amp; simulate</UiText></Button><Button variant="outline" type="button" onClick={() => void requestPreview("simulate")} disabled={previewBusy || !selected || dirty || selected.status !== "DRAFT"} className="inline-flex min-h-11 items-center justify-center gap-2 px-4"><Scale className="h-4 w-4"/><UiText>Run sample calculation</UiText></Button>{hideActions ? null : <Button variant="default" type="button" onClick={() => void approve()} disabled={saving || !selected || !preview?.success || dirty || selected.status !== "DRAFT"} className="inline-flex min-h-11 items-center justify-center gap-2 px-4"><Check aria-hidden="true" className="h-4 w-4"/><UiText>{templatesOnly ? "Approve shared template" : "Approve and activate version"}</UiText></Button>}</div>{selected && dirty ? <p className="mt-3 flex items-center gap-2 text-2xs font-semibold text-status-warning-text"><AlertTriangle aria-hidden="true" className="h-4 w-4"/><UiText>Save a new draft to include these edits in the review.</UiText></p> : null}
                {preview ? <div className="mt-4 rounded-2xl border border-edge/20 bg-surface-subtle p-4"><div className="flex items-start gap-2"><span className={cn("mt-0.5 rounded-full p-1", preview.success ? "bg-status-success-surface text-status-success-text" : "bg-status-warning-surface text-status-warning-text")}>{preview.success ? <Check className="h-4 w-4"/> : <AlertTriangle className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-ink-strong"><UiText>Configuration diff and impact</UiText></h3>{preview.changedSections?.length ? <p className="mt-1 text-xs text-ink-muted"><UiText>Changed rules</UiText>: {preview.changedSections.map((item) => tr(item)).join(", ")}</p> : null}</div></div>{preview.problems?.length ? <ul className="mt-3 space-y-2">{preview.problems.map((problem, i) => <li key={`${problem.code}-${i}`}><a href={problem.repairHref} className="flex gap-2 rounded-xl bg-status-warning-surface px-3 py-2 text-xs font-semibold text-status-warning-text underline underline-offset-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{problem.template ? tr(problem.template, problem.params ?? []) : problem.message}</a></li>)}</ul> : null}{preview.impact ? <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{([["students", "Students"], ["exams", "Existing exams"], ["publishedReports", "Published reports"], ["pendingReports", "Pending reports"]] as const).map(([key, label]) => <div key={key} className="rounded-xl bg-card p-3"><dt className="text-2xs font-bold text-ink-subtle">{tr(label)}</dt><dd className="mt-1 text-xl font-bold text-ink-strong">{preview.impact[key]}</dd></div>)}</dl> : null}<div className="mt-3 border-t border-edge/15 pt-3"><p className="text-xs font-bold text-ink-strong"><UiText>Sample learner</UiText> · {preview.simulation.overallPercentage}% · {preview.simulation.overallGrade} · {preview.simulation.passed ? <UiText>Pass</UiText> : <UiText>Review</UiText>}</p><ul className="mt-2 space-y-1">{preview.simulation.components.map((item, i) => <li key={i} className="flex flex-wrap justify-between gap-2 text-2xs text-ink-muted"><span>{item.message}</span><span className="font-bold tabular-nums">{item.contribution.toFixed(2)}</span></li>)}</ul></div></div> : null}
                {simulation ? <div className="mt-4 rounded-2xl border border-edge/20 bg-surface-subtle p-4"><h3 className="text-sm font-bold text-ink-strong"><UiText>Sample calculation</UiText> · {simulation.overallPercentage}% · {simulation.overallGrade}</h3><ul className="mt-2 space-y-1">{simulation.components.map((item, i) => <li key={i} className="text-xs text-ink-muted">{item.message}</li>)}</ul></div> : null}
              </section>
            </> : null}
          </div>
        </div>
      )}
    </div>
  );
}
