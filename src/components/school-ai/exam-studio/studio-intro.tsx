"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { StudioAssistantMark } from "./studio-assistant-mark";

/**
 * The Exam Studio entry sequence (R20).
 *
 * One brand beat when a staff member opens the studio, and then it is gone. Everything here is
 * written so the sequence cannot become a cost: it animates only `opacity`, `scale` and `y`, so it
 * can never reflow the workspace underneath it; it issues no request of its own (R20.14), so the
 * workspace's own fetch owns the network from the first moment (R20.13); it ends on the first
 * pointer, key or scroll (R20.3); it plays once per browser session per user (R20.6); and it is
 * rendered only by `exam-studio-shell.tsx`, which is not in the tree of `/ai/exams/[id]`, the
 * attempt start action, the active control-room view or the print route (R20.7) — so it cannot
 * delay an attempt, overlay a save state or consume exam time (R20.8–R20.10).
 *
 * **Why a Client Component.** Per
 * `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, a
 * Client Component is for state, event handlers, lifecycle and browser-only APIs — this file needs
 * all four: `sessionStorage`, capture-phase `document` listeners, timers and motion state. The
 * directive is a module-graph boundary, which is the right boundary here: nothing on a server path
 * imports the intro, and `studio-status.tsx` stays directive-free beside it precisely so the print
 * output and the Attempt_Receipt can still render the status vocabulary on the server.
 *
 * **Why both a CSS rule and a JavaScript branch for reduced motion.** `src/app/globals.css:723`
 * forces `animation-duration` and `transition-duration` to `0.01ms !important` under
 * `prefers-reduced-motion`, and `docs/ui-plan/tokens-and-styles.md` states plainly that this does
 * not control Framer Motion. So the tree is wrapped in `MotionConfig reducedMotion="user"` — the
 * pattern already used in `src/components/chat/chat-dock.tsx` — *and* `useReducedMotion()` selects
 * a second render path that contains no animated element at all (R20.4, R21.8).
 *
 * The assistant mark retains the existing Sparkles accent and adds the installed Lucide Bot
 * outline requested for the Studio introduction. Its colour is the existing
 * `--brand-1`/`--brand-2` pair from `globals.css`; the motion library is the
 * installed `framer-motion@^11.18.2`. No new font, no new palette, no new dependency.
 *
 * Styling is Tailwind utility classes over those tokens, which is what
 * `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` recommends for component
 * styling, so this file adds no stylesheet and no CSS-ordering dependency. The two values that are
 * *behaviour* rather than appearance — `pointer-events` from phase 3, and the layer — are inline
 * styles, because they are driven by state and must be readable without the compiled stylesheet.
 */

/** Suppresses a replay for the rest of this browser session (R20.6). */
export const STUDIO_INTRO_SESSION_KEY = "skoolee:exam-studio-intro";
const PLAYED = "played";

/** R20.2 states an upper bound, not a target. The sequence is built well inside it. */
export const STUDIO_INTRO_CEILING_MS = 1800;

/**
 * The four phases, from the design's Studio_Intro table. Exported so the test asserts the shipped
 * timing rather than a copy of it, and so the 700 ms of headroom against the ceiling is checkable.
 */
export const STUDIO_INTRO_PHASES = [
  { phase: 1, startMs: 0, endMs: 320, moves: "mark", properties: ["opacity", "scale"] },
  { phase: 2, startMs: 240, endMs: 680, moves: "rings", properties: ["opacity", "scale"] },
  { phase: 3, startMs: 560, endMs: 900, moves: "scrim", properties: ["opacity"] },
  { phase: 4, startMs: 880, endMs: 1100, moves: "settle", properties: ["opacity", "y"] },
] as const;

/** 1100 ms, the last phase's end. Derived, so the table stays the single source of the timing. */
export const STUDIO_INTRO_DURATION_MS = Math.max(...STUDIO_INTRO_PHASES.map((entry) => entry.endMs));

/** Phase 3 is where the overlay stops intercepting pointers and the workspace takes over. */
const POINTER_RELEASE_PHASE = 3;

/** The existing enter/exit curves from `docs/ui-plan/tokens-and-styles.md`. */
const EASE_ENTER = [0.16, 1, 0.3, 1] as const;
const EASE_EXIT = [0.4, 0, 1, 1] as const;

