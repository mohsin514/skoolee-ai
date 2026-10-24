"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { Package, Plus, ShoppingCart } from "lucide-react";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Modal, ModalActions } from "@/components/ui/modal";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";

// SKO-435: purchasing beside inventory — budget position before submitting, approval by someone
// else within limits, partial deliveries counted against the order, invoice variance review and
// tagged assets with custodians and service dates. One obvious action per stage.

type Line = { itemId?: string | null; description: string; quantity: number; unitPrice: number; asset?: boolean };
type Budget = { id: string; costCenter: string; period: string; amount: number; currency: string; approvalLimit: number; committed: number; spent: number; available: number };
type HistoryEntry = { by?: string; action?: string; reason?: string | null; selfApproved?: boolean };
type Request = { id: string; poNumber: string; title: string; budgetId: string; status: string; total: number; version: number; lines: Line[]; received: number[]; requestedById: string; selfApproved?: boolean; history?: HistoryEntry[] | null };
type Invoice = { id: string; requestId: string; invoiceNo: string; amount: number; status: string; issues: { code: string; detail: string }[] };
type Asset = { id: string; tag: string; description: string; custodian: string | null; location: string | null; nextServiceOn: string | null };
type Overview = { userId: string; canApprove: boolean; /** SD3 (§2.5): no other campus operator can decide on this campus. */ soleChecker?: boolean; budgets: Budget[]; requests: Request[]; invoices: Invoice[]; assets: Asset[]; services: { id: string; assetId: string; dueOn: string }[]; stores: { id: string; name: string }[]; items: { id: string; name: string }[]; suppliers: { id: string; name: string }[] };

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved — record delivery", RETURNED: "Returned for changes", PARTIALLY_RECEIVED: "Partly received", RECEIVED: "Received", CANCELLED: "Cancelled", MATCHED: "Matched", REVIEW: "Needs review", ACCEPTED_WITH_VARIANCE: "Accepted with variance", REJECTED: "Rejected" };
const ISSUE_LABEL: Record<string, string> = { DUPLICATE: "Duplicate invoice number", PRICE_VARIANCE: "Amount differs from goods received", NOTHING_RECEIVED: "Nothing received yet" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "");
  return json.data;
}
/** SD3 badge: the overview may carry `selfApproved`; otherwise the request's own history records it (§2.5). */
const wasSelfApproved = (r: Request) => r.selfApproved ?? (Array.isArray(r.history) && r.history.some((entry) => entry?.selfApproved === true));
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

/**
 * Purchasing beside inventory (admin `inventory`, §4.4b). The console's PageHeader carries "New purchase request"
 * (`command` `new-request`, with `createInHeader`); the request form opens in a dialog. Approval rows offer
 * Approve / Return: Approve commits budget money, so it confirms with the amount, the budget and a typed note (R3);
 * Return asks for its reason; a sole approver's own request goes through the SD3 reason dialog (§2.5).
 *
 * `soleChecker`: the console's own answer to "is this operator the campus's only campus admin?" (derived from its
 * campus roster). The overview's `soleChecker`, when the service sends one, wins (P6 need in the P5 report).
 * Results of actions are toasts; a load failure is an inline ErrorState with retry (R4).
 */
