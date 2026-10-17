"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { effectiveSettings, type Capabilities, type EffectiveSettings, type PlanRow } from "@/lib/accommodations/plan";
import { fillAccess, getAccessCopy, type AccessCopy } from "./access-copy";

// SKO-410 screens: coordinator plans, teacher/invigilator adjustments and the learner practice check.
type Plan = { id: string; version: number; validFrom: string; validUntil: string; assessmentTypes: Array<"EXAM" | "ASSIGNMENT" | "PRACTICE">; extraMinutes: number; extraPercent: number; breakMinutes: number; capabilities: Capabilities; instructions: string; approvedAt: string; status?: "ACTIVE" | "SUPERSEDED" | "REVOKED"; endReason?: string | null; supportRecords?: number; rehearsals?: number; rehearsedAt?: string | null };
type Student = { id: string; fullName: string; rollNo: string; plans: Plan[] };
type Coordinator = { classId: string | null; classes: Array<{ id: string; name: string; section: string | null }>; students: Student[]; review: Array<{ planId: string; studentId: string; fullName: string; validUntil: string; expired: boolean }> };

async function call(path: string, body?: unknown) {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}
const dayOf = (value: string) => value.slice(0, 10);
const useAccess = () => { const { language } = useLocale(); return { language, t: getAccessCopy(language), rtl: language === "ar" || language === "ur" }; };
const asRow = (plan: Plan): PlanRow => ({ ...plan, status: "ACTIVE", validFrom: new Date(plan.validFrom), validUntil: new Date(plan.validUntil) });

function Status({ status }: { status: { tone: "ok" | "error"; text: string } | null }) {
  return status ? <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{status.text}</p> : null;
}
export function Capability({ t, plan }: { t: AccessCopy; plan: Pick<Plan, "capabilities"> }) {
  const caps = (Object.keys(t.caps) as Array<keyof AccessCopy["caps"]>).filter(key => plan.capabilities[key]);
  return <ul className="flex flex-wrap gap-2 text-xs" aria-label={t.preview}>
    {caps.map(key => <li key={key} className="rounded-full border px-2 py-0.5 font-semibold">{t.caps[key]}</li>)}
    {plan.capabilities.assistiveTech.map(tool => <li key={tool} className="rounded-full border px-2 py-0.5" dir="auto">{tool}</li>)}
    {plan.capabilities.submissionMode !== "STANDARD" && <li className="rounded-full border px-2 py-0.5">{t.submissionModes[plan.capabilities.submissionMode]}</li>}
  </ul>;
}
/** The calculation behind the effective time, one line per step. */
export function Breakdown({ t, effective }: { t: AccessCopy; effective: Pick<EffectiveSettings, "steps"> }) {
  return <dl className="grid gap-1 text-sm">{effective.steps.map(step => <div key={step.key} className={`flex justify-between gap-4 ${step.key === "total" ? "border-t pt-1 font-bold" : ""}`}>
    <dt>{fillAccess(t.steps[step.key], { percent: step.percent ?? 0 })}</dt><dd>{step.key === "base" || step.key === "total" ? "" : "+ "}{fillAccess(t.minutes, { n: step.minutes })}</dd></div>)}</dl>;
}

