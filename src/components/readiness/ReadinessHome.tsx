"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ClipboardCheck, FlaskConical, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { getReadinessCopy } from "./readiness-copy";

type Check = { id: string; required: boolean; passed: boolean; evidence: Record<string, number | boolean>; href: string };
type Task = { id: string; key: string; title: string; ownerId: string | null; status: "OPEN" | "DONE" | "DEFERRED" };
type Batch = { id: string; kind: string; state: string; sourceName: string; total: number; accepted: number; rejected: number; unresolved: number; unknownClass: number };
type LeadView = {
  lead: true; readiness: { status: "SETUP" | "READY"; version: number; approvedAt: string | null; rehearsal: Record<string, string> };
  facts: { adoptionMode: "EXAM_STUDIO" | "FULL_OPERATIONS"; students: number; studentsWithoutGuardian: number; openingBalances: number; imports: { batches: Batch[] } };
  checks: Check[]; ready: boolean; nextRequired: string | null; tasks: Task[]; staff: Array<{ id: string; fullName: string; role: string }>;
  locale: { country: string; timezone: string; currency: string };
};
type StaffView = { lead: false; tasks: Task[] };
type Preview = { step: "attendance" | "assessment" | "family"; className: string; campusName: string; timezone: string; currency: string; learners: Array<{ name: string; status: string }>; subjects: string[] };
const STEPS = ["attendance", "assessment", "family"] as const;