export function PurchasingPanel({ command, createInHeader = false, soleChecker }: { command?: PanelCommand | null; createInHeader?: boolean; soleChecker?: boolean } = {}) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const access = useConsoleAccess();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ budgetId: "", title: "", supplierId: "", description: "", itemId: "", quantity: "1", unitPrice: "0", asset: false });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Record<string, { no: string; amount: string }>>({});
  // SD3: a sole approver may decide their own request, with a typed reason the group admin sees.
  const [selfApproving, setSelfApproving] = useState<Request | null>(null);
  const [returning, setReturning] = useState<Request | null>(null);
  const [approving, setApproving] = useState<Request | null>(null);
  const [creating, setCreating] = useState(false);
  usePanelCommand(command, { "new-request": () => setCreating(true) }, Boolean(data));
  const load = useCallback(async () => { try { setData(await call("/api/purchasing")); setError(null); } catch (e) { setError(friendlyErrorMessage(e, ui("Check your connection and try again."))); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  // R4: an action's result is one translated toast; a failure keeps the form or dialog open.
  const post = async (body: object, success: string, key = "form") => { setBusy(key); try { const r = await call("/api/purchasing", { method: "POST", body: JSON.stringify(body) }); toast.success(ui(success)); await load(); return r; } catch (e) { toast.error(friendlyErrorMessage(e, ui("This action could not be completed. Please try again."))); return null; } finally { setBusy(null); } };
  const saveDraft = async () => {
    const r = await post({ action: "save", data: { budgetId: form.budgetId, title: form.title, supplierId: form.supplierId || null, lines: [{ itemId: form.itemId || null, description: form.description, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), asset: form.asset }] } }, "Request saved as a draft. Submit it for approval from the list.");
    if (r) { setForm((f) => ({ ...f, title: "", description: "" })); setCreating(false); }
  };
  if (!data) return <section className="sk-panel p-4">{error ? <ErrorState title={ui("Could not load purchasing")} description={error} onRetry={() => void load()} retryLabel={ui("Try again")} /> : <SkeletonList rows={4} label={ui("Checking current commitments…")} />}</section>;
  const budgetOf = (id: string) => data.budgets.find((b) => b.id === id);
  const money = (v: number, c?: string) => `${number(v)}${c ? ` ${c}` : ""}`;
  const draftTotal = Number(form.quantity || 0) * Number(form.unitPrice || 0);
  const chosen = budgetOf(form.budgetId);
  const sole = data.soleChecker ?? soleChecker ?? false;
  /** Who hears about a sole approver's own decision: nobody above the institution authority itself (§2.5). */
  const selfApprovalNotice = access.has("institutionAuthority")
    ? ui("No other campus admin can decide it, so your reason is recorded with the decision.")
    : access.has("standaloneDeputy")
      ? ui("No other campus admin can decide it. Your reason is recorded and your school admin is told.")
      : ui("No other campus admin can decide it. Your reason is recorded and your group admin is told.");
  const commitLine = (r: Request) => {
    const b = budgetOf(r.budgetId);
    if (!b) return ui("Approving commits {0} against its budget.", [money(r.total)]);
    return ui("Approving commits {0} against {1}; {2} stays available afterwards.", [money(r.total, b.currency), `${b.costCenter} · ${b.period}`, money(b.available - r.total, b.currency)]);
  };

  return (
    <section aria-labelledby="purchasing" className="sk-panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="purchasing" className="text-lg font-bold text-ink-strong">{ui("Purchasing and assets")}</h2>
        {createInHeader ? null : <Button type="button" size="sm" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{ui("New purchase request")}</Button>}
      </div>
      <ConfirmAction
        open={Boolean(returning)}
        title={ui("Return this request?")}
        description={ui("It goes back to the person who raised it with your reason, and nothing is committed against the budget.")}
        confirmLabel={ui("Return request")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={Boolean(returning && busy === `return:${returning.id}`)}
        requireReason={{ label: ui("What needs to change"), minLength: 5 }}
        onCancel={() => setReturning(null)}
        onConfirm={async (reason?: string) => {
          if (!returning) return;
          const done = await post({ action: "decide", id: returning.id, data: { version: returning.version, decision: "RETURN", reason } }, "Returned with your reason.", `return:${returning.id}`);
          if (done !== null) setReturning(null);
        }}
      />
      <ConfirmAction
        open={Boolean(approving)}
        title={ui("Approve order {0}?", [approving?.poNumber ?? ""])}
        description={approving ? `${commitLine(approving)} ${ui("If its lines, supplier or total change later, the approval is withdrawn.")}` : ""}
        confirmLabel={ui("Approve order")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={Boolean(approving && busy === `approve:${approving.id}`)}
        requireReason={{ label: ui("Approval note"), minLength: 5 }}
        onCancel={() => setApproving(null)}
        onConfirm={async (reason?: string) => {
          if (!approving) return;
          const done = await post({ action: "decide", id: approving.id, data: { version: approving.version, decision: "APPROVE", reason } }, "Order approved; budget committed once.", `approve:${approving.id}`);
          if (done !== null) setApproving(null);
        }}
      />
      <ConfirmAction
        open={Boolean(selfApproving)}
        title={ui("Approve your own request?")}
        description={selfApproving ? `${commitLine(selfApproving)} ${selfApprovalNotice}` : ""}
        confirmLabel={ui("Approve order")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={Boolean(selfApproving && busy === `approve:${selfApproving.id}`)}
        requireReason={{ label: ui("Why you are approving it yourself"), minLength: 10 }}
        onCancel={() => setSelfApproving(null)}
        onConfirm={async (reason?: string) => {
          if (!selfApproving) return;
          const done = await post({ action: "decide", id: selfApproving.id, data: { version: selfApproving.version, decision: "APPROVE", reason } }, "Order approved; budget committed once.", `approve:${selfApproving.id}`);
          if (done !== null) setSelfApproving(null);
        }}
      />

      {/* The shared data table (one look for every list of numbers); a caption names it for screen readers. */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-ink-strong">{ui("Budgets")}</h3>
        {data.budgets.length === 0 ? (
          <EmptyState size="sm" icon={Package} title={ui("No budgets yet")} description={ui("Purchase requests are raised against a budget. Budgets are set up by the finance office.")} />
        ) : (
          <Table className="tabular-nums" containerClassName="min-w-0">
            <caption className="sr-only">{ui("Budgets")}</caption>
            <TableHeader><TableRow><TableHead>{ui("Cost centre")}</TableHead><TableHead>{ui("Budget")}</TableHead><TableHead>{ui("Committed")}</TableHead><TableHead>{ui("Received")}</TableHead><TableHead>{ui("Available")}</TableHead></TableRow></TableHeader>
            <TableBody>{data.budgets.map((b) => <TableRow key={b.id}><TableCell className="py-3"><bdi>{b.costCenter}</bdi> · <span dir="ltr">{b.period}</span></TableCell><TableCell className="py-3">{money(b.amount, b.currency)}</TableCell><TableCell className="py-3">{money(b.committed)}</TableCell><TableCell className="py-3">{money(b.spent)}</TableCell><TableCell className={b.available < 0 ? "py-3 font-semibold text-status-error-text" : "py-3"}>{money(b.available)}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </div>

      {creating ? (
        <Modal
          title={ui("New purchase request")}
          eyebrow={ui("Purchasing")}
          // §4.5.9: the form says who decides.
          subtitle={sole
            ? ui("Saved as a draft first. As the only campus admin here, you approve it yourself, with a reason.")
            : ui("Saved as a draft first, then another campus admin approves it within the budget limit.")}
          icon={ShoppingCart}
          size="md"
          dirty={Boolean(form.title || form.description)}
          onClose={() => setCreating(false)}
          footer={<ModalActions busy={busy === "form"} busyLabel={ui("Saving…")} actionLabel={ui("Save draft")} onCancel={() => setCreating(false)} onAction={() => void saveDraft()} blockedReason={!form.budgetId || !form.title || !form.description ? ui("Choose a budget, say what is needed and describe the line.") : null} />}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void saveDraft(); }}>
            <FormField name="pr-budget" label={ui("Budget")} required><Select value={form.budgetId} onChange={(e) => setForm((f) => ({ ...f, budgetId: e.target.value }))}><option value="">{ui("Choose a budget")}</option>{data.budgets.map((b) => <option key={b.id} value={b.id}>{b.costCenter} · {b.period}</option>)}</Select></FormField>
            <FormField name="pr-title" label={ui("What is needed")} required><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></FormField>
            <FormField name="pr-supplier" label={ui("Supplier")}><Select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}><option value="">{ui("Not chosen yet")}</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
            <FormField name="pr-desc" label={ui("Line description")} required><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></FormField>
            <FormField name="pr-item" label={ui("Stock item (optional)")}><Select value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}><option value="">{ui("Not a stock item")}</option>{data.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField name="pr-qty" label={ui("Quantity")}><Input inputMode="numeric" dir="ltr" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></FormField>
              <FormField name="pr-price" label={ui("Unit price")}><Input inputMode="numeric" dir="ltr" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} /></FormField>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={form.asset} onChange={(e) => setForm((f) => ({ ...f, asset: e.target.checked }))} /> {ui("Track each unit as an asset")}</label>
            {chosen ? <p className={`text-sm sm:col-span-2 ${draftTotal > chosen.available ? "text-status-error-text" : "text-ink-subtle"}`}>{draftTotal > chosen.available ? ui("{0} above available budget", [money(draftTotal - chosen.available, chosen.currency)]) : ui("Commits {0} of {1} available", [money(draftTotal, chosen.currency), money(chosen.available, chosen.currency)])}</p> : null}
          </form>
        </Modal>
      ) : null}

      {data.requests.length === 0 ? <EmptyState size="sm" icon={ShoppingCart} title={ui("No purchase requests yet")} description={ui("Start a request, save it as a draft, then submit it for approval.")} primaryAction={{ id: "new-purchase-request", label: "New purchase request", icon: Plus, onClick: () => setCreating(true) }} /> : null}
      <ul className="space-y-2">{data.requests.map((r) => {
        const b = budgetOf(r.budgetId);
        return (
          <li key={r.id} className="space-y-2 rounded-xl border border-edge p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 font-semibold text-ink-strong"><span dir="ltr">{r.poNumber}</span> · <bdi>{r.title}</bdi> · <span className="tabular-nums">{money(r.total, b?.currency)}</span></p><Badge size="sm" dot variant={r.status === "RECEIVED" ? "success" : r.status === "RETURNED" || r.status === "SUBMITTED" ? "warning" : r.status === "CANCELLED" ? "neutral" : "info"}>{ui(STATUS_LABEL[r.status] ?? r.status)}</Badge></div>
            <ul className="text-ink-subtle">{r.lines.map((l, i) => <li key={i}><bdi>{l.description}</bdi> · {ui("Received {0} of {1}", [r.received[i] ?? 0, l.quantity])}{l.asset ? ` · ${ui("asset")}` : ""}</li>)}</ul>
            <div className="flex flex-wrap items-end gap-2">
              {["DRAFT", "RETURNED"].includes(r.status) ? <Button size="sm" loading={busy === `submit:${r.id}`} onClick={() => post({ action: "submit", id: r.id, version: r.version }, "Submitted for approval.", `submit:${r.id}`)}>{ui("Submit for approval")}</Button> : null}
              {r.status === "SUBMITTED" && data.canApprove && r.requestedById !== data.userId ? <>
                {/* §4.5.2: an approval queue row carries the Approve / Return pair; Return asks for the reason. */}
                <Button size="sm" loading={busy === `approve:${r.id}`} onClick={() => setApproving(r)}>{ui("Approve order")}</Button>
                <Button size="sm" variant="outline" disabled={busy === `return:${r.id}`} onClick={() => setReturning(r)}>{ui("Return")}</Button>
              </> : null}
              {r.status === "SUBMITTED" && r.requestedById === data.userId ? (data.canApprove && sole
                ? <Button size="sm" variant="outline" onClick={() => setSelfApproving(r)}>{ui("Approve as the only approver")}</Button>
                : <p className="text-xs text-ink-subtle">{ui("Another approver must decide a request you raised.")}</p>) : null}
              {wasSelfApproved(r) ? <Badge size="sm" variant="warning">{ui("Self-approved")}</Badge> : null}
              {["APPROVED", "PARTIALLY_RECEIVED"].includes(r.status) ? <>
                {r.lines.some((l) => l.itemId) ? <FormField name={`st-${r.id}`} label={ui("Store")}><Select value={store} onChange={(e) => setStore(e.target.value)}><option value="">{ui("Choose a store")}</option>{data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField> : null}
                {r.lines.map((l, i) => <FormField key={i} name={`rc-${r.id}-${i}`} label={ui("Counted for line {0}", [i + 1])} className="w-full sm:w-36"><Input inputMode="numeric" dir="ltr" value={counts[`${r.id}:${i}`] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [`${r.id}:${i}`]: e.target.value }))} /></FormField>)}
                <Button size="sm" loading={busy === `receive:${r.id}`} onClick={() => post({ action: "receive", id: r.id, data: { idempotencyKey: newKey(), lines: r.lines.map((_, i) => ({ line: i, quantity: Number(counts[`${r.id}:${i}`] || 0), storeId: store || undefined })).filter((x) => x.quantity > 0) } }, "Delivery recorded.", `receive:${r.id}`)}>{ui("Confirm received")}</Button>
              </> : null}
            </div>
            {["PARTIALLY_RECEIVED", "RECEIVED"].includes(r.status) ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-edge pt-2">
                <FormField name={`in-${r.id}`} label={ui("Invoice number")} className="w-full sm:w-40"><Input dir="ltr" value={invoice[r.id]?.no ?? ""} onChange={(e) => setInvoice((x) => ({ ...x, [r.id]: { no: e.target.value, amount: x[r.id]?.amount ?? "" } }))} /></FormField>
                <FormField name={`ia-${r.id}`} label={ui("Invoice amount")} className="w-full sm:w-40"><Input inputMode="numeric" dir="ltr" value={invoice[r.id]?.amount ?? ""} onChange={(e) => setInvoice((x) => ({ ...x, [r.id]: { no: x[r.id]?.no ?? "", amount: e.target.value } }))} /></FormField>
                <Button size="sm" variant="outline" loading={busy === `invoice:${r.id}`} onClick={() => post({ action: "invoice", id: r.id, data: { invoiceNo: invoice[r.id]?.no, amount: Number(invoice[r.id]?.amount || 0) } }, "Invoice recorded.", `invoice:${r.id}`)}>{ui("Match invoice")}</Button>
              </div>
            ) : null}
            {data.invoices.filter((i) => i.requestId === r.id).map((i) => <p key={i.id} className={i.status === "REVIEW" ? "text-status-warning-text" : "text-ink-subtle"}><span dir="ltr">{i.invoiceNo}</span> · {money(i.amount, b?.currency)} · {ui(STATUS_LABEL[i.status] ?? i.status)}{i.issues.length ? ` · ${i.issues.map((x) => ui(ISSUE_LABEL[x.code] ?? x.code)).join(", ")}` : ""}</p>)}
          </li>
        );
      })}</ul>

      <div className="space-y-2">
        <h3 className="text-base font-semibold text-ink-strong">{ui("Assets")}</h3>
        {data.assets.length === 0 ? <EmptyState size="sm" icon={Package} title={ui("No assets yet")} description={ui("Assets appear here once a delivery is confirmed.")} /> : (
          <ul className="space-y-1 text-sm">{data.assets.map((a) => <li key={a.id} className="min-w-0 break-words"><span dir="ltr" className="font-semibold">{a.tag}</span> · <bdi>{a.description}</bdi> · {a.custodian ? <bdi>{a.custodian}</bdi> : ui("No custodian yet")}{a.location ? <> · <bdi>{a.location}</bdi></> : null}{a.nextServiceOn ? ` · ${ui("service due {0}", [a.nextServiceOn.slice(0, 10)])}` : ""}</li>)}</ul>
        )}
      </div>
    </section>
  );
}
