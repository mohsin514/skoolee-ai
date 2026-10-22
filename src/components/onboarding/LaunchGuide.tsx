"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, MapPin, MonitorPlay, Pause, Play, RotateCcw, ShieldCheck, Workflow } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { InkHeading } from "@/components/ui/ink-heading";
import { FlagshipChip } from "@/components/ui/flagship";
import { roleLabelFor, type UserRole } from "@/lib/roles";
import type { Language } from "@/lib/locale/package";
import { flagshipOf, planFlagships, type LaunchPlan } from "@/lib/onboarding/launch-plan";
import SkooleeLogo from "@/components/SkooleeLogo";
import { GuideStage } from "./GuideStage";
import { GuideShowcase } from "./GuideShowcase";
import { launchCopy } from "./launch-copy";
import { guideRoleFor, roleGuideCopy } from "./role-guide-copy";
import { roleGuideIcons } from "./role-guide-icons";
// The dependency-free tours module, not the provider: the welcome must not pull the tour engine into its chunk.
import { START_TOUR_EVENT, subscribeTourAvailability, tourAvailableSnapshot } from "@/lib/onboarding/tours/types";
import styles from "./launch-guide.module.css";

export interface LaunchContext extends LaunchPlan {
  userId: string;
  role: UserRole;
  /** Optional until /api/auth/welcome returns it. Only a known STANDALONE kind gives an ADMIN the owner story; unknown
   *  fails closed to the campus story (SPEC §8.2, C32). */
  institutionKind?: "GROUP" | "STANDALONE";
  /** The subscription capability (canOwnSubscription) when known. The owner story mentions billing only when this is
   *  true; unknown fails closed to the school-admin story without billing (SPEC §0.3 rule 2). */
  billing?: boolean;
  language: Language;
  fullName: string;
  schoolName: string;
  campusName: string | null;
  completed: boolean;
}

