"use client";
import { SkeletonList } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useFetch } from "@/hooks";

import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-471: the learning transfer bridge. Staff import evidence, the family consents, teachers review each
// mapping, and a reviewed bridge plan becomes a draft learning action. No grade is converted and no
// placement is made.
type Rights = "MISSING" | "REVOKED" | "EXPIRED" | "GRANTED";
type Summary = { id: string; institution: string; curriculumName: string; version: string; status: string; rights: Rights };
type Mapping = { decision: string; targetOutcomeIds: string[]; suggestion: { kind: string; targets: { id: string; sharedWords: string[] }[] } | null; note: string | null; stale: boolean; destinationVersion: number | null; version: number };
type Detail = {
  id: string; version: number; status: string; rights: Rights; missing: string[]; downloads: number;
  consent: { fields: string[]; expiresAt: string | null };
  source: { institution: string; curriculumName: string; curriculumId: string; version: string; language: string | null };
  destination: { id: string; title: string; version: number; current: boolean } | null;
  outcomes: { id: string; title: string; code: string | null }[]; curricula: { id: string; title: string; version: number }[];
  objectives: { id: string; version: string; title: string; work: string | null; result: string | null; mapping: Mapping | null }[];
  bridge: { confirmed: { title: string }[]; gaps: { title: string; reason: string }[] } | null; bridgePlanId: string | null;
};
const RIGHTS: Record<Rights, string> = { MISSING: "Waiting for family consent", REVOKED: "The family withdrew consent", EXPIRED: "Family consent expired", GRANTED: "Family consent given" };
const DECISION: Record<string, string> = { PROPOSED: "Not reviewed", ACCEPTED: "Accepted", NOT_COMPARABLE: "Not comparable", REJECTED: "Rejected" };
const STATUS: Record<string, string> = { DRAFT: "Draft", MAPPING: "Mapping in review", PLANNED: "Bridge plan drafted", STALE: "Source changed — review again" };
const FIELD: Record<string, string> = { objectives: "Objectives", work: "Samples of work", results: "Results from the other school" };

async function call(url: string, body?: unknown) {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const payload = await response?.json().catch(() => ({})) ?? {};
  if (!response?.ok) throw new Error(typeof payload.error === "string" ? payload.error : "");
  return payload.data;
}

