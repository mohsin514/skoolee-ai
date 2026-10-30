"use client";
import { ErrorState } from "@/components/ui/error-state";
import { useFetch } from "@/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardList, FileLock2, HeartPulse, KeyRound, Pill, ShieldAlert, ShieldCheck, Siren, Stethoscope, UserCheck } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskRowButton, DeskRowIcon, DeskSection, DeskStats, RelativeTime, StatTile, deskRow, deskTimeline, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ViewTabs } from "@/components/ui/view-tabs";
import { AccessNotice } from "@/components/ui/access-notice";
import { SkeletonList } from "@/components/ui/skeleton";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { RequestFailure } from "@/lib/http/request-state";

/** `?tab=report` is the Help menu's "Record a concern" deep link (role-ux §4.2); other tabs open by id. */
function careTabFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("tab");
}
function writeCareTab(tab: string) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === tab) return;
  params.set("tab", tab);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

// SKO-439: confidential clinic and safeguarding. Two visibly separate workspaces with their own members.
// Lists carry no observation or conclusion; records open one at a time and every view is logged on the server.
// Any staff member can record a concern and gets a receipt — never the case. Nothing reaches a family unless a
// second lead approves the exact words. When the window is hidden the content is blurred (app-switcher
// previews), and a record whose access ends is cleared from the screen at once.

type Ui = ReturnType<typeof useUiText>;
type Domain = "CLINIC" | "SAFEGUARDING";
type Me = { canConfigure: boolean; canReport: boolean; canEmergency: Record<Domain, boolean>; CLINIC: { role: string; enabled: boolean } | null; SAFEGUARDING: { role: string; enabled: boolean } | null; grants: { id: string; domain: Domain; studentId: string; studentName: string; purpose: string; expiresAt: string }[] };
type Student = { id: string; fullName: string; rollNo?: string | null; class?: { name: string; section: string | null } | null };

class AccessError extends Error {}
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (response.status === 403 || response.status === 404) throw new AccessError(json.error || "Record unavailable.");
  if (!response.ok || !json.success) throw new Error(json.error || "Record unavailable. Your unsent observation remains private and recoverable.");
  return json.data;
}
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const key = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const roleLabel = (ui: Ui, r: string) => ({ NURSE: ui("Nurse"), CLINIC_STAFF: ui("Clinic staff"), LEAD: ui("Lead"), DEPUTY: ui("Deputy lead") } as Record<string, string>)[r] ?? r;
const outcomeLabel = (ui: Ui, o: string) => ({ RETURNED_TO_CLASS: ui("Returned to class"), SENT_HOME: ui("Sent home"), EMERGENCY_SERVICES: ui("Emergency services called"), STAYED_IN_CLINIC: ui("Stayed in clinic") } as Record<string, string>)[o] ?? o;
const sourceLabel = (ui: Ui, s: string) => ({ STAFF_OBSERVATION: ui("Something I saw"), DISCLOSURE_BY_PUPIL: ui("The pupil told me"), THIRD_PARTY: ui("Someone else told me"), OTHER: ui("Other") } as Record<string, string>)[s] ?? s;
const statusLabel = (ui: Ui, s: string) => ({ NEW: ui("New"), TRIAGED: ui("Triaged"), ESCALATED: ui("Escalated"), CLOSED: ui("Closed"), PROPOSED: ui("Awaiting review"), APPROVED: ui("Approved, not sent"), DECLINED: ui("Kept restricted"), RELEASED: ui("Released") } as Record<string, string>)[s] ?? s;
const caseTone = (s: string): DeskTone => ({ NEW: "warning", TRIAGED: "info", ESCALATED: "danger", CLOSED: "neutral", PROPOSED: "warning", APPROVED: "info", DECLINED: "neutral", RELEASED: "success" } as Record<string, DeskTone>)[s] ?? "neutral";
const domainLabel = (ui: Ui, d: Domain) => d === "CLINIC" ? ui("Clinic") : ui("Safeguarding");
const className = (s: Student) => s.class ? `${s.class.name}${s.class.section ? ` ${s.class.section}` : ""}` : "";

function useHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { const on = () => setHidden(document.visibilityState === "hidden"); document.addEventListener("visibilitychange", on); window.addEventListener("blur", on); return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("blur", on); }; }, []);
  return hidden;
}

function StudentPicker({ value, onChange, label }: { value: Student | null; onChange: (s: Student | null) => void; label: string }) {
  const ui = useUiText();
  const [q, setQ] = useState(""), [results, setResults] = useState<Student[]>([]), [failure, setFailure] = useState<RequestFailure | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { call(`/api/care?view=students&q=${encodeURIComponent(q.trim())}`).then(rows => { setResults(rows); setFailure(null); }).catch(() => { setResults([]); setFailure(new RequestFailure("provider")); }); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return <div className={cn(deskRow, "flex flex-wrap items-center justify-between gap-2 text-sm")} data-care-student={value.id}><span className="flex min-w-0 items-center gap-3"><DeskRowIcon icon={UserCheck} /><span className="min-w-0"><bdi className="font-semibold text-ink-strong">{value.fullName}</bdi>{className(value) ? <> · <bdi>{className(value)}</bdi></> : null}</span></span><Button size="sm" variant="ghost" onClick={() => onChange(null)}>{ui("Change student")}</Button></div>;
  return <div className="space-y-2">
    <FormField name="care-student" label={label}><Input value={q} onChange={e => setQ(e.target.value)} placeholder={ui("Type at least two letters of a name or roll number")} data-care-student-search /></FormField>
    {failure ? <ErrorState error={failure} variant="panel" /> : results.length ? <ul className="max-h-48 space-y-1 overflow-auto">{results.map(s => <li key={s.id}><Button variant="ghost" className="w-full justify-start" onClick={() => { onChange(s); setQ(""); }} data-care-pick={s.id}><bdi>{s.fullName}</bdi>{className(s) ? <span className="text-ink-muted"> · <bdi>{className(s)}</bdi></span> : null}</Button></li>)}</ul> : null}
  </div>;
}

// ─── Concern intake (any staff) ──────────────────────────────────────────

function ConcernIntake() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [student, setStudent] = useState<Student | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ source: "STAFF_OBSERVATION", observation: "", eventAt: localNow(), guardianInvolved: false, idempotencyKey: key() });
  const [receipt, setReceipt] = useState<{ reference: string; createdAt: string } | null>(null), [mine, setMine] = useState<{ reference: string; createdAt: string }[]>([]);
  const loadMine = useCallback(() => call("/api/care?view=my-reports").then(setMine).catch(() => setMine([])), []);
  useEffect(() => { void loadMine(); }, [loadMine]);
  const submit = async () => {
    if (!student) return;
    setBusy(true); setError(null);
    try {
      const r = await call("/api/care", "POST", { action: "concern", studentId: student.id, source: form.source, observation: form.observation, eventAt: new Date(form.eventAt).toISOString(), guardianInvolved: form.guardianInvolved, idempotencyKey: form.idempotencyKey });
      setReceipt(r); setStudent(null); setForm({ source: "STAFF_OBSERVATION", observation: "", eventAt: localNow(), guardianInvolved: false, idempotencyKey: key() });
      void loadMine();
    } catch (e) { setError(e instanceof Error ? e.message : "Record unavailable. Your unsent observation remains private and recoverable."); }
    finally { setBusy(false); }
  };
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-care-intake>
    <header><h2 className="text-base font-bold text-ink-strong">{ui("Record a safeguarding concern")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("Record what you observed or were told, in the words used. Do not investigate, diagnose or decide what it means. The designated lead will review it.")}</p></header>
    {receipt ? <Alert tone="success" live="polite" data-care-receipt={receipt.reference} title={ui("Observation recorded and routed to the designated lead.")} actions={<Button size="sm" variant="ghost" onClick={() => setReceipt(null)}>{ui("Record another concern")}</Button>}>
      <p className="tabular-nums">{ui("Reference {0} · {1}", [receipt.reference, dateTime(receipt.createdAt)])}</p>
      <p className="text-xs text-ink-muted">{ui("This message has not been sent to a guardian. Nothing about a concern is shared with a family automatically.")}</p>
    </Alert> : <div className="space-y-3">
      <StudentPicker value={student} onChange={setStudent} label={ui("Which student is this about?")} />
      <FormField name="care-source" label={ui("How did this come to your attention?")}><Select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} data-care-source>{["STAFF_OBSERVATION", "DISCLOSURE_BY_PUPIL", "THIRD_PARTY", "OTHER"].map(s => <option key={s} value={s}>{sourceLabel(ui, s)}</option>)}</Select></FormField>
      <FormField name="care-observation" label={ui("Record what you observed")} hint={ui("Facts only: what you saw or heard, who was present, the words used.")}><Textarea value={form.observation} onChange={e => setForm({ ...form, observation: e.target.value })} rows={6} maxLength={6000} dir="auto" data-care-observation /></FormField>
      <FormField name="care-event" label={ui("When did it happen?")}><Input type="datetime-local" value={form.eventAt} onChange={e => setForm({ ...form, eventAt: e.target.value })} dir="ltr" data-care-event /></FormField>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={form.guardianInvolved} onChange={e => setForm({ ...form, guardianInvolved: e.target.checked })} data-care-guardian-involved /><span>{ui("A parent or carer may be involved. Nothing will be shared with the family.")}</span></label>
      {error ? <Alert tone="danger" compact live="assertive" data-care-error>{ui(error)}</Alert> : null}
      <div className="flex justify-end"><Button loading={busy} disabled={busy || !student || !form.observation.trim()} onClick={() => void submit()} data-care-submit>{ui("Submit to the designated lead")}</Button></div>
    </div>}
    {mine.length ? <details className="text-sm"><summary className="cursor-pointer text-ink-muted">{ui("Concerns I recorded")}</summary><ul className={cn(deskTimeline, "mt-3")}>{mine.map(m => <li key={m.reference} data-tone="success" data-care-mine={m.reference}><bdi>{m.reference}</bdi> · <bdi>{dateTime(m.createdAt)}</bdi> · {ui("Received by the designated lead")}</li>)}</ul></details> : null}
  </section>;
}

