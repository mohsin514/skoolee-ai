"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { examFormsCopy } from "../../exam-forms-copy";
import { fill } from "../../exam-incident-copy";
import type { StudioSpaceProps } from "../studio-space-registry";
import { SpaceStateRegion, type SpaceState } from "../space-state";

/**
 * SKO-408 Blueprint space, parallel forms (R10). The comparison is structural and says so: forms are
 * never called equally difficult (difficulty is NOT_MEASURED). Identical copies are flagged, the set
 * is assigned whole, and each candidate gets exactly one form before anyone starts.
 */
type Lang = "en" | "ar" | "ur";
type Side = { prompt: string; options: string[]; key: string; marks: number; rubric: string[] };
const LANG_COPY = { en: "langEn", ar: "langAr", ur: "langUr" } as const;
const MISMATCH_COPY: Record<string, "mismatchMarks" | "mismatchKey" | "mismatchType" | "mismatchOutcome" | "missingVersion"> = { MARKS_MISMATCH: "mismatchMarks", KEY_STRUCTURE_MISMATCH: "mismatchKey", TYPE_MISMATCH: "mismatchType", OUTCOME_MAP_MISMATCH: "mismatchOutcome", MISSING_LANGUAGE_VERSION: "missingVersion" };
type Report = {
  id: string; status: string; maxForms: number; difficulty: "NOT_MEASURED";
  forms: Array<{ label: string; language: Lang; original: boolean; recordId: string; title: string; version: number; status: string; items: number; marks: number; outcomes: number; parity: boolean; rehearsed: "CLEAN" | "BLOCKING" | "NONE"; priorExposure: number }>;
  languages: Array<{ label: string; language: Lang; originalLanguage: Lang; recordId: string; blocking: number; agreed: number; items: Array<{ number: number; codes: string[]; untranslated: boolean; original: Side; translated: Side | null }> }>;
  shared: number; differing: number; identical: Array<{ label: string; number: number; referenceNumber: number }>;
  blockers: Array<{ code: string; label: string | null; language: Lang | null; subject: string | null }>; assignable: boolean;
};