// ─── Coordinator ──────────────────────────────────────────────────
export function CoordinatorAccess() {
  const { language, t, rtl } = useAccess();
  const [view, setView] = useState<Coordinator | null>(null);
  const [classId, setClassId] = useState("");
  const [editing, setEditing] = useState<Student | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => { const data = await call(`/api/accommodations?view=coordinator${classId ? `&classId=${classId}` : ""}`); setView(data); }, [classId]);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);
  const run = async (work: () => Promise<unknown>) => { setStatus(null); try { await work(); await load(); setStatus({ tone: "ok", text: t.saved }); return true; } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); return false; } };
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
  if (!view) return <div dir={rtl ? "rtl" : "ltr"}><Status status={status} />{!status && <p className="text-sm text-slate-600">{t.loading}</p>}</div>;
  return <div dir={rtl ? "rtl" : "ltr"} className="min-w-0 space-y-5">
    <section aria-labelledby="review-heading" className="rounded-xl border bg-white p-4 text-sm">
      <h2 id="review-heading" className="text-base font-semibold">{t.review}</h2>
      {view.review.length ? <ul className="mt-2 grid gap-1">{view.review.map(row => <li key={row.planId}><span dir="auto">{row.fullName}</span> · {row.expired ? t.reviewExpired : t.reviewSoon} {date(row.validUntil)}</li>)}</ul> : <p className="text-slate-600">{t.noReview}</p>}
    </section>
    <label className="grid max-w-sm gap-1 text-xs font-semibold">{t.class}<Select value={view.classId ?? ""} onChange={event => { setClassId(event.target.value); setEditing(null); }}>{view.classes.map(row => <option key={row.id} value={row.id}>{row.name}{row.section ? ` ${row.section}` : ""}</option>)}</Select></label>
    <Status status={status} />
    <ul className="grid gap-3" aria-label={t.title}>{view.students.map(student => {
      const active = student.plans.find(plan => plan.status === "ACTIVE");
      return <li key={student.id} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="font-semibold" dir="auto">{student.fullName}</p>
            {active ? <p className="text-xs text-slate-500">{t.active} · {t.version} {active.version} · {t.validity} {date(active.validFrom)} – {date(active.validUntil)} · {active.assessmentTypes.map(type => t.types[type]).join(", ")}</p> : <p className="text-xs text-slate-500">{t.none}</p>}
          </div>
          <Button type="button" variant="outline" onClick={() => setEditing(editing?.id === student.id ? null : student)}>{active ? t.editPlan : t.newPlan}</Button>
        </div>
        {active && <div className="mt-2 space-y-2"><Capability t={t} plan={active} />{active.instructions && <p className="text-sm" dir="auto">{active.instructions}</p>}
          <Breakdown t={t} effective={effectiveSettings({ baseMinutes: 45, type: active.assessmentTypes[0], at: new Date(active.validFrom), plan: asRow(active) })} /></div>}
        {editing?.id === student.id && <PlanForm t={t} student={student} active={active ?? null} onCancel={() => setEditing(null)} onSubmit={async body => { if (await run(() => call("/api/accommodations", { op: "plan", ...body }))) setEditing(null); }} onRevoke={active ? async reason => { if (await run(() => call("/api/accommodations", { op: "revoke", planId: active.id, reason }))) setEditing(null); } : undefined} />}
        {active && <SupportRecords t={t} planId={active.id} language={language} />}
        {student.plans.length > 1 && <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">{t.history}</summary><ol className="mt-1 grid gap-1">{student.plans.map(plan => <li key={plan.id}>{t.version} {plan.version} · {t.statuses[plan.status ?? "ACTIVE"]} · {date(plan.validFrom)} – {date(plan.validUntil)}{plan.endReason ? ` · ${plan.endReason}` : ""}</li>)}</ol></details>}
      </li>;
    })}</ul>
  </div>;
}