// ─── Care summary (general staff) ────────────────────────────────────────

function CareSummaryLookup() {
  const ui = useUiText();
  const [student, setStudent] = useState<Student | null>(null), [summary, setSummary] = useState<{ summary: string | null } | null>(null), [failure, setFailure] = useState<RequestFailure | null>(null);
  useEffect(() => { setSummary(null); setFailure(null); if (student) call(`/api/care?view=summary&studentId=${student.id}`).then(setSummary).catch(() => setFailure(new RequestFailure("provider"))); }, [student]);
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-care-summary-lookup>
    <header><h2 className="text-base font-bold text-ink-strong">{ui("Care summary for teachers")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("The accommodation the clinic asks staff to know about. Clinical detail stays with the clinic.")}</p></header>
    <StudentPicker value={student} onChange={setStudent} label={ui("Student")} />
    {failure ? <ErrorState error={failure} variant="panel" /> : student && summary ? <p className="rounded-(--radius-control) border border-border-subtle bg-surface-subtle px-4 py-3 text-sm leading-relaxed text-ink-strong" dir="auto" data-care-summary>{summary.summary ?? ui("No care summary has been shared for this student.")}</p> : null}
  </section>;
}

// ─── Clinic ──────────────────────────────────────────────────────────────

type ClinicRecordData = {
  student: { id: string; fullName: string; className: string };
  access: { emergency: boolean; expiresAt?: string; purpose?: string; role?: string };
  plan: { allergies: string | null; actionPlan: string | null; teacherSummary: string | null; updatedAt: string; updatedBy: string } | null;
  instructions: { id: string; medicine: string; dose: string; schedule: string; authorizedBy: string; authorizationRef: string; validFrom: string; validUntil: string; endedAt: string | null; approvedBy: string; active: boolean }[];
  visits: { id: string; arrivedAt: string; observation: string; actionTaken: string; outcome: string; recordedBy: string }[];
  doses: { id: string; instructionId: string; givenAt: string; dose: string; note: string | null; actor: string }[];
};

function EmergencyBanner({ access }: { access: { emergency: boolean; expiresAt?: string; purpose?: string } }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  if (!access.emergency) return null;
  return <Alert tone="warning" compact live="off" data-care-emergency-banner>{ui("Emergency access · {0} · ends {1}. This access is logged and will be reviewed by the lead.", [access.purpose ?? "", dateTime(access.expiresAt ?? "")])}</Alert>;
}

