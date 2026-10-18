"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-434: a payroll run under the entity's policy version — exceptions first, every amount
// explained, approval by someone else, export to the provider (exported is not paid), provider
// results per row and a correction version for rejected rows only.

type Component = { code: string; label: string; kind: "EARNING" | "DEDUCTION"; amount: number; rule: string; source: string };
type Line = { userId: string; name: string; providerEmployeeId: string | null; employedDays: number; periodDays: number; components: Component[]; gross: number; deductions: number; net: number };
type Exception = { code: string; userId?: string; message: string; blocking: boolean };
type Version = { id: string; version: number; status: string; currency: string; entityName: string; policyVersion: number; correctionOfId: string | null; lines: Line[]; exceptions: Exception[]; totalNet: number; staleReason: string | null; preparedById: string; approvedById: string | null };
type Row = { userId: string; providerEmployeeId: string; net: number; outcome: string; reason?: string };
type Submission = { id: string; calculationId: string; reference: string; status: string; rows: Row[]; attempts: number; submittedAt: string };
type Policy = { id: string; version: number; entityName: string; currency: string; packageLabel: string; scopeNote: string; effectiveFrom: string; prorationBasis: string; leaveDivisor: string };
type Overview = { policy: Policy | null; providers: { id: string; code: string; name: string; version: number; currencies: string[] }[]; versions: Version[]; submissions: Submission[]; corrections: (Row & { submissionId: string; reference: string; correctionStarted: boolean })[]; staffCount: number };

const STATUS: Record<string, string> = { DRAFT: "Draft — review and approve", APPROVED: "Approved — ready to export", STALE: "Inputs changed after approval", EXPORTED: "Exported — provider confirmation pending", SUPERSEDED: "Superseded", SUBMITTED: "Submitted", PARTIAL: "Partly accepted", ACKNOWLEDGED: "Accepted by provider", REJECTED: "Rejected by provider", PENDING: "Waiting for provider", ACCEPTED: "Accepted" };
const BASIS: Record<string, string> = { CALENDAR_DAYS: "calendar days", FIXED_30: "30-day month" };
const EXCEPTION: Record<string, string> = { MISSING_PROVIDER_ID: "Missing provider employee id", NEGATIVE_NET: "Negative net pay", UNSUPPORTED_CURRENCY: "Currency not supported by the provider" };
const RETRIED = "Retried with the same reference; only rows without a provider outcome were resent.";
const EXPORTED = "Approved run exported; provider confirmation is pending.";
const KIND: Record<string, string> = { EARNING: "Earning", DEDUCTION: "Deduction" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}

