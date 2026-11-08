"use client";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StepView } from "@/lib/ai-workflows/view";
import { RECEIPT_KIND_WORDS, RUN_UI, receiptParts, t, type Lang } from "./run-copy";
import { RunRecordLink, fillNode, runText } from "./run-links";
import { Num } from "./workflow-format";

/**
 * A server receipt for write, draft and hand-off steps: human count chips (never raw keys), or the
 * kind's sentence when nothing countable came back, then "Open record". Success green only lives here.
 */
export function RunReceipt({ receipt, state, language }: { receipt: NonNullable<StepView["receipt"]>; state: StepView["state"]; language: Lang }) {
  const parts = receiptParts(receipt, language);
  return (
    <div data-ai-receipt={receipt.kind} className="flex flex-wrap items-center gap-2">
      {receipt.replayed ? (
        <Badge size="sm" variant="neutral" data-ai-receipt-replayed>{runText("alreadySaved", language)}</Badge>
      ) : parts.length > 0 ? parts.map(part => (
        <Badge key={part.key} size="sm" variant="success"><Check aria-hidden="true" /><span><Num value={part.count} /> {part.label}</span></Badge>
      )) : (
        <Badge size="sm" variant="success"><Check aria-hidden="true" /><span>{RECEIPT_KIND_WORDS[receipt.kind][language]}</span></Badge>
      )}
      {state === "approved_elsewhere" && receipt.decidedBy ? (
        <span className="text-xs text-ink-muted">{fillNode(t(RUN_UI, "approvedBy", language), <bdi className="font-semibold text-ink-strong">{receipt.decidedBy}</bdi>)}</span>
      ) : null}
      {receipt.link ? <RunRecordLink href={receipt.link} language={language} variant="ghost" className="sm:ms-auto" /> : null}
    </div>
  );
}
