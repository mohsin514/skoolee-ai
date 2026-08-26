"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The save bar for the two data-entry screens (attendance, marks).
 *
 * Both screens put Save at the bottom of a list that is routinely forty rows
 * long, so on any real class the teacher marked the last student and then had
 * to scroll to a button they could not see — with no running indication that
 * anything was unsaved at all. This floats over the content the moment the
 * sheet is dirty, states how many changes are pending, and offers the undo that
 * neither screen had.
 *
 * It is deliberately quiet when clean: nothing renders, so the layout below is
 * never padded for a bar that isn't there.
 */
export function StickySaveBar({
  dirtyCount,
  saving,
  onSave,
  onReset,
  saveLabel = "Save",
  savingLabel = "Saving…",
  blocked,
  blockedReason,
  hint,
  forceShow = false,
  label,
  children,
}: {
  /** Number of pending edits. Zero hides the bar unless `forceShow` is set. */
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
  savingLabel?: string;
  /** Save is disabled and the reason is shown in place of the count. */
  blocked?: boolean;
  blockedReason?: string;
  hint?: ReactNode;
  /** Show the bar even with no pending edits — a sheet that has never been
      saved at all still needs one press, and hiding the button until the
      teacher happens to change something makes that unreachable. */
  forceShow?: boolean;
  /** Replaces the "N unsaved changes" line. */
  label?: string;
  /** Extra controls, rendered left of Discard. */
  children?: ReactNode;
}) {
  const visible = dirtyCount > 0 || forceShow;

  // ⌘S / Ctrl+S is what anyone doing an hour of data entry reaches for.
  useEffect(() => {
    if (!visible || saving || blocked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, saving, blocked, onSave]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none sticky bottom-3 z-30 flex justify-center px-2"
    >
      <div
        className={cn(
          "sk-rise pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-[22px] border px-4 py-3 backdrop-blur-xl",
          "shadow-[0_8px_24px_-8px_rgba(31,26,35,0.28),0_24px_60px_-24px_rgba(129,39,207,0.55)]",
          blocked
            ? "border-rose-200 bg-rose-50/95"
            : "border-[#8127cf]/20 bg-[#1f1a23]/95",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            blocked ? "bg-rose-100 text-rose-600" : "bg-white/10 text-white",
          )}
        >
          <Save className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-black leading-tight", blocked ? "text-rose-700" : "text-white")}>
            {blocked
              ? blockedReason || "Fix the highlighted cells to save"
              : label || `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
          </p>
          {hint ? (
            <p className={cn("truncate text-[11px] font-semibold", blocked ? "text-rose-600" : "text-white/55")}>
              {hint}
            </p>
          ) : null}
        </div>

        {children}

        {onReset && dirtyCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            title="Discard every change made since this sheet was loaded"
            className={cn(
              "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-[11px] font-black uppercase tracking-wider transition-all active:scale-[0.97] disabled:opacity-40",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/40",
              blocked
                ? "bg-white text-rose-600 hover:bg-rose-100"
                : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Discard
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSave}
          disabled={saving || blocked}
          title={blocked ? blockedReason : `${saveLabel} (⌘S)`}
          className={cn(
            "inline-flex h-10 min-w-[132px] cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-[12px] font-black uppercase tracking-wider transition-all active:scale-[0.97]",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40",
            "disabled:cursor-not-allowed disabled:opacity-45",
            blocked
              ? "bg-rose-500 text-white"
              : "bg-gradient-to-br from-[#9c48ea] to-[#8127cf] text-white shadow-[0_8px_20px_-6px_rgba(156,72,234,0.7)] hover:brightness-110",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}
