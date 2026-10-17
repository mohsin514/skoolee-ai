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
type Report = {
  id: string; status: string; maxForms: number; difficulty: "NOT_MEASURED";
  forms: Array<{ label: string; recordId: string; title: string; version: number; status: string; items: number; marks: number; outcomes: number; parity: boolean; rehearsed: "CLEAN" | "BLOCKING" | "NONE"; priorExposure: number }>;
  shared: number; differing: number; identical: Array<{ label: string; number: number; referenceNumber: number }>;
  blockers: Array<{ code: string; label: string | null; subject: string | null }>; assignable: boolean;
};

const CODE_COPY: Record<string, "codeSections" | "codeMarks" | "codeItemMarks" | "codeAllocation" | "codeCoverage" | "codeBlueprint" | "codeCount"> = {
  SECTION_SET_MISMATCH: "codeSections", SECTION_TOTALS_MISMATCH: "codeSections", MARKS_TOTAL_MISMATCH: "codeMarks", ITEM_MARKS_TOTAL_MISMATCH: "codeItemMarks",
  ITEM_ALLOCATION_MISMATCH: "codeAllocation", OUTCOME_COVERAGE_MISMATCH: "codeCoverage", BLUEPRINT_HASH_MISMATCH: "codeBlueprint", BLUEPRINT_HASH_NOT_RECOMPUTABLE: "codeBlueprint",
  EXCEEDS_POLICY_MAX_FORMS: "codeCount", EXCEEDS_PLATFORM_CEILING: "codeCount",
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
      {paper.status === "DRAFT" && capabilities.canCreate && <Button disabled={busy} onClick={() => void post(`/api/school-ai/workspace/${encodeURIComponent(paper.id)}/form-set`).then(result => { if (result) reload(); })}>{t.create}</Button>}
    </section> : state && <SpaceStateRegion state={state} language={language}>{report => <FormSetView report={report} language={language} busy={busy} canCreate={capabilities.canCreate}
      onAdd={() => void post(`/api/school-ai/form-sets/${encodeURIComponent(report.id)}`).then(result => { if (result) { reload(); void load(); } })}
      onAssign={async body => { const result = await post(`/api/school-ai/form-sets/${encodeURIComponent(report.id)}/assign`, body); if (result) { setNotice({ tone: "ok", text: [t.assignedLead, ...(result.assigned.assignments as Array<{ label: string; candidates: number }>).map(row => fill(t.assigned, [row.label, new Intl.NumberFormat(language).format(row.candidates)]))].join(" ") }); void load(); } }}
      rosterPaperId={report.forms[0]?.recordId ?? paper.id} />}</SpaceStateRegion>}
  </div>;
}

function FormSetView({ report, language, busy, canCreate, onAdd, onAssign, rosterPaperId }: { report: Report; language: StudioSpaceProps["language"]; busy: boolean; canCreate: boolean; onAdd: () => void; onAssign: (body: Record<string, unknown>) => Promise<void>; rosterPaperId: string }) {
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
        <thead><tr className="text-xs text-ink-subtle">{[t.formCol, t.record, t.status, t.items, t.marks, t.outcomes, t.structure, t.rehearsal, t.exposure].map(heading => <th key={heading} className="p-2 text-start">{heading}</th>)}</tr></thead>
        <tbody>{report.forms.map(form => <tr key={form.label} className="border-t" data-form={form.label} data-form-parity={form.parity}>
          <td className="p-2 font-semibold">{fill(t.form, [form.label])}</td><td className="p-2"><bdi dir="auto">{form.title}</bdi> · v{number(form.version)}</td><td className="p-2">{status(form.status)}</td>
          <td className="p-2 tabular-nums">{number(form.items)}</td><td className="p-2 tabular-nums">{number(form.marks)}</td><td className="p-2 tabular-nums">{number(form.outcomes)}</td>
          <td className={`p-2 ${form.parity ? "" : "font-semibold text-status-error-text"}`}>{form.parity ? t.matches : t.differs}</td>
          <td className="p-2">{form.rehearsed === "CLEAN" ? t.clean : form.rehearsed === "BLOCKING" ? t.blocking : t.notRehearsed}</td><td className="p-2 tabular-nums">{number(form.priorExposure)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-sm">{fill(t.sharedCount, [number(report.shared)])} · {fill(t.differingCount, [number(report.differing)])}</p>
      {report.identical.length > 0 && <ul className="grid gap-1 text-sm text-status-warning-text" data-identical-items>{report.identical.map((row, index) => <li key={index}>{fill(t.identical, [row.label, number(row.number), number(row.referenceNumber)])}</li>)}</ul>}
      {!sealed && canCreate && report.forms.length < report.maxForms && <Button size="sm" variant="outline" disabled={busy} onClick={onAdd}>{t.add}</Button>}
    </section>
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
