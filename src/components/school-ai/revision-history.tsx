"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileClock, GitCompareArrows, History, RefreshCw, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { TaskStatus } from "@/components/ui/task-patterns";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { schoolAICopy, interpolateAI } from "@/lib/school-ai/copy";
import { revisionCopy, revisionFieldLabel } from "@/lib/school-ai/revision-copy";
import { restoredRevisionData, revisionDifferences, type RevisionDifference, type WorkspaceHistoryResponse, type WorkspaceRevisionView, type WorkspaceRevisionSummary, type WorkspaceHistoryAccess } from "@/lib/school-ai/revisions";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { workspaceErrorText, workspaceRequest, type RecordAction } from "./workspace-client";
import styles from "./school-ai.module.css";

interface Props { language: Language; records: AiWorkspaceRecord[]; onRecord: (record: AiWorkspaceRecord) => void; onAction: RecordAction }
export function RevisionHistoryPanel({ language, records, onRecord, onAction }: Props) {
  const h = revisionCopy(language), c = schoolAICopy(language);
  const [selectedId, setSelectedId] = useState("");
  const guard = useWorkspaceDraftNavigation();
  const record = records.find(item => item.id === selectedId);
  return <section className={`sk-panel ${styles.panel}`}>
    <div className="mb-5 flex items-start gap-3"><History aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" /><div><h2 className={styles.sectionTitle}>{h.history}</h2><p className={styles.description}>{h.hint}</p></div></div>
    <FormField name="history-record" label={h.choose}><Select value={selectedId} disabled={!records.length} onChange={event => { const id = event.target.value; guard(() => setSelectedId(id)); }}><option value="">{h.choose}</option>{records.map(item => <option key={item.id} value={item.id}>{h[item.kind]} · {item.title} · {c[item.status]}</option>)}</Select></FormField>
    {record ? <RevisionInspector key={record.id} record={record} language={language} onRecord={onRecord} onAction={onAction} /> : <div className={styles.empty}><FileClock aria-hidden="true" className="mx-auto mb-3 size-8 text-primary" /><p className="text-sm text-ink-muted">{records.length ? h.choose : h.noRecords}</p></div>}
  </section>;
}

