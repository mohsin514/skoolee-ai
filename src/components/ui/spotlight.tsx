"use client";

/**
 * Spotlight: dims and blurs everything except one control, rings it, and floats an explainer card beside it.
 *
 * Built from four fixed panels around the target rectangle (so the target itself is never blurred), a ring, and a
 * transparent blocker over the hole that stops clicks unless `interaction === "try"`. The card is the dialog:
 * `useDialogBehaviour` gives it the shared modal layer (z ≥ 1200, above the sidebar, chat dock and dropdowns), the
 * focus trap, Escape and the scroll lock. The page is not made inert: pointer input is blocked by the panels and the
 * hole blocker, keyboard focus is trapped in the card, and the card carries role="dialog" aria-modal="true".
 *
 * Below 768 px the card is a bottom sheet above the mobile navigation bar and the toaster's bottom offset, lifted
 * over any toast on screen (flipping to the top when the target sits in the lower half); the blur is dropped and the
 * dim deepens. Logical sides are converted with the document's computed direction (§9.2), so the card opens toward
 * the content on whichever side the sidebar sits. Reduced motion: no ring travel. Reduced transparency:
 * no backdrop filter. Forced colours: system Highlight ring and Canvas panels (globals.css, .sk-tour-*).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogBehaviour } from "@/components/ui/modal";
import { useLocale } from "@/components/locale/LocaleProvider";
import { documentDirection, placeFloating, type LogicalSide } from "@/components/ui/floating-surface";
import { cn } from "@/lib/utils";

export interface SpotlightProps {
  target: Element | null;
  padding?: number;
  interaction?: "none" | "try";
  onDismiss: () => void;
  children: ReactNode;
  placement?: LogicalSide | "auto";
  /** The next control is still being looked for: keep the dim, hold the card back (it stays focusable). */
  pending?: boolean;
  /** id of the card heading and body (aria-labelledby / aria-describedby on the dialog). */
  labelledBy?: string;
  describedBy?: string;
  className?: string;
}

type Box = { top: number; left: number; right: number; bottom: number; width: number; height: number };
type CardPlacement = { top: number; left: number; side: LogicalSide | "sheet-top" | "sheet-bottom"; arrow: number };

const MOBILE_QUERY = "(max-width: 767.98px)";
const subscribeMobile = (callback: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

function viewport() {
  return { width: document.documentElement.clientWidth, height: window.innerHeight };
}

/** The mobile bar height lives on the shell, not on <html>, and the overlay portals to <body> [K-m1]. */
function mobileNavHeight(): number {
  const shell = document.querySelector<HTMLElement>("[data-role-shell]");
  if (!shell) return 0;
  const value = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--mobile-nav-height"));
  return Number.isFinite(value) ? value : 0;
}

/** The toaster's phone offset (app-toaster.tsx `mobileOffset.bottom`: 74px + the safe-area inset), §9.6. */
const TOASTER_MOBILE_OFFSET = 74;
function safeAreaBottom(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom);
  probe.remove();
  return Number.isFinite(value) ? value : 0;
}

/** Top edge of the highest toast showing in the bottom stack, or null when none is on screen. */
function bottomToastTop(viewportHeight: number): number | null {
  let top: number | null = null;
  for (const toast of document.querySelectorAll<HTMLElement>("[data-sonner-toaster] [data-sonner-toast]")) {
    const rect = toast.getBoundingClientRect();
    if (rect.height === 0 || rect.bottom <= viewportHeight / 2) continue;
    top = top === null ? rect.top : Math.min(top, rect.top);
  }
  return top;
}

