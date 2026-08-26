"use client";

import { useEffect } from "react";

/**
 * Warn before losing unsaved work.
 *
 * Attendance and the mark sheet are both long, manual data-entry jobs held
 * entirely in component state until the teacher presses Save. Every way out of
 * the page — a reload, a closed tab, a click on the subnav — silently threw the
 * work away. `beforeunload` covers the browser-level exits; the in-app exits are
 * covered by `useNavGuard` below, which intercepts clicks on links and buttons
 * that would leave the current route.
 *
 * The browser ignores custom text on the native prompt, so `dirty` is the whole
 * API for that half.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need a non-empty returnValue to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * The in-app half: catch a click that is about to change route while there is
 * unsaved work, and confirm first.
 *
 * This runs in the capture phase on the document so it fires before the
 * router's own handler, which is the only point at which the navigation can
 * still be stopped without reaching into the router internals.
 */
export function useNavGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const trigger = target?.closest<HTMLElement>("a[href],[data-href]");
      if (!trigger) return;

      const href = trigger.getAttribute("href") || trigger.getAttribute("data-href");
      if (!href || href.startsWith("#")) return;
      // Same URL is not a navigation.
      if (href === window.location.pathname) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, message]);
}
