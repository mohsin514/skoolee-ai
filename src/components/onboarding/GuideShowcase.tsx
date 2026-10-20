"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Maximize, Minimize, Pause, Play, School, ShieldCheck, Users } from "lucide-react";
import SkooleeLogo from "@/components/SkooleeLogo";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { Language } from "@/lib/locale/package";
import { GuideStage } from "./GuideStage";
import { launchCopy } from "./launch-copy";
import styles from "./launch-guide.module.css";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** Presentation only: receives no identity, destinations, persistence handlers or school data. */
export function GuideShowcase({ language, onReturn, publicView = false }: { language: Language; onReturn: () => void; publicView?: boolean }) {
  const c = launchCopy(language);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const surface = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const stopped = paused || reducedMotion;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (stopped) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setScene(value => (value + 1) % 3);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [stopped, scene]);
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
  const titles = [c.demoTitleOne, c.demoTitleTwo, c.demoTitleThree];
  const descriptions = [c.demoBodyOne, c.demoBodyTwo, c.demoBodyThree];
  const features = [c.demoFeatureOne, c.demoFeatureTwo, c.demoFeatureThree];
  const icons = [School, Users, ShieldCheck];
  return <section className={`${styles.surface} ${styles.showcase}`} ref={surface} data-showcase data-scene={scene} data-paused={stopped || undefined} dir={language === "en" ? "ltr" : "rtl"} lang={language}>
    <header className={styles.topbar}>
      <SkooleeLogo size="1.8rem" weight="heavy" />
      <div className={styles.topActions}>
        <Button variant="ghost" size="sm" aria-label={fullscreen ? c.fullscreenExit : c.fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}</Button>
        <Button variant="outline" size="sm" onClick={onReturn}>{publicView ? <ArrowRight className="rtl:rotate-180" aria-hidden="true" /> : <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />}{publicView ? c.getStarted : c.showcaseReturn}</Button>
      </div>
    </header>
    <div className={styles.body}>
      <GuideStage key={`stage-${scene}`} chapter={scene} language={language} paused={stopped} />
      <div className={styles.content}>
        <p className={styles.eyebrow}><span className={styles.liveDot} />{c.showcaseMode} · 0{scene + 1}</p>
        <h1 className={styles.title} ref={heading} tabIndex={-1}>{titles[scene]}</h1>
        <p className={styles.description} key={scene}>{descriptions[scene]}</p>
        <div className={styles.demoFeatures}>{features.map((label, index) => {
          const Icon = icons[index];
          return <div key={label} data-active={scene === index || undefined}><Icon aria-hidden="true" /><span>{label}</span></div>;
        })}</div>
        {fullscreenError && <Alert tone="info" compact>{c.fullscreenFailed}</Alert>}
        <div className={styles.actions}>
          <Button variant="outline" aria-pressed={paused} disabled={reducedMotion} aria-label={paused ? c.play : c.pause} onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? c.play : c.pause}</Button>
          <Button onClick={() => { setScene(value => (value + 1) % 3); heading.current?.focus(); }}>{c.showcaseNext}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>
        </div>
      </div>
    </div>
    <footer className={`${styles.bottom} ${styles.showcaseBottom}`}>
      <div className={styles.sceneProgress} aria-hidden="true" key={scene}>{titles.map((title, index) => <span key={title} data-active={scene === index || undefined} data-complete={index < scene || undefined}><i /></span>)}</div>
      <p className={styles.replayHint}>{c.showcaseHint}</p>
    </footer>
  </section>;
}
