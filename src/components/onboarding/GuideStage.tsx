"use client";

import { useState } from "react";
import { ArrowUpRight, CalendarDays, GraduationCap, Hand, School, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/locale/package";
import { AiGuide } from "./AiGuide";
import { launchCopy } from "./launch-copy";
import styles from "./launch-guide.module.css";

/** The same living stage powers the personal welcome and the public-facing showcase. */
export function GuideStage({ chapter, language, paused }: { chapter: number; language: Language; paused: boolean }) {
  const c = launchCopy(language);
  const [greeting, setGreeting] = useState(0);
  return <div className={styles.stage} data-guide-stage data-scene={chapter} data-paused={paused || undefined}>
    <div className={styles.stageArtwork} aria-hidden="true">
      <div className={styles.stageGrid} />
      <div className={styles.halo}><span /><span /><span /></div>
      <svg className={styles.constellation} viewBox="0 0 520 520" fill="none" focusable="false">
        <path className={styles.connection} d="M100 160C150 160 140 310 260 310S370 180 420 200M260 310C270 380 360 410 420 395" />
        <path className={styles.signal} d="M100 160C150 160 140 310 260 310S370 180 420 200M260 310C270 380 360 410 420 395" />
        <g className={styles.campusDrawing} stroke="currentColor" strokeWidth="1.5">
          <path d="M55 384v-91l60-33 60 33v91m-120-91h120m-95 91v-54h70v54m-35-124v-29h32v18h-32m253 137v-92l-45-24-45 24v92m-16 0h125M35 387h165" />
          <path d="M328 313h12v17h-12zm28 0h12v17h-12zm-28 29h12v17h-12zm28 0h12v17h-12z" />
        </g>
        <g className={styles.sparkleOne} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M90 221v14m-7-7h14M392 100v20m-10-10h20" /></g>
        <g className={styles.sparkleTwo} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M452 299v16m-8-8h16M188 95v10m-5-5h10" /></g>
      </svg>
      <div className={styles.platform}><span /></div>
      <div className={styles.heroCharacter} key={`${chapter}-${greeting}`}>
        <AiGuide pose={greeting ? "wave" : chapter === 0 ? "wave" : chapter === 1 ? "think" : "ready"} paused={paused} />
      </div>
      <div className={`${styles.workflowCard} ${styles.cardCampus}`}><span className={styles.cardIcon}><School /></span><div><small>{c.stageCampusLabel}</small><strong>{c.stageCampus}</strong><span className={styles.miniBlocks}><i /><i /><i /><i /></span></div></div>
      <div className={`${styles.workflowCard} ${styles.cardPeople}`}><span className={styles.cardIcon}><GraduationCap /></span><div><small>{c.stagePeopleLabel}</small><strong>{c.stagePeople}</strong><span className={styles.peopleDots}><i /><i /><i /><b>+</b></span></div></div>
      <div className={`${styles.workflowCard} ${styles.cardWorkflow}`}><span className={styles.cardIcon}><Workflow /></span><div><small>{c.stageWorkflowLabel}</small><strong>{c.stageWorkflow}</strong><span className={styles.workflowTrack}><CalendarDays /><span /><Sparkles /><span /><ArrowUpRight /></span></div></div>
      <div className={styles.guideSpeech} key={`speech-${chapter}`}><Sparkles />{[c.stageHello, c.stagePlan, c.stageReady][chapter]}</div>
    </div>
    <div className={styles.stageSignature}>
      <span><span className={styles.liveDot} />{c.hello}</span>
      <Button variant="ghost" size="sm" disabled={paused} onClick={() => setGreeting(value => value + 1)}><Hand aria-hidden="true" />{c.sayHello}</Button>
    </div>
  </div>;
}