function ClinicRecord({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<ClinicRecordData | null>(null), [gone, setGone] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [visit, setVisit] = useState({ observation: "", actionTaken: "", outcome: "RETURNED_TO_CLASS", arrivedAt: localNow() });
  const [plan, setPlan] = useState({ allergies: "", actionPlan: "", teacherSummary: "" }), [editPlan, setEditPlan] = useState(false);
  const [ins, setIns] = useState<Record<string, string> | null>(null);
  const load = useCallback(async () => {
    try { const d = await call(`/api/care?view=clinic&studentId=${studentId}`); setData(d); setPlan({ allergies: d.plan?.allergies ?? "", actionPlan: d.plan?.actionPlan ?? "", teacherSummary: d.plan?.teacherSummary ?? "" }); }
    catch (e) { setData(null); setGone(e instanceof Error ? e.message : "Record unavailable."); }
  }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  // An emergency grant ends on the server; clear the screen when it does.
  useEffect(() => { if (!data?.access.emergency || !data.access.expiresAt) return; const ms = new Date(data.access.expiresAt).getTime() - Date.now(); const t = setTimeout(() => { setData(null); setGone("Emergency access has ended."); }, Math.max(0, ms)); return () => clearTimeout(t); }, [data]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { if (e instanceof AccessError) { setData(null); setGone(e.message); } else toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (gone) return <section className="sk-panel space-y-2 p-4" data-care-gone><p className="text-sm">{ui(gone)}</p><Button size="sm" variant="secondary" onClick={onClose}>{ui("Back")}</Button></section>;
  if (!data) return <p className="text-sm text-ink-muted">{ui("Verifying confidential access before loading records.")}</p>;
  const canPlan = !data.access.emergency && ["NURSE", "LEAD"].includes(data.access.role ?? "");
  const canRecord = !data.access.emergency;
  return <section className="sk-panel space-y-4 p-4 sm:p-5" data-clinic-record={data.student.id}>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-bold text-ink-strong"><bdi>{data.student.fullName}</bdi></h3><p className="text-xs text-ink-muted"><bdi>{data.student.className}</bdi> · {ui("Clinic record")}</p></div><span className="flex gap-2"><a className="sk-link text-sm font-medium text-primary" href={`/api/care/export?studentId=${data.student.id}`} data-clinic-export>{ui("Export")}</a><Button size="sm" variant="secondary" onClick={onClose}>{ui("Back")}</Button></span></header>
    <EmergencyBanner access={data.access} />
    <DeskSection title={ui("Allergies and action plan")} icon={ClipboardList} tone={data.plan?.allergies ? "warning" : "brand"} className="text-sm" data-clinic-plan>
      {editPlan ? <div className="space-y-2">
        <FormField name="cp-allergies" label={ui("Allergies")}><Textarea value={plan.allergies} onChange={e => setPlan({ ...plan, allergies: e.target.value })} rows={2} dir="auto" /></FormField>
        <FormField name="cp-action" label={ui("Action plan")}><Textarea value={plan.actionPlan} onChange={e => setPlan({ ...plan, actionPlan: e.target.value })} rows={3} dir="auto" /></FormField>
        <FormField name="cp-summary" label={ui("Summary for teachers")} hint={ui("Only what staff need to know to keep the student safe. No diagnosis.")}><Textarea value={plan.teacherSummary} onChange={e => setPlan({ ...plan, teacherSummary: e.target.value })} rows={2} maxLength={600} dir="auto" data-clinic-summary-input /></FormField>
        <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setEditPlan(false)}>{ui("Back")}</Button><Button size="sm" loading={busy} disabled={busy} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "care-plan", studentId, ...plan }); setEditPlan(false); }, "Care plan saved.")} data-clinic-plan-save>{ui("Save care plan")}</Button></div>
      </div> : <>
        <p dir="auto"><span className="text-ink-muted">{ui("Allergies")}: </span>{data.plan?.allergies || ui("None recorded")}</p>
        <p dir="auto" className="whitespace-pre-wrap"><span className="text-ink-muted">{ui("Action plan")}: </span>{data.plan?.actionPlan || ui("None recorded")}</p>
        {data.plan ? <p className="text-xs text-ink-muted">{ui("Updated {0} by {1}", [dateTime(data.plan.updatedAt), data.plan.updatedBy])}</p> : null}
        {canPlan ? <Button size="sm" variant="outline" className="w-fit" onClick={() => setEditPlan(true)} data-clinic-plan-edit>{ui("Edit care plan")}</Button> : null}
      </>}
    </DeskSection>
    <div className="space-y-2" data-clinic-instructions>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-bold text-ink-strong"><Pill aria-hidden="true" className="size-4 text-primary" />{ui("Medication instructions")}</h4>{canPlan ? <Button size="sm" variant="outline" onClick={() => setIns({ medicine: "", dose: "", schedule: "", authorizedBy: "", authorizationRef: "", validFrom: localNow(), validUntil: "" })} data-clinic-instruction-new>{ui("Add approved instruction")}</Button> : null}</div>
      <p className="text-xs text-ink-muted">{ui("The clinic records doses only against an approved, in-date instruction and never changes a dose.")}</p>
      {data.instructions.length ? <ul className="space-y-2">{data.instructions.map(i => <li key={i.id} className={cn(deskRow, "space-y-1 text-sm")} data-tone={i.active ? "success" : "muted"} data-clinic-instruction={i.id} data-active={i.active}>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><DeskPill tone={i.active ? "success" : "neutral"}>{i.active ? ui("Active") : i.endedAt ? ui("Ended") : ui("Not in effect")}</DeskPill><span dir="auto" className="font-bold text-ink-strong">{i.medicine}</span> · <span dir="auto">{i.dose}</span> · <span dir="auto">{i.schedule}</span></p>
        <p className="text-xs text-ink-muted">{ui("Authorized by {0} · ref {1} · {2}–{3}", [i.authorizedBy, i.authorizationRef, dateTime(i.validFrom), dateTime(i.validUntil)])}{i.endedAt ? <> · {ui("Ended")}</> : !i.active ? <> · {ui("Not in effect")}</> : null}</p>
        {i.active && canRecord ? <span className="mt-1 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/care", "POST", { action: "dose", instructionId: i.id, dose: i.dose }), "Dose recorded.")} data-clinic-dose>{ui("Record dose given now ({0})", [i.dose])}</Button>{canPlan ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => call("/api/care", "POST", { action: "end-instruction", id: i.id }), "Instruction ended.")} data-clinic-instruction-end>{ui("End instruction")}</Button> : null}</span> : null}
      </li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No medication instructions.")}</p>}
    </div>
    {!data.access.emergency ? <>
      <div className="space-y-2" data-clinic-doses><h4 className="text-sm font-bold text-ink-strong">{ui("Doses given")}</h4>{data.doses.length ? <ol className={cn(deskTimeline, "text-sm")}>{data.doses.map(d => <li key={d.id} data-tone="success" data-clinic-dose-row={d.id}><bdi>{dateTime(d.givenAt)}</bdi> · <span dir="auto">{d.dose}</span> · <bdi>{d.actor}</bdi></li>)}</ol> : <p className="text-sm text-ink-muted">{ui("No doses recorded.")}</p>}</div>
      <DeskSection title={ui("Record visit")} icon={Stethoscope} data-clinic-visit-form>
        <FormField name="cv-time" label={ui("Arrived at")}><Input type="datetime-local" value={visit.arrivedAt} onChange={e => setVisit({ ...visit, arrivedAt: e.target.value })} dir="ltr" /></FormField>
        <FormField name="cv-obs" label={ui("Record what you observed")}><Textarea value={visit.observation} onChange={e => setVisit({ ...visit, observation: e.target.value })} rows={3} dir="auto" data-clinic-visit-observation /></FormField>
        <FormField name="cv-action" label={ui("What was done")}><Textarea value={visit.actionTaken} onChange={e => setVisit({ ...visit, actionTaken: e.target.value })} rows={2} dir="auto" data-clinic-visit-action /></FormField>
        <FormField name="cv-outcome" label={ui("Outcome")}><Select value={visit.outcome} onChange={e => setVisit({ ...visit, outcome: e.target.value })} data-clinic-visit-outcome>{["RETURNED_TO_CLASS", "SENT_HOME", "EMERGENCY_SERVICES", "STAYED_IN_CLINIC"].map(o => <option key={o} value={o}>{outcomeLabel(ui, o)}</option>)}</Select></FormField>
        <div className="flex justify-end"><Button loading={busy} disabled={busy || !visit.observation.trim() || !visit.actionTaken.trim()} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "visit", studentId, ...visit, arrivedAt: new Date(visit.arrivedAt).toISOString() }); setVisit({ observation: "", actionTaken: "", outcome: "RETURNED_TO_CLASS", arrivedAt: localNow() }); }, "Visit recorded.")} data-clinic-visit-save>{ui("Save visit")}</Button></div>
      </DeskSection>
      <div className="space-y-2" data-clinic-visits><h4 className="text-sm font-bold text-ink-strong">{ui("Visits")}</h4>{data.visits.length ? <ol className={deskTimeline}>{data.visits.map(v => <li key={v.id} data-tone={v.outcome === "EMERGENCY_SERVICES" ? "danger" : v.outcome === "SENT_HOME" ? "warning" : "brand"} className="rounded-(--radius-control-small) border border-border-subtle bg-card px-3 py-2 text-sm" data-clinic-visit={v.id}><p className="text-xs text-ink-muted"><bdi>{dateTime(v.arrivedAt)}</bdi> · {outcomeLabel(ui, v.outcome)} · <bdi>{v.recordedBy}</bdi></p><p dir="auto" className="whitespace-pre-wrap">{v.observation}</p><p dir="auto" className="whitespace-pre-wrap text-ink-muted">{v.actionTaken}</p></li>)}</ol> : <EmptyState size="sm" icon={ShieldCheck} title={ui("No visits recorded.")} />}</div>
    </> : null}
    {ins ? <Modal title={ui("Add approved instruction")} subtitle={ui("Copy the instruction exactly as signed. The clinic does not prescribe.")} icon={Pill} tone="sky" onClose={() => setIns(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setIns(null)}>{ui("Back")}</Button><Button loading={busy} disabled={busy || !ins.validUntil} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "instruction", studentId, ...ins, validFrom: new Date(ins.validFrom).toISOString(), validUntil: new Date(ins.validUntil).toISOString() }); setIns(null); }, "Instruction recorded.")} data-clinic-instruction-save>{ui("Save instruction")}</Button></div>}>
      <div className="space-y-2" data-clinic-instruction-form>
        {[["medicine", "Medicine"], ["dose", "Dose"], ["schedule", "When it may be given"], ["authorizedBy", "Authorized by"], ["authorizationRef", "Authorization reference"]].map(([k, l]) => <FormField key={k} name={`ci-${k}`} label={ui(l)}><Input value={ins[k]} onChange={e => setIns({ ...ins, [k]: e.target.value })} dir="auto" data-clinic-field={k} /></FormField>)}
        <div className="grid gap-2 sm:grid-cols-2"><FormField name="ci-from" label={ui("Valid from")}><Input type="datetime-local" value={ins.validFrom} onChange={e => setIns({ ...ins, validFrom: e.target.value })} dir="ltr" data-clinic-field="validFrom" /></FormField><FormField name="ci-until" label={ui("Valid until")}><Input type="datetime-local" value={ins.validUntil} onChange={e => setIns({ ...ins, validUntil: e.target.value })} dir="ltr" data-clinic-field="validUntil" /></FormField></div>
      </div>
    </Modal> : null}
  </section>;
}