function RevisionInspector({ record, language, onRecord, onAction }: Omit<Props, "records"> & { record: AiWorkspaceRecord }) {
  const c = schoolAICopy(language), h = revisionCopy(language);
  const [current, setCurrent] = useState(record);
  const [revisions, setRevisions] = useState<WorkspaceRevisionSummary[]>([]);
  const [cache, setCache] = useState<Record<number, WorkspaceRevisionView>>({});
  const [access, setAccess] = useState<WorkspaceHistoryAccess>({ canRestore: false, canApprove: false });
  const [nextVersion, setNextVersion] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState(record.version);
  const [baseline, setBaseline] = useState(0);
  const [mode, setMode] = useState<"compare" | "snapshot">("compare");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<"restore" | "approve" | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const url = `/api/school-ai/workspace/${encodeURIComponent(record.id)}`;
  const selected = cache[selectedVersion];
  const before = cache[baseline];
  const snapshotsReady = Boolean(selected && (!baseline || before));
  useWorkspaceDraft(Boolean(busy));

  useEffect(() => {
    const controller = new AbortController();
    void workspaceRequest<WorkspaceHistoryResponse>(`${url}?history=summary`, { signal: controller.signal }).then(result => {
      setCurrent(result.record); setRevisions(result.revisions); setAccess(result.historyAccess); setNextVersion(result.nextVersion);
      const latest = result.revisions.find(item => item.version === result.record.version) || result.revisions[0];
      setSelectedVersion(latest?.version || result.record.version);
      setBaseline(result.revisions.find(item => item.status === "APPROVED" && item.version < (latest?.version || result.record.version))?.version || result.revisions.find(item => item.version < (latest?.version || result.record.version))?.version || 0);
      setCache(latest?.version === result.record.version ? { [latest.version]: { ...latest, data: result.record.data } } : {});
      setReviewed(false); setError(""); setLoading(false);
    }).catch(cause => { if (!controller.signal.aborted) { setError(workspaceErrorText(cause, c)); setLoading(false); } });
    return () => controller.abort();
    // The saved language affects formatting only; changing it should not discard the selected comparison.
  }, [url, reload]);

  useEffect(() => {
    if (loading || !revisions.length) return;
    const missing = [...new Set([selectedVersion, ...(baseline ? [baseline] : [])])].filter(version => !cache[version]);
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(version => workspaceRequest<{ revision: WorkspaceRevisionView }>(`${url}?revision=${version}`, { signal: controller.signal }))).then(results => {
      setCache(previous => ({ ...previous, ...Object.fromEntries(results.map(result => [result.revision.version, result.revision])) }));
    }).catch(cause => { if (!controller.signal.aborted) setError(workspaceErrorText(cause, c)); });
    return () => controller.abort();
  }, [selectedVersion, baseline, cache, url, loading, revisions.length]);

  const loadMore = async () => {
    if (!nextVersion || loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const result = await workspaceRequest<WorkspaceHistoryResponse>(`${url}?history=summary&beforeVersion=${nextVersion}`);
      setRevisions(previous => [...previous, ...result.revisions.filter(item => !previous.some(row => row.version === item.version))]); setNextVersion(result.nextVersion);
    } catch (cause) { setError(workspaceErrorText(cause, c)); }
    finally { setLoadingMore(false); }
  };
  const restore = async () => {
    if (!selected || busy || !access.canRestore) return;
    setBusy("restore"); setError("");
    try {
      const result = await workspaceRequest<{ record: AiWorkspaceRecord }>(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: current.version, action: "save", title: selected.title, data: restoredRevisionData(current.kind, current.data, selected.data) }) });
      onRecord(result.record); setNotice(interpolateAI(h.restored, { source: selected.version, version: result.record.version })); setRestoreOpen(false); setLoading(true); setReload(value => value + 1);
    } catch (cause) { setError(workspaceErrorText(cause, c)); setRestoreOpen(false); }
    finally { setBusy(null); }
  };
  const approve = async () => {
    if (!reviewed || selectedVersion !== current.version || !snapshotsReady || !access.canApprove || busy) return;
    setBusy("approve"); setError("");
    try { const approved = await onAction(current, "approve"); onRecord(approved); setNotice(c.approvedPlan); setReviewed(false); setLoading(true); setReload(value => value + 1); }
    catch (cause) { setError(workspaceErrorText(cause, c)); }
    finally { setBusy(null); }
  };
  const versionLabel = (revision: WorkspaceRevisionSummary) => `${interpolateAI(c.version, { version: revision.version })} · ${h[revision.action]} · ${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}`;
  return <div className="mt-6 min-w-0 space-y-5" aria-busy={loading || Boolean(busy)}>
    <div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-2xl text-xs leading-relaxed text-ink-muted">{h.limitedHistory}</p><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => { setLoading(true); setReviewed(false); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" />{c.reload}</Button></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="text-sm text-ink-muted">{c.loading}</p> : <>
      <div className="grid min-w-0 gap-4 md:grid-cols-2"><FormField name="history-selected-version" label={h.selectedVersion}><Select value={selectedVersion} disabled={Boolean(busy) || !revisions.length} onChange={event => { setSelectedVersion(Number(event.target.value)); if (Number(event.target.value) === baseline) setBaseline(0); setReviewed(false); setError(""); }}>
        {revisions.map(revision => <option key={revision.id} value={revision.version}>{versionLabel(revision)}</option>)}
      </Select></FormField><FormField name="history-baseline" label={h.compareWith}><Select value={baseline} disabled={Boolean(busy) || !revisions.length} onChange={event => { setBaseline(Number(event.target.value)); setReviewed(false); setError(""); }}><option value={0}>{h.noBaseline}</option>{revisions.filter(revision => revision.version !== selectedVersion).map(revision => <option key={revision.id} value={revision.version}>{versionLabel(revision)}</option>)}</Select></FormField></div>
      {nextVersion && <Button variant="outline" disabled={loadingMore || Boolean(busy)} onClick={() => void loadMore()}>{loadingMore ? c.loading : h.moreHistory}</Button>}
      {!revisions.length ? <p className="text-sm text-ink-muted">{h.noVersions}</p> : !snapshotsReady ? <p role="status" className="text-sm text-ink-muted">{c.loading}</p> : <>
        <div className="sk-panel space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="break-words font-bold">{selected.title}</h3><TaskStatus>{c[selected.status]}</TaskStatus></div><dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-ink-muted">{h.actor}</dt><dd className="mt-1 break-words font-semibold">{selected.actorName || h.unknownActor}</dd><dd className="mt-1 break-all text-xs text-ink-muted">{h.actorId}: {selected.actorId}</dd></div><div><dt className="text-xs text-ink-muted">{h.timestamp}</dt><dd className="mt-1"><time dateTime={selected.createdAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "long" }).format(new Date(selected.createdAt))}</time></dd></div><div><dt className="text-xs text-ink-muted">{h.action}</dt><dd className="mt-1">{h[selected.action]}</dd></div><div><dt className="text-xs text-ink-muted">{h.selectedVersion}</dt><dd className="mt-1">{interpolateAI(c.version, { version: selected.version })}</dd></div></dl></div>
        {current.kind === "SOURCE" && <div className={styles.notice}><div className="min-w-0 flex-1"><p className="font-bold">{interpolateAI(h.sourceVersion, { version: selected.version })}</p><p>{h.originalFileHint}</p><p className="mt-1 break-words">{String(selected.data.fileName || selected.title)}</p></div>{Boolean(current.data.storageKey) && <Link className={buttonVariants({ variant: "outline", size: "sm" })} target="_blank" href={`/api/school-ai/sources/${encodeURIComponent(current.id)}/file`}>{c.original}</Link>}</div>}
        {current.kind === "PAPER" && <p className="text-xs text-ink-muted">{h.staffPaper}</p>}
        <div className="flex flex-wrap gap-2"><Button variant={mode === "compare" ? "secondary" : "ghost"} aria-pressed={mode === "compare"} onClick={() => setMode("compare")}><GitCompareArrows aria-hidden="true" />{h.comparison}</Button><Button variant={mode === "snapshot" ? "secondary" : "ghost"} aria-pressed={mode === "snapshot"} onClick={() => setMode("snapshot")}><FileClock aria-hidden="true" />{h.snapshot}</Button></div>
        <RevisionChanges key={`${mode}:${selectedVersion}:${baseline}`} language={language} snapshot={mode === "snapshot"} differences={revisionDifferences(mode === "snapshot" || !before ? {} : { title: before.title, status: before.status, data: before.data }, { title: selected.title, status: selected.status, data: selected.data })} />
        <div className="space-y-4 border-t border-border-subtle pt-5">
          {access.canApprove && current.status !== "APPROVED" && current.status !== "ARCHIVED" && (selectedVersion === current.version ? <><p className="text-sm leading-relaxed text-ink-muted">{c.planApprovalHint}</p><label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><Checkbox className="mt-1" checked={reviewed} disabled={Boolean(busy)} onChange={event => setReviewed(event.target.checked)} /><span>{h.reviewConfirm}</span></label><Button loading={busy === "approve"} disabled={!reviewed || Boolean(busy)} onClick={() => void approve()}>{busy === "approve" ? null : <CheckCircle2 aria-hidden="true" />}{h.approveCurrent}</Button></> : <p className="text-sm text-ink-muted">{h.currentOnly}</p>)}
          {access.canRestore && selectedVersion !== current.version && <Button variant="outline" disabled={Boolean(busy)} onClick={() => setRestoreOpen(true)}><RotateCcw aria-hidden="true" />{h.restore}</Button>}
        </div>
      </>}
    </>}
    <ConfirmAction open={restoreOpen} title={h.restoreTitle} description={interpolateAI(h.restoreDescription, { source: selectedVersion, current: current.version })} confirmLabel={h.restore} cancelLabel={c.close} busy={busy === "restore"} onCancel={() => setRestoreOpen(false)} onConfirm={() => restore()} />
  </div>;
}