function paddedBox(target: Element, padding: number): Box | null {
  if (!target.isConnected) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const { width: vw, height: vh } = viewport();
  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const right = Math.min(vw, rect.right + padding);
  const bottom = Math.min(vh, rect.bottom + padding);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function Spotlight({ target, padding = 8, interaction = "none", onDismiss, children, placement = "auto", pending = false, labelledBy, describedBy, className }: SpotlightProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { z, mounted } = useDialogBehaviour(cardRef, { onClose: onDismiss });
  const { language } = useLocale();
  // The portal carries the locale's dir/lang (the card's own text); placement follows the document's computed
  // direction, which is what decides where the sidebar and the highlighted control actually sit.
  const dir = language === "en" ? "ltr" : "rtl";
  const [placementDir, setPlacementDir] = useState<"ltr" | "rtl">(dir);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCardState] = useState<CardPlacement | null>(null);
  // Re-placement runs on every observed change; only a real move re-renders.
  const setCard = useCallback((next: CardPlacement) => {
    setCardState((current) => current && current.top === next.top && current.left === next.left && current.side === next.side && current.arrow === next.arrow ? current : next);
  }, []);

  // The dialog behaviour focuses the first button; the tour card wants its heading first. Declared after the hook,
  // so this effect runs after the hook's own focus effect in the same commit.
  useEffect(() => {
    if (!mounted) return;
    cardRef.current?.querySelector<HTMLElement>("[data-spotlight-initial-focus]")?.focus({ preventScroll: true });
  }, [mounted]);

  const measure = useCallback(() => {
    setBox(target ? paddedBox(target, padding) : null);
  }, [target, padding]);

  // Re-measure on target resize, window resize and any scroll (capture phase catches nested scrollers), rAF-throttled.
  useLayoutEffect(() => {
    if (!mounted) return;
    measure();
    let frame = 0;
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; measure(); }); };
    const observer = typeof ResizeObserver !== "undefined" && target ? new ResizeObserver(schedule) : null;
    if (observer && target) observer.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mounted, target, measure]);

  // Place the card once its own size is known; follow it when the content (a longer Urdu line) changes size.
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!mounted || !element) return;
    let frame = 0;
    // Measured once per placement pass: the probe touches <body>, which the toast observer below watches.
    const safeArea = mobile ? safeAreaBottom() : 0;
    const place = () => {
      frame = 0;
      const size = { width: element.offsetWidth, height: element.offsetHeight };
      const view = viewport();
      if (mobile) {
        const lower = box ? (box.top + box.bottom) / 2 > view.height / 2 : false;
        if (lower) { setCard({ top: 8, left: 8, side: "sheet-top", arrow: 0 }); return; }
        // Clear of the navigation bar and of the toaster's offset, and lifted above a toast that is showing.
        const floor = view.height - Math.max(mobileNavHeight(), TOASTER_MOBILE_OFFSET + safeArea);
        const toastTop = bottomToastTop(view.height);
        const bottom = toastTop === null ? floor : Math.min(floor, toastTop);
        setCard({ top: Math.max(8, bottom - size.height - 8), left: 8, side: "sheet-bottom", arrow: 0 });
        return;
      }
      if (!box) {
        setCard({ top: Math.max(8, (view.height - size.height) / 2), left: Math.max(8, (view.width - size.width) / 2), side: "bottom", arrow: 0 });
        return;
      }
      const direction = documentDirection();
      setPlacementDir(direction);
      const placed = placeFloating(box, size, { side: placement, offset: 14, clamp: 8, dir: direction, viewport: view });
      setCard({ top: placed.top, left: placed.left, side: placed.side, arrow: placed.arrowOffset });
    };
    place();
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(place); };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    // Phones: a toast arriving or leaving moves the bottom sheet out of its way.
    const toasts = mobile ? new MutationObserver(schedule) : null;
    toasts?.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      toasts?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mounted, box, mobile, placement, dir, setCard]);

  if (!mounted) return null;

  const panel = "sk-tour-panel fixed bg-ink-strong/65 md:bg-ink-strong/50 md:backdrop-blur-md";
  const hole = box;
  const arrowSide = card && !mobile && hole ? card.side : null;
  const physical = arrowSide === "start" ? (placementDir === "rtl" ? "right" : "left") : arrowSide === "end" ? (placementDir === "rtl" ? "left" : "right") : arrowSide;

  return createPortal(
    <div data-spotlight-root dir={dir} lang={language} className={cn("sk-tour", className)}>
      {hole ? <>
        <div aria-hidden="true" className={panel} style={{ zIndex: z, top: 0, left: 0, width: "100vw", height: hole.top }} />
        <div aria-hidden="true" className={panel} style={{ zIndex: z, top: hole.bottom, left: 0, width: "100vw", bottom: 0 }} />
        <div aria-hidden="true" className={panel} style={{ zIndex: z, top: hole.top, left: 0, width: hole.left, height: hole.height }} />
        <div aria-hidden="true" className={panel} style={{ zIndex: z, top: hole.top, left: hole.right, right: 0, height: hole.height }} />
        <div aria-hidden="true" className="sk-tour-ring fixed rounded-[14px] motion-safe:transition-[top,left,width,height] motion-safe:duration-300 motion-safe:ease-out" style={{ zIndex: z + 1, top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
        {interaction === "none" ? <div aria-hidden="true" data-spotlight-hole className="fixed cursor-default" style={{ zIndex: z + 1, top: hole.top, left: hole.left, width: hole.width, height: hole.height }} /> : null}
      </> : <div aria-hidden="true" className={cn(panel, "inset-0")} style={{ zIndex: z }} />}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-side={card?.side}
        className={cn(
          "sk-tour-card fixed outline-none motion-safe:transition-[top,left,opacity] motion-safe:duration-300 motion-safe:ease-out",
          mobile ? "inset-x-2 mx-auto w-auto max-w-lg" : "w-[min(360px,calc(100vw-16px))]",
          // Opacity, not visibility: the heading must stay focusable while the card is being placed.
          (!card || pending) && "pointer-events-none opacity-0",
        )}
        style={{ zIndex: z + 2, top: card?.top ?? 0, ...(mobile ? {} : { left: card?.left ?? 0 }) }}
      >
        {physical && card ? <span
          aria-hidden="true"
          className="sk-tour-arrow absolute size-3 rotate-45"
          style={physical === "top" ? { bottom: -6, left: card.arrow - 6 }
            : physical === "bottom" ? { top: -6, left: card.arrow - 6 }
            : physical === "left" ? { right: -6, top: card.arrow - 6 }
            : { left: -6, top: card.arrow - 6 }}
        /> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
