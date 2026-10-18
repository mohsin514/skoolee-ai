"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { UserX } from "lucide-react";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-446: identity and roster connection. Group identity administrators configure and test the provider, verify
// domains, map directory groups to roles and say who owns each synchronized field. Campus leaders review roster
// batches: every change is previewed with the field owner, conflicts need a decision, and names never match people.

type Ui = ReturnType<typeof useUiText>;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
type Conn = { id: string; name: string; protocol: string; issuer: string; clientId: string; hasSecret: boolean; verifiedDomains: string[]; pendingDomains: { domain: string; token: string }[]; roleClaim: string; roleMap: Record<string, string>; fieldOwnership: Record<string, string>; status: string; lastTestedAt: string | null; lastTestResult: string | null; emergencyAdminIds: string[] };
type Overview = { isGroupAdmin: boolean; userId: string; campuses: { id: string; name: string }[]; superAdmins: { id: string; fullName: string }[]; mappableRoles: string[]; fields: string[]; connections: Conn[]; requests: { id: string; connectionId: string; subject: string; email: string | null; emailVerified: boolean; name: string | null; reason: string; createdAt: string }[]; batches: { id: string; connectionId: string; campusId: string; externalBatchId: string; status: string; createdAt: string }[]; events: { id: string; kind: string; actorId: string | null; detail: Record<string, unknown>; createdAt: string }[] };
type Change = { key: string; kind: string; externalId: string; action: string; localId: string | null; changes: { field: string; from: unknown; to: unknown; owner: string; applied: boolean }[]; note: string | null; destructive: boolean };
type Batch = { id: string; externalBatchId: string; status: string; previewHash: string; changes: Change[]; result: Record<string, number> | null; summary: Record<string, number> };
const statusLabel = (ui: Ui, s: string) => ({ DRAFT: ui("Draft"), TESTED: ui("Tested, not enabled"), ENABLED: ui("Enabled"), DISABLED: ui("Disabled"), DRY_RUN: ui("Preview"), APPLIED: ui("Applied") } as Record<string, string>)[s] ?? s;
const actionLabel = (ui: Ui, a: string) => ({ ADD: ui("Add"), UPDATE: ui("Update"), WITHDRAW: ui("Withdraw"), CONFLICT: ui("Needs a decision"), ERROR: ui("Cannot apply"), UNCHANGED: ui("No change") } as Record<string, string>)[a] ?? a;
const fieldLabel = (ui: Ui, f: string) => ({ fullName: ui("Name"), admissionNo: ui("Admission number"), className: ui("Class"), status: ui("Status"), email: ui("Email"), role: ui("Role") } as Record<string, string>)[f] ?? f;
const show = (v: unknown) => v === null || v === undefined ? "—" : String(v);
const SAMPLE = `[{"kind":"student","externalId":"SIS-S-1001","fullName":"Synthetic Pupil","className":"Grade 4","section":"A","admissionNo":"ADM-1001","status":"active"}]`;

