"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { getAssignmentCopy, type AssignmentCopy } from "./assignment-copy";
import { Banner, call, fileHref, formatAt, Pill, RubricTable, shortSha, stateTone, type Criterion, type Feedback, type Receipt, type Score } from "./shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";

// SKO-409 teacher workspace: queue by status, draft editor, release review, marking and return.
type Status = "DRAFT" | "RELEASED" | "CLOSED";
type Summary = { id: string; title: string; status: Status; currentVersion: number | null; dueLocal: string | null; dueAt: string | null; timezone: string | null; rubricVersion: number | null; recipients: number; counts: { submitted: number; needsFeedback: number; late: number; returned: number } };
type ListView = { classId: string; classes: { id: string; name: string; section: string | null }[]; subjects: { id: string; name: string }[]; assignments: Summary[] };
type StaffFeedback = (NonNullable<Feedback> & { status: "DRAFT" | "RETURNED"; gradebookTransfer: string }) | null;
type QueueRow = { studentId: string; name: string; rollNo: string; enrolled: boolean; inAudience: boolean; status: string; effectiveDueAt: string | null; extension: { dueLocal: string; reason: string } | null; versions: (Receipt & { feedback: StaffFeedback })[] };
type Draft = { id: string; title: string; subjectId: string | null; instructions: string; status: Status; submissionMode: "ONLINE" | "PAPER" | "BOTH"; allowedTypes: string[]; opensLocal: string | null; dueLocal: string | null; latePolicy: "ACCEPT_FLAGGED" | "REFUSE"; resubmission: "NEVER" | "AFTER_RETURN"; rubric: Criterion[]; resourceIds: string[]; currentVersion: number | null; updatedAt: string };
type Detail = { assignment: Draft; release: { version: number; dueAt: string; dueLocal: string; timezone: string; rubricVersion: number; audience: string[] } | null; versions: { version: number; releasedAt: string; rubricVersion: number; dueLocal: string; timezone: string; audience: string[] }[]; rubrics: { version: number; criteria: Criterion[]; totalPoints: number }[]; queue: QueueRow[]; resources: { id: string; title: string }[]; newLearners: number };
type Plan = { issues: string[]; timezone: string; dueAt: string | null; dueLocal: string | null; totalPoints: number; nextVersion: number; rubricVersion: number; rubricChanged: boolean; audience: { id: string; name: string; rollNo: string }[]; impact: { earlierSubmissions: number }; policy: { submissionMode: Draft["submissionMode"]; allowedTypes: string[]; latePolicy: Draft["latePolicy"]; resubmission: Draft["resubmission"] } };
type Filter = "ALL" | "DRAFT" | "RELEASED" | "NEEDS_FEEDBACK" | "RETURNED" | "CLOSED";
const FILE_GROUPS = ["PDF", "IMAGE", "WORD", "TEXT"] as const;
const key = () => `w-${crypto.randomUUID()}`;
const matches = (filter: Filter, a: Summary) => filter === "ALL" || (filter === "NEEDS_FEEDBACK" ? a.counts.needsFeedback > 0 : filter === "RETURNED" ? a.counts.returned > 0 : a.status === filter);

/**
 * `createRequest` (incremented by the page's "Create homework" primary action) opens the editor;
 * with `hideCreateButton` the toolbar no longer repeats that action (§4.4: one primary per screen).
 */
