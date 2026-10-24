"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { examIncidentCopy, fill } from "./exam-incident-copy";

// SKO-408 R17.2, R22.10: notices addressed to this attempt, durable on the page (never a toast) and
// acknowledged one by one. Polled while the attempt is in progress; the paper itself never changes.
type Notice = { id: string; version: number; revised: boolean; text: string; question: number | null; createdAt: string; acknowledged: boolean };

export function ExamNotices({ id, locale, active, onPaused }: { id: string; locale: AssessmentLocale; active: boolean; onPaused?: (pausedAt: string | null, deadlineAt?: string | null) => void }) {
  const t = examIncidentCopy(locale);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const api = `/api/school-ai/exams/${encodeURIComponent(id)}/clarifications`;
  // Held in a ref so a parent's inline callback never restarts the poll.
  const pausedRef = useRef(onPaused);
  useEffect(() => { pausedRef.current = onPaused; }, [onPaused]);
  const load = useCallback(async () => {
    const response = await fetch(api, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { notices: Notice[]; pausedAt?: string | null; deadlineAt?: string | null };
    setNotices(payload.notices ?? []);
    pausedRef.current?.(payload.pausedAt ?? null, payload.deadlineAt ?? null);
  }, [api]);
  useEffect(() => {
    void load();
    if (!active) return;
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [active, load]);
  if (!notices.length) return null;
  const acknowledge = async (noticeId: string) => {
    setBusy(noticeId);
    const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledge: noticeId }) }).catch(() => null);
    setBusy(null);
    if (response?.ok) setNotices(previous => previous.map(notice => notice.id === noticeId ? { ...notice, acknowledged: true } : notice));
  };
  const unread = notices.some(notice => !notice.acknowledged);
  return <section aria-labelledby="exam-notices-title" role={unread ? "alert" : undefined} data-exam-notices
    className={`sk-panel space-y-3 p-5 ${unread ? "border-status-warning-border bg-status-warning-surface" : ""}`}>
    <h2 id="exam-notices-title" className="flex items-center gap-2 text-lg font-bold"><Megaphone aria-hidden="true" className="size-5" />{t.noticesTitle}</h2>
    <p className="text-sm">{t.noticeHint}</p>
    <ol className="grid gap-2">{notices.map(notice => <li key={notice.id} className="rounded-xl border bg-surface p-3" data-notice-read={notice.acknowledged}>
      <p className="text-xs font-semibold text-ink-subtle">{fill(t.notice, [new Intl.NumberFormat(locale).format(notice.version)])}{notice.revised ? ` · ${t.updated}` : ""}{notice.question ? ` · ${fill(t.aboutQuestion, [new Intl.NumberFormat(locale).format(notice.question)])}` : ""} · {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(notice.createdAt))}</p>
      <p dir="auto" className="mt-1 whitespace-pre-wrap">{notice.text}</p>
      <div className="mt-2">{notice.acknowledged ? <span className="text-sm font-semibold">{t.wasRead}</span> : <Button size="sm" disabled={busy === notice.id} onClick={() => void acknowledge(notice.id)}>{t.read}</Button>}</div>
    </li>)}</ol>
  </section>;
}