function PlanForm({ t, student, active, onCancel, onSubmit, onRevoke }: { t: AccessCopy; student: Student; active: Plan | null; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>; onRevoke?: (reason: string) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [types, setTypes] = useState<string[]>(active?.assessmentTypes ?? ["EXAM"]);
  const [caps, setCaps] = useState<Capabilities>(active?.capabilities ?? { reader: false, scribe: false, largeText: false, highContrast: false, screenReader: false, cameraExempt: false, assistiveTech: [], submissionMode: "STANDARD" });
  const [numbers, setNumbers] = useState({ extraMinutes: active?.extraMinutes ?? 0, extraPercent: active?.extraPercent ?? 0, breakMinutes: active?.breakMinutes ?? 0, base: 45 });
  const [revokeReason, setRevokeReason] = useState("");
  const latest = student.plans[0]?.version ?? 0;
  const preview = effectiveSettings({ baseMinutes: numbers.base || 1, type: "EXAM", at: new Date(), plan: { id: "preview", version: latest + 1, status: "ACTIVE", validFrom: new Date(0), validUntil: new Date(8.64e15), assessmentTypes: ["EXAM"], extraMinutes: numbers.extraMinutes, extraPercent: numbers.extraPercent, breakMinutes: numbers.breakMinutes, capabilities: caps, instructions: "" } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), text = (name: string) => String(form.get(name) ?? "");
    void onSubmit({ studentId: student.id, validFrom: text("validFrom"), validUntil: text("validUntil"), assessmentTypes: types, extraMinutes: numbers.extraMinutes, extraPercent: numbers.extraPercent, breakMinutes: numbers.breakMinutes, capabilities: { ...caps, assistiveTech: text("assistive").split(",").map(item => item.trim()).filter(Boolean).slice(0, 5) }, instructions: text("instructions"), expectedVersion: latest });
  };
  const number = (key: "extraMinutes" | "extraPercent" | "breakMinutes" | "base", label: string, max: number) => <label className="grid gap-1 text-xs font-semibold">{label}<Input type="number" min={key === "base" ? 1 : 0} max={max} value={numbers[key]} onChange={event => setNumbers(previous => ({ ...previous, [key]: Number(event.target.value) || 0 }))} /></label>;
  return <form onSubmit={submit} aria-label={t.editPlan} className="mt-3 grid gap-3 rounded-xl border bg-slate-50 p-3 sm:grid-cols-2">
    <label className="grid gap-1 text-xs font-semibold">{t.validFrom}<Input type="date" name="validFrom" required defaultValue={active ? dayOf(active.validFrom) : today} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.validUntil}<Input type="date" name="validUntil" required defaultValue={active ? dayOf(active.validUntil) : today} /></label>
    <fieldset className="grid gap-1 text-xs sm:col-span-2"><legend className="font-semibold">{t.appliesTo}</legend><div className="flex flex-wrap gap-3">{(["EXAM", "ASSIGNMENT", "PRACTICE"] as const).map(type => <label key={type} className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" checked={types.includes(type)} onChange={event => setTypes(previous => event.target.checked ? [...previous, type] : previous.filter(item => item !== type))} />{t.types[type]}</label>)}</div></fieldset>
    {number("extraMinutes", t.extraMinutes, 240)}{number("extraPercent", t.extraPercent, 100)}{number("breakMinutes", t.breakMinutes, 120)}
    <fieldset className="grid gap-1 text-xs sm:col-span-2"><legend className="font-semibold">{t.preview}</legend><div className="flex flex-wrap gap-3">{(Object.keys(t.caps) as Array<keyof AccessCopy["caps"]>).map(key => <label key={key} className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" checked={caps[key]} onChange={event => setCaps(previous => ({ ...previous, [key]: event.target.checked }))} />{t.caps[key]}</label>)}</div></fieldset>
    <label className="grid gap-1 text-xs font-semibold">{t.submission}<Select value={caps.submissionMode} onChange={event => setCaps(previous => ({ ...previous, submissionMode: event.target.value as Capabilities["submissionMode"] }))}>{(Object.keys(t.submissionModes) as Array<Capabilities["submissionMode"]>).map(mode => <option key={mode} value={mode}>{t.submissionModes[mode]}</option>)}</Select></label>
    <label className="grid gap-1 text-xs font-semibold">{t.assistive}<Input name="assistive" maxLength={420} defaultValue={caps.assistiveTech.join(", ")} /></label>
    <div className="grid gap-1 text-xs sm:col-span-2"><label className="grid gap-1 font-semibold">{t.instructions}<textarea name="instructions" maxLength={500} rows={2} defaultValue={active?.instructions ?? ""} aria-describedby="access-instructions-help" className="rounded-md border px-3 py-2 text-sm font-normal" /></label><span id="access-instructions-help" className="text-slate-600">{t.instructionsHelp}</span></div>
    <div className="space-y-2 rounded-lg border bg-white p-3 sm:col-span-2">{number("base", t.baseMinutes, 480)}<Breakdown t={t} effective={preview} /><p className="text-xs text-slate-600">{t.startedNote}</p></div>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={!types.length}>{t.savePlan}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
    {onRevoke && <div className="flex flex-wrap items-end gap-2 border-t pt-3 sm:col-span-2"><label className="grid flex-1 gap-1 text-xs font-semibold">{t.revokeReason}<Input value={revokeReason} onChange={event => setRevokeReason(event.target.value)} maxLength={300} /></label><Button type="button" variant="outline" disabled={revokeReason.trim().length < 3} onClick={() => void onRevoke(revokeReason)}>{t.confirmRevoke}</Button></div>}
  </form>;
}

function SupportRecords({ t, planId, language }: { t: AccessCopy; planId: string; language: string }) {
  const [records, setRecords] = useState<Array<{ id: string; note: string; createdAt: string }> | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const open = async (body?: unknown) => { setError(""); try { const response = await fetch(`/api/accommodations/${planId}/support`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? t.failed); setRecords(data.records); setNote(""); } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); } };
  return <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" onToggle={event => { if ((event.target as HTMLDetailsElement).open && !records) void open(); }}>
    <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Lock className="h-4 w-4" aria-hidden />{t.support}</summary>
    <p className="mt-1 text-xs text-amber-900">{t.supportHelp}</p>
    {error && <p role="alert" className="text-rose-800">{error}</p>}
    {records && (records.length ? <ul className="mt-2 grid gap-1">{records.map(row => <li key={row.id} dir="auto">{new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(row.createdAt))} · {row.note}</li>)}</ul> : <p className="mt-2 text-slate-600">{t.noSupport}</p>)}
    <div className="mt-2 flex flex-wrap items-end gap-2"><label className="grid flex-1 gap-1 text-xs font-semibold">{t.note}<Input value={note} onChange={event => setNote(event.target.value)} maxLength={4000} /></label><Button type="button" variant="outline" disabled={note.trim().length < 3} onClick={() => void open({ note })}>{t.addNote}</Button></div>
  </details>;
}

// ─── Teachers and invigilators ────────────────────────────────────
export function StaffAccess() {
  const { language, t, rtl } = useAccess();
  const [plans, setPlans] = useState<Array<{ student: { id: string; fullName: string; rollNo: string }; plan: Plan }> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("/api/accommodations?view=staff").then(data => setPlans(data.plans)).catch(cause => setError(cause instanceof Error ? cause.message : t.failed)); }, [t.failed]);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
  if (error) return <p role="alert" className="text-sm text-rose-800">{error}</p>;
  if (!plans) return <p className="text-sm text-slate-600">{t.loading}</p>;
  return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3">{plans.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">{t.noStaff}</p>
    : <ul className="grid gap-3" aria-label={t.staffTitle}>{plans.map(({ student, plan }) => <li key={plan.id} className="space-y-2 rounded-xl border bg-white p-4">
      <p className="font-semibold" dir="auto">{student.fullName}</p>
      <p className="text-xs text-slate-500">{t.validity} {date(plan.validFrom)} – {date(plan.validUntil)} · {plan.assessmentTypes.map(type => t.types[type]).join(", ")}</p>
      <Capability t={t} plan={plan} />
      {plan.instructions && <p className="text-sm" dir="auto">{plan.instructions}</p>}
      <Breakdown t={t} effective={effectiveSettings({ baseMinutes: 45, type: plan.assessmentTypes[0], at: new Date(plan.validFrom), plan: asRow(plan) })} />
    </li>)}</ul>}</div>;
}

