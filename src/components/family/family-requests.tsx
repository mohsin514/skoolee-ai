"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useLocaleFormat, useUiText, useLocale } from "@/components/locale/LocaleProvider";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { CalendarOff } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";

// SKO-421 family side. Leave: a request for future days that the school decides; it never marks the
// register. Trips: the exact version is shown and named in the answer; giving and refusing permission are
// equally prominent; a changed notice asks again and the earlier receipt stays visible.

type Ui = ReturnType<typeof useUiText>;
type Leave = { id: string; fromDate: string; toDate: string; reason: string; status: string; reviewNote: string | null; version: number };
type TripVersion = { version: number; title: string; destination: string; departAt: string; returnAt: string; costAmount: number; costCurrency: string; contact: string; instructions: string; consentKind: string; signatoryRule: string; respondBy: string; changeNote: string | null };
type Trip = { tripId: string; studentId: string; version: TripVersion; status: string; canSign: boolean; deadlinePassed: boolean; departed: boolean; myAnswer: { choice: string; version: number; receiptCode: string; at: string } | null; earlierAnswer: { choice: string; version: number; receiptCode: string } | null; answeredByOther: boolean };

const leaveLabel = (ui: Ui, status: string) => ({ PENDING: ui("Waiting for the school"), CLARIFICATION: ui("The school asked for more detail"), APPROVED: ui("Approved"), DECLINED: ui("Declined"), CANCELLED: ui("Cancelled") } as Record<string, string>)[status] ?? status;
const choiceLabel = (ui: Ui, choice: string) => ({ GRANTED: ui("Permission given"), DECLINED: ui("Permission refused"), WITHDRAWN: ui("Permission withdrawn") } as Record<string, string>)[choice] ?? choice;
const childStatusLabel = (ui: Ui, status: string) => ({ GRANTED: ui("Permission recorded"), DECLINED: ui("Permission refused"), PENDING: ui("No answer yet"), PARTIAL: ui("Waiting for the other guardian") } as Record<string, string>)[status] ?? status;
const key = () => `trip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * `requestSignal` (incremented by the page's "Request leave" primary action) opens the form; with
 * `hideRequestButton` the panel does not repeat that action in its own header.
 */
export function GuardianLeave({ studentId, requestSignal, hideRequestButton = false }: { studentId: string; requestSignal?: number; hideRequestButton?: boolean }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [rows, setRows] = useState<Leave[] | null>(null), [open, setOpen] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "" }), [reply, setReply] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState<Leave | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // R4: a failed read is an inline error with retry — never shown as "no leave requested".
  const load = useCallback(async () => {
    setLoadFailed(false);
    const json = await fetch(`/api/family/leave?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
    if (json.success) setRows(json.data); else setLoadFailed(true);
  }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  // G6: open only for a press made while this panel is mounted. The page keeps its counter across a child switch
  // (which remounts this panel), so the value present at mount is treated as already handled.
  const handledSignal = useRef(requestSignal);
  useEffect(() => {
    if (!requestSignal || requestSignal === handledSignal.current) return;
    handledSignal.current = requestSignal;
    setOpen(true); setError("");
  }, [requestSignal]);
  const send = async (method: string, body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/family/leave", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The request was not sent.");
      return true;
    } catch (failure) { setError(ui(failure instanceof Error ? failure.message : "The request was not sent.")); return false; } finally { setBusy(false); }
  };
  if (!rows) return <section className="sk-panel space-y-3 p-5" data-guardian-leave aria-busy={!loadFailed}>
    <h3 className="text-base font-bold text-ink-strong">{ui("Leave requests")}</h3>
    {loadFailed ? <ErrorState title={ui("Leave requests could not be loaded.")} onRetry={load} retryLabel={ui("Try again")} /> : <SkeletonList rows={2} label={ui("Loading leave requests…")} />}
  </section>;
  return <section className="sk-panel space-y-3 p-5" data-guardian-leave>
    <div className="flex items-center justify-between gap-2"><h3 className="text-base font-bold text-ink-strong">{ui("Leave requests")}</h3>{!hideRequestButton ? <Button size="sm" variant="outline" onClick={() => { setOpen(true); setError(""); }} data-request-leave>{ui("Request leave")}</Button> : null}</div>
    <p className="text-xs text-ink-muted">{ui("The school reviews each request. Attendance is still marked by the school.")}</p>
    {error && !open ? <Alert tone="danger" compact>{error}</Alert> : null}
    {rows.length ? <ul className="divide-y divide-edge/20">{rows.map(row => <li key={row.id} className="space-y-1 py-2" data-leave={row.id} data-leave-status={row.status}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong"><span><bdi>{date(row.fromDate)}</bdi>{row.toDate !== row.fromDate ? <> – <bdi>{date(row.toDate)}</bdi></> : null}</span><Badge size="sm" dot variant={row.status === "APPROVED" ? "success" : row.status === "DECLINED" ? "danger" : row.status === "CANCELLED" ? "neutral" : row.status === "CLARIFICATION" ? "warning" : "info"}>{leaveLabel(ui, row.status)}</Badge></p>
      {row.reviewNote ? <p className="text-xs text-ink-muted">{ui("School note: {0}", [row.reviewNote])}</p> : null}
      {row.status === "CLARIFICATION" ? <div className="flex flex-wrap items-end gap-2"><FormField name={`leave-reply-${row.id}`} label={ui("Your reply")} className="min-w-0 flex-1 sm:min-w-56"><Input value={reply[row.id] ?? ""} onChange={e => setReply({ ...reply, [row.id]: e.target.value })} /></FormField><Button size="sm" disabled={busy || (reply[row.id] ?? "").trim().length < 3} onClick={async () => { if (await send("PATCH", { id: row.id, action: "reply", reason: reply[row.id] })) { toast.success(ui("Reply sent to the school")); void load(); } }} data-leave-reply>{ui("Send reply")}</Button></div> : null}
      {["PENDING", "CLARIFICATION"].includes(row.status) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setCancelling(row)} data-leave-cancel>{ui("Cancel request")}</Button> : null}
    </li>)}</ul> : <EmptyState size="sm" icon={CalendarOff} title={ui("No leave requested.")} description={ui("Ask the school in advance for days your child will miss.")} action={<Button size="sm" onClick={() => { setOpen(true); setError(""); }}>{ui("Request leave")}</Button>} />}
    <ConfirmAction
      open={Boolean(cancelling)}
      tone="danger"
      title={ui("Cancel this leave request?")}
      description={ui("The school stops reviewing it. You can ask again later as a new request.")}
      confirmLabel={ui("Cancel request")}
      cancelLabel={ui("Keep request")}
      busy={busy}
      onCancel={() => setCancelling(null)}
      onConfirm={async () => { const row = cancelling; setCancelling(null); if (row && await send("PATCH", { id: row.id, action: "cancel" })) { toast.success(ui("Leave request cancelled.")); void load(); } }}
    />
    {open ? <Modal size="sm" title={ui("Request leave")} eyebrow={ui("Attendance")} subtitle={ui("For days that have not happened yet. Explain past absences from the list above.")} onClose={() => setOpen(false)}>
      <div className="space-y-3" data-leave-form>
        {error ? <Alert tone="danger" compact data-leave-error>{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="leave-from" label={ui("First day")}><Input type="date" value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value, toDate: form.toDate || e.target.value })} /></FormField>
          <FormField name="leave-to" label={ui("Last day")}><Input type="date" value={form.toDate} min={form.fromDate} onChange={e => setForm({ ...form, toDate: e.target.value })} /></FormField>
        </div>
        <FormField name="leave-reason" label={ui("Reason")} hint={ui("Keep it short. Do not include medical details here.")}><Textarea value={form.reason} maxLength={1000} onChange={e => setForm({ ...form, reason: e.target.value })} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>{ui("Cancel")}</Button><Button disabled={busy || !form.fromDate || form.reason.trim().length < 3} onClick={async () => { if (await send("POST", { studentId, ...form })) { toast.success(ui("Request sent. The school will review it.")); setOpen(false); setForm({ fromDate: "", toDate: "", reason: "" }); void load(); } }} loading={busy} data-leave-send>{ui("Send request")}</Button></div>
      </div>
    </Modal> : null}
  </section>;
}

