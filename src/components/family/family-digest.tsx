"use client";
import { useCallback, useEffect, useState } from "react";
import { useFetch } from "@/hooks";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { DeskPill, DeskRowIcon, deskRow } from "@/components/ui/desk";
import { Eye, Newspaper, PenLine, Sprout, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

// SKO-423. Teacher side: a class's weekly update, one child at a time. Each statement comes from released
// evidence and keeps its source; wording can be edited, nothing can be invented; at most one home activity
// with a purpose, a time and an alternative; children with nothing released are left out unless the teacher
// adds something. Approval covers the exact version; any edit reopens review. Family side: the update for
// one child, behind sign-in, with its sources and the reviewing teacher.

type Ui = ReturnType<typeof useUiText>;
type Statement = { id: string; kind: string; text: string; sourceType: string; sourceLabel: string; sourceVersion: string | null; edited?: boolean };
type NextStep = { objective: string; minutes: number; materials: string; alternative: string } | null;
type Content = { statements: Statement[]; nextStep: NextStep; staffContact: string; noEvidence: boolean };
type Entry = { id: string; studentId: string; studentName: string; content: Content; skipped: boolean; status: string; reason: string | null; deliveries: { guardianUserId: string; seenAt: string | null }[] };
type Digest = { id: string; weekStart: string; status: string; version: number; approvedVersion: number | null; scheduledFor: string | null; sentAt: string | null; entries: Entry[] };

/** Statements the teacher has not reworded are shown in the reader's language from their source. */
export function statementText(ui: Ui, s: Statement) {
  if (s.edited) return s.text;
  if (s.kind === "FEEDBACK") return ui("Feedback was returned on “{0}”.", [s.sourceLabel]);
  if (s.kind === "REPORT") return ui("The report card for {0} was published.", [s.sourceLabel]);
  if (s.kind === "ATTENDANCE") { const [a, b] = String(s.sourceVersion ?? "0/0").split("/"); return ui("Attended {0} of {1} recorded school days.", [a, b]); }
  return s.text;
}
const statusLabel = (ui: Ui, status: string) => ({ DRAFT: ui("Draft — awaiting review"), APPROVED: ui("Approved"), SCHEDULED: ui("Scheduled"), SENT: ui("Sent"), CANCELLED: ui("Cancelled") } as Record<string, string>)[status] ?? status;
const monday = () => { const d = new Date(), iso = d.getDay() || 7; d.setDate(d.getDate() - iso + 1); return d.toISOString().slice(0, 10); };

async function call(url: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}

export function FamilyDigestReview({ classes }: { classes: { id: string; label: string }[] }) {
  const ui = useUiText();
  const { date, dateTime } = useLocaleFormat();
  const [classId, setClassId] = useState(classes[0]?.id ?? ""), [week, setWeek] = useState(monday());
  const [digest, setDigest] = useState<Digest | null>(null), [busy, setBusy] = useState(false), [editing, setEditing] = useState<Entry | null>(null), [preview, setPreview] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<{ texts: Record<string, string>; removed: string[]; step: { objective: string; minutes: string; materials: string; alternative: string } | null; skipped: boolean }>({ texts: {}, removed: [], step: null, skipped: false });
  const [scheduleAt, setScheduleAt] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const refresh = useCallback(async (id: string) => setDigest(await call(`/api/digests/${id}`, "GET")), []);
  const prepare = async () => { setBusy(true); try { const d = await call("/api/digests", "POST", { classId, week }); await refresh(d.id); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  useEffect(() => { setDigest(null); }, [classId, week]);
  const act = async (body: Record<string, unknown>, done: string) => {
    if (!digest) return;
    setBusy(true);
    try { const result = await call(`/api/digests/${digest.id}`, "PATCH", { ...body, knownVersion: digest.version }); toast.success(body.action === "send" ? ui("Sent to {0} guardians.", [String(result.delivered)]) : ui(done)); await refresh(digest.id); return true; }
    catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); if (digest) await refresh(digest.id); return false; } finally { setBusy(false); }
  };
  const openEdit = (entry: Entry) => { setEditing(entry); setDraft({ texts: Object.fromEntries(entry.content.statements.map(s => [s.id, s.edited ? s.text : statementText(ui, s)])), removed: [], step: entry.content.nextStep ? { ...entry.content.nextStep, minutes: String(entry.content.nextStep.minutes) } : null, skipped: entry.skipped }); };
  const saveEdit = async () => {
    if (!editing) return;
    const statements = Object.fromEntries(editing.content.statements.filter(s => draft.texts[s.id] !== (s.edited ? s.text : statementText(ui, s))).map(s => [s.id, draft.texts[s.id]]));
    await act({ action: "edit", entryId: editing.id, statements, removeStatementIds: draft.removed, nextStep: draft.step ? { ...draft.step, minutes: Number(draft.step.minutes) } : null, skipped: draft.skipped }, "Saved. Approve the new version before sending.");
    setEditing(null);
  };
  const approved = digest && digest.approvedVersion === digest.version && ["APPROVED", "SCHEDULED"].includes(digest.status);
  return <section className="sk-panel space-y-4 p-5" data-digest-review data-digest-status={digest?.status ?? ""}>
    <header><h2 className="flex items-center gap-2 text-lg font-bold text-ink-strong"><Newspaper aria-hidden="true" className="size-5 text-primary" />{ui("Weekly family updates")}</h2><p className="text-xs text-ink-muted">{ui("Only results and feedback already released to families are used. Nothing is sent until you approve this exact version.")}</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <FormField name="digest-class" label={ui("Class")}><Select value={classId} onChange={e => setClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
      <FormField name="digest-week" label={ui("Week starting")}><Input type="date" value={week} onChange={e => setWeek(e.target.value)} /></FormField>
      <Button disabled={busy || !classId} onClick={() => void prepare()} data-digest-prepare>{ui("Open the week's update")}</Button>
    </div>
    {digest ? <>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-strong" data-digest-state><DeskPill tone={digest.status === "SENT" ? "success" : digest.status === "DRAFT" ? "warning" : digest.status === "CANCELLED" ? "neutral" : "info"}>{statusLabel(ui, digest.status)}</DeskPill> {ui("Version {0}", [String(digest.version)])}{digest.scheduledFor && digest.status === "SCHEDULED" ? <> · <bdi>{dateTime(digest.scheduledFor)}</bdi></> : null}{digest.sentAt ? <> · <bdi>{dateTime(digest.sentAt)}</bdi></> : null}</p>
      <ul className="space-y-2">{digest.entries.map(entry => <li key={entry.id} data-tone={entry.status === "BLOCKED" ? "danger" : entry.skipped ? "muted" : undefined} className={cn(deskRow, "space-y-1.5")} data-digest-entry={entry.studentId} data-digest-skipped={String(entry.skipped)} data-digest-entry-status={entry.status}>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong"><DeskRowIcon icon={UserRound} /><bdi className="min-w-0 truncate">{entry.studentName}</bdi>{entry.skipped ? <DeskPill tone="neutral">{entry.content.noEvidence ? ui("Left out — nothing released this week") : ui("Left out")}</DeskPill> : null}{entry.status === "BLOCKED" ? <DeskPill tone="danger">{ui("Not sent — a source changed after approval")}</DeskPill> : null}</p>
          <div className="flex flex-wrap gap-1">{digest.status !== "SENT" ? <Button size="sm" variant="outline" onClick={() => openEdit(entry)} data-digest-edit>{ui("Edit")}</Button> : null}<Button size="sm" variant="secondary" onClick={() => setPreview(entry)} data-digest-preview>{ui("Family view")}</Button></div></div>
        {!entry.skipped ? <ul className="ms-4 list-disc text-xs text-ink-muted">{entry.content.statements.map(s => <li key={s.id}>{statementText(ui, s)}</li>)}{entry.content.nextStep ? <li>{ui("Home activity: {0}", [entry.content.nextStep.objective])}</li> : null}</ul> : null}
      </li>)}</ul>
      <div className="flex flex-wrap items-end justify-end gap-2">
        {digest.status === "DRAFT" ? <Button disabled={busy} onClick={() => void act({ action: "approve" }, "Approved for sending.")} data-digest-approve>{ui("Approve version {0}", [String(digest.version)])}</Button> : null}
        {approved ? <>
          <FormField name="digest-at" label={ui("Send at")}><Input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} /></FormField>
          <Button variant="outline" disabled={busy || !scheduleAt} onClick={() => void act({ action: "schedule", at: new Date(scheduleAt).toISOString() }, "Scheduled.")} data-digest-schedule>{ui("Schedule")}</Button>
          <Button disabled={busy} onClick={() => setConfirmSend(true)} data-digest-send>{ui("Send now")}</Button>
        </> : null}
      </div>
    </> : null}
    {/* F16: sending reaches every family in the class at once and cannot be recalled. */}
    <ConfirmAction
      open={confirmSend && Boolean(digest)}
      tone="primary"
      title={ui("Send the weekly update?")}
      description={ui("Every family in this class receives version {0} now. A sent update cannot be recalled; a later change needs a new version.", [String(digest?.version ?? "")])}
      confirmLabel={ui("Send update")}
      cancelLabel={ui("Keep editing")}
      busy={busy}
      onCancel={() => setConfirmSend(false)}
      onConfirm={async () => { if (await act({ action: "send" }, "Sent.")) setConfirmSend(false); }}
    />
    {editing ? <Modal size="lg" icon={PenLine} tone="violet" title={editing.studentName} eyebrow={ui("Weekly family update")} subtitle={ui("Each statement keeps its source. You can reword or remove it.")} onClose={() => setEditing(null)}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>{ui("Cancel")}</Button><Button disabled={busy} onClick={() => void saveEdit()} data-digest-save>{ui("Save")}</Button></div>}>
      <div className="space-y-3" data-digest-editor>
        {editing.content.statements.filter(s => !draft.removed.includes(s.id)).map(s => <div key={s.id} className="flex flex-wrap items-end gap-2 sm:flex-nowrap"><FormField name={`st-${s.id}`} label={ui("From: {0}", [s.sourceLabel === "attendance" ? ui("Attendance this week") : s.sourceLabel])} className="min-w-0 flex-1 basis-56"><Input value={draft.texts[s.id] ?? ""} onChange={e => setDraft({ ...draft, texts: { ...draft.texts, [s.id]: e.target.value } })} /></FormField><Button size="sm" variant="secondary" onClick={() => setDraft({ ...draft, removed: [...draft.removed, s.id] })}>{ui("Remove")}</Button></div>)}
        {!editing.content.statements.length ? <p className="text-sm text-ink-muted">{ui("Nothing was released for this child this week. You can add a home activity or leave the child out.")}</p> : null}
        {draft.step ? <div className="grid gap-2 rounded-xl border border-edge/30 p-3 sm:grid-cols-2" data-digest-step>
          <FormField name="step-objective" label={ui("What it practises")} className="sm:col-span-2"><Input value={draft.step.objective} onChange={e => setDraft({ ...draft, step: { ...draft.step!, objective: e.target.value } })} /></FormField>
          <FormField name="step-minutes" label={ui("About how many minutes")}><Input type="number" min={1} max={45} value={draft.step.minutes} onChange={e => setDraft({ ...draft, step: { ...draft.step!, minutes: e.target.value } })} /></FormField>
          <FormField name="step-materials" label={ui("Materials (optional)")}><Input value={draft.step.materials} onChange={e => setDraft({ ...draft, step: { ...draft.step!, materials: e.target.value } })} /></FormField>
          <FormField name="step-alternative" label={ui("If this is not possible at home")} className="sm:col-span-2"><Textarea value={draft.step.alternative} onChange={e => setDraft({ ...draft, step: { ...draft.step!, alternative: e.target.value } })} /></FormField>
          <div className="sm:col-span-2"><Button size="sm" variant="secondary" onClick={() => setDraft({ ...draft, step: null })}>{ui("Remove the home activity")}</Button></div>
        </div> : <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, step: { objective: "", minutes: "10", materials: "", alternative: "" } })} data-digest-add-step>{ui("Add one home activity")}</Button>}
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.skipped} onChange={e => setDraft({ ...draft, skipped: e.target.checked })} data-digest-skip /> {ui("Leave this child out this week")}</label>
      </div>
    </Modal> : null}
    {preview ? <Modal size="sm" icon={Eye} tone="sky" title={ui("Family view")} eyebrow={preview.studentName} onClose={() => setPreview(null)}><DigestCard ui={ui} weekStart={digest?.weekStart ?? ""} content={preview.content} reviewedBy={null} formatDate={date} /></Modal> : null}
  </section>;
}

