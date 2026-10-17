"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { TaskFeedback } from "@/components/ui/task-patterns";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioEvidenceCopy } from "@/lib/school-ai/exam-studio-copy-evidence";

/**
 * SKO-408 R19, task 24.3: produce and download evidence packs for one assessment. The list comes
 * from the server on every mount, so a pack produced before a reload is still shown (R24.11).
 */
type PackRow = { id: string; scopeKind: string; includedKeys: boolean; includedCapture: boolean; requestedAt: string; downloadedAt: string | null; files: number; records: number; gaps: Array<{ type: string; id: string }> };

export function EvidencePackPanel({ examId, language, canIncludeKeys }: { examId: string; language: Language; canIncludeKeys: boolean }) {
  const t = studioEvidenceCopy(language);
  const [packs, setPacks] = useState<PackRow[] | null>(null);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [includeCapture, setIncludeCapture] = useState(false);
  const [captureReason, setCaptureReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const when = (value: string) => new Intl.DateTimeFormat(language === "ar" ? "ar" : language === "ur" ? "ur-PK" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  const load = useCallback(async () => {
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/evidence-pack`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    // Without the export right the panel stays empty rather than failing the whole space.
    setPacks(response.ok ? payload.packs as PackRow[] : []);
  }, [examId]);
  useEffect(() => { void load(); }, [load]);

  const produce = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/evidence-pack`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ includeKeys, includeCapture, ...(includeCapture ? { captureReason } : {}) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
      setMessage({ tone: "success", text: fillStudioCopy(t.produced, [payload.manifest.files.length, payload.manifest.records.length]) });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t.failed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="evidence-pack-title" className="sk-panel space-y-3 p-4" data-testid="evidence-pack-panel">
      <h3 id="evidence-pack-title" className="font-semibold">{t.title}</h3>
      <p className="text-sm text-ink-muted">{t.intro}</p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {canIncludeKeys ? (
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeKeys} onChange={event => setIncludeKeys(event.target.checked)} />{t.includeKeys}</label>
        ) : null}
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeCapture} onChange={event => setIncludeCapture(event.target.checked)} />{t.includeCapture}</label>
      </div>
      {includeCapture ? (
        <label className="block space-y-1 text-sm">
          <span>{t.captureReason}</span>
          <textarea className="w-full rounded-xl border border-border p-2" rows={2} value={captureReason} onChange={event => setCaptureReason(event.target.value)} aria-describedby="evidence-capture-hint" />
          <span id="evidence-capture-hint" className="block text-xs text-ink-muted">{t.captureReasonHint}</span>
        </label>
      ) : null}
      <Button type="button" onClick={produce} disabled={busy || (includeCapture && captureReason.trim().length < 10)}>{busy ? t.producing : t.produce}</Button>
      {message ? <TaskFeedback kind={message.tone} title={message.text} /> : null}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t.listTitle}</h4>
        {packs === null ? null : packs.length === 0 ? <p className="text-sm text-ink-muted">{t.none}</p> : (
          <ul className="space-y-2">
            {packs.map(pack => (
              <li key={pack.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <div className="space-y-0.5">
                  <p className="font-medium">{fillStudioCopy(t.producedAt, [when(pack.requestedAt)])}</p>
                  <p className="text-xs text-ink-muted">
                    {fillStudioCopy(t.filesCount, [pack.files])} · {fillStudioCopy(t.recordsCount, [pack.records])} · {pack.gaps.length ? fillStudioCopy(t.gapsCount, [pack.gaps.length]) : t.noGaps}
                    {pack.includedKeys ? ` · ${t.withKeys}` : ""}{pack.includedCapture ? ` · ${t.withCapture}` : ""}
                  </p>
                  {pack.downloadedAt ? <p className="text-xs text-ink-muted">{fillStudioCopy(t.downloadedAt, [when(pack.downloadedAt)])}</p> : null}
                </div>
                <a className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/api/school-ai/exams/${encodeURIComponent(examId)}/evidence-pack/${encodeURIComponent(pack.id)}`} download onClick={() => window.setTimeout(() => void load(), 1500)}>{t.download}</a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-muted">{fillStudioCopy(t.verifyHint, ["manifest.json", "shasum -a 256"])}</p>
      </div>
    </section>
  );
}
