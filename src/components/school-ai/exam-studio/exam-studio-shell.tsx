"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, MessageCircle, Sparkles } from "lucide-react";
import { useChat } from "@/components/chat/chat-provider";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { FlagshipChip } from "@/components/ui/flagship";
import { SchoolAIWorkspace } from "../school-ai-workspace";
import { StudioIntro } from "./studio-intro";
import { StudioAssistantMark } from "./studio-assistant-mark";
import { studioShellCopy } from "./studio-shell-copy";
import styles from "./studio-shell.module.css";

/** Staff-only entry. Candidate attempts and their authoritative timers never mount this component. */
export function ExamStudioShell({ role, campusId, userId }: { role: string; campusId?: string | null; userId: string }) {
  const { language } = useLocale();
  const { viewer, unreadTotal } = useChat();
  const t = studioShellCopy(language);
  const heading = useRef<HTMLHeadingElement>(null);
  const onIntroComplete = useCallback(() => {
    // A skip gesture may already have focused a control; never steal that focus.
    if (document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, []);
  return <section className={styles.frame} dir={language === "en" ? "ltr" : "rtl"} data-exam-studio>
    <StudioIntro sessionScope={userId} onComplete={onIntroComplete} />
    <header className={styles.hero}>
      <div className={styles.topline}>
        <Link href="/ai" className={styles.back}><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t.back}</span></Link>
        <span className={styles.identity}><FlagshipChip />{t.title}</span>
        {viewer && <Link href="/messages" className={buttonVariants({ variant: "outline", size: "icon", className: "relative shrink-0 sm:hidden" })} aria-label={unreadTotal > 0 ? t.unreadMessages.replace("{count}", new Intl.NumberFormat(language).format(unreadTotal)) : t.messages}>
          <MessageCircle aria-hidden="true" />
          {unreadTotal > 0 && <span aria-hidden="true" className="absolute -end-1 -top-1 rounded-full bg-primary px-1.5 text-2xs font-bold leading-5 text-primary-foreground">{unreadTotal > 99 ? "99+" : new Intl.NumberFormat(language).format(unreadTotal)}</span>}
        </Link>}
      </div>
      <div className={styles.heroBody}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>{t.headline}</h1>
          <p className={styles.description}>{t.introduction}</p>
          {/* Addendum 2026-10-22: the flagship's one clear first step — author an exam (the Create & review tool);
              delivery and results stay one quiet step away. */}
          <div className={styles.heroActions}>
            <Link href="/ai/studio?workflow=curriculum" className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full gap-2 sm:w-auto")} data-studio-create><Sparkles className="size-4" aria-hidden="true" />{t.createExam}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" /></Link>
            <Link href="/ai/exams" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full gap-2 sm:w-auto")}>{t.openExams}<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" /></Link>
          </div>
          <p className={styles.heroHint}>{t.createExamHint}</p>
        </div>
        <div className={styles.illustration} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.paperBack} />
          <div className={styles.paperFront}><span /><span /><span /><span /></div>
          <div className={styles.assistant}><StudioAssistantMark className="size-20" /></div>
          <span className={styles.sparkle}><Sparkles className="size-7" /></span>
        </div>
      </div>
    </header>
    <SchoolAIWorkspace role={role} campusId={campusId} examOnly />
  </section>;
}
