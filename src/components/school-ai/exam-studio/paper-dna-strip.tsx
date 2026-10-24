"use client";

import { useEffect, useState } from "react";
import { Dna } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { PaperDna } from "@/lib/school-ai/paper-dna";
import { Isolated } from "./space-state";

/**
 * SKO-500: Paper DNA, a compact strip above a paper. Deterministic (no provider): marks per section
 * and question type, outcome coverage against what is taught, an estimated time, difficulty mix, and
 * plain advisories. The time is always labelled an estimate.
 */
export function PaperDnaStrip({ language, paperId, version }: { language: Language; paperId: string; version: number }) {
  const t = studioHomeCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const [dna, setDna] = useState<PaperDna | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setDna(null); setFailed(false);
    void fetch(`/api/school-ai/workspace/${encodeURIComponent(paperId)}/dna`, { cache: "no-store" }).then(response => (response.ok ? response.json() : Promise.reject())).then(payload => { if (live) setDna(payload.dna); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [paperId, version]);
  if (failed) return <Alert tone="info" compact>{t.dnaFailed}</Alert>;
  if (!dna) return null;
  const words = t as Record<string, string>;
  return <section className="sk-panel space-y-3 p-4" aria-labelledby={`dna-${paperId}`} data-paper-dna>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id={`dna-${paperId}`} className="flex items-center gap-2 text-base font-bold"><Dna aria-hidden="true" className="size-4 text-primary" />{t.dnaTitle}</h3>
      <p className="text-xs text-ink-subtle">{t.dnaIntro}</p>
    </header>
    {dna.advisories.length ? <ul className="space-y-1">{dna.advisories.map(code => <li key={code}><Alert tone={code === "ASSESSES_UNTAUGHT" || code === "MARKS_DO_NOT_ADD_UP" ? "warning" : "info"} compact>{words[`dna${code}`] ?? code}</Alert></li>)}</ul> : null}
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <p className="text-sm font-semibold">{fillStudioCopy(t.dnaMarks, [number(dna.marks.items), number(dna.marks.blueprint)])}</p>
        <p className="text-2xs font-semibold text-ink-subtle">{t.dnaSections}</p>
        <ul className="space-y-1.5">{dna.marks.bySection.map(section => <li key={section.sectionId} className="space-y-0.5 text-xs">
          <span className="flex justify-between gap-2"><Isolated>{section.title}</Isolated><bdi>{number(section.marks)}</bdi></span>
          <Progress value={section.share} max={100} size="sm" label={section.title} valueText={`${number(section.share)}%`} />
        </li>)}</ul>
      </div>
      <div className="space-y-2">
        <p className="text-2xs font-semibold text-ink-subtle">{t.dnaTypes}</p>
        <ul className="space-y-1 text-xs">{dna.marks.byType.map(row => <li key={row.type} className="flex justify-between gap-2"><span>{words[`type${row.type}`] ?? row.type}</span><bdi>{number(row.share)}%</bdi></li>)}</ul>
        <p className="text-xs">{fillStudioCopy(t.dnaDifficulty, [number(dna.difficulty.EASY), number(dna.difficulty.MEDIUM), number(dna.difficulty.HARD), number(dna.difficulty.UNSPECIFIED)])}</p>
      </div>
      <div className="space-y-1.5 text-xs">
        <p className="font-semibold">{fillStudioCopy(t.dnaCoverage, [number(dna.coverage.assessed.length)])}</p>
        <p>{fillStudioCopy(t.dnaTaughtNotAssessed, [number(dna.coverage.taughtNotAssessed.length)])}</p>
        {dna.coverage.assessedNotTaught.length ? <p className="font-semibold text-status-warning-text">{fillStudioCopy(t.dnaAssessedNotTaught, [number(dna.coverage.assessedNotTaught.length)])}</p> : null}
        <p className="pt-1 text-sm font-semibold">{fillStudioCopy(t.dnaTime, [number(dna.time.estimatedMinutes), number(dna.time.durationMinutes)])}</p>
        <p className="text-ink-subtle">{t.dnaTimeNote}</p>
      </div>
    </div>
  </section>;
}
