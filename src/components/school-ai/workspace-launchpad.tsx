"use client";

import { useState, type ComponentType } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { Language } from "@/lib/locale/package";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { readSetupDraft, setupQuestions } from "@/lib/school-ai/onboarding";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { workspaceLaunchCopy } from "./workspace-launch-copy";
import styles from "./workspace-launchpad.module.css";

export type WorkspaceLaunchTab = "overview" | "sources" | "curriculum" | "academicSetup" | "timetableSetup" | "announcements" | "work" | "policies" | "history" | "feeInvoices" | "examPlanning" | "setupTasks" | "schoolOperations" | "financeOperations" | "runs" | "schoolSetup" | "knowledge";
const recommended: WorkspaceLaunchTab[] = ["academicSetup", "schoolSetup", "sources", "curriculum", "timetableSetup", "work"];

/**
 * The AI Workflows landing's workflow chooser (addendum 2026-10-22, flagship polish): the setup questionnaire comes
 * first for a school that has not finished it, then the recommended workflows. When the page hero already offers the
 * questionnaire as the screen's one primary, the host passes `setupVariant="outline"` so this block explains the
 * three steps without a second primary-styled button.
 */
export function WorkspaceLaunchpad({ language, tabs, onboarding, scopeName, needsCampus, needsSubject, hasCampuses, hasSubjects, canCreate, canOnboard, openingSetup, featureState, onSetup, onOpen, onRefreshFeatures, setupVariant = "default" }: {
  language: Language;
  tabs: ReadonlyArray<{ id: WorkspaceLaunchTab; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> }>;
  onboarding?: AiWorkspaceRecord;
  scopeName?: string;
  needsCampus: boolean; needsSubject: boolean; hasCampuses: boolean; hasSubjects: boolean;
  canCreate: boolean; canOnboard: boolean; openingSetup: boolean;
  featureState: "checking" | "unknown" | "live" | "prototype";
  onSetup: () => void; onOpen: (tab: WorkspaceLaunchTab) => void; onRefreshFeatures: () => void;
  setupVariant?: "default" | "outline";
}) {
  const [expanded, setExpanded] = useState(false);
  const c = schoolAICopy(language);
  const t = workspaceLaunchCopy(language);
  const draft = readSetupDraft(onboarding?.data);
  const questions = setupQuestions(draft).filter(question => question.key !== "path");
  const confirmed = questions.filter(question => question.key !== "path" && draft.confirmedKeys.includes(question.key)).length;
  const available = tabs.filter(tab => tab.id !== "overview");
  const primary = available.filter(tab => recommended.includes(tab.id));
  const preview = primary.length ? primary : available.slice(0, 6);
  const visible = expanded ? available : preview;
  const blocked = needsCampus || needsSubject;
  const setupLabel = onboarding ? draft.step === "review" ? t.reviewSetup : t.resume : t.start;
  return <section id="ai-launchpad" className={`${styles.launchpad} scroll-mt-4`} aria-labelledby="ai-launchpad-title" data-ai-workflow-launchpad>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>{scopeName ? `${t.selected} · ${scopeName}` : c.workspace}</p><h2 id="ai-launchpad-title" className={styles.title}>{t.title}</h2><p className={styles.hint}>{t.hint}</p></div>
      <span className={styles.status}><Sparkles className="size-4 shrink-0" aria-hidden="true" />{t[featureState]}</span>
    </div>
    {blocked && <Alert tone="info" compact>{needsCampus ? hasCampuses ? t.campus : t.noCampus : hasSubjects ? t.subject : t.noSubject}</Alert>}
    {!canCreate && !blocked && <Alert tone="info" compact>{t.readOnly}</Alert>}
    {canOnboard && <div className={styles.setup}>
      <div className={styles.setupIntro}><span className={styles.mark}><Sparkles aria-hidden="true" /></span><div><h3 className={styles.sectionTitle}>{t.setupTitle}</h3><p className={styles.hint}>{t.setupHint}</p></div></div>
      <ol className={styles.steps} aria-label={t.steps}>{[
        { title: t.describe, hint: t.describeHint, Icon: MessageCircle },
        { title: t.prepare, hint: t.prepareHint, Icon: Sparkles },
        { title: t.review, hint: t.reviewHint, Icon: ClipboardCheck },
      ].map(({ title, hint, Icon }, index) => <li key={title}><span className={styles.stepIcon}><Icon aria-hidden="true" /><span>{index + 1}</span></span><div><h4>{title}</h4><p>{hint}</p></div></li>)}</ol>
      <div className={styles.setupActions}><Button variant={setupVariant} disabled={blocked || !canCreate} loading={openingSetup} onClick={onSetup} data-ai-launch-setup>{setupLabel}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>{onboarding && <p className={styles.progress}><CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />{t.progress.replace("{done}", new Intl.NumberFormat(language).format(confirmed)).replace("{total}", new Intl.NumberFormat(language).format(questions.length))}</p>}</div>
    </div>}
    <div><p className={styles.availability}>{featureState === "live" ? t.liveHint : featureState === "prototype" ? canOnboard ? t.prototypeHint : t.formsHint : featureState === "unknown" ? t.unknownHint : t.checking}</p>{(featureState === "unknown" || featureState === "prototype") && <Button variant="ghost" size="sm" className="mt-2" onClick={onRefreshFeatures}><RefreshCw aria-hidden="true" />{t.checkAgain}</Button>}</div>
    <div className={styles.grid}>{visible.map(({ id, Icon }) => <article className={styles.card} key={id} data-ai-workflow={id}><span className={styles.cardIcon}><Icon aria-hidden={true} /></span><h3>{c[id]}</h3><p>{id !== "overview" ? t[id] : t.hint}</p><Button variant="outline" disabled={blocked} onClick={() => onOpen(id)}>{canCreate ? t.open : t.view}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button></article>)}</div>
    {available.length > preview.length && <Button variant="ghost" className="mt-3 w-full sm:w-auto" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? t.fewer : t.all}{expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</Button>}
  </section>;
}
