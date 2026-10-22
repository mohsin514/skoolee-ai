"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, Download, ExternalLink, Eye, MoreHorizontal, Users } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { getResourceCopy, type ResourceCopy } from "./resource-copy";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { FolderOpen } from "lucide-react";

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

/**
 * `adding`/`onAddingChange` let a page put "Add resource" in its PageHeader (the screen's primary,
 * §4.4b); without them the library shows its own button.
 */
export function ResourceLibrary({ audience, adding: addingProp, onAddingChange }: { audience: "staff" | "learner" | "guardian"; adding?: boolean; onAddingChange?: (adding: boolean) => void }) {
  const { language } = useLocale();
  const t = getResourceCopy(language);
  const rtl = language === "ar" || language === "ur";
  const [view, setView] = useState<View | null>(null);
  const [classId, setClassId] = useState("");
  const [viewAs, setViewAs] = useState<"" | "CLASS" | "GUARDIANS">("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [localAdding, setLocalAdding] = useState(false);
  const controlledAdding = typeof addingProp === "boolean";
  const adding = controlledAdding ? Boolean(addingProp) : localAdding;
  const setAdding = (next: boolean) => { if (controlledAdding) onAddingChange?.(next); else setLocalAdding(next); };
  const [retiring, setRetiring] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams(Object.entries({ classId, viewAs, q }).filter(([, value]) => value));
    const data = await call(`/api/resources?${params}`);
    setView(data);
    if (data.classId && !classId) setClassId(data.classId);
  }, [classId, viewAs, q]);
  useEffect(() => { setLoadFailed(false); load().catch(() => setLoadFailed(true)); }, [load]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setStatus(null);
    try { await work(); await load(); setStatus({ tone: "ok", text: t.saved }); return true; }
    catch (error) { await load().catch(() => undefined); setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); return false; }
    finally { setBusy(false); }
  }

  const banner = status && <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-status-success-border bg-status-success-surface text-status-success-text" : "border-status-error-border bg-status-error-surface text-status-error-text"}`}>{status.text}</p>;
  const size = (bytes: number | null) => {
    if (!bytes) return "";
    const [unit, value] = bytes >= 1_048_576 ? ["megabyte", bytes / 1_048_576] : bytes >= 1024 ? ["kilobyte", bytes / 1024] : ["byte", bytes];
    return new Intl.NumberFormat(language, { style: "unit", unit, maximumFractionDigits: 1 }).format(value);
  };
  const openLink = (id: string, current: Version, version?: number) => current.link
    ? <a className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline" href={fileHref(id, version)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden />{t.open}</a>
    : <a className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline" href={fileHref(id, version)}><Download className="h-4 w-4" aria-hidden />{t.download}{current.fileName ? <span className="sr-only">: {current.fileName}</span> : null}</a>;

  const learnerList = (items: LearnerItem[]) => items.length === 0
    ? <EmptyState size="sm" icon={FolderOpen} title={audience === "staff" ? t.empty : t.learnerEmpty} className="rounded-xl border border-dashed border-border-subtle" />
    : <ul className="grid gap-3" aria-label={t.title}>{items.map(item => <li key={item.id} className="rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-semibold" dir="auto">{item.title}</p><p className="text-xs text-ink-subtle">{t.kinds[item.kind]} · {t.version} {item.version}{item.current.fileName ? ` · ${item.current.fileName} ${size(item.current.sizeBytes)}` : ""}</p></div>
        {openLink(item.id, item.current)}
      </div>
      <p className="mt-2 text-sm text-ink" dir="auto">{item.current.description}</p>
    </li>)}</ul>;

  const search = <label className="grid gap-1 text-xs font-semibold">{t.search}<Input type="search" value={q} onChange={event => setQ(event.target.value)} /></label>;

  if (loadFailed && !view) return <div dir={rtl ? "rtl" : "ltr"} className="sk-panel"><ErrorState title={t.errorTitle} description={t.failed} retryLabel={t.retry} onRetry={() => { setLoadFailed(false); load().catch(() => setLoadFailed(true)); }} /></div>;
  if (!view) return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3">{banner ?? <SkeletonList rows={3} label={t.loading} />}</div>;
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
      <p className="flex items-center gap-2 rounded-xl border border-status-warning-border bg-status-warning-surface px-3 py-2 text-sm text-status-warning-text"><Eye className="h-4 w-4" aria-hidden />{t.previewBanner}</p>
      {learnerList(view.resources)}
    </> : <>
      {adding ? <ResourceForm t={t} language={language} classId={view.classId} busy={busy} onCancel={() => setAdding(false)} onSubmit={async (body, file) => {
        // Once the draft exists the form closes even if the upload fails: retrying here would duplicate it.
        let created = false;
        await run(async () => { const result = await call("/api/resources", body); created = true; await sendFile(result.resource.id, 1, result.uploadUrl, file); });
        if (created) setAdding(false);
      }} /> : controlledAdding ? null : <Button type="button" onClick={() => setAdding(true)}>{t.add}</Button>}
      {view.resources.length === 0 ? <EmptyState size="sm" icon={FolderOpen} title={t.empty} className="rounded-xl border border-dashed border-border-subtle" action={!adding ? <Button type="button" size="sm" onClick={() => setAdding(true)}>{t.add}</Button> : undefined} />
        : <ul className="grid gap-3" aria-label={t.title}>{view.resources.map(item => <li key={item.id} className="rounded-xl border border-border-subtle bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold" dir="auto">{item.title}</p>
              <p className="text-xs text-ink-subtle">{t.kinds[item.kind]} · {t.audiences[item.audience]}</p>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{t.statuses[item.status]}{item.publishedVersion ? ` · v${item.publishedVersion}` : ""}</span>
          </div>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">{t.history} ({item.versions.length})</summary>
            <ol className="mt-2 grid gap-2">{item.versions.map(version => <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-sm">
              <span>{t.version} {version.version}{version.version === item.publishedVersion ? ` · ${t.published}` : version.version === item.latestVersion ? ` · ${t.latest}` : ""}{version.fileName ? ` · ${version.fileName}` : ""}</span>
              <span className="flex flex-wrap items-center gap-2">
                {version.ready ? openLink(item.id, version, version.version) : <span className="text-xs text-status-error-text">{t.notReady}</span>}
                {item.status !== "RETIRED" && version.ready && version.version !== item.publishedVersion && <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => call(`/api/resources/${item.id}`, { op: "publish", version: version.version }))}>{t.publish} {version.version}</Button>}
              </span>
            </li>)}</ol>
          </details>
          {/* §4.5.2/3 (G17): one inline row action (a new version) and the rest — who can see it, and Retire behind
              ConfirmAction — in the row overflow. */}
          {item.status !== "RETIRED" && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {item.kind === "ANSWER_KEY" ? <p className="me-auto text-xs text-ink-muted">{t.answerKeyNote}</p> : null}
            <Button type="button" size="sm" variant="outline" disabled={busy} aria-expanded={replacing === item.id} onClick={() => setReplacing(replacing === item.id ? null : item.id)}>{t.replace}</Button>
            <Menu
              label={t.moreActions}
              align="end"
              trigger={<IconButton size="sm" variant="ghost" label={t.moreActionsFor.replace("{title}", item.title)} disabled={busy}><MoreHorizontal aria-hidden="true" /></IconButton>}
              items={[
                ...(item.kind === "ANSWER_KEY" ? [] : AUDIENCES.filter(value => value !== item.audience).map(value => ({
                  id: `audience-${value}`,
                  label: `${t.changeAudience}: ${t.audiences[value]}`,
                  icon: Users,
                  onSelect: () => { void run(() => call(`/api/resources/${item.id}`, { op: "audience", audience: value })); },
                }))),
                ...(item.kind === "ANSWER_KEY" ? [] : ["separator" as const]),
                { id: "retire", label: t.retire, icon: Archive, tone: "danger" as const, onSelect: () => setRetiring(item.id) },
              ]}
            />
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
    <ConfirmAction
      open={Boolean(retiring)}
      tone="danger"
      title={t.retireTitle}
      description={t.retireBody}
      confirmLabel={t.retireConfirm}
      cancelLabel={t.keep}
      busy={busy}
      onCancel={() => setRetiring(null)}
      onConfirm={() => { const id = retiring; setRetiring(null); if (id) void run(() => call(`/api/resources/${id}`, { op: "retire" })); }}
    />
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
  return <form onSubmit={submit} aria-label={t.addTitle} className="grid gap-3 rounded-xl border border-border-subtle bg-card p-4 sm:grid-cols-2">
    <h3 className="text-base font-semibold sm:col-span-2">{t.addTitle}</h3>
    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.resourceTitle}<Input name="title" required minLength={3} maxLength={160} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.kind}<Select value={kind} onChange={event => setKind(event.target.value as Kind)}>{KINDS.map(value => <option key={value} value={value}>{t.kinds[value]}</option>)}</Select></label>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.audience}<Select value={kind === "ANSWER_KEY" ? "STAFF" : audienceValue} disabled={kind === "ANSWER_KEY"} onChange={event => setAudienceValue(event.target.value as Audience)}>{AUDIENCES.map(value => <option key={value} value={value}>{t.audiences[value]}</option>)}</Select></label>
      {kind === "ANSWER_KEY" && <span className="text-ink-muted">{t.answerKeyNote}</span>}</div>
    <label className="grid gap-1 text-xs font-semibold">{t.language}<Select name="language" defaultValue={language}><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></label>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.sourceRights}<Input name="sourceRights" maxLength={240} aria-describedby="resource-source-help" /></label><span id="resource-source-help" className="text-ink-muted">{t.sourceHelp}</span></div>
    <div className="grid gap-1 text-xs sm:col-span-2"><label className="grid gap-1 font-semibold">{t.description}<Textarea name="description" required minLength={10} maxLength={2000} rows={3} className="rounded-md border px-3 py-2 text-sm font-normal" aria-describedby="resource-description-help" /></label><span id="resource-description-help" className="text-ink-muted">{t.descriptionHelp}</span></div>
    <div className="grid gap-1 text-xs"><label className="grid gap-1 font-semibold">{t.file}<Input type="file" accept={ACCEPT} aria-describedby="resource-file-help" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><span id="resource-file-help" className="text-ink-muted">{t.fileHelp}</span></div>
    <label className="grid gap-1 text-xs font-semibold">{t.link}<Input name="link" type="url" inputMode="url" placeholder="https://" disabled={!!file} /></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? t.uploading : t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function VersionForm({ t, busy, onCancel, onSubmit }: { t: ResourceCopy; busy: boolean; onCancel: () => void; onSubmit: (description: string, file: File | null, link: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  return <form aria-label={t.replace} className="mt-3 grid gap-3 rounded-xl border border-border-subtle bg-surface-subtle p-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit(String(form.get("description") ?? ""), file, String(form.get("link") ?? "")); }}>
    <p className="text-xs text-ink-muted sm:col-span-2">{t.replaceHelp}</p>
    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.description}<Textarea name="description" required minLength={10} maxLength={2000} rows={2} className="rounded-md border px-3 py-2 text-sm font-normal" /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.file}<Input type="file" accept={ACCEPT} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.link}<Input name="link" type="url" placeholder="https://" disabled={!!file} /></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? t.uploading : t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}
