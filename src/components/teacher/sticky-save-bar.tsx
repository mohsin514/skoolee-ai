"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useUiText } from "@/components/locale/LocaleProvider";


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
 * never padded for a bar that isn't there — unless the screen asks for it with
 * `forceShow` (an open sheet): then a calm "saved" status stays put (no Save
 * button until there is something to save), so the bar (and its tour anchor
 * `teacher.marks.save`) is always where the teacher will look for it (§9.4).
 * Save itself keeps its frozen contract: present only with changes, disabled
 * only while saving or blocked.
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
  /** Keep the bar on screen with no pending edits (an open sheet): it reads
      `label` (e.g. "All marks saved") and Save appears once something changes. */
  forceShow?: boolean;
  /** Replaces the "N unsaved changes" line. */
  label?: string;
  /** Extra controls, rendered left of Discard. */
  children?: ReactNode;
}) {
  const ui = useUiText();
  const visible = dirtyCount > 0 || forceShow;
  const clean = dirtyCount === 0 && !blocked;
  const barRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(true);
  useEffect(() => {
    if (!visible || !barRef.current) return;
    const measure = () => setDocked((barRef.current?.clientHeight ?? 0) < (window.visualViewport?.height ?? innerHeight) * 0.22);
    const observer = new ResizeObserver(measure);
    observer.observe(barRef.current);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener("resize", measure); };
  }, [visible]);

  // ⌘S / Ctrl+S is what anyone doing an hour of data entry reaches for.
  useEffect(() => {
    if (!visible || saving || blocked || clean) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, saving, blocked, clean, onSave]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("pointer-events-none z-30 flex justify-center px-2", docked ? "sticky bottom-3" : "relative mt-4")}
    >
      <div
        ref={barRef}
        data-tour="teacher.marks.save"
        className={cn(
          "sk-rise pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-[22px] border px-4 py-3 backdrop-blur-xl",
          clean ? "shadow-(--shadow-panel)" : "shadow-(--shadow-toast)",
          blocked
            ? "border-status-error-border bg-status-error-surface"
            : clean ? "border-border-subtle bg-card/95" : "border-primary/20 bg-ink-strong/95",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            blocked ? "bg-status-error-surface text-status-error-text" : clean ? "bg-status-success-surface text-status-success-text" : "bg-primary-foreground/10 text-primary-foreground",
          )}
        >
          <Save className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-bold leading-tight", blocked ? "text-status-error-text" : clean ? "text-ink-strong" : "text-primary-foreground")}>
            {blocked
              ? blockedReason || ui("Fix the highlighted cells to save")
              : label || (dirtyCount === 1 ? ui("1 unsaved change") : ui("{0} unsaved changes", [dirtyCount]))}
          </p>
          {hint ? (
            <p className={cn("truncate text-2xs font-semibold", blocked ? "text-status-error-text" : clean ? "text-ink-muted" : "text-primary-foreground/60")}>
              {hint}
            </p>
          ) : null}
        </div>

        {children}

        {onReset && dirtyCount > 0 ? (
          <Tooltip content={ui("Discard every change made since this sheet was loaded")}>
          <Button variant="outline" size="sm"
            type="button"
            onClick={onReset}
            disabled={saving}
            className={cn("inline-flex justify-start items-center gap-1.5", !blocked && "focus-on-dark")}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {ui("Discard")}
          </Button>
          </Tooltip>
        ) : null}

        {clean ? null : (
        <Tooltip content={blocked ? blockedReason || ui("Fix the highlighted cells to save") : `${saveLabel} (⌘S)`}>
        <span tabIndex={saving || blocked ? 0 : undefined} className="inline-flex">
        <Button variant="default" size="sm"
          type="button"
          onClick={onSave}
          disabled={saving || blocked}
          loading={saving}
          className={cn("inline-flex min-w-[132px] items-center justify-center gap-2", !blocked && "focus-on-dark")}
        >
          {saving ? (savingLabel === "Saving…" ? ui("Saving…") : savingLabel) : saveLabel}
        </Button>
        </span>
        </Tooltip>
        )}
      </div>
    </div>
  );
}