export function LaunchGuide({ context, onFinish, onDismiss }: { context: LaunchContext; onFinish: (href?: string) => Promise<void>; onDismiss: () => void }) {
  const c = launchCopy(context.language);
  // The story role, not the account role: an ADMIN hears the owner story only in a known STANDALONE school, and the
  // billing part of it only while they hold the subscription.
  const storyRole = guideRoleFor(context.role, context.institutionKind);
  const standaloneOwner = storyRole === "ADMIN";
  const billingOwner = standaloneOwner && context.billing === true;
  const personal = roleGuideCopy(storyRole, context.language, undefined, { billing: billingOwner });
  // GuideStage and GuideShowcase personalise by role alone, and their ADMIN story includes billing: a school admin
  // without the subscription gets the journey's general stage rather than a claim the server would refuse.
  const stageRole = standaloneOwner && !billingOwner ? undefined : storyRole;
  // "Show me around" is offered only where a console tour can run (a RoleShell with a tour is mounted).
  const tourReady = useSyncExternalStore(subscribeTourAvailability, tourAvailableSnapshot, () => false);
  const RoleIcon = roleGuideIcons[storyRole][0];
  const institutionSetup = context.actions.some(action => action.task === "institution");
  // Task wording at the school's scope: the institution authority (the group admin, the known standalone owner) sets up
  // the school with AI and reviews the school's own profile; everyone else works on a campus.
  const schoolScope = standaloneOwner || context.role === "SUPER_ADMIN";
  const taskLabel = (task: LaunchContext["actions"][number]["task"]) => c.task(task, schoolScope);
  // The flagships this plan leads to (addendum 2026-10-22), introduced on the first chapter and marked on the choices.
  const flagships = planFlagships(context.actions);
  const flagshipsHeading = useId();
  const [chapter, setChapter] = useState(0);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  // The guide opens on the showcase; "Return to my guide" leads into the personal chapters.
  const [showcase, setShowcase] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showcase) {
      content.current?.scrollTo({ top: 0 });
      heading.current?.focus({ preventScroll: true });
    }
  }, [chapter, showcase]);
  const finish = async (href?: string): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(false);
    try { await onFinish(href); return true; } catch { setError(true); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  // Ends the welcome story here and hands over to the spotlight tour of this console.
  const showMeAround = async () => {
    if (await finish()) window.dispatchEvent(new CustomEvent(START_TOUR_EVENT, { detail: {} }));
  };
  const chapters = [c.welcome, c.prepare, c.choose];
  return <ModalSurface fullscreen ariaLabel={showcase ? c.showcase : c.guide} initialFocusRef={heading} onClose={showcase ? () => setShowcase(false) : onDismiss} dismissible={!busy} disableBackdropClose dir={context.language === "en" ? "ltr" : "rtl"} lang={context.language}>
    {showcase ? <GuideShowcase language={context.language} role={stageRole} flagships={flagships} onReturn={() => setShowcase(false)} onContinue={() => { setChapter(2); setShowcase(false); }} /> : <section className={styles.surface} data-launch-guide data-role={context.role} data-chapter={chapter} data-paused={paused || undefined}>
      <header className={styles.topbar}>
        <SkooleeLogo size="1.8rem" weight="heavy" />
        <div className={styles.topActions}>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setShowcase(true)}><MonitorPlay aria-hidden="true" />{c.showcase}</Button>
          <Button variant="ghost" size="sm" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? c.play : c.pause}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void finish()}>{c.later}</Button>
        </div>
      </header>
      <div className={styles.body}>
        <GuideStage chapter={chapter} language={context.language} paused={paused} role={stageRole} journey={context.journey} />
        <div className={styles.content} ref={content} data-guide-scroll>
          <p className={styles.eyebrow}><span className={styles.liveDot} aria-hidden="true" />{c.eyebrow} · 0{chapter + 1}</p>
          <InkHeading className={styles.title} ref={heading} tabIndex={-1} swashKey={chapter} text={chapter === 0 ? personal.title : chapter === 1 ? institutionSetup ? c.journey("institution") : personal.preparationTitle : personal.chooseTitle} />
          <div className={styles.context}>
            <span><RoleIcon className="size-3.5" aria-hidden="true" />{context.fullName.trim().split(/\s+/)[0]} · {roleLabelFor({ role: context.role, institutionKind: context.institutionKind }, context.language)}</span>
            <span><MapPin className="size-3.5" aria-hidden="true" />{context.campusName || context.schoolName}</span>
          </div>
          <p className={styles.description}>{chapter === 0 ? personal.introduction : chapter === 1 ? institutionSetup ? c.preparation("institution") : personal.preparation : personal.scenes[2].caption}</p>
          {chapter === 0 && <div className={styles.note}><Compass aria-hidden="true" /><div><strong>{personal.scopeTitle}</strong><p>{personal.scopeHint}</p></div></div>}
          {chapter === 0 && flagships.length > 0 && <section className={styles.flagships} aria-labelledby={flagshipsHeading} data-guide-flagships>
            <h2 id={flagshipsHeading} className={styles.flagshipsTitle}>{c.flagshipsTitle}</h2>
            <ul className={styles.flagshipList}>{flagships.map(flagship => <li key={flagship} className={styles.flagship} data-flagship={flagship}>
              <p className={styles.flagshipName}><FlagshipChip />{c.flagshipName(flagship)}</p>
              <p>{c.flagshipPitch(flagship)}</p>
            </li>)}</ul>
          </section>}
          {chapter === 1 && <div className={styles.notes}>
            {(context.actions.some(action => action.task === "institution" || action.task === "aiSetup")) && <div className={styles.setupPath}><strong>{c.setupPath}</strong><ol>{[c.setupFoundation, c.setupInterview, c.setupDrafts].map(step => <li key={step}>{step}</li>)}</ol></div>}
            <div className={styles.note}><ShieldCheck aria-hidden="true" /><div><strong>{personal.reviewTitle}</strong><p>{personal.reviewHint}</p></div></div>
            <div className={styles.note}><RotateCcw aria-hidden="true" /><div><strong>{personal.saveTitle}</strong><p>{personal.saveHint}</p></div></div>
          </div>}
          {context.needsCampus && chapter > 0 && <Alert tone="info" compact>{c.campusMissing}</Alert>}
          {chapter === 2 && <div className={styles.choices} role="group" aria-label={c.choose}>{context.actions.map((action, index) =>
            <Button key={action.task} type="button" variant="choice" className={styles.choice} aria-pressed={selected === index} disabled={busy} onClick={() => setSelected(index)}>
              <Workflow aria-hidden="true" /><span className={styles.choiceText}>{taskLabel(action.task)}{flagshipOf(action.task) && <span aria-hidden="true" className={styles.choiceChip}><FlagshipChip /></span>}{index === 0 && <small>{c.recommended}</small>}</span>{selected === index && <Check aria-hidden="true" />}
            </Button>)}</div>}
          {chapter === 2 && context.actions[selected] && <div className={styles.nextStep} aria-live="polite"><p className={styles.eyebrow}>{c.nextStep}</p><p>{c.taskDetail(context.actions[selected].task, schoolScope)}</p></div>}
        </div>
      </div>
      <footer className={styles.bottom}><div className={styles.footerStatus}>
        {error && <Alert tone="danger" live="assertive" compact>{c.failed}</Alert>}
        <ol className={styles.chapters} aria-label={c.guide}>{chapters.map((label, index) => <li key={label} className={styles.chapter} aria-current={index === chapter ? "step" : undefined}><span className={styles.chapterNumber}>{index < chapter ? <Check className="size-3" aria-hidden="true" /> : `0${index + 1}`}</span>{label}</li>)}</ol>
        <p className={styles.replayHint}>{c.replayHint}</p></div>
          <div className={styles.actions} data-guide-actions>
            {chapter > 0 && <Button variant="outline" disabled={busy} onClick={() => setChapter(chapter - 1)}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{c.back}</Button>}
            {chapter === 2 && tourReady && <Button variant="outline" className={styles.tourChoice} disabled={busy} onClick={() => void showMeAround()}><Compass aria-hidden="true" />{c.showMeAround}</Button>}
            <Button size="lg" loading={busy} disabled={busy} onClick={() => chapter < 2 ? setChapter(chapter + 1) : void finish(context.actions[selected]?.href)}>
              {busy ? c.saving : chapter === 0 ? c.next : chapter === 1 ? c.continue : taskLabel(context.actions[selected]?.task ?? "workspace")}<ArrowRight className="rtl:rotate-180" aria-hidden="true" />
            </Button>
          </div>

      </footer>
    </section>}
  </ModalSurface>;
}