async function call(body?: unknown) {
  const response = await fetch("/api/readiness", { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}

export function ReadinessHome() {
  const { language } = useLocale();
  const t = getReadinessCopy(language);
  const rtl = language === "ar" || language === "ur";
  const [view, setView] = useState<LeadView | StaffView | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [newTask, setNewTask] = useState({ title: "", ownerId: "" });

  const load = useCallback(async () => setView(await call()), []);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);
  async function run(work: () => Promise<unknown>, quiet = false) {
    setBusy(true); setStatus(null);
    try { await work(); await load(); if (!quiet) setStatus({ tone: "ok", text: t.saved }); }
    catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); }
    finally { setBusy(false); }
  }
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const owner = (id: string | null) => !view || !view.lead || !id ? t.unassigned : view.staff.find(person => person.id === id)?.fullName ?? t.unassigned;

  const taskRow = (task: Task, lead: boolean) => <li key={task.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center">
    <p className="text-sm"><span className="font-semibold">{t.optionalTasks[task.key] ?? task.title}</span><span className="ms-2 rounded-full border px-2 py-0.5 text-xs">{t.statuses[task.status]}</span></p>
    {lead && view?.lead ? <label className="grid gap-1 text-xs font-semibold">{t.owner}<Select value={task.ownerId ?? ""} disabled={busy} onChange={event => run(() => call({ op: "task", action: "assign", taskId: task.id, ownerId: event.target.value || null }))}>
      <option value="">{t.unassigned}</option>{view.staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></label> : <p className="text-sm text-slate-600">{lead ? `${t.owner}: ${owner(task.ownerId)}` : t.assignedToYou}</p>}
    <div className="flex flex-wrap gap-2">
      {task.status !== "DONE" && <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => call({ op: "task", action: "status", taskId: task.id, status: "DONE" }))}>{t.markDone}</Button>}
      {lead && task.status === "OPEN" && <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => call({ op: "task", action: "status", taskId: task.id, status: "DEFERRED" }))}>{t.defer}</Button>}
      {lead && task.status !== "OPEN" && <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => call({ op: "task", action: "status", taskId: task.id, status: "OPEN" }))}>{t.reopen}</Button>}
    </div>
  </li>;

  return <main lang={language} dir={rtl ? "rtl" : "ltr"} className="mx-auto w-full max-w-5xl min-w-0 space-y-5 p-3 sm:p-6">
    <header className="sk-panel space-y-2 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck aria-hidden="true" className="h-6 w-6 text-[#8127cf]" />{t.title}</h1>
        {view?.lead && <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${view.readiness.status === "READY" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{view.readiness.status === "READY" ? t.statusReady : t.statusSetup}</span>}
      </div>
      <p className="text-sm text-slate-600">{t.intro}</p>
      {view?.lead && <p className="text-sm">{t.mode}: <strong>{t.modes[view.facts.adoptionMode]}</strong> · {t.localeSummary}: <bdi dir="ltr">{view.locale.country} · {view.locale.timezone} · {view.locale.currency}</bdi>{view.readiness.approvedAt ? <> · {t.approvedBy}: {date(view.readiness.approvedAt)}</> : null}</p>}
      {view?.lead && <Link href="/ai?setup=1" className={buttonVariants({ variant: "link", className: "h-auto gap-1 p-0" })}><Sparkles aria-hidden="true" className="h-4 w-4" />{t.aiSetup}</Link>}
    </header>
    {status && <p role={status.tone === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${status.tone === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{status.text}</p>}
    {!view && !status && <p role="status">{t.loading}</p>}

    {view && !view.lead && <section aria-labelledby="my-tasks" className="sk-panel space-y-3 p-4 sm:p-6">
      <h2 id="my-tasks" className="text-lg font-bold">{t.myTasks}</h2><p className="text-sm text-slate-600">{t.myTasksHelp}</p>
      <ul className="space-y-2">{view.tasks.map(task => taskRow(task, false))}</ul>
    </section>}

    {view?.lead && <>
      <section aria-labelledby="next-step" className="sk-panel p-4 sm:p-6">
        <h2 id="next-step" className="text-lg font-bold">{t.next}</h2>
        {view.nextRequired ? <p className="mt-2 flex flex-wrap items-center gap-3 text-sm"><strong>{t.checks[view.nextRequired as keyof typeof t.checks]}</strong>
          <Link className={buttonVariants({ variant: "default" })} href={view.checks.find(check => check.id === view.nextRequired)!.href}>{t.open}</Link></p>
          : <p className="mt-2 text-sm text-emerald-800">{t.allRequiredDone}</p>}
      </section>

      {([true, false] as const).filter(required => view.checks.some(check => check.required === required)).map(required => <section key={String(required)} aria-label={required ? t.required : t.optional} className="sk-panel space-y-3 p-4 sm:p-6">
        <h2 className="text-lg font-bold">{required ? t.required : t.optional}</h2>
        <ul className="space-y-2">{view.checks.filter(check => check.required === required).map(check => <li key={check.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">{check.passed ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" /> : <Circle aria-hidden="true" className="h-5 w-5 text-amber-600" />}{t.checks[check.id as keyof typeof t.checks]}<span className="sr-only"> — {check.passed ? t.passed : t.pending}</span></p>
            <p className="mt-1 text-xs text-slate-600">{Object.entries(check.evidence).map(([key, value]) => <span key={key} className="me-3 inline-block"><bdi dir="ltr">{typeof value === "boolean" ? (value ? t.yes : t.no) : value}</bdi> {t.evidence[key as keyof typeof t.evidence] ?? key}</span>)}</p>
          </div>
          <span className="flex items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${check.passed ? "border-emerald-300 text-emerald-800" : "border-amber-300 text-amber-900"}`}>{check.passed ? t.passed : t.pending}</span>
            {!check.passed && <Link href={check.href} className={buttonVariants({ variant: "outline" })}>{t.open}</Link>}</span>
        </li>)}</ul>
      </section>)}

      <section aria-labelledby="reconcile" className="sk-panel space-y-3 p-4 sm:p-6">
        <h2 id="reconcile" className="text-lg font-bold">{t.reconcileTitle}</h2><p className="text-sm text-slate-600">{t.reconcileHelp}</p>
        {view.facts.imports.batches.length === 0 ? <p className="text-sm">{t.noImports}</p> : <ul className="grid gap-2 sm:grid-cols-2">{view.facts.imports.batches.map(batch => <li key={batch.id} className="rounded-xl border p-3 text-sm">
          <p className="font-semibold"><bdi>{batch.sourceName}</bdi> <span className="text-xs text-slate-500">· {batch.kind} · {batch.state}</span></p>
          <p className="mt-1">{t.source}: <bdi dir="ltr">{batch.total}</bdi> {t.rows} → <bdi dir="ltr">{batch.accepted}</bdi> {t.accepted} · <bdi dir="ltr">{batch.rejected}</bdi> {t.rejected} · <bdi dir="ltr">{batch.unresolved}</bdi> {t.unresolved}{batch.unknownClass ? <> · <strong className="text-rose-800"><bdi dir="ltr">{batch.unknownClass}</bdi> {t.unknownClass}</strong></> : null}</p>
        </li>)}</ul>}
        <p className="rounded-xl bg-slate-50 p-3 text-sm">{t.inSystem}: <bdi dir="ltr">{view.facts.students}</bdi> {t.evidence.students} · <bdi dir="ltr">{view.facts.studentsWithoutGuardian}</bdi> {t.guardiansMissing} · <bdi dir="ltr">{view.facts.openingBalances}</bdi> {t.openingBalances}</p>
      </section>

      <section id="practice" aria-labelledby="practice-heading" className="sk-panel space-y-3 p-4 sm:p-6">
        <h2 id="practice-heading" className="flex items-center gap-2 text-lg font-bold"><FlaskConical aria-hidden="true" className="h-5 w-5" />{t.practiceTitle}</h2>
        <p role="note" className="rounded-xl border border-dashed border-violet-400 bg-violet-50 p-3 text-sm font-semibold text-violet-900">{t.practiceBanner}</p>
        <ol className="grid gap-2 sm:grid-cols-3">{STEPS.map(step => <li key={step} className="rounded-xl border p-3 text-sm">
          <p className="font-semibold">{t.steps[step]}</p>
          {view.readiness.rehearsal[step] && <p className="text-xs text-emerald-800">{t.doneAt}: {date(view.readiness.rehearsal[step])}</p>}
          <Button type="button" variant={view.readiness.rehearsal[step] ? "outline" : "default"} className="mt-2" disabled={busy}
            onClick={() => run(async () => { const result = await call({ op: "rehearse", step }); setPreview(result.preview); }, true)}>{view.readiness.rehearsal[step] ? t.rerun : t.run}</Button>
        </li>)}</ol>
        {preview && <div aria-live="polite" className="space-y-2 rounded-xl border border-violet-300 p-3 text-sm">
          <p className="font-semibold">{t.steps[preview.step]} · {t.classLabel}: <bdi>{preview.className}</bdi> · {t.campusLabel}: <bdi>{preview.campusName}</bdi></p>
          {preview.step === "attendance" && <ul className="space-y-1">{preview.learners.map(learner => <li key={learner.name} className="flex justify-between gap-3"><span>{learner.name}</span><span>{learner.status === "PRESENT" ? t.present : t.absent}</span></li>)}</ul>}
          {preview.step === "assessment" && (preview.subjects.length ? <ul className="list-inside list-disc">{preview.subjects.map(subject => <li key={subject}><bdi>{subject}</bdi></li>)}</ul> : <p>{t.subjectsNone}</p>)}
          {preview.step === "family" && <div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold">{t.familySees}: {preview.learners[0].name}</p>
            <p>{t.attendanceToday}: {t.present} · {t.upcoming}: <bdi>{preview.subjects[0] ?? "—"}</bdi></p>
            <p className="text-xs text-slate-600">{t.timezone}: <bdi dir="ltr">{preview.timezone}</bdi> · {t.currency}: <bdi dir="ltr">{preview.currency}</bdi></p></div>}
        </div>}
      </section>

      <section aria-labelledby="tasks-heading" className="sk-panel space-y-3 p-4 sm:p-6">
        <h2 id="tasks-heading" className="text-lg font-bold">{t.tasksTitle}</h2><p className="text-sm text-slate-600">{t.tasksHelp}</p>
        <ul className="space-y-2">{view.tasks.map(task => taskRow(task, true))}</ul>
        <form className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); run(() => call({ op: "task", action: "create", title: newTask.title, ownerId: newTask.ownerId || null }).then(() => setNewTask({ title: "", ownerId: "" }))); }}>
          <label className="grid gap-1 text-sm font-semibold">{t.newTask}<Input required minLength={3} value={newTask.title} onChange={event => setNewTask({ ...newTask, title: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t.owner}<Select value={newTask.ownerId} onChange={event => setNewTask({ ...newTask, ownerId: event.target.value })}><option value="">{t.unassigned}</option>{view.staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></label>
          <Button type="submit" disabled={busy}>{t.add}</Button>
        </form>
      </section>

      {view.readiness.status !== "READY" && <section aria-labelledby="approve-heading" className="sk-panel space-y-2 p-4 sm:p-6">
        <h2 id="approve-heading" className="text-lg font-bold">{t.approveTitle}</h2><p className="text-sm text-slate-600">{t.approveHelp}</p>
        {!view.ready && <p className="text-sm text-amber-900">{t.approveBlocked}</p>}
        <p className="text-sm"><bdi dir="ltr">{view.tasks.filter(task => task.status === "OPEN").length}</bdi> {t.outstanding}</p>
        <Button type="button" disabled={busy || !view.ready} onClick={() => run(() => call({ op: "approve", expectedVersion: view.readiness.version }))}>{t.approve}</Button>
      </section>}
    </>}
  </main>;
}
