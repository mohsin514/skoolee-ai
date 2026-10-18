"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { getResourceCopy, type ResourceCopy } from "./resource-copy";
import { Textarea } from "@/components/ui/textarea";

// SKO-400: one library for staff authoring, staff previews, learners and families.
type Kind = "HANDOUT" | "NOTES" | "ROUTINE" | "WORKSHEET" | "ANSWER_KEY" | "OTHER";
type Audience = "CLASS" | "CLASS_AND_GUARDIANS" | "STAFF";
type Version = { version: number; fileName: string | null; contentType: string | null; sizeBytes: number | null; link: string | null; description: string; ready: boolean; createdAt: string };
type LearnerItem = { id: string; title: string; kind: Kind; classId: string; language: string; version: number; current: Version };
type StaffItem = { id: string; title: string; kind: Kind; audience: Audience; status: "DRAFT" | "PUBLISHED" | "RETIRED"; sourceRights: string; latestVersion: number; publishedVersion: number | null; versions: Version[] };
type ClassOption = { id: string; name: string; section: string | null };
type View =
  | { mode: "learner"; resources: LearnerItem[] }
  | { mode: "preview"; viewAs: "CLASS" | "GUARDIANS"; classId: string; classes: ClassOption[]; resources: LearnerItem[] }
  | { mode: "staff"; classId: string; classes: ClassOption[]; resources: StaffItem[] };

const KINDS: Kind[] = ["HANDOUT", "NOTES", "ROUTINE", "WORKSHEET", "ANSWER_KEY", "OTHER"];
const AUDIENCES: Audience[] = ["CLASS", "CLASS_AND_GUARDIANS", "STAFF"];
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt";

async function call(path: string, body?: unknown) {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}
/** Reserve → PUT the bytes with the exact type → confirm. A failed upload leaves the version as an unready draft. */
async function sendFile(resourceId: string, version: number, uploadUrl: string | null, file: File | null) {
  if (!uploadUrl || !file) return;
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("The file could not be uploaded. The draft was kept; choose the file again.");
  await call(`/api/resources/${resourceId}`, { op: "confirm", version });
}
const contentOf = (file: File | null, link: string) => file ? { fileName: file.name, contentType: file.type, sizeBytes: file.size } : { link: link.trim() };
const fileHref = (id: string, version?: number) => `/api/resources/${id}/file${version ? `?version=${version}` : ""}`;