const CODE_COPY: Record<string, "codeSections" | "codeMarks" | "codeItemMarks" | "codeAllocation" | "codeCoverage" | "codeBlueprint" | "codeCount" | "codeLanguage"> = {
  SECTION_SET_MISMATCH: "codeSections", SECTION_TOTALS_MISMATCH: "codeSections", MARKS_TOTAL_MISMATCH: "codeMarks", ITEM_MARKS_TOTAL_MISMATCH: "codeItemMarks",
  ITEM_ALLOCATION_MISMATCH: "codeAllocation", OUTCOME_COVERAGE_MISMATCH: "codeCoverage", BLUEPRINT_HASH_MISMATCH: "codeBlueprint", BLUEPRINT_HASH_NOT_RECOMPUTABLE: "codeBlueprint",
  EXCEEDS_POLICY_MAX_FORMS: "codeCount", EXCEEDS_PLATFORM_CEILING: "codeCount",
  MARKS_MISMATCH: "codeLanguage", KEY_STRUCTURE_MISMATCH: "codeLanguage",
};
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function BlueprintSpace({ language, scope, records, capabilities, reload, openTool }: StudioSpaceProps) {
  const t = examFormsCopy(language);
  const papers = useMemo(() => records.filter(record => record.kind === "PAPER" && (!scope.subjectId || record.data.subjectId === scope.subjectId)), [records, scope.subjectId]);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<SpaceState<Report> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const paper = papers.find(record => record.id === selected) ?? papers[0];
  const formSetId = (paper?.data.formSet as { id?: string } | undefined)?.id ?? "";
  const load = useCallback(async () => {
    if (!formSetId) { setState(null); return; }
    setState({ kind: "loading" });
    const response = await fetch(`/api/school-ai/form-sets/${encodeURIComponent(formSetId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setState(response.ok ? { kind: "ready", data: payload.report } : { kind: "error", reason: typeof payload.error === "string" ? payload.error : t.failed, retry: () => void load() });
  }, [formSetId, t.failed]);
  useEffect(() => { void load(); }, [load]);
  if (!paper) return <TaskFeedback kind="empty" title={t.noPapers}><p>{t.intro}</p></TaskFeedback>;
  const post = async (path: string, body?: unknown) => {
    setBusy(true); setNotice(null);
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setNotice({ tone: "error", text: typeof payload.error === "string" ? payload.error : t.failed }); return null; }
    return payload;
  };
  return <div className="space-y-4" data-forms-space>
    <p className="text-sm text-ink-subtle">{t.intro}</p>
    <p className="rounded-xl border border-status-warning-border bg-status-warning-surface p-3 text-sm text-status-warning-text" data-difficulty-claim="NOT_MEASURED">{t.noClaim}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-64 flex-1 gap-1 text-sm font-semibold">{t.paper}<Select aria-label={t.paper} value={paper.id} onChange={event => { setSelected(event.target.value); setNotice(null); }}>{papers.map(record => <option key={record.id} value={record.id}>{record.title} · v{record.version} · {record.status}</option>)}</Select></label>
      <Button variant="outline" onClick={() => openTool?.("curriculum")}>{t.openEditor}</Button>
    </div>
    {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-status-error-border bg-status-error-surface text-status-error-text"}`}><bdi dir="auto">{notice.text}</bdi></p>}
    {!formSetId ? <section className="sk-panel space-y-3 p-5">
      <p className="text-sm">{paper.status === "DRAFT" ? t.createHint : t.draftOnly}</p>
      {paper.status === "DRAFT" && capabilities.canCreate && <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void post(`/api/school-ai/workspace/${encodeURIComponent(paper.id)}/form-set`, { forms: 2 }).then(result => { if (result) reload(); })}>{t.create}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void post(`/api/school-ai/workspace/${encodeURIComponent(paper.id)}/form-set`, { forms: 1 }).then(result => { if (result) reload(); })}>{t.languagesOnly}</Button>
      </div>}
    </section> : state && <SpaceStateRegion state={state} language={language}>{report => <FormSetView report={report} language={language} busy={busy} canCreate={capabilities.canCreate}
      onAdd={body => void post(`/api/school-ai/form-sets/${encodeURIComponent(report.id)}`, body).then(result => { if (result) { reload(); void load(); } })}
      onAssign={async body => { const result = await post(`/api/school-ai/form-sets/${encodeURIComponent(report.id)}/assign`, body); if (result) { setNotice({ tone: "ok", text: [t.assignedLead, ...(result.assigned.assignments as Array<{ label: string; candidates: number }>).map(row => fill(t.assigned, [row.label, new Intl.NumberFormat(language).format(row.candidates)]))].join(" ") }); void load(); } }}
      rosterPaperId={report.forms[0]?.recordId ?? paper.id} />}</SpaceStateRegion>}
  </div>;
}

