"use client";

/**
 * The one dialog shell for the whole product.
 *
 * Before this existed there were thirty hand-rolled overlays across the ten
 * role consoles, and each one re-decided the same six questions. The answers
 * disagreed, so the defects were structural rather than cosmetic:
 *
 *   • z-index was picked by hand per file and ranged from `z-10` to `z-[1000]`
 *     across fourteen distinct values. A dialog is only ever "on top" relative
 *     to whatever happens to be beside it, so hard-coding the number means a
 *     confirm opened from a tall dialog can land *behind* it — a dimmed screen
 *     with no visible way forward. Depth is now assigned from the open stack.
 *   • Focus was moved by exactly one of the thirty. Everywhere else the caret
 *     stayed on the button behind the backdrop, so Tab walked the obscured page
 *     and a screen reader never entered the dialog at all.
 *   • Four of the thirty locked body scroll. The rest let the page slide around
 *     underneath, which on a phone means the scroll gesture never reaches the
 *     dialog you are actually trying to read.
 *   • Ten portaled. The other twenty rendered in place, inside a `<main>` that
 *     sets `overflow: hidden` and inside panels that keep a `transform` after
 *     their entrance animation — and a transformed ancestor makes itself the
 *     containing block for `position: fixed`, so those dialogs were positioned
 *     and clipped against a card instead of the viewport.
 *   • None animated out. They blinked from present to gone, which reads as a
 *     glitch rather than a dismissal.
 *   • All thirty were centred boxes at every width, so on a phone a form dialog
 *     floated in the middle with its actions somewhere near the thumb, or not.
 *
 * Everything below is the shared answer to those six. Call sites describe what
 * the dialog *is* — title, tone, size, footer — and never position it.
 */

import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useContext,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * Layering
 *
 * A modal's depth is its position in the stack of currently-open modals, not a
 * number someone chose while writing the file. Whatever opens last is on top,
 * which is the only rule that stays correct when a confirm opens over a form
 * that opened over a detail sheet.
 * ────────────────────────────────────────────────────────────────────────── */

/** Above the app chrome (sidebar z-50, header dropdowns z-[999]) with room to spare. */
const Z_BASE = 1200;
/** Backdrop sits at the layer, panel one above it, so the two never interleave. */
const Z_STEP = 10;

const stack: string[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function useModalLayer(id: string, active = true) {
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);

  useEffect(() => {
    // `active` matters for dialogs that stay mounted while closed (the ones
    // driven by an `open` prop rather than conditional rendering). A closed
    // dialog holding a slot would push every later one a layer too high and
    // steal Escape from whatever is actually on screen.
    if (!active) return;
    stack.push(id);
    emit();
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      emit();
    };
  }, [id, active]);

  const index = stack.indexOf(id);
  // The first render happens before the effect registers, so assume top —
  // otherwise a dialog flashes underneath its own backdrop for one frame.
  const depth = index < 0 ? stack.length : index;
  const isTop = index < 0 || stack[stack.length - 1] === id;

  return { z: Z_BASE + depth * Z_STEP, isTop, depth };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Body scroll lock
 *
 * Refcounted, because nested dialogs each ask for it and only the last one out
 * may restore. Removing the scrollbar also removes its width, which yanks the
 * page sideways by ~15px on desktop; the padding compensation holds it still.
 * ────────────────────────────────────────────────────────────────────────── */

