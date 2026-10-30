"use client";

import { useId, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Info, Loader2, MessageCircle, RefreshCw, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocaleFormat } from "@/components/locale/LocaleProvider";
import { t as runText, UI } from "@/components/ai-workflows/run-copy";
import type { Language } from "@/lib/locale/package";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { readSetupDraft, setupQuestions } from "@/lib/school-ai/onboarding";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { cn } from "@/lib/utils";
import { workspaceLaunchCopy } from "./workspace-launch-copy";
import styles from "./workspace-launchpad.module.css";
import frame from "./school-ai.module.css";

export type WorkspaceLaunchTab = "overview" | "sources" | "curriculum" | "academicSetup" | "timetableSetup" | "announcements" | "work" | "policies" | "history" | "feeInvoices" | "examPlanning" | "setupTasks" | "schoolOperations" | "financeOperations" | "runs" | "schoolSetup" | "knowledge";
const recommended: WorkspaceLaunchTab[] = ["academicSetup", "schoolSetup", "sources", "curriculum", "timetableSetup", "work"];

type Words = Record<Language, string>;
const pick = (words: Words, language: Language) => words[language] ?? words.en;
// The workflow forms stay manual; only Ask plans steps, and record changes still wait for a confirm.
const LAUNCH_HINT: Words = {
  en: "{ask} plans the steps for you; anything that changes records waits for your confirmation. Workflow forms stay available for manual work.",
  ar: "يخطط «{ask}» الخطوات لك، وكل ما يغيّر السجلات ينتظر تأكيدك. تبقى نماذج مسارات العمل متاحة للعمل اليدوي.",
  ur: "«{ask}» آپ کے لیے مراحل طے کرتا ہے؛ ریکارڈ بدلنے والا ہر قدم آپ کی تصدیق کا منتظر رہتا ہے۔ دستی کام کے لیے ورک فلو فارم دستیاب ہیں۔",
};
const WORKFLOWS: Words = { en: "Workflows", ar: "مسارات العمل", ur: "ورک فلوز" };
const CHECK_AGAIN: Words = { en: "Check again", ar: "تحقّق مجددًا", ur: "دوبارہ جانچیں" };
const LANES: Array<{ id: string; words: Words; tabs: WorkspaceLaunchTab[] }> = [
  { id: "setup", words: { en: "Set up", ar: "الإعداد", ur: "ترتیب" }, tabs: ["schoolSetup", "academicSetup", "timetableSetup", "setupTasks"] },
  { id: "teach", words: { en: "Teach & assess", ar: "التدريس والتقييم", ur: "تدریس اور جانچ" }, tabs: ["sources", "curriculum", "examPlanning", "knowledge"] },
  { id: "day", words: { en: "Run the day", ar: "إدارة اليوم", ur: "روزمرہ کام" }, tabs: ["schoolOperations", "announcements", "work"] },
  { id: "money", words: { en: "Money", ar: "المالية", ur: "مالیات" }, tabs: ["feeInvoices", "financeOperations"] },
  { id: "track", words: { en: "Track & review", ar: "المتابعة والمراجعة", ur: "نگرانی اور جائزہ" }, tabs: ["runs", "history", "policies"] },
];
const Spinner = (({ className, ...props }: { className?: string }) => <Loader2 {...props} className={cn(className, "motion-safe:animate-spin")} />) as unknown as LucideIcon;

type LaunchIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/**
 * The AI Workflows landing's workflow chooser (addendum 2026-10-22, flagship polish): the setup questionnaire comes
 * first for a school that has not finished it, then the recommended workflows. Ask stays the screen's one primary,
 * so the host passes `setupVariant="secondary"` (setup mode) or `"outline"`; `heroAction` marks the setup button as
 * the hero's first step when setup is unfinished.
 */
