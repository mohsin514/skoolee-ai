"use client";
import { useCallback, useEffect, useState } from "react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskSection, DeskStats, StatTile, deskRow, type DeskTone } from "@/components/ui/desk";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { Building2, CalendarClock, FileStack, GitBranch, Hourglass, Layers, Link2, Lock, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { isApiOk, readApiError } from "@/lib/api/envelope-client";

// SKO-443: campus policy shows each effective value with where it comes from — inherited, locked, a reviewed
// campus override (with its expiry) or a campus setting — never a value the reader has to work out. Group policy
// owners draft versions, must preview the impact on every campus, and a second owner approves the schedule.

type Ui = ReturnType<typeof useUiText>;
type Domain = "GRADING" | "CALENDAR";
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !isApiOk(json)) throw new Error(readApiError(json, "The change was not saved."));
  return json.data;
}
const LABELS: Record<string, string> = { passingPercentage: "Pass mark (%)", gradeAplus: "A+ starts at (%)", gradeA: "A starts at (%)", gradeB: "B starts at (%)", gradeC: "C starts at (%)", gradeD: "D starts at (%)", roundingRule: "Rounding", missingMarkPolicy: "Missing marks", absentMarkPolicy: "Absent marks", weekStartsOn: "Week starts on", weekend: "Weekend days", termCount: "Terms per year", schoolDayStart: "School day starts" };
const ENUMS: Record<string, string[]> = { roundingRule: ["WHOLE", "ONE_DECIMAL", "TWO_DECIMALS"], missingMarkPolicy: ["COUNT_AS_ZERO", "EXCLUDE", "BLOCK"], absentMarkPolicy: ["COUNT_AS_ZERO", "EXCLUDE", "BLOCK"] };
const enumLabel = (ui: Ui, v: string) => ({ WHOLE: ui("Whole numbers"), ONE_DECIMAL: ui("One decimal place"), TWO_DECIMALS: ui("Two decimal places"), COUNT_AS_ZERO: ui("Count as zero"), EXCLUDE: ui("Leave out"), BLOCK: ui("Block the result") } as Record<string, string>)[v] ?? v;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function show(ui: Ui, key: string, v: unknown): string {
  if (v === null || v === undefined) return ui("Not set");
  if (key === "weekend" && Array.isArray(v)) return v.map(d => ui(DAYS[Number(d)] ?? String(d))).join(", ") || ui("None");
  if (key === "weekStartsOn") return ui(DAYS[Number(v)] ?? String(v));
  if (ENUMS[key]) return enumLabel(ui, String(v));
  return String(v);
}
function parse(key: string, raw: string): unknown {
  if (key === "weekend") return raw.split(",").map(s => s.trim()).filter(Boolean).map(Number);
  if (ENUMS[key] || key === "schoolDayStart") return raw;
  return raw === "" ? undefined : Number(raw);
}
const toRaw = (key: string, v: unknown) => v === undefined || v === null ? "" : key === "weekend" && Array.isArray(v) ? v.join(",") : String(v);

function ValueInput({ k, value, onChange }: { k: string; value: string; onChange: (v: string) => void }) {
  const ui = useUiText();
  if (ENUMS[k]) return <Select value={value} onChange={e => onChange(e.target.value)} aria-label={ui(LABELS[k] ?? k)} data-policy-input={k}><option value="">{ui("Choose")}</option>{ENUMS[k].map(o => <option key={o} value={o}>{enumLabel(ui, o)}</option>)}</Select>;
  if (k === "weekStartsOn") return <Select value={value} onChange={e => onChange(e.target.value)} aria-label={ui(LABELS[k])} data-policy-input={k}><option value="">{ui("Choose")}</option>{DAYS.map((d, i) => <option key={d} value={String(i)}>{ui(d)}</option>)}</Select>;
  return <Input value={value} onChange={e => onChange(e.target.value)} aria-label={ui(LABELS[k] ?? k)} dir="ltr" placeholder={k === "weekend" ? "5,6" : k === "schoolDayStart" ? "08:00" : ""} data-policy-input={k} />;
}

// ─── Campus policy ───────────────────────────────────────────────────────

