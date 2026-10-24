"use client";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FlagshipChip } from "@/components/ui/flagship";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";
import type { StepView } from "@/lib/ai-workflows/view";
import { UI, t, type Lang } from "./run-copy";
import { RunRecordLink, runText } from "./run-links";

/** A looked-up answer ("How much do I owe?"): readable text in a brand card. Replaces the ANSWERED banner. */
export function RunAnswer({ receipt, language }: { receipt: NonNullable<StepView["receipt"]> & { text: string }; language: Lang }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(receipt.text); toast.copied(); }
    catch (cause) { toast.actionFailed("copy the answer", cause); }
  };
  return (
    <div data-ai-receipt={receipt.kind} className="sk-fade-in space-y-3 rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700">
          <FlagshipChip />
          <span className="sk-eyebrow">{runText("found", language)}</span>
        </span>
        <IconButton label={runText("copyAnswer", language)} onClick={() => void copy()}><Copy aria-hidden="true" /></IconButton>
      </div>
      <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-ink-strong [overflow-wrap:anywhere] sm:text-base">{receipt.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="sm" variant="neutral">{t(UI, "nothingChanged", language)}</Badge>
        {receipt.link ? <RunRecordLink href={receipt.link} language={language} className="sm:ms-auto" /> : null}
      </div>
    </div>
  );
}