function ClinicWorkspace() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [queue, setQueue] = useState<{ role: string; visits: { id: string; studentId: string; studentName: string; arrivedAt: string; outcome: string }[]; instructions: { id: string; studentId: string; studentName: string; medicine: string; schedule: string; validUntil: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null), [pick, setPick] = useState<Student | null>(null);
  // The emergency tile narrows the visit list; the quick filter narrows both lists by pupil name or medicine.
  const [emergencyOnly, setEmergencyOnly] = useState(false), [q, setQ] = useState("");
  const load = useCallback(() => call("/api/care?view=clinic").then(q => { setQueue(q); setError(null); }).catch(e => setError(e.message)), []);
  useEffect(() => { if (!open) void load(); }, [load, open]);
  useEffect(() => { if (pick) { setOpen(pick.id); setPick(null); } }, [pick]);
  if (open) return <ClinicRecord studentId={open} onClose={() => setOpen(null)} />;
  if (error) return <p className="sk-panel p-4 text-sm" data-care-denied>{ui(error)}</p>;
  if (!queue) return <p className="text-sm text-ink-muted">{ui("Verifying confidential access before loading records.")}</p>;
  const needle = q.trim().toLowerCase();
  const visitRank = (o: string) => o === "EMERGENCY_SERVICES" ? 0 : o === "SENT_HOME" ? 1 : o === "STAYED_IN_CLINIC" ? 2 : 3;
  const visits = urgencyFirst(queue.visits.filter(v => (!emergencyOnly || v.outcome === "EMERGENCY_SERVICES") && (!needle || v.studentName.toLowerCase().includes(needle))), v => visitRank(v.outcome));
  const instructions = queue.instructions.filter(i => !needle || `${i.studentName} ${i.medicine}`.toLowerCase().includes(needle));
  const emergencies = queue.visits.filter(v => v.outcome === "EMERGENCY_SERVICES").length;
  return <section className="sk-panel space-y-4 p-4 sm:p-5" data-clinic-queue>
    <header><h2 className="text-base font-bold text-ink-strong">{ui("Clinic workspace")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("Only clinic members can open these records. Safeguarding uses a separately authorized workspace.")} · {roleLabel(ui, queue.role)}</p></header>
    <DeskStats data-clinic-pulse>
      <StatTile index={0} icon={Stethoscope} tone="brand" value={queue.visits.length} label={ui("Recent visits")} />
      <StatTile index={1} icon={Pill} tone={queue.instructions.length ? "info" : "neutral"} value={queue.instructions.length} label={ui("Medication in effect")} />
      <StatTile index={2} icon={Siren} tone={emergencies ? "danger" : "neutral"} value={emergencies} label={ui("Emergency services called")} onSelect={emergencies ? () => setEmergencyOnly(v => !v) : undefined} selected={emergencyOnly} />
    </DeskStats>
    <StudentPicker value={null} onChange={setPick} label={ui("Open a student's clinic record")} />
    {queue.visits.length + queue.instructions.length > 8 ? <DeskQuickFilter value={q} onChange={setQ} label={ui("Filter this list")} /> : null}
    <DeskFilterStatus shown={visits.length + instructions.length} total={queue.visits.length + queue.instructions.length} onClear={() => { setEmergencyOnly(false); setQ(""); }} />
    <div><h3 className="text-base font-semibold text-ink-strong">{ui("Recent visits")}</h3>{visits.length ? <ul className="mt-2 space-y-2">{visits.map(v => <li key={v.id}><DeskRowButton icon={Stethoscope} tone={v.outcome === "EMERGENCY_SERVICES" ? "danger" : v.outcome === "SENT_HOME" ? "warning" : undefined} trailing={<DeskPill tone={v.outcome === "EMERGENCY_SERVICES" ? "danger" : v.outcome === "SENT_HOME" ? "warning" : v.outcome === "RETURNED_TO_CLASS" ? "success" : "info"}>{outcomeLabel(ui, v.outcome)}</DeskPill>} onClick={() => setOpen(v.studentId)} data-clinic-queue-visit={v.id}><span className="block text-sm font-semibold text-ink-strong"><bdi>{v.studentName}</bdi></span><span className="block text-xs text-ink-muted"><RelativeTime iso={v.arrivedAt} full={dateTime(v.arrivedAt)} /></span></DeskRowButton></li>)}</ul> : <EmptyState size="sm" icon={ShieldCheck} title={ui("No records assigned to you in this confidential workspace.")} />}</div>
    <div><h3 className="text-base font-semibold text-ink-strong">{ui("Medication in effect")}</h3>{instructions.length ? <ul className="mt-2 space-y-2">{instructions.map(i => <li key={i.id}><DeskRowButton icon={Pill} onClick={() => setOpen(i.studentId)} data-clinic-queue-instruction={i.id}><span className="block text-sm font-semibold text-ink-strong"><bdi>{i.studentName}</bdi></span><span className="block text-xs text-ink-muted"><span dir="auto">{i.medicine}</span> · <span dir="auto">{i.schedule}</span></span></DeskRowButton></li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No medication instructions.")}</p>}</div>
  </section>;
}

// ─── Safeguarding ────────────────────────────────────────────────────────

type ConcernData = {
  access: { emergency: boolean; expiresAt?: string; purpose?: string; role?: string };
  concern: { id: string; reference: string; status: string; escalation: string | null; source: string; observation: string; eventAt: string; createdAt: string; closedAt: string | null; version: number; reporter: string; ownerId: string | null; owner: string | null };
  student: { id: string; fullName: string; className: string } | null;
  entries: { id: string; kind: string; body: string | null; detail: Record<string, unknown>; actor: string; createdAt: string }[];
  disclosures: { id: string; recipientType: string; recipientName: string; purpose: string; content: string; contentHash: string; status: string; proposedBy: string; proposedByMe: boolean; reviewedBy: string | null; reviewedAt: string | null; releasedAt: string | null; createdAt: string }[];
  guardians: { userId: string; name: string; relationship: string; implicated: boolean }[];
};
type Members = { userId: string; role: string; name: string }[];

function ConcernDetail({ concernId, members, onClose }: { concernId: string; members: Members; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<ConcernData | null>(null), [gone, setGone] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [note, setNote] = useState(""), [owner, setOwner] = useState(""), [esc, setEsc] = useState({ escalation: "INTERNAL_REVIEW", reason: "" }), [closeReason, setCloseReason] = useState("");
  const [disc, setDisc] = useState<{ recipientType: string; recipientUserId: string; recipientName: string; purpose: string; content: string } | null>(null), [confirmDisc, setConfirmDisc] = useState(false);
  const [review, setReview] = useState<ConcernData["disclosures"][number] | null>(null);
  // Releasing an approved disclosure sends it to the recipient and cannot be taken back, so it is confirmed (R3).
  const [releasing, setReleasing] = useState<ConcernData["disclosures"][number] | null>(null);
  const [staff, setStaff] = useState<Student[]>([]);
  const load = useCallback(async () => { try { const d = await call(`/api/care?view=safeguarding&concernId=${concernId}`); setData(d); setOwner(d.concern.ownerId ?? ""); } catch (e) { setData(null); setGone(e instanceof Error ? e.message : "Record unavailable."); } }, [concernId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!data?.access.emergency || !data.access.expiresAt) return; const t = setTimeout(() => { setData(null); setGone("Emergency access has ended."); }, Math.max(0, new Date(data.access.expiresAt).getTime() - Date.now())); return () => clearTimeout(t); }, [data]);
  useEffect(() => { if (disc?.recipientType === "STAFF" && !staff.length) call("/api/care?view=staff").then(setStaff).catch(() => setStaff([])); }, [disc, staff.length]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { if (e instanceof AccessError) { setData(null); setGone(e.message); } else toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (gone) return <section className="sk-panel space-y-2 p-4" data-care-gone><p className="text-sm">{ui(gone)}</p><Button size="sm" variant="secondary" onClick={onClose}>{ui("Back")}</Button></section>;
  if (!data) return <p className="text-sm text-ink-muted">{ui("Verifying confidential access before loading records.")}</p>;
  const c = data.concern, lead = !data.access.emergency, closed = c.status === "CLOSED";
  const kindLabel = (k: string) => ({ CREATED: ui("Concern recorded"), NOTE: ui("Note"), OWNER: ui("Owner assigned"), STATUS: ui("Status changed"), ESCALATION: ui("Escalated"), DISCLOSURE: ui("Disclosure"), CLOSED: ui("Closed") } as Record<string, string>)[k] ?? k;
  return <section className="sk-panel min-w-0 space-y-4 p-4 sm:p-5" data-concern={c.id} data-concern-status={c.status}>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-ink-strong"><bdi className="font-mono">{c.reference}</bdi><DeskPill tone={caseTone(c.status)}>{statusLabel(ui, c.status)}</DeskPill></h3><p className="text-xs text-ink-muted">{data.student ? <><bdi>{data.student.fullName}</bdi> · <bdi>{data.student.className}</bdi> · </> : null}{ui("Owner: {0}", [c.owner ?? ui("Unassigned")])}{c.escalation ? <> · {c.escalation === "EXTERNAL_REFERRAL" ? ui("External referral") : ui("Internal review")}</> : null}</p></div><span className="flex gap-2"><a className="sk-link text-sm font-medium text-primary" href={`/api/care/export?concernId=${c.id}`} data-concern-export>{ui("Export chronology")}</a><Button size="sm" variant="secondary" onClick={onClose}>{ui("Back")}</Button></span></header>
    <EmergencyBanner access={data.access} />
    <div className="rounded-(--radius-control) border border-border-subtle bg-surface-subtle p-4 text-sm"><p className="text-xs text-ink-muted">{ui("Observation as recorded by {0} · {1} · event {2}", [c.reporter, sourceLabel(ui, c.source), dateTime(c.eventAt)])}</p><blockquote dir="auto" className="mt-2 whitespace-pre-wrap border-s-2 border-brand-200 ps-3 leading-relaxed text-ink-strong" data-concern-observation>{c.observation}</blockquote></div>
    {lead && !closed ? <div className="grid gap-3 sm:grid-cols-2">
      <div className="sk-desk-section content-start"><FormField name="sg-owner" label={ui("Designated owner")}><Select value={owner} onChange={e => setOwner(e.target.value)} data-concern-owner-select><option value="">{ui("Choose")}</option>{members.map(m => <option key={m.userId} value={m.userId}>{m.name} · {roleLabel(ui, m.role)}</option>)}</Select></FormField><Button size="sm" disabled={busy || !owner || owner === c.ownerId} onClick={() => void run(() => call("/api/care", "POST", { action: "assign", concernId: c.id, ownerId: owner, version: c.version }), "Owner assigned.")} data-concern-assign>{ui("Assign owner")}</Button></div>
      <div className="sk-desk-section content-start"><FormField name="sg-esc" label={ui("Escalation")}><Select value={esc.escalation} onChange={e => setEsc({ ...esc, escalation: e.target.value })} data-concern-escalation><option value="INTERNAL_REVIEW">{ui("Internal review")}</option><option value="EXTERNAL_REFERRAL">{ui("External referral")}</option></Select></FormField><FormField name="sg-esc-reason" label={ui("Reason")}><Input value={esc.reason} onChange={e => setEsc({ ...esc, reason: e.target.value })} dir="auto" data-concern-escalation-reason /></FormField><Button size="sm" disabled={busy || !c.ownerId || !esc.reason.trim()} onClick={() => void run(() => call("/api/care", "POST", { action: "escalate", concernId: c.id, version: c.version, ...esc }), "Escalation recorded.")} data-concern-escalate>{ui("Record escalation")}</Button></div>
    </div> : null}
    <div className="space-y-2"><h4 className="text-sm font-bold text-ink-strong">{ui("Chronology")}</h4><ol className={deskTimeline}>{data.entries.map(e => <li key={e.id} data-tone={e.kind === "ESCALATION" ? "danger" : e.kind === "CLOSED" ? "neutral" : e.kind === "DISCLOSURE" ? "warning" : "brand"} className="text-sm" data-concern-entry={e.kind}><p className="text-xs text-ink-muted"><bdi>{dateTime(e.createdAt)}</bdi> · {kindLabel(e.kind)} · <bdi>{e.actor}</bdi>{e.kind === "DISCLOSURE" && typeof e.detail.status === "string" ? <> · {statusLabel(ui, e.detail.status)}</> : null}</p>{e.body ? <p dir="auto" className="whitespace-pre-wrap">{e.body}</p> : null}</li>)}</ol>
      {lead ? <div className="flex flex-col gap-2 sm:flex-row"><Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} dir="auto" placeholder={ui("Add a note to the chronology")} aria-label={ui("Add a note to the chronology")} data-concern-note /><Button size="sm" disabled={busy || !note.trim()} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "note", concernId: c.id, version: c.version, body: note }); setNote(""); }, "Note added.")} data-concern-note-save>{ui("Add note")}</Button></div> : null}
    </div>
    <div className="space-y-2" data-concern-disclosures>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-ink-strong">{ui("Disclosures")}</h4>{lead ? <Button size="sm" variant="outline" onClick={() => { setConfirmDisc(false); setDisc({ recipientType: "STAFF", recipientUserId: "", recipientName: "", purpose: "", content: "" }); }} data-concern-disclose>{ui("Propose a disclosure")}</Button> : null}</div>
      <p className="text-xs text-ink-muted">{ui("Nothing is shared until a second lead approves the exact words, recipient and purpose.")}</p>
      <ConfirmAction
        open={Boolean(releasing)}
        tone="warning"
        title={ui("Release this disclosure?")}
        description={releasing ? ui("The approved words are shared with {0} for the stated purpose. Once released, it cannot be taken back.", [releasing.recipientName]) : ""}
        confirmLabel={ui("Release")}
        cancelLabel={ui("Keep editing")}
        busy={busy}
        onConfirm={() => { const item = releasing; if (item) return run(() => call("/api/care", "POST", { action: "release-disclosure", id: item.id }), "Released to the approved recipient.").then(saved => { if (saved) setReleasing(null); }); }}
        onCancel={() => setReleasing(null)}
      />
      {data.disclosures.length ? <ul className="space-y-2">{data.disclosures.map(d => <li key={d.id} className={cn(deskRow, "space-y-1 text-sm")} data-tone={d.status === "PROPOSED" ? "warning" : d.status === "RELEASED" ? "success" : undefined} data-disclosure={d.id} data-disclosure-status={d.status}>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><DeskPill tone={caseTone(d.status)}>{statusLabel(ui, d.status)}</DeskPill><bdi className="font-semibold text-ink-strong">{d.recipientName}</bdi> · <span dir="auto">{d.purpose}</span></p>
        <p className="text-xs text-ink-muted">{ui("Proposed by {0}", [d.proposedBy])}{d.reviewedBy ? <> · {ui("Reviewed by {0}", [d.reviewedBy])}</> : null}</p>
        {lead && d.status === "PROPOSED" && !d.proposedByMe ? <Button size="sm" variant="outline" onClick={() => setReview(d)} data-disclosure-review>{ui("Review")}</Button> : null}
        {lead && d.status === "APPROVED" ? <Button size="sm" disabled={busy} onClick={() => setReleasing(d)} data-disclosure-release>{ui("Release")}</Button> : null}
      </li>)}</ul> : <p className="text-sm text-ink-muted">{ui("This case has not been shared with anyone.")}</p>}
    </div>
    {lead && data.guardians.length ? <details className="text-sm"><summary className="cursor-pointer">{ui("Guardians named in the concern")}</summary><ImplicatedEditor data={data} busy={busy} run={run} /></details> : null}
    {lead && !closed ? <div className="flex flex-col gap-2 rounded-(--radius-control) border border-border-subtle bg-surface-subtle p-3 sm:flex-row"><Input value={closeReason} onChange={e => setCloseReason(e.target.value)} dir="auto" placeholder={ui("Why is the case being closed?")} aria-label={ui("Why is the case being closed?")} data-concern-close-reason /><Button size="sm" variant="secondary" disabled={busy || !c.ownerId || !closeReason.trim()} onClick={() => void run(() => call("/api/care", "POST", { action: "close", concernId: c.id, version: c.version, reason: closeReason }), "Case closed. The chronology is retained.")} data-concern-close>{ui("Close case")}</Button></div> : null}
    {disc ? <Modal title={ui("Propose a disclosure for {0}", [c.reference])} icon={FileLock2} onClose={() => setDisc(null)} footer={!confirmDisc ? <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setDisc(null)}>{ui("Keep restricted")}</Button><Button disabled={!disc.purpose.trim() || !disc.content.trim() || (disc.recipientType !== "EXTERNAL_AGENCY" ? !disc.recipientUserId : disc.recipientName.trim().length < 3)} onClick={() => setConfirmDisc(true)} data-disclosure-preview>{ui("Preview")}</Button></div> : <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmDisc(false)}>{ui("Back")}</Button><Button disabled={busy} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "propose-disclosure", concernId: c.id, ...disc }); setDisc(null); }, "Sent for a second lead's review.")} data-disclosure-propose>{ui("Send for review")}</Button></div>}>
      {!confirmDisc ? <div className="space-y-2" data-disclosure-form>
        <FormField name="d-type" label={ui("Recipient")}><Select value={disc.recipientType} onChange={e => setDisc({ ...disc, recipientType: e.target.value, recipientUserId: "" })} data-disclosure-type><option value="STAFF">{ui("Staff member")}</option><option value="GUARDIAN">{ui("Guardian")}</option><option value="EXTERNAL_AGENCY">{ui("External agency")}</option></Select></FormField>
        {disc.recipientType === "GUARDIAN" ? <FormField name="d-guardian" label={ui("Guardian")}><Select value={disc.recipientUserId} onChange={e => setDisc({ ...disc, recipientUserId: e.target.value })} data-disclosure-guardian><option value="">{ui("Choose")}</option>{data.guardians.map(g => <option key={g.userId} value={g.userId} disabled={g.implicated}>{g.name} · {g.relationship}{g.implicated ? ` · ${ui("named in the concern")}` : ""}</option>)}</Select></FormField>
          : disc.recipientType === "STAFF" ? <FormField name="d-staff" label={ui("Staff member")}><Select value={disc.recipientUserId} onChange={e => setDisc({ ...disc, recipientUserId: e.target.value })} data-disclosure-staff><option value="">{ui("Choose")}</option>{staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></FormField>
          : <FormField name="d-agency" label={ui("Agency and contact")}><Input value={disc.recipientName} onChange={e => setDisc({ ...disc, recipientName: e.target.value })} dir="auto" data-disclosure-agency /></FormField>}
        <FormField name="d-purpose" label={ui("Purpose")}><Input value={disc.purpose} onChange={e => setDisc({ ...disc, purpose: e.target.value })} dir="auto" data-disclosure-purpose /></FormField>
        <FormField name="d-content" label={ui("Exactly what will be shared")} hint={ui("Only what this recipient needs for this purpose. Leave out other people and unrelated detail.")}><Textarea value={disc.content} onChange={e => setDisc({ ...disc, content: e.target.value })} rows={5} dir="auto" data-disclosure-content /></FormField>
      </div> : <div className="space-y-2" data-disclosure-confirm>
        <p className="text-sm">{ui("Recipient")}: <bdi>{disc.recipientType === "GUARDIAN" ? data.guardians.find(g => g.userId === disc.recipientUserId)?.name : disc.recipientType === "STAFF" ? staff.find(s => s.id === disc.recipientUserId)?.fullName : disc.recipientName}</bdi> · <span dir="auto">{disc.purpose}</span></p>
        <blockquote dir="auto" className="whitespace-pre-wrap rounded-xl border p-3 text-sm">{disc.content}</blockquote>
        <p className="text-xs text-ink-muted">{ui("This message has not been sent. A second lead must approve it first.")}</p>
      </div>}
    </Modal> : null}
    {review ? <Modal title={ui("Safeguarding disclosure review · {0}", [c.reference])} subtitle={ui("Approving binds this exact text and recipient. Nothing is sent until it is released.")} icon={ShieldCheck} onClose={() => setReview(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "review-disclosure", id: review.id, decision: "DECLINE" }); setReview(null); }, "Kept restricted.")} data-disclosure-decline>{ui("Keep restricted")}</Button><Button disabled={busy} onClick={() => void run(async () => { await call("/api/care", "POST", { action: "review-disclosure", id: review.id, decision: "APPROVE", contentHash: review.contentHash }); setReview(null); }, "Disclosure approved.")} data-disclosure-approve>{ui("Approve disclosure")}</Button></div>}>
      <div className="space-y-2" data-disclosure-review-modal>
        <p className="text-sm">{ui("Recipient")}: <bdi>{review.recipientName}</bdi> · {ui("Purpose")}: <span dir="auto">{review.purpose}</span></p>
        <blockquote dir="auto" className="whitespace-pre-wrap rounded-xl border p-3 text-sm">{review.content}</blockquote>
      </div>
    </Modal> : null}
  </section>;
}