// ─── Learners and guardians ───────────────────────────────────────
type LearnerView =
  | { mode: "learner"; plan: Plan | null; exams: Array<{ id: string; title: string; startsAt: string; effective: EffectiveSettings }> }
  | { mode: "guardian"; children: Array<{ fullName: string; plan: Omit<Plan, "id" | "version" | "instructions" | "approvedAt"> | null }> };
export function LearnerAccess() {
  const { language, t, rtl } = useAccess();
  const [view, setView] = useState<LearnerView | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => setView(await call("/api/accommodations?view=learner")), []);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);
  const date = (value: string, time = false) => new Intl.DateTimeFormat(language, time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
  if (!view) return <div dir={rtl ? "rtl" : "ltr"}><Status status={status} />{!status && <p className="text-sm text-slate-600">{t.loading}</p>}</div>;
  if (view.mode === "guardian") return <ul dir={rtl ? "rtl" : "ltr"} className="grid gap-3" aria-label={t.learnerTitle}>{view.children.map(child => <li key={child.fullName} className="space-y-2 rounded-xl border bg-white p-4">
    <p className="font-semibold" dir="auto">{child.fullName}</p>
    {child.plan ? <><p className="text-xs text-slate-500">{t.validity} {date(child.plan.validFrom)} – {date(child.plan.validUntil)} · {child.plan.assessmentTypes.map(type => t.types[type]).join(", ")}</p><Capability t={t} plan={child.plan} /><p className="text-sm">{child.plan.extraMinutes || child.plan.extraPercent ? `${t.extraMinutes}: ${child.plan.extraMinutes}${child.plan.extraPercent ? ` + ${child.plan.extraPercent}%` : ""}` : t.noExtra}</p></> : <p className="text-sm text-slate-600">{t.none}</p>}
  </li>)}</ul>;
  const plan = view.plan;
  const sample = view.exams[0]?.effective ?? (plan ? effectiveSettings({ baseMinutes: 45, type: "PRACTICE", at: new Date(), plan: { ...asRow(plan), assessmentTypes: [...plan.assessmentTypes, "PRACTICE"] } }) : null);
  return <div dir={rtl ? "rtl" : "ltr"} className="min-w-0 space-y-4">
    <Status status={status} />
    {!plan ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">{t.none}</p> : <>
      <section className="space-y-2 rounded-xl border bg-white p-4">
        <p className="text-lg font-bold">{sample && sample.extraMinutes + sample.breakMinutes > 0 ? fillAccess(t.includes, { n: sample.extraMinutes + sample.breakMinutes }) : t.noExtra}</p>
        <Capability t={t} plan={plan} />
        <p className="text-xs text-slate-500">{t.validity} {date(plan.validFrom)} – {date(plan.validUntil)}</p>
      </section>
      {view.exams.length > 0 && <section aria-labelledby="upcoming-heading" className="space-y-2 rounded-xl border bg-white p-4"><h2 id="upcoming-heading" className="font-semibold">{t.upcoming}</h2>
        <ul className="grid gap-3">{view.exams.map(exam => <li key={exam.id} className="space-y-1"><p className="text-sm font-semibold"><bdi>{exam.title}</bdi> · <bdi>{date(exam.startsAt, true)}</bdi></p><Breakdown t={t} effective={exam.effective} /></li>)}</ul></section>}
      <section aria-labelledby="practice-heading" className="space-y-3 rounded-xl border bg-white p-4">
        <h2 id="practice-heading" className="font-semibold">{t.practice}</h2>
        <p className="text-sm text-slate-600">{t.practiceHelp}</p>
        <div className={`rounded-lg border p-4 ${plan.capabilities.largeText ? "text-2xl" : "text-base"} ${plan.capabilities.highContrast ? "bg-black text-white" : "bg-slate-50"}`}>{t.sample}</div>
        <p className="text-sm">{plan.rehearsedAt ? fillAccess(t.rehearsed, { date: date(plan.rehearsedAt, true) }) : t.notRehearsed}</p>
        <Button type="button" onClick={async () => { setStatus(null); try { await call("/api/accommodations", { op: "rehearse", planId: plan.id, baseMinutes: sample?.baseMinutes || 45 }); await load(); setStatus({ tone: "ok", text: t.saved }); } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); } }}>{t.works}</Button>
      </section>
    </>}
  </div>;
}