export function PayrollRunsPanel() {
  const ui = useUiText();
  const { money, date, dateTime } = useLocaleFormat();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, { outcome: string; reason: string }>>({});
  const [policyForm, setPolicyForm] = useState({ entityName: "", currency: "SAR", effectiveFrom: "", packageLabel: "", scopeNote: "", prorationBasis: "CALENDAR_DAYS", leaveDivisor: "CALENDAR_DAYS", leaveYearStartMonth: "9", rounding: "HALF_UP" });
  const [providerForm, setProviderForm] = useState({ code: "", name: "", currencies: "SAR" });

  const load = useCallback(async () => {
    try { setData(await call(`/api/payroll/runs?year=${period.year}&month=${period.month}`)); setError(null); }
    catch (e) { setData(null); setError(ui((e as Error).message)); }
  }, [period, ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    if (busy) return null;
    setBusy(true);
    try { const r = await call("/api/payroll/runs", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return r; }
    catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; }
    finally { setBusy(false); }
  };

  const current = data?.versions.find((v) => v.status !== "SUPERSEDED" && !v.correctionOfId) ?? null;
  const correction = data?.versions.find((v) => v.correctionOfId && v.status !== "SUPERSEDED") ?? null;
  const submissionOf = (id: string) => data?.submissions.find((s) => s.calculationId === id) ?? null;

  const runCard = (run: Version, title: string) => {
    const submission = submissionOf(run.id);
    const review = run.exceptions.filter((e) => e.blocking);
    const accepted = submission?.rows.filter((r) => r.outcome === "ACCEPTED").length ?? 0;
    const rejected = submission?.rows.filter((r) => r.outcome === "REJECTED").length ?? 0;
    return (
      <div className="space-y-3 rounded-xl border border-border p-3" key={run.id}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{ui(title)} · {ui("Version {0}", [run.version])}</h3>
          <span className="text-sm font-semibold">{ui(STATUS[run.status] ?? run.status)}</span>
        </div>
        <p className="text-sm text-ink-subtle">{ui("{0} employees · {1} items need review", [run.lines.length, review.length])} · {ui("Net total {0}", [money(run.totalNet, run.currency)])}</p>
        {run.staleReason ? <p role="alert" className="text-sm text-status-error-text">{ui(run.staleReason)}. {ui("Prepare a new version; approval is required again.")}</p> : null}
        {review.length ? (
          <ul aria-label={ui("Exceptions")} className="space-y-1 text-sm text-status-error-text">
            {review.map((e, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <span><strong>{ui(EXCEPTION[e.code] ?? e.code)}</strong>{e.userId ? <> · <bdi>{run.lines.find((l) => l.userId === e.userId)?.name}</bdi></> : null}</span>
                {e.code === "MISSING_PROVIDER_ID" && e.userId && data?.providers[0] ? (
                  <form className="flex items-end gap-2" onSubmit={(ev) => { ev.preventDefault(); void post({ action: "employee", id: e.userId, data: { providerIds: { [data.providers[0].code]: ids[e.userId!] ?? "" } } }, "Provider employee id saved. Prepare a new version to include it."); }}>
                    <FormField name={`pid-${e.userId}`} label={ui("Provider employee id")} className="w-40"><Input dir="ltr" value={ids[e.userId] ?? ""} onChange={(ev) => setIds((m) => ({ ...m, [e.userId!]: ev.target.value }))} /></FormField>
                    <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Save id")}</Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-xs text-ink-subtle"><th scope="col" className="text-start">{ui("Employee")}</th><th scope="col" className="text-start">{ui("Provider id")}</th><th scope="col" className="text-end">{ui("Gross")}</th><th scope="col" className="text-end">{ui("Deductions")}</th><th scope="col" className="text-end">{ui("Net")}</th></tr></thead>
          <tbody>{run.lines.map((l) => (
            <tr key={l.userId} className="border-t border-border align-top">
              <td>
                <details>
                  <summary className="cursor-pointer"><bdi>{l.name}</bdi>{l.employedDays < l.periodDays ? <span className="text-xs text-ink-subtle"> · {ui("{0} of {1} days", [l.employedDays, l.periodDays])}</span> : null}</summary>
                  <ul aria-label={ui("How this was calculated")} className="mt-1 space-y-1 text-xs">
                    {l.components.map((c, i) => <li key={i}><strong>{ui(KIND[c.kind])}</strong> · <bdi>{c.label}</bdi> · <span dir="ltr">{money(c.amount, run.currency)}</span><br /><span className="text-ink-subtle">{ui("Rule")}: <bdi>{c.rule}</bdi> · {ui("Input")}: <bdi>{c.source}</bdi></span></li>)}
                  </ul>
                </details>
              </td>
              <td><bdi dir="ltr">{l.providerEmployeeId ?? "—"}</bdi></td>
              <td className="text-end" dir="ltr">{money(l.gross, run.currency)}</td>
              <td className="text-end" dir="ltr">{money(l.deductions, run.currency)}</td>
              <td className={`text-end ${l.net < 0 ? "text-status-error-text" : ""}`} dir="ltr">{money(l.net, run.currency)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="flex flex-wrap gap-2">
          {run.status === "DRAFT" ? <Button type="button" disabled={busy || review.length > 0} onClick={() => void post({ action: "approve", id: run.id }, "Run approved. Export it to the provider next.")}>{ui("Approve run")}</Button> : null}
          {run.status === "APPROVED" || submission ? <Button type="button" variant={submission ? "secondary" : "default"} disabled={busy} onClick={() => void post({ action: "submit", id: run.id }, submission ? RETRIED : EXPORTED)}>{submission ? ui("Retry export") : ui("Export to provider")}</Button> : null}
          {submission ? <a className="text-sm underline" download={`${submission.reference}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent((submission as Submission & { file?: string }).file ?? "")}`}>{ui("Download export file")}</a> : null}
        </div>
        {run.status === "EXPORTED" || submission ? <p className="text-xs font-semibold text-ink-subtle">{ui("Exported does not mean paid.")}</p> : null}
        {submission ? (
          <div className="space-y-2 rounded-lg bg-surface-muted p-2 text-sm">
            <p><span dir="ltr"><bdi>{submission.reference}</bdi></span> · {ui("Submitted {0}", [dateTime(submission.submittedAt)])} · {ui("Attempts: {0}", [submission.attempts])} · {ui("Accepted: {0}", [accepted])} · {ui("Rejected: {0}", [rejected])} · {ui(STATUS[submission.status] ?? submission.status)}</p>
            {submission.rows.some((r) => r.outcome === "PENDING") ? (
              <form className="space-y-2" onSubmit={(ev) => { ev.preventDefault(); const rows = submission.rows.filter((r) => r.outcome === "PENDING" && outcomes[r.providerEmployeeId]?.outcome).map((r) => ({ providerEmployeeId: r.providerEmployeeId, outcome: outcomes[r.providerEmployeeId].outcome, ...(outcomes[r.providerEmployeeId].reason ? { reason: outcomes[r.providerEmployeeId].reason } : {}) })); void post({ action: "result", id: submission.id, data: { rows } }, "Provider result recorded."); }}>
                <h4 className="font-semibold">{ui("Record provider result")}</h4>
                {submission.rows.filter((r) => r.outcome === "PENDING").map((r) => (
                  <div key={r.providerEmployeeId} className="flex flex-wrap items-end gap-2">
                    <span className="w-24" dir="ltr"><bdi>{r.providerEmployeeId}</bdi></span>
                    <FormField name={`out-${submission.id}-${r.providerEmployeeId}`} label={ui("Outcome")} className="w-40"><Select value={outcomes[r.providerEmployeeId]?.outcome ?? ""} onChange={(ev) => setOutcomes((m) => ({ ...m, [r.providerEmployeeId]: { reason: m[r.providerEmployeeId]?.reason ?? "", outcome: ev.target.value } }))}><option value="">{ui("Not reported yet")}</option><option value="ACCEPTED">{ui("Accepted")}</option><option value="REJECTED">{ui("Rejected")}</option></Select></FormField>
                    {outcomes[r.providerEmployeeId]?.outcome === "REJECTED" ? <FormField name={`why-${submission.id}-${r.providerEmployeeId}`} label={ui("Provider's reason")} className="w-56"><Input value={outcomes[r.providerEmployeeId]?.reason ?? ""} onChange={(ev) => setOutcomes((m) => ({ ...m, [r.providerEmployeeId]: { outcome: "REJECTED", reason: ev.target.value } }))} /></FormField> : null}
                  </div>
                ))}
                <Button type="submit" size="sm" disabled={busy}>{ui("Save provider result")}</Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const queue = data?.corrections ?? [];
  return (
    <section aria-labelledby="payroll-runs" className="sk-panel space-y-4 p-4">
      <h2 id="payroll-runs" className="text-lg font-bold">{ui("Payroll runs and provider export")}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <FormField name="pay-month" label={ui("Month")} className="w-24"><Input type="number" min={1} max={12} dir="ltr" value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) || p.month }))} /></FormField>
        <FormField name="pay-year" label={ui("Year")} className="w-28"><Input type="number" min={2000} max={2100} dir="ltr" value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) || p.year }))} /></FormField>
        {data ? <Button type="button" disabled={busy || !data.policy} onClick={() => void post({ action: "prepare", data: period }, "Draft calculated. Approval is a separate step.")}>{current ? ui("Prepare new version") : ui("Prepare run")}</Button> : null}
      </div>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
        {notice ? <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p> : null}
      </div>
      {!data ? (error ? null : <p role="status" className="text-sm text-ink-subtle">{ui("Loading payroll…")}</p>) : (
        <>
          {data.policy ? (
            <div className="rounded-xl border border-border p-3 text-sm">
              <p><strong><bdi>{data.policy.entityName}</bdi></strong> · <span dir="ltr">{data.policy.currency}</span> · {ui("Policy {0} (version {1}) from {2}", [data.policy.packageLabel, data.policy.version, date(data.policy.effectiveFrom)])} · {ui("Provider")}: {data.providers[0] ? <bdi>{data.providers[0].name} v{data.providers[0].version}</bdi> : ui("not configured")}</p>
              <p className="text-ink-subtle">{ui("Proration")}: {ui(BASIS[data.policy.prorationBasis])} · {ui("Leave day")}: {ui(BASIS[data.policy.leaveDivisor])} · <bdi>{data.policy.scopeNote}</bdi></p>
              <p className="text-xs text-ink-subtle">{ui("A school-configured local rule package, not certified statutory payroll.")}</p>
            </div>
          ) : <p role="status" className="rounded-xl border border-border p-3 text-sm">{ui("No payroll policy is in effect for this period. There is no default rule package; a school leader configures one below.")}</p>}
          {!current && data.policy ? <p className="text-sm text-ink-subtle">{ui("{0} staff with a salary. Prepare a run to calculate this period.", [data.staffCount])}</p> : null}
          {current ? runCard(current, "Payroll run") : null}
          {queue.length ? (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              <h3 className="font-semibold">{ui("Correction queue")}</h3>
              <p className="text-ink-subtle">{ui("Provider rejected {0} row(s). Accepted rows will not be resubmitted.", [queue.length])}</p>
              <ul>{queue.map((r) => <li key={`${r.submissionId}-${r.userId}`}><bdi dir="ltr">{r.providerEmployeeId}</bdi> · <bdi>{r.reason}</bdi> · <span dir="ltr">{r.reference}</span></li>)}</ul>
              {queue.some((r) => !r.correctionStarted) ? <Button type="button" disabled={busy} onClick={() => void post({ action: "correct", id: queue.find((r) => !r.correctionStarted)!.submissionId }, "Correction version created. It needs approval again.")}>{ui("Create correction version")}</Button> : null}
            </div>
          ) : null}
          {correction ? runCard(correction, "Correction") : null}
          {data.versions.length > 1 ? <p className="text-xs text-ink-subtle">{ui("Version history")}: {data.versions.map((v) => `v${v.version} ${ui(STATUS[v.status] ?? v.status)}`).join(" · ")}</p> : null}
          <details className="rounded-xl border border-border p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{ui("Policy and provider settings")}</summary>
            <form className="mt-2 grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "policy", data: { ...policyForm, leaveYearStartMonth: Number(policyForm.leaveYearStartMonth), requireSeparation: true } }, "Policy version saved."); }}>
              <h4 className="font-semibold md:col-span-3">{ui("New policy version")}</h4>
              <FormField name="pol-entity" label={ui("Employing entity")}><Input value={policyForm.entityName} onChange={(e) => setPolicyForm((f) => ({ ...f, entityName: e.target.value }))} /></FormField>
              <FormField name="pol-currency" label={ui("Currency")}><Input dir="ltr" value={policyForm.currency} onChange={(e) => setPolicyForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} /></FormField>
              <FormField name="pol-from" label={ui("Effective from")}><Input type="date" dir="ltr" value={policyForm.effectiveFrom} onChange={(e) => setPolicyForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></FormField>
              <FormField name="pol-label" label={ui("Rule package name")}><Input value={policyForm.packageLabel} onChange={(e) => setPolicyForm((f) => ({ ...f, packageLabel: e.target.value }))} /></FormField>
              <FormField name="pol-prorate" label={ui("Proration")}><Select value={policyForm.prorationBasis} onChange={(e) => setPolicyForm((f) => ({ ...f, prorationBasis: e.target.value }))}><option value="CALENDAR_DAYS">{ui("calendar days")}</option><option value="FIXED_30">{ui("30-day month")}</option></Select></FormField>
              <FormField name="pol-leave" label={ui("Leave day")}><Select value={policyForm.leaveDivisor} onChange={(e) => setPolicyForm((f) => ({ ...f, leaveDivisor: e.target.value }))}><option value="CALENDAR_DAYS">{ui("calendar days")}</option><option value="FIXED_30">{ui("30-day month")}</option></Select></FormField>
              <FormField name="pol-year" label={ui("Leave year starts (month)")}><Input type="number" min={1} max={12} dir="ltr" value={policyForm.leaveYearStartMonth} onChange={(e) => setPolicyForm((f) => ({ ...f, leaveYearStartMonth: e.target.value }))} /></FormField>
              <FormField name="pol-round" label={ui("Rounding")}><Select value={policyForm.rounding} onChange={(e) => setPolicyForm((f) => ({ ...f, rounding: e.target.value }))}><option value="HALF_UP">{ui("Nearest")}</option><option value="DOWN">{ui("Down")}</option></Select></FormField>
              <FormField name="pol-scope" label={ui("Scope and validation note")} className="md:col-span-3"><Input value={policyForm.scopeNote} onChange={(e) => setPolicyForm((f) => ({ ...f, scopeNote: e.target.value }))} /></FormField>
              <Button type="submit" disabled={busy}>{ui("Save policy version")}</Button>
            </form>
            <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "provider", data: { code: providerForm.code, name: providerForm.name, currencies: providerForm.currencies.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean), columns: [{ header: "EmployeeId", field: "providerEmployeeId" }, { header: "Name", field: "name" }, { header: "Gross", field: "gross" }, { header: "Deductions", field: "deductions" }, { header: "Net", field: "net" }, { header: "Currency", field: "currency" }, { header: "Period", field: "period" }, { header: "Reference", field: "reference" }] } }, "Provider mapping saved as a new version."); }}>
              <h4 className="font-semibold md:col-span-3">{ui("Provider export mapping")}</h4>
              <FormField name="prov-code" label={ui("Provider code")}><Input dir="ltr" value={providerForm.code} onChange={(e) => setProviderForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /></FormField>
              <FormField name="prov-name" label={ui("Provider name")}><Input value={providerForm.name} onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
              <FormField name="prov-ccy" label={ui("Accepted currencies")}><Input dir="ltr" value={providerForm.currencies} onChange={(e) => setProviderForm((f) => ({ ...f, currencies: e.target.value }))} /></FormField>
              <Button type="submit" disabled={busy}>{ui("Save provider mapping")}</Button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