function ImplicatedEditor({ data, busy, run }: { data: ConcernData; busy: boolean; run: (work: () => Promise<unknown>, done: string) => Promise<boolean> }) {
  const ui = useUiText();
  const [ids, setIds] = useState(() => data.guardians.filter(g => g.implicated).map(g => g.userId)), [reason, setReason] = useState("");
  return <div className="mt-2 space-y-2" data-concern-implicated>
    <p className="text-xs text-ink-muted">{ui("Nothing about the case can ever be shared with a guardian named here.")}</p>
    {data.guardians.map(g => <label key={g.userId} className="flex items-center gap-2"><Checkbox checked={ids.includes(g.userId)} onChange={e => setIds(e.target.checked ? [...ids, g.userId] : ids.filter(x => x !== g.userId))} data-implicated={g.userId} /><bdi>{g.name}</bdi> · <span dir="auto">{g.relationship}</span></label>)}
    <Input value={reason} onChange={e => setReason(e.target.value)} dir="auto" placeholder={ui("Why is this changing?")} aria-label={ui("Why is this changing?")} data-implicated-reason />
    <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void run(() => call("/api/care", "POST", { action: "implicated", concernId: data.concern.id, version: data.concern.version, guardianUserIds: ids, reason }), "Saved.")} data-implicated-save>{ui("Save")}</Button>
  </div>;
}

