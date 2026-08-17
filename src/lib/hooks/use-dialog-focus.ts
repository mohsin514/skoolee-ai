"use client";

import { useEffect, type RefObject } from "react";

/**
 * The keyboard half of a modal dialog.
 *
 * The dialogs here already carried `role="dialog"`, `aria-modal` and an Escape
 * handler, which is what most reviews check for — but focus was never actually
 * moved. Opening one left the caret on the button behind it, so a screen reader
 * kept reading the page underneath, and Tab walked the obscured page instead of
 * the dialog. `aria-modal` tells assistive tech to ignore the rest of the page;
 * it does not move or confine focus, so that has to be done here.
 *
 * Three things, all of which the dialogs were missing:
 *   1. move focus into the dialog on open,
 *   2. keep Tab/Shift+Tab inside it while it is open,
 *   3. hand focus back to whatever opened it on close.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // offsetParent is null for anything display:none'd or detached; a hidden
    // control must not become a dead stop in the tab cycle.
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export function useDialogFocus(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const opener = document.activeElement as HTMLElement | null;

    // Prefer the first real control; fall back to the dialog itself so focus
    // still leaves the page behind even when there is nothing tabbable inside.
    const initial = focusableWithin(container)[0];
    if (initial) {
      initial.focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusableWithin(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;

      // Wrap at both ends, and pull focus back if it has already escaped the
      // dialog (click on the page behind, or a browser-injected element).
      if (event.shiftKey) {
        if (current === first || !container.contains(current)) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Returning the caret to the trigger is what makes repeated open/close
      // usable without a mouse.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [ref, active]);
}
