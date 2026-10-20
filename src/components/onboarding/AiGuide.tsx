"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import styles from "./launch-guide.module.css";
import motion from "./guide-stage.module.css";

/** Shared, decorative guide. Instructions and progress always live in real text beside it. */
export function AiGuide({ pose = "wave", paused = false, compact = false, continuous = false, reacting = false }: { pose?: "wave" | "think" | "ready"; paused?: boolean; compact?: boolean; continuous?: boolean; reacting?: boolean }) {
  const id = useId().replace(/:/g, "");
  return <div className={cn(styles.character, motion.guide, compact && styles.compactCharacter)} data-pose={pose} data-paused={paused || undefined} data-continuous={continuous || undefined} data-reacting={reacting || undefined} aria-hidden="true">
    <svg viewBox="0 0 320 350" fill="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-coat`} x1="110" y1="150" x2="230" y2="285" gradientUnits="userSpaceOnUse"><stop stopColor="var(--brand-400)" /><stop offset="1" stopColor="var(--brand-800)" /></linearGradient>
        <linearGradient id={`${id}-skin`} x1="123" y1="75" x2="190" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor="#f5cfb6" /><stop offset="1" stopColor="#d79a7f" /></linearGradient>
      </defs>
      <ellipse className={styles.guideShadow} cx="160" cy="325" rx="73" ry="12" fill="var(--brand-900)" opacity=".12" />
      <g className={motion.entrance}>
      <g className={motion.body}>
        <g className={motion.legLeft}>
          <path d="M126 258 119 312h29l13-53" fill="var(--brand-950)" />
          <path d="M120 304c-9 2-21 12-18 18h48v-17" fill="var(--brand-800)" />
          <path d="M104 320h44" stroke="var(--brand-300)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g className={motion.legRight}>
          <path d="m169 257 8 55h29l-10-62" fill="var(--brand-950)" />
          <path d="M177 306v16h48c3-7-11-14-20-16" fill="var(--brand-800)" />
          <path d="M179 320h43" stroke="var(--brand-300)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g className={cn(motion.pose, motion.wavePose)}>
          <path d="M111 171c-12 4-24 24-30 44-3 11 2 22 12 24 10 3 18-5 21-15l15-37" fill="var(--brand-700)" />
          <ellipse cx="91" cy="239" rx="12" ry="15" transform="rotate(16 91 239)" fill={`url(#${id}-skin)`} />
        </g>
        <g className={cn(motion.pose, motion.readyPose)}>
          <path d="M114 172c-13 10-26 32-24 49 1 9 10 16 18 10l23-23" stroke="var(--brand-700)" strokeWidth="21" strokeLinecap="round" />
        </g>
        <path d="M126 159c-19 4-25 20-25 44l8 64c24 12 67 12 96-2l4-63c0-27-12-39-32-43" fill={`url(#${id}-coat)`} />
        <path d="m139 155 19 50 20-50" fill="white" />
        <path d="m134 158-12 22 22 5-10 14 24 25 20-27-9-12 22-6-10-22-23 48z" fill="var(--brand-300)" opacity=".6" />
        <path d="M147 141v24c6 7 18 7 24 0v-24" fill={`url(#${id}-skin)`} />
        <path d="m157 176-5 10 6 18 7-18-6-10" fill="var(--brand-800)" />
        <path d="M160 225v38" stroke="var(--brand-950)" strokeOpacity=".25" strokeWidth="2" />
        <circle cx="167" cy="233" r="2.5" fill="var(--brand-200)" />
        <path d="m180 212 14-2v6l-14 2z" fill="var(--brand-100)" />
        <path d="m183 214 4-6 4 5" stroke="var(--brand-200)" strokeWidth="2" strokeLinecap="round" />
        <g className={cn(motion.pose, motion.wavePose)}>
        <g className={motion.guideArm}>
          <path d="M190 174c13-1 18 7 27 11l17-35 19 9c-10 38-17 57-33 55-14-1-24-12-32-20" fill={`url(#${id}-coat)`} />
          <path d="m235 154 3-13c-10-7-15-16-10-20 4-4 8 6 13 7l1-28c0-8 8-7 9 0l1 18 5-23c2-6 9-4 8 2l-3 23 5-14c3-7 10-3 8 4l-7 25c-2 9-8 15-14 24" fill={`url(#${id}-skin)`} />
          <path d="m234 151 23 7-4 11-23-8" fill="var(--brand-200)" />
        </g>
        </g>
        <g className={cn(motion.pose, motion.planPose)}>
          <path d="M114 177c-15 9-28 31-21 43l27 16m72-57c12 13 15 30 7 37l-29 13" stroke={`url(#${id}-coat)`} strokeWidth="24" strokeLinecap="round" />
          <rect x="110" y="190" width="92" height="70" rx="9" transform="rotate(-8 156 225)" fill="var(--brand-950)" />
          <rect x="116" y="196" width="80" height="55" rx="4" transform="rotate(-8 156 225)" fill="var(--brand-100)" />
          <g transform="rotate(-8 156 225)" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round">
            <path d="M126 214h20v26h-20zM158 207h26v14h-26zM158 229h26v11h-26zM146 227h12" />
            <path d="M126 205h20" stroke="var(--brand-300)" />
          </g>
          <rect className={motion.tabletGlow} x="124" y="214" width="14" height="4" rx="2" fill="var(--brand-400)" />
          <ellipse cx="113" cy="234" rx="10" ry="12" transform="rotate(-18 113 234)" fill={`url(#${id}-skin)`} />
          <g className={motion.writingHand}>
            <path d="m197 208-17 10-6-5c-4-2-8 2-5 6l7 9c4 3 8 2 12 0l15-9" fill={`url(#${id}-skin)`} />
            <path d="m176 215 13-23" stroke="var(--brand-800)" strokeWidth="4" strokeLinecap="round" />
            <path d="m176 215-3 5" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
        <g className={cn(motion.pose, motion.readyPose)}>
          <g className={motion.presentingHand}>
            <path d="M192 178c7 18 15 27 26 26l34-13" stroke={`url(#${id}-coat)`} strokeWidth="24" strokeLinecap="round" />
            <path d="m244 182 8 23" stroke="var(--brand-200)" strokeWidth="7" />
            <path d="m252 188 14-3 10-10c4-4 8 1 4 5l-5 5 19-1c7 0 7 7 0 8l-18 6c-7 2-13 0-20-1" fill={`url(#${id}-skin)`} />
            <g className={motion.tabletGlow}>
              <circle cx="270" cy="151" r="21" fill="var(--brand-100)" stroke="var(--brand-400)" strokeWidth="1.5" />
              <path d="m261 154 9-9 9 9m-9-9v19" stroke="var(--brand-700)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M249 128v8m-4-4h8m41 31v8m-4-4h8" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round" />
            </g>
          </g>
          <ellipse cx="120" cy="214" rx="12" ry="9" transform="rotate(-20 120 214)" fill={`url(#${id}-skin)`} />
        </g>
        <g className={motion.headPosition}>
        <g className={motion.head}>
          <ellipse cx="122" cy="110" rx="10" ry="15" fill="#dfa68d" /><ellipse cx="194" cy="110" rx="10" ry="15" fill="#dfa68d" />
          <path d="M121 87c0-31 74-37 75 0v28c-2 28-19 42-38 42-21 0-37-16-37-43z" fill={`url(#${id}-skin)`} />
          <path d="M119 107c-12-34-3-54 21-57 22-16 58 4 59 24 6 11 4 26-3 34l-6-29c-20 10-39 6-51-4l-11 20-1 16z" fill="var(--brand-950)" />
          <path d="M134 95c4-3 10-3 14-1M169 94c4-2 10-2 14 1" stroke="var(--brand-950)" strokeWidth="3" strokeLinecap="round" />
          <g className={motion.eyes}><ellipse cx="142" cy="107" rx="4" ry="5.5" fill="var(--brand-950)" /><ellipse cx="177" cy="107" rx="4" ry="5.5" fill="var(--brand-950)" /><circle cx="143" cy="105" r="1.3" fill="white" /><circle cx="178" cy="105" r="1.3" fill="white" /></g>
          <path d="m158 110-3 10h7" stroke="#b77c66" strokeWidth="2" strokeLinecap="round" />
          <path d="M146 131c8 8 20 8 27-1" stroke="#7b3f40" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="133" cy="121" rx="7" ry="4" fill="#c87778" opacity=".25" /><ellipse cx="185" cy="121" rx="7" ry="4" fill="#c87778" opacity=".25" />
        </g>
        </g>
        <g className={cn(motion.pose, motion.wavePose)}>
          <path d="m108 246 36-9 9 40-37 8z" fill="var(--brand-200)" /><path d="m114 253 22-6m-20 13 22-6" stroke="var(--brand-600)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
      </g>
    </svg>
  </div>;
}
