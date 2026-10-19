"use client";

import { useCallback, useRef } from "react";
import { flushSync } from "react-dom";

/**
 * The step-change morph shared by multi-step auth surfaces (the signup
 * grammar in globals.css: card, cover, face, rail and top bar travel as named
 * View Transition groups). Returns `morph(direction, update)`:
 *
 * - `update()` runs directly — no transition — without
 *   `document.startViewTransition`, under prefers-reduced-motion, while a
 *   `[role="dialog"]` is open, while another morph is in flight, or when the
 *   `[data-step-card]` is taller than two viewports (a huge snapshot is slow
 *   and reads as a jump anyway).
 * - Otherwise it marks `html[data-step-direction]` and `html[data-step-morph]`
 *   (which pauses the column's own arrival animations) and runs `update`
 *   synchronously inside the transition.
 *
 * Every transition promise is guarded, so an aborted or skipped transition
 * (duplicate names, a hidden tab) never becomes a page error. It never throws.
 */
type ViewTransitionLike = { ready?: Promise<unknown>; updateCallbackDone?: Promise<unknown>; finished?: Promise<unknown> };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransitionLike | undefined };

const noop = () => {};

function shouldSkip(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    if (document.querySelector('[role="dialog"]')) return true;
    const card = document.querySelector("[data-step-card]");
    return card ? card.getBoundingClientRect().height > 2 * window.innerHeight : false;
  } catch {
    return true;
  }
}

export function useStepMorph(): (direction: "forward" | "back", update: () => void) => void {
  const inFlight = useRef(false);
  return useCallback((direction: "forward" | "back", update: () => void) => {
    const doc = typeof document === "undefined" ? null : (document as ViewTransitionDocument);
    if (!doc || typeof doc.startViewTransition !== "function" || inFlight.current || shouldSkip()) {
      update();
      return;
    }
    const root = doc.documentElement;
    root.dataset.stepDirection = direction;
    // While the morph runs, the column's own arrival animations stay off:
    // replaying them inside the transition is what made it stutter.
    root.dataset.stepMorph = "";
    inFlight.current = true;
    const done = () => {
      delete root.dataset.stepMorph;
      inFlight.current = false;
    };
    let transition: ViewTransitionLike | undefined;
    try {
      transition = doc.startViewTransition(() => { flushSync(update); });
    } catch {
      done();
      update();
      return;
    }
    transition?.ready?.catch(noop);
    transition?.updateCallbackDone?.catch(noop);
    if (transition?.finished) transition.finished.then(done, done);
    else done();
  }, []);
}