function DigestCard({ ui, weekStart, content, reviewedBy, formatDate }: { ui: Ui; weekStart: string; content: Content; reviewedBy: string | null; formatDate: (v: string) => string }) {
  return <div className="space-y-3" data-digest-card>
    <p className="text-xs text-ink-muted">{ui("Week of {0}", [formatDate(weekStart.slice(0, 10))])}{reviewedBy ? <> · {ui("Reviewed by {0}", [`\u2068${reviewedBy}\u2069`])}</> : null}</p>
    {content.statements.length ? <section><h4 className="text-sm font-semibold text-ink-strong">{ui("This week")}</h4><ul className="ms-4 list-disc text-sm">{content.statements.map(s => <li key={s.id}>{statementText(ui, s)}</li>)}</ul></section> : null}
    {content.nextStep ? <section data-tone="success" className={cn(deskRow, "space-y-0.5")} data-digest-home-activity><h4 className="flex items-center gap-2 text-sm font-semibold text-ink-strong"><Sprout aria-hidden="true" className="size-4 text-status-success-text" />{ui("One thing to try at home")}</h4><p className="text-sm" dir="auto">{content.nextStep.objective}</p><p className="text-xs text-ink-muted">{ui("About {0} minutes", [String(content.nextStep.minutes)])}{content.nextStep.materials ? <> · <span dir="auto">{content.nextStep.materials}</span></> : null}</p><p className="mt-1 text-xs" dir="auto">{ui("If that is not possible: {0}", [content.nextStep.alternative])}</p><p className="mt-1 text-2xs text-ink-muted">{ui("This is optional practice; it does not change any mark.")}</p></section> : null}
    {content.staffContact ? <p className="text-xs text-ink-muted">{ui("Questions: {0}", [content.staffContact])}</p> : null}
  </div>;
}

