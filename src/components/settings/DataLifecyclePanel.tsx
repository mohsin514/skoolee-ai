"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { getDataLifecycleCopy } from "./data-lifecycle-copy";

type Placement = { service: string; provider: string; location: string | null; state: "verified" | "configured" | "unsupported" | "not_configured"; note: string };
type PlanItem = { service: string; from: string | null; to: string | null; outcome: "stays" | "moves" | "outside_region" | "unsupported" };
type LifecycleRequest = {
  id: string; kind: "EXPORT" | "RETENTION_DELETION" | "MIGRATION"; status: string; category: string | null; studentId: string | null; targetRegion: string | null;
  reason: string; requestedBy: string; requestedAt: string; version: number; plan: { items?: PlanItem[]; blockers?: string[]; eligible?: number; held?: number } | null;
  receipt: Record<string, unknown> | null; downloadExpiresAt: string | null; downloadToken: string | null;
};
type Overview = {
  admin: boolean; inventory: Placement[] | null; requests: LifecycleRequest[];
  schedules: Array<{ category: string; retentionDays: number; version: number }>;
  holds: Array<{ id: string; category: string; recordId: string | null; reason: string; placedAt: string }>;
  learners: Array<{ id: string; fullName: string }>;
  categories: Record<string, { label: string; minimumDays: number }>; regions: Record<string, string>;
};
type Preview = { category: string; eligible: number; held: number; categoryHeld: boolean };

const stateTone: Record<Placement["state"], string> = {
  verified: "border-emerald-300 bg-emerald-50 text-emerald-900",
  configured: "border-amber-300 bg-amber-50 text-amber-900",
  unsupported: "border-slate-300 bg-slate-50 text-slate-700",
  not_configured: "border-rose-300 bg-rose-50 text-rose-900",
};

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}

