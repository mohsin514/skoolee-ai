"use client";
import { useFetch } from "@/hooks";
import { checkedJson, readRequest } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Bus, CalendarCheck } from "lucide-react";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";

// SKO-421 staff side. Leave requests are decided here and never mark the register. Trip notices are
// published as versions; a revision says whether it is a material change (fresh answers needed) and what
// changed. The roster shows each pupil's standing under the signatory rule and every answer on record.

type Ui = ReturnType<typeof useUiText>;
type LeaveRow = { id: string; studentName: string; className: string; fromDate: string; toDate: string; reason: string; status: string; version: number };
type TripRow = { id: string; status: string; currentVersion: number; title: string; departAt: string; respondBy: string };
type Roster = { trip: { id: string; status: string; currentVersion: number; baseline: number }; versions: Record<string, unknown>[]; rows: { studentId: string; name: string; status: string; signatories: number; history: { guardian: string | null; choice: string; version: number; createdAt: string }[] }[]; counts: Record<string, number> };

const standingTone = (status: string) => (({ GRANTED: "success", DECLINED: "danger", PENDING: "neutral", PARTIAL: "warning" } as const) as Record<string, "success" | "danger" | "neutral" | "warning">)[status] ?? "neutral";
const standing = (ui: Ui, status: string) => ({ GRANTED: ui("Permission recorded"), DECLINED: ui("Permission refused"), PENDING: ui("No answer yet"), PARTIAL: ui("Waiting for the other guardian") } as Record<string, string>)[status] ?? status;

async function send(url: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}

export function LearnerLeaveQueue() {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const { data: rows, failure, isLoading, refetch: load } = useFetch<LeaveRow[]>("/api/attendance/leave", {collection:true});
  const [deciding, setDeciding] = useState<{ row: LeaveRow; action: "approve" | "decline" | "clarify" } | null>(null), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const decisionDraft = useFormDraft({ record: `staff:leave-decision:${deciding?.row.id ?? "none"}`, schema: 1, values: { note }, baseline: { note: "" }, fields: ["note"] as const, enabled: Boolean(deciding), apply: (values) => setNote(String(values.note ?? "")) });
  if (isLoading) return <SkeletonList rows={3} label={ui("Loading…")} />;
  if (failure) return <ErrorState error={failure} onRetry={load} />;
  if (!rows) return null;
  return <div className="sk-panel space-y-3 p-5" data-leave-queue>
    <h3 className="text-base font-bold text-ink-strong">{ui("Learner leave requests ({0})", [String(rows.length)])}</h3>
    <p className="text-xs text-ink-muted">{ui("A decision does not mark the register; mark the days when they come.")}</p>
    {rows.length ? <ul className="divide-y divide-edge/20">{rows.map(row => <li key={row.id} className="space-y-1 py-2" data-leave-row={row.id}>
      <p className="text-sm"><bdi>{row.studentName}</bdi> · <bdi>{row.className}</bdi> · <bdi>{date(row.fromDate)}</bdi>{row.toDate !== row.fromDate ? <> – <bdi>{date(row.toDate)}</bdi></> : null}</p>
      <p className="whitespace-pre-line text-xs text-ink-muted" dir="auto">{row.reason}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setDeciding({ row, action: "approve" })} data-leave-approve>{ui("Approve")}</Button><Button size="sm" variant="outline" onClick={() => setDeciding({ row, action: "clarify" })} data-leave-clarify>{ui("Ask for more detail")}</Button><Button size="sm" variant="outline" onClick={() => setDeciding({ row, action: "decline" })} data-leave-decline>{ui("Decline")}</Button></div>
    </li>)}</ul> : <EmptyState size="sm" icon={CalendarCheck} title={ui("Nothing waiting.")} />}
    {deciding ? <Modal size="sm" title={deciding.action === "approve" ? ui("Approve leave") : deciding.action === "decline" ? ui("Decline leave") : ui("Ask for more detail")} eyebrow={ui("Attendance")} subtitle={deciding.row.studentName} onClose={() => setDeciding(null)}>
      <div className="space-y-3"><DraftRecovery recordLabel={ui("Leave decision message")} draft={decisionDraft} saving={busy} excluded={ui("Only the decision message is stored in this signed-in browser draft.")} /><FormField name="leave-note" label={deciding.action === "approve" ? ui("Note (optional)") : ui("Message to the family")}><Textarea value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeciding(null)}>{ui("Cancel")}</Button><Button disabled={busy || deciding.action !== "approve" && note.trim().length < 2} onClick={async () => { setBusy(true); try { await send("/api/attendance/leave", "POST", { id: deciding.row.id, action: deciding.action, note: note.trim() || undefined, knownVersion: deciding.row.version }); decisionDraft.markSaved(); toast.success(ui("Decision recorded")); setDeciding(null); setNote(""); void load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } }} loading={busy} data-leave-confirm>{ui("Confirm")}</Button></div></div>
    </Modal> : null}
  </div>;
}

