"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, ScanLine } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-438: authorized pickup. Families name who collects, how the school checks identity, and a window;
// the code shown is single-use and holds no child details. At the gate, a valid code is only the start:
// staff confirm identity before release, and anything unclear goes to the pickup lead — never green by default.

type Ui = ReturnType<typeof useUiText>;
const METHODS = ["PHOTO_ID", "SCHOOL_PICKUP_CARD", "KNOWN_TO_STAFF"] as const;
const methodLabel = (ui: Ui, m: string) => ({ PHOTO_ID: ui("Photo ID"), SCHOOL_PICKUP_CARD: ui("School pickup card"), KNOWN_TO_STAFF: ui("Known to staff") } as Record<string, string>)[m] ?? m;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "Permission cannot be verified. Keep the student supervised and contact the pickup lead.");
  return json.data;
}
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

type Item = { id: string; recipientName: string; recipientRelation: string; idMethod: string; validFrom: string; validUntil: string; status: string; releasedAt: string | null };

/**
 * Family side: issue, show again, or withdraw a pickup authorization for one child. `addRequest` (each change opens
 * the "Authorize a pickup" form) and `hideAdd` let the page's PageHeader carry the add action as its one primary
 * (role-ux §4.4b parent · Pickup & transport: "Add collector"); without them the panel keeps its own button.
 */
