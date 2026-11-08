"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SkeletonCards } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilePen, FileText, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { exportCSV, usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";

// SKO-444: invoice tax packages. Each package states its version, verified scope and limitations — it is a
// demonstration configuration, never a compliance badge. Activation lists every unresolved requirement and is
// signed off by the institution authority (role-ux G27: the group admin, or the school admin of a single school;
// the preparer never signs off their own draft unless they are the only authority — SD3, with a typed reason).
// Issued documents keep their snapshot; electronic submission states are shown as queued, accepted, rejected or
// corrected, with one document identity throughout.

type Ui = ReturnType<typeof useUiText>;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw Object.assign(new Error(json.error || "The change was not saved."), { status: response.status });
  return json.data;
}
type Version = { version: number; country: string; currencies: string[]; standardRatePercent: number; rounding: string; electronic: { adapter: string | null; scope: string }; ruleReviewDate: string | null; verifiedScope: string; limitations: string[]; requiredFields: { key: string; label: string; hint?: string }[] };
type Pkg = { code: string; name: string; versions: Version[] };
type Activation = { id: string; packageCode: string; packageVersion: number; campusIds: string[]; legalName: string; taxId: string | null; exemptFeeCodes: string[]; currency: string; effectiveFrom: string | null; ownerId: string | null; evidenceReviewer: string | null; evidenceReference: string | null; evidenceReviewedAt: string | null; status: string; preparedById: string; approvedById: string | null; lastRun: { passed: boolean; createdAt: string } | null; blockers: string[]; selfApproved?: boolean; signOffRequestedAt?: string | null };
type Overview = { packages: Pkg[]; campuses: { id: string; name: string; country: string; limitation: string | null }[]; activations: Activation[]; feeTypes: { code: string; name: string }[]; staff: { id: string; fullName: string }[]; canManage: boolean; canApprove?: boolean; soleApprover?: boolean; userId: string };
type Doc = { id: string; documentNumber: string; revision: number; packageCode: string; packageVersion: number; currency: string; taxAmount: number; totalAmount: number; issuedAt: string; submissionStatus: string; externalId: string | null; lastError: string | null; snapshot: Snapshot; attempts: { attempt: number; revision: number; outcome: string; detail: string | null; createdAt: string }[] };
type Snapshot = { package: { name: string; version: number; verifiedScope: string; limitations: string[]; standardRatePercent: number; rounding: string; invoiceLanguage: string }; seller: { legalName: string; taxId: string | null; campus: string }; buyer: { name: string }; invoice: { number: string | null; date: string }; currency: string; lines: { code: string; name: string; amount: number; discount: number; taxable: number; ratePercent: number; category: string; tax: number }[]; subtotal: number; discount: number; tax: number; total: number; correction?: { revision: number; buyerName: string; note: string } };
const statusLabel = (ui: Ui, s: string) => ({ DRAFT: ui("Draft"), SCHEDULED: ui("Scheduled"), ACTIVE: ui("Active"), SUPERSEDED: ui("Superseded"), WITHDRAWN: ui("Withdrawn"), NONE: ui("Not submitted"), QUEUED: ui("Queued"), ACCEPTED: ui("Accepted"), REJECTED: ui("Rejected"), CORRECTED: ui("Corrected, not yet resubmitted"), NOT_SUPPORTED: ui("No electronic submission") } as Record<string, string>)[s] ?? s;
const DEFAULT_FIXTURES = `[{"name":"Tuition exempt, transport taxable","lines":[{"code":"TUITION","amount":100000},{"code":"TRANSPORT","amount":20000}],"discount":0,"expected":{"tax":3000,"total":123000}}]`;

