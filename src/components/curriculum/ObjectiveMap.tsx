"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fill, getObjectiveMapCopy, type ObjectiveMapCopy } from "./objective-map-copy";

// SKO-406 objective map. Planned, taught and assessed stay separate columns with their evidence;
// nothing here turns coverage into a mastery claim.
type Objective = { id: string; code?: string; title: string; description?: string; prerequisiteIds: string[]; sourceId: string; sourcePage: string; taught: boolean; included: boolean };
type Coverage = {
  outcomeId: string;
  planned: { topics: Array<{ id: string; title: string; status: string }> };
  taught: { sections: Array<{ section: string; taughtOn: string }> };
  assessed: { releases: Array<{ assignmentId: string; paperId: string; paperVersion: number; questions: number }> };
  resources: Array<{ id: string; title: string }>;
  drafts: Array<{ paperId: string; title: string; questions: number }>;
};
type Change = { outcomeId: string; change: "ADDED" | "CHANGED" | "RETIRED"; before?: Objective; after?: Objective };
type Mapping = { id: string; fromRecordId: string; fromVersion: number; fromOutcomeId: string; toRecordId: string; toVersion: number; toOutcomeId: string; relation: "SAME" | "PARTIAL" | "NOT_EQUIVALENT"; note: string };
type Target = { id: string; title: string; version: number; board: string; objectives: Array<{ id: string; code?: string; title: string }> };
type MapView = {
  record: { id: string; title: string; version: number; status: string };
  pack: { board: string; academicYear: string; authority?: string; edition?: string; language?: string; rights?: "APPROVED" | "UNDER_REVIEW" | "MANUAL"; sources: Array<{ id: string; title: string; kind: string; edition?: string; approved: boolean }> };
  objectives: Objective[]; structureIssues: string[]; coverage: Coverage[];
  unmapped: { questions: Array<{ paperId: string; paperTitle: string; paperVersion: number; questionId: string; prompt: string }>; resources: Array<{ id: string; title: string }> };
  versions: Array<{ version: number; status: string }>;
  comparison: null | { from: number; to: number; changes: Change[]; impact: { affected: Array<{ paperId: string; title: string; curriculumVersion: number; questions: string[] }>; preserved: Array<{ assignmentId: string; paperId: string; curriculumVersion: number }> } };
  mappings: Mapping[]; mappingTargets: Target[]; canDecide: boolean;
};
type ListItem = { id: string; title: string; version: number; subject: string; className: string };

async function call(path: string, body?: unknown) {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}
const Code = ({ value }: { value?: string }) => value ? <bdi dir="ltr" className="font-mono text-xs">{value}</bdi> : null;

