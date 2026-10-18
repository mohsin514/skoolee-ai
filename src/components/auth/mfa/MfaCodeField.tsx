"use client";
import type { ClipboardEvent, ReactNode, Ref } from "react";
import { LifeBuoy, Smartphone } from "lucide-react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/**
 * Normalises what was typed or pasted into an authenticator-mode field (AC20).
 * Spaces and dashes are dropped first (`123-456` and `123 456` are valid TOTP
 * forms; the server strips dashes too). When recovery is allowed, anything that
 * is not a plain 6-digit code is a recovery code: switch modes and keep the raw
 * text instead of cutting it to six digits.
 */
export function normaliseCodeEntry(raw: string, allowRecovery: boolean): { recovery: boolean; value: string } {
  const compact = raw.replace(/[\s-]/g, "");
  if (allowRecovery && (/\D/.test(compact) || compact.length > 6)) return { recovery: true, value: raw.trim() };
  return { recovery: false, value: compact.replace(/\D/g, "").slice(0, 6) };
}

/** The one-time-code field shared by protect-account and Security & sign-in. */
export function MfaCodeField({ id, value, onChange, recovery, onRecoveryChange, allowRecovery, label, hint, error, readOnly, inputRef }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  recovery: boolean;
  /** Called when a recovery-shaped entry switches the field out of authenticator mode. */
  onRecoveryChange: (recovery: boolean) => void;
  allowRecovery: boolean;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  readOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  function enter(raw: string) {
    if (recovery) { onChange(raw); return; }
    const next = normaliseCodeEntry(raw, allowRecovery);
    if (next.recovery) onRecoveryChange(true);
    onChange(next.value);
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    if (recovery) return;
    event.preventDefault();
    enter(event.clipboardData.getData("text"));
  }

  return (
    <FormField name="code" id={id} required error={error} label={label} hint={hint}>
      <InputGroup surfaceClassName="bg-surface-subtle min-h-16">
        {recovery
          // Hidden on narrow screens so a full 24-character recovery code fits without scrolling.
          ? <LifeBuoy aria-hidden="true" data-field-affix="start" className="hidden size-5 text-primary sm:block" />
          : <Smartphone aria-hidden="true" data-field-affix="start" className="size-5 text-primary" />}
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={event => enter(event.target.value)}
          onPaste={paste}
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          maxLength={recovery ? 29 : undefined}
          spellCheck={false}
          autoCapitalize="characters"
          dir="ltr"
          placeholder={recovery ? "XXXX-XXXX-XXXX-XXXX-XXXX" : "••••••"}
          readOnly={readOnly}
          // Size and weight come from the shared field skin; only face and spacing are adjusted here.
          className={cn("text-center font-mono", recovery ? "tracking-normal sm:tracking-[0.08em]" : "tracking-[0.4em]")}
        />
      </InputGroup>
    </FormField>
  );
}
