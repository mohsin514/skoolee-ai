"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, LogIn, LogOut, PencilLine, ShieldAlert } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PanelTitle } from "@/components/shared-admin";
import { Modal } from "@/components/ui/modal";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";

import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";

// SKO-466: on-site visitors first, overdue visits flagged, one-action check-out, duplicate check-in
// warnings that keep the draft, refused visitors recorded without admission, corrections with a reason.

type Visit = { id: string; name: string; phone: string | null; reference: string | null; purpose: string | null; toMeet: string | null; inTime: string; outTime: string | null; status: "ON_SITE" | "LEFT" | "REFUSED"; refusedReason: string | null; overdue: boolean; version: number };
type Duplicate = { id: string; toMeet: string | null; reference: string | null; inTime: string };
const STATUS_LABEL = { ON_SITE: "On site", LEFT: "Left", REFUSED: "Refused entry" } as const;
const EMPTY = { name: "", purpose: "", toMeet: "", reference: "", phone: "", refusedReason: "" };

/**
 * `hideHeader` hands the title and actions to the console's PageHeader (primary "Check in visitor", secondaries
 * "Record refused visitor" and "Export"); `command` "check-in" / "refuse" / "export" runs them from there.
 */
export function VisitorRegister({ canManage = true, hideHeader = false, command }: { canManage?: boolean; hideHeader?: boolean; command?: PanelCommand | null }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [rows, setRows] = useState<Visit[]>([]), [counts, setCounts] = useState({ onSite: 0, overdue: 0, overdueHours: 4 });
  const [status, setStatus] = useState("all"), [q, setQ] = useState(""), [date, setDate] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY), [mode, setMode] = useState<"closed" | "check-in" | "refuse">("closed");
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState(""), [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const draft = useFormDraft({ record: "reception:visitor-intake", schema: 1, values: form, baseline: EMPTY, fields: ["name", "purpose", "toMeet", "reference", "phone", "refusedReason"] as const, apply: values => setForm({ name: String(values.name ?? ""), purpose: String(values.purpose ?? ""), toMeet: String(values.toMeet ?? ""), reference: String(values.reference ?? ""), phone: String(values.phone ?? ""), refusedReason: String(values.refusedReason ?? "") }) });
  const [leaving, setLeaving] = useState<Visit | null>(null), [correcting, setCorrecting] = useState<Visit | null>(null), [busy, setBusy] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const params = useCallback(() => {
    const search = new URLSearchParams();
    if (status !== "all") search.set("status", status);
    if (q.trim()) search.set("q", q.trim());
    if (date) search.set("date", date);
    return search;
  }, [status, q, date]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`/api/front-desk/visitors?${params()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to the visitor register for this campus.") : json.error || ui("The visitor register could not be loaded."));
      const order = { ON_SITE: 0, REFUSED: 1, LEFT: 2 } as const;
      setRows([...json.data].sort((a: Visit, b: Visit) => order[a.status] - order[b.status] || b.inTime.localeCompare(a.inTime)));
      setCounts({ onSite: json.onSite, overdue: json.overdue, overdueHours: json.overdueHours });
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("The visitor register could not be loaded.")); } finally { setLoading(false); }
  }, [params, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);

  const set = (field: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value }));
  const submit = async () => {
    setFormError(""); setDuplicates([]);
    const refused = mode === "refuse";
    if (form.name.trim().length < 2 || form.purpose.trim().length < 2 || (!refused && form.toMeet.trim().length < 2) || (refused && form.refusedReason.trim().length < 2)) {
      setFormError(refused ? ui("Enter the visitor's name, purpose and why entry was refused.") : ui("Enter the visitor's name, purpose and the person they are here to see."));
      return;
    }
    const payload = { action: refused ? "refuse" : "check-in", name: form.name.trim(), purpose: form.purpose.trim(), toMeet: form.toMeet.trim(), reference: form.reference.trim(), phone: form.phone.trim(), refusedReason: refused ? form.refusedReason.trim() : undefined };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    try {
      const response = await fetch("/api/front-desk/visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: attempt.current.key }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) { const message: string = typeof json.error === "string" ? json.error : "The visit was not saved. Your details are kept; try again."; setFormError(ui(message)); setDuplicates(json.duplicates ?? []); return; }
      toast.success(json.replayed ? ui("This check-in was already saved; nothing was added twice.") : refused ? ui("Refused visitor recorded. They were not admitted.") : ui("{0} checked in to see {1}.", [json.data.name, json.data.toMeet]));
      draft.markSaved(); attempt.current = null; setForm(EMPTY); setMode("closed"); void load();
    } catch {
      setFormError(ui("The connection failed before the server answered. Your details are kept; retrying will not check the visitor in twice."));
    } finally { setSaving(false); }
  };

  const checkOut = async () => {
    if (!leaving) return;
    setBusy(true);
    try {
      const response = await fetch("/api/front-desk/visitors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: leaving.id, action: "check-out" }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Check-out was not saved.");
      toast.success(ui("{0} checked out at {1}.", [leaving.name, dateTime(json.data.outTime)])); setLeaving(null); void load();
    } catch (failure) { toast.error(ui(failure instanceof Error ? failure.message : "Check-out was not saved.")); } finally { setBusy(false); }
  };

  const exportParams = params(); exportParams.set("format", "csv");
  usePanelCommand(command, {
    "check-in": () => { if (canManage) { setMode("check-in"); setFormError(""); setDuplicates([]); } },
    refuse: () => { if (canManage) { setMode("refuse"); setFormError(""); setDuplicates([]); } },
    export: () => window.location.assign(`/api/front-desk/visitors?${exportParams}`),
  });
  return <div className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-5"} data-visitor-register>
    {hideHeader ? null : <div className="flex flex-wrap items-center justify-between gap-3">
      <PanelTitle icon={Eye} title={ui("Visitor register")} />
      <div className="flex flex-wrap gap-2">
        <a className={buttonVariants({ variant: "outline" })} href={`/api/front-desk/visitors?${exportParams}`}><Download className="size-4" aria-hidden="true" />{ui("Export (CSV)")}</a>
        {canManage ? <Button onClick={() => { setMode("check-in"); setFormError(""); setDuplicates([]); }}><LogIn className="size-4" aria-hidden="true" />{ui("Check in visitor")}</Button> : null}
        {canManage ? <Button variant="outline" onClick={() => { setMode("refuse"); setFormError(""); setDuplicates([]); }}><ShieldAlert className="size-4" aria-hidden="true" />{ui("Record refused visitor")}</Button> : null}
      </div>
    </div>}
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold tabular-nums text-ink-strong" aria-live="polite" data-visitor-counts>
      <span data-on-site={counts.onSite}>{ui("On site now: {0}", [counts.onSite])}</span>
      {counts.overdue ? <span className="text-status-warning-text" data-overdue={counts.overdue}>{ui("Still on site after {0} hours: {1}", [counts.overdueHours, counts.overdue])}</span> : null}
    </p>
    <Alert tone="info" compact live="off">{ui("A visitor entry does not allow anyone to collect a child. Use the pickup register for that.")}</Alert>

    {mode !== "closed" ? <section className="space-y-3 rounded-2xl border border-border p-4" data-visitor-form={mode} aria-label={mode === "refuse" ? ui("Record refused visitor") : ui("Check in visitor")}>
      {formError ? <Alert tone="danger" compact data-visitor-error>
        <p>{formError}</p>
        {duplicates.length ? <ul className="mt-1 list-disc ps-4 font-normal">{duplicates.map(item => <li key={item.id}>{ui("On site since {0}, seeing {1}", [dateTime(item.inTime), item.toMeet ?? "—"])}{item.reference ? ` · ${item.reference}` : ""}</li>)}</ul> : null}
      </Alert> : null}
      <DraftRecovery recordLabel={ui("Visitor entry")} draft={draft} saving={saving} excluded={ui("Only visitor intake fields are stored in this signed-in browser draft.")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="visitor-name" label={ui("Visitor name")}><Input value={form.name} maxLength={120} onChange={set("name")} autoComplete="off" /></FormField>
        <FormField name="visitor-purpose" label={ui("Purpose of visit")}><Input value={form.purpose} maxLength={200} onChange={set("purpose")} /></FormField>
        <FormField name="visitor-host" label={mode === "refuse" ? ui("Asked to see (optional)") : ui("Person to meet")}><Input value={form.toMeet} maxLength={120} onChange={set("toMeet")} /></FormField>
        <FormField name="visitor-reference" label={ui("Reference (optional)")} hint={ui("Organisation or the last digits of an ID, to tell people with the same name apart. Never a full ID number.")}><Input value={form.reference} maxLength={60} onChange={set("reference")} /></FormField>
        <FormField name="visitor-phone" label={ui("Phone (optional)")} hint={ui("Removed automatically after 180 days.")}><Input value={form.phone} inputMode="tel" maxLength={30} onChange={set("phone")} /></FormField>
        {mode === "refuse" ? <FormField name="visitor-refused" label={ui("Why was entry refused?")}><Input value={form.refusedReason} maxLength={500} onChange={set("refusedReason")} /></FormField> : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setMode("closed")} disabled={saving}>{ui("Cancel")}</Button>
        <Button onClick={() => void submit()} loading={saving}>{mode === "refuse" ? ui("Record refusal") : ui("Check in")}</Button>
      </div>
    </section> : null}

    <div className="grid gap-3 sm:grid-cols-3" data-visitor-filters>
      <FormField name="visitor-filter-status" label={ui("Status")}><Select value={status} onChange={event => setStatus(event.target.value)}><option value="all">{ui("All visits")}</option><option value="ON_SITE">{ui("On site")}</option><option value="LEFT">{ui("Left")}</option><option value="REFUSED">{ui("Refused entry")}</option></Select></FormField>
      <FormField name="visitor-filter-q" label={ui("Search name, host or reference")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
      <FormField name="visitor-filter-date" label={ui("Arrival date")}><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></FormField>
    </div>

    {loading && !rows.length ? <SkeletonList rows={4} label={ui("Loading visitors…")} />
      : loadError ? <ErrorState title={ui("The visitor register could not be loaded.")} description={loadError} onRetry={() => void load()} retryLabel={ui("Retry")} />
      : !rows.length ? (status !== "all" || q || date ? <EmptyState size="sm" icon={Eye} title={ui("No visits match these filters.")} /> : <EmptyState size="sm" icon={Eye} title={ui("No visitors recorded yet. Check in the first visitor when they arrive.")} action={canManage ? <Button size="sm" onClick={() => { setMode("check-in"); setFormError(""); setDuplicates([]); }}><LogIn className="size-4" aria-hidden="true" />{ui("Check in visitor")}</Button> : undefined} />)
      : <ul className="space-y-2" aria-label={ui("Visits")}>
        {rows.map(visit => <li key={visit.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-sm ${visit.overdue ? "border-status-warning-border bg-status-warning-surface" : "border-border"}`} data-visit={visit.id} data-visit-status={visit.status} data-visit-overdue={visit.overdue}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-strong"><bdi>{visit.name}</bdi>{visit.reference ? <span className="font-normal text-ink-muted"> · <bdi>{visit.reference}</bdi></span> : null}</p>
            <p className="text-xs text-ink-muted">{visit.toMeet ? <>{ui("Seeing {0}", [visit.toMeet])} · </> : null}<bdi>{visit.purpose ?? ""}</bdi>{visit.phone ? <> · <bdi>{visit.phone}</bdi></> : null}</p>
            <p className="text-xs text-ink-muted">{ui("Arrived {0}", [dateTime(visit.inTime)])}{visit.outTime ? ` · ${ui("Left {0}", [dateTime(visit.outTime)])}` : ""}{visit.refusedReason ? ` · ${visit.refusedReason}` : ""}</p>
          </div>
          <Badge size="sm" dot variant={visit.status === "ON_SITE" ? (visit.overdue ? "warning" : "success") : visit.status === "REFUSED" ? "danger" : "neutral"}>{visit.overdue ? ui("Overdue") : ui(STATUS_LABEL[visit.status])}</Badge>
          {canManage && visit.status === "ON_SITE" ? <Button size="sm" onClick={() => setLeaving(visit)} aria-label={ui("Check out {0}", [visit.name])}><LogOut className="size-3.5" aria-hidden="true" />{ui("Check out")}</Button> : null}
          {canManage ? <Button size="sm" variant="ghost" onClick={() => setCorrecting(visit)} aria-label={ui("Correct visit of {0}", [visit.name])}><PencilLine className="size-3.5" aria-hidden="true" />{ui("Correct")}</Button> : null}
        </li>)}
      </ul>}

    {leaving ? <ConfirmAction open title={ui("Check out {0}?", [leaving.name])} description={ui("{0}, here since {1} to see {2}, is recorded as leaving now.", [leaving.name, dateTime(leaving.inTime), leaving.toMeet ?? "—"])} confirmLabel={ui("Check out")} tone="primary" busy={busy} onConfirm={() => checkOut()} onCancel={() => setLeaving(null)} /> : null}
    {correcting ? <CorrectVisit visit={correcting} onClose={() => setCorrecting(null)} onDone={() => { setCorrecting(null); void load(); }} /> : null}
  </div>;
}

const localInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function CorrectVisit({ visit, onClose, onDone }: { visit: Visit; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const [fields, setFields] = useState({ name: visit.name, purpose: visit.purpose ?? "", toMeet: visit.toMeet ?? "", reference: visit.reference ?? "", inTime: localInput(visit.inTime), outTime: localInput(visit.outTime) });
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async () => {
    const changes: Record<string, string> = {};
    if (fields.name !== visit.name) changes.name = fields.name;
    if (fields.purpose !== (visit.purpose ?? "")) changes.purpose = fields.purpose;
    if (fields.toMeet !== (visit.toMeet ?? "")) changes.toMeet = fields.toMeet;
    if (fields.reference !== (visit.reference ?? "")) changes.reference = fields.reference;
    if (fields.inTime !== localInput(visit.inTime)) changes.inTime = new Date(fields.inTime).toISOString();
    if (visit.outTime && fields.outTime !== localInput(visit.outTime)) changes.outTime = new Date(fields.outTime).toISOString();
    if (!Object.keys(changes).length) { setError(ui("Nothing to correct.")); return; }
    if (reason.trim().length < 5) { setError(ui("Explain the correction (at least 5 characters).")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/front-desk/visitors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: visit.id, action: "correct", changes, reason: reason.trim(), version: visit.version }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The correction was not saved.");
      toast.success(ui("Visit corrected. The original values are kept in the audit history.")); onDone();
    } catch (failure) { setError(ui(failure instanceof Error ? failure.message : "The correction was not saved.")); } finally { setBusy(false); }
  };
  const update = (field: keyof typeof fields) => (event: { target: { value: string } }) => setFields(current => ({ ...current, [field]: event.target.value }));
  return <Modal title={ui("Correct visit of {0}", [visit.name])} eyebrow={ui("Visitor register")} subtitle={ui("The original values stay in the audit history.")} onClose={onClose} dirty={Boolean(reason)}>
    <div className="space-y-3" data-visitor-correct>
      {error ? <Alert tone="danger" compact>{error}</Alert> : null}
      <FormField name="correct-name" label={ui("Visitor name")}><Input value={fields.name} onChange={update("name")} /></FormField>
      <FormField name="correct-purpose" label={ui("Purpose of visit")}><Input value={fields.purpose} onChange={update("purpose")} /></FormField>
      <FormField name="correct-host" label={ui("Person to meet")}><Input value={fields.toMeet} onChange={update("toMeet")} /></FormField>
      <FormField name="correct-reference" label={ui("Reference (optional)")}><Input value={fields.reference} onChange={update("reference")} /></FormField>
      <FormField name="correct-in" label={ui("Arrived")}><Input type="datetime-local" value={fields.inTime} onChange={update("inTime")} /></FormField>
      {visit.outTime ? <FormField name="correct-out" label={ui("Left")}><Input type="datetime-local" value={fields.outTime} onChange={update("outTime")} /></FormField> : null}
      <FormField name="correct-reason" label={ui("Reason for the correction")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void save()} loading={busy}>{ui("Save correction")}</Button></div>
    </div>
  </Modal>;
}