export function ResourceLibrary({ audience }: { audience: "staff" | "learner" | "guardian" }) {
  const { language } = useLocale();
  const t = getResourceCopy(language);
  const rtl = language === "ar" || language === "ur";
  const [view, setView] = useState<View | null>(null);
  const [classId, setClassId] = useState("");
  const [viewAs, setViewAs] = useState<"" | "CLASS" | "GUARDIANS">("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams(Object.entries({ classId, viewAs, q }).filter(([, value]) => value));
    const data = await call(`/api/resources?${params}`);
    setView(data);
    if (data.classId && !classId) setClassId(data.classId);
  }, [classId, viewAs, q]);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setStatus(null);
    try { await work(); await load(); setStatus({ tone: "ok", text: t.saved }); return true; }
    catch (error) { await load().catch(() => undefined); setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); return false; }
    finally { setBusy(false); }
  }

  const banner = status && <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{status.text}</p>;
  const size = (bytes: number | null) => {
    if (!bytes) return "";
    const [unit, value] = bytes >= 1_048_576 ? ["megabyte", bytes / 1_048_576] : bytes >= 1024 ? ["kilobyte", bytes / 1024] : ["byte", bytes];
    return new Intl.NumberFormat(language, { style: "unit", unit, maximumFractionDigits: 1 }).format(value);
  };
  const openLink = (id: string, current: Version, version?: number) => current.link
    ? <a className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 underline" href={fileHref(id, version)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden />{t.open}</a>
    : <a className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 underline" href={fileHref(id, version)}><Download className="h-4 w-4" aria-hidden />{t.download}{current.fileName ? <span className="sr-only">: {current.fileName}</span> : null}</a>;

  const learnerList = (items: LearnerItem[]) => items.length === 0
    ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">{audience === "staff" ? t.empty : t.learnerEmpty}</p>
    : <ul className="grid gap-3" aria-label={t.title}>{items.map(item => <li key={item.id} className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-semibold" dir="auto">{item.title}</p><p className="text-xs text-slate-500">{t.kinds[item.kind]} · {t.version} {item.version}{item.current.fileName ? ` · ${item.current.fileName} ${size(item.current.sizeBytes)}` : ""}</p></div>
        {openLink(item.id, item.current)}
      </div>
      <p className="mt-2 text-sm text-slate-700" dir="auto">{item.current.description}</p>
    </li>)}</ul>;

  const search = <label className="grid gap-1 text-xs font-semibold">{t.search}<Input type="search" value={q} onChange={event => setQ(event.target.value)} /></label>;

  if (!view) return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3">{banner ?? <p className="text-sm text-slate-600">{t.loading}</p>}</div>;
  if (view.mode === "learner") return <div dir={rtl ? "rtl" : "ltr"} className="space-y-4">{banner}{search}{learnerList(view.resources)}</div>;

  return <div dir={rtl ? "rtl" : "ltr"} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-xs font-semibold">{t.class}<Select value={view.classId} onChange={event => { setClassId(event.target.value); setAdding(false); }}>
        {view.classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` ${klass.section}` : ""}</option>)}</Select></label>
      <label className="grid gap-1 text-xs font-semibold">{t.view}<Select value={viewAs} onChange={event => setViewAs(event.target.value as typeof viewAs)}>
        <option value="">{t.viewStaff}</option><option value="CLASS">{t.viewClass}</option><option value="GUARDIANS">{t.viewGuardians}</option></Select></label>
      {search}
    </div>
    {banner}
    {view.mode === "preview" ? <>
      <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><Eye className="h-4 w-4" aria-hidden />{t.previewBanner}</p>
      {learnerList(view.resources)}
    </> : <>
      {adding ? <ResourceForm t={t} language={language} classId={view.classId} busy={busy} onCancel={() => setAdding(false)} onSubmit={async (body, file) => {
        // Once the draft exists the form closes even if the upload fails: retrying here would duplicate it.
        let created = false;
        await run(async () => { const result = await call("/api/resources", body); created = true; await sendFile(result.resource.id, 1, result.uploadUrl, file); });
        if (created) setAdding(false);
      }} /> : <Button type="button" onClick={() => setAdding(true)}>{t.add}</Button>}
      {view.resources.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">{t.empty}</p>
        : <ul className="grid gap-3" aria-label={t.title}>{view.resources.map(item => <li key={item.id} className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold" dir="auto">{item.title}</p>
              <p className="text-xs text-slate-500">{t.kinds[item.kind]} · {t.audiences[item.audience]}</p>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{t.statuses[item.status]}{item.publishedVersion ? ` · v${item.publishedVersion}` : ""}</span>
          </div>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">{t.history} ({item.versions.length})</summary>
            <ol className="mt-2 grid gap-2">{item.versions.map(version => <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{t.version} {version.version}{version.version === item.publishedVersion ? ` · ${t.published}` : version.version === item.latestVersion ? ` · ${t.latest}` : ""}{version.fileName ? ` · ${version.fileName}` : ""}</span>
              <span className="flex flex-wrap items-center gap-2">
                {version.ready ? openLink(item.id, version, version.version) : <span className="text-xs text-rose-700">{t.notReady}</span>}
                {item.status !== "RETIRED" && version.ready && version.version !== item.publishedVersion && <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => call(`/api/resources/${item.id}`, { op: "publish", version: version.version }))}>{t.publish} {version.version}</Button>}
              </span>
            </li>)}</ol>
          </details>
          {item.status !== "RETIRED" && <div className="mt-3 flex flex-wrap items-end gap-2">
            {item.kind === "ANSWER_KEY" ? <p className="text-xs text-slate-600">{t.answerKeyNote}</p>
              : <label className="grid gap-1 text-xs font-semibold">{t.changeAudience}<Select value={item.audience} disabled={busy} onChange={event => run(() => call(`/api/resources/${item.id}`, { op: "audience", audience: event.target.value }))}>
                {AUDIENCES.map(value => <option key={value} value={value}>{t.audiences[value]}</option>)}</Select></label>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => setReplacing(replacing === item.id ? null : item.id)}>{t.replace}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => call(`/api/resources/${item.id}`, { op: "retire" }))}>{t.retire}</Button>
          </div>}
          {replacing === item.id && <VersionForm t={t} busy={busy} onCancel={() => setReplacing(null)} onSubmit={async (description, file, link) => {
            const ok = await run(async () => {
              const added = await call(`/api/resources/${item.id}`, { op: "version", description, content: contentOf(file, link), expectedLatest: item.latestVersion });
              await sendFile(item.id, added.result.version, added.result.uploadUrl, file);
            });
            if (ok) setReplacing(null);
          }} />}
        </li>)}</ul>}
    </>}
  </div>;
}

