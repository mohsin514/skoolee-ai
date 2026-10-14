"use client";
import type { ReactNode, Ref } from "react";
import { Check, Copy, Download, KeyRound, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { MfaCopy } from "./mfa-copy";

export type RecoveryFeedback = "codes" | "download" | "copyFailed";
type SheetCopy = Pick<MfaCopy, "codesTitle" | "save" | "codesList" | "copyAll" | "copied" | "download" | "print" | "ack" | "fileHeading" | "school">;

/**
 * Prints only the recovery sheet. The global `html.sk-print-recovery` rule in
 * globals.css hides everything else, which also works inside a Modal portal.
 */
export function printRecoveryCodes() {
  const html = document.documentElement;
  html.classList.add("sk-print-recovery");
  window.addEventListener("afterprint", () => html.classList.remove("sk-print-recovery"), { once: true });
  window.print();
}

/**
 * One-time display of fresh recovery codes with copy/download/print and the
 * "I saved them" acknowledgement. Copy and download outcomes are reported via
 * `onFeedback` so the owner's single live region announces them.
 */
export function RecoveryCodesSheet({ codes, schoolName, ack, onAck, t, disabled, idPrefix = "mfa", headingRef, feedback, onFeedback, alert, children }: {
  codes: string[];
  schoolName?: string;
  ack: boolean;
  onAck: (ack: boolean) => void;
  t: SheetCopy;
  disabled?: boolean;
  idPrefix?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  feedback?: RecoveryFeedback | string | null;
  onFeedback: (feedback: RecoveryFeedback) => void;
  /** Rendered just above the acknowledgement, e.g. a page-scoped error. */
  alert?: ReactNode;
  /** Rendered after the acknowledgement, e.g. the finishing button. */
  children?: ReactNode;
}) {
  const guidanceId = `${idPrefix}-save-guidance`;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      onFeedback("codes");
    } catch {
      onFeedback("copyFailed");
    }
  }

  function downloadCodes() {
    const file = [t.fileHeading, schoolName ? `${t.school}: ${schoolName}` : "", "", ...codes, ""].join("\n");
    const href = URL.createObjectURL(new Blob([file], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "skoolee-recovery-codes.txt";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    onFeedback("download");
  }

  return <>
    <h2 id={`${idPrefix}-recovery-instructions`} ref={headingRef} tabIndex={-1} className="sr-only">{t.codesTitle}</h2>
    <div className="flex items-start gap-3 rounded-2xl border border-status-warning-border bg-status-warning-surface p-4 text-status-warning-text print:hidden">
      <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p id={guidanceId} className="text-sm font-semibold leading-relaxed">{t.save}</p>
    </div>
    <div data-print-recovery="" className="mt-5">
      <p className="mb-3 hidden text-base font-black text-black print:block">
        {t.fileHeading}{schoolName ? <> · {t.school}: <bdi>{schoolName}</bdi></> : null}
      </p>
      <ol aria-label={t.codesList} aria-describedby={guidanceId} className="grid grid-cols-1 gap-1.5">
        {codes.map((value, index) => (
          <li key={value} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#ece3f3] bg-[#fcfaff] px-3.5 py-2 print:border-[#999]">
            <span aria-hidden="true" className="w-5 shrink-0 text-xs font-black tabular-nums text-ink-subtle">{index + 1}</span>
            <bdi dir="ltr" className="min-w-0 font-mono text-sm font-bold tracking-wide text-[#1f1a23] [overflow-wrap:anywhere]">{value}</bdi>
          </li>
        ))}
      </ol>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={copyAll}>
        {feedback === "codes" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{feedback === "codes" ? t.copied : t.copyAll}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={downloadCodes}><Download aria-hidden="true" />{t.download}</Button>
      <Button type="button" variant="outline" size="sm" onClick={printRecoveryCodes}><Printer aria-hidden="true" />{t.print}</Button>
    </div>
    <div className="mt-6 print:hidden">
      {alert}
      <Label htmlFor={`${idPrefix}-ack`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-[#ece3f3] bg-[#faf5ff] p-4 text-sm font-bold leading-snug text-[#1f1a23]">
        <Checkbox id={`${idPrefix}-ack`} checked={ack} disabled={disabled} onChange={event => onAck(event.target.checked)} className="mt-0.5" />
        {t.ack}
      </Label>
      {children}
    </div>
  </>;
}
