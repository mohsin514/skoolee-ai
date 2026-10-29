"use client";

import { useCallback, useEffect, useState } from "react";
import { BookCheck } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { curriculumPacksCopy, fill, type CurriculumPacksCopy } from "./curriculum-packs-copy";

type Evidence = { sourceId: string; rightsScope: string; permissionEvidence: string; hasDocument: boolean; documentName?: string };
type Activation = {
  id: string; campusId: string; packId: string; version: number; status: "DRAFT" | "APPROVED" | "ACTIVE" | "REVOKED"; geography: string; schoolGrade: string;
  sourceEvidence: Evidence[]; sources: { id: string; reference: string; authority: string; url: string }[];
  educatorApprover: string | null; approvedOn: string | null; reviewDueOn: string | null; revokedReason: string | null; contentSha256: string;
  blockers: string[]; events: { from: string | null; to: string; actorRole: string; reason: string | null; at: string }[];
  can: { edit: boolean; approve: boolean; activate: boolean; revoke: boolean };
};
type CatalogueItem = { id: string; packId: string; version: number; board: string; subject: string; schoolGrade: string; examYear: string; language: string; unverifiedCount: number };
type Overview = { catalogue: CatalogueItem[]; activations: Activation[]; campuses: { id: string; name: string }[]; geographies: string[]; canRequest: boolean; uploadsAvailable: boolean };

const tone: Record<Activation["status"], BadgeProps["variant"]> = { DRAFT: "neutral", APPROVED: "info", ACTIVE: "success", REVOKED: "danger" };
const statusLabel = (t: CurriculumPacksCopy, status: Activation["status"]) => t[`status${status}`];
const geoLabel = (t: CurriculumPacksCopy, geography: string) => (t as Record<string, string>)[`geo${geography}`] ?? geography;

async function send(url: string, body: BodyInit, json = true) {
  const response = await fetch(url, { method: "POST", ...(json ? { headers: { "Content-Type": "application/json" } } : {}), body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error([typeof payload.error === "string" ? payload.error : "", ...(Array.isArray(payload.details) ? payload.details.slice(1, 6) : [])].filter(Boolean).join(" "));
  return payload;
}

/** SKAI-1008..1012: a school's curriculum pack requests, evidence, educator approval, activation and revocation. */
export function CurriculumPacks() {
  const { language } = useLocale();
  const t = curriculumPacksCopy(language);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/school-ai/curriculum-packs", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setData(payload); else setError(typeof payload.error === "string" ? payload.error : t.loadError);
    } catch { setError(t.loadError); }
  }, [t.loadError]);
  useEffect(() => { void load(); }, [load]);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(t.saved); await load(); } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : t.loadError); }
    finally { setBusy(false); }
  };
  return <div className="min-w-0 space-y-6" data-curriculum-packs>
    <PageHeader icon={BookCheck} title="Curriculum packs" description={t.intro} />
    {error && <Alert tone="danger" title={<bdi dir="auto">{error}</bdi>} actions={!data ? <Button variant="outline" onClick={() => void load()}>{t.retry}</Button> : undefined} />}
    {notice && !error && <p role="status" className="text-sm text-status-success-text">{notice}</p>}
    {data && <>
      <section aria-labelledby="pack-requests" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pack-requests" className="text-lg font-semibold text-ink-strong">{t.requestsTitle}</h2>
          {data.canRequest && !requesting && <Button onClick={() => setRequesting(true)} data-pack-request-open>{t.request}</Button>}
        </div>
        {requesting && <RequestForm t={t} data={data} busy={busy} onCancel={() => setRequesting(false)} onSubmit={body => act(async () => { await send("/api/school-ai/curriculum-packs", JSON.stringify(body)); setRequesting(false); })} />}
        {!data.activations.length && <p className="text-sm text-ink-muted">{t.noRequests}</p>}
        <ul className="space-y-4">{data.activations.map(activation => <li key={activation.id}><ActivationCard t={t} activation={activation} campus={data.campuses.find(item => item.id === activation.campusId)?.name ?? ""} busy={busy} uploads={data.uploadsAvailable} act={act} /></li>)}</ul>
      </section>
      <section aria-labelledby="pack-catalogue" className="space-y-3">
        <h2 id="pack-catalogue" className="text-lg font-semibold text-ink-strong">{t.catalogueTitle}</h2>
        <p className="text-sm text-ink-muted">{t.catalogueIntro}</p>
        <ul className="grid gap-3 md:grid-cols-2">{data.catalogue.map(item => <li key={item.id} className="sk-panel space-y-1 p-4" data-pack-catalogue={item.packId}>
          <p className="font-semibold text-ink-strong"><bdi dir="ltr">{item.packId}</bdi> · {fill(t.version, [item.version])}</p>
          <p className="text-sm text-ink-muted">{t.board}: {item.board} · {t.grade}: <bdi dir="auto">{item.schoolGrade}</bdi> · {t.examYear}: {item.examYear} · {t.language}: {item.language.toUpperCase()}</p>
          <Badge variant={item.unverifiedCount ? "warning" : "success"} size="sm">{item.unverifiedCount ? fill(t.unverified, [item.unverifiedCount]) : t.verified}</Badge>
        </li>)}</ul>
      </section>
    </>}
  </div>;
}