function ConnectionForm({ data, conn, reload }: { data: Overview; conn: Conn | null; reload: () => Promise<void> }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [f, setF] = useState({ name: conn?.name ?? "", issuer: conn?.issuer ?? "", clientId: conn?.clientId ?? "", clientSecret: "", roleClaim: conn?.roleClaim ?? "groups" });
  const [roles, setRoles] = useState<[string, string][]>(Object.entries(conn?.roleMap ?? {}));
  const [owners, setOwners] = useState<Record<string, string>>(Object.fromEntries(data.fields.map(x => [x, conn?.fieldOwnership[x] ?? "SOURCE"])));
  const [emergency, setEmergency] = useState<string[]>(conn?.emergencyAdminIds ?? []), [domain, setDomain] = useState(""), [busy, setBusy] = useState(false), [test, setTest] = useState<{ ok: boolean; problems: string[]; callback: string; audience: string; issuer: string } | null>(null), [record, setRecord] = useState<{ record: string; token: string } | null>(null);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  return <section className="sk-panel min-w-0 space-y-3 p-4" data-identity-connection={conn?.name ?? "new"}>
    <h2 className="text-lg font-bold">{conn ? <><bdi>{conn.name}</bdi> · {statusLabel(ui, conn.status)}</> : ui("New identity connection")}</h2>
    <p className="text-xs text-ink-muted">{ui("Supported: OpenID Connect authorization code with PKCE. SAML, SCIM and OneRoster are not available.")}</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField name="id-name" label={ui("Connection name")}><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} dir="auto" data-identity-name /></FormField>
      <FormField name="id-issuer" label={ui("Issuer URL")}><Input value={f.issuer} onChange={e => setF({ ...f, issuer: e.target.value })} dir="ltr" placeholder="https://login.example.org" data-identity-issuer /></FormField>
      <FormField name="id-client" label={ui("Client id (audience)")}><Input value={f.clientId} onChange={e => setF({ ...f, clientId: e.target.value })} dir="ltr" data-identity-client /></FormField>
      <FormField name="id-secret" label={ui("Client secret")} hint={conn?.hasSecret ? ui("A secret is stored and hidden. Enter a new one only to replace it.") : undefined}><Input type="password" autoComplete="off" value={f.clientSecret} onChange={e => setF({ ...f, clientSecret: e.target.value })} dir="ltr" data-identity-secret /></FormField>
      <FormField name="id-claim" label={ui("Group claim")}><Input value={f.roleClaim} onChange={e => setF({ ...f, roleClaim: e.target.value })} dir="ltr" data-identity-claim /></FormField>
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold text-ink-strong">{ui("Directory group to role")}</legend><p className="text-xs text-ink-muted">{ui("Owner and super administrator roles are never granted by a directory.")}</p>
      {roles.map(([g, r], i) => <div key={i} className="flex flex-col gap-2 sm:flex-row"><Input value={g} onChange={e => setRoles(roles.map((x, j) => j === i ? [e.target.value, x[1]] : x))} dir="ltr" aria-label={ui("Group")} data-role-group={i} /><Select value={r} onChange={e => setRoles(roles.map((x, j) => j === i ? [x[0], e.target.value] : x))} aria-label={ui("Role")} data-role-value={i}>{data.mappableRoles.map(m => <option key={m} value={m}>{m}</option>)}</Select><Button size="sm" variant="ghost" onClick={() => setRoles(roles.filter((_, j) => j !== i))}>{ui("Remove")}</Button></div>)}
      <Button size="sm" variant="outline" onClick={() => setRoles([...roles, ["", data.mappableRoles[0]]])} data-role-add>{ui("Add group")}</Button></fieldset>
    <fieldset className="space-y-1"><legend className="text-sm font-semibold text-ink-strong">{ui("Who owns each synchronized field")}</legend>{data.fields.map(x => <div key={x} className="flex items-center justify-between gap-2 text-sm"><span>{fieldLabel(ui, x)}</span><Select className="w-auto" value={owners[x]} onChange={e => setOwners({ ...owners, [x]: e.target.value })} aria-label={fieldLabel(ui, x)} data-owner={x}><option value="SOURCE">{ui("Managed in existing SIS")}</option><option value="LOCAL">{ui("Managed here")}</option></Select></div>)}</fieldset>
    <fieldset className="space-y-1"><legend className="text-sm font-semibold text-ink-strong">{ui("Emergency administrators")}</legend><p className="text-xs text-ink-muted">{ui("They keep local password access and can disable school sign-in if the provider fails. Every use is recorded.")}</p><div className="flex flex-wrap gap-3">{data.superAdmins.map(a => <label key={a.id} className="flex items-center gap-2 text-sm"><Checkbox checked={emergency.includes(a.id)} onChange={e => setEmergency(e.target.checked ? [...emergency, a.id] : emergency.filter(x => x !== a.id))} data-emergency-admin={a.fullName} /><bdi>{a.fullName}</bdi></label>)}</div></fieldset>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(() => call("/api/identity", "POST", { action: "save", ...(conn ? { id: conn.id } : {}), ...f, clientSecret: f.clientSecret || undefined, roleMap: Object.fromEntries(roles.filter(([g]) => g.trim())), fieldOwnership: owners, emergencyAdminIds: emergency }), "Saved as a draft.")} data-identity-save>{ui("Save draft")}</Button>
      {conn ? <><Button disabled={busy} onClick={() => void run(async () => setTest(await call("/api/identity", "POST", { action: "test", id: conn.id })), "Connection tested.")} data-identity-test>{ui("Test connection")}</Button>
        <Button variant={conn.status === "ENABLED" ? "secondary" : "default"} disabled={busy || (conn.status !== "ENABLED" && conn.status !== "TESTED")} onClick={() => void run(() => call("/api/identity", "POST", { action: "status", id: conn.id, status: conn.status === "ENABLED" ? "DISABLED" : "ENABLED" }), conn.status === "ENABLED" ? "School sign-in disabled." : "School sign-in enabled.")} data-identity-toggle>{conn.status === "ENABLED" ? ui("Disable sign-in") : ui("Enable sign-in")}</Button></> : null}</div>
    {conn?.lastTestedAt ? <p className="text-xs text-ink-muted">{ui("Last tested {0}: {1}", [dateTime(conn.lastTestedAt), conn.lastTestResult ?? ""])}</p> : null}
    {test ? <Alert tone={test.ok ? "success" : "danger"} title={test.ok ? ui("Metadata, issuer and endpoints verified.") : ui("The connection is not ready.")} data-identity-test-result={test.ok}>{test.problems.map(p => <p key={p} dir="auto">{ui(p)}</p>)}<p>{ui("Callback URL")}: <bdi dir="ltr" className="break-all font-mono text-xs">{test.callback}</bdi></p><p>{ui("Audience")}: <bdi dir="ltr" className="break-all font-mono text-xs">{test.audience}</bdi></p></Alert> : null}
    {conn ? <div className="space-y-2 rounded-xl border p-3" data-identity-domains><h3 className="text-sm font-semibold text-ink-strong">{ui("Verified domains")}</h3><p className="text-sm">{conn.verifiedDomains.length ? conn.verifiedDomains.map(d => <bdi key={d} dir="ltr" className="me-2">{d}</bdi>) : ui("None yet. Accounts link automatically only for verified domains.")}</p>
      {conn.pendingDomains.map(p => <div key={p.domain} className="flex flex-wrap items-center gap-2 text-xs" data-pending-domain={p.domain}><bdi dir="ltr">{p.domain}</bdi><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => call("/api/identity", "POST", { action: "verify-domain", id: conn.id, domain: p.domain }), "Domain verified.")} data-verify-domain>{ui("Check DNS")}</Button></div>)}
      <div className="flex flex-col gap-2 sm:flex-row"><Input value={domain} onChange={e => setDomain(e.target.value)} dir="ltr" placeholder="cedar.example" aria-label={ui("Domain")} data-domain-input /><Button size="sm" variant="outline" disabled={busy || !domain.trim()} onClick={() => void run(async () => { setRecord(await call("/api/identity", "POST", { action: "add-domain", id: conn.id, domain })); setDomain(""); }, "Add the DNS record, then check it.")} data-domain-add>{ui("Add domain")}</Button></div>
      {record ? <p className="text-xs">{ui("Create a TXT record")} <bdi dir="ltr" className="font-mono">{record.record}</bdi> = <bdi dir="ltr" className="font-mono">{record.token}</bdi></p> : null}</div> : null}
    {conn && conn.emergencyAdminIds.includes(data.userId) && conn.status === "ENABLED" ? <Alert tone="danger" live="off" title={ui("Emergency access")} actions={<Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(() => call("/api/identity", "POST", { action: "status", id: conn.id, status: "DISABLED", emergency: true, reason: "Provider unavailable" }), "School sign-in disabled under emergency access.")} data-emergency-disable>{ui("Disable school sign-in now")}</Button>} data-emergency-panel>{ui("Provider unavailable? Disable school sign-in; everyone can still use their Skoolee password. This is recorded.")}</Alert> : null}
  </section>;
}

