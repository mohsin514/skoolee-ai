"use client";
import { useState } from "react";
import type { PilotCommercialEvidence } from "@/lib/pilots/service";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

const fields = {
  charterReference: "Signed charter reference", schoolApproval: "School approval reference", vendorApproval: "Vendor approval reference",
  scopeAndResponsibilities: "Agreed scope, exclusions and responsibilities", baselineMethod: "Baseline method",
  invoiceReference: "Invoice reference", paymentReference: "Payment settlement reference", refundTerms: "Cancellation and refund terms",
  authorityReference: "School data authority reference", privacyReference: "Privacy review reference",
  deploymentReference: "Deployment readiness reference", providerReference: "Provider readiness reference",
} as const;
type RefKey = keyof typeof fields;
type Revision = { at: string; workflows?: { definition: string; successDefinition: string }[]; commercial: PilotCommercialEvidence | null };
export function PilotCharter({ history, workflows, save }: {
  history: Revision[]; workflows: { key: string; definition: string; successDefinition: string }[];
  save: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const ui = useUiText();
  const last = history.at(-1)?.commercial;
  const [refs, setRefs] = useState(() => Object.fromEntries(Object.keys(fields).map(k => [k, last?.[k as RefKey] ?? ""])) as Record<RefKey, string>);
  const [price, setPrice] = useState(last ? String(last.price) : "");
  const [currency, setCurrency] = useState(last?.currency ?? "");
  const [payment, setPayment] = useState(last?.paymentStatus ?? "PENDING");
  const [cycles, setCycles] = useState(last?.cycles ?? []);
  const [scope, setScope] = useState(workflows);
  const [closure, setClosure] = useState(last?.closure ?? { outcome: "STOPPED" as const, reason: "", reference: "", date: "", exitReference: "" });
  const [busy, setBusy] = useState(false);
  const optional = new Set<RefKey>(["paymentReference", "authorityReference", "privacyReference", "deploymentReference", "providerReference"]);
  return <form className="sk-panel space-y-3 p-4" onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    try { await save({ workflows: scope, commercial: { ...Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v || null])), price: Number(price), currency, paymentStatus: payment, cycles, closure: closure.reference ? closure : null } }); }
    finally { setBusy(false); }
  }}>
    <h3 className="font-bold">{ui("Commercial charter evidence")}</h3>
    <p className="text-sm">{ui("Record reviewed evidence references. Saving does not activate service or collect payment.")}</p>
    <div className="grid gap-3 md:grid-cols-2">{Object.entries(fields).map(([key, label]) => { const Control = ["scopeAndResponsibilities", "baselineMethod", "refundTerms"].includes(key) ? Textarea : Input; return <FormField key={key} name={`charter-${key}`} label={ui(label)} required={!optional.has(key as RefKey)}><Control required={!optional.has(key as RefKey)} value={refs[key as RefKey]} onChange={e => setRefs({ ...refs, [key]: e.target.value })} /></FormField>; })}</div>
    <div className="grid gap-3 md:grid-cols-3">
      <FormField name="charter-price" label={ui("Pilot price")} required><Input required type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></FormField>
      <FormField name="charter-currency" label={ui("Currency")} required><Input required pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></FormField>
      <FormField name="charter-payment" label={ui("Payment status")}><Select value={payment} onChange={e => setPayment(e.target.value as typeof payment)}>{["PENDING", "FAILED", "PAID"].map(v => <option key={v} value={v}>{ui(v === "PENDING" ? "Pending" : v === "FAILED" ? "Failed" : "Paid")}</option>)}</Select></FormField>
    </div>
    {scope.map((w, i) => <div key={w.key} className="grid gap-3 md:grid-cols-2">
      <FormField name={`scope-${i}`} label={`${ui("Workflow definition")} (${w.key})`}><Input required value={w.definition} onChange={e => setScope(scope.map((row, n) => n === i ? { ...row, definition: e.target.value } : row))} /></FormField>
      <FormField name={`success-${i}`} label={ui("Success definition")}><Input required value={w.successDefinition} onChange={e => setScope(scope.map((row, n) => n === i ? { ...row, successDefinition: e.target.value } : row))} /></FormField>
    </div>)}
    <h4 className="font-bold">{ui("Workflow cycles")}</h4>
    {cycles.map((cycle, i) => <fieldset key={cycle.id} className="grid gap-3 md:grid-cols-4"><legend>{ui("Cycle")} {i + 1}</legend>
      <FormField name={`cycle-workflow-${i}`} label={ui("Workflow key")}><Select value={cycle.workflow} onChange={e => setCycles(cycles.map((c, n) => n === i ? { ...c, workflow: e.target.value } : c))}>{workflows.map(w => <option key={w.key}>{w.key}</option>)}</Select></FormField>
      <FormField name={`cycle-date-${i}`} label={ui("Date")}><Input required type="date" value={cycle.date} onChange={e => setCycles(cycles.map((c, n) => n === i ? { ...c, date: e.target.value } : c))} /></FormField>
      <FormField name={`cycle-source-${i}`} label={ui("Evidence reference")}><Input required value={cycle.reference} onChange={e => setCycles(cycles.map((c, n) => n === i ? { ...c, reference: e.target.value } : c))} /></FormField>
      <FormField name={`cycle-state-${i}`} label={ui("Completion")}><Select value={String(cycle.completed)} onChange={e => setCycles(cycles.map((c, n) => n === i ? { ...c, completed: e.target.value === "true" } : c))}><option value="false">{ui("Incomplete")}</option><option value="true">{ui("Completed")}</option></Select></FormField>
    </fieldset>)}
    <Button type="button" variant="outline" onClick={() => setCycles([...cycles, { id: crypto.randomUUID(), workflow: workflows[0].key, date: "", reference: "", completed: false }])}>{ui("Add cycle")}</Button>
    <h4 className="font-bold">{ui("Closure evidence")}</h4>
    <FormField name="closure-outcome" label={ui("Outcome")}><Select value={closure.outcome} onChange={e => setClosure({ ...closure, outcome: e.target.value as typeof closure.outcome })}>{["PAID", "RENEWED", "DECLINED", "STOPPED"].map(v => <option key={v} value={v}>{ui(v === "PAID" ? "Paid" : v === "RENEWED" ? "Renewed" : v === "DECLINED" ? "Declined" : "Stopped")}</option>)}</Select></FormField>
    {([['reason', 'Reason'], ['reference', 'Decision source'], ['date', 'Decision date'], ['exitReference', 'Export, obligations and access closure reference']] as const).map(([key, label]) => <FormField key={key} name={`closure-${key}`} label={ui(label)}><Input type={key === 'date' ? 'date' : 'text'} value={closure[key]} onChange={e => setClosure({ ...closure, [key]: e.target.value })} /></FormField>)}
    <Button type="submit" disabled={busy}>{ui(busy ? "Saving…" : "Save charter")}</Button>
    <details><summary>{ui("Charter history")} ({history.length})</summary>{history.map((r, i) => <p key={i}><bdi>{i + 1}: {r.at} — {r.commercial?.charterReference ?? "—"} — {r.commercial?.schoolApproval ?? "—"} / {r.commercial?.vendorApproval ?? "—"}</bdi>{r.workflows?.map((w, n) => <span className="block" key={n}><bdi>{w.definition} — {w.successDefinition}</bdi></span>)}</p>)}</details>
  </form>;
}