function FormSetView({ report, language, busy, canCreate, onAdd, onAssign, rosterPaperId }: { report: Report; language: StudioSpaceProps["language"]; busy: boolean; canCreate: boolean; onAdd: (body?: { label: string; language: Lang }) => void; onAssign: (body: Record<string, unknown>) => Promise<void>; rosterPaperId: string }) {
  const t = examFormsCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const status = (value: string) => value === "APPROVED" ? t.approved : value === "IN_REVIEW" ? t.inReview : t.draft;
  const sealed = report.status === "SEALED";
  const formBlockers = report.blockers.filter(blocker => blocker.label);
  const setBlockers = report.blockers.filter(blocker => !blocker.label);
  return <div className="space-y-4">
    <section aria-labelledby="forms-table" className="sk-panel space-y-3 p-4">
      <h3 id="forms-table" className="font-semibold">{t.structure}</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm">
        <thead><tr className="text-xs text-ink-subtle">{[t.formCol, t.language, t.record, t.status, t.items, t.marks, t.outcomes, t.structure, t.rehearsal, t.exposure].map(heading => <th key={heading} className="p-2 text-start">{heading}</th>)}</tr></thead>
        <tbody>{report.forms.map(form => <tr key={form.recordId} className="border-t" data-form={form.original ? form.label : `${form.label}-${form.language}`} data-form-parity={form.parity}>
          <td className="p-2 font-semibold">{fill(t.form, [form.label])}</td><td className="p-2">{t[LANG_COPY[form.language]]}{form.original ? <span className="ms-1 text-xs text-ink-subtle">({t.originalTag})</span> : null}</td><td className="p-2"><bdi dir="auto">{form.title}</bdi> · v{number(form.version)}</td><td className="p-2">{status(form.status)}</td>
          <td className="p-2 tabular-nums">{number(form.items)}</td><td className="p-2 tabular-nums">{number(form.marks)}</td><td className="p-2 tabular-nums">{number(form.outcomes)}</td>
          <td className={`p-2 ${form.parity ? "" : "font-semibold text-status-error-text"}`}>{form.parity ? t.matches : t.differs}</td>
          <td className="p-2">{form.rehearsed === "CLEAN" ? t.clean : form.rehearsed === "BLOCKING" ? t.blocking : t.notRehearsed}</td><td className="p-2 tabular-nums">{number(form.priorExposure)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-sm">{fill(t.sharedCount, [number(report.shared)])} · {fill(t.differingCount, [number(report.differing)])}</p>
      {report.identical.length > 0 && <ul className="grid gap-1 text-sm text-status-warning-text" data-identical-items>{report.identical.map((row, index) => <li key={index}>{fill(t.identical, [row.label, number(row.number), number(row.referenceNumber)])}</li>)}</ul>}
      {!sealed && canCreate && <div className="flex flex-wrap items-end gap-2">
        {new Set(report.forms.map(form => form.label)).size < report.maxForms && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAdd()}>{t.add}</Button>}
        <AddLanguage report={report} language={language} busy={busy} onAdd={onAdd} />
      </div>}
    </section>
    {report.languages.map(version => <LanguageCompare key={version.recordId} version={version} language={language} />)}
    {sealed ? <p role="status" className="sk-panel p-4 text-sm font-semibold">{t.sealed}</p> : report.blockers.length > 0 || !report.assignable
      ? <section role="alert" className="space-y-1 rounded-xl border border-status-warning-border p-3 text-sm"><p className="font-semibold">{t.blockersTitle}</p><ul className="list-disc ps-5">
        {formBlockers.map((blocker, index) => <li key={index} data-blocker={blocker.code}>{fill(t.blocker, [blocker.label!, t[CODE_COPY[blocker.code] ?? "codeOther"]])}</li>)}
        {setBlockers.map((blocker, index) => <li key={`set-${index}`} data-blocker={blocker.code}>{fill(t.blockerSet, [t[CODE_COPY[blocker.code] ?? "codeOther"]])}</li>)}
        {!report.blockers.length && <li>{t.notReady}</li>}</ul></section>
      : <AssignSet language={language} busy={busy} onAssign={onAssign} rosterPaperId={rosterPaperId} />}
  </div>;
}

function AssignSet({ language, busy, onAssign, rosterPaperId }: { language: StudioSpaceProps["language"]; busy: boolean; onAssign: (body: Record<string, unknown>) => Promise<void>; rosterPaperId: string }) {
  const t = examFormsCopy(language);
  const [students, setStudents] = useState<Array<{ id: string; fullName: string; rollNo: string | null }>>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() => localInput(new Date(Date.now() + 3_600_000)));
  const [endsAt, setEndsAt] = useState(() => localInput(new Date(Date.now() + 2 * 3_600_000)));
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => { void fetch(`/api/school-ai/exams?paperId=${encodeURIComponent(rosterPaperId)}`, { cache: "no-store" }).then(response => response.json()).then(payload => setStudents(payload.students ?? [])).catch(() => setStudents([])); }, [rosterPaperId]);
  return <section aria-labelledby="assign-set" className="sk-panel space-y-3 p-4" data-assign-set>
    <h3 id="assign-set" className="font-semibold">{t.assignTitle}</h3>
    <p className="text-sm text-ink-subtle">{t.assignHint}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-sm font-semibold">{t.title}<Input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">{t.startsAt}<Input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">{t.endsAt}<Input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label>
    </div>
    <fieldset className="space-y-1"><legend className="text-sm font-semibold">{t.candidates}</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={students.length > 0 && chosen.length === students.length} onChange={event => setChosen(event.target.checked ? students.map(student => student.id) : [])} />{t.all}</label>
      <div className="grid gap-1 sm:grid-cols-2">{students.map(student => <label key={student.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(student.id)} onChange={event => setChosen(previous => event.target.checked ? [...previous, student.id] : previous.filter(id => id !== student.id))} /><bdi dir="auto">{student.fullName}</bdi></label>)}</div>
    </fieldset>
    <Button disabled={busy || !title.trim() || chosen.length < 2} onClick={() => void onAssign({ idempotencyKey: key, title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), studentIds: chosen, mode: "STANDARD" })}>{t.assign}</Button>
  </section>;
}

