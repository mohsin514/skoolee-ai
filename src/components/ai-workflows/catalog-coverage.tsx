"use client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Lang, T } from "./run-copy";
import { ClassGlyph, type StepClass } from "./workflow-marks";
import { Num, useWorkflowFormat } from "./workflow-format";

const WORDS = {
  eyebrow: { en: "Connected so far", ar: "المتصل حتى الآن", ur: "اب تک منسلک" },
  of: { en: "of {0} things you can do", ar: "من {0} مما يمكنك فعله", ur: "آپ کے {0} کاموں میں سے" },
  progress: { en: "AI coverage for your role", ar: "تغطية الذكاء الاصطناعي لدورك", ur: "آپ کے کردار کے لیے اے آئی کی رسائی" },
  valueText: { en: "{0} of {1}", ar: "{0} من {1}", ur: "{1} میں سے {0}" },
  tip: {
    en: "Counted from every action your role can take in Skoolee. AI is connected to these so far; the rest stay on their usual screens.",
    ar: "محسوب من كل إجراء يمكن لدورك القيام به في Skoolee. الذكاء الاصطناعي متصل بهذه حتى الآن؛ ويبقى الباقي على شاشاته المعتادة.",
    ur: "Skoolee میں آپ کے کردار کے ہر کام سے گنا گیا۔ اے آئی اب تک ان سے منسلک ہے؛ باقی اپنی معمول کی اسکرینوں پر رہتے ہیں۔",
  },
  tipLabel: { en: "How this is counted", ar: "كيف يُحسب هذا", ur: "یہ کیسے گنا جاتا ہے" },
  legend: { en: "Show only", ar: "اعرض فقط", ur: "صرف دکھائیں" },
} satisfies Record<string, T>;

export interface CoverageLegendItem { id: StepClass; label: string; count: number }

/** The honest coverage band: the connected count against everything the role can do, plus a per-class legend that filters. */
export function CatalogCoverage({ connected, total, legend, active, onPick, language }: {
  connected: number; total: number; legend: CoverageLegendItem[]; active: string; onPick: (id: StepClass) => void; language: Lang;
}) {
  const format = useWorkflowFormat();
  return (
    <section
      data-ai-coverage={`${connected}/${total}`}
      aria-labelledby="ai-catalog-coverage"
      className="relative overflow-hidden rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100 sm:p-6"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -top-16 -end-16 size-48 rounded-full bg-brand-200/50 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2 lg:max-w-md lg:flex-1">
          <p id="ai-catalog-coverage" className="sk-eyebrow inline-flex items-center gap-1.5 text-brand-700">
            {WORDS.eyebrow[language]}
            <InfoTip content={WORDS.tip[language]} label={WORDS.tipLabel[language]} />
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Num value={connected} className="text-3xl font-bold text-ink-strong" />
            <span className="text-sm text-ink-muted">{WORDS.of[language].replace("{0}", format.count(total))}</span>
          </p>
          <Progress
            tone="brand"
            value={connected}
            max={Math.max(total, 1)}
            label={WORDS.progress[language]}
            valueText={WORDS.valueText[language].replace("{0}", format.count(connected)).replace("{1}", format.count(total))}
          />
        </div>
        {legend.length > 0 ? (
          <div role="group" aria-label={WORDS.legend[language]} className="flex flex-wrap gap-1.5">
            {legend.map(item => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={active === item.id}
                onClick={() => onPick(item.id)}
                className={cn("bg-card/70 ring-1 ring-brand-100", active === item.id && "bg-card text-primary ring-brand-300")}
              >
                <ClassGlyph cls={item.id} />
                <span>{item.label}</span>
                <Num value={item.count} className="font-bold" />
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
