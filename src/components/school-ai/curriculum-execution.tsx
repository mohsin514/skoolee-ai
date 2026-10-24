"use client";

import { Alert } from "@/components/ui/alert";
import { useRef, useState } from "react";
import { CheckCircle2, Eye, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { schoolAICopy, interpolateAI } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import type { CurriculumImportPreview, SchoolAiExecutionReceipt } from "@/lib/school-ai/execution";
import { workspaceErrorText, workspaceRequest } from "./workspace-client";
import styles from "./school-ai.module.css";

/** This explicit tool is the only execution affordance here; generated prose never becomes an API command. */
export function CurriculumExecution({ record, language, canApply, onApplied }: {
  record: { id: string; kind: string; version: number; status: string };
  language: Language;
  canApply: boolean;
  onApplied?: () => void | Promise<void>;
}) {
  const c = schoolAICopy(language);
  const [preview, setPreview] = useState<CurriculumImportPreview | null>(null);
  const [receipt, setReceipt] = useState<SchoolAiExecutionReceipt | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  if (!canApply || record.kind !== "CURRICULUM" || record.status !== "APPROVED") return null;
  const url = `/api/school-ai/workspace/${encodeURIComponent(record.id)}/execute`;
  const load = async () => {
    setBusy("preview"); setError(""); setConfirmed(false);
    try {
      const [result, history] = await Promise.all([
        workspaceRequest<{ preview: CurriculumImportPreview }>(`${url}?operation=curriculum.import_topics&version=${record.version}`),
        workspaceRequest<{ executions: SchoolAiExecutionReceipt[] }>(`${url}?history=1`),
      ]);
      const applied = history.executions.find(item => item.recordId === record.id && item.version === record.version && item.operation === "curriculum.import_topics");
      setReceipt(applied || null); setPreview(result.preview); idempotencyKey.current = crypto.randomUUID();
    } catch (error) { setError(workspaceErrorText(error, c)); }
    finally { setBusy(null); }
  };
  const apply = async () => {
    if (!preview || !confirmed || !idempotencyKey.current || busy) return;
    setBusy("apply"); setError("");
    try {
      const result = await workspaceRequest<{ execution: SchoolAiExecutionReceipt }>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "curriculum.import_topics", version: record.version, previewHash: preview.previewHash, idempotencyKey: idempotencyKey.current }) });
      setReceipt(result.execution); setConfirmed(false); await onApplied?.();
    } catch (error) { setError(workspaceErrorText(error, c)); }
    finally { setBusy(null); }
  };
  return <section className="sk-panel space-y-4 p-5" aria-busy={Boolean(busy)}><h3 className="flex items-center gap-2 font-bold"><CheckCircle2 aria-hidden="true" className="size-5 text-primary" />{c.applyCurriculum}</h3><p className="text-sm leading-relaxed text-ink-muted">{c.curriculumExecutionHint}</p>{!receipt && <p className="text-sm leading-relaxed text-ink-muted">{c.planApprovalHint}</p>}
    {!receipt && <Button variant="outline" onClick={() => void load()} disabled={Boolean(busy)}>{busy === "preview" ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Eye aria-hidden="true" />}{c.previewChanges}</Button>}
    {preview && !receipt && <div className="space-y-4"><div className={styles.notice}><div><p className="font-bold">{interpolateAI(c.topicsToCreate, { count: preview.willCreate.length })}</p><p>{interpolateAI(c.topicsToKeep, { count: preview.willKeep.length })}</p></div></div>
      {preview.willCreate.length ? <ol className="space-y-3">{preview.willCreate.map((topic, index) => <li key={topic.outcomeId} className="border-b border-border-subtle pb-3"><p className="text-sm font-semibold">{index + 1}. {topic.title}</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{c.sourceReference}: {topic.sourceTitle} · {topic.reference}</p></li>)}</ol> : <p className="text-sm text-ink-muted">{c.noNewTopics}</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><Checkbox className="mt-1" checked={confirmed} disabled={Boolean(busy)} onChange={event => setConfirmed(event.target.checked)} /><span>{c.confirmTopicImport}</span></label>
      <Button disabled={!confirmed || Boolean(busy)} onClick={() => void apply()}>{busy === "apply" ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Play aria-hidden="true" />}{busy === "apply" ? c.applyingTopics : c.applyTopics}</Button>
    </div>}
    {receipt && <div role="status" className={styles.notice}><CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><h4 className="font-bold">{c.appliedToSchool}</h4><p>{c.topicsApplied}</p><p>{interpolateAI(c.topicsToCreate, { count: receipt.createdCount })} · {interpolateAI(c.topicsToKeep, { count: receipt.keptCount })}</p><p className="mt-2 break-all text-xs">{c.executionReceipt}: {receipt.id}</p></div></div>}
    {error && <Alert tone="danger" compact>{error}</Alert>}
  </section>;
}
