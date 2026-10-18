"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

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

export function LendingDesk() {
  const ui = useUiText();
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
  const load = useCallback(async () => { try { setOverview(await call("/api/library/desk")); } catch (e) { setError(ui((e as Error).message)); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const refocus = () => requestAnimationFrame(() => scanRef.current?.focus());
  const post = async (action: string, data: object) => { try { const r = await call("/api/library/desk", { method: "POST", body: JSON.stringify({ action, data }) }); setError(null); return r; } catch (e) { setError(ui((e as Error).message)); setMessage(null); return null; } };
  const refreshMember = async () => { if (member) setMember(await call(`/api/library/desk?code=${encodeURIComponent(member.member.memberNo)}`)); };
  const money = (amount: number, currency: string) => `${number(amount)} ${currency}`;

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
    <section aria-labelledby="lending-desk" className="sk-panel space-y-4 p-4">
      <h2 id="lending-desk" className="text-lg font-bold text-ink-strong">{ui("Lending desk")}</h2>
      <div aria-live="polite">
        {error ? <Alert tone="danger" compact>{error}</Alert> : null}
        {message ? <p role="status" className="text-sm font-medium text-status-success-text">{message}</p> : null}
      </div>

      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void scan(code); }}>
        <FormField name="desk-scan" label={ui("Scan a member card or a copy")} hint={ui(member ? "Scan each copy to issue it to this reader." : "Scan a member card first to issue books.")} className="min-w-[16rem] flex-1">
          <Input ref={scanRef} dir="ltr" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
        <Button type="submit">{ui("Look up")}</Button>
        {member ? <Button type="button" variant="ghost" onClick={() => { setMember(null); setCopy(null); refocus(); }}>{ui("Finish with this reader")}</Button> : null}
      </form>

      {member ? (
        <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold"><bdi>{member.member.name}</bdi> · <span dir="ltr">{member.member.memberNo}</span></p>
          <p>{ui("Loans: {0} of {1} allowed", [member.loans.length, member.maxLoans])}</p>
          <ul className="space-y-1">{member.loans.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2">
              <bdi>{l.title}</bdi>{l.barcode ? <span dir="ltr" className="text-ink-subtle">{l.barcode}</span> : null}<span>· {ui("due {0}", [String(l.dueAt).slice(0, 10)])}</span>
              <Button size="sm" variant="ghost" onClick={async () => { if (await post("renew", { issueId: l.id })) { setMessage(ui("Loan renewed.")); await refreshMember(); } }}>{ui("Renew")}</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (await post("lost", { issueId: l.id })) { setMessage(ui("Marked lost. A charge was recorded for review.")); await refreshMember(); void load(); } }}>{ui("Mark lost")}</Button>
            </li>
          ))}</ul>
          {member.openCharges.length ? <p className="text-ink-subtle">{ui("Open charges")}: {member.openCharges.map((c) => `${ui(KIND_LABEL[c.kind] ?? c.kind)} ${money(c.amount, c.currency)}`).join(" · ")}</p> : null}
        </div>
      ) : <p className="text-sm text-ink-subtle">{ui("Scan a member card or search for a borrower.")}</p>}

      {copy ? (
        <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold"><bdi>{copy.book?.title ?? "—"}</bdi> · <span dir="ltr">{copy.copy.barcode}</span></p>
          <p>{ui(STATUS_LABEL[copy.copy.status] ?? copy.copy.status)}{copy.book?.isbn ? <> · ISBN <span dir="ltr">{copy.book.isbn}</span></> : null} · {ui("{0} waiting", [copy.waitingReservations])}</p>
          {member && copy.copy.status === "AVAILABLE" && !message ? null : null}
          {!member && copy.copy.status === "AVAILABLE" ? <p className="text-ink-subtle">{ui("Copy {0} is ready to issue — scan a member card first.", [copy.copy.barcode])}</p> : null}
          {override === copy.copy.barcode ? (
            <div className="flex flex-wrap items-end gap-2">
              <FormField name="desk-override" label={ui("Why release this held copy?")} className="min-w-[14rem] flex-1"><Input value={reasons.override ?? ""} onChange={(e) => setReasons((r) => ({ ...r, override: e.target.value }))} /></FormField>
              <Button size="sm" variant="outline" onClick={async () => { const issued = await post("issue", { memberId: member!.member.id, barcode: copy.copy.barcode, overrideReason: reasons.override }); if (issued) { setOverride(null); setMessage(ui("Copy {0} issued. Due {1}.", [copy.copy.barcode, String(issued.dueAt).slice(0, 10)])); await refreshMember(); void load(); } }}>{ui("Issue anyway")}</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3" onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("return", { barcode: returnCode.trim(), condition });
        if (r) { setMessage(r.alreadyReturned ? ui("Already returned · no duplicate change") : ui(r.heldForNextReservation ? "Return recorded. The copy is now held for the next reservation." : "Return recorded; availability updated.") + (r.fine?.amount ? ` ${ui("Fine recorded: {0}", [money(r.fine.amount, r.fine.currency)])}` : "")); setReturnCode(""); setFine(null); void load(); if (member) await refreshMember(); }
        refocus();
      }}>
        <h3 className="w-full font-semibold">{ui("Return a copy")}</h3>
        <FormField name="desk-return" label={ui("Copy barcode")} className="min-w-[12rem] flex-1"><Input dir="ltr" value={returnCode} onChange={(e) => { setReturnCode(e.target.value); setFine(null); }} /></FormField>
        <FormField name="desk-condition" label={ui("Condition")}><Select value={condition} onChange={(e) => setCondition(e.target.value)}><option value="GOOD">{ui("Good")}</option><option value="WORN">{ui("Worn")}</option><option value="DAMAGED">{ui("Damaged")}</option></Select></FormField>
        <Button type="button" variant="outline" disabled={!returnCode.trim()} onClick={async () => { try { const p = await call(`/api/library/desk?preview=${encodeURIComponent(returnCode.trim())}`); setFine(p.onLoan ? p.fine : null); if (!p.onLoan) setMessage(ui("Already returned · no duplicate change")); } catch (e) { setError(ui((e as Error).message)); } }}>{ui("Preview fine")}</Button>
        <Button type="submit" disabled={!returnCode.trim()}>{ui("Confirm return")}</Button>
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
                  <FormField name={`ch-${c.id}`} label={ui("Reason")} className="min-w-[12rem] flex-1"><Input value={reasons[c.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))} /></FormField>
                  {overview.canWaive ? <Button size="sm" variant="outline" onClick={async () => { if (await post("charge", { chargeId: c.id, decision: "WAIVE", reason: reasons[c.id] ?? "" })) { setMessage(ui("Charge waived; the reason and approver are recorded.")); void load(); } }}>{ui("Waive")}</Button> : <span className="text-xs text-ink-subtle">{ui("You can view this charge but cannot waive it.")}</span>}
                  <Button size="sm" onClick={async () => { if (await post("charge", { chargeId: c.id, decision: "HAND_TO_FEES", reason: reasons[c.id] ?? "" })) { setMessage(ui("Charge handed to the fees office.")); void load(); } }}>{ui("Send to fees office")}</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">{ui("Add barcoded copies")}</h3>
            <form className="space-y-2 rounded-xl border border-border p-2" onSubmit={async (e) => { e.preventDefault(); const r = await post("copies", { bookId: copyForm.bookId, barcodes: copyForm.barcodes.split(/[\s,]+/).filter(Boolean) }); if (r) { setMessage(ui("{0} copies registered.", [r.length])); setCopyForm({ bookId: copyForm.bookId, barcodes: "" }); void load(); } }}>
              <FormField name="cp-book" label={ui("Title")}><Select value={copyForm.bookId} onChange={(e) => setCopyForm((f) => ({ ...f, bookId: e.target.value }))}><option value="">{ui("Choose a title")}</option>{overview.books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.copiesAvailable}/{b.copiesTotal})</option>)}</Select></FormField>
              <FormField name="cp-codes" label={ui("Barcodes")} hint={ui("One per copy, separated by spaces or commas.")}><Input dir="ltr" value={copyForm.barcodes} onChange={(e) => setCopyForm((f) => ({ ...f, barcodes: e.target.value }))} /></FormField>
              <Button type="submit" size="sm" disabled={!copyForm.bookId || !copyForm.barcodes.trim()}>{ui("Register copies")}</Button>
            </form>
            <p className="text-xs text-ink-subtle">{ui("Loan rules v{0}: {1} days, up to {2} loans, {3} renewals, fine {4} per open day after {5} grace days, cap {6}.", [overview.rules.version, overview.rules.loanDays, overview.rules.maxLoans, overview.rules.maxRenewals, money(overview.rules.finePerDay, overview.rules.currency), overview.rules.graceDays, overview.rules.fineCap ? money(overview.rules.fineCap, overview.rules.currency) : ui("none")])}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
