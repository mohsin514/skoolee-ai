"use client";

import { ArrowUpRight, CheckCircle2, ClipboardList, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import type { SetupGenerationResult } from "@/lib/school-ai/setup-generation";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AssistantResponse } from "./assistant-response";
import { setupGenerationCopy } from "./setup-generation-copy";
import styles from "./school-ai.module.css";

export type { SetupGenerationResult } from "@/lib/school-ai/setup-generation";
export type SetupGenerationPhase = "idle" | "saving" | "generating" | "restoring" | "complete" | "failed";

export function SetupGenerationPanel({ language, phase, result, error, stale, disabled, onGenerate, onOpen }: {
  language: Language; phase: SetupGenerationPhase; result: SetupGenerationResult | null; error: string;
  stale: boolean; disabled: boolean; onGenerate: () => void; onOpen: (record: AiWorkspaceRecord) => void;
}) {
  const t = setupGenerationCopy(language);
  const c = schoolAICopy(language);
  const preparing = phase === "saving" || phase === "generating";
  const loading = preparing || phase === "restoring";
  const failed = phase === "failed";
  const complete = Boolean(result?.records.length && !stale);
  const academicDraft = result?.records.find(record => record.kind === "WORKFLOW" && record.status !== "ARCHIVED" && (record.data.proposal as { operation?: string } | undefined)?.operation === "academics.setup_year");
  const firstDraft = academicDraft ?? result?.records.find(record => record.status !== "ARCHIVED");
  return <section className={styles.setupGeneration} data-setup-generation={phase} data-state={preparing ? "generating" : failed ? "error" : complete ? "ready" : phase}>
    <div className={styles.generationHeader}>
      <div className={`${styles.generationMark} ${preparing ? styles.generationWorking : ""}`} aria-hidden="true">{loading ? <Sparkles /> : complete ? <CheckCircle2 /> : <ClipboardList />}</div>
      <div className="min-w-0 flex-1"><h2 className="text-xl font-bold leading-snug" aria-live="polite">{phase === "saving" ? t.saving : phase === "generating" ? t.generating : phase === "restoring" ? t.restoring : failed ? t.failed : complete ? t.ready : t.generate}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{phase === "saving" ? t.savingHint : phase === "generating" ? t.generatingHint : complete ? t.savedCount.replace("{count}", new Intl.NumberFormat(language).format(result!.records.length)) : !loading && !failed ? t.noResults : ""}</p></div>
    </div>
    {complete && firstDraft && !loading && <Button className="mt-5 w-full sm:w-auto" disabled={disabled} onClick={() => onOpen(firstDraft)} data-setup-primary-action>{academicDraft ? t.reviewAcademics : t.openFirst}<ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" /></Button>}
    {preparing && <ol className={styles.generationSteps} aria-label={t.generating} aria-busy="true">{[t.answersStep, t.draftsStep, t.readyStep].map((label, index) => {
      const current = phase === "saving" ? 0 : 1;
      return <li key={label} data-step-state={index < current ? "done" : index === current ? "active" : "pending"} aria-current={index === current ? "step" : undefined}>{index < current ? <CheckCircle2 aria-hidden="true" /> : index === current ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}<span>{label}</span></li>;
    })}</ol>}
    {error && <Alert className="mt-4" tone="danger" compact live="assertive">{error}</Alert>}
    {stale && result && <Alert className="mt-4" tone="warning" compact>{t.stale}</Alert>}
    {!loading && (!result || stale || failed) && <Button className="mt-4" disabled={disabled} onClick={onGenerate}>{failed ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{failed ? t.retry : stale ? t.regenerate : t.generate}</Button>}
    {result && !loading && <div className="mt-5 space-y-5" data-setup-generated-results>
      <div className="space-y-3"><span className={styles.demoBadge}>{result.mode === "live" ? <Sparkles className="size-3" aria-hidden="true" /> : <ClipboardList className="size-3" aria-hidden="true" />}{result.mode === "live" ? t.live : t.prototype}</span>{result.mode === "prototype" && <p className="text-sm leading-relaxed text-ink-muted">{t.prototypeHint}</p>}<div className="text-sm leading-relaxed"><AssistantResponse text={result.summary} /></div><p className="text-xs leading-relaxed text-ink-muted">{t.draftOnly}</p></div>
      <div className={styles.generationCards}>{result.records.map(record => {
        const goal = typeof record.data.goal === "string" ? record.data.goal : typeof record.data.instructions === "string" ? record.data.instructions : "";
        const steps = Array.isArray(record.data.steps) ? record.data.steps.flatMap(step => step && typeof step === "object" && "title" in step && typeof step.title === "string" ? [step.title] : []) : [];
        const missing = Array.isArray(record.data.missingInformation) ? record.data.missingInformation.filter((item): item is string => typeof item === "string") : [];
        const Icon = record.kind === "POLICY" ? ShieldCheck : ClipboardList;
        return <article key={record.id} className={styles.generationCard} data-setup-generated-record={record.id}>
          <div className="flex items-start gap-3"><span className={styles.choiceIcon}><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold text-primary">{record.status === "DRAFT" ? t.draft : c[record.status]}</p><h3 className="mt-1 text-base font-bold leading-snug">{record.title}</h3></div></div>
          <p className={`${styles.generationExcerpt} text-sm leading-relaxed text-ink-muted`}>{goal.replace(/\s+/g, " ").trim()}</p>
          {steps.length > 0 && <ol className="list-decimal ps-5 text-sm leading-relaxed"><li><span className={styles.generationStepPreview}>{steps[0]}</span></li></ol>}
          {(goal || steps.length > 0 || missing.length > 0) && <details className="text-sm"><summary className="cursor-pointer font-semibold text-primary">{t.details}</summary><div className="mt-3 space-y-3"><p className="whitespace-pre-wrap leading-relaxed">{goal}</p>{steps.length > 0 && <ol className="list-decimal space-y-2 ps-5">{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}{missing.length > 0 && <div className="rounded-xl border border-border bg-surface-subtle p-3"><p className="text-xs font-semibold">{t.missing}</p><ul className="mt-2 list-disc space-y-1 ps-4 text-xs leading-relaxed text-ink-muted">{missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</div></details>}
          {missing.length > 0 && <p className="text-xs font-semibold text-ink-muted">{t.missingCount.replace("{count}", new Intl.NumberFormat(language).format(missing.length))}</p>}
          <Button type="button" variant="outline" className="mt-auto w-full" disabled={disabled} onClick={() => onOpen(record)}>{record.kind === "POLICY" ? t.openPolicy : t.openWorkflow}<ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" /></Button>
        </article>;
      })}</div>
    </div>}
  </section>;
}