const emptyTerms = { title: "", destination: "", departAt: "", returnAt: "", respondBy: "", costAmount: "0", costCurrency: "", contact: "", instructions: "", consentKind: "fieldTrips", signatoryRule: "ANY_GUARDIAN" };

export function TripsDesk() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const { data: trips, failure, isLoading, refetch: load } = useFetch<TripRow[]>("/api/trips", {collection:true});
  const classList = useFetch<{ id: string; name: string; section: string | null }[]>("/api/classes", {collection:true});
  const classes = classList.data ?? [];
  const [roster, setRoster] = useState<Roster | null>(null), [editing, setEditing] = useState<{ mode: "create" | "revise"; tripId?: string; knownVersion?: number } | null>(null);
  // A new notice starts in the school's own currency, never a hard-coded one (R7).
  const { currency: schoolCurrency } = useLocale();
  const blankTerms: typeof emptyTerms = { ...emptyTerms, costCurrency: schoolCurrency };
  const [form, setForm] = useState(blankTerms), [classId, setClassId] = useState(""), [material, setMaterial] = useState(true), [changeNote, setChangeNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const openRoster = async (id: string) => {
    try { const json = await checkedJson(await readRequest(`/api/trips?id=${encodeURIComponent(id)}`)); setRoster(json.data); }
    catch (failure) { setRoster(null); toast.error(failure); }
  };
  const set = (k: keyof typeof emptyTerms) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setError("");
    try {
      const terms = { ...form, departAt: new Date(form.departAt).toISOString(), returnAt: new Date(form.returnAt).toISOString(), respondBy: new Date(form.respondBy).toISOString(), costAmount: Number(form.costAmount) };
      if (editing?.mode === "create") await send("/api/trips", "POST", { ...terms, classIds: classId ? [classId] : [] });
      else await send("/api/trips", "PATCH", { id: editing!.tripId, action: "revise", ...terms, knownVersion: editing!.knownVersion, material, changeNote });
      toast.success(ui("Trip notice published")); setEditing(null); void load(); if (editing?.tripId) void openRoster(editing.tripId);
    } catch (e) { setError(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); }
  };
  if (isLoading || classList.isLoading) return <SkeletonList rows={3} label={ui("Loading…")} />;
  if (failure || classList.failure) return <ErrorState error={failure ?? classList.failure} onRetry={() => Promise.all([load(), classList.refetch()])} />;
  if (!trips) return null;
  return <div className="sk-panel space-y-3 p-5" data-trips-desk>
    <div className="flex items-center justify-between gap-2"><h3 className="text-base font-bold text-ink-strong">{ui("Trips and permission")}</h3><Button size="sm" variant="outline" onClick={() => { setForm(blankTerms); setEditing({ mode: "create" }); }} data-new-trip>{ui("New trip notice")}</Button></div>
    {trips.length ? <ul className="divide-y divide-edge/20">{trips.map(trip => <li key={trip.id} className="flex flex-wrap items-center gap-2 py-2" data-trip-row={trip.id}>
      <span className="min-w-0 flex-1 text-sm font-semibold text-ink-strong" dir="auto">{trip.title} <span className="text-xs font-normal text-ink-muted">· {ui("Version {0}", [String(trip.currentVersion)])} · <bdi>{dateTime(trip.departAt)}</bdi></span></span>
      <Button size="sm" variant="outline" onClick={() => void openRoster(trip.id)} data-trip-roster>{ui("Answers")}</Button>
    </li>)}</ul> : <EmptyState size="sm" icon={Bus} title={ui("No trips yet.")} description={ui("Publish a trip notice to ask families for permission.")} action={<Button size="sm" onClick={() => { setForm(blankTerms); setEditing({ mode: "create" }); }}>{ui("New trip notice")}</Button>} />}
    {roster ? <Modal size="lg" title={String((roster.versions.at(-1) as { title?: string })?.title ?? "")} eyebrow={ui("Trip permission")} subtitle={ui("Version {0} · answers count from version {1}", [String(roster.trip.currentVersion), String(roster.trip.baseline)])} onClose={() => setRoster(null)}>
      <div className="space-y-3" data-trip-roster-dialog>
        <div className="flex flex-wrap gap-2">{["GRANTED", "PARTIAL", "PENDING", "DECLINED"].map(k => <Badge key={k} variant={standingTone(k)} dot><span>{standing(ui, k)}: <span className="tabular-nums">{roster.counts[k] ?? 0}</span></span></Badge>)}</div>
        <ul className="divide-y divide-edge/20">{roster.rows.map(row => <li key={row.studentId} className="py-2 text-sm" data-roster-row={row.studentId} data-roster-status={row.status}><span className="font-semibold text-ink-strong"><bdi>{row.name}</bdi></span> <Badge size="sm" dot variant={standingTone(row.status)}>{standing(ui, row.status)}</Badge>{row.history.length ? <span className="block text-xs text-ink-muted">{row.history.map((h, i) => <span key={i}>{i ? " · " : ""}<bdi>{h.guardian ?? ""}</bdi> · {ui("Version {0}", [String(h.version)])} · {({ GRANTED: ui("Permission given"), DECLINED: ui("Permission refused"), WITHDRAWN: ui("Permission withdrawn") } as Record<string, string>)[h.choice] ?? h.choice}</span>)}</span> : null}</li>)}</ul>
        {roster.trip.status === "OPEN" ? <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { const v = roster.versions.at(-1) as Record<string, string | number>; const local = (iso: string | number) => new Date(String(iso)).toISOString().slice(0, 16); setForm({ title: String(v.title), destination: String(v.destination), departAt: local(v.departAt), returnAt: local(v.returnAt), respondBy: local(v.respondBy), costAmount: String(v.costAmount), costCurrency: String(v.costCurrency), contact: String(v.contact), instructions: String(v.instructions), consentKind: String(v.consentKind), signatoryRule: String(v.signatoryRule) }); setMaterial(true); setChangeNote(""); setEditing({ mode: "revise", tripId: roster.trip.id, knownVersion: roster.trip.currentVersion }); setRoster(null); }} data-revise-trip>{ui("Change the terms")}</Button></div> : null}
      </div>
    </Modal> : null}
    {editing ? <Modal size="lg" title={editing.mode === "create" ? ui("New trip notice") : ui("Change the trip terms")} eyebrow={ui("Trip permission")} onClose={() => setEditing(null)}>
      <div className="space-y-3" data-trip-form>
        {error ? <Alert tone="danger" compact>{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="trip-title" label={ui("Trip name")}><Input value={form.title} onChange={set("title")} /></FormField>
          <FormField name="trip-destination" label={ui("Destination")}><Input value={form.destination} onChange={set("destination")} /></FormField>
          <FormField name="trip-depart" label={ui("Leaves")}><Input type="datetime-local" value={form.departAt} onChange={set("departAt")} /></FormField>
          <FormField name="trip-return" label={ui("Returns")}><Input type="datetime-local" value={form.returnAt} onChange={set("returnAt")} /></FormField>
          <FormField name="trip-respond" label={ui("Answer by")}><Input type="datetime-local" value={form.respondBy} onChange={set("respondBy")} /></FormField>
          <FormField name="trip-cost" label={ui("Cost")}><Input type="number" min={0} value={form.costAmount} onChange={set("costAmount")} /></FormField>
          <FormField name="trip-contact" label={ui("School contact")}><Input value={form.contact} onChange={set("contact")} /></FormField>
          <FormField name="trip-kind" label={ui("Permission needed")}><Select value={form.consentKind} onChange={set("consentKind")}><option value="fieldTrips">{ui("Field trip")}</option><option value="offsiteTravel">{ui("Off-site travel")}</option></Select></FormField>
          <FormField name="trip-rule" label={ui("Who answers")}><Select value={form.signatoryRule} onChange={set("signatoryRule")}><option value="ANY_GUARDIAN">{ui("Any one authorized guardian")}</option><option value="ALL_GUARDIANS">{ui("Every authorized guardian")}</option></Select></FormField>
        </div>
        <FormField name="trip-instructions" label={ui("Instructions")}><Textarea value={form.instructions} maxLength={4000} onChange={set("instructions")} /></FormField>
        {editing.mode === "create" ? <FormField name="trip-class" label={ui("Invited class")}><Select value={classId} onChange={e => setClassId(e.target.value)}><option value="">{ui("Choose a class")}</option>{classes.map(c => <option key={c.id} value={c.id}>{[c.name, c.section].filter(Boolean).join(" ")}</option>)}</Select></FormField> : <>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={material} onChange={e => setMaterial(e.target.checked)} data-trip-material /> {ui("This is a material change — families must answer again")}</label>
          <FormField name="trip-change" label={ui("What changed")}><Textarea value={changeNote} maxLength={500} onChange={e => setChangeNote(e.target.value)} /></FormField>
        </>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>{ui("Cancel")}</Button><Button disabled={busy} onClick={() => void save()} loading={busy} data-publish-trip>{ui("Publish")}</Button></div>
      </div>
    </Modal> : null}
  </div>;
}