const SOURCE_STYLE: Record<string, { tone: DeskTone; icon: LucideIcon }> = { GROUP_LOCKED: { tone: "neutral", icon: Lock }, GROUP_DEFAULT: { tone: "info", icon: Link2 }, OVERRIDE: { tone: "warning", icon: GitBranch }, CAMPUS: { tone: "brand", icon: Building2 } };
const versionTone = (s: string): DeskTone => s === "ACTIVE" ? "success" : s === "SCHEDULED" ? "info" : s === "IN_REVIEW" ? "warning" : s === "DRAFT" ? "brand" : "neutral";
type Row = { key: string; label: string; value: unknown; source: "GROUP_LOCKED" | "GROUP_DEFAULT" | "OVERRIDE" | "CAMPUS"; version: number | null; override: { id: string; reason: string; approver: string | null; validUntil: string; modifiesVersion: number | null } | null };
type CampusData = { campus: { id: string; name: string; board: string | null }; domain: Domain; template: { id: string; title: string } | null; version: { version: number; effectiveFrom: string } | null; rows: Row[]; pending: { id: string; key: string; value: unknown; validUntil: string; reason: string }[]; scheduled: { version: number; effectiveFrom: string } | null; canRequest: boolean; canPublish: boolean };

export function CampusPolicy({ campuses }: { campuses?: { id: string; name: string }[] }) {
  const ui = useUiText();
  const { date, dateTime } = useLocaleFormat();
  const [domain, setDomain] = useState<Domain>("GRADING"), [campusId, setCampusId] = useState(campuses?.[0]?.id ?? ""), [at, setAt] = useState("");
  const [data, setData] = useState<CampusData | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [req, setReq] = useState<{ key: string; value: string; reason: string; validUntil: string } | null>(null);
  const [focus, setFocus] = useState<Row["source"] | null>(null);
  const load = useCallback(() => call(`/api/group-policy?view=campus&domain=${domain}${campusId ? `&campusId=${campusId}` : ""}${at ? `&at=${encodeURIComponent(new Date(at).toISOString())}` : ""}`).then(d => { setData(d); setError(null); }).catch(e => setError(e.message)), [domain, campusId, at]);
  useEffect(() => { void load(); }, [load]);
  const source = (r: Row) => r.source === "GROUP_LOCKED" ? ui("Locked by Group Policy v{0}. Ask your group policy owner if this campus needs a different value.", [String(r.version)])
    : r.source === "GROUP_DEFAULT" ? ui("This value is inherited from Group Policy v{0}.", [String(r.version)])
    : r.source === "OVERRIDE" ? ui("Campus override until {0}, approved by {1}. Changes Group Policy v{2}.", [date(r.override!.validUntil), r.override!.approver ?? "", String(r.override!.modifiesVersion ?? r.version)])
    : ui("Campus setting. No group template sets this value.");
  const badge = (r: Row) => r.source === "GROUP_LOCKED" ? ui("Locked") : r.source === "GROUP_DEFAULT" ? ui("Inherited") : r.source === "OVERRIDE" ? ui("Overridden") : ui("Campus setting");
  const rows = data ? data.rows.filter(r => !focus || r.source === focus) : [];
  const tile = (id: Row["source"], index: number, label: string) => { const count = data?.rows.filter(r => r.source === id).length ?? 0; return <StatTile index={index} icon={SOURCE_STYLE[id].icon} tone={count ? SOURCE_STYLE[id].tone : "neutral"} value={count} label={label} onSelect={() => setFocus(focus === id ? null : id)} selected={focus === id} data-policy-focus={id} />; };
  const submitOverride = async () => { if (!req || !data) return false; setBusy(true); try { await call("/api/group-policy", "POST", { action: "request-override", campusId: data.campus.id, domain, key: req.key, value: parse(req.key, req.value), reason: req.reason, validUntil: new Date(`${req.validUntil}T23:59:59`).toISOString() }); toast.success(ui("Override requested. The inherited value applies until it is approved.")); setReq(null); await load(); return true; } catch (e) { toast.error(friendlyErrorMessage(e, ui("The change was not saved."))); return false; } finally { setBusy(false); } };
  return <section className="min-w-0 space-y-4" data-campus-policy>
    <PageHeader headingLevel={2} icon={Scale} title="Campus policy" description={data ? <><bdi>{data.campus.name}</bdi>{data.template ? <> · <bdi>{data.template.title}</bdi>{data.version ? <> · <bdi dir="ltr">v{data.version.version}</bdi></> : null}</> : null}</> : undefined} />
    <div className="grid gap-2 sm:grid-cols-3">
      {campuses?.length ? <FormField name="cp-campus" label={ui("Campus")}><Select value={campusId} onChange={e => setCampusId(e.target.value)} data-policy-campus>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField> : null}
      <FormField name="cp-domain" label={ui("Policy domain")}><Select value={domain} onChange={e => setDomain(e.target.value as Domain)} data-policy-domain><option value="GRADING">{ui("Grading")}</option><option value="CALENDAR">{ui("Calendar")}</option></Select></FormField>
      <FormField name="cp-at" label={ui("As of (optional)")} hint={ui("See the rules that applied on an earlier date.")}><Input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} dir="ltr" data-policy-at /></FormField>
    </div>
    {error ? <div data-policy-error><ErrorState description={ui(error)} onRetry={() => void load()} /></div> : null}
    {data ? <>
      {!data.template ? <Alert tone="neutral" live="off" compact data-policy-no-template>{ui("No group template covers this domain for this campus. Campus settings apply as they are.")}</Alert> : null}
      {data.scheduled ? <Alert tone="info" live="off" compact data-policy-scheduled>{ui("Version {0} is scheduled for {1}.", [String(data.scheduled.version), dateTime(data.scheduled.effectiveFrom)])}</Alert> : null}
      {data.rows.length ? <DeskStats data-policy-pulse>
        {tile("GROUP_LOCKED", 0, ui("Locked"))}
        {tile("GROUP_DEFAULT", 1, ui("Inherited"))}
        {tile("OVERRIDE", 2, ui("Overridden"))}
        {tile("CAMPUS", 3, ui("Campus setting"))}
      </DeskStats> : null}
      <DeskFilterStatus shown={rows.length} total={data.rows.length} onClear={() => setFocus(null)} />
      <ul className="grid gap-2 sm:grid-cols-2">{rows.map(r => <li key={r.key} data-tone={r.source === "OVERRIDE" ? "warning" : r.source === "GROUP_DEFAULT" ? "info" : r.source === "GROUP_LOCKED" ? "neutral" : undefined} className={cn(deskRow, "space-y-1.5")} data-policy-row={r.key} data-policy-source={r.source}>
        <div className="flex items-start gap-3"><DeskRowIcon icon={SOURCE_STYLE[r.source].icon} /><div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 text-sm font-semibold text-ink-strong">{ui(LABELS[r.key] ?? r.label)}</p><DeskPill tone={SOURCE_STYLE[r.source].tone}>{badge(r)}</DeskPill></div>
        <p className="text-lg font-bold text-ink-strong"><bdi>{show(ui, r.key, r.value)}</bdi></p></div></div>
        <p className="text-xs text-ink-muted">{source(r)}</p>
        {r.override ? <p className="text-xs" dir="auto">{ui("Reason: {0}", [r.override.reason])}</p> : null}
        {data.canRequest && !at && (r.source === "GROUP_DEFAULT" || r.source === "OVERRIDE") ? <Button size="sm" variant="outline" onClick={() => setReq({ key: r.key, value: toRaw(r.key, r.value), reason: "", validUntil: "" })} data-request-override={r.key}>{ui("Request override")}</Button> : null}
        {r.source === "GROUP_LOCKED" ? <p className="sr-only">{ui("This setting cannot be changed at campus level.")}</p> : null}
      </li>)}</ul>
      {data.pending.length ? <DeskSection tone="warning" icon={Hourglass} title={ui("Override requests awaiting a group policy owner")} className="text-sm" data-policy-pending>{data.pending.map(p => <p key={p.id} className="flex flex-wrap items-center gap-2"><span>{ui(LABELS[p.key] ?? p.key)}: <bdi className="font-semibold">{show(ui, p.key, p.value)}</bdi></span><DeskPill tone="warning">{ui("until {0}", [date(p.validUntil)])}</DeskPill></p>)}</DeskSection> : null}
    </> : !error ? <SkeletonList rows={3} label={ui("Loading campus policy")} /> : null}
    {req && data ? <Modal title={ui("Request override · {0}", [ui(LABELS[req.key] ?? req.key)])} icon={GitBranch} tone="amber" subtitle={<><bdi>{data.campus.name}</bdi> · <bdi>{data.template?.title}</bdi> <bdi dir="ltr">v{data.version?.version}</bdi></>} size="sm" onClose={() => setReq(null)} dirty={Boolean(req.reason.trim())}
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setReq(null)}>{ui("Keep editing")}</Button><Button loading={busy} disabled={busy || req.reason.trim().length < 5 || !req.validUntil} onClick={submitOverride} data-override-submit>{ui("Send request")}</Button></div>}><div className="space-y-3" data-override-form>
      <FormField name="ov-value" label={ui("Campus value")}><ValueInput k={req.key} value={req.value} onChange={v => setReq({ ...req, value: v })} /></FormField>
      <FormField name="ov-reason" label={ui("Why does this campus need a different value?")}><Input value={req.reason} onChange={e => setReq({ ...req, reason: e.target.value })} dir="auto" data-override-reason /></FormField>
      <FormField name="ov-until" label={ui("Valid until")}><Input type="date" value={req.validUntil} onChange={e => setReq({ ...req, validUntil: e.target.value })} dir="ltr" data-override-until /></FormField>
      <Alert tone="info" compact live="off">{ui("A group policy owner reviews this. Until then the inherited value applies.")}</Alert>
    </div></Modal> : null}
  </section>;
}