export function ObjectiveMap() {
  const { language } = useLocale();
  const t = getObjectiveMapCopy(language);
  const rtl = language === "ar" || language === "ur";
  const [list, setList] = useState<ListItem[] | null>(null);
  const [recordId, setRecordId] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [view, setView] = useState<MapView | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "notTaught" | "notAssessed">("all");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    call("/api/curriculum/map").then(data => { setList(data.curricula); if (data.curricula[0]) setRecordId(current => current || data.curricula[0].id); })
      .catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }));
  }, [t.failed]);
  const load = useCallback(async () => {
    if (!recordId) return;
    const params = new URLSearchParams({ recordId, ...(compareTo ? { compareTo } : {}) });
    setView(await call(`/api/curriculum/map?${params}`));
  }, [recordId, compareTo]);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);

  const label = (objective?: Pick<Objective, "code" | "title">) => objective ? <><Code value={objective.code} />{objective.code ? " · " : ""}<span dir="auto">{objective.title}</span></> : null;
  const rows = useMemo(() => !view ? [] : view.objectives.filter(objective => {
    const coverage = view.coverage.find(row => row.outcomeId === objective.id)!;
    const text = `${objective.code ?? ""} ${objective.title}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (filter === "notTaught") return coverage.taught.sections.length === 0;
    if (filter === "notAssessed") return coverage.assessed.releases.length === 0;
    return true;
  }), [view, q, filter]);

  const banner = status && <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{status.text}</p>;
  if (list && !list.length) return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3">{banner}<p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">{t.noCurricula}</p></div>;
  if (!list || !view) return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3">{banner ?? <p className="text-sm text-slate-600" aria-live="polite">{t.loading}</p>}</div>;

  const byId = (id: string) => view.objectives.find(objective => objective.id === id);
  return <div dir={rtl ? "rtl" : "ltr"} className="min-w-0 space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.curriculum}<Select value={recordId} onChange={event => { setRecordId(event.target.value); setCompareTo(""); }}>
        {list.map(item => <option key={item.id} value={item.id}>{item.title} · {item.subject} · {item.className}</option>)}</Select></label>
      <p className="self-end text-sm">{t.version} <strong>{view.record.version}</strong></p>
    </div>
    {banner}

    <section aria-label={t.pack} className="grid gap-2 rounded-xl border bg-white p-4 text-sm">
      <h2 className="text-base font-semibold">{t.pack}</h2>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">{t.board}</dt><dd dir="auto">{view.pack.board}</dd></div>
        <div><dt className="text-xs text-slate-500">{t.year}</dt><dd dir="auto">{view.pack.academicYear}</dd></div>
        <div><dt className="text-xs text-slate-500">{t.edition}</dt><dd dir="auto">{view.pack.edition ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">{t.authority}</dt><dd dir="auto">{view.pack.authority ?? "—"}</dd></div>
      </dl>
      <p><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${view.pack.rights === "APPROVED" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{view.pack.rights ? t.rights[view.pack.rights] : t.rightsUnknown}</span></p>
      <p className="text-xs text-slate-600">{t.sources}: {view.pack.sources.map(source => source.title).join(" · ")}</p>
    </section>

    {view.structureIssues.length > 0 && <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden />{t.structure}</p><ul className="mt-1 list-disc ps-5">{view.structureIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></section>}

    <section aria-labelledby="objectives-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="objectives-heading" className="text-base font-semibold">{t.objectives}</h2><p className="text-xs text-slate-600">{t.noMastery}</p></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-semibold">{t.search}<Input type="search" value={q} onChange={event => setQ(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold">{t.filter}<Select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
            {(["all", "notTaught", "notAssessed"] as const).map(value => <option key={value} value={value}>{t.filters[value]}</option>)}</Select></label>
        </div>
      </div>
      <ul className="grid gap-3" aria-label={t.objectives}>{rows.map(objective => <ObjectiveRow key={objective.id} t={t} objective={objective} coverage={view.coverage.find(row => row.outcomeId === objective.id)!} prerequisites={objective.prerequisiteIds.map(byId).filter(Boolean) as Objective[]} language={language} label={label} />)}</ul>
    </section>

    <section aria-labelledby="compare-heading" className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="compare-heading" className="text-base font-semibold">{t.compare}</h2>
        {view.versions.some(row => row.version < view.record.version) && <label className="grid gap-1 text-xs font-semibold">{t.compareWith}<Select value={compareTo || String(view.comparison?.from ?? "")} onChange={event => setCompareTo(event.target.value)}>
          {view.versions.filter(row => row.version < view.record.version).map(row => <option key={row.version} value={row.version}>v{row.version}</option>)}</Select></label>}
      </div>
      {!view.comparison ? <p className="text-sm text-slate-600">{t.noCompare}</p> : <>
        <ul className="grid gap-2 text-sm">{view.comparison.changes.map(change => <li key={change.outcomeId} className="rounded-lg bg-slate-50 px-3 py-2">
          <span className={`me-2 rounded-full border px-2 py-0.5 text-xs font-semibold ${change.change === "ADDED" ? "border-emerald-300" : change.change === "RETIRED" ? "border-rose-300" : "border-amber-300"}`}>{t[change.change === "ADDED" ? "added" : change.change === "CHANGED" ? "changed" : "retired"]}</span>
          {change.change === "CHANGED" ? <><s className="text-slate-500">{label(change.before)}</s> → {label(change.after)}</> : label(change.after ?? change.before)}
        </li>)}</ul>
        <h3 className="text-sm font-semibold">{t.impact}</h3>
        <p className="text-xs font-semibold text-slate-600">{t.affectedPapers}</p>
        {view.comparison.impact.affected.length ? <ul className="grid gap-1 text-sm">{view.comparison.impact.affected.map(paper => <li key={paper.paperId} dir="auto">{paper.title} · v{paper.curriculumVersion} · {fill(t.questions, { n: paper.questions.length })}</li>)}</ul> : <p className="text-sm text-slate-600">{t.noAffected}</p>}
        {view.comparison.impact.preserved.length > 0 && <p className="text-sm text-slate-600">{t.preserved} ({view.comparison.impact.preserved.length})</p>}
      </>}
    </section>

    <section aria-labelledby="unmapped-heading" className="space-y-2 rounded-xl border bg-white p-4 text-sm">
      <h2 id="unmapped-heading" className="text-base font-semibold">{t.unmapped}</h2>
      {!view.unmapped.questions.length && !view.unmapped.resources.length ? <p className="text-slate-600">{t.allMapped}</p> : <>
        {view.unmapped.questions.length > 0 && <><p className="text-xs font-semibold text-slate-600">{t.unmappedQuestions}</p><ul className="grid gap-1">{view.unmapped.questions.map(row => <li key={`${row.paperId}:${row.questionId}`} dir="auto">{row.paperTitle} · {row.prompt}</li>)}</ul></>}
        {view.unmapped.resources.length > 0 && <><p className="text-xs font-semibold text-slate-600">{t.unmappedResources}</p><ul className="grid gap-1">{view.unmapped.resources.map(row => <li key={row.id} dir="auto">{row.title}</li>)}</ul></>}
      </>}
    </section>

    <MappingPanel t={t} view={view} label={label} onSaved={async () => { await load(); setStatus({ tone: "ok", text: t.saved }); }} onError={text => setStatus({ tone: "error", text })} />
  </div>;
}

function ObjectiveRow({ t, objective, coverage, prerequisites, language, label }: { t: ObjectiveMapCopy; objective: Objective; coverage: Coverage; prerequisites: Objective[]; language: string; label: (o?: Pick<Objective, "code" | "title">) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const taught = coverage.taught.sections.length, assessed = coverage.assessed.releases.length, planned = coverage.planned.topics.length;
  const line = taught && assessed ? t.statusLine.both : taught ? fill(t.statusLine.taughtOnly, { n: taught }) : assessed ? t.statusLine.assessedOnly : planned ? t.statusLine.plannedOnly : t.statusLine.nothing;
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
  const cell = (name: string, value: number, text: string) => <div className="rounded-lg bg-slate-50 px-2 py-1"><dt className="text-2xs text-slate-500">{name}</dt><dd className={`text-sm font-semibold ${value ? "" : "text-slate-500"}`}>{value ? text : t.none}</dd></div>;
  return <li className="rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="font-semibold">{label(objective)}</p>
        {objective.description && <p className="text-sm text-slate-700" dir="auto">{objective.description}</p>}
        {prerequisites.length > 0 && <p className="text-xs text-slate-500">{t.prerequisites}: {prerequisites.map((item, index) => <span key={item.id}>{index ? ", " : ""}{label(item)}</span>)}</p>}
      </div>
      {!objective.included && <span className="rounded-full border px-2 py-0.5 text-xs">{t.notIncluded}</span>}
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cell(t.planned, planned, fill(t.topics, { n: planned }))}
      {cell(t.taught, taught, fill(t.lessons, { n: taught }))}
      {cell(t.assessed, assessed, fill(t.releases, { n: assessed }))}
      {cell(t.resources, coverage.resources.length, fill(t.resourceCount, { n: coverage.resources.length }))}
    </dl>
    <p className="mt-2 text-sm">{line}</p>
    <Button variant="ghost" type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-indigo-700"><ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />{t.evidence}</Button>
    {open && <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
      <Evidence title={t.plannedEvidence} items={coverage.planned.topics.map(topic => ({ key: topic.id, text: topic.title }))} none={t.none} />
      <Evidence title={t.taughtEvidence} items={coverage.taught.sections.map(row => ({ key: row.section, text: `${row.section} · ${fill(t.taughtOn, { date: date(row.taughtOn) })}` }))} none={t.none} />
      <Evidence title={t.assessedEvidence} items={coverage.assessed.releases.map(row => ({ key: row.assignmentId, text: `${fill(t.paperVersion, { n: row.paperVersion })} · ${fill(t.questions, { n: row.questions })}` }))} none={t.none} />
      <Evidence title={t.resourceEvidence} items={coverage.resources.map(row => ({ key: row.id, text: row.title }))} none={t.none} />
      {coverage.drafts.length > 0 && <Evidence title={t.draftEvidence} items={coverage.drafts.map(row => ({ key: row.paperId, text: `${row.title} · ${fill(t.questions, { n: row.questions })}` }))} none={t.none} />}
    </div>}
  </li>;
}

function Evidence({ title, items, none }: { title: string; items: Array<{ key: string; text: string }>; none: string }) {
  return <div><p className="text-xs font-semibold text-slate-600">{title}</p>{items.length ? <ul className="list-disc ps-5">{items.map(item => <li key={item.key} dir="auto">{item.text}</li>)}</ul> : <p className="text-xs text-ink-subtle">{none}</p>}</div>;
}

function MappingPanel({ t, view, label, onSaved, onError }: { t: ObjectiveMapCopy; view: MapView; label: (o?: Pick<Objective, "code" | "title">) => React.ReactNode; onSaved: () => Promise<void>; onError: (text: string) => void }) {
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const target = view.mappingTargets.find(item => item.id === targetId);
  const describe = (recordId: string, outcomeId: string) => recordId === view.record.id ? view.objectives.find(row => row.id === outcomeId) : view.mappingTargets.find(item => item.id === recordId)?.objectives.find(row => row.id === outcomeId);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), value = (name: string) => String(form.get(name) ?? "");
    if (!target) return;
    setBusy(true);
    try {
      await call("/api/curriculum/map", { op: "mapping", from: { recordId: view.record.id, version: view.record.version, outcomeId: value("from") }, to: { recordId: target.id, version: target.version, outcomeId: value("to") }, relation: value("relation"), note: value("note") });
      await onSaved();
    } catch (error) { onError(error instanceof Error ? error.message : t.failed); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="mapping-heading" className="space-y-3 rounded-xl border bg-white p-4 text-sm">
    <h2 id="mapping-heading" className="text-base font-semibold">{t.mappings}</h2>
    <p className="text-slate-600">{t.mappingHelp}</p>
    {!view.canDecide ? <p className="text-slate-600">{t.leadOnly}</p> : <form onSubmit={submit} aria-label={t.mappings} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold">{t.from}<Select name="from" required defaultValue=""><option value="" disabled>{t.choose}</option>{view.objectives.map(row => <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ""}{row.title}</option>)}</Select></label>
      <label className="grid gap-1 text-xs font-semibold">{t.target}<Select value={targetId} required onChange={event => setTargetId(event.target.value)}><option value="" disabled>{t.choose}</option>{view.mappingTargets.map(item => <option key={item.id} value={item.id}>{item.title} · {item.board} · v{item.version}</option>)}</Select></label>
      <label className="grid gap-1 text-xs font-semibold">{t.targetObjective}<Select name="to" required defaultValue="" key={targetId} disabled={!target}><option value="" disabled>{t.choose}</option>{target?.objectives.map(row => <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ""}{row.title}</option>)}</Select></label>
      <fieldset className="grid gap-1 text-xs"><legend className="font-semibold">{t.relation}</legend>
        {(["SAME", "PARTIAL", "NOT_EQUIVALENT"] as const).map(value => <label key={value} className="flex min-h-8 items-center gap-2 text-sm"><input type="radio" name="relation" value={value} required />{t.relations[value]}</label>)}</fieldset>
      <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.note}<Input name="note" maxLength={500} /></label>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy || !target}>{t.record}</Button></div>
    </form>}
    <h3 className="text-sm font-semibold">{t.decisions}</h3>
    {view.mappings.length ? <ul className="grid gap-2">{view.mappings.map(row => <li key={row.id} className="rounded-lg bg-slate-50 px-3 py-2">
      {label(describe(row.fromRecordId, row.fromOutcomeId))} <span className="mx-1 rounded-full border px-2 py-0.5 text-xs font-semibold">{t.relations[row.relation]}</span> {label(describe(row.toRecordId, row.toOutcomeId))}
      {row.note && <p className="text-xs text-slate-600" dir="auto">{row.note}</p>}
    </li>)}</ul> : <p className="text-slate-600">{t.noDecisions}</p>}
  </section>;
}