function ResourceForm({ t, language, classId, busy, onCancel, onSubmit }: { t: ResourceCopy; language: string; classId: string; busy: boolean; onCancel: () => void; onSubmit: (body: unknown, file: File | null) => Promise<void> }) {
  const [kind, setKind] = useState<Kind>("HANDOUT");
  const [audienceValue, setAudienceValue] = useState<Audience>("CLASS");
  const [file, setFile] = useState<File | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    void onSubmit({ classId, title: text("title"), kind, audience: kind === "ANSWER_KEY" ? "STAFF" : audienceValue, language: text("language"), sourceRights: text("sourceRights"), description: text("description"), content: contentOf(file, text("link")) }, file);
  };
  return <form onSubmit={submit} aria-label={t.addTitle} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
    <h3 className="text-base font-semibold sm:col-span-2">{t.addTitle}</h3>
    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.resourceTitle}<Input name="title" required minLength={3} maxLength={160} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.kind}<Select value={kind} onChange={event => setKind(event.target.value as Kind)}>{KINDS.map(value => <option key={value} value={value}>{t.kinds[value]}</option>)}</Select></label>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.audience}<Select value={kind === "ANSWER_KEY" ? "STAFF" : audienceValue} disabled={kind === "ANSWER_KEY"} onChange={event => setAudienceValue(event.target.value as Audience)}>{AUDIENCES.map(value => <option key={value} value={value}>{t.audiences[value]}</option>)}</Select></label>
      {kind === "ANSWER_KEY" && <span className="text-slate-600">{t.answerKeyNote}</span>}</div>
    <label className="grid gap-1 text-xs font-semibold">{t.language}<Select name="language" defaultValue={language}><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></label>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.sourceRights}<Input name="sourceRights" maxLength={240} aria-describedby="resource-source-help" /></label><span id="resource-source-help" className="text-slate-600">{t.sourceHelp}</span></div>
    <div className="grid gap-1 text-xs sm:col-span-2"><label className="grid gap-1 font-semibold">{t.description}<Textarea name="description" required minLength={10} maxLength={2000} rows={3} className="rounded-md border px-3 py-2 text-sm font-normal" aria-describedby="resource-description-help" /></label><span id="resource-description-help" className="text-slate-600">{t.descriptionHelp}</span></div>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.file}<Input type="file" accept={ACCEPT} aria-describedby="resource-file-help" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><span id="resource-file-help" className="text-slate-600">{t.fileHelp}</span></div>
    <label className="grid gap-1 text-xs font-semibold">{t.link}<Input name="link" type="url" inputMode="url" placeholder="https://" disabled={!!file} /></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? t.uploading : t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function VersionForm({ t, busy, onCancel, onSubmit }: { t: ResourceCopy; busy: boolean; onCancel: () => void; onSubmit: (description: string, file: File | null, link: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  return <form aria-label={t.replace} className="mt-3 grid gap-3 rounded-xl border bg-slate-50 p-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit(String(form.get("description") ?? ""), file, String(form.get("link") ?? "")); }}>
    <p className="text-xs text-slate-600 sm:col-span-2">{t.replaceHelp}</p>
    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.description}<Textarea name="description" required minLength={10} maxLength={2000} rows={2} className="rounded-md border px-3 py-2 text-sm font-normal" /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.file}<Input type="file" accept={ACCEPT} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.link}<Input name="link" type="url" placeholder="https://" disabled={!!file} /></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? t.uploading : t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}
