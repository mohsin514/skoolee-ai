"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { MoreHorizontal } from "lucide-react";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";

// SKO-436: the lending desk. Scan a member card, then copies; scan a copy to return it. Focus goes
// back to the scan field after every scan. Fines are previewed and explained, never the first step.

type Loan = { id: string; title: string; barcode: string | null; dueAt: string; renewals: number };
type Member = { kind: "MEMBER"; member: { id: string; memberNo: string; name: string }; maxLoans: number; loans: Loan[]; reservations: { id: string; status: string }[]; openCharges: { id: string; kind: string; amount: number; currency: string }[] };
type Copy = { kind: "COPY"; copy: { id: string; barcode: string; status: string; condition: string; heldForReservation: boolean }; book: { id: string; title: string; author: string | null; isbn: string | null } | null; waitingReservations: number };
type Fine = { overdueDays: number; graceDays: number; closureDays: string[]; chargeableDays: number; perDay: number; uncapped: number; cap: number; amount: number; currency: string };
type Overview = { rules: { version: number; loanDays: number; maxLoans: number; maxRenewals: number; graceDays: number; finePerDay: number; fineCap: number; lostCharge: number; holdDays: number; currency: string; closures: string[] }; canWaive: boolean;
  books: { id: string; title: string; copiesTotal: number; copiesAvailable: number }[]; reservations: { id: string; bookId: string; status: string; readyUntil: string | null }[]; charges: { id: string; kind: string; amount: number; currency: string }[] };

const STATUS_LABEL: Record<string, string> = { AVAILABLE: "On the shelf", ON_LOAN: "On loan", RESERVED_HOLD: "Held for a reservation", DAMAGED: "Damaged", LOST: "Lost", WAITING: "Waiting", READY: "Ready to collect" };
const KIND_LABEL: Record<string, string> = { FINE: "Late fine", LOST: "Lost copy", DAMAGE: "Damage" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw Object.assign(new Error(json?.error || "Request failed"), { status: response?.status });
  return json.data;
}

/**
 * `hideHeader` hands the title to the console's PageHeader (primary "Scan" focuses the scan field through
 * `command` "scan"). Spotlight anchors: library.lending.scan · library.lending.return.
 */