export interface StudioIntroProps {
  /** Keep the once-per-session preference isolated between accounts on a shared device. */
  sessionScope?: string;
  /**
   * The account preference of R20.6, resolved by the shell from the reader's settings record and
   * passed in. It is a prop rather than a fetch on purpose: R20.14 forbids the intro issuing a
   * data request, so the preference has to arrive with the first render.
   */
  suppressed?: boolean;
  /**
   * Called once when the studio owns interaction again — at the end of the sequence, on a skip, when
   * the sequence is suppressed, and when it fails to initialize. The shell uses it to focus the
   * workspace, so "exactly once, always" is the contract (R20.1, R20.2, R20.15).
   */
  onComplete?: () => void;
}

function StudioIntroSequence({ suppressed = false, onComplete, sessionScope }: StudioIntroProps) {
  // `null` during the first render on the server and before the media query is read, which is why
  // the sequence only starts from an effect: there is no frame in which a reduced-motion reader
  // sees the animated branch.
  const reduced = useReducedMotion();
  const sessionKey = sessionScope ? `${STUDIO_INTRO_SESSION_KEY}:${sessionScope}` : STUDIO_INTRO_SESSION_KEY;
  const [state, setState] = useState<"deciding" | "playing" | "done">("deciding");
  const [phase, setPhase] = useState(1);

  const ended = useRef(false);
  const timers = useRef<number[]>([]);
  const frame = useRef<number | null>(null);
  // Held in a ref so `end` keeps one identity for the lifetime of the overlay: a changing callback
  // prop must never detach and reattach the capture listeners mid-sequence. Declared first so the
  // ref is current before the decision effect below can call it.
  const complete = useRef(onComplete);
  useEffect(() => {
    complete.current = onComplete;
  }, [onComplete]);

  /**
   * Cancels every running animation and unmounts in the same tick (R20.3).
   *
   * Unmounting *is* the cancellation. Each phase is a declarative `animate` target rather than an
   * imperative `AnimationControls` sequence, and Framer Motion's animation feature stops a node's
   * values when that node unmounts — so there is nothing left running once this returns. The
   * imperative form was tried first, as the design describes; `useAnimationControls()` in the
   * installed `framer-motion@11.18.2` never drove these nodes (`mount()`'s own cleanup calls
   * `stop()`, and the elements stayed pinned to their `initial` values), so the declarative form is
   * what actually animates. The observable contract is unchanged, and
   * `exam-studio-intro.browser.spec.ts` measures it frame by frame rather than trusting either.
   *
   * `flushSync` is what makes "the same tick" literal: `wheel` and `scroll` are continuous events,
   * which React does not flush synchronously, so without it a fast scroll would paint one more
   * overlay frame. It is only ever called from a DOM listener, a timer or an animation frame —
   * never from render or an effect body.
   */
  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    flushSync(() => setState("done"));
    complete.current?.();
  }, []);

  // R20.6. The decision is made in an effect, not in render, for two reasons: `sessionStorage` does
  // not exist while this renders on the server, and reading it in render would make the server and
  // client markup disagree. The session is marked on mount rather than at completion, so a reader
  // who navigates away mid-sequence still does not see it twice.
  //
  // Nothing here is wrapped in try/catch. A browser that refuses session storage throws, the
  // boundary below catches it, and the workspace renders without the intro — which is exactly what
  // R20.15 asks for, through one path instead of two.
  useEffect(() => {
    if (suppressed || window.sessionStorage.getItem(sessionKey) === PLAYED) {
      ended.current = true;
      setState("done");
      complete.current?.();
      return;
    }
    window.sessionStorage.setItem(sessionKey, PLAYED);
    setState("playing");
    // Deliberately mount-only: the preference is read once, at entry.
  }, []);

  // R20.3. Capture phase, so the intro ends before any workspace handler runs, and passive, so the
  // event is never swallowed: the keystroke or scroll that ends the sequence still reaches the
  // workspace it just handed over to.
  useEffect(() => {
    if (state !== "playing") return;
    const options = { capture: true, passive: true } as const;
    const skip = () => end();
    const types = ["pointerdown", "keydown", "wheel", "scroll"] as const;
    for (const type of types) document.addEventListener(type, skip, options);
    return () => {
      for (const type of types) document.removeEventListener(type, skip, options);
    };
  }, [state, end]);

  useEffect(() => {
    if (state !== "playing") return;

    // R20.4, R20.5: the static mark has no keyframes to run, so completion is one animation frame.
    if (reduced) {
      frame.current = requestAnimationFrame(() => end());
      return;
    }

    // The phases themselves are declared on the elements below. These timers only publish the
    // current phase — which is what releases pointer events at phase 3 — and close the sequence.
    for (const entry of STUDIO_INTRO_PHASES) {
      if (entry.startMs === 0) continue;
      timers.current.push(window.setTimeout(() => setPhase(entry.phase), entry.startMs));
    }
    timers.current.push(window.setTimeout(end, STUDIO_INTRO_DURATION_MS));

    return () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    };
  }, [state, reduced, end]);

  if (state !== "playing") return null;

  // R20.12: the whole overlay is decoration. `aria-hidden` with no focusable element inside means a
  // screen reader and the tab order both go straight to the workspace, which is already mounted.
  const shell = (children: ReactNode) => (
    <div
      aria-hidden="true"
      data-studio-intro={reduced ? "static" : "sequence"}
      data-studio-intro-phase={reduced ? undefined : phase}
      // Below the 1200 modal base in `src/components/ui/modal.tsx`, so a dialog is never covered by
      // a brand animation. Pointer events are released at phase 3 and the overlay is inert after.
      style={{ zIndex: 1100, pointerEvents: reduced || phase >= POINTER_RELEASE_PHASE ? "none" : "auto" }}
      className="fixed inset-0 grid place-items-center"
    >
      {children}
    </div>
  );

  if (reduced) {
    // A single static assistant mark: the first frame is the final frame. No `motion` element, no
    // keyframes, and no class that compiles to a `transform` — nothing for the sequence to remove,
    // because there is no sequence (R20.4).
    return (
      <MotionConfig reducedMotion="user">
        {shell(
          <span data-studio-intro-mark className="grid size-20 place-items-center rounded-full bg-brand text-white">
            <StudioAssistantMark className="size-10" />
          </span>,
        )}
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {shell(
        <>
          {/* Phase 3, 560–900 ms. A brand wash lifting to reveal the workspace loaded beneath it. */}
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.34, delay: 0.56, ease: "easeOut" }}
            className="absolute inset-0 bg-gradient-to-br from-brand/95 via-brand-2/90 to-brand/95"
          />
          {/* Phase 4, 880–1100 ms. Settling the whole stage, so the mark keeps one transform owner. */}
          <motion.div
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, delay: 0.88, ease: EASE_EXIT }}
            className="relative grid place-items-center"
          >
            {/* Phase 2, 240–680 ms. Two concentric rings, one outward sweep. */}
            {[0, 1].map((ring) => (
              <motion.span
                key={ring}
                aria-hidden="true"
                data-studio-intro-ring={ring}
                initial={{ opacity: 0.55, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.9 }}
                transition={{ duration: 0.44, delay: 0.24, ease: "easeOut" }}
                className="absolute rounded-full border-2 border-white/70"
                style={{ width: 96 + ring * 48, height: 96 + ring * 48 }}
              />
            ))}
            {/* Phase 1, 0–320 ms. The existing assistant mark fades in and settles. */}
            <motion.span
              data-studio-intro-mark
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, ease: EASE_ENTER }}
              className="relative grid size-20 place-items-center rounded-full bg-white text-brand shadow-lg"
            >
              <StudioAssistantMark className="size-10" />
            </motion.span>
          </motion.div>
        </>,
      )}
    </MotionConfig>
  );
}

/**
 * R20.15. An initialization failure renders the workspace without the intro, and still hands
 * interaction over, so a refused `sessionStorage` or a motion library that cannot start costs the
 * reader a brand moment and nothing else. A class component because that is the only error boundary
 * React offers.
 */
class StudioIntroBoundary extends Component<{ children: ReactNode; onFailure?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function StudioIntro({ suppressed, onComplete, sessionScope }: StudioIntroProps) {
  return (
    <StudioIntroBoundary onFailure={onComplete}>
      <StudioIntroSequence suppressed={suppressed} onComplete={onComplete} sessionScope={sessionScope} />
    </StudioIntroBoundary>
  );
}
