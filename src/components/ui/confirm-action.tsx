"use client";

import { AlertTriangle, Check, Info, Loader2, ShieldAlert, type LucideIcon } from "lucide-react";
import { Modal, type ModalTone } from "./modal";
import { cn } from "@/lib/utils";

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
  { icon: LucideIcon; modal: ModalTone; eyebrow: string; button: string }
> = {
  danger: {
    icon: ShieldAlert,
    modal: "rose",
    eyebrow: "This cannot be undone",
    button: "bg-rose-500 hover:bg-rose-600 shadow-rose-500/25",
  },
  warning: {
    icon: AlertTriangle,
    modal: "amber",
    eyebrow: "Please confirm",
    button: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25",
  },
  primary: {
    icon: Info,
    modal: "violet",
    eyebrow: "Please confirm",
    button: "bg-[#8127cf] hover:bg-[#6a1fb0] shadow-[#8127cf]/25",
  },
  success: {
    icon: Check,
    modal: "emerald",
    eyebrow: "Please confirm",
    button: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25",
  },
};

export function ConfirmAction({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  tone = "primary",
  detail,
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  if (!open) return null;

  const t = TONES[tone];

  return (
    <Modal
      title={title}
      eyebrow={t.eyebrow}
      icon={t.icon}
      tone={t.modal}
      size="xs"
      role="alertdialog"
      onClose={onCancel}
      // Mid-write is the worst moment to lose the question: a stray click on the
      // backdrop or a reflexive Escape while the request is in flight would
      // leave the caller's `busy` state stranded with nothing on screen.
      disableBackdropClose={busy}
      hideClose={busy}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-12 cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-5 text-sm font-bold text-ink transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
              t.button,
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm font-semibold leading-relaxed text-ink">{description}</p>
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
  return (
    <ConfirmAction
      open={pendingHref !== null}
      tone="warning"
      title="Leave without saving?"
      description={message}
      confirmLabel="Leave anyway"
      cancelLabel="Stay on this page"
      onCancel={cancel}
      onConfirm={proceed}
    />
  );
}
