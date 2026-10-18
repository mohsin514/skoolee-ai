"use client";

/**
 * The one tooltip.
 *
 * Screens had been explaining icon-only controls with the native `title`
 * attribute, which never appears for keyboard or touch users, waits a full
 * second for a mouse, and renders in the operating system's own font. This
 * shows the same words on hover, on keyboard focus and on a long press, in
 * Skoolee's type, and it follows WCAG 1.4.13: Escape dismisses it without
 * moving focus, the pointer can travel onto it, and it stays until the
 * pointer or focus leaves.
 *
 * It is rendered in the top layer (`popover="manual"`) where the browser
 * supports it, so it is never clipped by a scroll container or painted under
 * a modal; older WebViews fall back to a fixed layer above the modal stack.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom";

export interface TooltipProps {
  /** What the tooltip says. Plain text is also exposed as the trigger's description. */
  content: React.ReactNode;
  /** One focusable element (Button, Link, IconButton…) that accepts a ref. */
  children: React.ReactElement;
  /** Preferred side; flips when there is no room. */
  side?: Side;
  /** Hover delay in ms. Keyboard focus shows immediately. */
  delay?: number;
  /**
   * Whether the content should also describe the trigger to assistive tech.
   * Pass `false` when the trigger's accessible name already says the same
   * thing (an icon button whose aria-label is the tooltip text).
   */
  describe?: boolean;
  /** A click toggles the tooltip as well (InfoTip, touch-first triggers). */
  toggleOnClick?: boolean;
  disabled?: boolean;
  className?: string;
}

const GAP = 8;
const EDGE = 8;
const supportsPopover = () => typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

