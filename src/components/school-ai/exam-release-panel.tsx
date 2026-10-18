"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AssessmentLocale, CandidatePaper } from "@/lib/school-ai/assessment";
import { examReleaseCopy } from "./exam-release-copy";
import { Checkbox } from "@/components/ui/checkbox";

// SKO-408: the review desk and rehearsal for one saved paper version.
type ItemState = "DRAFT" | "NEEDS_SOURCE" | "NEEDS_CORRECTION" | "READY_FOR_REVIEW" | "APPROVED" | "CHANGED_AFTER_APPROVAL";
type Check = "KEY_MISSING" | "OPTIONS_TOO_FEW" | "PROJECTION_LEAK" | "SECTION_COUNT" | "REPORTED_DEFECT";
/** The evidence drawer's view of one item (R4.7, R4.8). Keys arrive only for READ_PROTECTED_KEY holders. */
export type ItemEvidence = {
  prompt: string; type: string; marks: number;
  sources: Array<{ title: string | null; page: string; excerpt: string }>; outcomes: Array<{ id: string; title: string | null }>;
  reusedFrom: { paperId: string; paperVersion: number; questionId: string } | null;
  approvedBy: { itemRevision: number; at: string; name: string | null } | null;
  reviewHistory: Array<{ state: ItemState; at: string; note: string | null; name: string | null }>;
  key: { correct: string[]; numeric: { value: number; tolerance: number } | null; modelAnswer: string; rubric: Array<{ criterion: string; marks: number }> } | null;
};
export type Readiness = {
  version: number; status: string; workbench: boolean; counts: Record<ItemState, number>;
  items: Array<{ id: string; state: ItemState; itemRevision: number; invalidated: string[]; sourceRefs: Array<{ page: string; excerpt: string }> } & ItemEvidence>;
  generation: { kind: "MANUAL" | "AI"; model: string | null; generatedAt: string | null }; canReadKey: boolean;
  notices: Array<{ scope: "ITEM" | "FORM"; questionId: string | null; artifact: string; change: string; at: string; name: string | null }>;
  preview: CandidatePaper; contentHashPrefix: string | null;
  rehearsal: { id: string; paperVersion: number; results: Array<{ check: Check; severity: "BLOCKING" | "ADVISORY"; questionIds: string[]; detail: string }>; createdAt: string } | null;
  blockers: Array<{ code: "ITEM_NOT_APPROVED" | "REHEARSAL_INVALID" | "REHEARSAL_BLOCKER" | "NOT_REHEARSED"; check?: Check; questionIds: string[] }>;
};
type CompareItem = { prompt: string; marks: number; options: Array<{ id: string; text: string }>; modelAnswer: string; correctOptionId: string | null };
async function call(path: string, body?: unknown) {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}

