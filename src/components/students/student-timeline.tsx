"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { History, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LiveAnnouncer } from "@/components/ui/live-announcer";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { friendlyErrorMessage } from "@/components/ui/toast";
import { useLocale, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { timelineLabels } from "@/lib/students/labels";

// SKAI-166 — a pupil's life-cycle timeline, read from GET /api/students/timeline.
// The server decides what this reader may see; this view only renders the page
// it is given and says when entries were withheld rather than missing.

type TimelineEvent = { id: string; kind: string; title: string; detail: string | null; actor: { id: string; name: string } | null; createdAt: string };
type Page = { events: TimelineEvent[]; nextCursor: string | null; restrictedCount: number; canAddNote: boolean };
type Failure = { message: string; status: number; offline: boolean };

const KINDS = ["ADMITTED", "ENROLLMENT_TRANSITION", "PROMOTED", "ARCHIVED", "IDENTITY_CONSOLIDATED", "DOC_UPLOADED", "FEE_PAID", "NOTE"] as const;
const fieldLabel = "grid min-w-0 gap-1.5 text-sm font-semibold text-ink-strong";

async function fetchPage(studentId: string, kind: string, cursor: string | null): Promise<Page> {
  const params = new URLSearchParams({ studentId });
  if (kind) params.set("kind", kind);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/students/timeline?${params}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof body.error === "string" ? body.error : "Request failed"), { status: response.status });
  return body.data as Page;
}

function failureOf(error: unknown): Failure {
  const status = (error as { status?: number })?.status ?? 0;
  return { message: friendlyErrorMessage(error), status, offline: typeof navigator !== "undefined" && !navigator.onLine };
}