// ─── Group library ───────────────────────────────────────────────────────

type Version = { id: string; version: number; status: string; values: Record<string, unknown>; lockedKeys: string[]; overridableKeys: string[]; effectiveFrom: string | null; reviewerId: string | null; submittedById: string | null; activatedAt: string | null };
type Template = { id: string; domain: Domain; title: string; countries: string[]; boards: string[]; campusIds: string[]; versions: Version[] };
type Library = { templates: Template[]; campuses: { id: string; name: string; board: string | null; country: string }[]; pending: { id: string; campusId: string; key: string; value: unknown; reason: string; validUntil: string; requestedById: string }[]; owners: { id: string; fullName: string }[]; keys: Record<Domain, { key: string; label: string; hint: string }[]>; userId: string };
type Preview = { versionId: string; version: number; affected: number; blocking: number; previewHash: string; campuses: { campusId: string; name: string; country: string; board: string | null; compatible: boolean; problems: string[]; changes: { key: string; from: unknown; to: unknown; locked: boolean }[]; keptOverrides: { id: string; key: string; status: string }[]; endedOverrides: { id: string; key: string; status: string }[] }[] };

function DraftEditor({ template, lib, reload }: { template: Template; lib: Library; reload: () => Promise<void> }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const latest = template.versions[0];
  const draft = template.versions.find(v => v.status === "DRAFT");
  const base = draft ?? latest;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(base?.values ?? {}).map(([k, v]) => [k, toRaw(k, v)])));
  const [mode, setMode] = useState<Record<string, string>>(() => Object.fromEntries(Object.keys(base?.values ?? {}).map(k => [k, base?.overridableKeys.includes(k) ? "OVERRIDABLE" : "LOCKED"])));
  const [preview, setPreview] = useState<Preview | null>(null), [effective, setEffective] = useState(""), [reviewer, setReviewer] = useState(""), [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selfApprove, setSelfApprove] = useState(false);
  const otherOwners = lib.owners.filter(o => o.id !== lib.userId);
  const soleOwner = otherOwners.length === 0;
  const run = async (work: () => Promise<unknown>, done: string, tag?: string) => { setBusy(true); setPendingAction(tag ?? null); try { await work(); toast.success(ui(done)); await reload(); return true; } catch (e) { toast.error(friendlyErrorMessage(e, ui("The change was not saved."))); return false; } finally { setBusy(false); setPendingAction(null); } };
  const payload = () => {
    const out: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(values)) if (mode[k] && mode[k] !== "UNSET" && raw !== "") out[k] = parse(k, raw);
    return { values: out, lockedKeys: Object.keys(out).filter(k => mode[k] === "LOCKED"), overridableKeys: Object.keys(out).filter(k => mode[k] === "OVERRIDABLE") };
  };
  const inReview = template.versions.find(v => v.status === "IN_REVIEW");
  return <div className="space-y-3" data-draft-editor={template.id}>
    <ul className="flex flex-wrap gap-2 text-sm" data-template-versions>{template.versions.map(v => <li key={v.id} data-version={v.version} data-version-status={v.status}><DeskPill tone={versionTone(v.status)}><bdi dir="ltr">v{v.version}</bdi> · {statusLabel(ui, v.status)}{v.effectiveFrom ? <> · {ui("from {0}", [dateTime(v.effectiveFrom)])}</> : null}</DeskPill></li>)}</ul>
    {inReview ? <Alert tone="info" live="off" icon={Hourglass} className="text-sm" data-in-review>{ui("Version {0} is waiting for review by {1}.", [String(inReview.version), lib.owners.find(o => o.id === inReview.reviewerId)?.fullName ?? ""])}
      {inReview.reviewerId === lib.userId ? <span className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/group-policy", "POST", { action: "review", versionId: inReview.id, decision: "APPROVE" }), "Version scheduled.", "review-approve")} loading={pendingAction === "review-approve"} data-review-approve>{ui("Approve and schedule v{0}", [String(inReview.version)])}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => call("/api/group-policy", "POST", { action: "review", versionId: inReview.id, decision: "RETURN" }), "Returned to draft.", "review-return")} loading={pendingAction === "review-return"} data-review-return>{ui("Return to draft")}</Button></span> : null}
    </Alert> : null}
    {!inReview ? <>
      <div className="grid gap-2">{lib.keys[template.domain].map(k => <div key={k.key} className="grid items-end gap-2 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:grid-cols-[1fr_1fr_auto]" data-draft-key={k.key}>
        <FormField name={`dv-${k.key}`} label={ui(LABELS[k.key] ?? k.label)} hint={k.hint}><ValueInput k={k.key} value={values[k.key] ?? ""} onChange={v => setValues({ ...values, [k.key]: v })} /></FormField>
        <FormField name={`dm-${k.key}`} label={ui("Campus may change it?")}><Select value={mode[k.key] ?? "UNSET"} onChange={e => setMode({ ...mode, [k.key]: e.target.value })} data-draft-mode={k.key}><option value="UNSET">{ui("Not set by the group")}</option><option value="LOCKED">{ui("Locked")}</option><option value="OVERRIDABLE">{ui("With an approved override")}</option></Select></FormField>
      </div>)}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(() => call("/api/group-policy", "POST", { action: "draft", templateId: template.id, ...payload() }), "Draft saved.", "save")} loading={pendingAction === "save"} data-draft-save>{ui("Save draft")}</Button>
        {draft ? <Button disabled={busy} onClick={async () => { setBusy(true); try { setPreview(await call(`/api/group-policy?view=preview&versionId=${draft.id}${effective ? `&effectiveFrom=${encodeURIComponent(new Date(effective).toISOString())}` : ""}`)); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } }} data-draft-preview>{ui("Preview campus impact")}</Button> : null}</div>
    </> : null}
    {preview && draft && !inReview ? <div className="space-y-2 rounded-2xl border border-border-subtle p-3 sm:p-4" data-impact>
      <p className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-surface py-1 font-bold text-ink-strong" data-impact-count><Layers aria-hidden="true" className="size-4 text-primary" />{ui("{0} campuses affected · {1} blocking", [String(preview.affected), String(preview.blocking)])}</p>
      {preview.campuses.map(c => <div key={c.campusId} data-tone={c.compatible ? "success" : "danger"} className={cn(deskRow, "space-y-1 text-sm")} data-impact-campus={c.name} data-compatible={c.compatible}>
        <p className="flex flex-wrap items-center gap-2 font-bold text-ink-strong"><span><bdi>{c.name}</bdi> · <bdi dir="ltr">{c.country}</bdi>{c.board ? <> · <bdi>{c.board}</bdi></> : null}</span><DeskPill tone={c.compatible ? "success" : "danger"}>{c.compatible ? ui("Compatible") : ui("Blocked")}</DeskPill></p>
        {c.problems.length ? <Alert tone="danger" compact live="off">{c.problems.map(p => <p key={p} className="text-status-error-text" dir="auto">{ui(p)}</p>)}</Alert> : null}
        {c.changes.map(ch => <p key={ch.key}>{ui(LABELS[ch.key] ?? ch.key)}: <bdi>{show(ui, ch.key, ch.from)}</bdi> → <bdi>{show(ui, ch.key, ch.to)}</bdi>{ch.locked ? <> · {ui("Locked")}</> : null}</p>)}
        {c.keptOverrides.map(o => <p key={o.id} className="text-status-warning-text">{ui("Campus override kept: {0}", [ui(LABELS[o.key] ?? o.key)])}</p>)}
        {c.endedOverrides.map(o => <p key={o.id} className="text-status-error-text">{ui("Campus override ends (no longer overridable): {0}", [ui(LABELS[o.key] ?? o.key)])}</p>)}
      </div>)}
      <div className="grid gap-2 sm:grid-cols-3"><FormField name="sch-date" label={ui("Effective from")}><Input type="datetime-local" value={effective} onChange={e => { setEffective(e.target.value); setPreview(null); }} dir="ltr" data-schedule-date /></FormField>
        {soleOwner
          ? <p className="text-xs leading-relaxed text-ink-muted sm:col-span-1" data-sole-reviewer>{ui("You are the only group admin, so you approve this version yourself. You give a reason, and it is recorded.")}</p>
          : <FormField name="sch-rev" label={ui("Reviewer")}><Select value={reviewer} onChange={e => setReviewer(e.target.value)} data-schedule-reviewer><option value="">{ui("Choose")}</option>{otherOwners.map(o => <option key={o.id} value={o.id}>{o.fullName}</option>)}</Select></FormField>}
        <div className="flex items-end"><Button disabled={busy || !effective || (!soleOwner && !reviewer) || preview.blocking > 0} onClick={() => { if (soleOwner) { setSelfApprove(true); return; } void run(async () => { await call("/api/group-policy", "POST", { action: "submit", versionId: draft.id, effectiveFrom: new Date(effective).toISOString(), reviewerId: reviewer, previewHash: preview.previewHash }); setPreview(null); }, "Sent for review.", "submit"); }} loading={pendingAction === "submit"} data-schedule-submit>{ui("Schedule v{0}", [String(preview.version)])}</Button></div></div>
      <ConfirmAction open={selfApprove} tone="warning" title={ui("Approve v{0} yourself?", [String(preview.version)])}
        description={ui("No other group admin can review this version. It is scheduled with your reason, the record shows it was self-approved, and campuses see it from the effective date.")}
        confirmLabel={ui("Approve and schedule v{0}", [String(preview.version)])} cancelLabel={ui("Keep editing")} busy={pendingAction === "self-approve"}
        requireReason={{ label: ui("Why is this change needed now?"), minLength: 10 }}
        onCancel={() => setSelfApprove(false)}
        onConfirm={(reason?: string) => run(async () => {
          // SD3 (§2.5): the sole authority submits to themself and approves with a typed reason.
          await call("/api/group-policy", "POST", { action: "submit", versionId: draft.id, effectiveFrom: new Date(effective).toISOString(), reviewerId: lib.userId, previewHash: preview.previewHash, reason });
          await call("/api/group-policy", "POST", { action: "review", versionId: draft.id, decision: "APPROVE", reason });
          setPreview(null); setSelfApprove(false);
        }, "Version scheduled.", "self-approve")} />
      {preview.blocking ? <Alert tone="danger" compact live="off">{ui("Blocked campuses cannot receive this template. Remove them or create a separate template for them.")}</Alert> : null}
    </div> : null}
  </div>;
}
const statusLabel = (ui: Ui, s: string) => ({ DRAFT: ui("Draft"), IN_REVIEW: ui("Awaiting review"), SCHEDULED: ui("Scheduled"), ACTIVE: ui("Active"), SUPERSEDED: ui("Superseded"), WITHDRAWN: ui("Withdrawn") } as Record<string, string>)[s] ?? s;