export function ExamReleasePanel({ recordId, locale, canApprove, disabled, onChanged, onInspect, inspectLabel, onLoaded }: { recordId: string; locale: AssessmentLocale; canApprove: boolean; disabled: boolean; onChanged: () => Promise<void>;
  /** The review desk opens its evidence drawer from each item. */ onInspect?: (questionId: string) => void; inspectLabel?: string; onLoaded?: (view: Readiness) => void }) {
  const t = examReleaseCopy(locale);
  const [view, setView] = useState<Readiness | null>(null);
  const [findings, setFindings] = useState<Array<{ questionId: string; severity: "BLOCKING" | "ADVISORY"; detail: string }>>([]);
  const [draft, setDraft] = useState({ questionId: "", severity: "BLOCKING" as "BLOCKING" | "ADVISORY", detail: "" });
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rechecked, setRechecked] = useState<Record<string, boolean>>({});
  // SKO-408 R5.3–R5.7: one item regenerated beside the current one; nothing is saved until accepted.
  const [compare, setCompare] = useState<{ questionId: string; key: string; version: number; previous: CompareItem; candidate: CompareItem; differingFields: string[] } | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const api = `/api/school-ai/workspace/${encodeURIComponent(recordId)}`;
  const load = useCallback(async () => { const readiness = (await call(`${api}/rehearsal`)).readiness as Readiness; setView(readiness); onLoaded?.(readiness); }, [api, onLoaded]);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);
  const run = async (work: () => Promise<unknown>, reloadRecord = false) => {
    setBusy(true); setStatus(null);
    try { await work(); if (reloadRecord) await onChanged(); await load(); setStatus({ tone: "ok", text: t.saved }); }
    catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); }
    finally { setBusy(false); }
  };
  if (!view) return <section className="sk-panel p-5 text-sm">{status ? <p role="alert">{status.text}</p> : null}</section>;
  const number = (id: string) => view.preview.questions.findIndex(question => question.id === id) + 1;
  const editable = view.status !== "APPROVED" && view.status !== "ARCHIVED" && !disabled;
  return <section aria-labelledby="release-panel-title" className="sk-panel space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 id="release-panel-title" className="text-lg font-bold">{t.title}</h3>{view.contentHashPrefix && <p className="text-xs">{t.hash}: <bdi dir="ltr" className="font-mono">#{view.contentHashPrefix}</bdi></p>}</div>
    <p className="text-sm text-ink-subtle">{t.intro}</p>
    {status && <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{status.text}</p>}
    {!view.workbench && <p className="text-sm">{t.legacy}</p>}
    <ol className="grid gap-2" aria-label={t.question}>{view.items.map(item => <li key={item.id} className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{t.question} {number(item.id)} <span className="ms-2 rounded-full border px-2 py-0.5 text-xs" data-item-state={item.state}>{t.states[item.state]}</span> <span className="text-xs text-ink-subtle">{t.revision} {item.itemRevision}</span></p>
        <div className="flex flex-wrap gap-2">
          {editable && ["DRAFT", "NEEDS_SOURCE", "NEEDS_CORRECTION", "CHANGED_AFTER_APPROVAL"].includes(item.state) && <Button size="sm" variant="outline" disabled={busy || (item.invalidated.length > 0 && !rechecked[item.id])} onClick={() => void run(() => call(`${api}/item-review`, { version: view.version, questionId: item.id, target: "READY_FOR_REVIEW", itemRevision: item.itemRevision, ...(item.invalidated.length ? { confirmRechecked: item.invalidated } : {}) }), true)}>{t.ready}</Button>}
          {editable && canApprove && item.state === "READY_FOR_REVIEW" && <Button size="sm" disabled={busy} onClick={() => void run(() => call(`${api}/item-review`, { version: view.version, questionId: item.id, target: "APPROVED", itemRevision: item.itemRevision }), true)}>{t.approve}</Button>}
          {onInspect && inspectLabel && <Button size="sm" variant="outline" onClick={() => onInspect(item.id)}>{inspectLabel}</Button>}
          {editable && view.status === "DRAFT" && <Button size="sm" variant="outline" data-regenerate={item.id} disabled={busy || regenerating !== null} onClick={() => { const key = crypto.randomUUID(); setRegenerating(item.id); setStatus(null); call(`${api}/items/${encodeURIComponent(item.id)}/regenerate`, { idempotencyKey: key, version: view.version }).then(data => setCompare({ questionId: item.id, ...data })).catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })).finally(() => setRegenerating(null)); }}>{regenerating === item.id ? t.regenerating : t.regenerate}</Button>}
          {editable && ["READY_FOR_REVIEW", "APPROVED"].includes(item.state) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call(`${api}/item-review`, { version: view.version, questionId: item.id, target: "NEEDS_CORRECTION" }), true)}>{t.correction}</Button>}
        </div>
      </div>
      {compare?.questionId === item.id && <div className="space-y-2 rounded-xl border border-[#cfc2d6] p-3" data-item-compare>
        <p className="text-sm font-semibold">{t.compareTitle}</p>
        <p className="text-xs text-ink-subtle">{t.changedFields}: {compare.differingFields.length ? compare.differingFields.map(field => t.fieldLabels[field as keyof typeof t.fieldLabels] ?? field).join(locale === "en" ? ", " : "، ") : t.noChange}</p>
        <div className="grid gap-2 md:grid-cols-2">{([[t.previousItem, compare.previous], [t.candidateItem, compare.candidate]] as const).map(([label, version], index) => <div key={index} className={`space-y-1 rounded-lg border p-2 text-sm ${index === 1 ? "border-[#8127cf]/40 bg-[#faf7fc]" : ""}`} data-compare-side={index === 0 ? "previous" : "candidate"}>
          <p className="text-xs font-semibold text-ink-subtle">{label}</p>
          <p dir="auto" className={compare.differingFields.includes("prompt") ? "rounded bg-amber-50 px-1" : ""}>{version.prompt}</p>
          {version.options.length ? <ul className={`list-disc ps-5 ${compare.differingFields.includes("options") ? "rounded bg-amber-50" : ""}`}>{version.options.map(option => <li key={option.id} dir="auto">{option.text}{option.id === version.correctOptionId ? " ✓" : ""}</li>)}</ul> : null}
          <p className={`text-xs ${compare.differingFields.includes("marks") ? "rounded bg-amber-50 px-1" : ""}`}>{t.fieldLabels.marks}: {version.marks}</p>
          {version.modelAnswer ? <p dir="auto" className={`text-xs text-ink-subtle ${compare.differingFields.includes("modelAnswer") ? "rounded bg-amber-50 px-1" : ""}`}>{t.fieldLabels.modelAnswer}: {version.modelAnswer}</p> : null}
        </div>)}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void run(async () => { await call(`${api}/items/${encodeURIComponent(item.id)}/regenerate/accept`, { idempotencyKey: compare.key, version: compare.version }); setCompare(null); }, true)}>{t.acceptCandidate}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCompare(null)}>{t.keepPrevious}</Button>
        </div>
      </div>}
      {item.invalidated.length > 0 && editable && <label className="flex items-start gap-2 rounded-lg border border-status-warning-border p-2 text-sm"><Checkbox className="mt-1" checked={!!rechecked[item.id]} onChange={event => setRechecked(previous => ({ ...previous, [item.id]: event.target.checked }))} /><span>{t.recheck}: {item.invalidated.map(artifact => t.artifacts[artifact as keyof typeof t.artifacts] ?? artifact).join(", ")}</span></label>}
      <details className="text-sm"><summary className="cursor-pointer text-xs font-semibold">{t.evidence} ({item.sourceRefs.length})</summary><ul className="mt-1 list-disc ps-5">{item.sourceRefs.map((ref, index) => <li key={index}><span className="text-ink-subtle">{t.page} <bdi dir="ltr">{ref.page}</bdi>:</span> <q dir="auto">{ref.excerpt}</q></li>)}</ul></details>
    </li>)}</ol>
    <details className="rounded-xl border p-3 text-sm"><summary className="cursor-pointer font-semibold">{t.preview}</summary>
      <ol className="mt-2 list-decimal space-y-2 ps-5">{view.preview.questions.map(question => <li key={question.id} dir="auto">{question.prompt}{question.options?.length ? <ul className="list-disc ps-5">{question.options.map(option => <li key={option.id}>{option.text}</li>)}</ul> : null}</li>)}</ol>
    </details>
    <section aria-labelledby="rehearsal-title" className="space-y-3 rounded-xl border p-3">
      <h4 id="rehearsal-title" className="font-semibold">{t.rehearse} v{view.version}</h4>
      {!view.rehearsal ? <p className="text-sm text-ink-subtle">{t.noRehearsal}</p> : view.rehearsal.results.length === 0 ? <p className="flex items-center gap-2 text-sm"><CheckCircle2 aria-hidden="true" className="size-4 text-status-success-text" />{t.clean}</p>
        : <ul className="grid gap-1 text-sm" aria-label={t.results}>{view.rehearsal.results.map((result, index) => <li key={index} className={result.severity === "BLOCKING" ? "text-status-error-text" : ""}>{result.severity === "BLOCKING" ? t.blocking : t.advisory} · {t.checks[result.check]}{result.questionIds.length ? ` · ${t.question} ${result.questionIds.map(number).join(", ")}` : ""} · <span dir="auto">{result.detail}</span></li>)}</ul>}
      {!disabled && <fieldset className="grid gap-2 sm:grid-cols-[1fr_auto_2fr_auto] sm:items-end"><legend className="text-xs font-semibold">{t.report}</legend>
        <label className="grid gap-1 text-xs">{t.question}<Select value={draft.questionId} onChange={event => setDraft(previous => ({ ...previous, questionId: event.target.value }))}><option value="">—</option>{view.items.map(item => <option key={item.id} value={item.id}>{t.question} {number(item.id)}</option>)}</Select></label>
        <label className="grid gap-1 text-xs">{t.severity}<Select value={draft.severity} onChange={event => setDraft(previous => ({ ...previous, severity: event.target.value as "BLOCKING" | "ADVISORY" }))}><option value="BLOCKING">{t.blocking}</option><option value="ADVISORY">{t.advisory}</option></Select></label>
        <label className="grid gap-1 text-xs">{t.detail}<Input value={draft.detail} maxLength={300} onChange={event => setDraft(previous => ({ ...previous, detail: event.target.value }))} /></label>
        <Button type="button" variant="outline" disabled={!draft.questionId || draft.detail.trim().length < 5} onClick={() => { setFindings(previous => [...previous, draft]); setDraft({ questionId: "", severity: "BLOCKING", detail: "" }); }}>{t.add}</Button>
      </fieldset>}
      {findings.length > 0 && <div className="text-sm"><p className="text-xs font-semibold">{t.findings}</p><ul className="list-disc ps-5">{findings.map((finding, index) => <li key={index}>{t.question} {number(finding.questionId)} · {finding.severity === "BLOCKING" ? t.blocking : t.advisory} · <span dir="auto">{finding.detail}</span></li>)}</ul></div>}
      {!disabled && <Button type="button" disabled={busy} onClick={() => void run(async () => { await call(`${api}/rehearsal`, { version: view.version, findings }); setFindings([]); })}>{t.record}</Button>}
    </section>
    {view.workbench && (view.blockers.length ? <div role="alert" className="space-y-1 rounded-xl border border-status-warning-border p-3 text-sm"><p className="flex items-center gap-2 font-semibold"><ShieldAlert aria-hidden="true" className="size-4" />{t.blockers}</p><ul className="list-disc ps-5">{view.blockers.map((blocker, index) => <li key={index} data-blocker={blocker.code}>{blocker.code === "REHEARSAL_BLOCKER" && blocker.check ? `${t.blocking} · ${t.checks[blocker.check]}` : t.blockerText[blocker.code]}{blocker.questionIds.length ? ` · ${t.question} ${blocker.questionIds.map(number).join(", ")}` : ""}</li>)}</ul></div>
      : <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 aria-hidden="true" className="size-4 text-status-success-text" />{t.ready2}</p>)}
  </section>;
}