export function DataLifecyclePanel({ userId }: { userId: string }) {
  const { language } = useLocale();
  const t = getDataLifecycleCopy(language);
  const rtl = language === "ar" || language === "ur";
  const [data, setData] = useState<Overview | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [hold, setHold] = useState({ category: "NOTIFICATIONS", recordId: "", reason: "" });
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState({ targetRegion: "ap-south-1", reason: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [exportForm, setExportForm] = useState({ studentId: "", reason: "" });

  const load = useCallback(async () => setData(await call("/api/data-lifecycle")), []);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error.message })); }, [load]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setStatus(null);
    try { await work(); await load(); setStatus({ tone: "ok", text: t.done }); }
    catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); }
    finally { setBusy(false); }
  }
  async function download(request: LifecycleRequest) {
    await run(async () => {
      const response = await fetch(`/api/data-lifecycle/requests/${encodeURIComponent(request.id)}/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: request.downloadToken }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || t.failed);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `learner-export-${request.id}.json`; link.click(); URL.revokeObjectURL(url);
    });
  }

  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value));
  const categoryLabel = (id: string | null) => id ? (t.categories[id as keyof typeof t.categories] ?? data?.categories[id]?.label ?? id) : "";
  const location = (item: Placement) => item.location === "local" ? t.local : item.location ? (data?.regions[item.location] ?? item.location) : t.providerDecides;

  return <section lang={language} dir={rtl ? "rtl" : "ltr"} aria-labelledby="data-lifecycle-heading" className="sk-panel min-w-0 space-y-6 p-4 sm:p-6">
    <header>
      <h1 id="data-lifecycle-heading" className="text-xl font-bold">{t.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{t.intro}</p>
    </header>
    {status && <p role={status.tone === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${status.tone === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{status.text}</p>}
    {!data && !status && <p role="status">{t.loading}</p>}

    {data?.admin && data.inventory && <section aria-labelledby="placement-heading" className="space-y-3">
      <h2 id="placement-heading" className="text-lg font-bold">{t.placementTitle}</h2>
      <p className="text-sm text-slate-600">{t.placementHelp}</p>
      <ul className="space-y-2 sm:hidden">{data.inventory.map(item => <li key={item.service} className="rounded-xl border p-3 text-sm">
        <p className="font-semibold">{t.services[item.service as keyof typeof t.services] ?? item.service}</p>
        <p className="text-slate-600">{t.provider}: <bdi>{item.provider}</bdi> · {t.location}: <bdi dir="ltr">{location(item)}</bdi></p>
        <span className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${stateTone[item.state]}`}>{t.states[item.state]}</span>
      </li>)}</ul>
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full min-w-[36rem] text-start text-sm">
          <thead className="bg-slate-50"><tr>{[t.service, t.provider, t.location, t.state].map(label => <th key={label} scope="col" className="p-3 text-start font-semibold">{label}</th>)}</tr></thead>
          <tbody>{data.inventory.map(item => <tr key={item.service} className="border-t align-top">
            <th scope="row" className="p-3 text-start font-semibold">{t.services[item.service as keyof typeof t.services] ?? item.service}</th>
            <td className="p-3"><bdi>{item.provider}</bdi></td>
            <td className="p-3"><bdi dir="ltr">{location(item)}</bdi></td>
            <td className="p-3"><span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${stateTone[item.state]}`}>{t.states[item.state]}</span><p className="mt-1 text-xs text-slate-500" lang="en" dir="ltr">{item.note}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
      <form className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); run(() => call("/api/data-lifecycle/requests", { method: "POST", body: JSON.stringify({ kind: "MIGRATION", ...plan }) })); }}>
        <p className="text-sm font-semibold sm:col-span-3">{t.planTitle}<span className="mt-1 block font-normal text-slate-600">{t.planHelp}</span></p>
        <label className="grid gap-1 text-sm font-semibold">{t.region}<Select value={plan.targetRegion} onChange={event => setPlan({ ...plan, targetRegion: event.target.value })}>{Object.entries(data.regions).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-semibold">{t.reason}<Input required minLength={5} value={plan.reason} onChange={event => setPlan({ ...plan, reason: event.target.value })} /></label>
        <Button type="submit" disabled={busy}>{t.reviewPlan}</Button>
      </form>
    </section>}

    {data?.admin && <section aria-labelledby="retention-heading" className="space-y-3">
      <h2 id="retention-heading" className="text-lg font-bold">{t.retentionTitle}</h2>
      <ul className="space-y-3">{Object.entries(data.categories).map(([category, meta]) => {
        const schedule = data.schedules.find(item => item.category === category), preview = previews[category];
        return <li key={category} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
          <div><p className="font-semibold">{categoryLabel(category)}</p><p className="text-sm text-slate-600">{t.current}: {schedule ? <><bdi dir="ltr">{schedule.retentionDays}</bdi> · {t.version} <bdi dir="ltr">{schedule.version}</bdi></> : t.notSet}</p>
            {preview && <p role="status" className="mt-1 text-sm"><bdi dir="ltr">{preview.eligible}</bdi> {t.eligible} · <bdi dir="ltr">{preview.held}</bdi> {t.held}</p>}</div>
          <label className="grid gap-1 text-sm font-semibold">{t.keepFor}<Input type="number" min={meta.minimumDays} value={days[category] ?? ""} placeholder={String(schedule?.retentionDays ?? meta.minimumDays)} onChange={event => setDays({ ...days, [category]: event.target.value })} /></label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || !days[category]} onClick={() => run(() => call("/api/data-lifecycle", { method: "POST", body: JSON.stringify({ action: "schedule", category, retentionDays: Number(days[category]), expectedVersion: schedule?.version ?? 0 }) }))}>{t.save}</Button>
            <Button type="button" variant="secondary" disabled={busy || !schedule} onClick={() => run(async () => { const result = await call(`/api/data-lifecycle?preview=${category}`); setPreviews(old => ({ ...old, [category]: result.preview })); })}>{t.preview}</Button>
            <Button type="button" disabled={busy || !schedule} onClick={() => run(() => call("/api/data-lifecycle/requests", { method: "POST", body: JSON.stringify({ kind: "RETENTION_DELETION", category, reason: "Scheduled retention run" }) }))}>{t.requestRun}</Button>
          </div>
        </li>;
      })}</ul>
      <form className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.4fr_auto] lg:items-end" onSubmit={event => { event.preventDefault(); run(() => call("/api/data-lifecycle", { method: "POST", body: JSON.stringify({ action: "hold", category: hold.category, reason: hold.reason, ...(hold.recordId.trim() ? { recordId: hold.recordId.trim() } : {}) }) })); }}>
        <label className="grid gap-1 text-sm font-semibold">{t.category}<Select value={hold.category} onChange={event => setHold({ ...hold, category: event.target.value })}>{Object.keys(data.categories).map(id => <option key={id} value={id}>{categoryLabel(id)}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-semibold">{t.recordOptional}<Input dir="ltr" value={hold.recordId} onChange={event => setHold({ ...hold, recordId: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t.reason}<Input required minLength={5} value={hold.reason} onChange={event => setHold({ ...hold, reason: event.target.value })} /></label>
        <Button type="submit" disabled={busy}>{t.placeHold}</Button>
      </form>
      <h3 className="font-semibold">{t.holdsTitle}</h3>
      {data.holds.length === 0 ? <p className="text-sm text-slate-600">{t.noHolds}</p> : <ul className="space-y-2">{data.holds.map(item => <li key={item.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <p className="text-sm"><span className="font-semibold">{categoryLabel(item.category)}</span> · {item.recordId ? <bdi dir="ltr">{item.recordId}</bdi> : t.wholeCategory}<span className="block text-slate-600">{item.reason} · {date(item.placedAt)}</span></p>
        <label className="grid gap-1 text-sm font-semibold">{t.releaseReason}<Input value={releaseReasons[item.id] ?? ""} onChange={event => setReleaseReasons({ ...releaseReasons, [item.id]: event.target.value })} /></label>
        <Button type="button" variant="outline" disabled={busy || (releaseReasons[item.id] ?? "").trim().length < 5} onClick={() => run(() => call("/api/data-lifecycle", { method: "POST", body: JSON.stringify({ action: "release", holdId: item.id, reason: releaseReasons[item.id] }) }))}>{t.release}</Button>
      </li>)}</ul>}
    </section>}

    {data && (!data.admin || data.learners.length > 0) && <form aria-labelledby="export-heading" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); run(() => call("/api/data-lifecycle/requests", { method: "POST", body: JSON.stringify({ kind: "EXPORT", ...exportForm }) })); }}>
      <p className="sm:col-span-3"><span id="export-heading" className="block text-lg font-bold">{t.exportTitle}</span><span className="text-sm text-slate-600">{t.exportHelp}</span></p>
      {data.learners.length ? <label className="grid gap-1 text-sm font-semibold">{t.learner}<Select required value={exportForm.studentId} onChange={event => setExportForm({ ...exportForm, studentId: event.target.value })}><option value="">{t.chooseLearner}</option>{data.learners.map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}</Select></label>
        : <label className="grid gap-1 text-sm font-semibold">{t.learnerId}<Input required dir="ltr" value={exportForm.studentId} onChange={event => setExportForm({ ...exportForm, studentId: event.target.value })} /></label>}
      <label className="grid gap-1 text-sm font-semibold">{t.reason}<Input required minLength={5} value={exportForm.reason} onChange={event => setExportForm({ ...exportForm, reason: event.target.value })} /></label>
      <Button type="submit" disabled={busy}>{t.submitExport}</Button>
    </form>}

    {data && <section aria-labelledby="requests-heading" className="space-y-3">
      <h2 id="requests-heading" className="text-lg font-bold">{t.requestsTitle}</h2>
      {data.requests.length === 0 ? <p className="text-sm text-slate-600">{t.noRequests}</p> : <ul className="space-y-3">{data.requests.map(request => {
        const expired = !!request.downloadExpiresAt && new Date(request.downloadExpiresAt) <= new Date();
        return <li key={request.id} className="space-y-2 rounded-xl border p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{t.kinds[request.kind]}</span><span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{t.statuses[request.status as keyof typeof t.statuses] ?? request.status}</span><span className="text-slate-600">{t.requestedAt}: {date(request.requestedAt)}</span></p>
          <p className="text-sm text-slate-700">{request.reason}{request.category ? <> · {categoryLabel(request.category)}</> : null}{request.targetRegion ? <> · <bdi dir="ltr">{data.regions[request.targetRegion]}</bdi></> : null}</p>
          {request.plan?.items && <ul className="grid gap-1 text-xs sm:grid-cols-2">{request.plan.items.map(item => <li key={item.service}>{t.services[item.service as keyof typeof t.services] ?? item.service}: {t.outcomes[item.outcome]}</li>)}</ul>}
          {request.plan?.blockers?.length ? (language === "en"
            ? <ul role="alert" className="list-inside list-disc text-sm text-rose-800">{request.plan.blockers.map(item => <li key={item}>{item}</li>)}</ul>
            : <p role="alert" className="text-sm text-rose-800">{t.blockedBy} {request.plan.items?.filter(item => item.outcome === "unsupported").map(item => t.services[item.service as keyof typeof t.services] ?? item.service).join("، ")}</p>) : null}
          {request.kind === "RETENTION_DELETION" && request.receipt && <p className="text-sm"><bdi dir="ltr">{String(request.receipt.deleted)}</bdi> {t.deleted} · <bdi dir="ltr">{String(request.receipt.held)}</bdi> {t.held}<span className="block text-xs text-slate-600">{t.backupsNote}: {t.backupsText}</span></p>}
          {request.kind === "EXPORT" && request.status === "COMPLETED" && request.downloadToken && (expired ? <p className="text-sm text-slate-600">{t.expired}</p> : <Button type="button" variant="outline" disabled={busy} onClick={() => download(request)}>{t.download}</Button>)}
          {data.admin && request.status === "REQUESTED" && (request.requestedBy === userId ? <p className="text-sm text-slate-600">{t.ownRequest}</p> : <div className="grid gap-2 sm:grid-cols-[2fr_auto_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-semibold">{t.reviewNote}<Input value={notes[request.id] ?? ""} onChange={event => setNotes({ ...notes, [request.id]: event.target.value })} /></label>
            {(["APPROVE", "REJECT"] as const).map(decision => <Button key={decision} type="button" variant={decision === "APPROVE" ? "default" : "outline"} disabled={busy || (notes[request.id] ?? "").trim().length < 3}
              onClick={() => run(() => call("/api/data-lifecycle/requests", { method: "PATCH", body: JSON.stringify({ requestId: request.id, decision, note: notes[request.id], version: request.version }) }))}>{decision === "APPROVE" ? t.approve : t.reject}</Button>)}
          </div>)}
        </li>;
      })}</ul>}
    </section>}
  </section>;
}
