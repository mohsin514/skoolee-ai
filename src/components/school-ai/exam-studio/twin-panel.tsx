"use client";

import { useEffect, useState } from "react";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioIntelCopy } from "@/lib/school-ai/exam-studio-copy-intel";
import type { TwinItem, WatchItem } from "@/lib/school-ai/exam-twin";
import { TWIN_MIN_SAMPLE, WATCH_MIN_SAMPLE } from "@/lib/school-ai/exam-twin-constants";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Twin = { released: boolean; sittings: number; evidenceCutoff: string; forecast: TwinItem[]; comparison: Array<{ questionId: string; number: number; twin: number | null; sample: number; actualSample: number; scored: number | null; difference: number | null }> | null; watch: WatchItem[] | null };

/**
 * SKO-507 Exam Twin and Item Watch. The Twin is an estimate for each item from this class's earlier released
 * sittings, labelled as one; after release it sits beside what the class scored. Item Watch names items whose
 * results question the item, with the remedy to preview in "Correct an item after the exam".
 */
export function TwinPanel({ examId, language }: { examId: string; language: Language }) {
  const t = studioIntelCopy(language);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setTwin(null);
    setFailed(false);
    void fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/twin`, { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.twin) throw new Error("Evidence unavailable");
      if (live) setTwin(payload.twin);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [examId, retry]);
  if (failed) return <section className="sk-panel space-y-2 p-4" data-exam-twin-error><p role="alert">{t.loadError}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{t.retry}</Button></section>;
  if (!twin) return null;
  const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const rows = twin.comparison ?? twin.forecast.map(item => ({ questionId: item.questionId, number: item.number, twin: item.facility, sample: item.sample, actualSample: 0, scored: null, difference: null }));
  const flagged = (twin.watch ?? []).filter(item => item.flags.length);
  return <section aria-labelledby="exam-twin" className="sk-panel min-w-0 space-y-4 p-4 sm:p-5" data-exam-twin>
    <header className="space-y-1"><h3 id="exam-twin" className="text-base font-semibold">{t.twinTitle}</h3>
      <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{t.twinIntro}</p></header>
    <div className="grid gap-2 rounded-xl bg-surface-subtle p-3 text-xs leading-relaxed text-ink-muted sm:grid-cols-2 sm:gap-4">
      <p data-twin-cutoff>{fillStudioCopy(t.twinCutoff, [new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(twin.evidenceCutoff))])}</p>
      <p data-twin-history>{fillStudioCopy(t.twinHistory, [number(twin.sittings)])}</p>
    </div>
    {twin.forecast.every(item => item.reading === "NOT_MEASURED" && item.sample === 0) ? <p className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted">{t.twinNone}</p> : <Table className="min-w-[28rem]" containerClassName="max-w-full" aria-labelledby="exam-twin">
      <TableHeader><TableRow><TableHead className="w-36">#</TableHead><TableHead className="text-end">{t.twinSaid}</TableHead>{twin.released && <TableHead className="text-end">{t.twinScored}</TableHead>}</TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.questionId} data-twin-row={row.twin === null ? "not-measured" : "estimate"}>
        <TableHead scope="row" className="py-4 text-sm text-foreground">{fillStudioCopy(t.twinQuestion, [number(row.number)])}</TableHead>
        <TableCell className="text-end"><span className="block text-base font-semibold tabular-nums">{percent(row.twin)}</span><span className="mt-1 block text-xs leading-relaxed text-ink-muted">{row.twin === null ? fillStudioCopy(t.twinNotMeasured, [number(TWIN_MIN_SAMPLE)]) : fillStudioCopy(t.twinSample, [number(row.sample)])}</span></TableCell>
        {twin.released && <TableCell className="text-end" data-twin-scored><span className="block text-base font-semibold tabular-nums">{percent(row.scored)}</span><span className="mt-1 block text-xs leading-relaxed text-ink-muted">{row.scored === null ? fillStudioCopy(t.twinNotMeasured, [number(TWIN_MIN_SAMPLE)]) : fillStudioCopy(t.twinSample, [number(row.actualSample)])}</span></TableCell>}
      </TableRow>)}</TableBody>
    </Table>}
    {twin.watch && <div className="space-y-3 border-t border-border-subtle pt-4" data-item-watch>
      <h4 className="text-sm font-semibold">{t.watchTitle}</h4>
      <p className="text-xs text-ink-subtle">{t.watchIntro}</p>
      {twin.watch.some(item => item.reading === "NOT_MEASURED") && <p className="text-sm text-ink-subtle" data-watch-unmeasured>{twin.watch.filter(item => item.reading === "NOT_MEASURED").map(item => fillStudioCopy(t.twinQuestion, [number(item.number)])).join(" · ")}: {fillStudioCopy(t.watchNotMeasured, [number(WATCH_MIN_SAMPLE)])}</p>}
      {!flagged.length ? twin.watch.some(item => item.reading === "MEASURED") && <p className="text-sm text-ink-subtle">{t.watchClear}</p>
        : <ul className="grid gap-3">{flagged.map(item => <li key={item.questionId} className="space-y-2 rounded-xl border border-status-warning-border bg-status-warning-surface p-4 text-sm leading-relaxed text-status-warning-text" data-watch-item={item.flags.join(" ")}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"><p className="font-semibold">{fillStudioCopy(t.twinQuestion, [number(item.number)])} · {fillStudioCopy(t.watchDiscrimination, [new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.discrimination ?? 0)])}</p>
            <p className="text-xs tabular-nums">{fillStudioCopy(t.twinSample, [number(item.sample)])}</p></div>
          <ul className="list-disc space-y-1 ps-5">{item.flags.map(flag => <li key={flag}>{flag === "NEGATIVE_DISCRIMINATION" ? t.watchNegative : flag === "LOW_DISCRIMINATION" ? t.watchLow : fillStudioCopy(t.watchDistractor, [`⁨${item.preferredOption ?? ""}⁩`])}</li>)}</ul>
          {item.remedy && <a href="#remedy-title" className="mt-1 inline-flex min-h-11 items-center font-semibold underline">{t.watchRemedy}</a>}
        </li>)}</ul>}
    </div>}
  </section>;
}
