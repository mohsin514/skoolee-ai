"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, FileUp, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function KnowledgeLibrary({ canManage, role, campusId }: { canManage: boolean; role: UserRole; campusId: string | null }) {
  const [documents, setDocuments] = useState<Document[]>([]), [selected, setSelected] = useState<Document | null>(null);
  const [title, setTitle] = useState(""), [content, setContent] = useState(""), [audience, setAudience] = useState<UserRole[]>([role]);
  const [expiry, setExpiry] = useState(""), [reviewed, setReviewed] = useState(false), [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""), [answer, setAnswer] = useState<Answer | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => { const data = await request("/api/ai-knowledge"); setDocuments(data.documents); }, []);
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
  return <main className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-20 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-6">
      <div><p className="sk-eyebrow text-primary">Skoolee knowledge</p><h1 className="mt-2 text-2xl font-semibold">Knowledge library</h1><p className="mt-2 text-sm text-muted-foreground">Published guides and policies give Ask Skoolee evidence it can cite. Access follows your school, campus and role.</p></div>
      <Link href="/ai" className={buttonVariants({ variant: "outline" })}>Back to Ask Skoolee</Link>
    </header>
    {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-brand-50 p-4 text-sm">{notice}</p> : null}
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
        <div className="flex items-center justify-between"><h2 className="font-semibold">Documents ({documents.length})</h2>{canManage ? <Button size="sm" variant="outline" disabled={busy} onClick={() => { setSelected(null); setTitle(""); setContent(""); setAudience([role]); setExpiry(""); setReviewed(false); setEditing(true); }}><Plus aria-hidden="true" />New</Button> : null}</div>
        {!documents.length ? <p className="text-sm text-muted-foreground">No documents available. {canManage ? "Add a guide or policy, review it, then publish." : "Your school manager can publish documents for your role."}</p> : null}
        <ul className="space-y-2">{documents.map(doc => <li key={doc.id}>{canManage ? <Button variant="outline" disabled={busy} onClick={() => void open(doc)} className="h-auto w-full flex-col items-start whitespace-normal rounded-xl p-3 text-start"><span className="block font-medium">{doc.title}</span><span className="text-xs text-muted-foreground">{doc.status} · v{doc.version}{doc.indexMode ? ` · ${doc.indexMode}` : ""}</span></Button> : <Link className="block rounded-xl border p-3 text-primary" href={`/ai/knowledge/${doc.id}?version=${doc.version}`}>{doc.title}</Link>}</li>)}</ul>
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
      </section> : <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center text-muted-foreground"><BookOpen aria-hidden="true" className="size-10 text-primary" /><h2 className="font-semibold text-foreground">Evidence before answers</h2><p className="max-w-md text-sm">Only current published documents are searchable. Drafts, archived sources, expired versions and other schools’ documents are excluded.</p></section>}
    </div>
  </main>;
}