type GuardianDigest = { id: string; weekStart: string; version: number; content: Content; reviewedBy: string | null };

/** The family's weekly update for one child; access is rechecked on every read. */
export function GuardianDigest({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const { data: rows, failure, isLoading, refetch } = useFetch<GuardianDigest[]>(`/api/family/digests?studentId=${encodeURIComponent(studentId)}`, { collection: true });
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [studentId]);
  if (isLoading) return <SkeletonList rows={2} label={ui("Loading…")} />;
  if (failure) return <ErrorState error={failure} onRetry={refetch} />;
  if (!rows || !rows.length) return null;
  const current = rows[Math.min(index, rows.length - 1)];
  return <section className="sk-panel space-y-3 p-5" data-guardian-digest={current.id}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Newspaper aria-hidden="true" className="size-4 text-primary" />{ui("Weekly update")}</h3>{rows.length > 1 ? <div className="flex gap-1"><Button size="sm" variant="outline" disabled={index >= rows.length - 1} onClick={() => setIndex(index + 1)}>{ui("Earlier")}</Button><Button size="sm" variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>{ui("Later")}</Button></div> : null}</div>
    <DigestCard ui={ui} weekStart={current.weekStart} content={current.content} reviewedBy={current.reviewedBy} formatDate={date} />
  </section>;
}

