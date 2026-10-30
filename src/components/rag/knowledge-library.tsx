"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, BookOpen, FileCheck2, FilePen, FileUp, Plus, Search, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskRowButton, DeskRowIcon, deskRow, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/roles";

type Document = { id: string; title: string; content?: string; roles: UserRole[]; campusId: string | null; version: number; status: string; indexMode: string | null; expiresAt: string | null };
type Answer = { text: string; mode: string; generation: string; citations: Array<{ number: number; title: string; version: number; href: string }> };
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
  return body;
}
const DOC_TONE: Record<string, DeskTone> = { PUBLISHED: "success", DRAFT: "info", ARCHIVED: "neutral" };
const DOC_ICON = { PUBLISHED: FileCheck2, DRAFT: FilePen, ARCHIVED: Archive } as const;
const docIcon = (status: string) => DOC_ICON[status as keyof typeof DOC_ICON] ?? FilePen;
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function KnowledgeLibrary({ canManage, role, campusId }: { canManage: boolean; role: UserRole; campusId: string | null }) {
  const [documents, setDocuments] = useState<Document[]>([]), [selected, setSelected] = useState<Document | null>(null);
  const [title, setTitle] = useState(""), [content, setContent] = useState(""), [audience, setAudience] = useState<UserRole[]>([role]);
  const [expiry, setExpiry] = useState(""), [reviewed, setReviewed] = useState(false), [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""), [answer, setAnswer] = useState<Answer | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const ui = useUiText();
  const [loaded, setLoaded] = useState(false), [filter, setFilter] = useState("");
  const refresh = useCallback(async () => { const data = await request("/api/ai-knowledge"); setDocuments(data.documents); setLoaded(true); }, []);
  // Drafts waiting for review lead the list; archived documents sink to the end.
  const listed = useMemo(() => { const needle = filter.trim().toLowerCase(); return urgencyFirst(documents.filter(doc => !needle || doc.title.toLowerCase().includes(needle)), doc => doc.status === "DRAFT" ? 0 : doc.status === "ARCHIVED" ? 2 : 1); }, [documents, filter]);
  const startNew = () => { setSelected(null); setTitle(""); setContent(""); setAudience([role]); setExpiry(""); setReviewed(false); setEditing(true); };
  useEffect(() => { void refresh().catch(cause => setError(cause.message)); }, [refresh]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed."); } finally { setBusy(false); }
  };
  const open = async (doc: Document) => run(async () => {
    const { document } = await request(`/api/ai-knowledge/${doc.id}`);
    setSelected(document); setTitle(document.title); setContent(document.content); setAudience(document.roles); setExpiry(document.expiresAt?.slice(0, 10) ?? ""); setReviewed(false); setEditing(true);
  });
  const save = () => run(async () => {
    const document = { title, content, roles: audience, campusId: selected?.campusId ?? campusId, expiresAt: expiry ? new Date(`${expiry}T23:59:59Z`).toISOString() : null };
    const result = selected ? await request(`/api/ai-knowledge/${selected.id}`, json("PATCH", { action: "save", version: selected.version, document })) : await request("/api/ai-knowledge", json("POST", document));
    setSelected({ ...result.document, content }); setReviewed(false); setNotice("Draft saved. Review the text and audience before publishing. Previous published text is now withdrawn."); await refresh();
  });
  const act = (action: "publish" | "archive") => run(async () => {
    if (!selected) return;
    const { document } = await request(`/api/ai-knowledge/${selected.id}`, json("PATCH", { action, version: selected.version }));
    setSelected({ ...selected, ...document });
    setNotice(action === "archive" ? "Archived. This document is no longer used in answers." : document.indexMode === "HYBRID" ? "Published with semantic and keyword search." : "Published with keyword search. Semantic indexing is unavailable; publish again to retry it.");
    await refresh();
  });
  const dirty = !selected || selected.title !== title || selected.content !== content || JSON.stringify(selected.roles) !== JSON.stringify(audience) || (selected.expiresAt?.slice(0, 10) ?? "") !== expiry;
  return <main className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-1 pb-20 sm:p-4">
    <PageHeader icon={BookOpen} eyebrow="Skoolee knowledge" title="Knowledge library" description="Published guides and policies give Ask Skoolee evidence it can cite. Access follows your school, campus and role."
      secondaryActions={[{ id: "back-to-ask", label: "Back to Ask Skoolee", href: "/ai", icon: ArrowLeft }]} />
    {error ? <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert> : null}
    {notice ? <Alert tone={notice.startsWith("Review extraction") ? "warning" : "success"} onDismiss={() => setNotice("")}>{notice}</Alert> : null}
    <section className="space-y-3 rounded-2xl border bg-card p-5" aria-labelledby="knowledge-search-title">
      <h2 id="knowledge-search-title" className="font-semibold">Ask your published knowledge</h2>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={event => { event.preventDefault(); void run(async () => setAnswer(await request("/api/ai-knowledge/search", json("POST", { query })))); }}>
        <Input aria-label="Knowledge question" value={query} onChange={event => setQuery(event.target.value)} placeholder="What does our admissions policy require?" maxLength={1000} />
        <Button disabled={busy || query.trim().length < 3} type="submit"><Search aria-hidden="true" />Ask knowledge</Button>
      </form>
      {answer ? <article aria-live="polite" className="space-y-3 rounded-xl bg-brand-50/50 p-4"><p className="text-xs text-muted-foreground">{answer.mode === "HYBRID" ? "Semantic + keyword search" : "Keyword search"} · {answer.generation === "SYNTHESIZED" ? "Answer with checked quotes" : "Source-based response"}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.text}</p><ul className="space-y-2 text-sm">{answer.citations.map(cite => <li key={cite.number}><Link className="text-primary underline" href={cite.href}>[{cite.number}] {cite.title} · v{cite.version}</Link></li>)}</ul></article> : null}
    </section>
    <div className="grid gap-6 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Documents ({documents.length})</h2>{canManage ? <Button size="sm" variant="outline" disabled={busy} onClick={startNew}><Plus aria-hidden="true" />New</Button> : null}</div>
        {documents.length > 8 ? <DeskQuickFilter value={filter} onChange={setFilter} label={ui("Filter this list")} /> : null}
        <DeskFilterStatus shown={listed.length} total={documents.length} onClear={() => setFilter("")} />
        {!loaded && !error ? <SkeletonList rows={3} label="Documents" /> : null}
        {loaded && !documents.length ? <EmptyState size="sm" icon={BookOpen} title="No documents available." description={canManage ? "Add a guide or policy, review it, then publish." : "Your school manager can publish documents for your role."} /> : null}
        <ul className="space-y-2">{listed.map(doc => <li key={doc.id}>{canManage ? <DeskRowButton tone={DOC_TONE[doc.status] ?? "neutral"} icon={docIcon(doc.status)} disabled={busy} onClick={() => void open(doc)} aria-current={selected?.id === doc.id ? "true" : undefined}><span className="block break-words font-medium">{doc.title}</span><span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><DeskPill tone={DOC_TONE[doc.status] ?? "neutral"}>{doc.status}</DeskPill><span>v{doc.version}{doc.indexMode ? ` · ${doc.indexMode}` : ""}</span></span></DeskRowButton>
          : <Link className={`${deskRow} flex items-center gap-3 text-primary`} data-tone={DOC_TONE[doc.status]} href={`/ai/knowledge/${doc.id}?version=${doc.version}`}><DeskRowIcon icon={docIcon(doc.status)} /><span className="min-w-0 flex-1 break-words font-medium">{doc.title}</span></Link>}</li>)}</ul>
      </section>
      {canManage && editing ? <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Document editor">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{selected ? "Review document" : "New document"}</h2><Button variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}><FileUp aria-hidden="true" />Import file</Button></div>
        <input ref={file} className="hidden" type="file" accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg" aria-label="Import knowledge document" onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ""; if (!chosen) return; void run(async () => { const form = new FormData(); form.append("file", chosen); const data = await request("/api/ai-knowledge/extract", { method: "POST", body: form }); setTitle(data.title); setContent(data.content); setReviewed(false); setNotice(data.uncertainties.length ? `Review extraction: ${data.uncertainties.join(" ")}` : "Imported into the editor. Review the complete text before saving and publishing."); }); }} />
        <label className="block space-y-2 text-sm font-medium">Title<Input value={title} maxLength={160} disabled={busy} onChange={event => { setTitle(event.target.value); setReviewed(false); }} /></label>
        <label className="block space-y-2 text-sm font-medium">Document text<Textarea rows={14} value={content} maxLength={80000} disabled={busy} onChange={event => { setContent(event.target.value); setReviewed(false); }} /></label>
        <p className="text-xs text-muted-foreground">{content.length.toLocaleString()} / 80,000 characters · Import TXT, Markdown, CSV, PDF or images. PDF/image extraction requires the configured approved media provider. Never include passwords or access tokens.</p>
        <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-medium">Who may use this knowledge?</legend><div className="grid gap-2 sm:grid-cols-2">{USER_ROLES.filter(item => role === "APP_OWNER" || item !== "APP_OWNER").map(item => <label key={item} className="flex items-center gap-2 text-sm"><Checkbox checked={audience.includes(item)} onChange={event => { setAudience(event.target.checked ? [...audience, item] : audience.filter(value => value !== item)); setReviewed(false); }} />{ROLE_LABELS[item]}</label>)}</div></fieldset>
        <p className="text-xs text-muted-foreground">Scope: {selected?.campusId ?? campusId ? "your assigned campus" : "this school"}. Documents are never shared with other schools automatically.</p>
        <label className="block space-y-2 text-sm font-medium">Expiry date (optional)<Input type="date" value={expiry} disabled={busy} onChange={event => { setExpiry(event.target.value); setReviewed(false); }} /></label>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || !dirty || content.trim().length < 20 || title.trim().length < 3 || !audience.length} onClick={() => void save()}>Save draft</Button>{selected && !dirty ? <Button variant="outline" disabled={busy || selected.status === "ARCHIVED"} onClick={() => void act("archive")}>Archive</Button> : null}</div>
        {selected && !dirty ? <div className="space-y-3 border-t pt-4"><label className="flex items-start gap-2 text-sm"><Checkbox checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />I reviewed this text and audience. These users may receive and cite it in AI answers.</label><Button disabled={busy || !reviewed} onClick={() => void act("publish")}>{busy ? "Working…" : selected.status === "PUBLISHED" ? "Rebuild search index" : "Publish reviewed document"}</Button></div> : null}
      </section> : <section className="self-start rounded-2xl border border-dashed bg-card"><EmptyState icon={ShieldCheck} title="Evidence before answers" description="Only current published documents are searchable. Drafts, archived sources, expired versions and other schools’ documents are excluded." action={canManage ? <Button variant="outline" disabled={busy} onClick={startNew}><Plus aria-hidden="true" />New</Button> : undefined} /></section>}
    </div>
  </main>;
}