function SafeguardingWorkspace() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [queue, setQueue] = useState<{ role: string; members: Members; concerns: { id: string; reference: string; status: string; escalation: string | null; owner: string | null; mine: boolean; eventAt: string; createdAt: string; pendingDisclosures: number; retentionDue: boolean }[] } | null>(null);
  const [error, setError] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null), [filter, setFilter] = useState("OPEN");
  const [pendingOnly, setPendingOnly] = useState(false), [q, setQ] = useState("");
  const load = useCallback(() => call("/api/care?view=safeguarding").then(q => { setQueue(q); setError(null); }).catch(e => setError(e.message)), []);
  useEffect(() => { if (!open) void load(); }, [load, open]);
  if (open) return <ConcernDetail concernId={open} members={queue?.members ?? []} onClose={() => setOpen(null)} />;
  if (error) return <p className="sk-panel p-4 text-sm" data-care-denied>{ui(error)}</p>;
  if (!queue) return <p className="text-sm text-ink-muted">{ui("Verifying confidential access before loading records.")}</p>;
  const needle = q.trim().toLowerCase();
  // Escalated first, then cases nobody owns yet, then words waiting for a second lead; the newest stay on top within each.
  const rows = urgencyFirst(queue.concerns.filter(c => (filter === "ALL" || (filter === "MINE" ? c.mine : c.status !== "CLOSED")) && (!pendingOnly || c.pendingDisclosures > 0) && (!needle || `${c.reference} ${c.owner ?? ""}`.toLowerCase().includes(needle))),
    c => c.status === "ESCALATED" ? 0 : !c.owner && c.status !== "CLOSED" ? 1 : c.pendingDisclosures ? 2 : c.status === "CLOSED" ? 4 : 3);
  const live = queue.concerns.filter(c => c.status !== "CLOSED");
  const pending = queue.concerns.filter(c => c.pendingDisclosures).length;
  return <section className="sk-panel min-w-0 space-y-3 p-4 sm:p-5" data-safeguarding-queue>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-bold text-ink-strong">{ui("Safeguarding workspace")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("Separately authorized. Clinic membership does not open these records.")} · {roleLabel(ui, queue.role)}</p></div>
      <Select value={filter} onChange={e => setFilter(e.target.value)} aria-label={ui("Show")} className="w-auto" data-safeguarding-filter><option value="OPEN">{ui("Open cases")}</option><option value="MINE">{ui("Assigned to me")}</option><option value="ALL">{ui("All cases")}</option></Select></header>
    <DeskStats data-safeguarding-pulse>
      <StatTile index={0} icon={ShieldAlert} tone={live.some(c => c.status === "ESCALATED") ? "danger" : live.length ? "warning" : "success"} value={live.length} label={ui("Open cases")} onSelect={() => setFilter(f => f === "OPEN" ? "ALL" : "OPEN")} selected={filter === "OPEN"} />
      <StatTile index={1} icon={UserCheck} tone="brand" value={live.filter(c => c.mine).length} label={ui("Assigned to me")} onSelect={() => setFilter(f => f === "MINE" ? "OPEN" : "MINE")} selected={filter === "MINE"} />
      <StatTile index={2} icon={FileLock2} tone={pending ? "warning" : "neutral"} value={pending} label={ui("Disclosure awaiting review")} onSelect={pending ? () => setPendingOnly(v => !v) : undefined} selected={pendingOnly} />
    </DeskStats>
    {queue.concerns.length > 8 ? <DeskQuickFilter value={q} onChange={setQ} label={ui("Filter this list")} /> : null}
    <DeskFilterStatus shown={rows.length} total={queue.concerns.length} onClear={() => { setFilter("ALL"); setPendingOnly(false); setQ(""); }} />
    {rows.length ? <ul className="space-y-2">{rows.map(c => <li key={c.id}><DeskRowButton icon={ShieldAlert} tone={c.status === "ESCALATED" ? "danger" : !c.owner && c.status !== "CLOSED" ? "warning" : c.status === "CLOSED" ? "muted" : undefined} trailing={<DeskPill tone={caseTone(c.status)}>{statusLabel(ui, c.status)}</DeskPill>} onClick={() => setOpen(c.id)} data-safeguarding-row={c.reference}>
      <span className="block text-sm font-bold text-ink-strong"><bdi className="font-mono">{c.reference}</bdi></span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted"><span>{ui("Owner: {0}", [c.owner ?? ui("Unassigned")])}</span><RelativeTime iso={c.createdAt} full={dateTime(c.createdAt)} />{c.pendingDisclosures ? <DeskPill tone="warning">{ui("Disclosure awaiting review")}</DeskPill> : null}{c.retentionDue ? <DeskPill tone="neutral">{ui("Retention review due")}</DeskPill> : null}</span>
    </DeskRowButton></li>)}</ul> : <EmptyState size="sm" icon={ShieldCheck} title={ui("No records assigned to you in this confidential workspace.")} />}
  </section>;
}

// ─── Lead oversight ──────────────────────────────────────────────────────