export function LendingDesk({ hideHeader = false, command }: { hideHeader?: boolean; command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const [losing, setLosing] = useState<Loan | null>(null);
  const { number } = useLocaleFormat();
  const scanRef = useRef<HTMLInputElement>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [code, setCode] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [returnCode, setReturnCode] = useState("");
  const [condition, setCondition] = useState("GOOD");
  const [fine, setFine] = useState<Fine | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [copyForm, setCopyForm] = useState({ bookId: "", barcodes: "" });
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const overviewVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++overviewVersion.current;
    setOverviewError(null); setOverviewLoading(true);
    try {
      const next = await call("/api/library/desk");
      if (version === overviewVersion.current) setOverview(next);
    } catch (failure) {
      if (version === overviewVersion.current) setOverviewError(ui((failure as Error).message));
    } finally { if (version === overviewVersion.current) setOverviewLoading(false); }
  }, [ui]);
  useEffect(() => { void load(); return () => { overviewVersion.current++; }; }, [load]);
  const refocus = () => requestAnimationFrame(() => scanRef.current?.focus());
  const post = async (action: string, data: object) => { try { const r = await call("/api/library/desk", { method: "POST", body: JSON.stringify({ action, data }) }); setError(null); return r; } catch (e) { setError(ui((e as Error).message)); setMessage(null); return null; } };
  const refreshMember = async () => {
    if (!member) return;
    try { setMember(await call(`/api/library/desk?code=${encodeURIComponent(member.member.memberNo)}`)); }
    catch {
      // The mutation already committed. Keep its receipt and prevent stale loan actions.
      setMember(null);
      setError(ui("The action was saved, but the reader's loans could not be refreshed. Scan the card again."));
    }
  };
  const money = (amount: number, currency: string) => `${number(amount)} ${currency}`;
  // "Renew" (PageHeader secondary, §4.4b): with a reader's loans on screen it moves to the first loan's Renew;
  // otherwise it asks for the reader's card first. Renewing stays one deliberate press per loan.
  const renewRef = useRef<HTMLDivElement>(null);
  const startRenew = () => {
    const first = renewRef.current?.querySelector<HTMLElement>("[data-loan-renew]");
    if (member && member.loans.length && first) { first.focus(); first.scrollIntoView({ block: "nearest" }); return; }
    setError(null);
    setMessage(ui(member ? "This reader has no loans to renew." : "Scan the reader's card to see their loans, then renew from the list."));
    refocus();
  };
  usePanelCommand(command, { scan: () => scanRef.current?.focus(), renew: startRenew });
  const markLost = async (loan: Loan) => { if (await post("lost", { issueId: loan.id })) { setMessage(ui("Marked lost. A charge was recorded for review.")); await refreshMember(); void load(); } };

  const scan = async (value: string) => {
    if (!value.trim()) return;
    setCode(""); setError(null); setMessage(null); setOverride(null);
    try {
      const found = await call(`/api/library/desk?code=${encodeURIComponent(value.trim())}`);
      if (found.kind === "MEMBER") { setMember(found); setCopy(null); }
      else {
        setCopy(found);
        if (member && found.copy.status !== "ON_LOAN") {
          const issued = await post("issue", { memberId: member.member.id, barcode: found.copy.barcode });
          if (issued) { setMessage(ui("Copy {0} issued. Due {1}.", [found.copy.barcode, String(issued.dueAt).slice(0, 10)])); await refreshMember(); void load(); }
          else if (found.copy.status === "RESERVED_HOLD") setOverride(found.copy.barcode);
        }
      }
    } catch (e) { setError(ui((e as Error).message)); }
    refocus();
  };

  return (
    // With `hideHeader` this is the page body inside the shell's one page card, so it draws no card of its own.
    <section aria-label={hideHeader ? ui("Lending desk") : undefined} aria-labelledby={hideHeader ? undefined : "lending-desk"} className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-4"} data-lending-desk>
      {hideHeader ? null : <h2 id="lending-desk" className="text-lg font-bold text-ink-strong">{ui("Lending desk")}</h2>}
      <ConfirmAction
        open={Boolean(losing)}
        tone="danger"
        title={ui("Mark this copy lost?")}
        description={losing ? ui("\"{0}\" is taken off the shelf and a lost-copy charge is recorded for review. The charge can still be waived or sent to the fees office.", [losing.title]) : ""}
        confirmLabel={ui("Mark lost")}
        cancelLabel={ui("Keep editing")}
        onConfirm={() => { const loan = losing; setLosing(null); if (loan) void markLost(loan); }}
        onCancel={() => setLosing(null)}
      />
      {overviewLoading && !overview ? <p role="status" className="text-sm text-ink-muted">{ui("Loading library data…")}</p> : null}
      {overviewError ? <Alert tone="warning" compact actions={<Button size="sm" variant="outline" disabled={overviewLoading} onClick={() => void load()}>{ui("Try again")}</Button>}>{overviewError}</Alert> : null}
      <div aria-live="polite">
        {error ? <Alert tone="danger" compact>{error}</Alert> : null}
        {message ? <p role="status" className="text-sm font-medium text-status-success-text">{message}</p> : null}
      </div>

      <form className="flex flex-wrap items-end gap-2" data-tour="library.lending.scan" onSubmit={(e) => { e.preventDefault(); void scan(code); }}>
        <FormField name="desk-scan" label={ui("Scan a member card or a copy")} hint={ui(member ? "Scan each copy to issue it to this reader." : "Scan a member card first to issue books.")} className="min-w-0 flex-1 sm:min-w-[16rem]">
          <Input ref={scanRef} dir="ltr" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
        {/* A scanner submits with Enter; the button is the fallback and never competes with the one primary (§4.4). */}
        <Button type="submit" variant="outline">{ui("Look up")}</Button>
        {member ? <Button type="button" variant="outline" onClick={() => { setMember(null); setCopy(null); refocus(); }}>{ui("Finish with this reader")}</Button> : null}
      </form>

      {member ? (
        <div ref={renewRef} className="space-y-2 rounded-xl border border-border p-3 text-sm" data-lending-reader>
          <p className="font-semibold"><bdi>{member.member.name}</bdi> · <span dir="ltr">{member.member.memberNo}</span></p>
          <p>{ui("Loans: {0} of {1} allowed", [member.loans.length, member.maxLoans])}</p>
          <ul className="space-y-1">{member.loans.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2">
              <bdi>{l.title}</bdi>{l.barcode ? <span dir="ltr" className="text-ink-subtle">{l.barcode}</span> : null}<span>· {ui("due {0}", [String(l.dueAt).slice(0, 10)])}</span>
              <Button size="sm" variant="outline" data-loan-renew onClick={async () => { if (await post("renew", { issueId: l.id })) { setMessage(ui("Loan renewed.")); await refreshMember(); } }}>{ui("Renew")}</Button>
              <Menu label="More actions" trigger={<IconButton variant="ghost" label={ui("More actions")}><MoreHorizontal aria-hidden="true" /></IconButton>} items={[{ id: "lost", label: "Mark lost", tone: "danger", onSelect: () => setLosing(l) }]} />
            </li>
          ))}</ul>
          {member.openCharges.length ? <p className="text-ink-subtle">{ui("Open charges")}: {member.openCharges.map((c) => `${ui(KIND_LABEL[c.kind] ?? c.kind)} ${money(c.amount, c.currency)}`).join(" · ")}</p> : null}
        </div>
      ) : <p className="text-sm text-ink-subtle">{ui("Scan a member card or search for a borrower.")}</p>}

      {copy ? (
        <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold"><bdi>{copy.book?.title ?? "—"}</bdi> · <span dir="ltr">{copy.copy.barcode}</span></p>
          <p>{ui(STATUS_LABEL[copy.copy.status] ?? copy.copy.status)}{copy.book?.isbn ? <> · ISBN <span dir="ltr">{copy.book.isbn}</span></> : null} · {ui("{0} waiting", [copy.waitingReservations])}</p>
          {!member && copy.copy.status === "AVAILABLE" ? <p className="text-ink-subtle">{ui("Copy {0} is ready to issue — scan a member card first.", [copy.copy.barcode])}</p> : null}
          {override === copy.copy.barcode ? (
            <div className="flex flex-wrap items-end gap-2">
              <FormField name="desk-override" label={ui("Why release this held copy?")} className="min-w-0 flex-1 sm:min-w-[14rem]"><Input value={reasons.override ?? ""} onChange={(e) => setReasons((r) => ({ ...r, override: e.target.value }))} /></FormField>
              <Button size="sm" variant="outline" onClick={async () => { const issued = await post("issue", { memberId: member!.member.id, barcode: copy.copy.barcode, overrideReason: reasons.override }); if (issued) { setOverride(null); setMessage(ui("Copy {0} issued. Due {1}.", [copy.copy.barcode, String(issued.dueAt).slice(0, 10)])); await refreshMember(); void load(); } }}>{ui("Issue anyway")}</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3" data-tour="library.lending.return" onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("return", { barcode: returnCode.trim(), condition });
        if (r) { setMessage(r.alreadyReturned ? ui("Already returned · no duplicate change") : ui(r.heldForNextReservation ? "Return recorded. The copy is now held for the next reservation." : "Return recorded; availability updated.") + (r.fine?.amount ? ` ${ui("Fine recorded: {0}", [money(r.fine.amount, r.fine.currency)])}` : "")); setReturnCode(""); setFine(null); void load(); if (member) await refreshMember(); }
        refocus();
      }}>
        <h3 className="w-full font-semibold">{ui("Return a copy")}</h3>
        <FormField name="desk-return" label={ui("Copy barcode")} className="min-w-0 flex-1 sm:min-w-[12rem]"><Input dir="ltr" value={returnCode} onChange={(e) => { setReturnCode(e.target.value); setFine(null); }} /></FormField>
        <FormField name="desk-condition" label={ui("Condition")}><Select value={condition} onChange={(e) => setCondition(e.target.value)}><option value="GOOD">{ui("Good")}</option><option value="WORN">{ui("Worn")}</option><option value="DAMAGED">{ui("Damaged")}</option></Select></FormField>
        <Button type="button" variant="outline" disabled={!returnCode.trim()} onClick={async () => { try { const p = await call(`/api/library/desk?preview=${encodeURIComponent(returnCode.trim())}`); setFine(p.onLoan ? p.fine : null); if (!p.onLoan) setMessage(ui("Already returned · no duplicate change")); } catch (e) { setError(ui((e as Error).message)); } }}>{ui("Preview fine")}</Button>
        <Button type="submit" variant="secondary" disabled={!returnCode.trim()}>{ui("Confirm return")}</Button>
        {fine ? <p className="w-full text-sm text-ink-subtle">{ui("{0} days late · {1} closure days not charged · {2} grace days · {3} chargeable days × {4} = {5}{6}", [fine.overdueDays, fine.closureDays.length, fine.graceDays, fine.chargeableDays, money(fine.perDay, fine.currency), money(fine.amount, fine.currency), fine.cap && fine.uncapped > fine.cap ? ` (${ui("capped")})` : ""])}</p> : null}
      </form>

      {overview ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-semibold">{ui("Charges awaiting a decision")}</h3>
            {overview.charges.length === 0 ? <p className="text-sm text-ink-subtle">{ui("No open charges.")}</p> : overview.charges.map((c) => (
              <div key={c.id} className="space-y-1 rounded-xl border border-border p-2 text-sm">
                <p>{ui(KIND_LABEL[c.kind] ?? c.kind)} · {money(c.amount, c.currency)}</p>
                <div className="flex flex-wrap items-end gap-2">
                  <FormField name={`ch-${c.id}`} label={ui("Reason")} className="min-w-0 flex-1 sm:min-w-[12rem]"><Input value={reasons[c.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))} /></FormField>
                  {overview.canWaive ? <Button size="sm" variant="outline" onClick={async () => { if (await post("charge", { chargeId: c.id, decision: "WAIVE", reason: reasons[c.id] ?? "" })) { setMessage(ui("Charge waived; the reason and approver are recorded.")); void load(); } }}>{ui("Waive")}</Button> : <span className="text-xs text-ink-subtle">{ui("Your campus admin decides waivers; you can send the charge to the fees office.")}</span>}
                  <Button size="sm" variant="outline" onClick={async () => { if (await post("charge", { chargeId: c.id, decision: "HAND_TO_FEES", reason: reasons[c.id] ?? "" })) { setMessage(ui("Charge handed to the fees office.")); void load(); } }}>{ui("Send to fees office")}</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">{ui("Add barcoded copies")}</h3>
            <form className="space-y-2 rounded-xl border border-border p-2" onSubmit={async (e) => { e.preventDefault(); const r = await post("copies", { bookId: copyForm.bookId, barcodes: copyForm.barcodes.split(/[\s,]+/).filter(Boolean) }); if (r) { setMessage(ui("{0} copies registered.", [r.length])); setCopyForm({ bookId: copyForm.bookId, barcodes: "" }); void load(); } }}>
              <FormField name="cp-book" label={ui("Title")}><Select value={copyForm.bookId} onChange={(e) => setCopyForm((f) => ({ ...f, bookId: e.target.value }))}><option value="">{ui("Choose a title")}</option>{overview.books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.copiesAvailable}/{b.copiesTotal})</option>)}</Select></FormField>
              <FormField name="cp-codes" label={ui("Barcodes")} hint={ui("One per copy, separated by spaces or commas.")}><Input dir="ltr" value={copyForm.barcodes} onChange={(e) => setCopyForm((f) => ({ ...f, barcodes: e.target.value }))} /></FormField>
              <Button type="submit" size="sm" variant="secondary" disabled={!copyForm.bookId || !copyForm.barcodes.trim()}>{ui("Register copies")}</Button>
            </form>
            <p className="text-xs text-ink-subtle">{ui("Loans last {0} days · up to {1} books · {2} renewals.", [overview.rules.loanDays, overview.rules.maxLoans, overview.rules.maxRenewals])}{" "}{overview.rules.finePerDay > 0 ? ui("Overdue fine: {0} per open day after {1} grace days.", [money(overview.rules.finePerDay, overview.rules.currency), overview.rules.graceDays]) : ui("No overdue fines.")}{overview.rules.finePerDay > 0 && overview.rules.fineCap ? ` ${ui("Maximum fine: {0}.", [money(overview.rules.fineCap, overview.rules.currency)])}` : null}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