/** An accessible HTML rendering of an issued document, straight from its snapshot. */
export function TaxDocumentView({ doc }: { doc: Doc }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  const s = doc.snapshot, ar = s.package.invoiceLanguage !== "en" && ui("Tax invoice") === "Tax invoice";
  const amount = (n: number) => money(n, s.currency);
  // The document follows the theme with a token pair (R10): card surface, strongest ink — legible in light and dark.
  return <article className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm text-ink-strong" aria-label={ui("Tax invoice {0}", [doc.documentNumber])} data-tax-document={doc.documentNumber}>
    <header className="flex flex-wrap justify-between gap-2"><div><h3 className="text-base font-bold">{ui("Tax invoice")}{ar ? <span lang="ar" dir="rtl"> · فاتورة ضريبية</span> : null}</h3><p><bdi dir="ltr">{doc.documentNumber}</bdi>{doc.revision > 1 ? <> · {ui("Revision {0}", [String(doc.revision)])}</> : null} · <bdi>{date(s.invoice.date)}</bdi></p></div><div className="text-end"><p className="font-bold"><bdi dir="auto">{s.seller.legalName}</bdi></p>{s.seller.taxId ? <p>{ui("Tax number")}: <bdi dir="ltr">{s.seller.taxId}</bdi></p> : null}<p><bdi>{s.seller.campus}</bdi></p></div></header>
    <p>{ui("Billed to")}: <bdi dir="auto">{s.correction?.buyerName ?? s.buyer.name}</bdi></p>
    <table className="w-full text-start"><caption className="sr-only">{ui("Invoice lines")}</caption><thead><tr className="border-b"><th scope="col" className="text-start">{ui("Item")}</th><th scope="col" className="text-end">{ui("Amount")}</th><th scope="col" className="text-end">{ui("Discount")}</th><th scope="col" className="text-end">{ui("Rate")}</th><th scope="col" className="text-end">{ui("Tax")}</th></tr></thead>
      <tbody>{s.lines.map((l, i) => <tr key={i} className="border-b" data-tax-line={l.code}><td><bdi dir="auto">{l.name}</bdi>{l.category === "EXEMPT" ? <> · {ui("Exempt")}</> : null}</td><td className="text-end"><bdi>{amount(l.amount)}</bdi></td><td className="text-end"><bdi>{amount(l.discount)}</bdi></td><td className="text-end"><bdi dir="ltr">{l.ratePercent}%</bdi></td><td className="text-end"><bdi>{s.package.rounding === "LINE_HALF_UP" ? amount(l.tax) : "—"}</bdi></td></tr>)}</tbody></table>
    <dl className="ms-auto grid w-full max-w-xs grid-cols-2 gap-1"><dt>{ui("Subtotal")}</dt><dd className="text-end"><bdi>{amount(s.subtotal)}</bdi></dd><dt>{ui("Discount")}</dt><dd className="text-end"><bdi>{amount(s.discount)}</bdi></dd><dt>{ui("Tax")}</dt><dd className="text-end" data-tax-total><bdi>{amount(s.tax)}</bdi></dd><dt className="font-bold">{ui("Total")}</dt><dd className="text-end font-bold" data-doc-total><bdi>{amount(s.total)}</bdi></dd></dl>
    <footer className="text-xs text-ink-muted"><p>{ui("Issued under {0} v{1}. {2}", [s.package.name, String(s.package.version), s.package.verifiedScope])}</p><p>{ui("Demonstration configuration, not a compliance claim.")}</p></footer>
  </article>;
}

/**
 * Invoice tax packages (role-ux §10.11). `mode="draft"` is the finance desk: prepare, run fixtures, submit
 * documents; sign-off is not offered. `mode="approve"` is the institution authority's Approvals tab: review and
 * sign off drafts (SD3 reason when signing off one's own draft as the only authority); no drafting.
 * `hideHeader` hands the title to the console's PageHeader; `command` "new-package" starts a new draft.
 */
