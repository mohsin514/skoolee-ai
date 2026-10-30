"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { TaskLoading } from "@/components/ui/task-patterns";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { ConformanceCheck } from "@/lib/school-ai/moderation";
import { Isolated } from "./space-state";

/**
 * SKO-501: moderation beside the Seal. The moderator reads the paper with its key next to the
 * deterministic conformance report and signs it, or returns it with per-question comments. The author
 * sees the same panel read-only, with the comments of the latest decision.
 */
type View = {
  slot: { subjectName: string; gradeName: string };
  paperVersion: number; contentHashPrefix: string | null; canDecide: boolean; canSeal: boolean; sealedAt: string | null;
  report: ConformanceCheck[]; blocking: string[];
  items: Array<{ id: string; number: number; type: string; marks: number; prompt: string; options: Array<{ id: string; text: string }>; correctOptionId: string | null; correctOptionIds: string[] | null; modelAnswer: string | null; state: string; outcomes: string[] }>;
  history: Array<{ id: string; decision: string; comments: Array<{ questionId?: string; text: string }>; createdAt: string; current: boolean }>;
};

export function ModerationPanel({ slotId, onDone }: { slotId: string; onDone?: () => void }) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const words = t as Record<string, string>;
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/moderation`, { cache: "no-store" }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(typeof payload.error === "string" ? payload.error : t.failed); return; }
    setView(payload.data);
  }, [slotId, t.failed]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (decision: "SIGNED" | "RETURNED") => {
    if (!view) return;
    const list = Object.entries(comments).filter(([, text]) => text.trim()).map(([key, text]) => ({ ...(key === "general" ? {} : { questionId: key }), text: text.trim() }));
    if (decision === "RETURNED" && !list.length) { setError(t.needComment); return; }
    setBusy(true); setError(null);
    const response = await fetch(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/moderation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paperVersion: view.paperVersion, decision, comments: list }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) { setError(typeof payload.error === "string" ? payload.error : t.failed); return; }
    setNotice(decision === "SIGNED" ? t.signed : t.returned); setComments({});
    await load(); onDone?.();
  };

  const seal = async () => {
    if (!view) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/seal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paperVersion: view.paperVersion }) });
      const payload = await response.json();
      if (!response.ok) { setError(typeof payload.error === "string" ? payload.error : t.failed); return; }
      await load(); onDone?.();
    } catch { setError(t.failed); } finally { setBusy(false); }
  };

  if (error && !view) return <Alert tone="danger" compact>{error}</Alert>;
  if (!view) return <TaskLoading label={t.moderate} />;
  const latest = view.history[0];
  return <div className="space-y-4" data-moderation-panel>
    {view.sealedAt ? <Alert tone="success" compact>{fillStudioCopy(t.sealedOn, [date(view.sealedAt)])}</Alert> : null}
    {notice ? <Alert tone="success" compact live="polite">{notice}</Alert> : null}
    {error ? <Alert tone="danger" compact live="polite">{error}</Alert> : null}
    <section aria-labelledby="conformance-title" className="space-y-2">
      <h3 id="conformance-title" className="text-sm font-bold">{t.reportTitle}{view.contentHashPrefix ? <span className="ms-2 font-mono text-xs font-normal text-ink-subtle"><bdi dir="ltr">#{view.contentHashPrefix}</bdi></span> : null}</h3>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {view.report.map(check => <li key={check.code} className={cn("flex items-start gap-2 rounded-lg border p-2 text-xs", check.ok ? "border-status-success-border" : check.severity === "BLOCKING" ? "border-status-error-border bg-status-error-surface" : "border-status-warning-border")} data-check={check.code} data-ok={check.ok}>
          {check.ok ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 text-status-success-text" /> : check.severity === "BLOCKING" ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 text-status-error-text" /> : <Info aria-hidden="true" className="mt-0.5 size-4 text-status-warning-text" />}
          <span>{fillStudioCopy(words[`check${check.code}`] ?? check.code, check.values.map(value => typeof value === "number" ? number(value) : value))}{!check.ok && check.severity === "ADVISORY" ? <> · <em>{t.advisory}</em></> : null}</span>
        </li>)}
      </ul>
      {view.canDecide && view.blocking.length ? <Alert tone="warning" compact>{t.blockingNote}</Alert> : null}
    </section>
    {latest && !view.canDecide ? <section aria-labelledby="returned-title" className="space-y-1">
      <h3 id="returned-title" className="text-sm font-bold">{t.returnedComments} · <Badge variant={latest.decision === "SIGNED" ? "success" : "warning"} size="sm">{words[`decision${latest.decision}`]}</Badge></h3>
      <ul className="list-disc space-y-1 ps-5 text-sm">{latest.comments.map((comment, index) => <li key={index}>{comment.questionId ? <strong>{fillStudioCopy(studioHomeCopy(language).pulseQuestion, [number(view.items.find(item => item.id === comment.questionId)?.number ?? 0)])} · </strong> : null}<Isolated>{comment.text}</Isolated></li>)}</ul>
    </section> : null}
    <section aria-labelledby="mod-items" className="space-y-2">
      <h3 id="mod-items" className="text-sm font-bold">{t.itemsTitle}</h3>
      <ol className="space-y-2">
        {view.items.map(item => <li key={item.id} className="space-y-1.5 rounded-xl border border-border-subtle p-3 text-sm" data-mod-item>
          <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold"><bdi>{number(item.number)}.</bdi> <Isolated>{item.prompt}</Isolated></span><Badge variant="neutral" size="sm"><bdi>{number(item.marks)}</bdi></Badge></p>
          {item.options.length ? <ul className="grid gap-1 ps-4 text-xs">{item.options.map(option => <li key={option.id} className={cn((item.correctOptionId === option.id || item.correctOptionIds?.includes(option.id)) && "font-semibold text-status-success-text")}><Isolated>{option.text}</Isolated></li>)}</ul> : null}
          {item.modelAnswer ? <p className="text-xs"><span className="font-semibold">{t.keyLabel}:</span> <Isolated>{item.modelAnswer}</Isolated></p> : null}
          {item.outcomes.length ? <p className="text-xs text-ink-subtle">{item.outcomes.map((outcome, index) => <span key={index}>{index ? " · " : ""}<Isolated>{outcome}</Isolated></span>)}</p> : null}
          {view.canDecide ? <FormField name={`comment-${item.id}`} label={t.commentLabel}><Textarea rows={2} dir="auto" value={comments[item.id] ?? ""} maxLength={2000} onChange={event => { const value = event.currentTarget.value; setComments(current => ({ ...current, [item.id]: value })); }} /></FormField> : null}
        </li>)}
      </ol>
    </section>
    {view.canDecide ? <div className="space-y-3">
      <FormField name="comment-general" label={t.overallComment}><Textarea rows={2} dir="auto" value={comments.general ?? ""} maxLength={2000} onChange={event => { const value = event.currentTarget.value; setComments(current => ({ ...current, general: value })); }} /></FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="button" loading={busy} disabled={busy || view.blocking.length > 0} onClick={() => void decide("SIGNED")} data-moderation="sign">{t.sign}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void decide("RETURNED")} data-moderation="return">{t.returnPaper}</Button>
      </div>
    </div> : null}
    {view.history.length ? <section aria-labelledby="mod-history" className="space-y-1 text-xs text-ink-muted">
      <h3 id="mod-history" className="font-bold">{t.historyTitle}</h3>
      <ul className="space-y-0.5">{view.history.map(entry => <li key={entry.id}>{words[`decision${entry.decision}`]} · <bdi>{date(entry.createdAt)}</bdi>{entry.current ? null : <> · {t.decisionStale}</>}</li>)}</ul>
    </section> : null}
    {view.canSeal ? <section className="space-y-2 rounded-xl border border-border-subtle p-3" data-delegated-seal>
      <p className="text-sm">{t.sealIntro}</p>
      <Button type="button" loading={busy} disabled={busy} onClick={() => void seal()}>{t.sealConfirm}</Button>
    </section> : null}
  </div>;
}
