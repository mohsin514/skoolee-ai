"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import { Modal, dialogActionClass, dialogActionVariant, type DialogActionTone, type ModalTone } from "./modal";
import { Button } from "./button";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { FieldError } from "./form-field";
import { cn } from "@/lib/utils";
import { useOverlayMessages } from "@/hooks/use-overlay-messages";
import { useDocumentLocale } from "@/hooks/use-document-locale";
import { translateUi } from "@/lib/locale/ui-messages";

/** A typed reason the decision is recorded with (money, permissions, self-approval, record merges — §8.1 R3). */
export interface ConfirmReason {
  /** Field label, already in the reader's language (e.g. "Reason for approving your own request"). */
  label: string;
  /** Characters required before Confirm unlocks. Defaults to 10, the server's audit minimum. */
  minLength?: number;
  placeholder?: string;
}

interface ConfirmActionProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: "danger" | "warning" | "primary" | "success";
  /** Extra detail shown in a panel under the description, e.g. what is affected. */
  detail?: React.ReactNode;
  /**
   * Ask for a typed reason. Confirm stays disabled until the trimmed text is at
   * least `minLength` characters, and the reason is passed to `onConfirm`.
   */
  requireReason?: ConfirmReason;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}

export const DEFAULT_REASON_MIN_LENGTH = 10;

/** True when `reason` satisfies a `requireReason` rule (trimmed length ≥ minLength). Exported for tests. */
export function reasonMeetsRule(reason: string, rule: Pick<ConfirmReason, "minLength"> | undefined): boolean {
  if (!rule) return true;
  return reason.trim().length >= Math.max(1, rule.minLength ?? DEFAULT_REASON_MIN_LENGTH);
}

/**
 * What pressing Confirm does: blocked while busy or while a required reason is too short; otherwise confirm,
 * carrying the trimmed reason only when one was asked for. The component and its tests share this one rule.
 */
export function confirmOutcome(input: { busy?: boolean; reason: string; rule?: Pick<ConfirmReason, "minLength"> }):
  { confirm: false; blockedBy: "busy" | "reason" } | { confirm: true; reason?: string } {
  if (input.busy) return { confirm: false, blockedBy: "busy" };
  if (!input.rule) return { confirm: true };
  if (!reasonMeetsRule(input.reason, input.rule)) return { confirm: false, blockedBy: "reason" };
  return { confirm: true, reason: input.reason.trim() };
}

/**
 * The confirm step, built on the shared dialog shell.
 *
 * It used to be its own overlay pinned at `z-[130]`, which was fine until it
 * was raised from a dialog that had picked a higher number for itself — the
 * exam, datesheet and year-end dialogs sit at 140–200 — and then the question
 * rendered *behind* the thing that asked it. The screen dimmed twice and
 * nothing appeared to happen. Sitting on `Modal` means depth comes from the
 * open stack, so a confirm is on top because it opened last, and it inherits
 * the focus trap, the scroll lock and the Escape-goes-to-the-top-one rule
 * rather than reimplementing three of the four.
 */

const TONES: Record<
  NonNullable<ConfirmActionProps["tone"]>,
  { icon: LucideIcon; modal: ModalTone; action: DialogActionTone }
> = {
  danger: { icon: ShieldAlert, modal: "rose", action: "rose" },
  warning: { icon: AlertTriangle, modal: "amber", action: "amber" },
  primary: { icon: Info, modal: "violet", action: "violet" },
  success: { icon: Check, modal: "emerald", action: "emerald" },
};

