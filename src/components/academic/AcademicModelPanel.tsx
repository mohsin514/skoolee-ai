"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Check, ChevronRight, CircleHelp, Copy, Plus, Save, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UiText, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { DEFAULT_ACADEMIC_MODEL, type AcademicModelConfiguration, type ResultPolicy, type RoundingRule } from "@/lib/academic/model-config";

type SchoolSubject = { id: string; name: string; totalMarks: number };
type ClassSection = { id: string; name: string; section: string | null; academicYear: number; subjects: SchoolSubject[] };
type ModelVersion = {
  id: string; title: string; cohortLabel: string; cohortKey: string; academicYear: number; version: number; status: string;
  effectiveFrom: string; effectiveTo: string | null; configuration: AcademicModelConfiguration; templateSourceId: string | null;
  delegatedOverrideKeys: string[]; localOverrideKeys: string[]; isSharedTemplate: boolean;
};
type Preview = {
  success: boolean; problems: { code: string; message: string; repairHref: string }[]; changedSections: string[];
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

export function AcademicModelPanel({ campusId, templatesOnly = false }: { campusId?: string; templatesOnly?: boolean }) {
  const tr = useUiText();
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
  const selectedTemplate = templates.find((template) => template.id === sourceTemplateId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = templatesOnly ? "templates=1" : new URLSearchParams({ academicYear: String(year), ...(campusId ? { campusId } : {}) }).toString();
      const response = await fetch(`/api/academic-models?${params}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || tr("Could not load academic models"));
      setClasses(json.classes ?? []);
      setVersions(templatesOnly ? json.templates ?? [] : json.versions ?? []);
      setTemplates(templatesOnly ? json.templates ?? [] : json.templates ?? []);
      if (!templatesOnly && !cohort && json.classes?.length) setCohort(json.classes[0].name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not load academic models"));
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
    setEffectiveFrom(`${year}-01-01`);
    setEffectiveTo("");
    setDelegatedOverrideKeys([]);
  };

  const chooseCohort = (name: string) => {
    setCohort(name);
    resetDraft(name);
  };

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
    <label className="space-y-1.5 text-xs font-bold text-ink-muted" key={key}>
      <span>{tr(label)}</span>
      <div className="flex items-center gap-2"><input aria-label={tr(label)} type="number" min={0} max={100} step="0.1" value={configuration.grading[key]} onChange={(event) => updateGrading(key, Number(event.target.value))} className="h-10 w-full min-w-0 rounded-xl border border-[#cfc2d6]/30 bg-white px-3 text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30" /><span>%</span></div>
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
      const response = await fetch(`/api/academic-models/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, campusId }) });
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

  if (loading) return <div className="space-y-4" aria-busy="true"><div className="h-24 animate-pulse rounded-3xl bg-[#f3f4f9]"/><div className="h-72 animate-pulse rounded-3xl bg-[#f3f4f9]"/></div>;

  return (
    <div className="space-y-5" aria-live="polite">
      <header className="rounded-[28px] bg-gradient-to-br from-[#1f1a23] via-[#2d2338] to-[#3d2a52] p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/60">{templatesOnly ? <UiText>School group</UiText> : <UiText>Academic setup</UiText>} · {templatesOnly ? <UiText>Shared rules</UiText> : year}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">{templatesOnly ? <UiText>Curriculum templates</UiText> : <UiText>Curriculum, grading &amp; terms</UiText>}</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-white/70">{templatesOnly ? <UiText>Approve a version once for your school group, then let each campus adopt only the rules you delegate.</UiText> : <UiText>Set one version for a cohort and reporting period. Published reports keep their original grading snapshot.</UiText>}</p>
          </div>
          {!templatesOnly ? <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-white/60"><span><UiText>Academic year</UiText></span><input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-10 w-28 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white" /></label> : null}
        </div>
      </header>

      {templatesOnly ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {versions.map((version) => <button key={version.id} type="button" onClick={() => chooseVersion(version)} className={cn("rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]", selected?.id === version.id ? "border-[#8127cf] bg-[#faf7fc]" : "border-[#cfc2d6]/25 bg-white")}><span className="flex items-center justify-between gap-3"><span className="font-black text-[#1f1a23]">{version.title}</span><span className="rounded-lg bg-[#f3f4f9] px-2 py-1 text-[10px] font-black uppercase text-ink-subtle">{version.status === "TEMPLATE" ? <UiText>Approved</UiText> : <UiText>Draft</UiText>} · v{version.version}</span></span><span className="mt-1 block text-xs text-ink-muted">{version.delegatedOverrideKeys.length ? tr("Delegated local changes: {0}", [version.delegatedOverrideKeys.length]) : <UiText>No local changes delegated</UiText>}{version.delegatedOverrideKeys.length ? ` · ${version.delegatedOverrideKeys.join(", ")}` : ""}</span></button>)}
          <button type="button" onClick={() => resetDraft()} className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed border-[#cfc2d6]/50 bg-white text-sm font-black text-[#8127cf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]"><Plus className="h-4 w-4"/><UiText>Create a template version</UiText></button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(14rem,0.7fr)_minmax(0,2fr)]">
          <aside className="space-y-3">
            <section className="rounded-2xl border border-[#cfc2d6]/25 bg-white p-4">
              <label htmlFor="academic-cohort" className="text-xs font-black text-[#1f1a23]"><UiText>Cohort</UiText></label>
              <select id="academic-cohort" value={cohort} onChange={(event) => chooseCohort(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfc2d6]/30 bg-white px-3 text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30">
                {!groups.length ? <option value=""><UiText>No active classes this year</UiText></option> : null}
                {groups.map((group) => <option key={group.name} value={group.name}>{group.name} · {group.sections.map((section) => section.section || "—").join(", ")}</option>)}
              </select>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted"><UiText>All sections with the same class name use the same version. Each section subject is mapped below.</UiText></p>
            </section>
            {templates.length ? <section className="rounded-2xl border border-[#cfc2d6]/25 bg-white p-4"><label htmlFor="academic-template" className="text-xs font-black text-[#1f1a23]"><UiText>Approved group template</UiText></label><select id="academic-template" value={sourceTemplateId} onChange={(event) => addFromTemplate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfc2d6]/30 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"><option value=""><UiText>Start with custom rules</UiText></option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title} · v{template.version}</option>)}</select>{selectedTemplate ? <p className="mt-2 flex gap-2 text-[11px] leading-relaxed text-ink-muted"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"/><span>{tr("Inherited rules from {0}", [selectedTemplate.title])}{` v${selectedTemplate.version}. Delegated exceptions: ${selectedTemplate.delegatedOverrideKeys.join(", ") || "none"}.`}</span></p> : null}</section> : null}
            <section className="rounded-2xl border border-[#cfc2d6]/25 bg-white p-2">
              <div className="flex items-center justify-between px-2 py-2"><h3 className="text-xs font-black text-[#1f1a23]"><UiText>Versions</UiText></h3><span className="text-[10px] font-bold text-ink-subtle">{candidateVersions.length}</span></div>
              {candidateVersions.length ? <ul className="space-y-1">{candidateVersions.map((version) => <li key={version.id}><button type="button" onClick={() => chooseVersion(version)} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]", selected?.id === version.id ? "bg-[#f3eeff]" : "hover:bg-[#faf7fc]")}><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-[#1f1a23]">{version.title}</span><span className="mt-0.5 block text-[10px] font-semibold text-ink-subtle">v{version.version} · {version.status} · {dateValue(version.effectiveFrom)}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle"/></button></li>)}</ul> : <p className="px-3 py-4 text-xs text-ink-muted"><UiText>No versions yet. Save a draft to begin.</UiText></p>}
              <button type="button" onClick={() => resetDraft()} disabled={!cohort} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#cfc2d6]/40 px-3 py-2.5 text-xs font-black text-[#8127cf] disabled:opacity-40"><Plus className="h-3.5 w-3.5"/><UiText>Start a new draft</UiText></button>
            </section>
          </aside>
          <div className="space-y-4">
            {!groups.length && !templatesOnly ? <div className="rounded-2xl border border-dashed border-[#cfc2d6]/40 bg-white p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-ink-subtle"/><h3 className="mt-3 font-black text-[#1f1a23]"><UiText>No active classes this year</UiText></h3><p className="mt-1 text-sm text-ink-muted"><UiText>Create classes before configuring a cohort.</UiText></p></div> : null}
            {(groups.length || templatesOnly) ? <>
              <section className="rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Academic model builder</UiText></h3><p className="mt-1 text-xs text-ink-muted"><UiText>Complex rules stay in focused forms, and each field works with a keyboard.</UiText></p></div>{selected?.status === "ACTIVE" ? <button type="button" onClick={cloneActive} className="inline-flex items-center gap-2 rounded-xl border border-[#cfc2d6]/30 px-3 py-2 text-xs font-bold text-[#1f1a23]"><Copy className="h-3.5 w-3.5"/><UiText>Make a new version</UiText></button> : null}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-[11px] font-bold text-ink-muted"><span><UiText>Version title</UiText></span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30" /></label>
                  {!templatesOnly ? <><label className="space-y-1 text-[11px] font-bold text-ink-muted"><span><UiText>Effective from</UiText></span><input aria-describedby="academic-effective-help" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30" /></label><label className="space-y-1 text-[11px] font-bold text-ink-muted"><span><UiText>Effective through (optional)</UiText></span><input type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30" /></label><p id="academic-effective-help" className="text-[11px] text-ink-muted sm:col-span-2"><UiText>New versions start on this date. Published reports keep the grading version already captured in their approval snapshot.</UiText></p></> : null}
                </div>
                {!templatesOnly ? <div className="mt-4 flex flex-wrap gap-2">{selectedClasses.map((cls) => <span key={cls.id} className="rounded-lg bg-[#f3eeff] px-2.5 py-1 text-[10px] font-black text-[#8127cf]">{cls.name} · {cls.section || <UiText>Unsectioned</UiText>}</span>)}</div> : null}
                {templatesOnly ? <div className="mt-5 border-t border-[#cfc2d6]/15 pt-4"><h4 className="text-xs font-black text-[#1f1a23]"><UiText>Delegated campus exceptions</UiText></h4><p className="mt-1 text-[11px] text-ink-muted"><UiText>Campuses may only change the sections the group explicitly delegates.</UiText></p><div className="mt-3 grid gap-2 sm:grid-cols-2">{(["terms", "subjectMappings", "grading", "progression", "report"] as const).map((key) => <label key={key} className="flex items-center gap-2 rounded-xl bg-[#faf7fc] px-3 py-2.5 text-xs font-semibold text-[#1f1a23]"><input type="checkbox" checked={delegatedOverrideKeys.includes(key)} onChange={(event) => setDelegatedOverrideKeys((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} className="h-4 w-4 accent-[#8127cf]" />{tr(key === "subjectMappings" ? "Subject mappings" : key[0].toUpperCase() + key.slice(1))}</label>)}</div></div> : null}
              </section>

              <section id="academic-model-periods" className="scroll-mt-6 rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Terms and reporting periods</UiText></h3><p className="mt-1 text-[11px] text-ink-muted"><UiText>Periods may not overlap. Teaching weeks are explicit calendar rules.</UiText></p></div><button type="button" onClick={() => updateConfiguration("terms", [...configuration.terms, newTerm(configuration.terms.length)])} className="inline-flex items-center gap-1.5 rounded-xl bg-[#f3eeff] px-3 py-2 text-xs font-black text-[#8127cf]"><Plus className="h-3.5 w-3.5"/><UiText>Add period</UiText></button></div>
                <div className="space-y-3">{configuration.terms.map((term, index) => <article key={term.id} className="rounded-xl border border-[#cfc2d6]/20 bg-[#faf7fc]/60 p-3"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-xs font-black text-[#1f1a23]">{tr("Period {0}", [index + 1])}</h4><div className="flex items-center gap-1"><button type="button" aria-label={tr("Move period up")} disabled={!index} onClick={() => { const next = [...configuration.terms]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateConfiguration("terms", next); }} className="rounded-lg p-1.5 text-ink-muted disabled:opacity-30"><ArrowUp className="h-4 w-4"/></button><button type="button" aria-label={tr("Move period down")} disabled={index === configuration.terms.length - 1} onClick={() => { const next = [...configuration.terms]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; updateConfiguration("terms", next); }} className="rounded-lg p-1.5 text-ink-muted disabled:opacity-30"><ArrowDown className="h-4 w-4"/></button><button type="button" aria-label={tr("Remove period")} disabled={configuration.terms.length < 2} onClick={() => updateConfiguration("terms", configuration.terms.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4"/></button></div></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><label className="space-y-1 text-[10px] font-bold text-ink-muted"><span><UiText>Period name</UiText></span><input aria-label={tr("Period name")} value={term.label} onChange={(event) => updateTerm(index, "label", event.target.value)} className="h-10 w-full rounded-lg border border-[#cfc2d6]/30 bg-white px-2 text-xs text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"/></label><label className="space-y-1 text-[10px] font-bold text-ink-muted"><span><UiText>Starts</UiText></span><input aria-label={tr("Starts") + ` — ${term.label}`} type="date" value={term.startDate} onChange={(event) => updateTerm(index, "startDate", event.target.value)} className="h-10 w-full rounded-lg border border-[#cfc2d6]/30 bg-white px-2 text-xs text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"/></label><label className="space-y-1 text-[10px] font-bold text-ink-muted"><span><UiText>Ends</UiText></span><input aria-label={tr("Ends") + ` — ${term.label}`} type="date" value={term.endDate} onChange={(event) => updateTerm(index, "endDate", event.target.value)} className="h-10 w-full rounded-lg border border-[#cfc2d6]/30 bg-white px-2 text-xs text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"/></label><label className="space-y-1 text-[10px] font-bold text-ink-muted"><span><UiText>Teaching weeks</UiText></span><input aria-label={tr("Teaching weeks") + ` — ${term.label}`} type="number" min={1} max={52} value={term.teachingWeeks} onChange={(event) => updateTerm(index, "teachingWeeks", Number(event.target.value))} className="h-10 w-full rounded-lg border border-[#cfc2d6]/30 bg-white px-2 text-xs text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"/></label></div><label className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-ink-muted"><input type="checkbox" checked={term.reportingPeriod} onChange={(event) => updateTerm(index, "reportingPeriod", event.target.checked)} className="h-4 w-4 accent-[#8127cf]"/><UiText>Issue a report for this period</UiText></label></article>)}</div>
              </section>

              {!templatesOnly ? <section id="academic-model-subject-mapping" className="scroll-mt-6 rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Curriculum subject map</UiText></h3><p className="mt-1 text-[11px] text-ink-muted"><UiText>Every active section subject needs one curriculum code. Matching names across sections share one mapping.</UiText></p></div><button type="button" onClick={() => { const subject = availableSubjects.find((item) => !configuration.subjectMappings.some((mapping) => mapping.subjectIds.includes(item.id))); if (subject) updateConfiguration("subjectMappings", [...configuration.subjectMappings, { code: keyFor(subject.name), label: subject.name, subjectIds: [subject.id] }]); }} className="inline-flex items-center gap-1.5 rounded-xl bg-[#f3eeff] px-3 py-2 text-xs font-black text-[#8127cf]"><Plus className="h-3.5 w-3.5"/><UiText>Add mapping</UiText></button></div><div className="space-y-2">{configuration.subjectMappings.map((mapping, index) => <div key={`${mapping.code}-${index}`} className="grid gap-2 rounded-xl border border-[#cfc2d6]/15 p-3 sm:grid-cols-[minmax(5rem,.7fr)_minmax(8rem,1fr)_minmax(0,1.2fr)_auto] sm:items-center"><label className="space-y-1 text-[10px] font-bold text-ink-muted"><span><UiText>Curriculum code</UiText></span><input aria-label={tr("Curriculum code")} value={mapping.code} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, code: event.target.value } : item))} className="h-10 w-full rounded-lg border border-[#cfc2d6]/30 px-2 text-xs text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"/></label><label className="space-y-1 text-[10px] font-bold text-ink-muted"><span><UiText>Curriculum subject</UiText></span><input aria-label={tr("Curriculum subject")} value={mapping.label} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className="h-10 w-full rounded-lg border border-[#cfc2d6]/30 px-2 text-xs text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"/></label><div className="min-w-0"><p className="text-[10px] font-bold text-ink-muted"><UiText>Mapped school subjects</UiText></p><p className="mt-1 break-words text-xs text-[#1f1a23]">{availableSubjects.filter((subject) => mapping.subjectIds.includes(subject.id)).map((subject) => `${subject.name}${subject.section ? ` · ${subject.section}` : ""}`).join(", ") || <UiText>None selected</UiText>}</p></div><button type="button" aria-label={tr("Remove mapping")} onClick={() => updateConfiguration("subjectMappings", configuration.subjectMappings.filter((_, i) => i !== index))} className="justify-self-end rounded-lg p-2 text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><Trash2 className="h-4 w-4"/></button></div>)}</div><p className="mt-3 flex items-start gap-2 text-[11px] text-ink-muted"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0"/><span><UiText>Activation is blocked until every section subject is mapped exactly once. Use Add mapping to repair missing subjects.</UiText></span></p></section> : <section id="academic-model-subject-mapping" className="rounded-2xl border border-[#cfc2d6]/25 bg-white p-4"><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Canonical subject names</UiText></h3><p className="mt-1 text-[11px] text-ink-muted"><UiText>Campus subject IDs are linked when a campus adopts this template.</UiText></p><div className="mt-3 space-y-2">{configuration.subjectMappings.map((mapping, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(6rem,.7fr)_1fr_auto]"><input aria-label={tr("Curriculum code")} value={mapping.code} placeholder={tr("Code")} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, code: event.target.value } : item))} className="h-10 rounded-lg border border-[#cfc2d6]/30 px-3 text-sm"/><input aria-label={tr("Curriculum subject")} value={mapping.label} placeholder={tr("Subject name")} onChange={(event) => updateConfiguration("subjectMappings", configuration.subjectMappings.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className="h-10 rounded-lg border border-[#cfc2d6]/30 px-3 text-sm"/><button type="button" aria-label={tr("Remove mapping")} onClick={() => updateConfiguration("subjectMappings", configuration.subjectMappings.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4"/></button></div>)}</div><button type="button" onClick={() => updateConfiguration("subjectMappings", [...configuration.subjectMappings, { code: "", label: "", subjectIds: [] }])} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#f3eeff] px-3 py-2 text-xs font-black text-[#8127cf]"><Plus className="h-3.5 w-3.5"/><UiText>Add canonical subject</UiText></button></section>}

              <section id="academic-model-grading" className="scroll-mt-6 rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 sm:p-5"><div className="mb-3"><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Grade and missing-work rules</UiText></h3><p className="mt-1 text-[11px] text-ink-muted"><UiText>Weights must total 100. Grade boundaries descend; ties round half up.</UiText></p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{component("quizWeight", "Quiz weight")}{component("classTestWeight", "Class test weight")}{component("midTermWeight", "Mid-term weight")}{component("finalWeight", "Final exam weight")}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-bold text-ink-muted"><span><UiText>Pass mark</UiText></span><input type="number" min={0} max={100} step="0.1" value={configuration.grading.passingPercentage} onChange={(event) => updateGrading("passingPercentage", Number(event.target.value))} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm"/></label><label className="space-y-1.5 text-xs font-bold text-ink-muted"><span><UiText>Mid-year calculation</UiText></span><select value={configuration.grading.weightMode} onChange={(event) => updateGrading("weightMode", event.target.value)} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm"><option value="NORMALIZED"><UiText>Rescale to assessments held</UiText></option><option value="ABSOLUTE"><UiText>Score against the full year</UiText></option></select></label>{(["missingPolicy", "absentPolicy", "exemptPolicy"] as const).map((key) => <label key={key} className="space-y-1.5 text-xs font-bold text-ink-muted"><span>{tr(key === "missingPolicy" ? "Missing mark" : key === "absentPolicy" ? "Absent" : "Exempt")}</span><select value={configuration.grading[key]} onChange={(event) => updateGrading(key, event.target.value)} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm"><option value="COUNT_AS_ZERO"><UiText>Count as zero</UiText></option><option value="EXCLUDE"><UiText>Exclude from the result</UiText></option><option value="BLOCK"><UiText>Block until resolved</UiText></option></select></label>)}<label className="space-y-1.5 text-xs font-bold text-ink-muted"><span><UiText>Rounding</UiText></span><select value={configuration.grading.roundingRule} onChange={(event) => updateGrading("roundingRule", event.target.value)} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3 text-sm"><option value="WHOLE"><UiText>Whole percentage</UiText></option><option value="ONE_DECIMAL"><UiText>One decimal place</UiText></option><option value="TWO_DECIMALS"><UiText>Two decimal places</UiText></option></select></label></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{configuration.grading.thresholds.map((threshold, index) => <label key={index} className="flex items-center gap-2 rounded-xl bg-[#faf7fc] px-3 py-2 text-xs font-bold"><input aria-label={tr("Grade label")} value={threshold.label} onChange={(event) => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: current.grading.thresholds.map((item, i) => i === index ? { ...item, label: event.target.value } : item) } }))} className="h-9 w-16 rounded-lg border border-[#cfc2d6]/30 bg-white px-2 text-center"/><span><UiText>from</UiText></span><input aria-label={tr("Minimum percentage") + ` ${threshold.label}`} type="number" min={0} max={100} step="0.1" value={threshold.minimum} onChange={(event) => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: current.grading.thresholds.map((item, i) => i === index ? { ...item, minimum: Number(event.target.value) } : item) } }))} className="h-9 w-20 rounded-lg border border-[#cfc2d6]/30 bg-white px-2 text-center"/><span>%</span>{index < configuration.grading.thresholds.length - 1 ? <button type="button" aria-label={tr("Remove grade")} onClick={() => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: current.grading.thresholds.filter((_, i) => i !== index) } }))} className="ml-auto rounded-lg p-1 text-rose-600"><Trash2 className="h-4 w-4"/></button> : null}</label>)}</div><button type="button" onClick={() => setConfiguration((current) => ({ ...current, grading: { ...current.grading, thresholds: [...current.grading.thresholds.slice(0, -1), { label: "New grade", minimum: current.grading.thresholds.at(-1)?.minimum ?? 0 }, current.grading.thresholds.at(-1) ?? { label: "F", minimum: 0 }] } }))} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#cfc2d6]/30 px-3 py-2 text-xs font-bold text-[#8127cf]"><Plus className="h-3.5 w-3.5"/><UiText>Add grade boundary</UiText></button><p className="mt-3 text-[11px] text-ink-muted"><UiText>Missing means no mark row. Absent is stored separately from a scored zero. Exempt marks have their own rule. EXCLUDE removes that component's weight before normalized calculation.</UiText></p></section>

              <section id="academic-model-progression" className="scroll-mt-6 rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 sm:p-5"><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Progression and report rules</UiText></h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold text-ink-muted"><span><UiText>Progression pass threshold</UiText></span><input type="number" min={0} max={100} value={configuration.progression.passPercentage} onChange={(event) => updateProgression("passPercentage", Number(event.target.value))} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3"/></label><label className="space-y-1 text-xs font-bold text-ink-muted"><span><UiText>Minimum attendance</UiText></span><input type="number" min={0} max={100} value={configuration.progression.attendanceMinimum} onChange={(event) => updateProgression("attendanceMinimum", Number(event.target.value))} className="h-10 w-full rounded-xl border border-[#cfc2d6]/30 px-3"/></label></div><label className="mt-3 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={configuration.progression.conditionalPromotion} onChange={(event) => updateProgression("conditionalPromotion", event.target.checked)} className="h-4 w-4 accent-[#8127cf]"/><UiText>Allow conditional promotion review</UiText></label><div className="mt-3 flex flex-wrap gap-3 border-t border-[#cfc2d6]/15 pt-3">{([["showComponentBreakdown", "Show component breakdown"], ["showAttendance", "Show attendance"], ["showRank", "Show rank"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={configuration.report[key]} onChange={(event) => setConfiguration((current) => ({ ...current, report: { ...current.report, [key]: event.target.checked } }))} className="h-4 w-4 accent-[#8127cf]"/>{tr(label)}</label>)}</div></section>

              <section className="rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 sm:p-5"><div className="flex flex-wrap gap-2"><button type="button" onClick={saveDraft} disabled={saving || !title.trim() || (!templatesOnly && !cohort)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f1a23] px-4 text-xs font-black text-white disabled:opacity-40"><Save className="h-4 w-4"/><UiText>Save new draft</UiText></button><button type="button" onClick={() => void requestPreview("preview")} disabled={previewBusy || !selected || dirty || selected.status !== "DRAFT"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cfc2d6]/30 px-4 text-xs font-black text-[#1f1a23] disabled:opacity-40"><Scale className="h-4 w-4"/><UiText>Review impact &amp; simulate</UiText></button><button type="button" onClick={() => void requestPreview("simulate")} disabled={previewBusy || !selected || dirty || selected.status !== "DRAFT"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cfc2d6]/30 px-4 text-xs font-black text-[#8127cf] disabled:opacity-40"><Scale className="h-4 w-4"/><UiText>Run sample calculation</UiText></button><button type="button" onClick={() => void approve()} disabled={saving || !selected || !preview?.success || dirty || selected.status !== "DRAFT"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8127cf] px-4 text-xs font-black text-white disabled:opacity-40"><Check className="h-4 w-4"/><UiText>{templatesOnly ? "Approve shared template" : "Approve and activate version"}</UiText></button></div>{selected && dirty ? <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-amber-700"><AlertTriangle className="h-4 w-4"/><UiText>Save a new draft to include these edits in the review.</UiText></p> : null}
                {preview ? <div className="mt-4 rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-4"><div className="flex items-start gap-2"><span className={cn("mt-0.5 rounded-full p-1", preview.success ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{preview.success ? <Check className="h-4 w-4"/> : <AlertTriangle className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Configuration diff and impact</UiText></h3>{preview.changedSections?.length ? <p className="mt-1 text-xs text-ink-muted"><UiText>Changed rules</UiText>: {preview.changedSections.map((item) => tr(item)).join(", ")}</p> : null}</div></div>{preview.problems?.length ? <ul className="mt-3 space-y-2">{preview.problems.map((problem, i) => <li key={`${problem.code}-${i}`}><a href={problem.repairHref} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 underline decoration-amber-400 underline-offset-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{problem.message}</a></li>)}</ul> : null}{preview.impact ? <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{([["students", "Students"], ["exams", "Existing exams"], ["publishedReports", "Published reports"], ["pendingReports", "Pending reports"]] as const).map(([key, label]) => <div key={key} className="rounded-xl bg-white p-3"><dt className="text-[10px] font-bold text-ink-subtle">{tr(label)}</dt><dd className="mt-1 text-xl font-black text-[#1f1a23]">{preview.impact[key]}</dd></div>)}</dl> : null}<div className="mt-3 border-t border-[#cfc2d6]/15 pt-3"><p className="text-xs font-black text-[#1f1a23]"><UiText>Sample learner</UiText> · {preview.simulation.overallPercentage}% · {preview.simulation.overallGrade} · {preview.simulation.passed ? <UiText>Pass</UiText> : <UiText>Review</UiText>}</p><ul className="mt-2 space-y-1">{preview.simulation.components.map((item, i) => <li key={i} className="flex flex-wrap justify-between gap-2 text-[11px] text-ink-muted"><span>{item.message}</span><span className="font-bold tabular-nums">{item.contribution.toFixed(2)}</span></li>)}</ul></div></div> : null}
                {simulation ? <div className="mt-4 rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-4"><h3 className="text-sm font-black text-[#1f1a23]"><UiText>Sample calculation</UiText> · {simulation.overallPercentage}% · {simulation.overallGrade}</h3><ul className="mt-2 space-y-1">{simulation.components.map((item, i) => <li key={i} className="text-xs text-ink-muted">{item.message}</li>)}</ul></div> : null}
              </section>
            </> : null}
          </div>
        </div>
      )}
    </div>
  );
}