/**
 * Group standards (M12): `focus="library"` is the group admin's Standards › Group policy tab (templates and
 * drafts); `focus="reviews"` is Approvals › Policy (campus override requests and versions waiting for this
 * admin's review). Without `focus` the old combined screen renders (campus policy + library).
 */
export function GroupPolicy({ focus }: { focus?: "library" | "reviews" } = {}) {
  const ui = useUiText();
  const { date, dateTime } = useLocaleFormat();
  const [lib, setLib] = useState<Library | null>(null), [denied, setDenied] = useState(false), [open, setOpen] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ domain: "GRADING", title: "", countries: "", boards: "", campusIds: [] as string[] });
  const load = useCallback(async () => { try { setLib(await call("/api/group-policy?view=library")); setDenied(false); } catch { setDenied(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [declining, setDeclining] = useState<Library["pending"][number] | null>(null);
  const [selfReview, setSelfReview] = useState<Version | null>(null);
  const run = async (work: () => Promise<unknown>, done: string, tag?: string) => { setBusy(true); setPendingAction(tag ?? null); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(friendlyErrorMessage(e, ui("The change was not saved."))); return false; } finally { setBusy(false); setPendingAction(null); } };

  const overrideRequests = lib?.pending.length ? <DeskSection tone="warning" icon={GitBranch} title={ui("Override requests")} action={<DeskPill tone="warning">{lib.pending.length}</DeskPill>} className="space-y-2" data-override-requests>{lib.pending.map(o => <div key={o.id} data-tone="warning" className={cn(deskRow, "flex flex-wrap items-center justify-between gap-3 text-sm")} data-override-request={o.key}>
    <span className="min-w-0 flex-1 basis-60"><bdi className="font-semibold text-ink-strong">{lib.campuses.find(c => c.id === o.campusId)?.name}</bdi> · {ui(LABELS[o.key] ?? o.key)}: <bdi>{show(ui, o.key, o.value)}</bdi> · {ui("until {0}", [date(o.validUntil)])} · <span dir="auto">{o.reason}</span></span>
    {o.requestedById !== lib.userId ? <span className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/group-policy", "POST", { action: "decide-override", id: o.id, decision: "APPROVE" }), "Override approved.", `approve-${o.id}`)} loading={pendingAction === `approve-${o.id}`} data-override-approve>{ui("Approve")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeclining(o)} data-override-decline>{ui("Decline")}</Button></span> : <span className="text-xs text-ink-muted">{ui("Another owner must decide your own request.")}</span>}
  </div>)}</DeskSection> : null;

  const declineConfirm = <ConfirmAction open={Boolean(declining)} tone="danger" title={ui("Decline this override?")}
    description={ui("The campus keeps the group value. The campus admin who asked is told.")} confirmLabel={ui("Decline")} cancelLabel={ui("Keep editing")}
    busy={Boolean(declining) && pendingAction === `decline-${declining?.id}`}
    onCancel={() => setDeclining(null)}
    onConfirm={() => { const target = declining; if (!target) return; return run(() => call("/api/group-policy", "POST", { action: "decide-override", id: target.id, decision: "DECLINE" }), "Override declined.", `decline-${target.id}`).then(saved => { if (saved) setDeclining(null); }); }} />;

  if (focus === "reviews") {
    if (denied) return <ErrorState description={ui("Group policy reviews could not be loaded.")} onRetry={() => void load()} />;
    if (!lib) return <SkeletonList rows={3} label={ui("Loading policy reviews")} />;
    const mine = lib.templates.flatMap(t => t.versions.filter(v => v.status === "IN_REVIEW" && v.reviewerId === lib.userId).map(v => ({ template: t, version: v })));
    return <div className="min-w-0 space-y-4" data-group-policy-reviews>
      {mine.length ? <DeskSection tone="info" icon={CalendarClock} title={ui("Versions waiting for your review")} action={<DeskPill tone="info">{mine.length}</DeskPill>} className="space-y-2" data-version-reviews>{mine.map(({ template, version }) => <div key={version.id} data-tone="info" className={cn(deskRow, "flex flex-wrap items-center justify-between gap-3 text-sm")} data-version-review={version.id}>
        <span className="flex min-w-0 flex-1 basis-60 items-start gap-3"><DeskRowIcon icon={FileStack} /><span className="min-w-0"><bdi className="font-semibold text-ink-strong">{template.title}</bdi> · <bdi dir="ltr">v{version.version}</bdi>{version.effectiveFrom ? <> · {ui("from {0}", [dateTime(version.effectiveFrom)])}</> : null}</span></span>
        <span className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} loading={pendingAction === `review-approve-${version.id}`} onClick={() => { if (version.submittedById === lib.userId) { setSelfReview(version); return; } void run(() => call("/api/group-policy", "POST", { action: "review", versionId: version.id, decision: "APPROVE" }), "Version scheduled.", `review-approve-${version.id}`); }}>{ui("Approve and schedule v{0}", [String(version.version)])}</Button>
          <Button size="sm" variant="outline" disabled={busy} loading={pendingAction === `review-return-${version.id}`} onClick={() => void run(() => call("/api/group-policy", "POST", { action: "review", versionId: version.id, decision: "RETURN" }), "Returned to draft.", `review-return-${version.id}`)}>{ui("Return to draft")}</Button>
        </span>
      </div>)}</DeskSection> : null}
      {overrideRequests}
      {!mine.length && !lib.pending.length ? <div className="sk-panel"><EmptyState size="sm" icon={ShieldCheck} title={ui("No policy decisions are waiting")} description={ui("Campus override requests and policy versions sent to you for review appear here.")} /></div> : null}
      {declineConfirm}
      <ConfirmAction open={Boolean(selfReview)} tone="warning" title={ui("Approve v{0} yourself?", [String(selfReview?.version ?? "")])}
        description={ui("No other group admin can review this version. It is scheduled with your reason, the record shows it was self-approved, and campuses see it from the effective date.")}
        confirmLabel={ui("Approve and schedule v{0}", [String(selfReview?.version ?? "")])} cancelLabel={ui("Keep editing")}
        busy={Boolean(selfReview) && pendingAction === `review-approve-${selfReview?.id}`}
        requireReason={{ label: ui("Why is this change needed now?"), minLength: 10 }}
        onCancel={() => setSelfReview(null)}
        onConfirm={(reason?: string) => { const target = selfReview; if (!target) return; return run(() => call("/api/group-policy", "POST", { action: "review", versionId: target.id, decision: "APPROVE", reason }), "Version scheduled.", `review-approve-${target.id}`).then(saved => { if (saved) setSelfReview(null); }); }} />
    </div>;
  }

  const library = denied ? (focus === "library" ? <ErrorState description={ui("Group templates could not be loaded.")} onRetry={() => void load()} /> : null) : lib ? <section className="space-y-4" data-group-library>
      {focus ? null : <PageHeader headingLevel={2} icon={Layers} title="Group templates" />}
      {focus ? null : overrideRequests}
      {lib.templates.length ? lib.templates.map(t => { const current = t.versions[0]; return <div key={t.id} className="sk-panel space-y-3 p-4 sm:p-5" data-template={t.title}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-1 basis-60 items-start gap-3"><DeskRowIcon icon={t.domain === "GRADING" ? Scale : CalendarClock} /><div className="min-w-0 space-y-1"><p className="flex flex-wrap items-center gap-2 font-bold text-ink-strong"><span><bdi>{t.title}</bdi> · {t.domain === "GRADING" ? ui("Grading") : ui("Calendar")}</span>{current ? <DeskPill tone={versionTone(current.status)}><bdi dir="ltr">v{current.version}</bdi> · {statusLabel(ui, current.status)}</DeskPill> : null}</p><p className="text-xs text-ink-muted">{ui("Campuses: {0}", [t.campusIds.map(id => lib.campuses.find(c => c.id === id)?.name ?? "").join(", ")])}{t.countries.length ? <> · {ui("Countries: {0}", [t.countries.join(", ")])}</> : null}{t.boards.length ? <> · {ui("Boards: {0}", [t.boards.join(", ")])}</> : null}</p></div></div><Button size="sm" variant="outline" onClick={() => setOpen(open === t.id ? null : t.id)} data-template-open>{open === t.id ? ui("Close") : ui("Edit")}</Button></div>
        {open === t.id ? <DraftEditor key={t.versions.map(v => v.id + v.status).join()} template={t} lib={lib} reload={load} /> : null}
      </div>; }) : <div className="sk-panel" data-library-empty><EmptyState size="sm" icon={Layers} title={ui("No group template yet. Until one is published, each campus keeps its current settings as its baseline.")} primaryAction={{ id: "new-template", label: "New template", onClick: () => document.querySelector<HTMLInputElement>("[data-new-title]")?.focus() }} /></div>}
      <DeskSection icon={FileStack} title={ui("New template")} className="space-y-3" data-template-new>
        <div className="grid gap-2 sm:grid-cols-2"><FormField name="nt-domain" label={ui("Policy domain")}><Select value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} data-new-domain><option value="GRADING">{ui("Grading")}</option><option value="CALENDAR">{ui("Calendar")}</option></Select></FormField><FormField name="nt-title" label={ui("Template name")}><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} dir="auto" data-new-title /></FormField>
          <FormField name="nt-countries" label={ui("Countries it fits (codes, optional)")}><Input value={form.countries} onChange={e => setForm({ ...form, countries: e.target.value })} dir="ltr" placeholder="PK, AE" data-new-countries /></FormField><FormField name="nt-boards" label={ui("Curriculum boards it fits (optional)")}><Input value={form.boards} onChange={e => setForm({ ...form, boards: e.target.value })} dir="auto" placeholder="FBISE" data-new-boards /></FormField></div>
        <div className="flex flex-wrap gap-3">{lib.campuses.map(c => <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={form.campusIds.includes(c.id)} onChange={e => setForm({ ...form, campusIds: e.target.checked ? [...form.campusIds, c.id] : form.campusIds.filter(x => x !== c.id) })} data-new-campus={c.name} /><bdi>{c.name}</bdi> <span className="text-xs text-ink-muted">(<bdi dir="ltr">{c.country}</bdi>{c.board ? <> · <bdi>{c.board}</bdi></> : null})</span></label>)}</div>
        <Button disabled={busy || form.title.trim().length < 3 || !form.campusIds.length} onClick={() => void run(async () => { await call("/api/group-policy", "POST", { action: "template", domain: form.domain, title: form.title, countries: form.countries.split(",").map(s => s.trim()).filter(Boolean), boards: form.boards.split(",").map(s => s.trim()).filter(Boolean), campusIds: form.campusIds }); setForm({ domain: "GRADING", title: "", countries: "", boards: "", campusIds: [] }); }, "Template created. Add a draft version next.", "create")} loading={pendingAction === "create"} data-new-create>{ui("Create template")}</Button>
      </DeskSection>
    </section> : <SkeletonList rows={3} label={ui("Loading group templates")} />;

  if (focus === "library") return <div className="min-w-0 space-y-6" data-group-policy>{library}{declineConfirm}</div>;

  return <div className="min-w-0 space-y-6" data-group-policy>
    <PageHeader headingLevel={2} icon={ShieldCheck} title="Group policy" description="Shared rules for campuses, with reviewed local exceptions. Published versions never change; new rules apply from their effective date." />
    <CampusPolicy campuses={lib?.campuses} />
    {library}
    {declineConfirm}
  </div>;
}