export function WorkspaceLaunchpad({ language, tabs, onboarding, scopeName, needsCampus, needsSubject, hasCampuses, hasSubjects, canCreate, canOnboard, openingSetup, featureState, onSetup, onOpen, onRefreshFeatures, setupVariant = "default", heroAction = false, scopeControl }: {
  language: Language;
  tabs: ReadonlyArray<{ id: WorkspaceLaunchTab; Icon: LaunchIcon }>;
  onboarding?: AiWorkspaceRecord;
  scopeName?: string;
  needsCampus: boolean; needsSubject: boolean; hasCampuses: boolean; hasSubjects: boolean;
  canCreate: boolean; canOnboard: boolean; openingSetup: boolean;
  featureState: "checking" | "unknown" | "live" | "prototype";
  onSetup: () => void; onOpen: (tab: WorkspaceLaunchTab) => void; onRefreshFeatures: () => void;
  setupVariant?: "default" | "outline" | "secondary";
  heroAction?: boolean;
  scopeControl?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = schoolAICopy(language);
  const t = workspaceLaunchCopy(language);
  const format = useLocaleFormat();
  const uid = useId();
  const draft = readSetupDraft(onboarding?.data);
  const questions = setupQuestions(draft).filter(question => question.key !== "path");
  const confirmed = questions.filter(question => (draft.confirmedKeys as readonly string[]).includes(question.key)).length;
  const available = tabs.filter(tab => tab.id !== "overview");
  const primary = available.filter(tab => recommended.includes(tab.id));
  const preview = [...primary, ...available.filter(tab => !recommended.includes(tab.id))].slice(0, 6);
  const blocked = needsCampus || needsSubject;
  const setupLabel = onboarding ? draft.step === "review" ? t.reviewSetup : t.resume : t.start;
  const progressText = t.progress.replace("{done}", format.number(confirmed)).replace("{total}", format.number(questions.length));
  const allConfirmed = questions.length > 0 && confirmed === questions.length;
  const availabilityTone = featureState === "live" ? "brand" : featureState === "unknown" ? "warning" : featureState === "prototype" ? "info" : "neutral";
  const availabilityTitle = featureState === "live" ? t.live : featureState === "prototype" ? t.prototype : featureState === "unknown" ? t.unknown : t.checking;
  const availabilityBody = featureState === "live" ? pick(LAUNCH_HINT, language).replace("{ask}", runText(UI, "askTitle", language)) : featureState === "prototype" ? canOnboard ? t.prototypeHint : t.formsHint : featureState === "unknown" ? t.unknownHint : null;
  const availabilityIcon: LucideIcon = featureState === "checking" ? Spinner : featureState === "unknown" ? AlertTriangle : featureState === "live" ? Sparkles : Info;

  const card = (id: WorkspaceLaunchTab, Icon: LaunchIcon, Heading: "h3" | "h4", index: number) => {
    const titleId = `${uid}-wf-${id}`;
    return <article className={cn(styles.card, frame.wfCard, "group sk-hover-lift sk-enter")} style={{ "--sk-delay": `${index * 40}ms` } as CSSProperties} key={id} data-ai-workflow={id} data-blocked={blocked || undefined}>
      <span className={cn("sk-icon-tile flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60 [&_svg]:size-5", frame.wfDim)}><Icon aria-hidden={true} /></span>
      <Heading id={titleId} className={cn("min-w-0 font-semibold text-ink-strong [overflow-wrap:anywhere]", frame.wfDim)} dir="auto">{c[id]}</Heading>
      <p className={frame.wfDim}>{id !== "overview" ? t[id] : t.hint}</p>
      <Button variant="ghost" size="sm" className={cn(frame.wfOpen, "sk-nudge-trigger -ms-2 self-start")} disabled={blocked} aria-describedby={titleId} onClick={() => onOpen(id)}>
        <span className={frame.wfOpenLabel}>{canCreate ? t.open : t.view}</span>
        <ArrowRight className={cn(frame.wfOpenArrow, "sk-nudge rtl:rotate-180")} aria-hidden="true" />
        <ChevronRight className={cn(frame.wfRowChevron, "size-5 text-ink-muted rtl:rotate-180")} aria-hidden="true" />
      </Button>
    </article>;
  };

  return <section id="ai-launchpad" className={`${styles.launchpad} scroll-mt-4`} aria-labelledby="ai-launchpad-title" data-ai-workflow-launchpad>
    <div className={styles.heading}>
      <div className="min-w-0">
        <p className="sk-eyebrow flex flex-wrap items-center gap-x-2 gap-y-1 text-primary"><span>{pick(WORKFLOWS, language)}</span>{scopeName ? <><span aria-hidden="true" className="text-ink-faint">·</span><span className="sr-only">{t.selected}</span><bdi className="min-w-0 normal-case tracking-normal [overflow-wrap:anywhere]">{scopeName}</bdi></> : null}</p>
        <h2 id="ai-launchpad-title" className={styles.title}>{t.title}</h2>
        <p className={styles.hint}>{t.hint}</p>
      </div>
      {available.length > preview.length && <Button variant="ghost" size="sm" className="shrink-0 gap-2 self-start" aria-expanded={expanded} aria-controls={`${uid}-grid`} onClick={() => setExpanded(value => !value)}>
        {expanded ? t.fewer : t.all}
        <Badge size="sm" variant="secondary" aria-hidden="true"><bdi data-numeric className="tabular-nums">{format.number(available.length)}</bdi></Badge>
        <ChevronDown aria-hidden="true" className={cn("transition-transform duration-(--duration-control) motion-reduce:transition-none", expanded && "rotate-180")} />
      </Button>}
    </div>
    {scopeControl ? <div className="sk-panel max-w-md p-4" data-static="">{scopeControl}</div> : null}
    <Alert compact tone={availabilityTone} icon={availabilityIcon} title={availabilityTitle} data-ai-availability={featureState}
      actions={featureState === "unknown" || featureState === "prototype" ? <Button variant="ghost" size="sm" onClick={onRefreshFeatures}><RefreshCw aria-hidden="true" />{pick(CHECK_AGAIN, language)}</Button> : undefined}>
      {availabilityBody}
    </Alert>
    {blocked && <Alert tone="info" compact>{needsCampus ? hasCampuses ? t.campus : t.noCampus : hasSubjects ? t.subject : t.noSubject}</Alert>}
    {!canCreate && !blocked && <Alert tone="info" compact>{t.readOnly}</Alert>}
    {canOnboard && <div className={cn(styles.setup, frame.lpSetupBand)}>
      <div className={styles.setupIntro}>
        <span className={styles.mark}><Sparkles aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-ink-strong">{t.setupTitle}</h3>
          <p className={styles.hint}>{t.setupHint}</p>
        </div>
      </div>
      <ol className={cn(styles.steps, frame.lpHideSm, "my-0")} aria-label={t.steps}>{[
        { title: t.describe, hint: t.describeHint, Icon: MessageCircle },
        { title: t.prepare, hint: t.prepareHint, Icon: Sparkles },
        { title: t.review, hint: t.reviewHint, Icon: ClipboardCheck },
      ].map(({ title, hint, Icon }, index) => <li key={title}><span className={styles.stepIcon}><Icon aria-hidden="true" /><span><bdi data-numeric className="tabular-nums">{format.number(index + 1)}</bdi></span></span><div><h4>{title}</h4><p>{hint}</p></div></li>)}</ol>
      <div className={styles.setupActions}>
        <Button variant={setupVariant} className="w-full sm:w-auto" disabled={blocked || !canCreate} loading={openingSetup} onClick={onSetup} data-ai-launch-setup data-ai-hero-action={heroAction || undefined}>{setupLabel}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>
        {onboarding && questions.length > 0 && <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-xs">
          <Progress size="sm" value={confirmed} max={questions.length} label={t.setupTitle} valueText={progressText} />
          <p className={styles.progress}>{allConfirmed && <CheckCircle2 className="size-4 shrink-0 text-status-success-text" aria-hidden="true" />}<span className="tabular-nums">{progressText}</span></p>
        </div>}
      </div>
    </div>}
    <div id={`${uid}-grid`} className="grid gap-6">
      {expanded
        ? LANES.map(lane => ({ lane, items: available.filter(tab => lane.tabs.includes(tab.id)) })).concat([{ lane: { id: "more", words: WORKFLOWS, tabs: [] }, items: available.filter(tab => !LANES.some(lane => lane.tabs.includes(tab.id))) }]).filter(group => group.items.length).map(({ lane, items }) => <section key={lane.id} className={frame.lane} aria-labelledby={`${uid}-lane-${lane.id}`}>
          <h3 id={`${uid}-lane-${lane.id}`} className="sk-eyebrow text-ink-muted">{pick(lane.words, language)}</h3>
          <div className={cn(styles.grid, "sk-stagger")}>{items.map(({ id, Icon }, index) => card(id, Icon, "h4", index))}</div>
        </section>)
        : <div className={styles.grid}>{preview.map(({ id, Icon }, index) => card(id, Icon, "h3", index))}</div>}
    </div>
  </section>;
}
