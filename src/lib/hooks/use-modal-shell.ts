"use client";

import { useCallback, useEffect, type RefObject } from "react";
import { useDialogFocus } from "./use-dialog-focus";

/**
 * The behaviour every dialog needs, in one place.
 *
 * `useDialogFocus` already handled focus — moving it in, trapping Tab, handing
 * it back. But the dialogs scattered across the academic components each
 * re-implemented the rest by hand, or skipped it: the exam board's three
 * dialogs had no Escape handler at all, none of them locked the page behind
 * them, and the two that hold typed input threw it away on a stray backdrop
 * click without asking.
 *
 * `requestClose` is the one exit these dialogs should call — from the X, the
 * backdrop and Escape — so the unsaved-input check cannot be forgotten on one
 * of the three.
 */
export function useModalShell({
  ref,
  onClose,
  dirty = false,
  dirtyMessage = "You have unsaved changes. Discard them?",
  active = true,
}: {
  ref: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Holds typed-but-unsaved input — closing asks before discarding. */
  dirty?: boolean;
  dirtyMessage?: string;
  active?: boolean;
}) {
  useDialogFocus(ref, active);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(dirtyMessage)) return;
    onClose();
  }, [dirty, dirtyMessage, onClose]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, requestClose]);

  // A dialog that lets the page scroll behind it loses the reader's place the
  // moment it closes, and on a phone the background steals the scroll gesture.
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [active]);

  return requestClose;
}