export function LearningTransferPanel({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const fid = useId();
  const { data: cases, failure, isLoading, refetch: load } = useFetch<Summary[]>(`/api/learning-transfers?studentId=${encodeURIComponent(studentId)}`, {collection:true});
  const [open, setOpen] = useState<string | null>(null);
  const [intake, setIntake] = useState(false);
  const [form, setForm] = useState({ institution: "", learnerRef: "", curriculumId: "", curriculumName: "", version: "", language: "", objectives: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(f => ({ ...f, [key]: event.target.value }));
  const importCase = async () => {
    setBusy(true); setError("");
    try {
      const parsed = JSON.parse(form.objectives) as unknown;
      const objectives = Array.isArray(parsed) ? parsed : (parsed as { objectives?: unknown }).objectives;
      const result = await call("/api/learning-transfers", { action: "import", data: { studentId, source: { institution: form.institution, learnerRef: form.learnerRef, curriculumId: form.curriculumId, curriculumName: form.curriculumName, version: form.version, language: form.language || null, objectives } } });
      setIntake(false); await load(); setOpen(result.id);
    } catch (e) { setError(e instanceof SyntaxError ? ui("The objectives must be a JSON list exported by the other school.") : (e as Error).message || ui("The transfer could not be saved. Try again.")); }
    setBusy(false);
  };
  if (isLoading) return <SkeletonList rows={3} label={ui("Loading…")} />;
  if (failure) return <ErrorState error={failure} onRetry={load} />;
  if (!cases) return null;
  return <section className="sk-panel min-w-0 space-y-3 p-4" aria-labelledby={`${fid}-title`} data-transfer-panel>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={`${fid}-title`} className="text-lg font-bold">{ui("Learning transfer")}</h2>
      <Button size="sm" variant="secondary" onClick={() => setIntake(v => !v)}>{intake ? ui("Close") : ui("Import evidence from another school")}</Button>
    </div>
    <p className="text-sm text-ink-muted">{ui("Use another school's evidence to plan a bridge. Grades are never converted and no class placement is made.")}</p>
    {intake ? <div className="grid min-w-0 gap-3 sm:grid-cols-2" data-transfer-intake>
      {([["institution", "Previous school"], ["learnerRef", "Learner ID at the previous school"], ["curriculumName", "Previous curriculum"], ["curriculumId", "Curriculum identifier"], ["version", "Curriculum version"], ["language", "Language of the records (optional)"]] as const).map(([key, label]) => <div key={key} className="grid min-w-0 gap-1 text-sm font-semibold">
        <label htmlFor={`${fid}-${key}`}>{ui(label)}</label><Input id={`${fid}-${key}`} value={form[key]} onChange={set(key)} dir="auto" /></div>)}
      <div className="grid min-w-0 gap-1 text-sm font-semibold sm:col-span-2"><label htmlFor={`${fid}-objectives`}>{ui("Objectives and work (JSON from the previous school)")}</label>
        <Textarea id={`${fid}-objectives`} dir="ltr" rows={6} value={form.objectives} onChange={set("objectives")} />
        <input type="file" accept="application/json,.json" aria-label={ui("Choose a JSON file")} className="text-sm font-normal" onChange={async event => { const file = event.target.files?.[0]; if (file) { const content = await file.text(); setForm(f => ({ ...f, objectives: content })); } }} />
      </div>
      <div className="sm:col-span-2"><Button disabled={busy || !form.institution || !form.learnerRef || !form.curriculumName || !form.curriculumId || !form.version || !form.objectives} onClick={() => void importCase()}>{ui("Review imported evidence")}</Button></div>
    </div> : null}
    {error ? <Alert compact tone="danger">{error}</Alert> : null}
    {cases.length ? <ul className="space-y-2">{cases.map(row => <li key={row.id} className="min-w-0 rounded-xl border border-border p-3 text-sm" data-transfer-case={row.id} data-transfer-status={row.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-semibold"><bdi>{row.institution}</bdi> · <bdi>{row.curriculumName}</bdi> · <bdi dir="ltr">{row.version}</bdi></p>
        <div className="flex flex-wrap items-center gap-1 text-xs"><Badge size="sm" variant="neutral">{ui(STATUS[row.status] ?? row.status)}</Badge><Badge size="sm" dot variant={row.rights === "GRANTED" ? "success" : "warning"} data-rights={row.rights}>{ui(RIGHTS[row.rights])}</Badge>
          <Button size="sm" variant="secondary" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>{open === row.id ? ui("Hide") : ui("Open")}</Button></div>
      </div>
      {open === row.id ? <TransferCase id={row.id} onChanged={load} /> : null}
    </li>)}</ul> : <p className="rounded-xl bg-muted p-3 text-sm">{ui("No transfers for this learner.")}</p>}
  </section>;
}

function TransferCase({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const ui = useUiText();
  const { language } = useLocale();
  const list = (items: string[]) => new Intl.ListFormat(language, { type: "conjunction" }).format(items);
  const { date } = useLocaleFormat();
  const fid = useId();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState("");
  const [targets, setTargets] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewDate, setReviewDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => { try { const data: Detail = await call(`/api/learning-transfers/${encodeURIComponent(id)}`); setDetail(data); setTargets(Object.fromEntries(data.objectives.map(o => [o.id, o.mapping?.targetOutcomeIds?.length ? o.mapping.targetOutcomeIds : (o.mapping?.suggestion?.targets ?? []).map(t => t.id)]))); } catch (e) { setError((e as Error).message); } }, [id]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const act = async (action: string, data: unknown) => { setBusy(true); setError(""); try { await call("/api/learning-transfers", { action, data }); await load(); await onChanged(); } catch (e) { setError((e as Error).message || ui("The transfer could not be saved. Try again.")); } setBusy(false); };
  if (!detail) return error ? <Alert compact tone="danger" className="mt-2" actions={<Button size="sm" variant="secondary" onClick={() => { setError(""); void load(); }}>{ui("Try again")}</Button>}>{error}</Alert> : <p role="status" className="mt-2 text-sm">{ui("Loading…")}</p>;
  const outcome = (outcomeId: string) => detail.outcomes.find(o => o.id === outcomeId);
  const reviewed = detail.objectives.length > 0 && detail.objectives.every(o => o.mapping && o.mapping.decision !== "PROPOSED" && !o.mapping.stale);
  return <div className="mt-3 min-w-0 space-y-3" data-transfer-detail>
    <dl className="grid gap-1 text-xs sm:grid-cols-2">
      <div><dt className="inline font-semibold">{ui("Previous curriculum")}: </dt><dd className="inline"><bdi>{detail.source.curriculumName}</bdi> (<bdi dir="ltr">{detail.source.curriculumId} · {detail.source.version}</bdi>)</dd></div>
      <div><dt className="inline font-semibold">{ui("Language of the records")}: </dt><dd className="inline">{detail.source.language ? <bdi dir="ltr">{detail.source.language}</bdi> : ui("Not stated")}</dd></div>
      <div><dt className="inline font-semibold">{ui("Shared by the family")}: </dt><dd className="inline">{detail.consent.fields.length ? list(detail.consent.fields.map(f => ui(FIELD[f] ?? f))) : "—"}{detail.consent.expiresAt ? ` · ${ui("until {0}", [date(detail.consent.expiresAt.slice(0, 10))])}` : ""}</dd></div>
    </dl>
    {detail.missing.length ? <ul className="flex flex-wrap gap-2 text-xs" aria-label={ui("Missing from the source")}>{detail.missing.map(m => <li key={m}><Badge size="sm" variant="warning">{m === "LANGUAGE" ? ui("Language not stated") : ui("Some objectives have no work")}</Badge></li>)}</ul> : null}
    {detail.rights !== "GRANTED" ? <Alert tone="warning" live="polite" data-rights-notice>{ui(RIGHTS[detail.rights])}. {ui("The evidence stays hidden until a guardian consents from their account. Your draft is kept.")}</Alert> : <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 gap-1 text-sm font-semibold"><label htmlFor={`${fid}-dest`}>{ui("Destination curriculum")}</label>
          <Select id={`${fid}-dest`} value={destination || detail.destination?.id || ""} onChange={event => setDestination(event.target.value)}><option value="">—</option>{detail.curricula.map(c => <option key={c.id} value={c.id}>{c.title} · v{c.version}</option>)}</Select></div>
        <Button size="sm" variant="secondary" disabled={busy || !(destination || detail.destination?.id)} onClick={() => void act("destination", { caseId: id, curriculumRecordId: destination || detail.destination!.id, version: detail.version })}>{detail.destination ? ui("Suggest again") : ui("Use this curriculum")}</Button>
      </div>
      {detail.destination && !detail.destination.current ? <p className="text-xs text-status-warning-text">{ui("The destination curriculum has a newer version. Choose it again to review against it.")}</p> : null}
      {detail.destination ? <ol className="space-y-3" aria-label={ui("Mapping workbench")}>{detail.objectives.map(o => <li key={o.id} className="grid min-w-0 gap-3 rounded-xl border border-border p-3 md:grid-cols-2" data-objective={o.id} data-decision={o.mapping?.decision ?? "PROPOSED"} data-stale={o.mapping?.stale ? "true" : "false"}>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold text-ink-muted">{ui("From the previous school")} · <bdi dir="ltr">{o.id} v{o.version}</bdi></p>
          <p className="text-sm font-semibold text-ink-strong"><bdi>{o.title}</bdi></p>
          <p className="text-xs">{ui("Work")}: {o.work ? <bdi>{o.work}</bdi> : <span className="text-status-warning-text">{ui("No work shared — a diagnostic check will be proposed")}</span>}</p>
          {o.result ? <p className="text-xs">{ui("Result there (not converted)")}: <bdi>{o.result}</bdi></p> : null}
          {o.mapping?.stale ? <p className="text-xs font-semibold text-status-warning-text">{ui("The source changed. Review this mapping again.")}</p> : null}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold text-ink-muted">{ui("Destination objectives")} · v{detail.destination?.version}</p>
          {o.mapping?.suggestion?.kind === "NOT_COMPARABLE" ? <Alert compact tone="info" live="off">{ui("No comparable objective found. You can still choose one.")}</Alert> : (o.mapping?.suggestion?.targets ?? []).map(t => <p key={t.id} className="text-xs text-ink-subtle">{ui("Suggested")}: <bdi>{outcome(t.id)?.title ?? t.id}</bdi> · {ui("shared words")}: <bdi>{t.sharedWords.join(", ")}</bdi></p>)}
          <fieldset className="space-y-1 text-sm"><legend className="sr-only">{ui("Destination objectives")}</legend>{detail.outcomes.map(out => <label key={out.id} className="flex items-start gap-2"><Checkbox checked={(targets[o.id] ?? []).includes(out.id)} onChange={event => setTargets(t => ({ ...t, [o.id]: event.target.checked ? [...(t[o.id] ?? []), out.id] : (t[o.id] ?? []).filter(x => x !== out.id) }))} /><bdi>{out.title}</bdi></label>)}</fieldset>
          <div className="grid gap-1 text-xs font-semibold"><label htmlFor={`${fid}-${o.id}-note`}>{ui("Note")}</label><Input id={`${fid}-${o.id}-note`} value={notes[o.id] ?? o.mapping?.note ?? ""} onChange={event => setNotes(n => ({ ...n, [o.id]: event.target.value }))} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="sm" variant="neutral">{ui(DECISION[o.mapping?.decision ?? ""] ?? "Not reviewed")}</Badge>
            <Button size="sm" disabled={busy || !(targets[o.id] ?? []).length} onClick={() => void act("review", { caseId: id, sourceObjectiveId: o.id, decision: "ACCEPTED", targetOutcomeIds: targets[o.id] ?? [], note: notes[o.id] || null, version: o.mapping!.version })}>{ui("Accept mapping")}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act("review", { caseId: id, sourceObjectiveId: o.id, decision: "NOT_COMPARABLE", targetOutcomeIds: [], note: notes[o.id] || null, version: o.mapping!.version })}>{ui("Not comparable")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("review", { caseId: id, sourceObjectiveId: o.id, decision: "REJECTED", targetOutcomeIds: [], note: notes[o.id] || null, version: o.mapping!.version })}>{ui("Reject")}</Button>
          </div>
        </div>
      </li>)}</ol> : null}
      {detail.bridge ? <div className="space-y-1 rounded-xl bg-muted p-3 text-sm" data-bridge>
        <p className="font-semibold">{ui("Bridge plan")}</p>
        <p>{ui("Confirmed from prior work")}: {detail.bridge.confirmed.map(c => c.title).join("; ") || "—"}</p>
        <p>{ui("Needs a diagnostic check")}: {detail.bridge.gaps.map(g => g.title).join("; ") || "—"}</p>
        <p className="text-xs text-ink-muted">{ui("A draft learning action was created. Review and activate it under Learning actions.")}</p>
      </div> : null}
      {detail.destination && reviewed ? <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1 text-sm font-semibold"><label htmlFor={`${fid}-review`}>{ui("Review date")}</label><Input id={`${fid}-review`} type="date" value={reviewDate} onChange={event => setReviewDate(event.target.value)} /></div>
        <Button disabled={busy || !reviewDate} onClick={() => void act("bridge", { caseId: id, version: detail.version, reviewDate })}>{ui("Create bridge plan")}</Button>
      </div> : null}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setExporting(true)}>{ui("Download reviewed mapping")}</Button>
    </>}
    {error ? <Alert compact tone="danger">{error}</Alert> : null}
    <ConfirmAction open={exporting} busy={busy} tone="primary" title={ui("Download the reviewed mapping?")}
      description={ui("The file contains only reviewed mappings and the objective titles. Consent is checked again now.")}
      confirmLabel={ui("Download")} cancelLabel={ui("Cancel")}
      detail={<ul className="list-disc ps-4 text-sm">
        <li>{ui("Fields")}: {list(detail.consent.fields.map(f => ui(FIELD[f] ?? f)))}</li>
        <li>{ui("Recipient: you, for this school only")}</li>
        <li>{ui("Consent ends")}: {detail.consent.expiresAt ? date(detail.consent.expiresAt.slice(0, 10)) : "—"}</li>
        <li>{ui("If the family withdraws consent, new downloads stop. Copies already downloaded cannot be recalled.")}</li>
      </ul>}
      onCancel={() => setExporting(false)}
      onConfirm={async () => {
        setExporting(false); setBusy(true); setError("");
        const response = await fetch(`/api/learning-transfers/${encodeURIComponent(id)}/export`, { cache: "no-store" }).catch(() => null);
        if (response?.ok) { const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `transfer-${id}.json`; link.click(); URL.revokeObjectURL(link.href); await load(); }
        else setError((await response?.json().catch(() => ({})))?.error ?? ui("The download was refused."));
        setBusy(false);
      }} />
  </div>;
}

/** Family side: consent to chosen fields until a date, or withdraw. Bounded dialogs on phones. */
export function FamilyTransferConsent() {
  const ui = useUiText();
  const { language } = useLocale();
  const list = (items: string[]) => new Intl.ListFormat(language, { type: "conjunction" }).format(items);
  const { date } = useLocaleFormat();
  const fid = useId();
  const { data: rows, failure, isLoading, refetch: load } = useFetch<{ id: string; child: string; institution: string; curriculumName: string; version: string; objectives: number; rights: Rights; fields: string[]; expiresAt: string | null; downloads: number }[]>("/api/family/transfers", {collection:true});
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ id: string; action: "grant" | "revoke" } | null>(null);
  const [error, setError] = useState("");
  if (isLoading) return <SkeletonList rows={3} label={ui("Loading…")} />;
  if (failure) return <ErrorState error={failure} onRetry={load} />;
  if (!rows?.length) return null;
  const target = rows.find(r => r.id === confirm?.id);
  return <section className="sk-panel min-w-0 space-y-3 p-4" aria-labelledby={`${fid}-title`} data-family-transfer>
    <h2 id={`${fid}-title`} className="text-lg font-bold">{ui("Records from a previous school")}</h2>
    <p className="text-sm text-ink-muted">{ui("Your child's new school asks to use these records to plan support. Choose what to share and until when.")}</p>
    {rows.map(row => <article key={row.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3 text-sm" data-family-transfer-case={row.id} data-rights={row.rights}>
      <p className="font-semibold"><bdi>{row.child}</bdi> · <bdi>{row.institution}</bdi></p>
      <p className="text-xs"><bdi>{row.curriculumName}</bdi> · <bdi dir="ltr">{row.version}</bdi> · {ui("{0} objectives", [String(row.objectives)])}</p>
      <p className="text-xs font-bold">{ui(RIGHTS[row.rights])}{row.expiresAt && row.rights === "GRANTED" ? ` · ${ui("until {0}", [date(row.expiresAt.slice(0, 10))])}` : ""}</p>
      {row.rights === "GRANTED" ? <Button size="sm" variant="outline" onClick={() => setConfirm({ id: row.id, action: "revoke" })}>{ui("Withdraw consent")}</Button> : <>
        <fieldset className="space-y-1"><legend className="font-semibold">{ui("What to share")}</legend>{(["objectives", "work", "results"] as const).map(f => <label key={f} className="flex items-center gap-2"><Checkbox checked={(fields[row.id] ?? ["objectives"]).includes(f)} disabled={f === "objectives"} onChange={event => setFields(s => { const list = s[row.id] ?? ["objectives"]; return { ...s, [row.id]: event.target.checked ? [...list, f] : list.filter(x => x !== f) }; })} />{ui(FIELD[f])}</label>)}</fieldset>
        <div className="grid max-w-xs gap-1 font-semibold"><label htmlFor={`${fid}-${row.id}-exp`}>{ui("Share until")}</label><Input id={`${fid}-${row.id}-exp`} type="date" value={expiry[row.id] ?? ""} onChange={event => setExpiry(s => ({ ...s, [row.id]: event.target.value }))} /></div>
        <Button size="sm" disabled={!expiry[row.id]} onClick={() => setConfirm({ id: row.id, action: "grant" })}>{ui("Review and share")}</Button>
      </>}
    </article>)}
    {error ? <Alert compact tone="danger">{error}</Alert> : null}
    <ConfirmAction open={!!confirm} tone={confirm?.action === "revoke" ? "warning" : "primary"}
      title={confirm?.action === "revoke" ? ui("Withdraw consent?") : ui("Share these records?")}
      description={confirm?.action === "revoke" ? ui("The school will no longer read or download these records. Copies already downloaded cannot be recalled.") : ui("Only the parts you choose are shared, and only with your child's current school.")}
      confirmLabel={confirm?.action === "revoke" ? ui("Withdraw consent") : ui("Share")} cancelLabel={ui("Cancel")}
      detail={target ? <ul className="list-disc ps-4 text-sm">
        {confirm?.action === "grant" ? <><li>{ui("Fields")}: {list((fields[target.id] ?? ["objectives"]).map(f => ui(FIELD[f])))}</li><li>{ui("Shared with: your child's current school")}</li><li>{ui("Until")}: {expiry[target.id] ? date(expiry[target.id]) : "—"}</li></> : <li>{ui("Downloads made before now: {0}", [String(target.downloads)])}</li>}
      </ul> : null}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => {
        const current = confirm; setConfirm(null); setError("");
        if (!current) return;
        try { await call("/api/family/transfers", { action: current.action, data: current.action === "grant" ? { caseId: current.id, fields: fields[current.id] ?? ["objectives"], expiresOn: expiry[current.id] } : { caseId: current.id } }); await load(); }
        catch (e) { setError((e as Error).message || ui("Your choice could not be saved. Try again.")); }
      }} />
  </section>;
}
