"use client";

import { useId, useRef } from "react";
import { AlertTriangle, Check, Info, Loader2, ShieldAlert, type LucideIcon } from "lucide-react";
import { Modal, type ModalTone } from "./modal";
import { cn } from "@/lib/utils";
import { dialogActionTones } from "./action-tones";
import { useOverlayMessages } from "@/hooks/use-overlay-messages";

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
  onConfirm: () => void;
  onCancel: () => void;
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
  { icon: LucideIcon; modal: ModalTone; button: string }
> = {
  danger: {
    icon: ShieldAlert,
    modal: "rose",
    button: dialogActionTones.rose,
  },
  warning: {
    icon: AlertTriangle,
    modal: "amber",
    button: dialogActionTones.amber,
  },
  primary: {
    icon: Info,
    modal: "violet",
    button: dialogActionTones.violet,
  },
  success: {
    icon: Check,
    modal: "emerald",
    button: dialogActionTones.emerald,
  },
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
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  const copy = useOverlayMessages();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  if (!open) return null;

  const t = TONES[tone];

  return (
    <Modal
      title={title}
      eyebrow={tone === "danger" ? copy.irreversible : copy.pleaseConfirm}
      icon={t.icon}
      tone={t.modal}
      size="xs"
      role="alertdialog"
      onClose={onCancel}
      dismissible={!busy}
      initialFocusRef={cancelRef}
      describedBy={descriptionId}
      // Mid-write is the worst moment to lose the question: a stray click on the
      // backdrop or a reflexive Escape while the request is in flight would
      // leave the caller's `busy` state stranded with nothing on screen.
      disableBackdropClose={busy}
      hideClose={busy}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-12 cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-5 text-sm font-bold text-ink transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel ?? copy.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-busy={busy}
            disabled={busy}
            className={cn(
              "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
              t.button,
            )}
          >
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel ?? copy.confirm}
          </button>
        </div>
      }
    >
      <p id={descriptionId} className="text-sm font-semibold leading-relaxed text-ink">{description}</p>
      {detail ? (
        <div className="mt-4 rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] px-4 py-3 text-xs font-semibold text-ink">
          {detail}
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
