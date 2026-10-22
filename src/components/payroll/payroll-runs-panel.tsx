"use client";

import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";
import { getFinancialLocale } from "@/app/actions/locale";
import { exportCSV, paisaToRupees, usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";

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
type Overview = { policy: Policy | null; providers: { id: string; code: string; name: string; version: number; currencies: string[] }[]; versions: Version[]; submissions: Submission[]; corrections: (Row & { submissionId: string; reference: string; correctionStarted: boolean })[]; staffCount: number; canPrepare?: boolean; canApprove?: boolean };
export type PayrollMode = "prepare" | "approve" | "both";

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

/**
 * Payroll runs (role-ux G26, M42, M76). `mode` decides which seat this screen serves:
 * - "prepare" — the finance desk calculates, exports and records provider results; approval, the policy and the
 *   provider mapping belong to the campus admin and are not offered here.
 * - "approve" — the campus admin approves runs and owns the policy and the provider mapping.
 * - "both" — a campus admin who also holds the finance desk (no accountant on the campus).
 * The server's own flags (canPrepare / canApprove) can only narrow what a mode shows.
 */
export function PayrollRunsPanel({ mode = "prepare", command, hideHeader = false }: { mode?: PayrollMode; command?: PanelCommand | null; hideHeader?: boolean }) {
  const ui = useUiText();
  const { money, date, dateTime } = useLocaleFormat();
  const { language } = useLocale();
  const monthLabel = (month: number, year: number, width: "long" | "short" = "long") =>
    new Intl.DateTimeFormat(language, { month: width, ...(width === "long" ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  const [confirmApprove, setConfirmApprove] = useState<Version | null>(null);
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, { outcome: string; reason: string }>>({});
  const [policyForm, setPolicyForm] = useState({ entityName: "", currency: "", effectiveFrom: "", packageLabel: "", scopeNote: "", prorationBasis: "CALENDAR_DAYS", leaveDivisor: "CALENDAR_DAYS", leaveYearStartMonth: "9", rounding: "HALF_UP" });
  const [providerForm, setProviderForm] = useState({ code: "", name: "", currencies: "" });
  // Currency defaults come from the school's locale package, never a hard-coded code (role-ux R7/F23).
  useEffect(() => {
    void getFinancialLocale().then((locale) => {
      setPolicyForm((f) => (f.currency ? f : { ...f, currency: locale.currency }));
      setProviderForm((f) => (f.currencies ? f : { ...f, currencies: locale.currency }));
    }).catch(() => undefined);
  }, []);

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

  const preparer = mode !== "approve" && data?.canPrepare !== false;
  const approver = mode !== "prepare" && data?.canApprove !== false;
  // Policy and provider settings belong to whoever also prepares runs (no accountant on the campus); an approve-only
  // seat sees them only while no policy exists yet, since nobody else can set one.
  const showSettings = approver && (mode === "both" || !data?.policy);
  const prepare = () => {
    if (!preparer) return;
    // Without a policy there is nothing to calculate; say who sets it rather than doing nothing.
    if (!data?.policy) { setNotice(null); setError(ui(approver ? "No payroll policy is in effect for this period. There is no default rule package; configure one under Policy and provider settings." : "No payroll policy is in effect for this period. Your campus admin sets the payroll policy before a run can be prepared.")); return; }
    void post({ action: "prepare", data: period }, "Draft calculated. Approval is a separate step.");
  };
  const current = data?.versions.find((v) => v.status !== "SUPERSEDED" && !v.correctionOfId) ?? null;
  // "Export" (PageHeader secondary, role-ux §4.4): this period's run as a spreadsheet — every employee with gross,
  // deductions and net — for review or filing. Sending to the provider stays the run's own "Export to provider".
  const exportRun = () => {
    const run = current;
    if (!run || !run.lines.length) { setError(null); setNotice(ui("Nothing to export yet: prepare this period's run first.")); return; }
    exportCSV(run.lines.map((line) => ({
      [ui("Employee")]: line.name,
      [ui("Provider id")]: line.providerEmployeeId ?? "",
      [ui("Days employed")]: `${line.employedDays}/${line.periodDays}`,
      [ui("Gross")]: paisaToRupees(line.gross, run.currency),
      [ui("Deductions")]: paisaToRupees(line.deductions, run.currency),
      [ui("Net")]: paisaToRupees(line.net, run.currency),
      [ui("Currency")]: run.currency,
      [ui("Status")]: ui(STATUS[run.status] ?? run.status),
    })), `payroll-${period.year}-${String(period.month).padStart(2, "0")}-v${run.version}`);
  };
  usePanelCommand(command, { "prepare-run": prepare, export: exportRun }, data !== null);

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
                {preparer && e.code === "MISSING_PROVIDER_ID" && e.userId && data?.providers[0] ? (
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
          {run.status === "DRAFT" && approver ? <Button type="button" disabled={busy || review.length > 0} onClick={() => setConfirmApprove(run)}>{ui("Approve run")}</Button> : null}
          {run.status === "DRAFT" && !approver ? <p className="text-sm text-ink-muted">{ui("Waiting for your campus admin to approve this run.")}</p> : null}
          {preparer && (run.status === "APPROVED" || submission) ? <Button type="button" variant={submission ? "outline" : "default"} disabled={busy} onClick={() => void post({ action: "submit", id: run.id }, submission ? RETRIED : EXPORTED)}>{submission ? ui("Retry export") : ui("Export to provider")}</Button> : null}
          {submission ? <a className="text-sm underline" download={`${submission.reference}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent((submission as Submission & { file?: string }).file ?? "")}`}>{ui("Download export file")}</a> : null}
        </div>
        {run.status === "EXPORTED" || submission ? <p className="text-xs font-semibold text-ink-subtle">{ui("Exported does not mean paid.")}</p> : null}
        {submission ? (
          <div className="space-y-2 rounded-lg bg-surface-subtle p-2 text-sm">
            <p><span dir="ltr"><bdi>{submission.reference}</bdi></span> · {ui("Submitted {0}", [dateTime(submission.submittedAt)])} · {ui("Attempts: {0}", [submission.attempts])} · {ui("Accepted: {0}", [accepted])} · {ui("Rejected: {0}", [rejected])} · {ui(STATUS[submission.status] ?? submission.status)}</p>
            {preparer && submission.rows.some((r) => r.outcome === "PENDING") ? (
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
    <section aria-label={hideHeader ? ui("Payroll runs") : undefined} aria-labelledby={hideHeader ? undefined : "payroll-runs"} className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-4"} data-payroll-runs={mode}>
      <ConfirmAction
        open={Boolean(confirmApprove)}
        busy={busy}
        tone="primary"
        title={ui("Approve this payroll run?")}
        description={confirmApprove ? ui("{0} employees, net total {1}. The finance desk can then export it to the provider. If any input changes, this approval lapses and a new version needs approval.", [confirmApprove.lines.length, money(confirmApprove.totalNet, confirmApprove.currency)]) : ""}
        confirmLabel={ui("Approve run")}
        cancelLabel={ui("Keep editing")}
        // A money decision: the typed reason is kept in the approval's audit row (role-ux R3, §4.5.5).
        requireReason={{ label: ui("Reason for approving this run"), minLength: 10, placeholder: ui("For example: checked against attendance, leave and salary records.") }}
        onConfirm={(reason?: string) => { const run = confirmApprove; setConfirmApprove(null); if (run) void post({ action: "approve", id: run.id, reason }, "Run approved. The finance desk exports it to the provider next."); }}
        onCancel={() => setConfirmApprove(null)}
      />
      {hideHeader ? null : <h2 id="payroll-runs" className="text-lg font-bold">{ui("Payroll runs and provider export")}</h2>}
      <div className="flex flex-wrap items-end gap-2">
        <FormField name="pay-month" label={ui("Month")} className="w-40"><Select value={String(period.month)} onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) || p.month }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthLabel(i + 1, period.year, "long").replace(String(period.year), "").trim()}</option>)}</Select></FormField>
        <FormField name="pay-year" label={ui("Year")} className="w-28"><Input type="number" min={2000} max={2100} dir="ltr" value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) || p.year }))} /></FormField>
        {data && preparer && !hideHeader ? <Button type="button" variant="default" disabled={busy || !data.policy} onClick={prepare}>{current ? ui("Prepare new version") : ui("Prepare run")}</Button> : null}
        {data && preparer && !data.policy ? <p className="pb-2 text-xs text-ink-muted">{ui("Prepare run is unavailable until a payroll policy is saved.")}</p> : null}
      </div>
      <div className="space-y-2">
        {error && data ? <Alert tone="danger" compact>{error}</Alert> : null}
        {notice ? <Alert tone="success" compact>{notice}</Alert> : null}
      </div>
      {!data ? (error ? <ErrorState description={error} onRetry={() => void load()} retryLabel={ui("Try again")} /> : <SkeletonTable rows={4} columns={5} label={ui("Loading payroll…")} />) : (
        <>
          {data.policy && !showSettings ? null : data.policy ? (
            <div className="rounded-xl border border-border p-3 text-sm">
              <p><strong><bdi>{data.policy.entityName}</bdi></strong> · <span dir="ltr">{data.policy.currency}</span> · {ui("Policy {0} (version {1}) from {2}", [data.policy.packageLabel, data.policy.version, date(data.policy.effectiveFrom)])} · {ui("Provider")}: {data.providers[0] ? <bdi>{data.providers[0].name} v{data.providers[0].version}</bdi> : ui("not configured")}</p>
              <p className="text-ink-subtle">{ui("Proration")}: {ui(BASIS[data.policy.prorationBasis])} · {ui("Leave day")}: {ui(BASIS[data.policy.leaveDivisor])} · <bdi>{data.policy.scopeNote}</bdi></p>
              {showSettings ? <p className="text-xs text-ink-subtle">{ui("A school-configured local rule package, not certified statutory payroll.")}</p> : null}
            </div>
          ) : <p role="status" className="rounded-xl border border-border p-3 text-sm">{approver ? ui("No payroll policy is in effect for this period. There is no default rule package; configure one under Policy and provider settings.") : ui("No payroll policy is in effect for this period. Your campus admin sets the payroll policy before a run can be prepared.")}</p>}
          {!current && data.policy ? (preparer
            ? <p className="text-sm text-ink-subtle">{ui("{0} staff with a salary. Prepare a run to calculate this period.", [data.staffCount])}</p>
            : <EmptyState icon={Wallet} title={ui("Nothing to approve for {0}", [monthLabel(period.month, period.year)])} description={ui("Your accountant prepares the payroll run.")} />) : null}
          {current ? runCard(current, "Payroll run") : null}
          {queue.length ? (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              <h3 className="font-semibold">{ui("Correction queue")}</h3>
              <p className="text-ink-subtle">{ui("Provider rejected {0} row(s). Accepted rows will not be resubmitted.", [queue.length])}</p>
              <ul>{queue.map((r) => <li key={`${r.submissionId}-${r.userId}`}><bdi dir="ltr">{r.providerEmployeeId}</bdi> · <bdi>{r.reason}</bdi> · <span dir="ltr">{r.reference}</span></li>)}</ul>
              {preparer && queue.some((r) => !r.correctionStarted) ? <Button type="button" disabled={busy} onClick={() => void post({ action: "correct", id: queue.find((r) => !r.correctionStarted)!.submissionId }, "Correction version created. It needs approval again.")}>{ui("Create correction version")}</Button> : null}
            </div>
          ) : null}
          {correction ? runCard(correction, "Correction") : null}
          {data.versions.length > 1 ? <p className="text-xs text-ink-subtle">{ui("Version history")}: {data.versions.map((v) => `v${v.version} ${ui(STATUS[v.status] ?? v.status)}`).join(" · ")}</p> : null}
          {showSettings ? <section aria-labelledby="payroll-settings" className="sk-panel space-y-2 p-4 text-sm">
            <h3 id="payroll-settings" className="text-base font-bold text-ink-strong">{ui("Policy and provider settings")}</h3>
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
          </section> : null}
        </>
      )}
    </section>
  );
}