type Handler<E> = ((event: E) => void) | undefined;
function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref && typeof ref === "object") (ref as React.MutableRefObject<T | null>).current = value;
}

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 300,
  describe = true,
  toggleOnClick = false,
  disabled = false,
  className,
}: TooltipProps) {
  const id = React.useId();
  const tooltipId = `sk-tooltip-${id.replace(/:/g, "")}`;
  const [open, setOpen] = React.useState(false);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const pinned = React.useRef(false);
  const longPress = React.useRef<number | undefined>(undefined);

  const clear = () => { if (timer.current !== undefined) window.clearTimeout(timer.current); timer.current = undefined; };
  const show = React.useCallback((after = 0) => {
    clear();
    if (disabled || content == null || content === "") return;
    if (after <= 0) { setOpen(true); return; }
    timer.current = window.setTimeout(() => setOpen(true), after);
  }, [disabled, content]);
  const hide = React.useCallback((after = 0) => {
    clear();
    if (after <= 0) { pinned.current = false; setOpen(false); return; }
    timer.current = window.setTimeout(() => { pinned.current = false; setOpen(false); }, after);
  }, []);

  React.useEffect(() => () => { clear(); if (longPress.current) window.clearTimeout(longPress.current); }, []);
  React.useEffect(() => { if (disabled) hide(); }, [disabled, hide]);

  // Resolve where to mount: inside the nearest dialog when the top layer is
  // available (so an "outside click" on the tooltip never closes the dialog),
  // otherwise the body, where a fixed position is not trapped by a transform.
  React.useLayoutEffect(() => {
    if (!open) return;
    const dialog = supportsPopover() ? triggerRef.current?.closest<HTMLElement>("[role=dialog],[role=alertdialog],dialog") : null;
    setContainer(dialog ?? document.body);
  }, [open]);

  const place = React.useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;
    const rect = trigger.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    let resolved: Side = side;
    let top = side === "top" ? rect.top - height - GAP : rect.bottom + GAP;
    if (side === "top" && top < EDGE) { resolved = "bottom"; top = rect.bottom + GAP; }
    else if (side === "bottom" && top + height > viewportHeight - EDGE) { resolved = "top"; top = rect.top - height - GAP; }
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, EDGE), Math.max(EDGE, viewportWidth - width - EDGE));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.dataset.side = resolved;
  }, [side]);

  React.useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!open || !tip || !container) return;
    if (supportsPopover() && tip.isConnected) {
      try { tip.showPopover(); } catch { /* already open or detached */ }
    }
    place();
    const onMove = () => window.requestAnimationFrame(place);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, container, place]);

  // Escape dismisses the tooltip first, without closing the dialog behind it.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      hide();
    };
    const onOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      hide();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [open, hide]);

  if (!React.isValidElement(children)) return children;
  const child = children as React.ReactElement<Record<string, unknown> & { ref?: React.Ref<HTMLElement> }>;
  const props = child.props;
  const plainText = typeof content === "string" || typeof content === "number" ? String(content) : undefined;
  const describedBy = describe
    ? plainText
      ? undefined
      : [props["aria-describedby"] as string | undefined, open ? tooltipId : undefined].filter(Boolean).join(" ") || undefined
    : (props["aria-describedby"] as string | undefined);

  const trigger = React.cloneElement(child, {
    ref: (node: HTMLElement | null) => { triggerRef.current = node; setRef(props.ref as React.Ref<HTMLElement> | undefined, node); },
    "aria-describedby": describedBy,
    ...(describe && plainText && !props["aria-description"] ? { "aria-description": plainText } : null),
    onPointerEnter: (event: React.PointerEvent) => {
      (props.onPointerEnter as Handler<React.PointerEvent>)?.(event);
      if (!event.defaultPrevented && event.pointerType !== "touch") show(delay);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      (props.onPointerLeave as Handler<React.PointerEvent>)?.(event);
      if (!event.defaultPrevented && event.pointerType !== "touch" && !pinned.current) hide(120);
    },
    onPointerDown: (event: React.PointerEvent) => {
      (props.onPointerDown as Handler<React.PointerEvent>)?.(event);
      if (event.defaultPrevented || event.pointerType !== "touch" || toggleOnClick) return;
      longPress.current = window.setTimeout(() => { pinned.current = true; show(); hide(1800); }, 450);
    },
    onPointerUp: (event: React.PointerEvent) => {
      (props.onPointerUp as Handler<React.PointerEvent>)?.(event);
      if (longPress.current) window.clearTimeout(longPress.current);
    },
    onFocus: (event: React.FocusEvent) => {
      (props.onFocus as Handler<React.FocusEvent>)?.(event);
      const element = event.currentTarget as HTMLElement;
      // Only keyboard focus: a mouse click already showed it on hover.
      if (!event.defaultPrevented && typeof element.matches === "function" && element.matches(":focus-visible")) show();
    },
    onBlur: (event: React.FocusEvent) => {
      (props.onBlur as Handler<React.FocusEvent>)?.(event);
      hide();
    },
    onClick: (event: React.MouseEvent) => {
      (props.onClick as Handler<React.MouseEvent>)?.(event);
      if (event.defaultPrevented) return;
      if (!toggleOnClick) { if (!pinned.current) hide(); return; }
      if (open && pinned.current) hide();
      else { pinned.current = true; show(); }
    },
  });

  return (
    <>
      {trigger}
      {open && container
        ? createPortal(
            <div
              ref={tipRef}
              id={tooltipId}
              role="tooltip"
              {...(supportsPopover() ? { popover: "manual" as const } : null)}
              className={cn("sk-tooltip", className)}
              onPointerEnter={() => clear()}
              onPointerLeave={() => { if (!pinned.current) hide(120); }}
            >
              {content}
            </div>,
            container,
          )
        : null}
    </>
  );
}

/**
 * A small "i" beside a label or heading that explains it. Hover or focus
 * shows the text; a tap toggles it, so it works on phones too.
 */
export function InfoTip({
  content,
  label,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  /** Accessible name; defaults to "More information". */
  label?: string;
  side?: Side;
  className?: string;
}) {
  const tr = useUiText();
  return (
    <Tooltip content={content} side={side} toggleOnClick>
      <button
        type="button"
        aria-label={label ?? tr("More information")}
        className={cn(
          "inline-grid size-6 shrink-0 place-items-center rounded-full align-middle text-ink-faint transition-colors duration-150 hover:bg-brand-50 hover:text-primary",
          className,
        )}
      >
        <Info aria-hidden="true" className="size-4" strokeWidth={2.25} />
      </button>
    </Tooltip>
  );
}