function RevisionChanges({ language, differences, snapshot }: { language: Language; differences: RevisionDifference[]; snapshot: boolean }) {
  const h = revisionCopy(language), [limit, setLimit] = useState(40);
  return <section className="min-w-0 space-y-4" aria-label={snapshot ? h.snapshot : h.comparison}>
    {!snapshot && <p className="text-sm font-semibold">{differences.length ? interpolateAI(h.changeCount, { count: differences.length }) : h.unchanged}</p>}
    {differences.slice(0, limit).map((difference, index) => <article key={`${difference.path.join(".")}:${index}`} className="sk-panel min-w-0 p-4"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><h4 className="min-w-0 break-words text-sm font-bold">{revisionFieldLabel(difference.path, language)}</h4>{!snapshot && <TaskStatus attention={difference.type === "removed"}>{h[difference.type]}</TaskStatus>}</div><div className={snapshot ? "min-w-0" : styles.documentReview}>
      {!snapshot && <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-subtle p-3"><p className="mb-2 text-xs font-bold text-ink-muted">{h.before}</p><RevisionValue value={difference.before} language={language} path={difference.path} /></div>}
      <div className={snapshot ? "min-w-0" : "min-w-0 rounded-xl border border-border-subtle p-3"}>{!snapshot && <p className="mb-2 text-xs font-bold text-primary">{h.after}</p>}<RevisionValue value={difference.after} language={language} path={difference.path} /></div>
    </div></article>)}
    {limit < differences.length && <Button variant="outline" onClick={() => setLimit(value => value + 40)}>{h.moreChanges}</Button>}
  </section>;
}

function RevisionValue({ value, language, path }: { value: unknown; language: Language; path: (string | number)[] }) {
  const h = revisionCopy(language), c = schoolAICopy(language), [expanded, setExpanded] = useState(false);
  let text: string;
  if (value === undefined) text = h.notPresent;
  else if (value === null || value === "" || Array.isArray(value) && !value.length) text = h.empty;
  else if (typeof value === "boolean") text = value ? h.yes : h.no;
  else if (typeof value === "number") text = new Intl.NumberFormat(language).format(value);
  else if (typeof value === "string") {
    const field = path[path.length - 1];
    text = path.includes("confirmedKeys") ? revisionFieldLabel([value], language) : field === "status" && value in c ? c[value as keyof typeof c] : value;
  } else text = JSON.stringify(value, null, 2);
  const truncated = text.length > 4000;
  return <div className="min-w-0"><p dir="auto" className="whitespace-pre-wrap break-words text-start text-sm leading-relaxed [overflow-wrap:anywhere]">{truncated && !expanded ? `${text.slice(0, 4000)}…` : text}</p>{truncated && <Button variant="ghost" size="sm" className="mt-2" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? h.showLess : h.showFull}</Button>}</div>;
}