function AddLanguage({ report, language, busy, onAdd }: { report: Report; language: StudioSpaceProps["language"]; busy: boolean; onAdd: (body: { label: string; language: Lang }) => void }) {
  const t = examFormsCopy(language);
  const labels = [...new Set(report.forms.map(form => form.label))];
  const [label, setLabel] = useState(labels[0] ?? "A");
  const free = (["en", "ar", "ur"] as const).filter(code => !report.forms.some(form => form.label === label && form.language === code));
  const [lang, setLang] = useState<Lang | "">("");
  const chosen = lang && free.includes(lang) ? lang : free[0];
  if (!free.length) return null;
  return <div className="flex flex-wrap items-end gap-2" data-add-language>
    <label className="grid gap-1 text-xs font-semibold">{t.forForm}<Select aria-label={t.forForm} value={label} onChange={event => setLabel(event.target.value)}>{labels.map(entry => <option key={entry} value={entry}>{fill(t.form, [entry])}</option>)}</Select></label>
    <label className="grid gap-1 text-xs font-semibold">{t.language}<Select aria-label={t.language} value={chosen} onChange={event => setLang(event.target.value as Lang)}>{free.map(code => <option key={code} value={code}>{t[LANG_COPY[code]]}</option>)}</Select></label>
    <Button size="sm" variant="outline" disabled={busy || !chosen} onClick={() => chosen && onAdd({ label, language: chosen })}>{t.addLanguage}</Button>
  </div>;
}

/** R9.3: the original and its translation side by side, item by item, with every structural difference named. */
function LanguageCompare({ version, language }: { version: Report["languages"][number]; language: StudioSpaceProps["language"] }) {
  const t = examFormsCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const side = (value: Side | null, lang: Lang) => value ? <div lang={lang} dir="auto" className="space-y-1">
    <p className="whitespace-pre-wrap">{value.prompt}</p>
    {value.options.length > 0 && <ul className="list-disc ps-5 text-xs">{value.options.map((option, index) => <li key={index}>{option}</li>)}</ul>}
    <p className="text-xs text-ink-subtle">{t.keyLabel}: {value.key || "—"} · {t.marksShort}: {number(value.marks)}</p>
    {value.rubric.length > 0 && <ul className="list-disc ps-5 text-xs text-ink-subtle">{value.rubric.map((row, index) => <li key={index}>{row}</li>)}</ul>}
  </div> : <p className="text-sm text-status-error-text">{t.missingVersion}</p>;
  return <section aria-labelledby={`compare-${version.recordId}`} className="sk-panel space-y-3 p-4" data-language-compare={`${version.label}-${version.language}`}>
    <h3 id={`compare-${version.recordId}`} className="font-semibold">{fill(t.compareTitle, [version.label, t[LANG_COPY[version.language]], t[LANG_COPY[version.originalLanguage]]])}</h3>
    <p className="text-sm text-ink-subtle">{t.compareHint}</p>
    <p className="text-sm">{fill(t.agreed, [number(version.agreed), number(version.items.length)])}</p>
    <ol className="grid gap-2">{version.items.map(item => <li key={item.number} className="rounded-xl border p-3 text-sm" data-language-item={item.number} data-language-codes={item.codes.join(" ")}>
      <p className="mb-2 text-xs font-semibold">{fill(t.form, [version.label])} · #{number(item.number)}{item.codes.map(code => <span key={code} className="ms-2 rounded-full border border-status-error-border px-2 text-status-error-text">{t[MISMATCH_COPY[code] ?? "mismatchKey"]}</span>)}{item.untranslated ? <span className="ms-2 rounded-full border border-status-warning-border px-2 text-status-warning-text">{t.untranslated}</span> : null}</p>
      <div className="grid gap-3 md:grid-cols-2"><div><p className="text-xs font-semibold text-ink-subtle">{t.original}</p>{side(item.original, version.originalLanguage)}</div><div><p className="text-xs font-semibold text-ink-subtle">{t.translated}</p>{side(item.translated, version.language)}</div></div>
    </li>)}</ol>
  </section>;
}