export function TaxPackages({ mode = "draft", hideHeader = false, command }: { mode?: "draft" | "approve"; hideHeader?: boolean; command?: PanelCommand | null }) {
  const ui = useUiText();
  const { date, dateTime, money } = useLocaleFormat();
  const [signing, setSigning] = useState<Activation | null>(null);
  const [data, setData] = useState<Overview | null>(null), [docs, setDocs] = useState<Doc[]>([]), [denied, setDenied] = useState(false), [loadFailed, setLoadFailed] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string | string[]>>({ packageCode: "SA-DEMO", packageVersion: "1", campusIds: [], legalName: "", taxId: "", exemptFeeCodes: [], effectiveFrom: "", ownerId: "", evidenceReviewer: "", evidenceReference: "", evidenceReviewedAt: "" });
  const [editing, setEditing] = useState<string | null>(null), [fixtures, setFixtures] = useState(DEFAULT_FIXTURES), [runResult, setRunResult] = useState<{ passed: boolean; results: { name: string; passed: boolean; expected?: { tax: number; total: number }; got?: { tax: number; total: number }; error?: string }[] } | null>(null);
  const [viewDoc, setViewDoc] = useState<Doc | null>(null), [fix, setFix] = useState<{ id: string; buyerName: string; note: string } | null>(null);
  const load = useCallback(async () => { try { setData(await call("/api/tax?view=overview")); setDocs(await call("/api/tax?view=documents")); setDenied(false); setLoadFailed(false); } catch (e) { if ((e as { status?: number }).status === 403) setDenied(true); else setLoadFailed(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  // "Export" (PageHeader secondary, §4.4b): every activation with its scope, identity, dates and decision.
  const exportActivations = () => {
    if (!data?.activations.length) { toast.info(ui("Nothing to export yet.")); return; }
    exportCSV(data.activations.map(a => ({
      [ui("Package")]: `${a.packageCode} v${a.packageVersion}`,
      [ui("Status")]: statusLabel(ui, a.status),
      [ui("Applies to")]: a.campusIds.map(id => data.campuses.find(c => c.id === id)?.name ?? "").join("; "),
      [ui("Legal name")]: a.legalName,
      [ui("Tax number")]: a.taxId ?? "",
      [ui("Currency")]: a.currency,
      [ui("Effective from")]: a.effectiveFrom ? a.effectiveFrom.slice(0, 10) : "",
      [ui("Validation requirements open")]: a.status === "DRAFT" ? a.blockers.length : 0,
      [ui("Self-approved")]: a.selfApproved ? ui("Yes") : "",
    })), "tax-packages");
  };
  usePanelCommand(command, { "new-package": () => { setEditing(null); setRunResult(null); requestAnimationFrame(() => document.querySelector("[data-tax-draft]")?.scrollIntoView({ block: "start", behavior: "smooth" })); }, export: exportActivations }, data !== null);
  if (denied) return <div data-tax-denied><Alert tone="warning" live="off">{ui(mode === "approve" ? "Only the institution administrator signs off tax packages." : "Only the finance desk prepares tax packages.")}</Alert></div>;
  if (loadFailed && !data) return <ErrorState title={ui("Could not load tax packages.")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />;
  if (!data) return <div className="space-y-3" aria-busy="true"><p className="text-sm text-ink-muted">{ui("Validate configuration and sample documents before activation.")}</p><SkeletonCards /></div>;
  const pkg = data.packages.find(p => p.code === form.packageCode), ver = pkg?.versions.find(v => String(v.version) === form.packageVersion);
  const setF = (k: string, v: string | string[]) => setForm({ ...form, [k]: v });
  const startEdit = (a: Activation) => { setEditing(a.id); setRunResult(null); setForm({ packageCode: a.packageCode, packageVersion: String(a.packageVersion), campusIds: a.campusIds, legalName: a.legalName, taxId: a.taxId ?? "", exemptFeeCodes: a.exemptFeeCodes, effectiveFrom: a.effectiveFrom ? a.effectiveFrom.slice(0, 10) : "", ownerId: a.ownerId ?? "", evidenceReviewer: a.evidenceReviewer ?? "", evidenceReference: a.evidenceReference ?? "", evidenceReviewedAt: a.evidenceReviewedAt ? a.evidenceReviewedAt.slice(0, 10) : "" }); };
  const drafting = mode === "draft" && data.canManage;
  const approving = mode === "approve" && data.canApprove === true;
  const payload = () => ({ ...form, packageVersion: Number(form.packageVersion), effectiveFrom: form.effectiveFrom ? new Date(`${form.effectiveFrom}T00:00:00Z`).toISOString() : null, evidenceReviewedAt: form.evidenceReviewedAt ? new Date(`${form.evidenceReviewedAt}T00:00:00Z`).toISOString() : null, ...(editing ? { id: editing } : {}) });
  return <div className="min-w-0 space-y-6" data-tax-packages>
    <ConfirmAction
      open={Boolean(signing)}
      busy={busy}
      tone={signing && signing.preparedById === data.userId ? "warning" : "primary"}
      title={ui("Sign off this tax package?")}
      description={signing ? ui("{0} v{1} applies to invoices issued from {2}. Invoices issued before that date stay unchanged, and an approved package cannot be edited.", [signing.packageCode, String(signing.packageVersion), signing.effectiveFrom ? date(signing.effectiveFrom) : ui("the effective date")]) : ""}
      confirmLabel={ui("Sign off")}
      cancelLabel={ui("Keep editing")}
      requireReason={signing && signing.preparedById === data.userId ? { label: ui("Why are you signing off your own draft?"), minLength: 10, placeholder: ui("For example: I am the only administrator who can sign this off.") } : undefined}
      onConfirm={(reason?: string) => { const a = signing; if (a) return run(() => call("/api/tax", "POST", { action: "approve", id: a.id, ...(reason ? { reason } : {}) }), "Reviewed package scheduled for the chosen effective date.").then(saved => { if (saved) setSigning(null); }); }}
      onCancel={() => setSigning(null)}
    />
    {hideHeader ? null : <header><h2 className="text-xl font-bold tracking-tight text-ink-strong">{ui("Invoice tax packages")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("New rules apply from the selected date. Earlier invoices remain unchanged.")}</p></header>}
    <section className="space-y-2" data-tax-campuses><h2 className="text-lg font-bold text-ink-strong">{ui("Campuses")}</h2><ul className="grid gap-2 sm:grid-cols-2">{data.campuses.map(c => { const live = data.activations.find(a => a.campusIds.includes(c.id) && a.status === "ACTIVE"); return <li key={c.id} className="sk-panel p-3 text-sm" data-tax-campus={c.name}><p className="font-bold"><bdi>{c.name}</bdi> · <bdi dir="ltr">{c.country}</bdi></p>{c.limitation ? <p className="text-status-warning-text" data-tax-limitation>{ui(c.limitation)}</p> : live ? <p>{ui("Active: {0} v{1}", [live.packageCode, String(live.packageVersion)])}</p> : <p className="text-ink-muted">{ui("No verified package is active for this campus.")}</p>}</li>; })}</ul></section>
    <section className="space-y-2" data-tax-catalog><h2 className="text-lg font-bold text-ink-strong">{ui("Package catalog")}</h2>{data.packages.map(p => <details key={p.code} className="sk-panel p-3 text-sm" data-tax-package={p.code}><summary className="cursor-pointer font-bold"><bdi>{p.name}</bdi> · <bdi dir="ltr">{p.code}</bdi></summary>{p.versions.map(v => <div key={v.version} className="mt-2 rounded-xl border p-2"><p className="font-bold"><bdi dir="ltr">v{v.version}</bdi> · <bdi dir="ltr">{v.country}</bdi> · <bdi dir="ltr">{v.currencies.join(", ")}</bdi> · <bdi dir="ltr">{v.standardRatePercent}%</bdi> · {v.rounding === "LINE_HALF_UP" ? ui("Rounded per line") : ui("Rounded on the total")}</p><p>{ui(v.verifiedScope)}</p><p className="text-xs text-ink-muted">{v.ruleReviewDate ? ui("Rules last reviewed by the package maintainer on {0}.", [date(v.ruleReviewDate)]) : ui("Rules have not been reviewed by the package maintainer.")} {ui(v.electronic.scope)}</p><ul className="list-disc ps-5 text-xs">{v.limitations.map(l => <li key={l}>{ui(l)}</li>)}</ul></div>)}</details>)}</section>
    {drafting ? <section className="sk-panel space-y-3 p-4" data-tax-draft>
      <h2 className="text-lg font-bold text-ink-strong">{editing ? ui("Edit draft activation") : ui("New activation")}</h2>
      <p className="text-xs text-ink-muted">{ui("Demonstration configuration, not a compliance claim. Jurisdiction requirements need qualified review.")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <FormField name="tx-pkg" label={ui("Package")}><Select value={String(form.packageCode)} onChange={e => setForm({ ...form, packageCode: e.target.value, packageVersion: String(data.packages.find(p => p.code === e.target.value)?.versions.at(-1)?.version ?? 1) })} data-tx-package>{data.packages.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></FormField>
        <FormField name="tx-ver" label={ui("Version")}><Select value={String(form.packageVersion)} onChange={e => setF("packageVersion", e.target.value)} data-tx-version>{pkg?.versions.map(v => <option key={v.version} value={String(v.version)}>v{v.version}</option>)}</Select></FormField>
        <FormField name="tx-cur" label={ui("Currency")}><Input value={ver?.currencies.join(", ") ?? ""} readOnly dir="ltr" /></FormField>
        {ver?.requiredFields.map(f => <FormField key={f.key} name={`tx-${f.key}`} label={ui(f.label)} hint={f.hint ? ui(f.hint) : undefined}><Input value={String(form[f.key] ?? "")} onChange={e => setF(f.key, e.target.value)} dir={f.key === "taxId" ? "ltr" : "auto"} data-tx-field={f.key} /></FormField>)}
        <FormField name="tx-eff" label={ui("Effective from")}><Input type="date" value={String(form.effectiveFrom)} onChange={e => setF("effectiveFrom", e.target.value)} dir="ltr" data-tx-effective /></FormField>
        <FormField name="tx-owner" label={ui("Validation owner")}><Select value={String(form.ownerId)} onChange={e => setF("ownerId", e.target.value)} data-tx-owner><option value="">{ui("Choose")}</option>{data.staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></FormField>
        <FormField name="tx-rev" label={ui("Qualified reviewer")}><Input value={String(form.evidenceReviewer)} onChange={e => setF("evidenceReviewer", e.target.value)} dir="auto" data-tx-reviewer /></FormField>
        <FormField name="tx-ref" label={ui("Evidence reference")}><Input value={String(form.evidenceReference)} onChange={e => setF("evidenceReference", e.target.value)} dir="auto" data-tx-reference /></FormField>
        <FormField name="tx-rdate" label={ui("Reviewed on")}><Input type="date" value={String(form.evidenceReviewedAt)} onChange={e => setF("evidenceReviewedAt", e.target.value)} dir="ltr" data-tx-reviewed /></FormField>
      </div>
      <fieldset className="space-y-1"><legend className="text-sm font-bold">{ui("Applies to")}</legend><div className="flex flex-wrap gap-3">{data.campuses.map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={(form.campusIds as string[]).includes(c.id)} onChange={e => setF("campusIds", e.target.checked ? [...form.campusIds as string[], c.id] : (form.campusIds as string[]).filter(x => x !== c.id))} data-tx-campus={c.name} /><bdi>{c.name}</bdi> (<bdi dir="ltr">{c.country}</bdi>)</label>)}</div></fieldset>
      <fieldset className="space-y-1"><legend className="text-sm font-bold">{ui("Exempt or zero-rated fee types")}</legend><p className="text-xs text-ink-muted">{ui("Only after qualified advice for your school.")}</p><div className="flex flex-wrap gap-3">{[...new Set([...data.feeTypes.map(f => f.code), ...(form.exemptFeeCodes as string[])])].map(code => <label key={code} className="flex items-center gap-2 text-sm"><Checkbox checked={(form.exemptFeeCodes as string[]).includes(code)} onChange={e => setF("exemptFeeCodes", e.target.checked ? [...form.exemptFeeCodes as string[], code] : (form.exemptFeeCodes as string[]).filter(x => x !== code))} data-tx-exempt={code} /><bdi dir="ltr">{code}</bdi></label>)}</div><Input placeholder={ui("Add a fee type code")} aria-label={ui("Add a fee type code")} dir="ltr" onKeyDown={e => { if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) { setF("exemptFeeCodes", [...form.exemptFeeCodes as string[], (e.target as HTMLInputElement).value.trim()]); (e.target as HTMLInputElement).value = ""; } }} data-tx-exempt-add /></fieldset>
      <div className="flex flex-wrap gap-2"><Button loading={busy} disabled={busy} onClick={() => void run(async () => { const r = await call("/api/tax", "POST", { action: "draft", ...payload() }); setEditing(r.id); }, "Draft saved.")} data-tx-save>{ui("Save draft")}</Button>{editing ? <Button variant="secondary" onClick={() => { setEditing(null); setRunResult(null); }}>{ui("New activation")}</Button> : null}</div>
      {editing ? <div className="space-y-2 rounded-xl border p-3" data-tx-fixtures>
        <FormField name="tx-fx" label={ui("Accountant-approved fixtures (amounts in minor units)")}><Textarea value={fixtures} onChange={e => setFixtures(e.target.value)} rows={5} dir="ltr" className="font-mono text-xs" data-tx-fixture-input /></FormField>
        <Button variant="outline" disabled={busy} onClick={() => void run(async () => { let parsed; try { parsed = JSON.parse(fixtures); } catch { throw new Error("Fixtures must be valid JSON."); } setRunResult(await call("/api/tax", "POST", { action: "fixtures", id: editing, fixtures: parsed })); }, "Fixtures run.")} data-tx-run>{ui("Run sample calculations")}</Button>
        {runResult ? <ul className="space-y-1 text-sm" data-tx-run-result={runResult.passed}>{runResult.results.map(r => <li key={r.name} className="flex flex-wrap items-center gap-1.5 text-ink" data-tx-fixture={r.passed}><Badge variant={r.passed ? "success" : "danger"} dot size="sm">{r.passed ? ui("Matches") : ui("Does not match")}</Badge> <bdi dir="auto">{r.name}</bdi>{r.got && r.expected ? <> · {ui("tax {0} (approved {1}), total {2} (approved {3})", [String(r.got.tax), String(r.expected.tax), String(r.got.total), String(r.expected.total)])}</> : null}{r.error ? <> · {ui(r.error)}</> : null}</li>)}</ul> : null}
      </div> : null}
    </section> : null}
    <section className="space-y-2" data-tax-activations><h2 className="text-lg font-bold text-ink-strong">{ui("Activations")}</h2>{data.activations.length ? data.activations.map(a => <div key={a.id} className="sk-panel space-y-2 p-3 text-sm" data-tx-activation={a.status}>
      <p className="font-bold"><bdi dir="ltr">{a.packageCode} v{a.packageVersion}</bdi> · {statusLabel(ui, a.status)} · {ui("Applies to: {0}", [a.campusIds.map(id => data.campuses.find(c => c.id === id)?.name ?? "").join(", ")])}{a.effectiveFrom ? <> · {ui("from {0}", [date(a.effectiveFrom)])}</> : null}</p>
      {a.selfApproved ? <Badge variant="warning" size="sm">{ui("Self-approved")}</Badge> : null}
      {a.status === "DRAFT" ? <>{a.blockers.length ? <div data-tx-blockers><p className="font-semibold text-status-warning-text">{ui("This package has unresolved validation requirements.")}</p><ul className="list-disc ps-5">{a.blockers.map(b => <li key={b}>{ui(b)}</li>)}</ul></div> : <p className="font-medium text-status-success-text" data-tx-ready>{ui(approving ? "Ready for your sign-off." : "Ready for sign-off by your school's administrator.")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {drafting ? <Button size="sm" variant="outline" onClick={() => startEdit(a)} data-tx-edit>{ui("Edit")}</Button> : null}
          {approving && (a.preparedById !== data.userId || data.soleApprover) ? <Button size="sm" disabled={busy || a.blockers.length > 0} onClick={() => setSigning(a)} data-tx-approve>{ui("Sign off")}</Button> : null}
          {approving && a.preparedById === data.userId && !data.soleApprover ? <span className="text-xs text-ink-muted">{ui("You prepared this package, so another administrator signs it off.")}</span> : null}
          {/* Submit for sign-off (§4.4b row action): once the draft is ready, the finance desk sends it to the
              institution authority; an edit afterwards needs a new request. */}
          {drafting && !approving && !a.signOffRequestedAt && a.blockers.length === 0 ? <Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/tax", "POST", { action: "request-signoff", id: a.id }), "Sent to your school's administrator for sign-off.")} data-tx-request-signoff>{ui("Submit for sign-off")}</Button> : null}
          {a.signOffRequestedAt ? <span className="text-xs text-ink-muted" data-tx-signoff-requested>{ui(approving ? "Submitted for your sign-off on {0}." : "Sent for sign-off on {0}.", [date(a.signOffRequestedAt)])}</span> : null}
          {!approving && !a.signOffRequestedAt && a.blockers.length > 0 ? <span className="text-xs text-ink-muted">{ui("Resolve the requirements above, then submit it for sign-off.")}</span> : null}
        </div></> : null}
    </div>) : <div className="sk-panel"><EmptyState size="sm" icon={ShieldCheck} title={ui("No verified package is active for this institution.")} description={drafting ? ui("Prepare a new activation above; your school's administrator signs it off.") : undefined} /></div>}</section>
    <section className="space-y-2" data-tax-documents><h2 className="text-lg font-bold text-ink-strong">{ui("Issued tax documents")}</h2>{docs.length ? <ul className="space-y-2">{docs.map(d => <li key={d.id} className="sk-panel flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-tx-doc={d.documentNumber} data-tx-doc-status={d.submissionStatus}>
      <span><bdi dir="ltr">{d.documentNumber}</bdi>{d.revision > 1 ? <> · {ui("Revision {0}", [String(d.revision)])}</> : null} · <bdi dir="ltr">{d.packageCode} v{d.packageVersion}</bdi> · <bdi>{money(d.totalAmount, d.currency)}</bdi> · {statusLabel(ui, d.submissionStatus)}{d.lastError ? <> · <span dir="auto">{d.lastError}</span></> : null}</span>
      <span className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setViewDoc(d)} data-tx-doc-view>{ui("View")}</Button>{drafting && ["NONE", "CORRECTED"].includes(d.submissionStatus) ? <Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/tax", "POST", { action: "submit", id: d.id }), "Submission recorded.")} data-tx-submit>{d.submissionStatus === "CORRECTED" ? ui("Resubmit correction") : ui("Submit")}</Button> : null}{drafting && d.submissionStatus === "QUEUED" ? <Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/tax", "POST", { action: "reconcile", id: d.id }), "Status checked with the same document identity.")} data-tx-reconcile>{ui("Check status")}</Button> : null}{drafting && d.submissionStatus === "REJECTED" ? <Button size="sm" variant="secondary" onClick={() => setFix({ id: d.id, buyerName: d.snapshot.buyer.name, note: "" })} data-tx-correct>{ui("Prepare correction")}</Button> : null}</span>
      {d.attempts.length ? <ol className="w-full text-xs text-ink-muted">{d.attempts.map(x => <li key={x.attempt}>{ui("Attempt {0} · revision {1}", [String(x.attempt), String(x.revision)])} · {x.outcome} · <bdi>{dateTime(x.createdAt)}</bdi></li>)}</ol> : null}
    </li>)}</ul> : <div className="sk-panel"><EmptyState size="sm" icon={FileText} title={ui("No tax documents yet.")} description={ui("Invoices issued under an active package appear here.")} /></div>}</section>
    {viewDoc ? <Modal icon={FileText} tone="sky" title={ui("Tax invoice {0}", [viewDoc.documentNumber])} onClose={() => setViewDoc(null)}><TaxDocumentView doc={viewDoc} /></Modal> : null}
    {fix ? <Modal icon={FilePen} tone="amber" title={ui("Prepare correction")} subtitle={ui("The document number and electronic identity stay the same; the correction is a new revision.")} onClose={() => setFix(null)}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setFix(null)}>{ui("Back")}</Button><Button loading={busy} disabled={busy || fix.note.trim().length < 5} onClick={() => void run(async () => { await call("/api/tax", "POST", { action: "correct", ...fix }); setFix(null); }, "Correction prepared.")} data-tx-correct-save>{ui("Save correction")}</Button></div>}><div className="space-y-3" data-tx-correct-form><FormField name="fx-buyer" label={ui("Billed to")}><Input value={fix.buyerName} onChange={e => setFix({ ...fix, buyerName: e.target.value })} dir="auto" data-tx-correct-buyer /></FormField><FormField name="fx-note" label={ui("What was corrected and why")} hint={ui("At least 5 characters.")}><Input value={fix.note} onChange={e => setFix({ ...fix, note: e.target.value })} dir="auto" data-tx-correct-note /></FormField></div></Modal> : null}
  </div>;
}
