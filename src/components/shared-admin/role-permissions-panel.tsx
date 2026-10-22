"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { permissionCopy, permissionLabel, type PermissionCopyKey } from "./permission-copy";

type Flags = { canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean };
type Matrix = Record<string, Record<string, Flags> & { _fixed?: boolean }>;
type Snapshot = { matrix: Matrix; modules: string[]; callerRole: string; canEdit: boolean };
const roles = ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "PARENT", "STUDENT"];
const actions = [["canView", "view"], ["canAdd", "add"], ["canEdit", "edit"], ["canDelete", "delete"]] as const;
const groups: [PermissionCopyKey, string[]][] = [["students", ["students", "admissions", "attendance"]], ["academics", ["timetable", "exams", "reports"]], ["staff", ["staff", "leave", "payroll"]], ["money", ["fees", "accounts"]], ["operations", ["library", "front-desk", "transport", "inventory", "dormitory"]], ["assistant", ["ai"]]];
const off: Flags = { canView: false, canAdd: false, canEdit: false, canDelete: false };
class PermissionRequestError extends Error { constructor(readonly status: number) { super("Permission request failed"); } }
async function request(method: "GET" | "PATCH", body?: unknown) {
  const response = await fetch("/api/roles/permissions", { method, cache: "no-store", signal: AbortSignal.timeout(8000), ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  if (!response.ok || !json.success) throw new PermissionRequestError(response.status);
  return json.data;
}

export function RolePermissionsPanel() {
  const { language } = useLocale(), copy = permissionCopy(language), label = (value: string) => permissionLabel(value, language);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [role, setRole] = useState("PRINCIPAL"), [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<"loadError" | "saveError" | "denied" | null>(null), [saved, setSaved] = useState(false);
  const [source, setSource] = useState(""), [copyOpen, setCopyOpen] = useState(false), [completed, setCompleted] = useState(0);
  const version = useRef(0), busyRef = useRef(false), cancelRef = useRef<HTMLButtonElement>(null), id = useId();
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setSnapshot(null); setError(null); setSaved(false);
    try { const data = await request("GET"); if (current === version.current) setSnapshot(data); }
    catch (failure) { if (current === version.current) setError(failure instanceof PermissionRequestError && [401, 403].includes(failure.status) ? "denied" : "loadError"); }
    finally { if (current === version.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { version.current++; }; }, [load]);
  // F28: saving permissions needs two-step sign-in (G18). When the console knows the session is not MFA-verified,
  // say so once and keep the matrix read-only rather than letting every switch fail with a 403.
  const access = useConsoleAccess();
  const mfaMissing = access.ready && !access.has("mfaVerified") && snapshot?.canEdit === true;
  const writable = snapshot?.canEdit === true && snapshot.matrix[role]?._fixed !== true && !mfaMissing;
  const write = async (module: string, changes: Flags | Partial<Flags>) => {
    const row = await request("PATCH", { role, module, ...changes });
    // Adopt the acknowledged server flags, including View-dependent clearing.
    setSnapshot(previous => previous ? { ...previous, matrix: { ...previous.matrix, [row.role]: { ...previous.matrix[row.role], [row.module]: { canView: row.canView, canAdd: row.canAdd, canEdit: row.canEdit, canDelete: row.canDelete } } } } : null);
  };
  const save = async (changes: [string, Partial<Flags>][], copying = false) => {
    if (!writable || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setSaved(false); setCompleted(0);
    let count = 0;
    try {
      for (const [module, flags] of changes) { await write(module, flags); setCompleted(++count); }
      setSaved(true); if (copying) { setCopyOpen(false); setSource(""); setCopyReason(""); }
      // The shell rechecks this console's access at once instead of on its next throttled revalidation (P2).
      window.dispatchEvent(new Event("skoolee:access-changed"));
    } catch (failure) {
      const denied = failure instanceof PermissionRequestError && [401, 403].includes(failure.status);
      setError(denied ? "denied" : "saveError");
      // Earlier writes in a bulk change did land; let the shell pick them up too.
      if (count > 0) window.dispatchEvent(new Event("skoolee:access-changed"));
      // A write denial can also follow loss of view permission. Clear the read
      // model until a new GET verifies whether any matrix is still permitted.
      if (denied) setSnapshot(null);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const setAll = (modules: string[], enabled: boolean) => save(modules.map(module => [module, { canView: enabled, canAdd: enabled, canEdit: enabled, canDelete: enabled }]));
  // R3 / §4.5.5: a whole group or a whole module changing at once is a school-wide permission change, so it is
  // confirmed first with a typed reason. (P1 need: PATCH /api/roles/permissions is `.strict()` and has no `reason`
  // field yet, so the reason is asked for but not sent; the route should accept it and write it to the audit row.)
  const [bulk, setBulk] = useState<{ modules: string[]; enabled: boolean; scope: "group" | "module" } | null>(null);
  const [copyReason, setCopyReason] = useState("");
  const copyReasonReady = copyReason.trim().length >= 10;
  const unknown = snapshot?.modules.filter(module => !groups.some(([, values]) => values.includes(module))) ?? [];
  const visible = [...groups, ["other", unknown] as [PermissionCopyKey, string[]]].map(([group, modules]) => [group, modules.filter(module => snapshot?.modules.includes(module) && `${label(module)} ${module}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))] as const).filter(([, modules]) => modules.length);
  // R4: a matrix that never arrived is an inline ErrorState with Retry; a failed save keeps the matrix and says so.
  const loadFailed = error === "loadError" && !snapshot && !loading;
  const failure = error && !loadFailed ? <div role="alert" className="space-y-2 rounded-xl border border-status-error-border bg-status-error-surface p-3 text-sm text-status-error-text"><p>{copy[error]}</p>{completed > 0 && <p>{copy.partial} <bdi>{completed}</bdi></p>}<Button variant="outline" disabled={busy || loading} onClick={() => void load()}>{copy.retry}</Button></div> : null;

  return <section className="sk-panel min-w-0 space-y-4 p-3 sm:p-6 [overflow-wrap:anywhere]" dir={language === "en" ? "ltr" : "rtl"} aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-full sm:basis-auto"><h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-ink-strong">{copy.title}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy.scope}</p></div><Button variant="outline" disabled={busy || loading} onClick={() => void load()}>{copy.refresh}</Button></div>
    {!copyOpen && failure}
    {loadFailed ? <ErrorState title={copy.loadError} onRetry={() => void load()} retryLabel={copy.retry} /> : null}
    <p role="status" className="text-sm text-ink-muted">{loading && snapshot ? copy.loading : busy ? copy.saving : saved ? copy.saved : ""}</p>
    {snapshot && !snapshot.canEdit && <Alert tone="info" compact>{copy.readOnly}</Alert>}
    {mfaMissing ? <Alert tone="warning" title={copy.mfaTitle} actions={<Link href="/account/security" className={buttonVariants({ variant: "outline", size: "sm" })}>{copy.mfaAction}</Link>}>{copy.mfaBody}</Alert> : null}
    <div className="flex flex-wrap gap-3"><label className="min-w-0 flex-1 basis-48 text-sm font-semibold" htmlFor={`${id}-role`}>{copy.role}<Select id={`${id}-role`} value={role} disabled={busy || loading} onChange={event => { setRole(event.target.value); setSaved(false); setError(null); setCompleted(0); }} className="mt-1 w-full">{roles.map(value => <option key={value} value={value}>{label(value)}</option>)}</Select></label><label className="min-w-0 flex-1 basis-48 text-sm font-semibold" htmlFor={`${id}-search`}>{copy.search}<Input id={`${id}-search`} value={search} onChange={event => setSearch(event.target.value)} className="mt-1 w-full" /></label></div>
    {loading && !snapshot ? <SkeletonList rows={4} label={copy.loading} /> : null}
    {snapshot && <>
      {snapshot.matrix[role]?._fixed && <Alert tone="neutral" compact>{copy.fixed}</Alert>}
      {writable && <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 basis-48 text-sm font-semibold" htmlFor={`${id}-source`}>{copy.copyFrom}<Select id={`${id}-source`} className="mt-1 w-full" value={source} disabled={busy} onChange={event => setSource(event.target.value)}><option value="">{copy.choose}</option>{roles.filter(value => value !== role).map(value => <option key={value} value={value}>{label(value)}</option>)}</Select></label><Button disabled={!source || busy} onClick={() => { setCopyOpen(true); setError(null); setCompleted(0); }}>{copy.review}</Button></div>}
      {!visible.length && <p className="text-sm text-ink-muted">{copy.empty}</p>}
      {visible.map(([group, modules]) => <section key={group} className="space-y-3" aria-labelledby={`${id}-${group}`}><div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-${group}`} className="basis-full text-base font-bold text-ink-strong sm:basis-auto">{copy[group]}</h3>{writable && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setBulk({ modules: [...modules], enabled: true, scope: "group" })} aria-label={`${copy[group]}: ${copy.full}`}>{copy.full}</Button><Button variant="outline" disabled={busy} onClick={() => setBulk({ modules: [...modules], enabled: false, scope: "group" })} aria-label={`${copy[group]}: ${copy.none}`}>{copy.none}</Button></div>}</div>
        {modules.map(module => { const flags = snapshot.matrix[role]?.[module] ?? off; return <fieldset key={module} className="min-w-0 rounded-xl border border-edge p-3 transition-shadow hover:shadow-sm" disabled={!writable || busy}><legend className="max-w-full px-1 text-sm font-semibold text-ink-strong">{label(module)}</legend><div className="flex flex-wrap gap-2">{actions.map(([key, action]) => <Button key={key} variant={flags[key] ? "secondary" : "outline"} role="switch" aria-checked={flags[key]} aria-label={`${label(role)}: ${label(module)} — ${copy[action]}`} aria-describedby={!flags.canView && key !== "canView" ? `${id}-${module}-view` : undefined} disabled={!writable || busy || key !== "canView" && !flags.canView} onClick={() => void save([[module, { [key]: !flags[key] }]])}>{copy[action]}</Button>)}</div>{!flags.canView && <p id={`${id}-${module}-view`} className="mt-2 text-xs text-ink-subtle">{copy.viewFirst}</p>}<Button variant="ghost" disabled={!writable || busy} onClick={() => setBulk({ modules: [module], enabled: !Object.values(flags).every(Boolean), scope: "module" })}>{Object.values(flags).every(Boolean) ? copy.none : copy.full}</Button></fieldset>; })}
      </section>)}
    </>}
    <ConfirmAction
      open={Boolean(bulk)}
      title={bulk?.scope === "module" ? (bulk.enabled ? copy.moduleOnTitle : copy.moduleOffTitle) : bulk?.enabled ? copy.bulkOnTitle : copy.bulkOffTitle}
      description={`${label(role)}${bulk?.scope === "module" ? ` · ${label(bulk.modules[0] ?? "")}` : ""} · ${copy.bulkBody}`}
      confirmLabel={bulk?.scope === "module" ? (bulk.enabled ? copy.full : copy.none) : bulk?.enabled ? copy.bulkOn : copy.bulkOff}
      requireReason={{ label: copy.reason, minLength: 10 }}
      cancelLabel={copy.keepEditing}
      tone={bulk?.enabled ? "warning" : "danger"}
      busy={busy}
      onCancel={() => setBulk(null)}
      onConfirm={async () => { if (!bulk) return; await setAll(bulk.modules, bulk.enabled); setBulk(null); }}
    />
    {copyOpen && <Modal title={copy.copyTitle} onClose={() => { setCopyOpen(false); setCopyReason(""); }} dismissible={!busy} hideClose={busy} disableBackdropClose={busy} initialFocusRef={cancelRef} size="sm" footer={<div className="flex flex-wrap justify-end gap-2"><Button ref={cancelRef} variant="outline" disabled={busy} onClick={() => { setCopyOpen(false); setCopyReason(""); }}>{copy.cancel}</Button><Button loading={busy} disabled={busy || !writable || loading || !copyReasonReady} onClick={() => void save((snapshot?.modules ?? []).map(module => [module, snapshot?.matrix[source]?.[module] ?? off]), true)}>{busy ? copy.saving : copy.confirm}</Button></div>}><div className="space-y-3"><p className="text-sm leading-relaxed text-ink-muted">{copy.copyHint}</p><p><strong>{copy.source}:</strong> <bdi>{label(source)}</bdi> <strong>{copy.target}:</strong> <bdi>{label(role)}</bdi></p><FormField name={`${id}-copy-reason`} label={copy.reason} required hint={copyReasonReady ? undefined : copy.reasonShort}><Textarea value={copyReason} disabled={busy} rows={2} onChange={event => setCopyReason(event.target.value)} /></FormField>{failure}</div></Modal>}
  </section>;
}
