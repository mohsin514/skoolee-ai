"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2, Circle, ClipboardCheck, Coins, FlaskConical, Info, ListChecks, Rocket, Users, Building2, type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { AccessNotice } from "@/components/ui/access-notice";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SkeletonList } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { FlagshipChip } from "@/components/ui/flagship";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { useLocale } from "@/components/locale/LocaleProvider";
import { getReadinessCopy } from "./readiness-copy";
import { getLaunchCopy } from "./readiness-launch-copy";
import { SetupPrompt } from "@/components/ai-workflows/setup-prompt";

/**
 * School readiness as "launch control": a hero with the share of required checks done, a spotlight on the
 * one next step, the checks as a journey (Foundation → People → Money & data → Rehearse) with why each
 * matters and an Open that lands where the person can act, then practice, reconciliation and follow-ups,
 * and a go-live bar once everything required is done.
 *
 * Rendered in three places, always inside a console that already owns <main>: the framed /setup/readiness page
 * (RoleFrame) and the `setup` tab of the group admin's Settings and the school admin's School settings. On its own
 * page it opens with the one PageHeader (h1); inside a settings tab the console's PageHeader is the h1, so the
 * hero heading drops to h2. Feedback follows R4: a load failure is an inline ErrorState with retry, an action
 * result is a toast, and go-live approval waits behind a ConfirmAction.
 */
type Check = { id: string; required: boolean; passed: boolean; evidence: Record<string, number | boolean>; href: string | null; delegated?: boolean; handledElsewhere?: boolean };
type Task = { id: string; key: string; title: string; ownerId: string | null; status: "OPEN" | "DONE" | "DEFERRED" };
type Batch = { id: string; kind: string; state: string; sourceName: string; total: number; accepted: number; rejected: number; unresolved: number; unknownClass: number };
type LeadView = {
  lead: true; readiness: { status: "SETUP" | "READY"; version: number; approvedAt: string | null; rehearsal: Record<string, string> };
  facts: { adoptionMode: "EXAM_STUDIO" | "FULL_OPERATIONS"; students: number; studentsWithoutGuardian: number; openingBalances: number; imports: { batches: Batch[] } };
  checks: Check[]; ready: boolean; campuses: CampusStatus[]; nextRequired: string | null; tasks: Task[]; staff: Array<{ id: string; fullName: string; role: string }>;
  locale: { country: string; timezone: string; currency: string };
  aiSetup?: boolean;
};
type CampusStatus = { id: string; name: string; classes: number; students: number; ready: boolean };
type StaffView = { lead: false; tasks: Task[] };
type Preview = { step: "attendance" | "assessment" | "family"; className: string; campusName: string; timezone: string; currency: string; learners: Array<{ name: string; status: string }>; subjects: string[] };
const STEPS = ["attendance", "assessment", "family"] as const;
const PHASES: { key: "foundation" | "people" | "money" | "rehearse"; icon: LucideIcon; checks: string[] }[] = [
  { key: "foundation", icon: Building2, checks: ["campus", "locale", "academic", "campusCoverage"] },
  { key: "people", icon: Users, checks: ["staff", "roster", "guardians"] },
  { key: "money", icon: Coins, checks: ["fees", "imports"] },
  { key: "rehearse", icon: FlaskConical, checks: ["rehearsal"] },
];
const fill = (template: string, ...values: (string | number)[]) => template.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ""));