function LinkRequests({ data, reload }: { data: Overview; reload: () => Promise<void> }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [open, setOpen] = useState<Overview["requests"][number] | null>(null), [cands, setCands] = useState<{ id: string; fullName: string; email: string; role: string; lastLogin: string | null }[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) call(`/api/identity?view=candidates&id=${open.id}`).then(setCands).catch(() => setCands([])); }, [open]);
  if (!data.requests.length) return null;
  const decide = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { await call("/api/identity", "POST", { action: "decide-link", id: open!.id, ...body }); toast.success(ui(done)); setOpen(null); await reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  return <section className="sk-panel space-y-2 p-4" data-link-requests><h2 className="text-lg font-bold text-ink-strong">{ui("Accounts waiting to be linked")}</h2><p className="text-xs text-ink-muted">{ui("Match by a stable identifier. Names alone never establish identity.")}</p>
    {data.requests.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2 text-sm" data-link-request={r.subject}><span><bdi dir="ltr">{r.subject}</bdi> · <bdi dir="ltr">{r.email ?? "—"}</bdi>{r.emailVerified ? "" : ` · ${ui("email not verified")}`} · <span dir="auto">{ui(r.reason)}</span> · <bdi>{dateTime(r.createdAt)}</bdi></span><Button size="sm" variant="outline" onClick={() => setOpen(r)} data-link-review>{ui("Review")}</Button></div>)}
    {open ? <ModalFrame title={ui("Link provider identity {0}", [open.subject])} onClose={() => setOpen(null)}><div className="space-y-3" data-link-modal>
      <div className="rounded-xl border p-2 text-sm"><p className="font-bold">{ui("From the provider")}</p><p><bdi dir="ltr">{open.subject}</bdi></p><p><bdi dir="auto">{open.name ?? "—"}</bdi> · <bdi dir="ltr">{open.email ?? "—"}</bdi></p></div>
      {cands.length ? cands.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2 text-sm" data-link-candidate={c.email}><span><bdi>{c.fullName}</bdi> · <bdi dir="ltr">{c.email}</bdi> · {c.role}{c.lastLogin ? <> · {ui("last sign-in {0}", [dateTime(c.lastLogin)])}</> : null}</span><Button size="sm" disabled={busy} onClick={() => void decide({ userId: c.id }, "Linked. This person can now use school sign-in.")} data-link-confirm>{ui("Link to this account")}</Button></div>) : <EmptyState size="sm" icon={UserX} title={ui("No matching account")} description={ui("Create the account first or reject this request.")} />}
      <p className="text-xs text-ink-muted">{ui("Linking lets this provider identity sign in as the chosen account. It is recorded and can only be undone by an administrator.")}</p>
      <div className="flex justify-end"><Button variant="secondary" disabled={busy} onClick={() => void decide({ decision: "REJECT" }, "Request rejected.")} data-link-reject>{ui("Reject")}</Button></div>
    </div></ModalFrame> : null}
  </section>;
}

function RosterReview({ data, reload }: { data: Overview; reload: () => Promise<void> }) {
  const ui = useUiText();
  const [form, setForm] = useState({ connectionId: data.connections[0]?.id ?? "", campusId: data.campuses[0]?.id ?? "", externalBatchId: "", rows: SAMPLE }), [batch, setBatch] = useState<Batch | null>(null), [decisions, setDecisions] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const open = async (id: string) => { setBatch(await call(`/api/identity?view=batch&id=${id}`)); setDecisions({}); };
  if (!data.connections.length) return null;
  const ready = batch ? batch.changes.filter(c => ["ADD", "UPDATE", "WITHDRAW"].includes(c.action)).length + Object.values(decisions).filter(d => d === "APPLY_SOURCE" || d === "KEEP_LOCAL").length : 0;
  return <section className="sk-panel min-w-0 space-y-3 p-4" data-roster>
    <h2 className="text-lg font-bold">{ui("Roster change review")}</h2>
    <div className="grid gap-2 sm:grid-cols-3"><FormField name="rb-conn" label={ui("Source")}><Select value={form.connectionId} onChange={e => setForm({ ...form, connectionId: e.target.value })} data-roster-connection>{data.connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>
      {data.isGroupAdmin ? <FormField name="rb-campus" label={ui("Campus")}><Select value={form.campusId} onChange={e => setForm({ ...form, campusId: e.target.value })} data-roster-campus>{data.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField> : null}
      <FormField name="rb-id" label={ui("Source batch id")}><Input value={form.externalBatchId} onChange={e => setForm({ ...form, externalBatchId: e.target.value })} dir="ltr" data-roster-batch-id /></FormField></div>
    <FormField name="rb-rows" label={ui("Rows from the source system (JSON)")}><Textarea value={form.rows} onChange={e => setForm({ ...form, rows: e.target.value })} rows={4} dir="ltr" className="font-mono text-xs" data-roster-rows /></FormField>
    <Button variant="outline" disabled={busy || !form.externalBatchId.trim()} onClick={async () => { setBusy(true); try { let rows; try { rows = JSON.parse(form.rows); } catch { throw new Error("Rows must be valid JSON."); } const r = await call("/api/identity", "POST", { action: "batch", ...form, rows }); toast.success(ui(r.replayed ? "This batch was already received; showing it." : "Preview ready. Nothing has changed yet.")); await open(r.id); await reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } }} data-roster-preview>{ui("Preview changes")}</Button>
    {data.batches.length ? <ul className="flex flex-wrap gap-2 text-xs">{data.batches.map(b => <li key={b.id}><Button size="sm" variant="ghost" onClick={() => void open(b.id)} data-roster-open={b.externalBatchId}><bdi dir="ltr">{b.externalBatchId}</bdi> · {statusLabel(ui, b.status)}</Button></li>)}</ul> : null}
    {batch ? <div className="space-y-2" data-roster-batch={batch.externalBatchId} data-roster-status={batch.status}>
      <p className="font-bold" data-roster-summary>{ui("{0} changes ready · {1} need a decision", [String(batch.summary.add + batch.summary.update + batch.summary.withdraw), String(batch.summary.conflict)])} · {ui("Add {0}, update {1}, withdraw {2}, cannot apply {3}", [String(batch.summary.add), String(batch.summary.update), String(batch.summary.withdraw), String(batch.summary.error)])}</p>
      <p className="text-xs text-ink-muted">{ui("Withdrawal preserves historical records. Names alone never establish identity.")}</p>
      <ul className="space-y-2">{batch.changes.filter(c => c.action !== "UNCHANGED").map(c => <li key={c.key} className={cn("rounded-xl border p-2 text-sm", c.action === "CONFLICT" && "border-amber-400", c.destructive && "border-red-300")} data-roster-change={c.externalId} data-roster-action={c.action}>
        <p className="font-bold">{actionLabel(ui, c.action)} · <bdi dir="ltr">{c.externalId}</bdi>{c.destructive ? <> · {ui("Removes access")}</> : null}</p>
        {c.changes.map(d => <p key={d.field} className={cn(!d.applied && c.action !== "CONFLICT" && "text-ink-muted")}>{fieldLabel(ui, d.field)}: <bdi dir="auto">{show(d.from)}</bdi> → <bdi dir="auto">{show(d.to)}</bdi> · {d.owner === "LOCAL" ? ui("Managed here — not changed") : ui("Managed in existing SIS")}</p>)}
        {c.note ? <p className="text-xs" dir="auto">{ui(c.note)}</p> : null}
        {c.action === "CONFLICT" && batch.status === "DRY_RUN" && c.localId ? <Select className="mt-1 w-auto" value={decisions[c.key] ?? ""} onChange={e => setDecisions({ ...decisions, [c.key]: e.target.value })} aria-label={ui("Decision")} data-roster-decision={c.externalId}><option value="">{ui("Leave unchanged for now")}</option><option value="KEEP_LOCAL">{ui("Keep the local record")}</option><option value="APPLY_SOURCE">{ui("Apply the source change")}</option></Select> : null}
      </li>)}</ul>
      {batch.status === "DRY_RUN" ? <Button disabled={busy || !ready} onClick={async () => { setBusy(true); try { const r = await call("/api/identity", "POST", { action: "apply", id: batch.id, previewHash: batch.previewHash, decisions }); toast.success(ui("Reviewed batch applied; {0} conflicts remain unchanged.", [String(r.result.skippedConflicts)])); await open(batch.id); await reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await open(batch.id); } finally { setBusy(false); } }} data-roster-apply>{ui("Apply {0} reviewed changes", [String(ready)])}</Button> : <p className="text-sm" data-roster-result>{ui("Applied: {0} · conflicts left unchanged: {1} · kept local: {2} · could not apply: {3}", [String(batch.result?.applied ?? 0), String(batch.result?.skippedConflicts ?? 0), String(batch.result?.keptLocal ?? 0), String(batch.result?.errors ?? 0)])}</p>}
    </div> : null}
  </section>;
}

export function IdentityAdmin() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<Overview | null>(null), [denied, setDenied] = useState(false), [adding, setAdding] = useState(false);
  const load = useCallback(async () => { try { setData(await call("/api/identity?view=overview")); setDenied(false); } catch { setDenied(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (denied) return <Alert tone="warning" live="off" data-identity-denied>{ui("Identity administration permission is required.")}</Alert>;
  if (!data) return <SkeletonRegion className="min-w-0 space-y-5" label={ui("Loading…")}><Skeleton className="h-9 w-2/3 max-w-md rounded-xl" /><Skeleton className="h-4 w-1/2 max-w-sm rounded-full" /><Skeleton className="h-64 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></SkeletonRegion>;
  return <div className="min-w-0 space-y-5" data-identity>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{ui("Identity and roster connection")}</h1><p className="text-sm text-ink-muted">{ui("Local password sign-in always stays available for recovery.")}</p></div>{data.isGroupAdmin ? <Button variant="outline" onClick={() => setAdding(!adding)} data-identity-add>{ui("Add connection")}</Button> : null}</header>
    {data.isGroupAdmin ? <>{adding ? <ConnectionForm data={data} conn={null} reload={async () => { setAdding(false); await load(); }} /> : null}{data.connections.map(c => <ConnectionForm key={c.id + c.status + (c.lastTestedAt ?? "") + c.verifiedDomains.join()} data={data} conn={c} reload={load} />)}{!data.connections.length && !adding ? <Alert tone="info" live="off" data-identity-empty>{ui("No identity provider connected. Configure a supported connection.")}</Alert> : null}<LinkRequests data={data} reload={load} /></> : <p className="text-xs text-ink-muted">{ui("Group identity settings are managed by your group's identity administrators. You can review roster changes for your campus.")}</p>}
    <RosterReview data={data} reload={load} />
    {data.events.length ? <details className="sk-panel p-4 text-sm" data-identity-audit><summary className="cursor-pointer font-bold">{ui("Provisioning and sign-in audit")}</summary><ol className="mt-2 space-y-1">{data.events.map(e => <li key={e.id} data-identity-event={e.kind}><bdi>{dateTime(e.createdAt)}</bdi> · <bdi dir="ltr">{e.kind}</bdi></li>)}</ol></details> : null}
  </div>;
}
