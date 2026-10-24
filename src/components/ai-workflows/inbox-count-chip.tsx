"use client";
import * as React from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { UI, t } from "./run-copy";
import { Num } from "./workflow-format";

/**
 * Entry point to "Prepared for you" (/ai/waiting). Reads the real hand-off
 * list once and renders only when something is waiting: nothing while
 * loading, on error or at zero, so it never shows an invented count.
 */
export function InboxCountChip({ className, tone = "paper" }: { className?: string; tone?: "paper" | "ink" }) {
  const { language } = useLocale();
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/ai-workflows/handoffs", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json().catch(() => null) as { handoffs?: unknown } | null;
        if (Array.isArray(body?.handoffs)) setCount(body.handoffs.length);
      } catch { /* aborted or offline: stay hidden */ }
    })();
    return () => controller.abort();
  }, []);

  if (!count) return null;
  return (
    <Link
      href="/ai/waiting"
      data-ai-inbox-chip={count}
      className={cn(buttonVariants({ variant: tone === "ink" ? "secondary" : "outline", size: "sm" }), className)}
    >
      <Inbox aria-hidden="true" />
      <span>{t(UI, "preparedForYou", language)}</span>
      <Badge size="sm" variant="secondary" aria-hidden="true">
        {count > 99 ? <><Num value={99} />+</> : <Num value={count} />}
      </Badge>
      <span className="sr-only">{t(UI, "waitingCount", language, count)}</span>
    </Link>
  );
}