let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function lockScroll() {
  if (lockCount === 0 && typeof document !== "undefined") {
    const barWidth = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (barWidth > 0) document.body.style.paddingRight = `${barWidth}px`;
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && typeof document !== "undefined") {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Presentation tokens
 * ────────────────────────────────────────────────────────────────────────── */

export const MODAL_TONES = {
  violet: {
    wash: "from-[#faf7fc] via-white to-[#f3eeff]",
    tile: "from-[#8127cf] to-[#6a1fb0] shadow-[#8127cf]/25",
    eyebrow: "text-[#8127cf]",
    orb: "from-[#8127cf]/12",
    rule: "border-[#cfc2d6]/20",
    ring: "focus-visible:ring-[#8127cf]/40",
  },
  emerald: {
    wash: "from-emerald-50/70 via-white to-emerald-50/40",
    tile: "from-emerald-500 to-emerald-700 shadow-emerald-500/25",
    eyebrow: "text-emerald-600",
    orb: "from-emerald-400/12",
    rule: "border-emerald-200/50",
    ring: "focus-visible:ring-emerald-500/40",
  },
  amber: {
    wash: "from-amber-50/70 via-white to-amber-50/40",
    tile: "from-amber-500 to-amber-600 shadow-amber-500/25",
    eyebrow: "text-amber-600",
    orb: "from-amber-400/12",
    rule: "border-amber-200/50",
    ring: "focus-visible:ring-amber-500/40",
  },
  rose: {
    wash: "from-rose-50/70 via-white to-rose-50/40",
    tile: "from-rose-500 to-rose-600 shadow-rose-500/25",
    eyebrow: "text-rose-600",
    orb: "from-rose-400/12",
    rule: "border-rose-200/50",
    ring: "focus-visible:ring-rose-500/40",
  },
  sky: {
    wash: "from-sky-50/70 via-white to-sky-50/40",
    tile: "from-sky-500 to-sky-700 shadow-sky-500/25",
    eyebrow: "text-sky-600",
    orb: "from-sky-400/12",
    rule: "border-sky-200/50",
    ring: "focus-visible:ring-sky-500/40",
  },
} as const;

export type ModalTone = keyof typeof MODAL_TONES;

export const MODAL_SIZES = {
  xs: "sm:max-w-md",
  sm: "sm:max-w-lg",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
  xl: "sm:max-w-6xl",
  full: "sm:max-w-[92rem]",
} as const;

export type ModalSize = keyof typeof MODAL_SIZES;

/** Kept in step with the exit keyframes in globals.css. */
const EXIT_MS = 180;

/* ────────────────────────────────────────────────────────────────────────────
 * Focus
 * ────────────────────────────────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute("data-modal-skip-focus") &&
      (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement),
  );
}

/**
 * Focus is two independent jobs and they must not share an effect.
 *
 * Entry and restore belong to the dialog's lifetime: capture the opener once,
 * move the caret in, hand it back when the dialog goes away. The Tab trap
 * belongs to whether this dialog is currently the top one. Putting both in a
 * single effect keyed on `isTop` meant that opening a confirm over a form ran
 * the form's cleanup, which threw focus back to the page behind — pulling it
 * straight out of the confirm that had just appeared.
 */
function useFocusManagement(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  ready: boolean,
) {
  useEffect(() => {
    if (!ready) return;
    const root = ref.current;
    if (!root) return;

    const opener = document.activeElement as HTMLElement | null;
    const items = focusablesIn(root);
    // Prefer a data-entry field over the close button, which is first in DOM
    // order: landing on "Close" as the opening move reads as an invitation to
    // leave, and on a form the caret should be where the typing starts.
    const firstField = items.find((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
    const target = firstField ?? items[0] ?? root;
    if (target === root) root.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });

    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, ready]);

  useEffect(() => {
    if (!active || !ready) return;
    const root = ref.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusablesIn(root);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [ref, active, ready]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scroll affordance
 *
 * A pinned footer with a hairline above it looks identical whether there is
 * more content below or not. These two flags drive a soft fade at whichever
 * edge is actually cut off, so "there is more here" is visible rather than
 * something you discover by scrolling.
 * ────────────────────────────────────────────────────────────────────────── */

function useScrollEdges(deps: unknown[]) {
  // A ref would be null on the first pass — the element lives inside
  // ModalSurface, which renders nothing until it has mounted — and an effect
  // keyed on a ref never re-runs when the ref is later filled in. A callback
  // ref is state, so attaching the node schedules the measurement.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    if (!el) return;

    const measure = () => {
      const overflowing = el.scrollHeight - el.clientHeight > 1;
      setEdges({
        top: overflowing && el.scrollTop > 4,
        bottom: overflowing && el.scrollTop + el.clientHeight < el.scrollHeight - 4,
      });
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Content can grow without the box resizing (an expanding section, async
    // rows arriving), and that also changes whether an edge is cut off.
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [el, ...deps]);

  return { edges, bodyRef: setEl };
}

/* ────────────────────────────────────────────────────────────────────────────
 * useDialogBehaviour
 *
 * For overlays that already have presentation worth keeping and only need the
 * guarantees: the messenger's new-conversation sheet and the command palette
 * are both well-built and would lose real design work in a rewrite. They get
 * the layering, the focus trap, the scroll lock and Escape from here, and keep
 * their own markup and motion.
 *
 * Anything new should use `Modal` instead — this is the escape hatch, not the
 * front door.
 * ────────────────────────────────────────────────────────────────────────── */

export function useDialogBehaviour(
  panelRef: React.RefObject<HTMLElement | null>,
  { onClose, active = true }: { onClose: () => void; active?: boolean },
) {
  const id = useId();
  const { z, isTop } = useModalLayer(id, active);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);

  useFocusManagement(panelRef, active && isTop, mounted && active);

  useEffect(() => {
    if (!active || !isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, isTop, onClose]);

  return { z, isTop, mounted };
}

/* ────────────────────────────────────────────────────────────────────────────
 * ModalSurface — the shell without opinions about the contents
 *
 * `Modal` below is the shell plus the standard header/body/footer, which is
 * what almost every dialog wants. A few do not: the shadcn-style `Dialog`
 * compound component composes its own header, and the command palette is a
 * search field rather than a titled panel. They take this instead, so there is
 * still exactly one implementation of portalling, layering, scroll locking,
 * focus trapping, Escape routing and the mobile sheet.
 * ────────────────────────────────────────────────────────────────────────── */

const ModalSurfaceContext = createContext<ModalSurfaceApi | null>(null);

/**
 * The surface's controls, for the chrome rendered inside it.
 *
 * This was a render prop until the callbacks it hands out — which read the
 * drag ref — made `children(api)` a ref access during render. Context keeps the
 * same capability without calling anything while rendering.
 */
export function useModalSurface(): ModalSurfaceApi {
  const ctx = useContext(ModalSurfaceContext);
  if (!ctx) throw new Error("useModalSurface must be used inside a <ModalSurface>");
  return ctx;
}

export interface ModalSurfaceApi {
  /** Runs the unsaved-changes guard, plays the exit, then calls `onClose`. */
  requestClose: () => void;
  /** Spread onto whatever should be draggable on a phone — usually the header. */
  dragHandleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  titleId: string;
  descId: string;
}

export function ModalSurface({
  onClose,
  size,
  wide = false,
  dirty = false,
  dirtyMessage = "You have unsaved changes. Discard them?",
  disableBackdropClose = false,
  role = "dialog",
  labelledBy,
  describedBy,
  ariaLabel,
  className,
  children,
}: {
  onClose: () => void;
  size?: ModalSize;
  wide?: boolean;
  dirty?: boolean;
  dirtyMessage?: string;
  disableBackdropClose?: boolean;
  role?: "dialog" | "alertdialog";
  labelledBy?: string;
  describedBy?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const width = MODAL_SIZES[size ?? (wide ? "lg" : "sm")];

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const panelRef = useRef<HTMLDivElement>(null);
  const { z, isTop } = useModalLayer(reactId);

  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  // Drag offset for the mobile sheet, in px. Null means "not dragging".
  const [dragY, setDragY] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);

  useFocusManagement(panelRef, isTop && !askDiscard, mounted);

  /**
   * Closing runs through here so the exit animation actually gets to play.
   * The call sites mount these conditionally (`{open ? <Modal/> : null}`), so
   * if `onClose` fired immediately React would unmount the node mid-frame and
   * the dialog would vanish rather than leave.
   */
  const finishClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [closing, onClose]);

  const requestClose = useCallback(() => {
    if (closing) return;
    if (dirty) {
      setAskDiscard(true);
      return;
    }
    finishClose();
  }, [closing, dirty, finishClose]);

  // Escape belongs to the top-most dialog only. Without that check a confirm
  // opened over a form closed both at once, and the form's own unsaved-changes
  // guard never got to ask.
  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (askDiscard) {
        setAskDiscard(false);
        return;
      }
      requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isTop, askDiscard, requestClose]);

  /* ── Drag-to-dismiss, phone only ──
     A sheet that rose from the bottom edge but could only be dismissed by
     aiming at a 40px × in the far corner is the wrong shape for a thumb. */
  const dragState = useRef<{ startY: number; active: boolean; travelled: number }>({
    startY: 0,
    active: false,
    travelled: 0,
  });

  const onGrabStart = useCallback((e: React.PointerEvent) => {
    if (window.matchMedia("(min-width: 640px)").matches) return;
    dragState.current = { startY: e.clientY, active: true, travelled: 0 };
    setDragY(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onGrabMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active) return;
    // Downward only: dragging a sheet up past its natural top is not a gesture
    // that means anything, and the rubber-banding just looks broken.
    const dy = Math.max(0, e.clientY - dragState.current.startY);
    dragState.current.travelled = dy;
    setDragY(dy);
  }, []);

  const onGrabEnd = useCallback(() => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    const travelled = dragState.current.travelled;
    setDragY(null);
    if (travelled > 110) requestClose();
  }, [requestClose]);

  const dragHandleProps = useMemo(
    () => ({
      onPointerDown: onGrabStart,
      onPointerMove: onGrabMove,
      onPointerUp: onGrabEnd,
      onPointerCancel: onGrabEnd,
    }),
    [onGrabStart, onGrabMove, onGrabEnd],
  );

  const api = useMemo<ModalSurfaceApi>(
    () => ({ requestClose, dragHandleProps, titleId, descId }),
    [requestClose, dragHandleProps, titleId, descId],
  );

  if (!mounted) return null;

  const dragging = dragY !== null;

  const dialog = (
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center sm:items-center sm:p-6",
        closing ? "animate-backdrop-exit" : "animate-backdrop-enter",
      )}
      style={{ zIndex: z }}
      role="presentation"
      onMouseDown={(e) => {
        // mousedown, not click: a click fires when press and release land on
        // different elements, so dragging a text selection out of the dialog
        // and letting go over the backdrop used to close it and lose the form.
        if (e.target !== e.currentTarget) return;
        if (disableBackdropClose || askDiscard) return;
        requestClose();
      }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-[#1f1a23]/50 backdrop-blur-md",
          closing ? "animate-backdrop-exit" : "animate-backdrop-enter",
        )}
        aria-hidden
      />

      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : (labelledBy ?? titleId)}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={{
          zIndex: 1,
          transform: dragging ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-[#cfc2d6]/20 bg-white",
          "rounded-t-[32px] shadow-[0_-8px_60px_rgba(31,26,35,0.28)]",
          "sm:max-h-[90dvh] sm:rounded-[32px] sm:shadow-[0_34px_90px_rgba(31,26,35,0.28)]",
          width,
          closing ? "animate-sheet-exit sm:animate-modal-exit" : "animate-sheet-enter sm:animate-modal-enter",
          "focus:outline-none",
          className,
        )}
      >
        <ModalSurfaceContext.Provider value={api}>{children}</ModalSurfaceContext.Provider>

        {/* ── Discard guard ──
            Scoped to the dialog rather than thrown up as a `window.confirm`,
            which is unstyled, unpositioned, and on mobile arrives detached
            from the thing it is asking about. */}
        {askDiscard ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 p-6 backdrop-blur-sm animate-backdrop-enter">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="Discard changes?"
              className="w-full max-w-sm overflow-hidden rounded-[28px] border border-amber-200/60 bg-white shadow-[0_24px_60px_rgba(31,26,35,0.24)] animate-modal-enter"
            >
              <div className="flex items-start gap-3.5 border-b border-amber-200/50 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-600">Unsaved changes</p>
                  <h3 className="text-base font-black leading-tight text-[#1f1a23]">Discard them?</h3>
                </div>
              </div>
              <p className="px-5 py-4 text-sm font-semibold leading-relaxed text-ink">{dirtyMessage}</p>
              <div className="flex flex-col-reverse gap-2.5 border-t border-[#cfc2d6]/15 bg-[#faf7fc] px-5 py-3.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setAskDiscard(false)}
                  className="h-11 cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-5 text-sm font-bold text-ink transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf] active:scale-[0.98]"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAskDiscard(false);
                    finishClose();
                  }}
                  className="h-11 cursor-pointer rounded-2xl bg-rose-500 px-5 text-sm font-bold text-white shadow-lg shadow-rose-500/25 transition-all hover:bg-rose-600 active:scale-[0.98]"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Modal
 * ────────────────────────────────────────────────────────────────────────── */

export interface ModalProps {
  /** Shown in the header and used as the dialog's accessible name. */
  title: string;
  /** Small coloured label above the title — the section this dialog belongs to. */
  eyebrow?: string;
  /** One plain line under the title saying what the dialog is for. */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** A photo shown instead of the icon tile — used by the profile dialogs. */
  avatar?: ReactNode;
  /** Small status pills under the subtitle. */
  chips?: ReactNode;
  tone?: ModalTone;
  size?: ModalSize;
  /** Legacy shorthand for size="lg". */
  wide?: boolean;
  children: ReactNode;
  /** Pinned to the bottom, outside the scroll area. */
  footer?: ReactNode;
  /** Sits beside the close button, e.g. an Edit toggle. */
  headerActions?: ReactNode;
  onClose: () => void;
  /**
   * Holds typed-but-unsaved input. Closing then asks before discarding, instead
   * of silently throwing away a half-written form on a mistimed backdrop click.
   */
  dirty?: boolean;
  dirtyMessage?: string;
  /** Suppresses backdrop-click dismissal for a step the user must finish or cancel. */
  disableBackdropClose?: boolean;
  /** Hides the header close button — for a flow that owns its own exit. */
  hideClose?: boolean;
  className?: string;
  /** Applied to the scrolling body, e.g. to remove padding for a full-bleed table. */
  bodyClassName?: string;
  /**
   * `alertdialog` for a question that interrupts to prevent a mistake — it
   * makes a screen reader announce the body text on open rather than waiting
   * to be asked, which is the whole point of a confirm step.
   */
  role?: "dialog" | "alertdialog";
}

export function Modal({
  onClose,
  size,
  wide = false,
  dirty = false,
  dirtyMessage = "You have unsaved changes. Discard them?",
  disableBackdropClose = false,
  role = "dialog",
  className,
  ...chrome
}: ModalProps) {
  return (
    <ModalSurface
      onClose={onClose}
      size={size}
      wide={wide}
      dirty={dirty}
      dirtyMessage={dirtyMessage}
      disableBackdropClose={disableBackdropClose}
      role={role}
      className={className}
    >
      <ModalChrome {...chrome} />
    </ModalSurface>
  );
}

/** The standard header / scrolling body / pinned footer, inside a ModalSurface. */
function ModalChrome({
  title,
  eyebrow,
  subtitle,
  icon: Icon,
  avatar,
  chips,
  tone = "violet",
  children,
  footer,
  headerActions,
  hideClose = false,
  bodyClassName,
}: Omit<
  ModalProps,
  "onClose" | "size" | "wide" | "dirty" | "dirtyMessage" | "disableBackdropClose" | "role" | "className"
>) {
  const t = MODAL_TONES[tone];
  const { edges, bodyRef } = useScrollEdges([children]);
  const { requestClose, dragHandleProps, titleId, descId } = useModalSurface();

  return (
        <>
          {/* ── Pinned header ── */}
          <div
            {...dragHandleProps}
            className={cn(
              "relative shrink-0 overflow-hidden border-b bg-gradient-to-br px-5 pb-4 pt-3 sm:cursor-default sm:px-7 sm:pt-5",
              "touch-none sm:touch-auto",
              t.rule,
              t.wash,
            )}
          >
            <div
              className={cn("pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-gradient-to-bl to-transparent blur-3xl", t.orb)}
              aria-hidden
            />

            {/* The grab handle is the phone's affordance for "this can be pulled
                away", and it is the drag target. Desktop has a cursor and a
                close button, so it does not need one. */}
            <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-[#1f1a23]/15 sm:hidden" aria-hidden />

            <div className="relative flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3.5">
                {avatar ? (
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-white shadow-lg">
                    {avatar}
                  </span>
                ) : Icon ? (
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
                      t.tile,
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  {eyebrow ? (
                    <p className={cn("text-[11px] font-black uppercase tracking-wider", t.eyebrow)}>{eyebrow}</p>
                  ) : null}
                  {/* Wraps rather than truncates. `truncate` clipped the title
                      of any dialog whose question did not fit one line — the
                      leave withdrawal confirm read "Withdraw this leave re…",
                      losing the noun and the question mark, and an alertdialog
                      whose question is unreadable is the one place that cannot
                      happen. The header is not height-constrained, so a second
                      line costs nothing. */}
                  <h2 id={titleId} className="text-balance text-xl font-black leading-tight tracking-tight text-[#1f1a23] sm:text-2xl">
                    {title}
                  </h2>
                  {subtitle ? (
                    <p id={descId} className="mt-1 text-xs font-semibold leading-snug text-ink-muted">
                      {subtitle}
                    </p>
                  ) : null}
                  {chips ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div> : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {headerActions}
                {hideClose ? null : (
                  <button
                    type="button"
                    onClick={requestClose}
                    aria-label="Close dialog"
                    title="Close (Esc)"
                    className={cn(
                      "group/x flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-ink-subtle transition-all duration-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90 focus-visible:outline-none focus-visible:ring-4",
                      t.ring,
                    )}
                  >
                    <X className="h-5 w-5 transition-transform duration-300 group-hover/x:rotate-90" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Scrolling body, with a fade at whichever edge is cut off ──
              The panel is sized by `max-height`, not `height`, so there is no
              free space for `flex-grow` to hand out — the body has to be the
              child that *shrinks*. Hence `flex-1 min-h-0` on the scroller
              itself, in flow: the panel overflows its max-height, flex-shrink
              applies, `min-h-0` lets it shrink below its content, and it
              scrolls. An earlier attempt put `h-full` on the scroller inside a
              plain wrapper, which silently resolved to `auto` (percentages need
              a definite parent height) and let a long body paint over the
              pinned footer; making the wrapper's only child absolute instead
              collapsed the wrapper to zero. */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-white to-transparent transition-opacity duration-200",
                edges.top ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
            <div
              ref={bodyRef}
              className={cn("custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7", bodyClassName)}
            >
              {children}
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-200",
                edges.bottom ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
          </div>

          {/* ── Pinned footer ── */}
          {footer ? (
            <div className="shrink-0 border-t border-[#cfc2d6]/15 bg-[#faf7fc] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7 sm:pb-4">
              {footer}
            </div>
          ) : (
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)] sm:pb-0" />
          )}
        </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * ModalActions — the standard footer
 *
 * Every dialog footer was being rebuilt by hand, which is why some disabled the
 * primary action while saving and some did not, and why a form with a missing
 * required field usually reported it as a failed request instead of showing
 * what was missing.
 * ────────────────────────────────────────────────────────────────────────── */

export function ModalActions({
  busy = false,
  busyLabel,
  actionLabel,
  onCancel,
  onAction,
  cancelLabel = "Cancel",
  blockedReason,
  tone = "violet",
  secondary,
}: {
  busy?: boolean;
  busyLabel?: string;
  actionLabel: string;
  onCancel: () => void;
  onAction: () => void;
  cancelLabel?: string;
  /** Non-empty means the form is not ready: the action is disabled and this says why. */
  blockedReason?: string | null;
  tone?: "violet" | "rose" | "emerald";
  /** An extra low-emphasis action pinned to the left, e.g. "Save draft". */
  secondary?: ReactNode;
}) {
  const blocked = Boolean(blockedReason);
  const toneClass =
    tone === "rose"
      ? "bg-rose-500 hover:bg-rose-600 shadow-rose-500/25"
      : tone === "emerald"
        ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25"
        : "bg-[#8127cf] hover:bg-[#6a1fb0] shadow-[#8127cf]/25";

  return (
    <div className="space-y-2.5">
      {blocked ? (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {blockedReason}
        </p>
      ) : null}
      <div className="flex flex-col-reverse items-stretch gap-2.5 sm:flex-row sm:items-center sm:justify-end">
        {secondary ? <div className="sm:mr-auto">{secondary}</div> : null}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-12 cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-5 text-sm font-bold text-ink transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onAction}
          disabled={busy || blocked}
          className={cn(
            "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
            toneClass,
          )}
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
          {busy ? (busyLabel ?? actionLabel) : actionLabel}
        </button>
      </div>
    </div>
  );
}
