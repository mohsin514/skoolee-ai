"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ClipboardCheck, FilePenLine, GraduationCap, Hand, MessageCircle, Play, RotateCcw, School, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/locale/package";
import type { LaunchJourney } from "@/lib/onboarding/launch-plan";
import { cn } from "@/lib/utils";
import { AiGuide } from "./AiGuide";
import { launchCopy } from "./launch-copy";
import { guideGreeting, guideScenes } from "./stage-copy";
import styles from "./launch-guide.module.css";
import motion from "./guide-stage.module.css";

const sceneIcons = [
  [School, GraduationCap, Workflow],
  [MessageCircle, FilePenLine, ClipboardCheck],
  [Play, RotateCcw, ArrowUpRight],
] as const;

/** The same living stage powers the personal welcome and the public-facing showcase. */
export function GuideStage({ chapter, language, paused, journey }: { chapter: number; language: Language; paused: boolean; journey?: LaunchJourney }) {
  const c = launchCopy(language);
  const scenes = guideScenes(language, journey);
  const currentChapter = Math.max(0, Math.min(2, chapter));
  const scene = scenes[currentChapter];
  const [greetingChapter, setGreetingChapter] = useState<number | null>(null);
  const greeting = greetingChapter === currentChapter;
  useEffect(() => {
    if (greetingChapter === null || paused) return;
    const timer = window.setTimeout(() => setGreetingChapter(null), 2400);
    return () => window.clearTimeout(timer);
  }, [greetingChapter, paused]);

  return <div className={cn(styles.stage, motion.stage)} data-guide-stage data-scene={currentChapter} data-paused={paused || undefined}>
    <div className={styles.stageArtwork}>
      <div className={motion.decoration} aria-hidden="true">
      <div className={styles.stageGrid} />
      <div className={styles.halo}><span /><span /><span /></div>
      <svg className={styles.constellation} viewBox="0 0 520 520" fill="none" focusable="false">
        <path className={styles.connection} d="M100 160C150 160 140 310 260 310S370 180 420 200M260 310C270 380 360 410 420 395" />
        <path className={styles.signal} d="M100 160C150 160 140 310 260 310S370 180 420 200M260 310C270 380 360 410 420 395" />
        <g className={cn(styles.campusDrawing, motion.backdropLayer, motion.welcomeBackdrop)} stroke="currentColor" strokeWidth="1.5">
          <path d="M55 384v-91l60-33 60 33v91m-120-91h120m-95 91v-54h70v54m-35-124v-29h32v18h-32m253 137v-92l-45-24-45 24v92m-16 0h125M35 387h165" />
          <path d="M328 313h12v17h-12zm28 0h12v17h-12zm-28 29h12v17h-12zm28 0h12v17h-12z" />
        </g>
        <g className={cn(motion.backdropLayer, motion.planBackdrop)} stroke="currentColor" strokeWidth="1.5">
          <rect x="49" y="283" width="115" height="99" rx="10" strokeDasharray="5 5" />
          <path d="M65 300h42v29H65zm58 0h25v61h-25zM65 344h42v17H65zM77 271v-15h316v-48m-8 8 8-8 8 8" />
          <circle cx="392" cy="354" r="39" strokeDasharray="4 5" />
          <path d="M375 354h34m-17-17v34M88 394h55m-44 11h33" />
        </g>
        <g className={cn(motion.backdropLayer, motion.readyBackdrop)} stroke="currentColor" strokeWidth="1.5">
          <path d="M62 365c40 0 45-42 69-42s32 35 53 35M331 350c38 0 37-55 67-55s27-37 59-37" strokeDasharray="5 6" />
          <circle cx="77" cy="342" r="16" /><path d="m70 342 5 5 9-10" />
          <circle cx="409" cy="330" r="16" /><path d="m402 330 5 5 9-10" />
          <path d="m438 257 19 1-7 17m-63-132 16-16 16 16m-16-16v43" />
        </g>
        <g className={styles.sparkleOne} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M90 221v14m-7-7h14M392 100v20m-10-10h20" /></g>
        <g className={styles.sparkleTwo} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M452 299v16m-8-8h16M188 95v10m-5-5h10" /></g>
      </svg>
      <div className={styles.platform}><span /></div>
      <div className={styles.heroCharacter}>
        <AiGuide pose={greeting ? "wave" : currentChapter === 0 ? "wave" : currentChapter === 1 ? "think" : "ready"} paused={paused} continuous reacting={greeting} />
      </div>
      {scenes.map((item, sceneIndex) => <div key={sceneIndex} className={motion.sceneLayer} data-chapter={sceneIndex} data-active={sceneIndex === currentChapter || undefined} data-guide-scene-cards={sceneIndex}>
        {item.cards.map((card, cardIndex) => {
          const Icon = sceneIcons[sceneIndex][cardIndex];
          return <div key={cardIndex} className={cn(styles.workflowCard, motion.sceneCard, [motion.leftCard, motion.rightCard, motion.bottomCard][cardIndex])}>
            <span className={styles.cardIcon}><Icon /></span>
            <div><small>{card.label}</small><strong>{card.title}</strong><span className={motion.cardProgress}><i data-filled /><i data-filled={sceneIndex > 0 || undefined} /><i data-filled={sceneIndex > 1 || undefined} /></span></div>
          </div>;
        })}
      </div>)}
      </div>
      <div className={cn(styles.guideSpeech, motion.caption)} data-guide-narration role="status" aria-live="polite" aria-atomic="true">
        <Sparkles aria-hidden="true" />{greeting ? guideGreeting(language) : scene.caption}
      </div>
    </div>
    <div className={cn(styles.stageSignature, motion.signature)}>
      <span><span className={styles.liveDot} aria-hidden="true" />{scene.status}</span>
      <Button variant="ghost" size="sm" disabled={paused || greeting} onClick={() => setGreetingChapter(currentChapter)}><Hand aria-hidden="true" />{c.sayHello}</Button>
    </div>
  </div>;
}