export function GuardianTrips({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const { language } = useLocale();
  const [rows, setRows] = useState<Trip[] | null>(null), [review, setReview] = useState<{ trip: Trip; choice: "GRANTED" | "DECLINED" | "WITHDRAWN"; key: string } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<string | null>(null);
  const load = useCallback(async () => { const json = await fetch(`/api/family/trips?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})); setRows(json.success ? json.data : []); }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  const money = (amount: number, currency: string) => new Intl.NumberFormat(language === "ar" ? "ar" : language === "ur" ? "ur" : "en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  const confirm = async () => {
    if (!review) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/family/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: review.trip.tripId, studentId, version: review.trip.version.version, choice: review.choice, idempotencyKey: review.key }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) { setError(ui(json.error || "Your answer was not recorded.")); if (response.status === 409) void load(); return; }
      setReceipt(json.data.receiptCode); setReview(null); void load();
    } finally { setBusy(false); }
  };
  if (!rows || !rows.length) return null;
  return <section className="sk-panel space-y-3 p-5" data-guardian-trips>
    <h3 className="text-base font-bold text-ink-strong">{ui("Trips and permissions")}</h3>
    {receipt ? <Alert tone="success" compact live="polite" data-trip-receipt={receipt}>{ui("Your answer is recorded. Receipt {0}.", [receipt])}</Alert> : null}
    {error && !review ? <Alert tone="danger" compact data-trip-error>{error}</Alert> : null}
    {rows.map(trip => { const v = trip.version; const answered = trip.myAnswer; return <article key={trip.tripId} className="space-y-2 rounded-2xl border border-edge/30 p-4" data-trip={trip.tripId} data-trip-version={v.version} data-trip-status={trip.status}>
      <header><p className="text-base font-bold text-ink-strong" dir="auto">{v.title}</p><p className="text-xs text-ink-muted">{ui("Version {0}", [String(v.version)])} · {childStatusLabel(ui, trip.status)}</p></header>
      {trip.earlierAnswer ? <Alert tone="warning" live="off" data-trip-changed>{ui("The details changed after your answer to version {0} ({1}, receipt {2}). Please read version {3} and answer again.", [String(trip.earlierAnswer.version), choiceLabel(ui, trip.earlierAnswer.choice), trip.earlierAnswer.receiptCode, String(v.version)])}{v.changeNote ? <> {ui("What changed: {0}", [v.changeNote])}</> : null}</Alert> : null}
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-ink-muted">{ui("Destination")}</dt><dd dir="auto">{v.destination}</dd></div>
        <div><dt className="text-xs text-ink-muted">{ui("Leaves and returns")}</dt><dd><bdi>{dateTime(v.departAt)}</bdi> → <bdi>{dateTime(v.returnAt)}</bdi></dd></div>
        <div><dt className="text-xs text-ink-muted">{ui("Cost")}</dt><dd><bdi>{v.costAmount ? money(v.costAmount, v.costCurrency) : ui("No cost")}</bdi></dd></div>
        <div><dt className="text-xs text-ink-muted">{ui("School contact")}</dt><dd dir="auto">{v.contact}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">{ui("Instructions")}</dt><dd className="whitespace-pre-line" dir="auto">{v.instructions || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">{ui("Who answers")}</dt><dd>{v.signatoryRule === "ALL_GUARDIANS" ? ui("Every guardian with permission to sign must agree.") : ui("One guardian with permission to sign answers; a refusal from any of them stands.")} · {ui("Answer by")} <bdi>{dateTime(v.respondBy)}</bdi></dd></div>
      </dl>
      {answered ? <p className="text-sm font-semibold text-ink-strong" data-trip-my-answer={answered.choice}>{ui("Your answer to version {0}: {1}. Receipt {2}.", [String(answered.version), choiceLabel(ui, answered.choice), answered.receiptCode])}</p> : null}
      {!trip.canSign ? <p className="text-xs text-ink-muted" data-trip-cannot-sign>{ui("You can read this notice, but another authorized guardian must answer.")}</p>
        : trip.deadlinePassed && !answered ? <p className="text-xs font-semibold text-ink" data-trip-expired>{ui("The time to answer has passed. Contact the school.")}</p>
        : <div className="flex flex-wrap gap-2">
            {!answered || answered.choice === "WITHDRAWN" ? <>
              <Button onClick={() => setReview({ trip, choice: "GRANTED", key: key() })} data-trip-choice="GRANTED">{ui("Give permission")}</Button>
              <Button variant="outline" onClick={() => setReview({ trip, choice: "DECLINED", key: key() })} data-trip-choice="DECLINED">{ui("Refuse permission")}</Button>
            </> : answered.choice === "GRANTED" && !trip.departed ? <Button variant="outline" onClick={() => setReview({ trip, choice: "WITHDRAWN", key: key() })} data-trip-choice="WITHDRAWN">{ui("Withdraw permission")}</Button> : null}
          </div>}
    </article>; })}
    {review ? <Modal size="sm" title={ui("Confirm your answer")} eyebrow={ui("Trip permission")} subtitle={review.trip.version.title} onClose={() => setReview(null)}>
      <div className="space-y-3" data-trip-review>
        {error ? <Alert tone="danger" compact data-trip-review-error>{error}</Alert> : null}
        <Alert tone={review.choice === "GRANTED" ? "success" : "danger"} compact live="off"><span className="font-semibold">{choiceLabel(ui, review.choice)}</span></Alert>
        <p className="text-sm">{ui("Your answer applies to version {0} of these terms. If the school changes them, you will be asked again.", [String(review.trip.version.version)])}</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReview(null)}>{ui("Back")}</Button><Button disabled={busy} loading={busy} onClick={() => void confirm()} data-trip-confirm>{ui("Confirm my answer")}</Button></div>
      </div>
    </Modal> : null}
  </section>;
}
