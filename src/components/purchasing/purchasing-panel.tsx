"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-435: purchasing beside inventory — budget position before submitting, approval by someone
// else within limits, partial deliveries counted against the order, invoice variance review and
// tagged assets with custodians and service dates. One obvious action per stage.

type Line = { itemId?: string | null; description: string; quantity: number; unitPrice: number; asset?: boolean };
type Budget = { id: string; costCenter: string; period: string; amount: number; currency: string; approvalLimit: number; committed: number; spent: number; available: number };
type Request = { id: string; poNumber: string; title: string; budgetId: string; status: string; total: number; version: number; lines: Line[]; received: number[]; requestedById: string };
type Invoice = { id: string; requestId: string; invoiceNo: string; amount: number; status: string; issues: { code: string; detail: string }[] };
type Asset = { id: string; tag: string; description: string; custodian: string | null; location: string | null; nextServiceOn: string | null };
type Overview = { userId: string; canApprove: boolean; budgets: Budget[]; requests: Request[]; invoices: Invoice[]; assets: Asset[]; services: { id: string; assetId: string; dueOn: string }[]; stores: { id: string; name: string }[]; items: { id: string; name: string }[]; suppliers: { id: string; name: string }[] };

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved — record delivery", RETURNED: "Returned for changes", PARTIALLY_RECEIVED: "Partly received", RECEIVED: "Received", CANCELLED: "Cancelled", MATCHED: "Matched", REVIEW: "Needs review", ACCEPTED_WITH_VARIANCE: "Accepted with variance", REJECTED: "Rejected" };
const ISSUE_LABEL: Record<string, string> = { DUPLICATE: "Duplicate invoice number", PRICE_VARIANCE: "Amount differs from goods received", NOTHING_RECEIVED: "Nothing received yet" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

export function PurchasingPanel() {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ budgetId: "", title: "", supplierId: "", description: "", itemId: "", quantity: "1", unitPrice: "0", asset: false });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [store, setStore] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState<Record<string, { no: string; amount: string }>>({});
  const load = useCallback(async () => { try { setData(await call("/api/purchasing")); setError(null); } catch (e) { setError(ui((e as Error).message)); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => { try { const r = await call("/api/purchasing", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return r; } catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; } };
  if (!data) return <section className="sk-panel p-4"><p role="status" className="text-sm text-ink-subtle">{error ?? ui("Checking current commitments…")}</p></section>;
  const budgetOf = (id: string) => data.budgets.find((b) => b.id === id);
  const money = (v: number, c?: string) => `${number(v)}${c ? ` ${c}` : ""}`;
  const draftTotal = Number(form.quantity || 0) * Number(form.unitPrice || 0);
  const chosen = budgetOf(form.budgetId);

  return (
    <section aria-labelledby="purchasing" className="sk-panel space-y-4 p-4">
      <h2 id="purchasing" className="text-lg font-bold">{ui("Purchasing and assets")}</h2>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
        {notice ? <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p> : null}
      </div>

      <div className="overflow-x-auto"><table className="w-full text-sm">
        <caption className="text-start font-semibold">{ui("Budgets")}</caption>
        <thead><tr className="text-start text-xs text-ink-subtle"><th className="text-start">{ui("Cost centre")}</th><th className="text-start">{ui("Budget")}</th><th className="text-start">{ui("Committed")}</th><th className="text-start">{ui("Received")}</th><th className="text-start">{ui("Available")}</th></tr></thead>
        <tbody>{data.budgets.map((b) => <tr key={b.id} className="border-t border-border"><td><bdi>{b.costCenter}</bdi> · <span dir="ltr">{b.period}</span></td><td>{money(b.amount, b.currency)}</td><td>{money(b.committed)}</td><td>{money(b.spent)}</td><td className={b.available < 0 ? "text-status-error-text" : ""}>{money(b.available)}</td></tr>)}</tbody>
      </table></div>

      <form className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault();
        const r = await post({ action: "save", data: { budgetId: form.budgetId, title: form.title, supplierId: form.supplierId || null, lines: [{ itemId: form.itemId || null, description: form.description, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), asset: form.asset }] } }, "Request saved as a draft.");
        if (r) setForm((f) => ({ ...f, title: "", description: "" }));
      }}>
        <h3 className="font-semibold md:col-span-3">{ui("New request")}</h3>
        <FormField name="pr-budget" label={ui("Budget")}><Select value={form.budgetId} onChange={(e) => setForm((f) => ({ ...f, budgetId: e.target.value }))}><option value="">{ui("Choose a budget")}</option>{data.budgets.map((b) => <option key={b.id} value={b.id}>{b.costCenter} · {b.period}</option>)}</Select></FormField>
        <FormField name="pr-title" label={ui("What is needed")}><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></FormField>
        <FormField name="pr-supplier" label={ui("Supplier")}><Select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}><option value="">{ui("Not chosen yet")}</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
        <FormField name="pr-desc" label={ui("Line description")}><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></FormField>
        <FormField name="pr-item" label={ui("Stock item (optional)")}><Select value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}><option value="">{ui("Not a stock item")}</option>{data.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField name="pr-qty" label={ui("Quantity")}><Input inputMode="numeric" dir="ltr" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></FormField>
          <FormField name="pr-price" label={ui("Unit price")}><Input inputMode="numeric" dir="ltr" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} /></FormField>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={form.asset} onChange={(e) => setForm((f) => ({ ...f, asset: e.target.checked }))} /> {ui("Track each unit as an asset")}</label>
        {chosen ? <p className={`text-sm md:col-span-2 ${draftTotal > chosen.available ? "text-status-error-text" : "text-ink-subtle"}`}>{draftTotal > chosen.available ? ui("{0} above available budget", [money(draftTotal - chosen.available, chosen.currency)]) : ui("Commits {0} of {1} available", [money(draftTotal, chosen.currency), money(chosen.available, chosen.currency)])}</p> : null}
        <div className="md:col-span-3"><Button type="submit" size="sm" disabled={!form.budgetId || !form.title || !form.description}>{ui("Save draft")}</Button></div>
      </form>

      <ul className="space-y-2">{data.requests.map((r) => {
        const b = budgetOf(r.budgetId);
        return (
          <li key={r.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold"><span dir="ltr">{r.poNumber}</span> · <bdi>{r.title}</bdi> · {money(r.total, b?.currency)} · {ui(STATUS_LABEL[r.status] ?? r.status)}</p>
            <ul className="text-ink-subtle">{r.lines.map((l, i) => <li key={i}><bdi>{l.description}</bdi> · {ui("Received {0} of {1}", [r.received[i] ?? 0, l.quantity])}{l.asset ? ` · ${ui("asset")}` : ""}</li>)}</ul>
            <div className="flex flex-wrap items-end gap-2">
              {["DRAFT", "RETURNED"].includes(r.status) ? <Button size="sm" onClick={() => post({ action: "submit", id: r.id, version: r.version }, "Submitted for approval.")}>{ui("Submit for approval")}</Button> : null}
              {r.status === "SUBMITTED" && data.canApprove && r.requestedById !== data.userId ? <>
                <FormField name={`rs-${r.id}`} label={ui("Reason (to return)")} className="min-w-[12rem]"><Input value={reasons[r.id] ?? ""} onChange={(e) => setReasons((x) => ({ ...x, [r.id]: e.target.value }))} /></FormField>
                <Button size="sm" onClick={() => post({ action: "decide", id: r.id, data: { version: r.version, decision: "APPROVE" } }, "Order approved; budget committed once.")}>{ui("Approve order")}</Button>
                <Button size="sm" variant="outline" onClick={() => post({ action: "decide", id: r.id, data: { version: r.version, decision: "RETURN", reason: reasons[r.id] } }, "Returned with your reason.")}>{ui("Return")}</Button>
              </> : null}
              {r.status === "SUBMITTED" && r.requestedById === data.userId ? <p className="text-xs text-ink-subtle">{ui("Another approver must decide a request you raised.")}</p> : null}
              {["APPROVED", "PARTIALLY_RECEIVED"].includes(r.status) ? <>
                {r.lines.some((l) => l.itemId) ? <FormField name={`st-${r.id}`} label={ui("Store")}><Select value={store} onChange={(e) => setStore(e.target.value)}><option value="">{ui("Choose a store")}</option>{data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField> : null}
                {r.lines.map((l, i) => <FormField key={i} name={`rc-${r.id}-${i}`} label={ui("Counted for line {0}", [i + 1])} className="w-36"><Input inputMode="numeric" dir="ltr" value={counts[`${r.id}:${i}`] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [`${r.id}:${i}`]: e.target.value }))} /></FormField>)}
                <Button size="sm" onClick={() => post({ action: "receive", id: r.id, data: { idempotencyKey: newKey(), lines: r.lines.map((_, i) => ({ line: i, quantity: Number(counts[`${r.id}:${i}`] || 0), storeId: store || undefined })).filter((x) => x.quantity > 0) } }, "Delivery recorded.")}>{ui("Confirm received")}</Button>
              </> : null}
            </div>
            {["PARTIALLY_RECEIVED", "RECEIVED"].includes(r.status) ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
                <FormField name={`in-${r.id}`} label={ui("Invoice number")} className="w-40"><Input dir="ltr" value={invoice[r.id]?.no ?? ""} onChange={(e) => setInvoice((x) => ({ ...x, [r.id]: { no: e.target.value, amount: x[r.id]?.amount ?? "" } }))} /></FormField>
                <FormField name={`ia-${r.id}`} label={ui("Invoice amount")} className="w-40"><Input inputMode="numeric" dir="ltr" value={invoice[r.id]?.amount ?? ""} onChange={(e) => setInvoice((x) => ({ ...x, [r.id]: { no: x[r.id]?.no ?? "", amount: e.target.value } }))} /></FormField>
                <Button size="sm" variant="outline" onClick={() => post({ action: "invoice", id: r.id, data: { invoiceNo: invoice[r.id]?.no, amount: Number(invoice[r.id]?.amount || 0) } }, "Invoice recorded.")}>{ui("Match invoice")}</Button>
              </div>
            ) : null}
            {data.invoices.filter((i) => i.requestId === r.id).map((i) => <p key={i.id} className={i.status === "REVIEW" ? "text-amber-900" : "text-ink-subtle"}><span dir="ltr">{i.invoiceNo}</span> · {money(i.amount, b?.currency)} · {ui(STATUS_LABEL[i.status] ?? i.status)}{i.issues.length ? ` · ${i.issues.map((x) => ui(ISSUE_LABEL[x.code] ?? x.code)).join(", ")}` : ""}</p>)}
          </li>
        );
      })}</ul>

      <div className="space-y-2">
        <h3 className="font-semibold">{ui("Assets")}</h3>
        {data.assets.length === 0 ? <p className="text-sm text-ink-subtle">{ui("Assets appear here once a delivery is confirmed.")}</p> : (
          <ul className="space-y-1 text-sm">{data.assets.map((a) => <li key={a.id}><span dir="ltr" className="font-semibold">{a.tag}</span> · <bdi>{a.description}</bdi> · {a.custodian ? <bdi>{a.custodian}</bdi> : ui("No custodian yet")}{a.location ? <> · <bdi>{a.location}</bdi></> : null}{a.nextServiceOn ? ` · ${ui("service due {0}", [a.nextServiceOn.slice(0, 10)])}` : ""}</li>)}</ul>
        )}
      </div>
    </section>
  );
}