function RequestForm({ t, data, busy, onCancel, onSubmit }: { t: CurriculumPacksCopy; data: Overview; busy: boolean; onCancel: () => void; onSubmit: (body: Record<string, string>) => void }) {
  const [packVersionId, setPack] = useState(data.catalogue[0]?.id ?? "");
  const [campusId, setCampus] = useState(data.campuses[0]?.id ?? "");
  const [geography, setGeography] = useState(data.geographies[0] ?? "");
  const [schoolGrade, setGrade] = useState(data.catalogue[0]?.schoolGrade ?? "");
  const [localBudgetApprover, setBudget] = useState("");
  return <form className="sk-panel grid gap-4 p-4 md:grid-cols-2" aria-label={t.requestTitle} onSubmit={event => { event.preventDefault(); onSubmit({ packVersionId, campusId, geography, schoolGrade, ...(localBudgetApprover.trim() ? { localBudgetApprover } : {}) }); }}>
    <FormField name="pack-version" label={t.pack}><Select required value={packVersionId} onChange={event => { setPack(event.target.value); setGrade(data.catalogue.find(item => item.id === event.target.value)?.schoolGrade ?? ""); }}>{data.catalogue.map(item => <option key={item.id} value={item.id}>{`${item.packId} · ${fill(t.version, [item.version])}`}</option>)}</Select></FormField>
    <FormField name="pack-campus" label={t.campus}><Select required value={campusId} onChange={event => setCampus(event.target.value)}>{data.campuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
    <FormField name="pack-geography" label={t.geography}><Select required value={geography} onChange={event => setGeography(event.target.value)}>{data.geographies.map(item => <option key={item} value={item}>{geoLabel(t, item)}</option>)}</Select></FormField>
    <FormField name="pack-grade" label={t.schoolGrade}><Input required maxLength={40} value={schoolGrade} onChange={event => setGrade(event.target.value)} /></FormField>
    <FormField name="pack-budget" label={t.budgetApprover}><Input maxLength={120} value={localBudgetApprover} onChange={event => setBudget(event.target.value)} /></FormField>
    <div className="flex flex-wrap items-end gap-2"><Button type="submit" disabled={busy} data-pack-request-submit>{t.submit}</Button><Button type="button" variant="outline" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function ActivationCard({ t, activation, campus, busy, uploads, act }: { t: CurriculumPacksCopy; activation: Activation; campus: string; busy: boolean; uploads: boolean; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [approvedOn, setApprovedOn] = useState(today);
  const [reviewDueOn, setReviewDueOn] = useState("");
  const [reason, setReason] = useState("");
  const base = `/api/school-ai/curriculum-packs/${encodeURIComponent(activation.id)}`;
  return <article className="sk-panel space-y-4 p-4" data-pack-activation={activation.status}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold text-ink-strong"><bdi dir="ltr">{activation.packId}</bdi> · {fill(t.version, [activation.version])}</h3>
        <p className="text-sm text-ink-muted">{t.campus}: {campus} · {t.grade}: <bdi dir="auto">{activation.schoolGrade}</bdi> · {geoLabel(t, activation.geography)}</p></div>
      <Badge variant={tone[activation.status]} dot>{statusLabel(t, activation.status)}</Badge>
    </header>
    {activation.status === "REVOKED" && activation.revokedReason && <Alert tone="neutral" title={fill(t.revokedBecause, [activation.revokedReason])} />}
    {activation.status === "ACTIVE" && !activation.blockers.length && <Alert tone="success" title={statusLabel(t, "ACTIVE")}>{fill(t.activeBody, [activation.contentSha256.slice(0, 12)])}</Alert>}
    {activation.status !== "REVOKED" && activation.blockers.length > 0 && <Alert tone="warning" title={t.blockedTitle} data-pack-blockers>
      <ul className="list-disc space-y-1 ps-5 text-sm">{activation.blockers.map(item => <li key={item}><bdi dir="auto">{item}</bdi></li>)}</ul>
    </Alert>}
    {activation.status === "APPROVED" && !activation.blockers.length && <Alert tone="info" title={t.readyTitle}>{t.readyBody}</Alert>}
    {activation.educatorApprover && activation.approvedOn && <p className="text-sm text-ink-muted">{fill(t.approvedBy, [activation.educatorApprover, activation.approvedOn, activation.reviewDueOn ?? ""])}</p>}

    <section className="space-y-3"><h4 className="text-sm font-semibold text-ink-strong">{t.evidenceTitle}</h4>
      {activation.sources.map(source => <EvidenceRow key={source.id} t={t} source={source} evidence={activation.sourceEvidence.find(item => item.sourceId === source.id)} editable={activation.can.edit} uploads={uploads} busy={busy} onSave={form => act(() => send(`${base}/evidence`, form, false))} />)}
    </section>

    {activation.can.approve && <form className="grid gap-3 md:grid-cols-3" aria-label={t.approveTitle} onSubmit={event => { event.preventDefault(); void act(() => send(`${base}/transition`, JSON.stringify({ to: "APPROVED", approvedOn, reviewDueOn }))); }}>
      <FormField name={`approved-on-${activation.id}`} label={t.approvedOn}><Input type="date" required max={today} value={approvedOn} onChange={event => setApprovedOn(event.target.value)} /></FormField>
      <FormField name={`review-due-${activation.id}`} label={t.reviewDueOn}><Input type="date" required min={today} value={reviewDueOn} onChange={event => setReviewDueOn(event.target.value)} /></FormField>
      <div className="flex items-end"><Button type="submit" disabled={busy} data-pack-approve>{t.approve}</Button></div>
    </form>}
    <div className="flex flex-wrap items-end gap-3">
      {activation.can.activate && <Button disabled={busy || activation.blockers.length > 0} onClick={() => void act(() => send(`${base}/transition`, JSON.stringify({ to: "ACTIVE" })))} data-pack-activate>{t.activate}</Button>}
      {activation.can.revoke && <form className="flex flex-1 flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void act(() => send(`${base}/transition`, JSON.stringify({ to: "REVOKED", reason }))); }}>
        <FormField name={`revoke-reason-${activation.id}`} label={t.revokeReason} className="min-w-64 flex-1"><Input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></FormField>
        <Button type="submit" variant="outline" disabled={busy || !reason.trim()} data-pack-revoke>{t.revoke}</Button>
      </form>}
    </div>
    {activation.events.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">{t.history}</summary>
      <ol className="mt-2 space-y-1 text-sm text-ink-muted">{activation.events.map(event => <li key={`${event.at}-${event.to}`}>{new Date(event.at).toLocaleString()} · {event.from ? `${statusLabel(t, event.from as Activation["status"])} → ` : ""}{statusLabel(t, event.to as Activation["status"])} · {event.actorRole}{event.reason ? <> · <bdi dir="auto">{event.reason}</bdi></> : null}</li>)}</ol>
    </details>}
  </article>;
}

function EvidenceRow({ t, source, evidence, editable, uploads, busy, onSave }: { t: CurriculumPacksCopy; source: Activation["sources"][number]; evidence?: Evidence; editable: boolean; uploads: boolean; busy: boolean; onSave: (form: FormData) => Promise<void> }) {
  const [rightsScope, setRights] = useState(evidence?.rightsScope ?? "");
  const [permissionEvidence, setPermission] = useState(evidence?.permissionEvidence ?? "");
  const [file, setFile] = useState<File | null>(null);
  return <div className="rounded-xl border border-border-subtle p-3 space-y-2" data-pack-source={source.id}>
    <p className="text-sm font-medium text-ink-strong"><bdi dir="auto">{source.reference}</bdi></p>
    <p className="text-xs text-ink-subtle"><bdi dir="auto">{source.authority}</bdi> · <a className="underline" href={source.url} target="_blank" rel="noreferrer noopener"><bdi dir="ltr">{source.url}</bdi></a></p>
    {!editable && <p className="text-sm text-ink-muted">{evidence ? <><bdi dir="auto">{evidence.rightsScope}</bdi> · <bdi dir="auto">{evidence.permissionEvidence}</bdi>{evidence.hasDocument ? ` · ${t.documentAttached}` : ""}</> : t.missingEvidence}</p>}
    {editable && <form className="grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(); form.set("sourceId", source.id); form.set("rightsScope", rightsScope); form.set("permissionEvidence", permissionEvidence); if (file) form.set("file", file); void onSave(form); }}>
      <FormField name={`rights-${source.id}`} label={t.rightsScope}><Textarea required maxLength={500} value={rightsScope} onChange={event => setRights(event.target.value)} /></FormField>
      <FormField name={`permission-${source.id}`} label={t.permissionEvidence}><Textarea required maxLength={500} value={permissionEvidence} onChange={event => setPermission(event.target.value)} /></FormField>
      {uploads && <FormField name={`document-${source.id}`} label={t.document}><Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} /></FormField>}
      <div className="flex items-end gap-2"><Button type="submit" variant="outline" disabled={busy} data-pack-evidence-save>{t.saveEvidence}</Button>{evidence?.hasDocument && <Badge variant="info" size="sm">{t.documentAttached}</Badge>}</div>
    </form>}
  </div>;
}