export function ConfirmAction({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  tone = "primary",
  detail,
  requireReason,
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  const copy = useOverlayMessages();
  const { language } = useDocumentLocale();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const descriptionId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);

  // Every opening starts with an empty reason: a reason typed for one record
  // must never be carried onto the next decision.
  useEffect(() => {
    if (!open) return;
    setReason("");
    setAttempted(false);
  }, [open]);

  if (!open) return null;

  const t = TONES[tone];
  const minLength = Math.max(1, requireReason?.minLength ?? DEFAULT_REASON_MIN_LENGTH);
  const ready = reasonMeetsRule(reason, requireReason);
  const say = (source: string, ...values: Array<string | number>) =>
    translateUi(source, language).replace(/\{(\d+)\}/g, (match, index) => (index in values ? String(values[Number(index)]) : match));
  const hintId = `${reasonId}-hint`;
  const errorId = `${reasonId}-error`;

  const confirm = () => {
    const outcome = confirmOutcome({ busy, reason, rule: requireReason });
    if (!outcome.confirm) {
      if (outcome.blockedBy === "reason") {
        setAttempted(true);
        reasonRef.current?.focus();
      }
      return;
    }
    void onConfirm(outcome.reason);
  };

  return (
    <Modal
      title={title}
      eyebrow={tone === "danger" ? copy.irreversible : copy.pleaseConfirm}
      icon={t.icon}
      tone={t.modal}
      size={requireReason ? "sm" : "xs"}
      role="alertdialog"
      onClose={onCancel}
      dismissible={!busy}
      initialFocusRef={requireReason ? reasonRef : cancelRef}
      describedBy={descriptionId}
      // Mid-write is the worst moment to lose the question: a stray click on the
      // backdrop or a reflexive Escape while the request is in flight would
      // leave the caller's `busy` state stranded with nothing on screen.
      disableBackdropClose={busy || (Boolean(requireReason) && reason.trim().length > 0)}
      hideClose={busy}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel} disabled={busy} className="min-h-12 px-5">
            {/* R3: the way out of a confirmation is "Keep editing", so a "Cancel activity?" question never shows two "Cancel"s. */}
            {cancelLabel ?? copy.keepEditing}
          </Button>
          <Button
            type="button"
            variant={dialogActionVariant(t.action)}
            onClick={confirm}
            loading={busy}
            aria-disabled={requireReason && !ready ? true : undefined}
            aria-describedby={requireReason && !ready ? hintId : undefined}
            className={cn("min-h-12 px-6", dialogActionClass(t.action), requireReason && !ready && "opacity-60")}
          >
            {confirmLabel ?? copy.confirm}
          </Button>
        </div>
      }
    >
      <p id={descriptionId} className="text-sm leading-relaxed text-ink">{description}</p>
      {detail ? (
        <div className="mt-4 rounded-2xl border border-edge/20 bg-surface-subtle px-4 py-3 text-xs font-medium text-ink">
          {detail}
        </div>
      ) : null}
      {requireReason ? (
        <div className="mt-4 space-y-2">
          <Label htmlFor={reasonId}>{requireReason.label}</Label>
          <Textarea
            ref={reasonRef}
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={requireReason.placeholder ?? say("Explain why, for the audit record.")}
            aria-invalid={attempted && !ready ? true : undefined}
            aria-describedby={[hintId, attempted && !ready ? errorId : null].filter(Boolean).join(" ")}
            disabled={busy}
            rows={3}
            className="min-h-24"
          />
          <p id={hintId} className="text-xs text-ink-muted" aria-live="polite">
            <bdi>{say("{0} of {1} characters", Math.min(reason.trim().length, minLength), minLength)}</bdi>
          </p>
          {attempted && !ready ? <FieldError id={errorId}>{say("Enter at least {0} characters.", minLength)}</FieldError> : null}
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * The unsaved-work question raised by `useNavGuard` when a click would leave a
 * page mid-edit. Spread the guard straight in:
 *
 *   const guard = useNavGuard(dirty, "…");
 *   <NavGuardPrompt {...guard} />
 */
export function NavGuardPrompt({
  pendingHref,
  message,
  proceed,
  cancel,
}: {
  pendingHref: string | null;
  message: string;
  proceed: () => void;
  cancel: () => void;
}) {
  const copy = useOverlayMessages();
  return (
    <ConfirmAction
      open={pendingHref !== null}
      tone="warning"
      title={copy.leaveTitle}
      description={message}
      confirmLabel={copy.leave}
      cancelLabel={copy.stay}
      onCancel={cancel}
      onConfirm={proceed}
    />
  );
}
