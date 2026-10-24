"use client";

import { useEffect, useState } from "react";
import { anchorSelector } from "@/lib/onboarding/tours/anchors";

export type TourTargetStatus = "idle" | "searching" | "found" | "missing";

/** Elements inside the tour's own overlay never count as the target. */
const OVERLAY = "[data-spotlight-root]";

/** First rendered match: has layout boxes, is not inside [inert] or [hidden], is not the overlay. */
export function findTourTarget(anchor: string): Element | null {
  if (typeof document === "undefined") return null;
  for (const element of document.querySelectorAll(anchorSelector(anchor))) {
    if (element.closest(OVERLAY) || element.closest("[inert],[hidden]")) continue;
    if (element.getClientRects().length > 0) return element;
  }
  return null;
}

/** Present in the DOM but without layout boxes (display:none at this breakpoint): wait less before skipping. */
function presentButHidden(anchor: string): boolean {
  return typeof document !== "undefined" && document.querySelector(anchorSelector(anchor)) !== null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Brings the target into view inside the nearest scrollable ancestor (RoleShell's <main> clips its overflow). */
function reveal(element: Element) {
  const rect = element.getBoundingClientRect();
  const inView = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= document.documentElement.clientWidth;
  if (!inView) element.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * Resolves `[data-tour="…"]` for the current step. Waits with a MutationObserver (views render after a navigation)
 * up to `timeout` ms — 600 ms when the anchor exists but is hidden at this breakpoint — and then reports `missing`
 * so the provider skips the step. Keeps watching after a match so a re-rendered node is picked up again; a matched
 * control that disappears restarts the same wait, so the step can never stay "searching" for ever.
 */
export function useTourTarget(anchor: string | null, { timeout = 2500, key }: { timeout?: number; key?: unknown } = {}): { element: Element | null; status: TourTargetStatus } {
  // The state remembers which step it belongs to, so the first render of a new step never reports the previous
  // step's element (the card would flash beside the old control for a frame).
  const step = anchor ? `${anchor}\u0000${String(key ?? "")}` : null;
  const [state, setState] = useState<{ step: string | null; element: Element | null; status: TourTargetStatus }>({ step: null, element: null, status: "idle" });

  useEffect(() => {
    if (!anchor || !step) { setState({ step: null, element: null, status: "idle" }); return; }
    let frame = 0;
    let current: Element | null = null;
    let done = false;
    let timer = 0;
    let hiddenTimer = 0;
    setState({ step, element: null, status: "searching" });
    const giveUp = () => { if (!current) { done = true; setState({ step, element: null, status: "missing" }); } };
    // (Re-)arms both give-up timers. Called when the search starts and again whenever a found control disappears, so
    // a control that is removed and never comes back still ends in "missing" (the step is skipped) instead of leaving
    // the tour dimmed with no card.
    const arm = () => {
      window.clearTimeout(timer);
      window.clearTimeout(hiddenTimer);
      timer = window.setTimeout(giveUp, timeout);
      hiddenTimer = window.setTimeout(() => { if (!current && presentButHidden(anchor)) giveUp(); }, Math.min(600, timeout));
    };
    const check = () => {
      frame = 0;
      if (current && current.isConnected && current.getClientRects().length > 0) return;
      const found = findTourTarget(anchor);
      if (found) {
        if (found !== current) { current = found; reveal(found); setState({ step, element: found, status: "found" }); }
        window.clearTimeout(timer);
        window.clearTimeout(hiddenTimer);
        return;
      }
      if (current) { current = null; setState({ step, element: null, status: "searching" }); arm(); }
    };
    const schedule = () => { if (!frame && !done) frame = window.requestAnimationFrame(check); };
    arm();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour", "hidden", "inert", "class", "style", "aria-hidden"] });
    // A breakpoint change can hide or show the control without any DOM mutation.
    window.addEventListener("resize", schedule);
    check();
    return () => {
      done = true;
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearTimeout(timer);
      window.clearTimeout(hiddenTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [anchor, step, timeout]);

  if (!step) return { element: null, status: "idle" };
  if (state.step !== step) return { element: null, status: "searching" };
  return { element: state.element, status: state.status };
}