export function FamilyPickups({ studentId, addRequest, hideAdd = false }: { studentId: string; addRequest?: number; hideAdd?: boolean }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<{ timezone: string; items: Item[] } | null>(null), [denied, setDenied] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ recipientName: "", recipientRelation: "", idMethod: "PHOTO_ID", idLast4: "", date: todayLocal(), from: "14:00", until: "16:00" }), [code, setCode] = useState<{ code: string; qr: string } | null>(null), [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Item | null>(null);
  // Only a change after mount opens the form, so a remount (child switch) never reopens it.
  const lastAddRequest = useRef(addRequest);
  useEffect(() => {
    if (addRequest === undefined || addRequest === lastAddRequest.current) return;
    lastAddRequest.current = addRequest;
    setOpen(true);
  }, [addRequest]);
  const load = useCallback(async () => { try { setData(await call(`/api/pickup?studentId=${encodeURIComponent(studentId)}`)); setDenied(false); } catch { setDenied(true); } }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (denied) return null;
  if (!data) return null;
  const status = (s: string) => ({ ACTIVE: ui("Ready to use"), USED: ui("Used"), REVOKED: ui("Withdrawn"), EXPIRED: ui("Expired") } as Record<string, string>)[s] ?? s;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-family-pickup>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-bold">{ui("Pickup authorizations")}</h3><p className="text-xs text-ink-muted">{ui("Name who will collect your child and when. The school checks their identity before release. Times are in the school's timezone: {0}.", [data.timezone])}</p></div>{hideAdd ? null : <Button size="sm" onClick={() => setOpen(true)} data-pickup-new>{ui("Authorize a pickup")}</Button>}</header>
    {data.items.length ? <ul className="space-y-2">{data.items.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" data-pickup-item={i.id} data-pickup-status={i.status}>
      <span><bdi>{i.recipientName}</bdi> · <span dir="auto">{i.recipientRelation}</span> · {methodLabel(ui, i.idMethod)} · <bdi>{dateTime(i.validFrom)}</bdi>–<bdi>{dateTime(i.validUntil)}</bdi> · {status(i.status)}{i.releasedAt ? <> · {ui("Collected {0}", [dateTime(i.releasedAt)])}</> : null}</span>
      {/* One inline action per row (Show code); withdrawing is destructive, so it sits in the row's overflow menu
          behind a confirmation (role-ux §4.5.2–3, §4.4b parent · Pickup). */}
      {i.status === "ACTIVE" ? <span className="flex items-center gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => setCode(await call("/api/pickup", "POST", { action: "code", id: i.id })), "A new code is ready. The previous code no longer works.")} data-pickup-show>{ui("Show code")}</Button><Menu label="More actions" align="end" items={[{ id: "withdraw", label: "Withdraw", tone: "danger", disabled: busy, onSelect: () => setWithdrawing(i) }]} trigger={<IconButton variant="ghost" label={ui("More actions")} data-pickup-revoke><MoreHorizontal aria-hidden="true" /></IconButton>} /></span> : null}
    </li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No pickup authorizations yet.")}</p>}
    <ConfirmAction
      open={Boolean(withdrawing)}
      busy={busy}
      tone="danger"
      title={ui("Withdraw this pickup authorization?")}
      description={withdrawing ? ui("{0} can no longer collect your child with this code. You can authorize a pickup again at any time.", [withdrawing.recipientName]) : ""}
      confirmLabel={ui("Withdraw")}
      cancelLabel={ui("Keep editing")}
      onConfirm={async () => { const item = withdrawing; if (item && await run(() => call("/api/pickup", "POST", { action: "revoke", id: item.id }), "Withdrawn. This code can no longer be used.")) setWithdrawing(null); }}
      onCancel={() => setWithdrawing(null)}
    />
    {open ? <Modal title={ui("Authorize a pickup")} onClose={() => setOpen(false)}>
      <div className="space-y-3" data-pickup-form>
        <FormField name="pu-name" label={ui("Who will collect?")}><Input value={form.recipientName} onChange={e => setForm({ ...form, recipientName: e.target.value })} maxLength={120} /></FormField>
        <FormField name="pu-rel" label={ui("Relationship to the child")}><Input value={form.recipientRelation} onChange={e => setForm({ ...form, recipientRelation: e.target.value })} maxLength={60} /></FormField>
        <FormField name="pu-method" label={ui("How will the school check their identity?")}><Select value={form.idMethod} onChange={e => setForm({ ...form, idMethod: e.target.value })}>{METHODS.map(m => <option key={m} value={m}>{methodLabel(ui, m)}</option>)}</Select></FormField>
        {form.idMethod === "PHOTO_ID" ? <FormField name="pu-last4" label={ui("Last four characters of their ID (optional)")} hint={ui("Never the full number.")}><Input value={form.idLast4} onChange={e => setForm({ ...form, idLast4: e.target.value })} maxLength={4} dir="ltr" /></FormField> : null}
        <div className="grid gap-2 sm:grid-cols-3"><FormField name="pu-date" label={ui("Day")}><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></FormField><FormField name="pu-from" label={ui("From")}><Input type="time" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} dir="ltr" /></FormField><FormField name="pu-until" label={ui("Until")}><Input type="time" value={form.until} onChange={e => setForm({ ...form, until: e.target.value })} dir="ltr" /></FormField></div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>{ui("Back")}</Button><Button disabled={busy || form.recipientName.trim().length < 3 || !form.recipientRelation.trim()} onClick={() => void run(async () => { const r = await call("/api/pickup", "POST", { action: "issue", studentId, ...form, idLast4: form.idLast4 || undefined }); setCode(r); setOpen(false); }, "Pickup authorized. Share the code only with the person collecting.")} data-pickup-issue>{ui("Create pickup code")}</Button></div>
      </div>
    </Modal> : null}
    {code ? <Modal title={ui("Pickup code")} onClose={() => setCode(null)}>
      <div className="space-y-2 text-center" data-pickup-code>
        <img src={code.qr} alt={ui("Pickup code")} width={220} height={220} className="mx-auto" />
        <p className="break-all font-mono text-xs" dir="ltr" data-pickup-code-text>{code.code}</p>
        <p className="text-xs text-ink-muted">{ui("Works once, at the school's campus, within the window. The person collecting must also show their identity.")}</p>
      </div>
    </Modal> : null}
  </section>;
}

type Check = { checkId: string; status: string; blockReason: string | null; exceptionStatus: string | null; student: { name: string; className: string; rollNo: string | null }; recipient: { name: string; relation: string; idMethod: string; idLast4: string | null; validUntil: string; authorizedBy: string } | null; restriction: { kind: string; instruction: string } | null; gate?: string; createdAt?: string };

const blockText = (ui: Ui, reason: string | null) => ({ WRONG_CAMPUS: ui("This code is for another campus."), REVOKED: ui("Permission revoked · release blocked"), USED: ui("This code was already used."), NOT_YET: ui("The pickup window has not started."), EXPIRED: ui("This code has expired."), RESTRICTION: ui("A restriction is on file · release blocked"), IDENTITY_METHOD: ui("Identity was not checked with the method the family chose."), NO_AUTHORIZATION: ui("No pickup authorization.") } as Record<string, string>)[reason ?? ""] ?? ui("Permission cannot be verified. Keep the student supervised and contact the pickup lead.");

export type PickupMode = "gate" | "lead" | "both";

/**
 * Pickup (role-ux §3.1, G29). `mode="gate"` is the front desk: scan or type a code, check, confirm identity,
 * release — or escalate. `mode="lead"` is the campus admin's exception queue and restrictions, without the scan
 * desk. `mode="both"` is a campus admin who also holds the front desk. `command` "check-code" focuses the code
 * field and "scan-photo" opens the camera; `hideHeader` hands the title to the console's PageHeader.
 */
export function PickupGate({ mode = "gate", hideHeader = false, command }: { mode?: PickupMode; hideHeader?: boolean; command?: PanelCommand | null }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [code, setCode] = useState(""), [gate, setGate] = useState(() => ui("Main gate")), [check, setCheck] = useState<Check | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [identity, setIdentity] = useState(false), [method, setMethod] = useState(""), [note, setNote] = useState(""), [queue, setQueue] = useState<{ lead: boolean; checks: Check[] } | null>(null);
  const video = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLDivElement>(null);
  const desk = mode !== "lead";
  // "Check code" (the PageHeader primary, or the sticky bar on a phone) checks the code already typed or scanned;
  // with nothing typed yet it puts the cursor in the field. It is the screen's one primary (P8-14), so the desk
  // shows no second "Check code" button when the console owns the header.
  const checkRef = useRef<() => void>(() => undefined);
  usePanelCommand(command, {
    "check-code": () => checkRef.current(),
    "scan-photo": () => video.current?.click(),
  });
  const loadQueue = useCallback(async () => { try { setQueue(await call("/api/pickup/gate")); } catch (e) { setError(ui(e instanceof Error ? e.message : "Pickup verification access is required.")); } }, [ui]);
  useEffect(() => { void loadQueue(); }, [loadQueue]);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { const data = await call("/api/pickup/gate", "POST", body); return data; }
    catch (e) { setError(ui(e instanceof Error ? e.message : "Permission cannot be verified. Keep the student supervised and contact the pickup lead.")); return null; }
    finally { setBusy(false); void loadQueue(); }
  };
  const doScan = async (value = code) => { const data = await post({ action: "scan", code: value, gate }); if (data) { setCheck(data); setIdentity(false); setMethod(data.recipient?.idMethod ?? ""); setNote(""); } };
  useEffect(() => { checkRef.current = () => {
    if (code.trim().length >= 20 && !busy) { void doScan(); return; }
    codeField.current?.querySelector("input")?.focus();
  }; });
  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: unknown) => { detect: (s: unknown) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector) { toast.error(ui("This device cannot read codes. Type the code instead.")); return; }
    try { const found = (await new Detector({ formats: ["qr_code"] }).detect(await createImageBitmap(file))).map(c => c.rawValue).find(v => v.startsWith("SKPU1:")); if (found) { setCode(found); await doScan(found); } else toast.error(ui("No pickup code found in the photo.")); } catch { toast.error(ui("No pickup code found in the photo.")); }
  };
  if (error && !queue) return <section data-pickup-gate><ErrorState description={error} onRetry={() => void loadQueue()} retryLabel={ui("Try again")} /></section>;
  const decided = check && ["RELEASED", "BLOCKED", "ESCALATED"].includes(check.status);
  const lead = mode !== "gate" && queue?.lead === true;
  const exceptions = queue?.checks.filter((c) => c.exceptionStatus === "REQUESTED") ?? [];
  // With `hideHeader` this is the page body inside the shell's one page card, so it draws no card of its own.
  return <section className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-4 sm:p-5"} data-pickup-gate data-pickup-mode={mode}>
    {hideHeader ? null : <header><h2 className="text-lg font-bold">{ui(desk ? "Pickup desk" : "Pickup exceptions")}</h2><p className="text-xs text-ink-muted">{ui(desk ? "Scan a pickup code or type it. A valid code still needs the recipient's identity checked before release." : "Exceptions the gate sent to you, restrictions on file and each pupil's pickup history.")}</p></header>}
    {desk ? <>
    <div ref={codeField} className={cn("grid gap-2", hideHeader ? "sm:grid-cols-[1fr_180px]" : "sm:grid-cols-[1fr_180px_auto]")} data-tour="reception.pickup.check">
      <FormField name="pg-code" label={ui("Pickup code")} hint={hideHeader ? ui("Scan or type the code, then press Enter or Check code.") : undefined}><Input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && code.trim().length >= 20) void doScan(); }} dir="ltr" autoComplete="off" /></FormField>
      <FormField name="pg-gate" label={ui("Gate")}><Input value={gate} onChange={e => setGate(e.target.value)} maxLength={40} /></FormField>
      {hideHeader ? null : <div className="flex items-end gap-2"><Button disabled={busy || code.trim().length < 20} onClick={() => void doScan()} data-pg-scan>{ui("Check code")}</Button></div>}
    </div>
    {!hideHeader ? <Button type="button" variant="outline" onClick={() => video.current?.click()}>{ui("Scan photo")}</Button> : null}
    <input ref={video} aria-label={ui("Scan photo")} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => void readPhoto(e.target.files?.[0])} />
    </> : null}
    {error ? <div data-pg-error><Alert tone="danger" compact>{error}</Alert></div> : null}

    {check ? <div className={cn("space-y-3 rounded-2xl border-2 p-4", check.status === "RELEASED" ? "border-status-success-border bg-status-success-surface" : check.status === "OPEN" ? "border-status-warning-border bg-status-warning-surface" : "border-status-error-border bg-status-error-surface")} data-pg-check={check.checkId} data-pg-status={check.status} aria-live="polite">
      <p className="text-sm font-bold" data-pg-state>{check.status === "RELEASED" ? ui("Release recorded to the verified recipient; this code is now used.") : check.status === "OPEN" ? ui("Code valid · identity still needs checking") : check.status === "ESCALATED" ? ui("Sent to the pickup lead. Keep the student supervised.") : blockText(ui, check.blockReason)}</p>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <div><p className="sk-eyebrow">{ui("Student")}</p><p className="font-bold"><bdi>{check.student.name}</bdi></p><p className="text-xs"><bdi>{check.student.className}</bdi></p></div>
        {check.recipient ? <div><p className="sk-eyebrow">{ui("Recipient")}</p><p className="font-bold"><bdi>{check.recipient.name}</bdi> · <span dir="auto">{check.recipient.relation}</span></p><p className="text-xs">{ui("Check identity by: {0}", [methodLabel(ui, check.recipient.idMethod)])}{check.recipient.idLast4 ? <> · {ui("ID ends with")} <bdi>{check.recipient.idLast4}</bdi></> : null}</p><p className="text-xs">{ui("Authorized by {0} · valid until {1}", [check.recipient.authorizedBy, dateTime(check.recipient.validUntil)])}</p></div> : null}
      </div>
      {check.restriction ? <div data-pg-restriction><Alert tone="danger" compact live="off">{ui("Restriction on file")}: <span dir="auto">{check.restriction.instruction}</span></Alert></div> : null}
      {check.exceptionStatus === "APPROVED" ? <p className="text-xs font-semibold text-status-success-text">{ui("The pickup lead approved an exception. Identity must still be checked.")}</p> : null}
      {!decided ? <div className="space-y-2">
        <FormField name="pg-method" label={ui("Identity checked with")}><Select value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m} value={m}>{methodLabel(ui, m)}</option>)}</Select></FormField>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={identity} onChange={e => setIdentity(e.target.checked)} data-pg-identity /> {ui("I have checked the recipient's identity with this method.")}</label>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={async () => { const d = await post({ action: "escalate", checkId: check.checkId, note }); if (d) setCheck({ ...check, status: "ESCALATED", exceptionStatus: "REQUESTED" }); }} data-pg-escalate>{ui("Contact pickup lead")}</Button><Button disabled={busy || !identity} onClick={async () => { const d = await post({ action: "release", checkId: check.checkId, identityConfirmed: identity, identityMethod: method }); if (d) setCheck(d); }} data-pg-release>{ui("Confirm release")}</Button></div>
      </div> : check.status !== "RELEASED" && check.status !== "ESCALATED" ? <div className="space-y-2"><FormField name="pg-note" label={ui("Note for the pickup lead")}><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></FormField><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setCheck(null); setCode(""); }}>{ui("Rescan current code")}</Button><Button disabled={busy} onClick={async () => { const d = await post({ action: "escalate", checkId: check.checkId, note }); if (d) setCheck({ ...check, status: "ESCALATED", exceptionStatus: "REQUESTED" }); }} data-pg-escalate>{ui("Contact pickup lead")}</Button></div></div> : null}
    </div> : desk ? <EmptyState size="sm" icon={ScanLine} title={ui("Scan a pickup code or look up an authorized pickup request.")} /> : null}

    {!desk && lead && !exceptions.length ? <EmptyState size="sm" icon={ScanLine} title={ui("No pickup exceptions are waiting for you.")} description={ui("When the gate cannot verify a pickup, it appears here for your decision.")} /> : null}
    {(desk ? queue?.checks : exceptions)?.length ? <div className="space-y-1" data-pg-queue><p className="sk-eyebrow">{ui(desk ? "Today's checks" : "Waiting for your decision")}</p>{(desk ? queue!.checks : exceptions).map(c => <div key={c.checkId} className="sk-row-interactive flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge px-3 py-2 text-xs" data-pg-row={c.checkId} data-pg-row-status={c.status}>
      <span><bdi>{c.createdAt ? dateTime(c.createdAt) : ""}</bdi> · <bdi>{c.student.name}</bdi> · <span dir="auto">{c.gate}</span> </span><Badge size="sm" dot variant={c.status === "RELEASED" ? "success" : c.status === "OPEN" || c.status === "ESCALATED" ? "warning" : "danger"}>{c.status === "RELEASED" ? ui("Released") : c.status === "ESCALATED" ? ui("With the pickup lead") : c.status === "OPEN" ? ui("Identity not yet checked") : blockText(ui, c.blockReason)}</Badge>
      {lead && c.exceptionStatus === "REQUESTED" ? <LeadDecision checkId={c.checkId} onDone={() => void loadQueue()} /> : null}
    </div>)}</div> : null}
    {lead ? <Restrictions /> : null}
  </section>;
}

