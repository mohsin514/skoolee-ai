"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RUN_UI, UI, t, type Lang } from "./run-copy";

/** "Open record": the one link out of a receipt or answer (outline sm, 44px tall). */
export function RunRecordLink({ href, language, variant = "outline", className }: { href: string; language: Lang; variant?: "outline" | "ghost"; className?: string }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size: "sm" }), "sk-nudge-trigger w-full sm:w-auto", className)}>
      <span>{t(UI, "openRecord", language)}</span>
      <ArrowUpRight aria-hidden="true" className="sk-nudge rtl:-scale-x-100" />
    </Link>
  );
}

/** "Open its screen": a hand-off finishes on the decider's own screen. */
export function RunScreenLink({ href, language, className, label }: { href: string; language: Lang; className?: string; label?: string }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-nudge-trigger w-full sm:w-auto", className)}>
      <span>{label ?? t(UI, "openItsScreen", language)}</span>
      <ArrowRight aria-hidden="true" className="sk-nudge rtl:rotate-180" />
    </Link>
  );
}

/** Copy from RUN_UI (Ask + Run Sheet surface strings). */
export const runText = (key: string, language: Lang, ...values: Array<string | number>) => t(RUN_UI, key, language, ...values);

/** Fills `{0}` in a copy template with a node (a bdi name, a <Num/>), keeping the language's word order. */
export function fillNode(template: string, node: React.ReactNode): React.ReactNode {
  const [before, ...rest] = template.split("{0}");
  return rest.length === 0 ? template : <>{before}{node}{rest.join("{0}")}</>;
}
