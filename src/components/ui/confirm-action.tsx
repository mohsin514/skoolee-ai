"use client";

import { useEffect } from "react";
import { AlertTriangle, Check, Info, Loader2, ShieldAlert, X } from "lucide-react";
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
 * Each tone carries its own icon as well as its own colour: colour alone is not
 * a reliable signal, and "delete forever" and "save this" should not be
 * distinguishable only by hue.
 */
const TONES = {
  danger: {
    icon: ShieldAlert,
    wash: "from-rose-50/80 via-white to-rose-50/40",
    rule: "border-rose-200/50",
    tile: "from-rose-500 to-rose-600 shadow-rose-500/25",
    eyebrow: "text-rose-600",
    orb: "from-rose-400/15",
    button: "bg-rose-500 hover:bg-rose-600 shadow-rose-500/25",
    label: "This cannot be undone",
  },
  warning: {
    icon: AlertTriangle,
    wash: "from-amber-50/80 via-white to-amber-50/40",
    rule: "border-amber-200/50",
    tile: "from-amber-500 to-amber-600 shadow-amber-500/25",
    eyebrow: "text-amber-600",
    orb: "from-amber-400/15",
    button: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25",
    label: "Please confirm",
  },
  primary: {
    icon: Info,
    wash: "from-[#faf7fc] via-white to-[#f3eeff]",
    rule: "border-[#cfc2d6]/20",
    tile: "from-[#8127cf] to-[#6a1fb0] shadow-[#8127cf]/25",
    eyebrow: "text-[#8127cf]",
    orb: "from-[#8127cf]/15",
    button: "bg-[#8127cf] hover:bg-[#6a1fb0] shadow-[#8127cf]/25",
    label: "Please confirm",
  },
  success: {
    icon: Check,
    wash: "from-emerald-50/80 via-white to-emerald-50/40",
    rule: "border-emerald-200/50",
    tile: "from-emerald-500 to-emerald-700 shadow-emerald-500/25",
    eyebrow: "text-emerald-600",
    orb: "from-emerald-400/15",
    button: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25",
    label: "Please confirm",
  },
} as const;

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
  // Escape cancels. The dialog previously trapped the user into clicking.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const t = TONES[tone];
  const Icon = t.icon;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#1f1a23]/50 p-4 backdrop-blur-md animate-backdrop-enter"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-[32px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.28)] animate-modal-enter"
      >
        <div className={cn("relative overflow-hidden border-b bg-gradient-to-br p-6", t.rule, t.wash)}>
          <div className={cn("pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-bl to-transparent blur-3xl", t.orb)} />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", t.tile)}>
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className={cn("text-[11px] font-black uppercase tracking-wider", t.eyebrow)}>{t.label}</p>
                <h2 className="mt-0.5 text-xl font-black leading-tight tracking-tight text-[#1f1a23]">{title}</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="group/x flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4 transition-transform duration-300 group-hover/x:rotate-90" />
              <span className="sr-only">Cancel</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm font-semibold leading-relaxed text-[#4d4354]/75">{description}</p>
          {detail ? (
            <div className="mt-4 rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] px-4 py-3 text-xs font-semibold text-[#4d4354]/70">
              {detail}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[#cfc2d6]/15 bg-[#faf7fc] px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-12 cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-5 text-sm font-bold text-[#4d4354]/70 transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    </div>
  );
}