function Oversight({ domain }: { domain: Domain }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<{ grants: { id: string; user: string; studentName: string; purpose: string; createdAt: string; expiresAt: string; revokedAt: string | null; live: boolean; uses: number; reviewedAt: string | null; reviewedBy: string | null; reviewNote: string | null }[]; logs: { id: string; actor: string; action: string; recordType: string; emergency: boolean; createdAt: string }[] } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const load = useCallback(() => call(`/api/care?view=oversight&domain=${domain}`).then(setData).catch(() => setData(null)), [domain]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const review = async (id: string) => { setBusy(true); try { await call("/api/care", "POST", { action: "review-emergency", id, note: notes[id] }); toast.success(ui("Review recorded.")); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  return <section className="sk-panel min-w-0 space-y-3 p-4 sm:p-5" data-care-oversight={domain}>
    <h2 className="text-base font-bold text-ink-strong">{ui("Access review · {0}", [domainLabel(ui, domain)])}</h2>
    <h3 className="text-base font-semibold text-ink-strong">{ui("Emergency access")}</h3>
    {data.grants.length ? <ul className="space-y-2">{data.grants.map(g => <li key={g.id} className={cn(deskRow, "space-y-1 text-sm")} data-tone={g.reviewedAt ? "muted" : g.live ? "danger" : "warning"} data-emergency-grant={g.id} data-reviewed={!!g.reviewedAt}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><DeskPill tone={g.live ? "danger" : g.reviewedAt ? "success" : "warning"}>{g.live ? ui("Active") : g.revokedAt ? ui("Revoked") : ui("Expired")}</DeskPill><bdi className="font-semibold text-ink-strong">{g.user}</bdi> · <bdi>{g.studentName}</bdi> · <span dir="auto">{g.purpose}</span></p>
      <p className="text-xs text-ink-muted"><bdi>{dateTime(g.createdAt)}</bdi>–<bdi>{dateTime(g.revokedAt ?? g.expiresAt)}</bdi> · {g.live ? ui("Active") : g.revokedAt ? ui("Revoked") : ui("Expired")} · {ui("{0} records opened", [String(g.uses)])}</p>
      {g.reviewedAt ? <p className="text-xs">{ui("Reviewed by {0}", [g.reviewedBy ?? ""])} · <span dir="auto">{g.reviewNote}</span></p> : <div className="mt-1 flex flex-col gap-2 sm:flex-row"><Input value={notes[g.id] ?? ""} onChange={e => setNotes({ ...notes, [g.id]: e.target.value })} dir="auto" placeholder={ui("Review outcome")} aria-label={ui("Review outcome")} data-emergency-note /><Button size="sm" disabled={busy || !(notes[g.id] ?? "").trim()} onClick={() => void review(g.id)} data-emergency-review>{g.live ? ui("Review and end access") : ui("Record review")}</Button></div>}
    </li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No emergency access has been opened.")}</p>}
    <details className="text-sm"><summary className="cursor-pointer">{ui("Access log")}</summary><ol className={cn(deskTimeline, "mt-3 text-xs")}>{data.logs.map(l => <li key={l.id} data-tone={l.emergency ? "danger" : "neutral"} data-access-log={l.action}><bdi>{dateTime(l.createdAt)}</bdi> · <bdi>{l.actor}</bdi> · {l.action} · {l.recordType}{l.emergency ? ` · ${ui("Emergency access")}` : ""}</li>)}</ol></details>
  </section>;
}

// ─── Emergency access ────────────────────────────────────────────────────

function EmergencyPanel({ me, reload, onOpen }: { me: Me; reload: () => void; onOpen: (g: Me["grants"][number]) => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const domains = (["CLINIC", "SAFEGUARDING"] as Domain[]).filter(d => me.canEmergency[d]);
  const [domain, setDomain] = useState<Domain>(domains[0] ?? "CLINIC"), [student, setStudent] = useState<Student | null>(null), [purpose, setPurpose] = useState(""), [minutes, setMinutes] = useState("30"), [busy, setBusy] = useState(false);
  const open = async () => { if (!student) return; setBusy(true); try { await call("/api/care", "POST", { action: "emergency", domain, studentId: student.id, purpose, minutes: Number(minutes) }); toast.success(ui("Emergency access opened. It is logged and will be reviewed.")); setStudent(null); setPurpose(""); reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  const end = async (id: string) => { try { await call("/api/care", "POST", { action: "revoke-emergency", id }); reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } };
  return <section className="sk-desk-section" data-tone="danger" data-care-emergency>
    <header className="flex items-start gap-3"><span aria-hidden="true" className="sk-desk-section-icon"><KeyRound /></span><div className="min-w-0"><h2 className="text-base font-bold text-ink-strong">{ui("Emergency access")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("For an urgent need only. Access is limited to one student, ends automatically and is reviewed by the lead.")}</p></div></header>
    {me.grants.length ? <ul className="space-y-2">{me.grants.map(g => <li key={g.id} className={cn(deskRow, "flex flex-wrap items-center justify-between gap-2 text-sm")} data-tone="warning" data-my-grant={g.id}><span className="min-w-0">{domainLabel(ui, g.domain)} · <bdi>{g.studentName}</bdi> · {ui("ends {0}", [dateTime(g.expiresAt)])} · <RelativeTime iso={g.expiresAt} full={dateTime(g.expiresAt)} /></span><span className="flex gap-2"><Button size="sm" onClick={() => onOpen(g)} data-my-grant-open>{ui("Open record")}</Button><Button size="sm" variant="secondary" onClick={() => void end(g.id)} data-my-grant-end>{ui("End access now")}</Button></span></li>)}</ul> : null}
    {domains.length ? <div className="space-y-2">
      <FormField name="em-domain" label={ui("Workspace")}><Select value={domain} onChange={e => setDomain(e.target.value as Domain)} data-emergency-domain>{domains.map(d => <option key={d} value={d}>{domainLabel(ui, d)}</option>)}</Select></FormField>
      <StudentPicker value={student} onChange={setStudent} label={ui("Student")} />
      <FormField name="em-purpose" label={ui("Why do you need access now?")}><Input value={purpose} onChange={e => setPurpose(e.target.value)} dir="auto" data-emergency-purpose /></FormField>
      <FormField name="em-min" label={ui("For how long?")}><Select value={minutes} onChange={e => setMinutes(e.target.value)} data-emergency-minutes>{["15", "30", "60", "120", "240"].map(m => <option key={m} value={m}>{ui("{0} minutes", [m])}</option>)}</Select></FormField>
      <div className="flex justify-end"><Button variant="destructive" disabled={busy || !student || !purpose.trim()} onClick={() => void open()} data-emergency-open>{ui("Open emergency access")}</Button></div>
    </div> : null}
  </section>;
}

function EmergencyRecord({ grant, onClose }: { grant: Me["grants"][number]; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [concerns, setConcerns] = useState<{ id: string; reference: string; status: string; createdAt: string }[] | null>(null), [open, setOpen] = useState<string | null>(null), [gone, setGone] = useState<string | null>(null);
  useEffect(() => { if (grant.domain === "SAFEGUARDING") call(`/api/care?view=safeguarding&studentId=${grant.studentId}`).then(setConcerns).catch(e => setGone(e.message)); }, [grant]);
  if (grant.domain === "CLINIC") return <ClinicRecord studentId={grant.studentId} onClose={onClose} />;
  if (open) return <ConcernDetail concernId={open} members={[]} onClose={() => setOpen(null)} />;
  if (gone) return <section className="sk-panel space-y-2 p-4" data-care-gone><p className="text-sm">{ui(gone)}</p><Button size="sm" variant="secondary" onClick={onClose}>{ui("Back")}</Button></section>;
  return <section className="sk-panel space-y-2 p-4" data-emergency-concerns>
    <div className="flex justify-between gap-2"><h3 className="font-bold"><bdi>{grant.studentName}</bdi></h3><Button size="sm" variant="secondary" onClick={onClose}>{ui("Back")}</Button></div>
    {concerns?.length ? <ul className="space-y-1">{concerns.map(c => <li key={c.id}><Button variant="ghost" onClick={() => setOpen(c.id)} data-emergency-concern={c.reference}><bdi>{c.reference}</bdi> · {statusLabel(ui, c.status)} · <bdi>{dateTime(c.createdAt)}</bdi></Button></li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No safeguarding records for this student.")}</p>}
  </section>;
}

// ─── Settings (campus leaders) ───────────────────────────────────────────

function CareSettings() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  type S = { domain: Domain; enabled: boolean; procedureReference: string; leadUserId: string; leadName: string; retentionMonths: number | null; confirmedAt: string | null; confirmedBy: string };
  const [data, setData] = useState<{ settings: S[]; members: { id: string; domain: Domain; role: string; userId: string; name: string }[]; staff: { id: string; fullName: string; role: string }[] } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { procedureReference: string; leadUserId: string; retentionMonths: string; confirm: boolean }>>({}), [add, setAdd] = useState<Record<string, { userId: string; role: string }>>({}), [busy, setBusy] = useState(false);
  const settingsDraft = useFormDraft({
    record: "care:workspace-settings",
    schema: 1,
    values: drafts,
    baseline: Object.fromEntries((data?.settings ?? []).map(s => [s.domain, { procedureReference: s.procedureReference, leadUserId: s.leadUserId, retentionMonths: s.retentionMonths ? String(s.retentionMonths) : "", confirm: false }])),
    fields: ["CLINIC", "SAFEGUARDING"] as const,
    structures: { CLINIC: ["procedureReference", "leadUserId", "retentionMonths", "confirm"], SAFEGUARDING: ["procedureReference", "leadUserId", "retentionMonths", "confirm"] },
    enabled: Boolean(data),
    apply: values => setDrafts(values as typeof drafts),
  });
  // Removing someone's confidential access and switching a workspace off are permission changes (role-ux R3).
  const [removing, setRemoving] = useState<{ id: string; name: string; domain: Domain } | null>(null);
  const [disabling, setDisabling] = useState<{ domain: Domain; draft: { procedureReference: string; leadUserId: string; retentionMonths: string } } | null>(null);
  const load = useCallback(() => call("/api/care?view=settings").then((d: { settings: S[] }) => { setData(d as never); setDrafts(Object.fromEntries(d.settings.map(s => [s.domain, { procedureReference: s.procedureReference, leadUserId: s.leadUserId, retentionMonths: s.retentionMonths ? String(s.retentionMonths) : "", confirm: false }]))); }).catch(() => setData(null)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (!data) return null;
  return <section className="space-y-3" data-care-settings>
    <DraftRecovery recordLabel={ui("Care workspace settings")} draft={settingsDraft} saving={busy} excluded={ui("Student health and safeguarding records are never stored in this device draft.")} />
    <ConfirmAction
      open={Boolean(removing)}
      busy={busy}
      tone="danger"
      title={ui("Remove this member's access?")}
      description={removing ? ui("{0} can no longer open records in the {1} workspace. Records they wrote stay, and you can add them again later.", [removing.name, domainLabel(ui, removing.domain)]) : ""}
      confirmLabel={ui("Remove access")}
      cancelLabel={ui("Keep editing")}
      onConfirm={() => { const r = removing; if (r) return run(() => call("/api/care", "POST", { action: "revoke-member", id: r.id }), "Access removed.").then(saved => { if (saved) setRemoving(null); }); }}
      onCancel={() => setRemoving(null)}
    />
    <ConfirmAction
      open={Boolean(disabling)}
      busy={busy}
      tone="warning"
      title={ui("Disable this confidential workspace?")}
      description={disabling ? ui("Members can no longer open {0} records until the workspace is enabled again. Nothing is deleted.", [domainLabel(ui, disabling.domain)]) : ""}
      confirmLabel={ui("Disable")}
      cancelLabel={ui("Keep editing")}
      onConfirm={() => { const x = disabling; if (x) return run(() => call("/api/care", "POST", { action: "configure", domain: x.domain, enabled: false, procedureReference: x.draft.procedureReference, leadUserId: x.draft.leadUserId, retentionMonths: x.draft.retentionMonths }), "Workspace disabled.").then(saved => { if (saved) setDisabling(null); }); }}
      onCancel={() => setDisabling(null)}
    />
    {data.settings.map(s => {
    const d = drafts[s.domain] ?? { procedureReference: "", leadUserId: "", retentionMonths: "", confirm: false }, a = add[s.domain] ?? { userId: "", role: s.domain === "CLINIC" ? "NURSE" : "LEAD" };
    const members = data.members.filter(m => m.domain === s.domain), leads = members.filter(m => m.role === "LEAD");
    return <div key={s.domain} className="sk-panel min-w-0 space-y-3 p-4 sm:p-5" data-care-setting={s.domain} data-enabled={s.enabled}>
      <header><h2 className="text-base font-bold text-ink-strong">{ui("{0} workspace", [domainLabel(ui, s.domain)])} · {s.enabled ? ui("Enabled") : ui("Not enabled")}</h2>{s.confirmedAt ? <p className="text-xs text-ink-muted">{ui("Procedures confirmed by {0} on {1}", [s.confirmedBy, dateTime(s.confirmedAt)])}</p> : <p className="text-xs text-ink-muted">{ui("Add the members and responsible lead, record the local procedure and retention, then enable.")}</p>}</header>
      <div><h3 className="text-base font-semibold text-ink-strong">{ui("Members")}</h3>{members.length ? <ul className="mt-1 space-y-1">{members.map(m => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-care-member={m.userId}><span><bdi>{m.name}</bdi> · {roleLabel(ui, m.role)}</span><Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving({ id: m.id, name: m.name, domain: s.domain })} data-care-member-remove>{ui("Remove")}</Button></li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No members yet.")}</p>}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row"><Select value={a.userId} onChange={e => setAdd({ ...add, [s.domain]: { ...a, userId: e.target.value } })} aria-label={ui("Staff member")} data-care-member-user><option value="">{ui("Choose staff member")}</option>{data.staff.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}</Select><Select value={a.role} onChange={e => setAdd({ ...add, [s.domain]: { ...a, role: e.target.value } })} aria-label={ui("Role")} data-care-member-role>{(s.domain === "CLINIC" ? ["NURSE", "CLINIC_STAFF", "LEAD"] : ["LEAD", "DEPUTY"]).map(r => <option key={r} value={r}>{roleLabel(ui, r)}</option>)}</Select><Button size="sm" disabled={busy || !a.userId} onClick={() => void run(() => call("/api/care", "POST", { action: "add-member", domain: s.domain, ...a }), "Member added.")} data-care-member-add>{ui("Add member")}</Button></div>
      </div>
      <FormField name={`cs-proc-${s.domain}`} label={ui("Local procedure reference")}><Input value={d.procedureReference} onChange={e => setDrafts({ ...drafts, [s.domain]: { ...d, procedureReference: e.target.value } })} dir="auto" data-care-procedure /></FormField>
      <div className="grid gap-2 sm:grid-cols-2"><FormField name={`cs-lead-${s.domain}`} label={ui("Responsible lead")}><Select value={d.leadUserId} onChange={e => setDrafts({ ...drafts, [s.domain]: { ...d, leadUserId: e.target.value } })} data-care-lead><option value="">{ui("Choose")}</option>{leads.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select></FormField><FormField name={`cs-ret-${s.domain}`} label={ui("Retain closed records (months)")}><Input type="number" min={1} max={1200} value={d.retentionMonths} onChange={e => setDrafts({ ...drafts, [s.domain]: { ...d, retentionMonths: e.target.value } })} dir="ltr" data-care-retention /></FormField></div>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={d.confirm} onChange={e => setDrafts({ ...drafts, [s.domain]: { ...d, confirm: e.target.checked } })} data-care-confirm /><span>{ui("I confirm the local procedure, responsible lead and retention period were validated by the designated professionals.")}</span></label>
      <div className="flex flex-wrap justify-end gap-2">{s.enabled ? <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setDisabling({ domain: s.domain, draft: d })} data-care-disable>{ui("Disable")}</Button> : null}<Button disabled={busy || !d.confirm} onClick={() => void run(() => call("/api/care", "POST", { action: "configure", domain: s.domain, enabled: true, confirm: d.confirm, procedureReference: d.procedureReference, leadUserId: d.leadUserId, retentionMonths: d.retentionMonths }), "Workspace enabled.")} data-care-enable>{s.enabled ? ui("Save and keep enabled") : ui("Enable workspace")}</Button></div>
    </div>;
  })}</section>;
}

// ─── Desk ────────────────────────────────────────────────────────────────

function MessagesToMe({ family = false }: { family?: boolean }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const { data: rows, failure, isLoading, refetch } = useFetch<{ id: string; purpose: string; content: string; releasedAt: string }[]>(family ? "/api/family/care-messages" : "/api/care?view=messages", {collection:true});
  if (isLoading) return <SkeletonList rows={2} label={ui("Loading…")} />;
  if (failure) return <ErrorState error={failure} onRetry={refetch} />;
  if (!rows?.length) return null;
  return <section className="sk-panel space-y-2 p-4 sm:p-5" data-care-messages>
    <h2 className="text-base font-bold text-ink-strong">{ui("Messages from the school")}</h2>
    <ul className="space-y-2">{rows.map(r => <li key={r.id} className={cn(deskRow, "text-sm")} data-tone="info" data-care-message={r.id}><p className="text-xs text-ink-muted"><bdi>{dateTime(r.releasedAt)}</bdi> · <span dir="auto">{r.purpose}</span></p><p dir="auto" className="whitespace-pre-wrap">{r.content}</p></li>)}</ul>
  </section>;
}

/** Family card: messages a safeguarding lead approved for this guardian. Renders nothing when there are none. */
export function FamilyCareMessages() { return <MessagesToMe family />; }

export function CareDesk() {
  const ui = useUiText();
  const hidden = useHidden();
  const { data: me, failure, isLoading, refetch } = useFetch<Me>("/api/care?view=me");
  const [tab, setTabState] = useState("report"), [grant, setGrant] = useState<Me["grants"][number] | null>(null);
  useEffect(() => { const wanted = careTabFromUrl(); if (wanted) setTabState(wanted); }, []);
  const setTab = (next: string) => { setTabState(next); setGrant(null); writeCareTab(next); };
  // Labels are EN UI keys (ViewTabs translates them). Emergency access is offered to workspace members only, plus
  // anyone already holding a live grant so they can return to it (role-ux §6.3).
  const tabs = useMemo(() => !me ? [] : [
    { id: "report", label: "Record a concern" },
    { id: "summary", label: "Care summaries" },
    ...(me.CLINIC ? [{ id: "clinic", label: "Clinic" }] : []),
    ...(me.SAFEGUARDING ? [{ id: "safeguarding", label: "Safeguarding" }] : []),
    ...(me.CLINIC?.role === "LEAD" || me.SAFEGUARDING?.role === "LEAD" ? [{ id: "oversight", label: "Access review" }] : []),
    ...(me.CLINIC || me.SAFEGUARDING || me.grants.length ? [{ id: "emergency", label: "Emergency access" }] : []),
    ...(me.canConfigure ? [{ id: "settings", label: "Settings" }] : []),
  ], [me]);
  const current = tabs.some(t => t.id === tab) ? tab : "report";
  if (isLoading) return <SkeletonList rows={3} label={ui("Verifying confidential access before loading records.")} />;
  if (failure) return <div data-care-request-state><ErrorState error={failure} onRetry={refetch} /></div>;
  if (!me) return null;
  if (!me.canReport) return <div data-care-denied><AccessNotice reason="You do not have access to this confidential workspace." /></div>;
  return <div className={cn("min-w-0 space-y-4 transition", hidden && "blur-md")} data-care-desk>
    <PageHeader
      icon={HeartPulse}
      title="Care & safeguarding"
      description="Clinic and safeguarding are separate workspaces with their own members. Nothing here appears in search, timelines or AI."
      tabs={<ViewTabs ariaLabel="Confidential care" value={current} onChange={setTab} items={tabs} />}
    />
    <MessagesToMe />
    {current === "report" ? <ConcernIntake /> : null}
    {current === "summary" ? <CareSummaryLookup /> : null}
    {current === "clinic" ? (me.CLINIC?.enabled ? <ClinicWorkspace /> : <p className="sk-panel p-4 text-sm" data-care-disabled>{ui("This confidential workspace has not been enabled for your campus.")}</p>) : null}
    {current === "safeguarding" ? (me.SAFEGUARDING?.enabled ? <SafeguardingWorkspace /> : <p className="sk-panel p-4 text-sm" data-care-disabled>{ui("This confidential workspace has not been enabled for your campus.")}</p>) : null}
    {current === "oversight" ? <div className="space-y-4">{me.CLINIC?.role === "LEAD" ? <Oversight domain="CLINIC" /> : null}{me.SAFEGUARDING?.role === "LEAD" ? <Oversight domain="SAFEGUARDING" /> : null}</div> : null}
    {current === "emergency" ? (grant ? <EmergencyRecord grant={grant} onClose={() => { setGrant(null); void refetch(); }} /> : <EmergencyPanel me={me} reload={() => void refetch()} onOpen={setGrant} />) : null}
    {current === "settings" ? <CareSettings /> : null}
  </div>;
}
