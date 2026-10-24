"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, RadioTower } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioOfficeCopy } from "@/lib/school-ai/exam-studio-copy-office";
import type { ReadinessCheck } from "@/lib/academic/exam-readiness";

type Readiness = { day: string | null; days: string[]; ready: boolean; blocking: number; openExceptions: number; papers: Array<{ scheduleId: string; label: string; startTime: string | null; ready: boolean; checks: Array<{ check: ReadinessCheck; ok: boolean }> }> };

/**
 * SKO-506 Control tower: one answer to "are we ready for <day>?" with the rule it applies printed beneath,
 * and per paper the checks still open. The day defaults to the next day with papers.
 */
export function ControlTower({ sessionId, refreshKey }: { sessionId: string; refreshKey?: string }) {
  const { language } = useLocale();
  const t = studioOfficeCopy(language);
  const [day, setDay] = useState("");
  const [data, setData] = useState<Readiness | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/academic/exam-sessions/${encodeURIComponent(sessionId)}/readiness${day ? `?date=${day}` : ""}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setData(payload.data);
  }, [sessionId, day]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  if (!data) return null;
  const when = (date: string) => new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const n = (value: number) => new Intl.NumberFormat(language).format(value);
  return <section aria-labelledby="control-tower" className="sk-panel space-y-3 p-4" data-control-tower data-ready={data.ready ? "yes" : "no"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="control-tower" className="flex items-center gap-2 text-base font-bold text-ink-strong"><RadioTower aria-hidden="true" className="size-4" />{data.day ? fillStudioCopy(t.towerTitle, [when(data.day)]) : t.towerNoPapers}</h2>
      {data.days.length > 0 && <label className="flex items-center gap-2 text-sm font-semibold">{t.towerDay}<Select aria-label={t.towerDay} value={data.day ?? ""} onChange={event => setDay(event.target.value)}>{data.days.map(date => <option key={date} value={date}>{when(date)}</option>)}</Select></label>}
    </div>
    {data.day && <p className={cn("flex items-center gap-2 rounded-xl p-3 text-lg font-bold", data.ready ? "bg-status-success-surface text-status-success-text" : "bg-status-warning-surface text-status-warning-text")} data-tower-answer>
      {data.ready ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <CircleAlert aria-hidden="true" className="size-5" />}
      {data.ready ? t.towerReady : t.towerNotReady}{!data.ready && data.blocking > 0 ? <span className="text-sm font-semibold"> · {fillStudioCopy(t.towerBlocking, [n(data.blocking)])}</span> : null}
    </p>}
    <p className="text-xs text-ink-subtle" data-tower-rule>{t.towerRule}</p>
    {data.papers.length > 0 && <ul className="grid gap-2 md:grid-cols-2">{data.papers.map(paper => <li key={paper.scheduleId} className="rounded-xl border border-border p-3" data-tower-paper={paper.ready ? "ready" : "open"}>
      <p className="font-semibold text-ink-strong [overflow-wrap:anywhere]"><bdi>{paper.label}</bdi>{paper.startTime ? <span className="text-xs font-normal text-ink-muted"> · <bdi dir="ltr">{paper.startTime}</bdi></span> : null}</p>
      <ul className="mt-2 grid gap-1 text-sm">{paper.checks.map(check => <li key={check.check} className={cn("flex items-center gap-2", check.ok ? "text-ink-muted" : "font-semibold text-status-warning-text")} data-tower-check={check.check} data-ok={check.ok ? "yes" : "no"}>
        {check.ok ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-status-success-text" /> : <CircleAlert aria-hidden="true" className="size-4 shrink-0" />}{t[`check${check.check}`]}
      </li>)}</ul>
    </li>)}</ul>}
    {data.openExceptions > 0 && <p className="rounded-xl bg-status-warning-surface p-3 text-sm text-status-warning-text" data-tower-exceptions>{fillStudioCopy(t.towerOpenExceptions, [n(data.openExceptions)])}</p>}
  </section>;
}
