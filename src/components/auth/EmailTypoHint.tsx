"use client";

import { Button } from "@/components/ui/button";
import { authCopy } from "@/lib/auth/auth-copy";
import { suggestEmailDomain } from "@/lib/auth/email-typo";
import { fillNodes } from "@/lib/auth/fill-nodes";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

/**
 * "Did you mean name@gmail.com?" — a one-tap fix placed AFTER the field in
 * DOM order. Never in aria-describedby, never a live region, always
 * type="button" so it can never submit the form. Pure: no network.
 */
export type EmailTypoHintProps = { language: Language; value: string; onApply: (fixed: string) => void; className?: string };

export function EmailTypoHint({ language, value, onApply, className }: EmailTypoHintProps) {
  const fixed = suggestEmailDomain(value);
  if (!fixed) return null;
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={cn("h-auto min-h-11 justify-start px-1 text-start font-medium text-ink-muted [overflow-wrap:anywhere]", className)}
      onClick={() => onApply(fixed)}
    >
      <span>{fillNodes(authCopy[language].typo.didYouMean, <bdi className="font-semibold text-primary">{fixed}</bdi>)}</span>
    </Button>
  );
}
