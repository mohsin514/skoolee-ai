"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, GraduationCap, MapPin, MonitorPlay, Pause, Play, RotateCcw, ShieldCheck, Workflow } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { roleLabel, type UserRole } from "@/lib/roles";
import type { Language } from "@/lib/locale/package";
import type { LaunchPlan } from "@/lib/onboarding/launch-plan";
import SkooleeLogo from "@/components/SkooleeLogo";
import { GuideStage } from "./GuideStage";
import { GuideShowcase } from "./GuideShowcase";
import { launchCopy } from "./launch-copy";
import styles from "./launch-guide.module.css";

export interface LaunchContext extends LaunchPlan {
  userId: string;
  role: UserRole;
  language: Language;
  fullName: string;
  schoolName: string;
  campusName: string | null;
  completed: boolean;
}

export function LaunchGuide({ context, onFinish, onDismiss }: { context: LaunchContext; onFinish: (href?: string) => Promise<void>; onDismiss: () => void }) {
  const c = launchCopy(context.language);
  const [chapter, setChapter] = useState(0);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showcase, setShowcase] = useState(false);
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
  const finish = async (href?: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(false);
    try { await onFinish(href); } catch { setError(true); }
    finally { lock.current = false; setBusy(false); }
  };
  const chapters = [c.welcome, c.prepare, c.choose];
  return <ModalSurface fullscreen ariaLabel={showcase ? c.showcase : c.guide} initialFocusRef={heading} onClose={showcase ? () => setShowcase(false) : onDismiss} dismissible={!busy} disableBackdropClose dir={context.language === "en" ? "ltr" : "rtl"} lang={context.language}>
    {showcase ? <GuideShowcase language={context.language} onReturn={() => setShowcase(false)} onContinue={() => { setChapter(2); setShowcase(false); }} /> : <section className={styles.surface} data-launch-guide data-chapter={chapter} data-paused={paused || undefined}>
      <header className={styles.topbar}>
        <SkooleeLogo size="1.8rem" weight="heavy" />
        <div className={styles.topActions}>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setShowcase(true)}><MonitorPlay aria-hidden="true" />{c.showcase}</Button>
          <Button variant="ghost" size="sm" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? c.play : c.pause}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void finish()}>{c.later}</Button>
        </div>
      </header>
      <div className={styles.body}>
        <GuideStage chapter={chapter} language={context.language} paused={paused} journey={context.journey} />
        <div className={styles.content} ref={content} data-guide-scroll>
          <p className={styles.eyebrow}>{c.eyebrow} · 0{chapter + 1}</p>
          <h1 className={styles.title} ref={heading} tabIndex={-1}>{chapter === 0 ? c.title : chapter === 1 ? c.journey(context.journey) : c.choose}</h1>
          <div className={styles.context}>
            <span><GraduationCap className="size-3.5" aria-hidden="true" />{context.fullName.split(" ")[0]} · {roleLabel(context.role, context.language)}</span>
            <span><MapPin className="size-3.5" aria-hidden="true" />{context.campusName || context.schoolName}</span>
          </div>
          <p className={styles.description}>{chapter === 0 ? c.introduction : chapter === 1 ? c.preparation(context.journey) : c.workflowHint}</p>
          {chapter === 0 && <div className={styles.note}><Compass aria-hidden="true" /><div><strong>{c.scope}</strong><p>{c.scopeHint}</p></div></div>}
          {chapter === 1 && <div className={styles.notes}>
            {(context.actions.some(action => action.task === "institution" || action.task === "aiSetup")) && <div className={styles.setupPath}><strong>{c.setupPath}</strong><ol>{[c.setupFoundation, c.setupInterview, c.setupDrafts].map(step => <li key={step}>{step}</li>)}</ol></div>}
            <div className={styles.note}><ShieldCheck aria-hidden="true" /><div><strong>{c.review}</strong><p>{c.reviewHint}</p></div></div>
            <div className={styles.note}><RotateCcw aria-hidden="true" /><div><strong>{c.save}</strong><p>{c.saveHint}</p></div></div>
          </div>}
          {context.needsCampus && chapter > 0 && <Alert tone="info" compact>{c.campusMissing}</Alert>}
          {chapter === 2 && <div className={styles.choices} role="group" aria-label={c.choose}>{context.actions.map((action, index) =>
            <Button key={action.task} type="button" variant="choice" className={styles.choice} aria-pressed={selected === index} disabled={busy} onClick={() => setSelected(index)}>
              <Workflow aria-hidden="true" /><span className={styles.choiceText}>{c.task(action.task)}{index === 0 && <small>{c.recommended}</small>}</span>{selected === index && <Check aria-hidden="true" />}
            </Button>)}</div>}
          {chapter === 2 && context.actions[selected] && <div className={styles.nextStep} aria-live="polite"><p className={styles.eyebrow}>{c.nextStep}</p><p>{c.taskDetail(context.actions[selected].task)}</p></div>}
        </div>
      </div>
      <footer className={styles.bottom}><div className={styles.footerStatus}>
        {error && <Alert tone="danger" live="assertive" compact>{c.failed}</Alert>}
        <ol className={styles.chapters} aria-label={c.guide}>{chapters.map((label, index) => <li key={label} className={styles.chapter} aria-current={index === chapter ? "step" : undefined}><span className={styles.chapterNumber}>{index < chapter ? <Check className="size-3" aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>
        <p className={styles.replayHint}>{c.replayHint}</p></div>
          <div className={styles.actions} data-guide-actions>
            {chapter > 0 && <Button variant="outline" disabled={busy} onClick={() => setChapter(chapter - 1)}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{c.back}</Button>}
            <Button size="lg" loading={busy} disabled={busy} onClick={() => chapter < 2 ? setChapter(chapter + 1) : void finish(context.actions[selected]?.href)}>
              {busy ? c.saving : chapter === 0 ? c.next : chapter === 1 ? c.continue : c.task(context.actions[selected]?.task ?? "workspace")}<ArrowRight className="rtl:rotate-180" aria-hidden="true" />
            </Button>
          </div>

      </footer>
    </section>}
  </ModalSurface>;
}
