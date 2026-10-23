"use client";

import { useEffect, useState } from "react";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioIntelCopy } from "@/lib/school-ai/exam-studio-copy-intel";
import type { TwinItem, WatchItem } from "@/lib/school-ai/exam-twin";
import { TWIN_MIN_SAMPLE, WATCH_MIN_SAMPLE } from "@/lib/school-ai/exam-twin-constants";

type Twin = { released: boolean; sittings: number; forecast: TwinItem[]; comparison: Array<{ questionId: string; number: number; twin: number | null; sample: number; scored: number | null; difference: number | null }> | null; watch: WatchItem[] | null };

/**
 * SKO-507 Exam Twin and Item Watch. The Twin is an estimate for each item from this class's earlier released
 * sittings, labelled as one; after release it sits beside what the class scored. Item Watch names items whose
 * results question the item, with the remedy to preview in "Correct an item after the exam".
 */
export function TwinPanel({ examId, language }: { examId: string; language: Language }) {
  const t = studioIntelCopy(language);
  const [twin, setTwin] = useState<Twin | null>(null);
  useEffect(() => {
    let live = true;
    setTwin(null);
    void fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/twin`, { cache: "no-store" }).then(async response => { const payload = await response.json().catch(() => ({})); if (live && response.ok) setTwin(payload.twin); });
    return () => { live = false; };
  }, [examId]);
  if (!twin) return null;
  const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const rows = twin.comparison ?? twin.forecast.map(item => ({ questionId: item.questionId, number: item.number, twin: item.facility, sample: item.sample, scored: null, difference: null }));
  const flagged = (twin.watch ?? []).filter(item => item.flags.length);
  return <section aria-labelledby="exam-twin" className="sk-panel space-y-3 p-4" data-exam-twin>
    <h3 id="exam-twin" className="font-semibold">{t.twinTitle}</h3>
    <p className="text-sm text-ink-subtle">{t.twinIntro}</p>
    {twin.forecast.every(item => item.reading === "NOT_MEASURED" && item.sample === 0) ? <p className="text-sm text-ink-subtle">{t.twinNone}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-sm">
      <thead><tr className="text-xs text-ink-subtle"><th className="p-2 text-start">#</th><th className="p-2 text-start">{t.twinSaid}</th>{twin.released && <th className="p-2 text-start">{t.twinScored}</th>}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.questionId} className="border-t" data-twin-row={row.twin === null ? "not-measured" : "estimate"}>
        <td className="p-2 font-semibold">{fillStudioCopy(t.twinQuestion, [number(row.number)])}</td>
        <td className="p-2"><span className="tabular-nums">{percent(row.twin)}</span> <span className="text-xs text-ink-subtle">{row.twin === null ? fillStudioCopy(t.twinNotMeasured, [number(TWIN_MIN_SAMPLE)]) : fillStudioCopy(t.twinSample, [number(row.sample)])}</span></td>
        {twin.released && <td className="p-2 tabular-nums" data-twin-scored>{percent(row.scored)}</td>}
      </tr>)}</tbody>
    </table></div>}
    {twin.watch && <div className="space-y-2 border-t pt-3" data-item-watch>
      <h4 className="text-sm font-semibold">{t.watchTitle}</h4>
      <p className="text-xs text-ink-subtle">{t.watchIntro}</p>
      {twin.watch.every(item => item.reading === "NOT_MEASURED") ? <p className="text-sm text-ink-subtle">{fillStudioCopy(t.watchNotMeasured, [number(WATCH_MIN_SAMPLE)])}</p>
        : !flagged.length ? <p className="text-sm text-ink-subtle">{t.watchClear}</p>
        : <ul className="grid gap-2">{flagged.map(item => <li key={item.questionId} className="rounded-xl border border-status-warning-border bg-status-warning-surface p-3 text-sm text-status-warning-text" data-watch-item={item.flags.join(" ")}>
          <p className="font-semibold">{fillStudioCopy(t.twinQuestion, [number(item.number)])} · {fillStudioCopy(t.watchDiscrimination, [new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.discrimination ?? 0)])}</p>
          <ul className="list-inside list-disc">{item.flags.map(flag => <li key={flag}>{flag === "NEGATIVE_DISCRIMINATION" ? t.watchNegative : flag === "LOW_DISCRIMINATION" ? t.watchLow : fillStudioCopy(t.watchDistractor, [`⁨${item.preferredOption ?? ""}⁩`])}</li>)}</ul>
          {item.remedy && <a href="#remedy-title" className="mt-1 inline-flex min-h-11 items-center font-semibold underline">{t.watchRemedy}</a>}
        </li>)}</ul>}
    </div>}
  </section>;
}
