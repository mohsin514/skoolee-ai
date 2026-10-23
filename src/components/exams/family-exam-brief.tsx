"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { examBriefSentence } from "./exam-brief-text";

type Brief = { versionId: string; version: number; publishedAt: string; acknowledgedAt: string | null; items: Array<{ scheduleId: string; kind: string; subject: string; date: string | null }> };

/** SKO-505 Family Exam Brief: the date-sheet changes that concern this child, each version acknowledged once. */
export function FamilyExamBrief({ studentId }: { studentId: string | null }) {
  const ui = useUiText();
  const { language } = useLocale();
  const { dateTime } = useLocaleFormat();
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  const load = useCallback(async () => {
    const response = await fetch(`/api/parent/exam-brief${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setBriefs(response.ok && Array.isArray(payload.data) ? payload.data : []);
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  const acknowledge = async (versionId: string) => {
    setBusy(versionId); setError("");
    const response = await fetch(`/api/parent/exam-brief${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId }) });
    setBusy("");
    if (!response.ok) { setError(ui("Could not record your acknowledgement. Please try again.")); return; }
    await load();
  };
  if (!briefs?.length) return null;
  return <section aria-labelledby="family-exam-brief" className="sk-panel space-y-3 p-4" data-family-exam-brief>
    <h2 id="family-exam-brief" className="flex items-center gap-2 text-base font-bold text-ink-strong"><BellRing aria-hidden="true" className="size-4" />{ui("Exam date sheet changed")}</h2>
    {error ? <p role="alert" className="text-sm text-status-error-text">{error}</p> : null}
    <ul className="grid gap-2">{briefs.map(brief => <li key={brief.versionId} className="space-y-2 rounded-xl border border-border p-3" data-brief-version={brief.version} data-brief-acknowledged={brief.acknowledgedAt ? "yes" : "no"}>
      <ul className="space-y-1 text-sm font-semibold text-ink-strong">{brief.items.map(item => <li key={item.scheduleId} data-brief-item={item.kind}>{examBriefSentence(ui, language, item)}</li>)}</ul>
      <p className="text-xs text-ink-muted">{ui("Published {0}", [dateTime(brief.publishedAt)])}</p>
      {brief.acknowledgedAt ? <p className="flex items-center gap-1 text-xs font-semibold text-status-success-text"><CheckCircle2 aria-hidden="true" className="size-4" />{ui("Acknowledged {0}", [dateTime(brief.acknowledgedAt)])}</p>
        : <Button size="sm" disabled={busy === brief.versionId} onClick={() => void acknowledge(brief.versionId)} data-acknowledge>{ui("Acknowledge")}</Button>}
    </li>)}</ul>
  </section>;
}