class ReadinessError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function call(body?: unknown) {
  const response = await fetch("/api/readiness", { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReadinessError(typeof data.error === "string" ? data.error : "Request failed", response.status);
  return data;
}

export function ReadinessHome() {
  const { language } = useLocale();
  const t = getReadinessCopy(language);
  const l = getLaunchCopy(language);
  const rtl = language === "ar" || language === "ur";
  // Own page (/setup/readiness) vs a settings tab inside a console: decides the heading level and the PageHeader.
  const standalone = (usePathname() ?? "").startsWith("/setup/readiness");
  const [view, setView] = useState<LeadView | StaffView | null>(null);
  const [loadFailed, setLoadFailed] = useState<"denied" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [newTask, setNewTask] = useState({ title: "", ownerId: "" });

  const load = useCallback(async () => {
    try { setView(await call()); setLoadFailed(null); }
    catch (error) { setLoadFailed(error instanceof ReadinessError && error.status === 403 ? "denied" : "error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(work: () => Promise<unknown>, quiet = false) {
    setBusy(true);
    try { await work(); await load(); if (!quiet) toast.success(t.saved); return true; }
    catch (error) { toast.error(error); }
    finally { setBusy(false); }
  }
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const owner = (id: string | null) => !view || !view.lead || !id ? t.unassigned : view.staff.find(person => person.id === id)?.fullName ?? t.unassigned;
  const checkTitle = (id: string) => t.checks[id as keyof typeof t.checks] ?? id;
  /** Who finishes a check the viewer has no screen for (P9-08): campus admins (group admin), or the campus team. */
  const handoff = (check: Check) => check.delegated || check.handledElsewhere ? (
    <p className="flex items-start gap-1.5 text-xs font-semibold text-status-info-text"><Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{check.delegated ? l.delegated : l.handledElsewhere}</p>
  ) : null;

  /** Each campus with what it has, so a group sees which campus still blocks go-live (SKAI-154). */
  const campusList = (campuses: CampusStatus[]) => (
    <div className="space-y-1.5 pt-1">
      <p className="text-xs font-semibold text-ink-strong">{t.campusesTitle}</p>
      <p className="text-xs text-ink-muted">{t.campusesHelp}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2" aria-label={t.campusesTitle}>
        {campuses.map(campus => (
          <li key={campus.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2" data-campus-ready={campus.ready || undefined}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink-strong">{campus.name}</span>
              <span className="text-xs text-ink-muted"><bdi dir="ltr">{campus.classes}</bdi> {t.campusClasses} · <bdi dir="ltr">{campus.students}</bdi> {t.campusPupils}</span>
            </span>
            <span className="sk-choice-tag" data-tone={campus.ready ? undefined : "info"}>{campus.ready ? t.campusReadyTag : t.campusWaitingTag}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const taskRow = (task: Task, lead: boolean) => (
    <li key={task.id} className="sk-launch-task" data-status={task.status}>
      <div className="min-w-0">
        <p className="font-semibold text-ink-strong">{t.optionalTasks[task.key] ?? task.title}</p>
        <span className="sk-choice-tag mt-1" data-tone={task.status === "DONE" ? undefined : task.status === "DEFERRED" ? "brand" : "info"}>{t.statuses[task.status]}</span>
      </div>
      {lead && view?.lead ? (
        <label className="grid gap-1 text-xs font-semibold text-ink-muted">{t.owner}
          <Select value={task.ownerId ?? ""} disabled={busy} onChange={event => run(() => call({ op: "task", action: "assign", taskId: task.id, ownerId: event.target.value || null }))}>
            <option value="">{t.unassigned}</option>{view.staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </Select>
        </label>
      ) : <p className="text-sm text-ink-muted">{lead ? `${t.owner}: ${owner(task.ownerId)}` : t.assignedToYou}</p>}
      <div className="flex flex-wrap gap-2">
        {task.status !== "DONE" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run(() => call({ op: "task", action: "status", taskId: task.id, status: "DONE" }))}>{t.markDone}</Button>}
        {lead && task.status === "OPEN" && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => call({ op: "task", action: "status", taskId: task.id, status: "DEFERRED" }))}>{t.defer}</Button>}
        {lead && task.status !== "OPEN" && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => call({ op: "task", action: "status", taskId: task.id, status: "OPEN" }))}>{t.reopen}</Button>}
      </div>
    </li>
  );

  const lead = view?.lead ? view : null;
  const required = lead ? lead.checks.filter(check => check.required) : [];
  const doneRequired = required.filter(check => check.passed).length;
  const percent = required.length ? Math.round((doneRequired / required.length) * 100) : 0;
  const next = lead?.nextRequired ? lead.checks.find(check => check.id === lead.nextRequired) ?? null : null;
  const live = lead?.readiness.status === "READY";

  return (
    <div lang={language} dir={rtl ? "rtl" : "ltr"} className="sk-launch" data-readiness>
      {/* Copy is already in the reader's language (readiness-copy.ts), so it goes in as nodes and is not looked up again. */}
      {standalone ? <PageHeader title={<>{t.title}</>} description={<>{t.intro}</>} icon={Rocket} /> : null}

      {/* Group owners finish first-login setup here (AI Workflows Slice 8; this page was a dead end). */}
      <SetupPrompt />

      {/* ── Hero (once the view is known, so a denied reader never sees a status that is not theirs) ── */}
      {view ? <section aria-labelledby="readiness-status" className="sk-launch-hero">
        <div className="min-w-0 space-y-3">
          {standalone ? null : <p className="sk-eyebrow text-primary">{t.title}</p>}
          <h2 id="readiness-status" className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{live ? l.liveTitle : t.statusSetup}</h2>
          {live || !standalone ? <p className="max-w-[60ch] text-sm leading-relaxed text-ink-muted">{live ? l.liveBody : t.intro}</p> : null}
          {lead ? (
            <div className="flex flex-wrap gap-2">
              <span className="sk-choice-tag" data-tone="brand">{t.modes[lead.facts.adoptionMode]}</span>
              <span className="sk-choice-tag" data-tone="info"><bdi dir="ltr">{lead.locale.country} · {lead.locale.timezone} · {lead.locale.currency}</bdi></span>
              {lead.readiness.approvedAt ? <span className="sk-choice-tag">{t.approvedBy}: {date(lead.readiness.approvedAt)}</span> : null}
            </div>
          ) : null}
          {/* Flagship (addendum 2026-10-22): the AI setup questionnaire drafts what these checks ask for; a secondary link
              here because the spotlight below carries this screen's one primary action. */}
          {lead?.aiSetup && !live ? <Link href="/ai?setup=1" data-flagship-link="ai-workflows" className={buttonVariants({ variant: "link", className: "h-auto gap-2 p-0" })}><FlagshipChip />{t.aiSetup}</Link> : null}
        </div>
        {lead ? (
          <div className="sk-launch-ring" style={{ ["--sk-ring-value" as string]: `${percent}%` }} role="img" aria-label={fill(l.progress, doneRequired, required.length)}>
            <div className="sk-launch-ring-inner">
              <span className="text-3xl font-bold text-ink-strong tabular-nums"><bdi dir="ltr">{percent}%</bdi></span>
              <span className="text-xs font-semibold text-ink-muted">{l.percentLabel}</span>
            </div>
          </div>
        ) : null}
      </section> : null}

      {loadFailed === "denied" && !view ? <AccessNotice reason={t.denied} /> : null}
      {loadFailed === "error" && !view ? <ErrorState title={t.failedTitle} description={t.failed} onRetry={load} /> : null}
      {!view && !loadFailed ? <SkeletonList rows={4} label={t.loading} /> : null}

      {view && !view.lead ? (
        <section aria-labelledby="my-tasks" className="sk-panel space-y-3 p-4 sm:p-6">
          <h2 id="my-tasks" className="text-lg font-bold text-ink-strong">{t.myTasks}</h2>
          <p className="text-sm text-ink-muted">{t.myTasksHelp}</p>
          <ul className="space-y-2">{view.tasks.map(task => taskRow(task, false))}</ul>
        </section>
      ) : null}

      {lead ? <>
        <nav aria-label={l.sectionsLabel} className="sk-launch-nav">
          <a href="#checks"><ListChecks aria-hidden="true" className="size-4" />{l.nav.checks}</a>
          <a href="#practice"><FlaskConical aria-hidden="true" className="size-4" />{l.nav.practice}</a>
          <a href="#reconcile"><ClipboardCheck aria-hidden="true" className="size-4" />{l.nav.reconcile}</a>
          <a href="#tasks"><Rocket aria-hidden="true" className="size-4" />{l.nav.tasks}</a>
        </nav>

        {/* ── Spotlight: the one next step ── */}
        <section aria-labelledby="next-step" className="sk-launch-spotlight" data-done={!next || undefined}>
          {next ? <>
            <div className="min-w-0 space-y-1">
              <p id="next-step" className="sk-eyebrow">{l.nextEyebrow}</p>
              <p className="text-xl font-bold text-ink-strong">{checkTitle(next.id)}</p>
              <p className="text-sm text-ink-muted">{l.why[next.id as keyof typeof l.why]}</p>
              {handoff(next)}
            </div>
            {next.href ? <Link href={next.href} className={buttonVariants({ variant: "default", className: "shrink-0 gap-2" })}>{t.open} <ForwardArrow /></Link> : null}
          </> : <>
            <div className="min-w-0 space-y-1">
              <p id="next-step" className="sk-eyebrow">{l.nextEyebrow}</p>
              <p className="text-xl font-bold text-ink-strong">{live ? l.liveTitle : l.allDoneTitle}</p>
              <p className="text-sm text-ink-muted">{live ? l.liveBody : l.allDoneBody}</p>
            </div>
            {!live ? <Button type="button" disabled={busy || !lead.ready} onClick={() => setConfirmingApproval(true)} className="shrink-0 gap-2"><Rocket aria-hidden="true" className="size-4" />{l.goApprove}</Button> : null}
          </>}
        </section>

        {/* ── The journey ── */}
        <section id="checks" aria-label={l.nav.checks} className="sk-launch-journey">
          {PHASES.map(phase => {
            const checks = phase.checks.map(id => lead.checks.find(check => check.id === id)).filter((check): check is Check => Boolean(check));
            if (!checks.length) return null;
            const PhaseIcon = phase.icon;
            const phaseDone = checks.every(check => check.passed || !check.required);
            return (
              <div key={phase.key} className="sk-launch-phase" data-done={phaseDone || undefined}>
                <h2 className="sk-launch-phase-title"><span className="sk-launch-phase-icon" aria-hidden="true"><PhaseIcon className="size-4" /></span>{l.phases[phase.key]}</h2>
                <ul className="sk-launch-checks">
                  {checks.map(check => (
                    <li key={check.id} className="sk-launch-check" data-passed={check.passed || undefined} data-next={check.id === lead.nextRequired || undefined}>
                      <span className="sk-launch-check-dot" aria-hidden="true">{check.passed ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}</span>
                      <div className="min-w-0 space-y-1.5">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-strong">
                          {checkTitle(check.id)}
                          <span className="sr-only"> — {check.passed ? t.passed : t.pending}</span>
                          {!check.required ? <span className="sk-choice-tag" data-tone="brand">{l.optionalTag}</span> : null}
                        </p>
                        <p className="text-xs leading-relaxed text-ink-muted">{l.why[check.id as keyof typeof l.why]}</p>
                        <p className="flex flex-wrap gap-1.5">
                          {Object.entries(check.evidence).map(([key, value]) => (
                            <span key={key} className="sk-launch-chip"><bdi dir="ltr" className="font-bold">{typeof value === "boolean" ? (value ? t.yes : t.no) : value}</bdi> {t.evidence[key as keyof typeof t.evidence] ?? key}</span>
                          ))}
                        </p>
                        {check.id === "campusCoverage" && lead.campuses.length ? campusList(lead.campuses) : null}
                        {!check.passed ? handoff(check) : null}
                      </div>
                      <div className="sk-launch-check-action">
                        <span className="sk-choice-tag" data-tone={check.passed ? undefined : "info"}>{check.passed ? l.doneTag : l.todoTag}</span>
                        {/* The spotlight above carries the one primary Open; rows stay outline. */}
                        {!check.passed && check.href ? <Link href={check.href} className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>{t.open} <ForwardArrow /></Link> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {/* ── Practice ── */}
        <section id="practice" aria-labelledby="practice-heading" className="sk-panel space-y-4 p-4 sm:p-6">
          <div className="space-y-1">
            <h2 id="practice-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><FlaskConical aria-hidden="true" className="size-5 text-primary" />{t.practiceTitle}</h2>
            <p className="text-sm text-ink-muted">{l.practiceHint}</p>
          </div>
          <ol className="sk-launch-steps">{STEPS.map((step, index) => {
            const done = Boolean(lead.readiness.rehearsal[step]);
            return (
              <li key={step} className="sk-launch-step" data-done={done || undefined}>
                <span className="sk-launch-step-num" aria-hidden="true">{done ? <CheckCircle2 className="size-4" /> : index + 1}</span>
                <p className="font-semibold text-ink-strong">{t.steps[step]}</p>
                {done ? <p className="text-xs text-status-success-text">{t.doneAt}: {date(lead.readiness.rehearsal[step])}</p> : null}
                <Button type="button" size="sm" variant={done ? "outline" : "default"} disabled={busy}
                  onClick={() => run(async () => { const result = await call({ op: "rehearse", step }); setPreview(result.preview); }, true)}>{done ? t.rerun : t.run}</Button>
              </li>
            );
          })}</ol>
          {preview ? (
            <div aria-live="polite" className="sk-launch-preview">
              <p className="sk-choice-tag" data-tone="brand">{t.practiceBanner}</p>
              <p className="font-semibold text-ink-strong">{t.steps[preview.step]} · {t.classLabel}: <bdi>{preview.className}</bdi> · {t.campusLabel}: <bdi>{preview.campusName}</bdi></p>
              {preview.step === "attendance" ? <ul className="space-y-1">{preview.learners.map(learner => <li key={learner.name} className="flex justify-between gap-3 text-sm"><span>{learner.name}</span><span className="sk-choice-tag" data-tone={learner.status === "PRESENT" ? undefined : "info"}>{learner.status === "PRESENT" ? t.present : t.absent}</span></li>)}</ul> : null}
              {preview.step === "assessment" ? (preview.subjects.length ? <ul className="list-inside list-disc text-sm">{preview.subjects.map(subject => <li key={subject}><bdi>{subject}</bdi></li>)}</ul> : <p className="text-sm">{t.subjectsNone}</p>) : null}
              {preview.step === "family" ? <div className="space-y-1 text-sm"><p className="font-semibold">{t.familySees}: {preview.learners[0].name}</p>
                <p>{t.attendanceToday}: {t.present} · {t.upcoming}: <bdi>{preview.subjects[0] ?? "—"}</bdi></p>
                <p className="text-xs text-ink-muted">{t.timezone}: <bdi dir="ltr">{preview.timezone}</bdi> · {t.currency}: <bdi dir="ltr">{preview.currency}</bdi></p></div> : null}
            </div>
          ) : null}
        </section>

        {/* ── Reconcile ── */}
        <section id="reconcile" aria-labelledby="reconcile-heading" className="sk-panel space-y-3 p-4 sm:p-6">
          <h2 id="reconcile-heading" className="text-lg font-bold text-ink-strong">{t.reconcileTitle}</h2>
          <p className="text-sm text-ink-muted">{t.reconcileHelp}</p>
          <div className="sk-launch-stats">
            <div><span className="tabular-nums"><bdi dir="ltr">{lead.facts.students}</bdi></span><small>{t.evidence.students}</small></div>
            <div data-tone={lead.facts.studentsWithoutGuardian ? "warning" : undefined}><span className="tabular-nums"><bdi dir="ltr">{lead.facts.studentsWithoutGuardian}</bdi></span><small>{t.guardiansMissing}</small></div>
            <div><span className="tabular-nums"><bdi dir="ltr">{lead.facts.openingBalances}</bdi></span><small>{t.openingBalances}</small></div>
          </div>
          {lead.facts.imports.batches.length === 0 ? <p className="text-sm text-ink-muted">{t.noImports}</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">{lead.facts.imports.batches.map(batch => (
              <li key={batch.id} className="sk-launch-batch">
                <p className="font-semibold text-ink-strong"><bdi>{batch.sourceName}</bdi> <span className="text-xs text-ink-subtle">· {batch.kind} · {batch.state}</span></p>
                <p className="text-sm text-ink-muted">{t.source}: <bdi dir="ltr">{batch.total}</bdi> {t.rows} → <bdi dir="ltr">{batch.accepted}</bdi> {t.accepted} · <bdi dir="ltr">{batch.rejected}</bdi> {t.rejected} · <bdi dir="ltr">{batch.unresolved}</bdi> {t.unresolved}{batch.unknownClass ? <> · <strong className="text-status-warning-text"><bdi dir="ltr">{batch.unknownClass}</bdi> {t.unknownClass}</strong></> : null}</p>
              </li>
            ))}</ul>
          )}
        </section>

        {/* ── Follow-ups ── */}
        <section id="tasks" aria-labelledby="tasks-heading" className="sk-panel space-y-3 p-4 sm:p-6">
          <h2 id="tasks-heading" className="text-lg font-bold text-ink-strong">{t.tasksTitle}</h2>
          <p className="text-sm text-ink-muted">{t.tasksHelp}</p>
          <ul className="space-y-2">{lead.tasks.map(task => taskRow(task, true))}</ul>
          <form className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); run(() => call({ op: "task", action: "create", title: newTask.title, ownerId: newTask.ownerId || null }).then(() => setNewTask({ title: "", ownerId: "" }))); }}>
            <label className="grid gap-1 text-sm font-semibold">{t.newTask}<Input required minLength={3} value={newTask.title} onChange={event => setNewTask({ ...newTask, title: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t.owner}<Select value={newTask.ownerId} onChange={event => setNewTask({ ...newTask, ownerId: event.target.value })}><option value="">{t.unassigned}</option>{lead.staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></label>
            <Button type="submit" disabled={busy}>{t.add}</Button>
          </form>
        </section>

        {/* ── Go-live ── */}
        {!live ? (
          <section id="approve" aria-labelledby="approve-heading" className="sk-launch-approve" data-ready={lead.ready || undefined}>
            <div className="min-w-0 space-y-1">
              <h2 id="approve-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><Rocket aria-hidden="true" className="size-5 text-primary" />{t.approveTitle}</h2>
              <p className="text-sm text-ink-muted">{lead.ready ? l.approveBar : t.approveBlocked} {t.approveHelp}</p>
              <p className="text-xs text-ink-subtle"><bdi dir="ltr">{lead.tasks.filter(task => task.status === "OPEN").length}</bdi> {t.outstanding}</p>
            </div>
            {/* When every check is done the spotlight holds the primary "Approve go-live"; this one repeats it quietly. */}
            <Button type="button" variant="outline" disabled={busy || !lead.ready} onClick={() => setConfirmingApproval(true)} className="shrink-0 gap-2">
              <Rocket aria-hidden="true" className="size-4" />{t.approve}
            </Button>
          </section>
        ) : null}
        {/* R3: going live is a publish-type decision (warning tone); the body says what happens, who hears, and that it is final. */}
        <ConfirmAction
          open={confirmingApproval}
          tone="warning"
          title={t.confirmTitle}
          description={t.confirmBody}
          confirmLabel={t.approve}
          busy={busy}
          onConfirm={async () => { if (await run(() => call({ op: "approve", expectedVersion: lead.readiness.version }))) setConfirmingApproval(false); }}
          onCancel={() => setConfirmingApproval(false)}
        />
      </> : null}
    </div>
  );
}
