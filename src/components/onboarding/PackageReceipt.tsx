"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check, Circle, Copy, Lock, Package } from "lucide-react";
import { ConfirmedChoice } from "@/components/onboarding/ConfirmedChoice";
import { LedgerList, LedgerRow } from "@/components/onboarding/ReviewSheet";
import { buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

/**
 * The chooser's confirmation moment for choices that stay in setup (selected,
 * reserved, requested, bank transfer, payment in progress): a ticket stub with
 * the choice, a ledger (copyable reference and bank details) and a "What
 * happens next" track. It never implies money moved when it did not — the
 * body copy is chosen per outcome by the caller.
 */
export type ReceiptStep = { label: string; state: "done" | "current" | "pending" };
export type ReceiptLedgerRow = { label: string; value: ReactNode; ltr?: boolean; copy?: { label: string; text: string } };

export type PackageReceiptProps = {
  focusRef: RefObject<HTMLDivElement | null>;
  /** The group's name (the outcome, e.g. "Pro is reserved for you"). */
  label: string;
  bodyId: string;
  body: string;
  head: { title: string; description: string; tag: string };
  ledger: ReceiptLedgerRow[];
  steps: ReceiptStep[];
  stepsLabel: string;
  stepStates: { done: string; current: string; pending: string };
  meanwhile?: string;
  contact?: string;
  copied: string;
};

export function PackageReceipt({ focusRef, label, bodyId, body, head, ledger, steps, stepsLabel, stepStates, meanwhile, contact, copied }: PackageReceiptProps) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (row: NonNullable<ReceiptLedgerRow["copy"]>) => {
    try {
      await navigator.clipboard.writeText(row.text);
      setCopiedLabel(row.label);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopiedLabel(null), 1600);
    } catch {
      // Clipboard blocked: the value stays visible and selectable.
    }
  };

  return (
    <div ref={focusRef} className="sk-receipt" tabIndex={-1} role="group" aria-label={label} aria-describedby={bodyId}>
      <p id={bodyId} className="sk-receipt-body">{body}</p>
      <div className="sk-receipt-stub sk-enter-scale">
        <ConfirmedChoice title={head.title} description={head.description} tag={head.tag} art={<Package aria-hidden="true" />} />
        <div data-part="perforation" aria-hidden="true" />
        <LedgerList>
          {ledger.map((row) => (
            <LedgerRow
              key={row.label}
              label={row.label}
              // A copyable row isolates only its value, so the copy button follows the dialog's direction.
              ltr={row.copy ? false : row.ltr}
              value={row.copy ? (
                <span className="sk-receipt-copy">
                  {row.ltr ? <bdi dir="ltr" className="font-mono">{row.value}</bdi> : <span>{row.value}</span>}
                  <IconButton size="sm" variant="ghost" label={copiedLabel === row.copy.label ? copied : row.copy.label} tooltip={false} onClick={() => void copy(row.copy!)}>
                    {copiedLabel === row.copy.label ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </IconButton>
                </span>
              ) : row.value}
            />
          ))}
        </LedgerList>
        <ol className="sk-receipt-steps" aria-label={stepsLabel}>
          {steps.map((step) => (
            <li key={step.label} data-state={step.state}>
              <span data-part="dot" aria-hidden="true">{step.state === "done" ? <Check /> : <Circle />}</span>
              <span>{step.label}<span className="sr-only"> ({stepStates[step.state]})</span></span>
            </li>
          ))}
        </ol>
      </div>
      {meanwhile ? <p className="sk-receipt-body">{meanwhile}</p> : null}
      {contact ? <p className="sk-receipt-contact">{contact}</p> : null}
      <p role="status" className="sr-only">{copiedLabel ? copied : ""}</p>
    </div>
  );
}

/** Shown while the browser leaves for online payment (or the dev test page), with a fallback link after 4s. */
export function PackageHandoff({ focusRef, text, url, fallbackLabel }: { focusRef: RefObject<HTMLDivElement | null>; text: string; url: string; fallbackLabel: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div ref={focusRef} className="sk-handoff" role="status" tabIndex={-1}>
      <span className="sk-handoff-mark" aria-hidden="true"><Lock className="size-6" /></span>
      <p className="max-w-[34ch] text-sm leading-relaxed">{text}</p>
      <span className="sk-handoff-bar" aria-hidden="true" />
      {slow ? <a href={url} className={buttonVariants({ variant: "link", size: "sm" })}>{fallbackLabel}</a> : null}
    </div>
  );
}
