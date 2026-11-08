"use client";

import { authCopy } from "@/lib/auth/auth-copy";
import { useGreetingBucket } from "@/lib/auth/greeting";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

/**
 * Time-aware splash greeting ("Good morning" … "Working late?"). Empty on the
 * server and during hydration, so markup never mismatches; then it fades in.
 * Never a status or live region. Splash only.
 */
export type AuthGreetingProps = { language: Language; className?: string };

export function AuthGreeting({ language, className }: AuthGreetingProps) {
  const bucket = useGreetingBucket();
  return (
    <p className={cn("min-h-7", className)}>
      {bucket ? <span className="sk-fade-in">{authCopy[language].greeting[bucket]}</span> : null}
    </p>
  );
}