export function AssignmentWorkspace({ createRequest, hideCreateButton = false }: { createRequest?: number; hideCreateButton?: boolean } = {}) {
  const { language } = useLocale();
  const t = getAssignmentCopy(language), rtl = language === "ar" || language === "ur";
  const [view, setView] = useState<ListView | null>(null);
  const [classId, setClassId] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState<"new" | "existing" | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => { if (createRequest) { setSelected(null); setEditing("new"); } }, [createRequest]);

  const loadList = useCallback(async () => {
    const data = await call(`/api/assignments${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`);
    setView(data);
    if (!classId) setClassId(data.classId);
  }, [classId]);
  const loadDetail = useCallback(async (id: string) => setDetail(await call(`/api/assignments/${id}`)), []);
  useEffect(() => { setLoadFailed(false); loadList().catch(() => setLoadFailed(true)); }, [loadList]);
  useEffect(() => { if (selected) loadDetail(selected).catch(error => setStatus({ tone: "error", text: error.status === 404 ? t.notAvailable : error.message })); else setDetail(null); }, [selected, loadDetail, t.notAvailable]);

  async function run(work: () => Promise<unknown>, done = t.saved) {
    setBusy(true); setStatus(null);
    try { await work(); await loadList(); if (selected) await loadDetail(selected); setStatus({ tone: "ok", text: done }); return true; }
    catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); return false; }
    finally { setBusy(false); }
  }

  if (!view && loadFailed) return <div dir={rtl ? "rtl" : "ltr"} className="sk-panel"><ErrorState title={t.errorTitle} description={t.failed} retryLabel={t.retry} onRetry={() => { setLoadFailed(false); loadList().catch(() => setLoadFailed(true)); }} /></div>;
  if (!view) return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3"><Banner status={status} />{!status && <SkeletonList rows={3} label={t.loading} />}</div>;
  const totals = { DRAFT: view.assignments.filter(a => a.status === "DRAFT").length, RELEASED: view.assignments.filter(a => a.status === "RELEASED").length, NEEDS_FEEDBACK: view.assignments.reduce((n, a) => n + a.counts.needsFeedback, 0), RETURNED: view.assignments.reduce((n, a) => n + a.counts.returned, 0) };
  const shown = view.assignments.filter(a => matches(filter, a));

  return <div dir={rtl ? "rtl" : "ltr"} className="min-w-0 space-y-4">
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-semibold">{t.class}<Select value={view.classId} onChange={event => { setClassId(event.target.value); setSelected(null); setEditing(null); }}>
        {view.classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` ${klass.section}` : ""}</option>)}</Select></label>
      <label className="grid gap-1 text-xs font-semibold">{t.filter}<Select value={filter} onChange={event => setFilter(event.target.value as Filter)}>
        {(Object.keys(t.filters) as Filter[]).map(value => <option key={value} value={value}>{t.filters[value]}</option>)}</Select></label>
      {!hideCreateButton ? <Button type="button" onClick={() => { setSelected(null); setEditing("new"); }}><Plus aria-hidden />{t.create}</Button> : null}
    </div>
    <nav aria-label={t.filter} className="flex flex-wrap gap-2">
      {(["DRAFT", "RELEASED", "NEEDS_FEEDBACK", "RETURNED"] as const).map(value => <Button key={value} type="button" size="sm" variant="choice" aria-pressed={filter === value} onClick={() => { setFilter(filter === value ? "ALL" : value); setSelected(null); }}>
        <span className="tabular-nums">{totals[value]}</span> {t.filters[value]}</Button>)}
    </nav>
    <Banner status={status} />
    {editing === "new" && <AssignmentEditor t={t} classId={view.classId} subjects={view.subjects} resources={[]} busy={busy} onCancel={() => setEditing(null)} onSave={async body => {
      let createdId = "";
      const ok = await run(async () => { createdId = (await call("/api/assignments", body)).assignment.id; });
      if (ok) { setEditing(null); setSelected(createdId); }
    }} />}
    {selected && detail ? <AssignmentDetail key={selected} t={t} language={language} detail={detail} subjects={view.subjects} busy={busy} editing={editing === "existing"} setEditing={value => setEditing(value ? "existing" : null)} run={run} onBack={() => { setSelected(null); setEditing(null); }} />
      : editing !== "new" && (shown.length === 0
        ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-ink-muted">{view.assignments.length ? t.filteredEmpty : t.empty}</p>
        : <ul className="grid gap-3" aria-label={t.title}>{shown.map(item => <li key={item.id} className="min-w-0 sk-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold [overflow-wrap:anywhere]" dir="auto">{item.title}</p>
              <p className="text-xs text-ink-subtle">{item.dueAt ? `${t.due} ${formatAt(item.dueAt, language, item.timezone)}` : item.dueLocal ? `${t.due} ${item.dueLocal.replace("T", " ")}` : ""}{item.currentVersion ? ` · ${t.version} ${item.currentVersion} · ${t.rubricVersion} ${item.rubricVersion} · ${item.recipients} ${t.recipients}` : ""}</p>
            </div>
            <Pill tone={item.status === "RELEASED" ? "violet" : "neutral"}>{t.statuses[item.status]}</Pill>
          </div>
          {item.status !== "DRAFT" && <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink">
            <span>{item.counts.submitted} {t.counts.submitted}</span>
            <span className={item.counts.needsFeedback ? "font-semibold text-primary" : ""}>{item.counts.needsFeedback} {t.counts.needsFeedback}</span>
            <span className={item.counts.late ? "font-semibold text-status-warning-text" : ""}>{item.counts.late} {t.counts.late}</span>
            <span>{item.counts.returned} {t.counts.returned}</span>
          </p>}
          <div className="mt-3"><Button type="button" variant="outline" size="sm" onClick={() => { setEditing(null); setSelected(item.id); }}>{t.open}<span className="sr-only">: {item.title}</span></Button></div>
        </li>)}</ul>)}
  </div>;
}

