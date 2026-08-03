"use client";

import { AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmActionProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

const toneStyles = {
  danger: {
    icon: "bg-rose-50 text-rose-600",
    button: "bg-rose-500 hover:bg-rose-600 shadow-rose-500/15",
  },
  warning: {
    icon: "bg-amber-50 text-amber-600",
    button: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/15",
  },
  primary: {
    icon: "bg-[#fbf0fe] text-[#8127cf]",
    button: "bg-[#8127cf] hover:bg-[#9c48ea] shadow-[#8127cf]/15",
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
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  if (!open) return null;

  const styles = toneStyles[tone];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#1f1a23]/45 p-5 backdrop-blur-md animate-backdrop-enter">
      <div className="w-full max-w-md overflow-hidden rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-modal-enter">
        <div className="border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-6">
          <div className="flex items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner", styles.icon)}>
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black leading-tight text-[#1f1a23]">{title}</h2>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#4d4354]/70">{description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/45 transition-all hover:bg-white hover:text-[#8127cf] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 p-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn("text-white", styles.button)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