export function StudentTimeline({ studentId }: { studentId: string }) {
  const locale = useLocale(), format = useLocaleFormat(), t = timelineLabels[locale.language];
  const [page, setPage] = useState<Page | null>(null);
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null), [moreError, setMoreError] = useState("");
  const [title, setTitle] = useState(""), [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(""), [announce, setAnnounce] = useState<string | null>(null);
  // One id per drafted note: a retried submit after a dropped response replays instead of writing twice.
  const requestId = useRef<string>("");
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    setLoading(true); setFailure(null); setMoreError("");
    try { const next = await fetchPage(studentId, kind, null); if (run === generation.current) setPage(next); }
    catch (error) { if (run === generation.current) { setFailure(failureOf(error)); setPage(null); } }
    finally { if (run === generation.current) setLoading(false); }
  }, [studentId, kind]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!page?.nextCursor) return;
    setLoadingMore(true); setMoreError("");
    try {
      const next = await fetchPage(studentId, kind, page.nextCursor);
      setPage(prev => prev ? { ...next, events: [...prev.events, ...next.events.filter(e => !prev.events.some(p => p.id === e.id))] } : next);
      setAnnounce(t.loadedMore.replace("{0}", format.number(next.events.length)));
    } catch (error) { setMoreError(friendlyErrorMessage(error)); }
    finally { setLoadingMore(false); }
  };

  const addNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !title.trim()) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setSaving(true); setSaveError(""); setAnnounce(null);
    try {
      const response = await fetch("/api/students/timeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, kind: "NOTE", title, detail, requestId: requestId.current }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Request failed");
      requestId.current = ""; setTitle(""); setDetail("");
      setAnnounce(t.saved);
      await load();
    } catch (error) { setSaveError(friendlyErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const kindLabel = (value: string) => (t.kinds as Record<string, string>)[value] ?? value.replace(/_/g, " ").toLowerCase();

  return <section aria-labelledby="timeline-title" aria-busy={loading} className="sk-panel space-y-5 p-4 sm:p-6">
    <LiveAnnouncer message={announce} />
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id="timeline-title" className="text-lg font-bold text-ink-strong">{t.title}</h2>
        <p className="text-sm text-ink-muted">{t.hint}</p>
      </div>
      <label className={`${fieldLabel} w-full sm:w-56`}>{t.filter}
        <Select className="block w-full" value={kind} disabled={loading && !page} onChange={e => setKind(e.target.value)}>
          <option value="">{t.all}</option>
          {KINDS.map(value => <option key={value} value={value}>{kindLabel(value)}</option>)}
        </Select>
      </label>
    </div>

    {page?.canAddNote && <form onSubmit={addNote} className="space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:p-4" aria-labelledby="timeline-note-title">
      <h3 id="timeline-note-title" className="text-sm font-bold text-ink-strong">{t.addNote}</h3>
      <fieldset disabled={saving} className="grid gap-3">
        <label className={fieldLabel}>{t.noteTitle}<Input required maxLength={200} className="block w-full" value={title} aria-invalid={!!saveError || undefined} aria-describedby={saveError ? "timeline-save-error" : undefined} onChange={e => { setTitle(e.target.value); requestId.current = ""; }} /></label>
        <label className={fieldLabel}>{t.noteDetail}<Textarea maxLength={2000} rows={3} className="block w-full" value={detail} onChange={e => { setDetail(e.target.value); requestId.current = ""; }} /></label>
      </fieldset>
      <p className="text-xs text-ink-subtle">{t.staffOnly}</p>
      {saveError && <Alert id="timeline-save-error" tone="danger">{saveError}</Alert>}
      <div className="flex justify-end"><Button type="submit" variant="default" loading={saving} disabled={saving || !title.trim()}>{t.save}</Button></div>
    </form>}

    {loading && !page ? <SkeletonRegion label={t.loading} className="space-y-3">
      {[0, 1, 2].map(i => <div key={i} className="space-y-2 rounded-xl p-3 ring-1 ring-border-subtle"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /></div>)}
    </SkeletonRegion>
    : failure ? (failure.status === 403
      ? <EmptyState size="sm" icon={Lock} title={t.deniedTitle} description={t.denied} />
      : failure.status === 404
        ? <EmptyState size="sm" icon={Lock} title={t.notFoundTitle} description={t.notFound} />
        : <ErrorState offline={failure.offline} title={t.errorTitle} description={failure.message} onRetry={load} retryLabel={t.retry} />)
    : page && <>
      {page.restrictedCount > 0 && <Alert tone="info" live="off" icon={Lock}>{t.restricted.replace("{0}", format.number(page.restrictedCount))}</Alert>}
      {page.events.length === 0
        ? <EmptyState size="sm" icon={History} title={kind ? t.noMatchTitle : t.emptyTitle} description={kind ? t.noMatch : (page.restrictedCount ? t.emptyFamily : t.empty)} secondaryAction={kind ? <Button variant="outline" size="sm" onClick={() => setKind("")}>{t.clearFilter}</Button> : undefined} />
        : <ol className="relative space-y-3 border-s-2 border-border-subtle ps-4 sm:ps-6" aria-label={t.title}>
          {page.events.map(event => <li key={event.id} className="relative rounded-xl bg-card/85 p-3 ring-1 ring-border-subtle sm:p-4">
            <span aria-hidden="true" className="absolute -start-[1.4rem] top-5 size-2.5 rounded-full bg-primary ring-4 ring-card sm:-start-[1.9rem]" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant={event.kind === "NOTE" ? "secondary" : "default"} size="sm">{kindLabel(event.kind)}</Badge>
              <time dateTime={event.createdAt} className="text-xs tabular-nums text-ink-subtle">{format.dateTime(event.createdAt)}</time>
            </div>
            <p className="mt-1.5 break-words text-sm font-semibold text-ink-strong"><bdi>{event.title}</bdi></p>
            {event.detail && <p className="mt-1 whitespace-pre-line break-words text-sm text-ink"><bdi>{event.detail}</bdi></p>}
            <p className="mt-1.5 text-xs text-ink-muted">{t.by}: {event.actor ? <bdi>{event.actor.name}</bdi> : t.system}</p>
          </li>)}
        </ol>}
      {moreError && <Alert tone="danger" actions={<Button variant="outline" size="sm" onClick={() => void loadMore()}>{t.retry}</Button>}>{moreError}</Alert>}
      {page.nextCursor && <div className="flex justify-center"><Button variant="outline" loading={loadingMore} disabled={loadingMore} onClick={() => void loadMore()}>{t.more}</Button></div>}
    </>}
  </section>;
}