function LeadDecision({ checkId, onDone }: { checkId: string; onDone: () => void }) {
  const ui = useUiText();
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const decide = async (decision: "approve" | "deny") => { setBusy(true); try { await call("/api/pickup/gate", "POST", { action: "decide", checkId, decision, note }); toast.success(ui("Decision recorded.")); onDone(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  return <span className="flex flex-wrap items-center gap-2" data-pg-decide={checkId}><Input className="w-48" aria-label={ui("Reason for the decision")} value={note} onChange={e => setNote(e.target.value)} /><Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => void decide("deny")} data-pg-deny>{ui("Keep blocked")}</Button><Button size="sm" disabled={busy || !note.trim()} onClick={() => void decide("approve")} data-pg-approve>{ui("Approve exception")}</Button></span>;
}

function Restrictions() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [q, setQ] = useState(""), [found, setFound] = useState<{ id: string; fullName: string; rollNo: string | null }[]>([]), [student, setStudent] = useState<string>(""), [hist, setHist] = useState<{ restrictions: { id: string; kind: string; instruction: string; liftedAt: string | null }[]; events: { id: string; kind: string; actor: string | null; authorizedBy: string | null; detail: Record<string, unknown>; createdAt: string }[] } | null>(null);
  const [form, setForm] = useState({ kind: "LEAD_APPROVAL", instruction: "", reason: "" });
  const [lifting, setLifting] = useState<{ id: string; instruction: string } | null>(null), [liftBusy, setLiftBusy] = useState(false);
  useEffect(() => { if (q.trim().length < 2) { setFound([]); return; } const t = setTimeout(() => { void call(`/api/pickup/restrictions?q=${encodeURIComponent(q)}`).then(setFound).catch(() => setFound([])); }, 300); return () => clearTimeout(t); }, [q]);
  const open = useCallback(async (id: string) => { setStudent(id); setHist(await call(`/api/pickup/restrictions?studentId=${encodeURIComponent(id)}`)); }, []);
  const kindLabel = (k: string) => ({ CUSTODY_ORDER: ui("Custody order"), DO_NOT_RELEASE: ui("Do not release"), LEAD_APPROVAL: ui("Pickup lead approval needed") } as Record<string, string>)[k] ?? k;
  return <div className="space-y-2 rounded-xl border p-3" data-pg-restrictions>
    <p className="sk-eyebrow">{ui("Restrictions and pickup history")}</p>
    <FormField name="pg-find" label={ui("Find a student")}><Input value={q} onChange={e => setQ(e.target.value)} /></FormField>
    {found.length ? <ul className="text-sm">{found.map(s => <li key={s.id}><Button variant="link" size="sm" className="h-auto min-h-0 p-0" onClick={() => void open(s.id)}><bdi>{s.fullName}</bdi>{s.rollNo ? ` · ${s.rollNo}` : ""}</Button></li>)}</ul> : null}
    {student && hist ? <div className="space-y-2">
      {hist.restrictions.map(r => <p key={r.id} className="text-sm" data-pg-restriction-row={r.id}>{kindLabel(r.kind)} · <span dir="auto">{r.instruction}</span>{r.liftedAt ? <> · {ui("Lifted")}</> : <Menu label="More actions" align="end" items={[{ id: "lift", label: "Lift restriction", tone: "danger", onSelect: () => setLifting({ id: r.id, instruction: r.instruction }) }]} trigger={<IconButton variant="ghost" label={ui("More actions")} className="ms-1"><MoreHorizontal aria-hidden="true" /></IconButton>} />}</p>)}
      <ConfirmAction
        open={Boolean(lifting)}
        busy={liftBusy}
        tone="danger"
        title={ui("Lift this restriction?")}
        description={lifting ? ui("Gate staff will no longer see \"{0}\" and a valid pickup code can release this pupil again. The restriction stays in the history.", [lifting.instruction]) : ""}
        confirmLabel={ui("Lift restriction")}
        cancelLabel={ui("Keep editing")}
        onConfirm={() => { const r = lifting; if (!r) return; setLiftBusy(true); return call("/api/pickup/restrictions", "POST", { action: "lift", id: r.id }).then(() => { toast.success(ui("Restriction lifted.")); setLifting(null); return open(student); }).catch(e => toast.error(ui(e instanceof Error ? e.message : "The change was not saved."))).finally(() => setLiftBusy(false)); }}
        onCancel={() => setLifting(null)}
      />
      <div className="grid gap-2 sm:grid-cols-3"><FormField name="pg-kind" label={ui("Restriction")}><Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{["LEAD_APPROVAL", "DO_NOT_RELEASE", "CUSTODY_ORDER"].map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}</Select></FormField><FormField name="pg-instr" label={ui("What gate staff should do")}><Input value={form.instruction} onChange={e => setForm({ ...form, instruction: e.target.value })} /></FormField><FormField name="pg-reason" label={ui("Reason (leaders only)")}><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></FormField></div>
      <div className="flex justify-end"><Button size="sm" disabled={!form.instruction.trim()} onClick={() => void call("/api/pickup/restrictions", "POST", { action: "add", studentId: student, ...form }).then(() => { toast.success(ui("Restriction recorded.")); setForm({ kind: "LEAD_APPROVAL", instruction: "", reason: "" }); return open(student); }).catch(e => toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")))} data-pg-add-restriction>{ui("Add restriction")}</Button></div>
      <ul className="space-y-0.5 text-xs" data-pg-history>{hist.events.map(e => <li key={e.id}><bdi>{dateTime(e.createdAt)}</bdi> · {e.kind}{e.actor ? <> · <bdi>{e.actor}</bdi></> : null}{e.authorizedBy ? <> · {ui("authorized by {0}", [e.authorizedBy])}</> : null}{typeof e.detail.recipientName === "string" ? <> · <bdi>{e.detail.recipientName}</bdi></> : null}</li>)}</ul>
    </div> : null}
  </div>;
}