function AssignmentEditor({ t, classId, subjects, resources, initial, busy, onCancel, onSave }: { t: AssignmentCopy; classId: string; subjects: { id: string; name: string }[]; resources: { id: string; title: string }[]; initial?: Draft; busy: boolean; onCancel: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [rubric, setRubric] = useState<Criterion[]>(initial?.rubric.length ? initial.rubric : [{ id: "c1", title: "", description: "", maxPoints: 4 }]);
  const [types, setTypes] = useState<string[]>(initial?.allowedTypes ?? ["PDF", "TEXT"]);
  const [picked, setPicked] = useState<string[]>(initial?.resourceIds ?? []);
  const total = rubric.reduce((sum, c) => sum + (Number.isFinite(c.maxPoints) ? c.maxPoints : 0), 0);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), text = (name: string) => String(form.get(name) ?? "");
    void onSave({
      ...(initial ? { expectedUpdatedAt: initial.updatedAt } : { classId }), title: text("title"), subjectId: text("subjectId") || null, instructions: text("instructions"),
      opensLocal: text("opensLocal") || null, dueLocal: text("dueLocal") || null, submissionMode: text("submissionMode"), allowedTypes: types,
      latePolicy: text("latePolicy"), resubmission: text("resubmission"), resourceIds: picked,
      rubric: rubric.map(c => ({ ...c, title: c.title.trim(), description: c.description.trim() })),
    });
  };
  const setCriterion = (index: number, patch: Partial<Criterion>) => setRubric(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <form onSubmit={submit} aria-label={t.editor} className="grid min-w-0 gap-3 sk-panel p-4 sm:grid-cols-2">
    <h2 className="text-base font-semibold sm:col-span-2">{initial ? (initial.status === "DRAFT" ? t.edit : t.editReleased) : t.create}</h2>
    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.assignmentTitle}<Input name="title" dir="auto" required minLength={3} maxLength={160} defaultValue={initial?.title} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.subject}<Select name="subjectId" defaultValue={initial?.subjectId ?? ""}><option value="">{t.noSubject}</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>
    <label className="grid gap-1 text-xs font-semibold">{t.mode}<Select name="submissionMode" defaultValue={initial?.submissionMode ?? "ONLINE"}>{(["ONLINE", "PAPER", "BOTH"] as const).map(m => <option key={m} value={m}>{t.modes[m]}</option>)}</Select></label>
    <div className="grid gap-1 text-xs sm:col-span-2"><label className="grid gap-1 font-semibold">{t.instructions}<Textarea name="instructions" dir="auto" required minLength={10} maxLength={8000} rows={5} defaultValue={initial?.instructions} aria-describedby="asg-instructions-help" className="rounded-md border px-3 py-2 text-sm font-normal" /></label><span id="asg-instructions-help" className="text-ink-muted">{t.instructionsHelp}</span></div>
    <label className="grid gap-1 text-xs font-semibold">{t.opensAt}<Input type="datetime-local" name="opensLocal" defaultValue={initial?.opensLocal ?? ""} /></label>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.dueAt}<Input type="datetime-local" name="dueLocal" required defaultValue={initial?.dueLocal ?? ""} aria-describedby="asg-due-help" /></label><span id="asg-due-help" className="text-ink-muted">{t.dueLocalHelp}</span></div>
    <label className="grid gap-1 text-xs font-semibold">{t.latePolicy}<Select name="latePolicy" defaultValue={initial?.latePolicy ?? "ACCEPT_FLAGGED"}>{(["ACCEPT_FLAGGED", "REFUSE"] as const).map(p => <option key={p} value={p}>{t.latePolicies[p]}</option>)}</Select></label>
    <label className="grid gap-1 text-xs font-semibold">{t.resubmission}<Select name="resubmission" defaultValue={initial?.resubmission ?? "AFTER_RETURN"}>{(["AFTER_RETURN", "NEVER"] as const).map(p => <option key={p} value={p}>{t.resubmissions[p]}</option>)}</Select></label>
    <fieldset className="grid gap-2 text-xs sm:col-span-2"><legend className="mb-1 font-semibold">{t.fileTypes}</legend><div className="flex flex-wrap gap-3">
      {FILE_GROUPS.map(group => <label key={group} className="inline-flex min-h-11 items-center gap-2 text-sm"><Checkbox className="h-4 w-4" checked={types.includes(group)} onChange={event => setTypes(list => event.target.checked ? [...list, group] : list.filter(g => g !== group))} />{t.fileTypeNames[group]}</label>)}
    </div></fieldset>
    {initial && <fieldset className="grid gap-2 text-xs sm:col-span-2"><legend className="mb-1 font-semibold">{t.materials}</legend>
      {resources.length === 0 ? <p className="text-ink-muted">{t.noMaterials}</p> : <div className="flex flex-wrap gap-3">{resources.map(r => <label key={r.id} className="inline-flex min-h-11 items-center gap-2 text-sm"><Checkbox className="h-4 w-4" checked={picked.includes(r.id)} onChange={event => setPicked(list => event.target.checked ? [...list, r.id] : list.filter(id => id !== r.id))} /><span dir="auto">{r.title}</span></label>)}</div>}
    </fieldset>}
    <fieldset className="grid min-w-0 gap-2 sm:col-span-2"><legend className="mb-1 text-sm font-semibold">{t.rubric}</legend>
      <ol className="grid gap-2">{rubric.map((row, index) => <li key={index} className="grid min-w-0 gap-2 rounded-lg bg-surface-subtle p-3 sm:grid-cols-[2fr_1fr_3fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-semibold">{t.criterion} {index + 1}<Input dir="auto" required minLength={2} maxLength={120} value={row.title} onChange={event => setCriterion(index, { title: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.points}<Input type="number" inputMode="numeric" min={1} max={100} required value={Number.isFinite(row.maxPoints) ? row.maxPoints : ""} onChange={event => setCriterion(index, { maxPoints: event.target.valueAsNumber })} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.criterionHelp}<Input dir="auto" maxLength={500} value={row.description} onChange={event => setCriterion(index, { description: event.target.value })} /></label>
        <Button type="button" variant="ghost" size="icon" aria-label={`${t.remove} ${t.criterion} ${index + 1}`} disabled={rubric.length === 1} onClick={() => setRubric(rows => rows.filter((_, i) => i !== index))}><Trash2 aria-hidden /></Button>
      </li>)}</ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={rubric.length >= 20} onClick={() => setRubric(rows => [...rows, { id: `c${Date.now().toString(36)}`, title: "", description: "", maxPoints: 2 }])}><Plus aria-hidden />{t.addCriterion}</Button>
        <p className="text-sm font-semibold tabular-nums" aria-live="polite">{t.total}: {total}</p>
      </div>
    </fieldset>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{t.saveDraft}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function AssignmentDetail({ t, language, detail, subjects, busy, editing, setEditing, run, onBack }: { t: AssignmentCopy; language: string; detail: Detail; subjects: { id: string; name: string }[]; busy: boolean; editing: boolean; setEditing: (value: boolean) => void; run: (work: () => Promise<unknown>, done?: string) => Promise<boolean>; onBack: () => void }) {
  const { assignment, release } = detail;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [learner, setLearner] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const row = detail.queue.find(q => q.studentId === learner) ?? null;
  const openPreview = () => run(async () => setPlan((await call(`/api/assignments/${assignment.id}`, { op: "preview" })).result), "");
  const closePreview = () => { setPlan(null); trigger.current?.focus(); };
  return <section aria-labelledby="asg-detail-title" className="min-w-0 space-y-4">
    <Button type="button" variant="link" className="px-0" onClick={onBack}>{t.back}</Button>
    <header className="min-w-0 sk-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="asg-detail-title" className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]" dir="auto">{assignment.title}</h2>
        <Pill tone={assignment.status === "RELEASED" ? "violet" : "neutral"}>{t.statuses[assignment.status]}{release ? ` · v${release.version}` : ""}</Pill>
      </div>
      {release && <p className="mt-1 text-sm text-ink-muted">{t.due} {formatAt(release.dueAt, language, release.timezone)} ({release.timezone}) · {t.rubricVersion} {release.rubricVersion} · {release.audience.length} {t.recipients}</p>}
      {detail.newLearners > 0 && release && <p className="mt-2 rounded-lg border border-status-warning-border bg-status-warning-surface px-3 py-2 text-sm text-status-warning-text">{detail.newLearners} {t.newLearners}</p>}
      {assignment.status !== "CLOSED" && <div className="mt-3 flex flex-wrap gap-2">
        <Button ref={trigger} type="button" disabled={busy} onClick={openPreview}>{t.preview}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>{assignment.status === "DRAFT" ? t.edit : t.editReleased}</Button>
        {assignment.status === "RELEASED" && <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmClose(true)}>{t.close}</Button>}
      </div>}
    </header>
    <ConfirmAction
      open={confirmClose}
      tone="warning"
      title={t.closeTitle}
      description={t.closeBody}
      confirmLabel={t.close}
      cancelLabel={t.keepOpen}
      busy={busy}
      onCancel={() => setConfirmClose(false)}
      onConfirm={() => { setConfirmClose(false); void run(() => call(`/api/assignments/${assignment.id}`, { op: "close" })); }}
    />
    {editing && <AssignmentEditor t={t} classId={""} subjects={subjects} resources={detail.resources} initial={assignment} busy={busy} onCancel={() => setEditing(false)} onSave={async body => { if (await run(() => call(`/api/assignments/${assignment.id}`, { op: "update", ...body }))) setEditing(false); }} />}
    {plan && <ReleaseReview t={t} language={language} plan={plan} busy={busy} onCancel={closePreview} onRelease={async () => {
      if (await run(() => call(`/api/assignments/${assignment.id}`, { op: "release", expectedVersion: assignment.currentVersion ?? 0 }), t.released)) closePreview();
    }} />}
    {detail.versions.length > 0 && <details className="sk-panel p-4"><summary className="cursor-pointer text-sm font-semibold">{t.history} ({detail.versions.length})</summary>
      <ol className="mt-2 grid gap-1 text-sm">{detail.versions.map(v => <li key={v.version}>{t.version} {v.version} · {formatAt(v.releasedAt, language, v.timezone)} · {t.rubricVersion} {v.rubricVersion} · {t.due} {v.dueLocal.replace("T", " ")} · {v.audience.length} {t.recipients}</li>)}</ol>
    </details>}
    {release && <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section aria-labelledby="asg-queue" className="min-w-0 sk-panel p-4">
        <h3 id="asg-queue" className="mb-2 text-sm font-semibold">{t.queue}</h3>
        <ul className="grid gap-2" aria-label={t.queue}>{detail.queue.map(q => { const latest = q.versions[0]; return <li key={q.studentId}>
          <Button variant="ghost" type="button" aria-current={learner === q.studentId ? "true" : undefined} onClick={() => setLearner(q.studentId)} className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm ${learner === q.studentId ? "border-status-brand-border bg-status-brand-surface" : "border-border-subtle bg-card hover:bg-surface-hover"}`}>
            <span className="min-w-0 font-semibold [overflow-wrap:anywhere]" dir="auto">{q.name}</span>
            <span className="flex flex-wrap gap-1">
              <Pill tone={stateTone(q.status)}>{latest ? `${t.states[q.status as keyof typeof t.states] ?? q.status} · v${latest.version}` : t.notSubmitted}</Pill>
              {latest?.late && <Pill tone="amber">{t.lateTag}</Pill>}
              {latest?.mode === "PAPER" && <Pill>{t.paperTag}</Pill>}
              {q.extension && <Pill tone="green">{t.extended}</Pill>}
              {!q.enrolled && <Pill tone="red">{t.leftClass}</Pill>}
            </span>
          </Button>
        </li>; })}</ul>
      </section>
      {row && <Marking key={row.studentId} t={t} language={language} assignmentId={assignment.id} timezone={release.timezone} row={row} rubrics={detail.rubrics} busy={busy} run={run} closed={assignment.status === "CLOSED"} />}
    </div>}
  </section>;
}

function ReleaseReview({ t, language, plan, busy, onCancel, onRelease }: { t: AssignmentCopy; language: string; plan: Plan; busy: boolean; onCancel: () => void; onRelease: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const issuesId = useId();
  useEffect(() => { heading.current?.focus(); }, []);
  return <div role="dialog" aria-modal="false" aria-labelledby="asg-review-title" className="min-w-0 sk-panel sk-gradient-border p-4" onKeyDown={event => { if (event.key === "Escape") onCancel(); }}>
    <h3 id="asg-review-title" ref={heading} tabIndex={-1} className="text-base font-semibold">{t.previewTitle} — {t.releaseNew} {plan.nextVersion}</h3>
    <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="font-semibold">{t.due}</dt><dd>{plan.dueAt ? `${formatAt(plan.dueAt, language, plan.timezone)} (${plan.timezone})` : "—"}</dd>
      <dt className="font-semibold">{t.mode}</dt><dd>{t.modes[plan.policy.submissionMode]}{plan.policy.allowedTypes.length ? ` · ${plan.policy.allowedTypes.map(g => t.fileTypeNames[g as keyof typeof t.fileTypeNames] ?? g).join(", ")}` : ""}</dd>
      <dt className="font-semibold">{t.latePolicy}</dt><dd>{t.latePolicies[plan.policy.latePolicy]}</dd>
      <dt className="font-semibold">{t.resubmission}</dt><dd>{t.resubmissions[plan.policy.resubmission]}</dd>
      <dt className="font-semibold">{t.rubric}</dt><dd>{t.rubricVersion} {plan.rubricVersion} · {plan.rubricChanged ? t.rubricNew : t.rubricSame} · {t.total} {plan.totalPoints}</dd>
    </dl>
    {plan.impact.earlierSubmissions > 0 && <Alert tone="warning" compact live="off" className="mt-3">{plan.impact.earlierSubmissions} {t.impact}</Alert>}
    <details className="mt-3" open={plan.audience.length <= 8}><summary className="cursor-pointer text-sm font-semibold">{t.audience} ({plan.audience.length})</summary>
      <ul className="mt-1 grid gap-0.5 text-sm sm:grid-cols-2">{plan.audience.map(a => <li key={a.id} dir="auto">{a.name}</li>)}</ul></details>
    {plan.issues.length > 0 && <Alert id={issuesId} tone="danger" title={t.blocked} className="mt-3"><ul className="list-disc ps-5">{plan.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></Alert>}
    <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button><Button type="button" loading={busy} disabled={busy || plan.issues.length > 0} aria-describedby={plan.issues.length > 0 ? issuesId : undefined} onClick={onRelease}>{t.release}</Button></div>
  </div>;
}

function Marking({ t, language, assignmentId, timezone, row, rubrics, busy, run, closed }: { t: AssignmentCopy; language: string; assignmentId: string; timezone: string; row: QueueRow; rubrics: Detail["rubrics"]; busy: boolean; run: (work: () => Promise<unknown>, done?: string) => Promise<boolean>; closed: boolean }) {
  const [versionId, setVersionId] = useState(row.versions[0]?.id ?? "");
  const version = row.versions.find(v => v.id === versionId) ?? row.versions[0];
  const criteria = rubrics.find(r => r.version === version?.rubricVersion)?.criteria ?? [];
  const [scores, setScores] = useState<Score[]>(() => criteria.map(c => version?.feedback?.criteria.find(s => s.criterionId === c.id) ?? { criterionId: c.id, points: null, comment: "" }));
  const [comment, setComment] = useState(version?.feedback?.comment ?? "");
  const [gradebook, setGradebook] = useState(version?.feedback?.gradebookTransfer === "REQUESTED");
  const [revision, setRevision] = useState(false);
  const [paperKey, setPaperKey] = useState(key);
  const total = scores.reduce((n, s) => n + (s.points ?? 0), 0), max = criteria.reduce((n, c) => n + c.maxPoints, 0);
  const returned = version?.feedback?.status === "RETURNED";
  const post = (body: Record<string, unknown>) => call(`/api/assignments/${assignmentId}`, body);
  const feedbackBody = { submissionVersionId: version?.id, scores, comment, requestGradebookTransfer: gradebook };
  const switchTo = (id: string) => {
    const next = row.versions.find(v => v.id === id)!, nextCriteria = rubrics.find(r => r.version === next.rubricVersion)?.criteria ?? [];
    setVersionId(id); setComment(next.feedback?.comment ?? ""); setGradebook(next.feedback?.gradebookTransfer === "REQUESTED");
    setScores(nextCriteria.map(c => next.feedback?.criteria.find(s => s.criterionId === c.id) ?? { criterionId: c.id, points: null, comment: "" }));
  };
  return <section aria-labelledby="asg-marking" className="min-w-0 space-y-3 sk-panel p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 id="asg-marking" className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]" dir="auto">{row.name}</h3>
      {row.versions.length > 1 && <label className="grid gap-1 text-xs font-semibold">{t.version}<Select value={version?.id} onChange={event => switchTo(event.target.value)}>{row.versions.map(v => <option key={v.id} value={v.id}>{t.version} {v.version}</option>)}</Select></label>}
    </div>
    {row.extension && <p className="text-sm text-status-success-text">{t.extended}: {row.extension.dueLocal.replace("T", " ")} — <span dir="auto">{row.extension.reason}</span></p>}
    {version ? <>
      <div className="rounded-lg bg-surface-subtle p-3 text-sm">
        <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{t.receipt} <bdi>{version.receiptCode}</bdi></span>{version.late && <Pill tone="amber">{t.lateTag}</Pill>}{version.mode === "PAPER" && <Pill>{t.paperTag}</Pill>}</p>
        <p className="text-xs text-ink-muted">{version.mode === "PAPER" ? t.receivedAt : t.submittedAt} {formatAt(version.receivedAt, language, timezone)} · {t.version} {version.assignmentVersion} · {t.rubricVersion} {version.rubricVersion} · {t.checksum} <bdi className="font-mono">{shortSha(version.artifactSha256)}</bdi></p>
        {version.text && <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]" dir="auto">{version.text}</p>}
        {version.file && <a className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline" href={fileHref(assignmentId, version.id)}><Download className="h-4 w-4" aria-hidden />{t.download}: <bdi>{version.file.name}</bdi></a>}
      </div>
      {returned ? <div className="space-y-2">
        <p className="text-sm font-semibold text-status-success-text">{t.returnedOn} {formatAt(version.feedback!.returnedAt, language, timezone)}{version.feedback!.gradebookTransfer === "REQUESTED" ? ` · ${t.gradebookRequested}` : ""}</p>
        <RubricTable criteria={criteria} scores={version.feedback!.criteria} labels={{ criterion: t.criterion, points: t.points, comment: t.criterionComment, total: t.total, outOf: t.outOf }} />
        {version.feedback!.comment && <p className="text-sm" dir="auto">{version.feedback!.comment}</p>}
        {row.status === "RETURNED" && version.id === row.versions[0].id && !closed && <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => post({ op: "reopen", studentId: row.studentId }))}>{t.reopen}</Button>}
      </div> : <form aria-label={t.feedback} className="space-y-3" onSubmit={event => { event.preventDefault(); void run(() => post({ op: "return", ...feedbackBody, allowRevision: revision }), t.returnedNote); }}>
        <p className="text-xs text-ink-muted">{t.markingDraft}</p>
        <ol className="grid gap-2">{criteria.map((c, index) => <li key={c.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0"><p className="text-sm font-semibold" dir="auto">{c.title}</p>{c.description && <p className="text-xs text-ink-subtle" dir="auto">{c.description}</p>}</div>
          <label className="grid gap-1 text-xs font-semibold">{t.points} ({t.outOf} {c.maxPoints})<Input type="number" inputMode="numeric" min={0} max={c.maxPoints} className="w-24" value={scores[index]?.points ?? ""} aria-label={`${c.title}: ${t.points} ${t.outOf} ${c.maxPoints}`}
            onChange={event => setScores(list => list.map((s, i) => i === index ? { ...s, points: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null } : s))} /></label>
          <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.criterionComment}<Input dir="auto" maxLength={2000} value={scores[index]?.comment ?? ""} onChange={event => setScores(list => list.map((s, i) => i === index ? { ...s, comment: event.target.value } : s))} /></label>
        </li>)}</ol>
        <p className="text-sm font-semibold tabular-nums">{t.total}: {total} / {max} · {t.formative}</p>
        <label className="grid gap-1 text-xs font-semibold">{t.overallComment}<Textarea dir="auto" rows={3} maxLength={4000} value={comment} onChange={event => setComment(event.target.value)} className="rounded-md border px-3 py-2 text-sm font-normal" /></label>
        <label className="flex min-h-11 items-start gap-2 text-sm"><Checkbox className="mt-1 h-4 w-4" checked={gradebook} onChange={event => setGradebook(event.target.checked)} />{t.gradebook}</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox className="h-4 w-4" checked={revision} onChange={event => setRevision(event.target.checked)} />{t.allowRevision}</label>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{t.returnFeedback}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => run(() => post({ op: "feedback", ...feedbackBody }))}>{t.saveMarking}</Button></div>
      </form>}
    </> : <p className="text-sm text-ink-muted">{t.notSubmitted}</p>}
    {!closed && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{t.extension}</summary>
      <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => post({ op: "extension", studentId: row.studentId, dueLocal: String(form.get("dueLocal")), reason: String(form.get("reason")) })); }}>
        <label className="grid gap-1 text-xs font-semibold">{t.newDue}<Input type="datetime-local" name="dueLocal" required /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.reason}<Input name="reason" dir="auto" required minLength={3} maxLength={500} /></label>
        <div><Button type="submit" variant="outline" disabled={busy}>{t.grant}</Button></div>
      </form></details>}
    {!closed && row.status !== "RETURNED" && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{t.paper}</summary>
      <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => post({ op: "paper", studentId: row.studentId, note: String(form.get("note")), receivedLocal: String(form.get("receivedLocal")) || null, idempotencyKey: paperKey })).then(ok => { if (ok) setPaperKey(key()); }); }}>
        <label className="grid gap-1 text-xs font-semibold">{t.paperNote}<Input name="note" dir="auto" required minLength={3} maxLength={2000} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.receivedLocal}<Input type="datetime-local" name="receivedLocal" /></label>
        <div><Button type="submit" variant="outline" disabled={busy}>{t.record}</Button></div>
      </form></details>}
  </section>;
}
