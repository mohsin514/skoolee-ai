"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, ClipboardCheck, Maximize, Minimize, Pause, Play, RotateCcw, Repeat, Users, Workflow } from "lucide-react";
import SkooleeLogo from "@/components/SkooleeLogo";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { InkHeading } from "@/components/ui/ink-heading";
import { FlagshipChip } from "@/components/ui/flagship";
import type { Language } from "@/lib/locale/package";
import type { Flagship } from "@/lib/onboarding/launch-plan";
import type { UserRole } from "@/lib/roles";
import { GuideStage } from "./GuideStage";
import { launchCopy } from "./launch-copy";
import { roleGuideCopy } from "./role-guide-copy";
import { roleGuideIcons } from "./role-guide-icons";
import styles from "./launch-guide.module.css";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** The general showcase's scenes: the school and its people, then one scene per flagship (addendum 2026-10-22). */
const DEMO_FLAGSHIPS: readonly (Flagship | null)[] = [null, "ai-workflows", "exam-studio"];

/**
 * Presentation only. An optional role personalizes the private tour without account data; `flagships` (the ones the
 * caller's welcome plan leads to) are then shown under the role's scenes. Without a role the three scenes are the
 * product story, and two of them are SkooleeAI's flagships: AI Workflows and Exam Studio.
 */
export function GuideShowcase({ language, role, flagships = [], onReturn, onContinue, publicView = false, entryLabel, entryPending = false, entryError, completionDescription }: {
  language: Language; onReturn: () => void; onContinue?: () => void; publicView?: boolean;
  role?: UserRole; flagships?: readonly Flagship[];
  entryLabel?: string; entryPending?: boolean; entryError?: string; completionDescription?: string;
}) {
  const c = launchCopy(language);
  const personal = role ? roleGuideCopy(role, language) : undefined;
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const surface = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const complete = scene === 3;
  const stopped = paused || reducedMotion || complete;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [scene]);
  const advance = () => {
    setScene(value => value < 2 ? value + 1 : loop ? 0 : 3);
    heading.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (stopped) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setScene(value => value < 2 ? value + 1 : loop ? 0 : 3);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [stopped, scene, loop]);
  useEffect(() => {
    const element = surface.current;
    const changed = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleFullscreen = async () => {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === surface.current) await document.exitFullscreen();
      else if (surface.current?.requestFullscreen) await surface.current.requestFullscreen();
      else setFullscreenError(true);
    } catch { setFullscreenError(true); }
  };
  const titles = personal ? [personal.title, personal.preparationTitle, personal.chooseTitle] : [c.demoTitleOne, c.demoTitleTwo, c.demoTitleThree];
  const descriptions = personal ? [personal.introduction, personal.preparation, personal.scenes[2].caption] : [c.demoBodyOne, c.demoBodyTwo, c.demoBodyThree];
  const features = personal ? personal.scenes[Math.min(scene, 2)].cards.map(card => card.title) : [c.demoFeatureOne, c.demoFeatureTwo, c.demoFeatureThree];
  const icons = role ? roleGuideIcons[role] : [Users, Workflow, ClipboardCheck];
  const featureFlagships = personal ? [null, null, null] : DEMO_FLAGSHIPS;
  return <section className={`${styles.surface} ${styles.showcase}`} ref={surface} data-showcase data-scene={Math.min(scene, 2)} data-complete={complete || undefined} data-loop={loop || undefined} data-paused={stopped || undefined} dir={language === "en" ? "ltr" : "rtl"} lang={language}>
    <header className={styles.topbar}>
      <SkooleeLogo size="1.8rem" weight="heavy" />
      <div className={styles.topActions}>
        <Button variant="ghost" size="sm" aria-label={fullscreen ? c.fullscreenExit : c.fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}</Button>
        <Button variant="outline" size="sm" loading={entryPending} onClick={onReturn}>{publicView || entryLabel ? <ArrowRight className="rtl:rotate-180" aria-hidden="true" /> : <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />}{entryPending ? c.checkingEntry : entryLabel ?? (publicView ? c.getStarted : c.showcaseReturn)}</Button>
      </div>
    </header>
    <div className={styles.body}>
      <GuideStage chapter={Math.min(scene, 2)} language={language} paused={stopped} role={role} />
      <div className={styles.content} ref={content} data-guide-scroll>
        <p className={styles.eyebrow}><span className={styles.liveDot} />{c.showcaseMode} · {complete ? "✓" : `0${scene + 1}`}</p>
        <InkHeading className={styles.title} ref={heading} tabIndex={-1} swashKey={scene} text={complete ? c.showcaseComplete : titles[scene]} />
        <p className={styles.description} key={scene}>{complete ? completionDescription ?? (personal ? `${personal.scenes[2].caption} ${personal.saveHint}` : publicView ? c.publicCompleteBody : c.showcaseCompleteBody) : descriptions[scene]}</p>
        <div className={styles.demoFeatures}>{features.map((label, index) => {
          const Icon = icons[index];
          return <div key={label} data-active={scene === index || undefined} data-flagship={featureFlagships[index] ?? undefined}><Icon aria-hidden="true" /><span>{label}</span>{featureFlagships[index] && <FlagshipChip className={styles.featureChip} />}<span className={styles.leader} aria-hidden="true" /><span className={styles.featureNumber} aria-hidden="true">{`0${index + 1}`}</span></div>;
        })}</div>
        {personal && flagships.length > 0 && <ul className={styles.flagshipStrip} aria-label={c.flagshipsTitle} data-guide-flagships>
          {flagships.map(flagship => <li key={flagship} data-flagship={flagship}><FlagshipChip /><span>{c.flagshipName(flagship)}</span></li>)}
        </ul>}
        {fullscreenError && <Alert tone="info" compact>{c.fullscreenFailed}</Alert>}
      </div>
    </div>
    <footer className={`${styles.bottom} ${styles.showcaseBottom}`}>
      <div className={styles.footerStatus}>
        {entryError && <Alert tone="danger" compact>{entryError}</Alert>}
        <div className={styles.sceneProgress} aria-hidden="true" key={scene}>{titles.map((title, index) => <span key={title} data-active={!complete && scene === index || undefined} data-complete={complete || index < scene || undefined}><i /></span>)}</div>
        <p className={styles.replayHint}>{c.showcaseHint}</p>
      </div>
      <div className={styles.actions} data-guide-actions>
        <Button variant="ghost" size="sm" aria-pressed={loop} onClick={() => { setLoop(value => !value); if (complete) setScene(0); }}><Repeat aria-hidden="true" />{c.exhibitionLoop}</Button>
        {complete ? <>
          <Button variant="outline" onClick={() => { setScene(0); setPaused(false); heading.current?.focus({ preventScroll: true }); }}><RotateCcw aria-hidden="true" />{c.watchAgain}</Button>
          <Button loading={entryPending} onClick={onContinue ?? onReturn}>{entryPending ? c.checkingEntry : entryLabel ?? (publicView ? c.getStarted : c.chooseWorkflow)}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>
        </> : <>
          <Button variant="outline" aria-pressed={paused} disabled={reducedMotion} aria-label={paused ? c.play : c.pause} onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}<span className={styles.motionLabel}>{paused ? c.play : c.pause}</span></Button>
          <Button onClick={advance}>{scene === 2 && !loop ? c.finishTour : c.showcaseNext}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>
        </>}
      </div>
    </footer>
  </section>;
}
