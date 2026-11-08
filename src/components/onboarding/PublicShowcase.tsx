"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Language } from "@/lib/locale/package";
import type { ShowcaseEntry } from "@/lib/onboarding/showcase-entry";
import { GuideShowcase } from "./GuideShowcase";
import { launchCopy } from "./launch-copy";
import styles from "./launch-guide.module.css";

export function PublicShowcase({ language, entry }: { language: Language; entry: ShowcaseEntry }) {
  const router = useRouter();
  const c = launchCopy(language);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const continueFromShowcase = async () => {
    if (lock.current) return;
    lock.current = true; setPending(true); setFailed(false);
    try {
      // The user may sign in/out in another tab while the presentation plays.
      const response = await fetch("/api/auth/showcase-entry", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      const next = await response.json();
      if (response.status === 409 && next.code === "EXAM_SESSION_ACTIVE" && typeof next.examUrl === "string" && /^\/ai\/exams\/[^/\\?#]+$/.test(next.examUrl)) {
        router.push(next.examUrl);
        return;
      }
      if (!response.ok) throw new Error("unavailable");
      if (!["register", "signIn", "onboarding", "workspace"].includes(next.mode) || typeof next.href !== "string" || !next.href.startsWith("/") || next.href.startsWith("//") || next.href.includes("\\")) throw new Error("invalid-entry");
      // A lost session should ask the returning person to sign in, not create
      // another institution, even if sign-out removed their cookie entirely.
      router.push(next.mode === "register" && entry.mode !== "register" ? "/login" : next.href);
    } catch {
      setFailed(true);
    } finally {
      lock.current = false; setPending(false);
    }
  };
  const label = entry.mode === "register" ? c.getStarted : entry.mode === "signIn" ? c.signInAgain : entry.mode === "onboarding" ? c.continueOnboarding : c.continueWorkspace;
  return <main className={styles.publicShowcase}>
    <GuideShowcase language={language} publicView={entry.mode === "register"} onReturn={() => void continueFromShowcase()}
      entryLabel={label} entryPending={pending} entryError={failed ? c.entryFailed : undefined}
      completionDescription={entry.mode === "register" ? c.publicCompleteBody : entry.mode === "signIn" ? c.signInContinueHint : c.memberCompleteBody} />
  </main>;
}
