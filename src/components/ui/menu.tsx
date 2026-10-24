"use client";

/**
 * The one action menu: row overflow, PageHeader "More actions", the Help menu and the account menu.
 *
 * Screens had been hand-building dropdowns (absolute divs with their own outside-click, Escape and focus
 * rules), so some trapped Tab, some leaked Escape to the dialog underneath and none supported arrow keys.
 * This one is `role="menu"` with roving focus (↑/↓, Home/End, type-ahead), Escape closes it and returns
 * focus to the trigger without closing an enclosing dialog, Tab closes it, a click outside closes it, and
 * it opens toward the logical `start` or `end` so it mirrors in RTL. Items are built on `Button` (actions)
 * or `buttonVariants` on a `Link` (destinations), so they share the 44 px target and the focus token.
 *
 * A disabled item stays in the arrow-key order (WAI-ARIA menu pattern): it is `aria-disabled`, never natively
 * disabled, so keyboard and screen-reader users reach it, hear its label and its `description` (the reason,
 * wired as `aria-describedby`) and learn why it does nothing. Opening the menu still focuses the first item
 * that can act.
 */

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "./button";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** A second line under the label; for a disabled item, why it is unavailable. Announced as its description. */
  description?: string;
  /** Optional data-tour anchor for the item (e.g. the Help menu rows). */
  anchor?: string;
}

export interface MenuProps {
  trigger: React.ReactElement;
  items: Array<MenuItem | "separator">;
  /** Accessible name of the menu ("More actions", "Help", "Account"). EN UI key. */
  label: string;
  align?: "start" | "end";
  /** Optional heading block rendered above the items (account menu identity card). */
  header?: React.ReactNode;
  className?: string;
  /** Called whenever the menu opens or closes (header popovers close each other). */
  onOpenChange?: (open: boolean) => void;
}

const itemClass = "flex min-h-11 w-full items-start justify-start gap-3 rounded-xl px-3 py-2 text-start text-sm font-semibold";

export function Menu({ trigger, items, label, align = "end", header, className, onOpenChange }: MenuProps) {
  const t = useUiText();
  const [open, setOpenState] = React.useState(false);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const typeahead = React.useRef({ text: "", at: 0 });

  const setOpen = React.useCallback((next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const focusTrigger = React.useCallback(() => {
    anchorRef.current?.querySelector<HTMLElement>("button, a, [tabindex]")?.focus();
  }, []);

  // Every item, disabled ones included, takes part in roving focus and type-ahead.
  const focusableItems = React.useCallback(() => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []), []);

  React.useEffect(() => {
    if (!open) return;
    // Focus the first item that can act once the panel is in the DOM (a disabled first item is still reachable).
    const frame = window.requestAnimationFrame(() => {
      const list = focusableItems();
      (list.find((item) => item.getAttribute("aria-disabled") !== "true") ?? list[0])?.focus();
    });
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("pointerdown", onPointer); };
  }, [open, focusableItems, setOpen]);

  const close = (returnFocus = true) => { setOpen(false); if (returnFocus) focusTrigger(); };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const list = focusableItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    switch (event.key) {
      case "ArrowDown": move(index + 1); return;
      case "ArrowUp": move(index - 1); return;
      case "Home": move(0); return;
      case "End": move(list.length - 1); return;
      case "Escape":
        // Marked handled so an enclosing Modal (document listener) keeps its own layer open.
        event.preventDefault(); event.stopPropagation(); close(); return;
      case "Tab": setOpen(false); return;
      default:
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          const now = Date.now();
          const state = typeahead.current;
          state.text = now - state.at > 600 ? event.key.toLocaleLowerCase() : state.text + event.key.toLocaleLowerCase();
          state.at = now;
          const match = list.find((item) => (item.textContent ?? "").trim().toLocaleLowerCase().startsWith(state.text));
          match?.focus();
        }
    }
  };

  const triggerProps = trigger.props as { onClick?: (event: React.MouseEvent) => void; onKeyDown?: (event: React.KeyboardEvent) => void };
  const triggerElement = React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: (event: React.MouseEvent) => { triggerProps.onClick?.(event); if (!event.defaultPrevented) setOpen(!open); },
    onKeyDown: (event: React.KeyboardEvent) => {
      triggerProps.onKeyDown?.(event);
      if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); }
    },
  });

  return (
    <span ref={anchorRef} className={cn("relative inline-flex", className)}>
      {triggerElement}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t(label)}
          onKeyDown={onKeyDown}
          className={cn(
            "animate-dropdown-enter sk-panel absolute top-full z-[999] mt-2 max-h-[70dvh] w-[min(18rem,calc(100vw-24px))] overflow-y-auto p-1.5 shadow-lg",
            align === "end" ? "end-0" : "start-0",
          )}
        >
          {header}
          {items.map((item, index) => {
            if (item === "separator") return <div key={`separator-${index}`} role="separator" className="my-1 h-px bg-border-subtle" />;
            const Icon = item.icon;
            const danger = item.tone === "danger";
            // The label names the item and the description is announced separately (not run into the name).
            const labelId = `${menuId}-${item.id}-label`;
            const descriptionId = item.description ? `${menuId}-${item.id}-description` : undefined;
            const content = (
              <>
                {Icon ? <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", danger ? "text-destructive" : "text-ink-muted")} /> : null}
                <span className="min-w-0 flex-1">
                  <span id={labelId} className="block [overflow-wrap:anywhere]">{t(item.label)}</span>
                  {item.description ? <span id={descriptionId} className="mt-0.5 block text-xs font-normal leading-snug text-ink-muted">{t(item.description)}</span> : null}
                </span>
              </>
            );
            const className = cn(itemClass, danger ? "text-destructive" : "text-ink");
            if (item.href && !item.disabled) {
              return (
                <Link key={item.id} href={item.href} role="menuitem" tabIndex={-1} data-tour={item.anchor} aria-labelledby={labelId} aria-describedby={descriptionId} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), className)} onClick={() => { item.onSelect?.(); close(false); }}>
                  {content}
                </Link>
              );
            }
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="sm"
                role="menuitem"
                tabIndex={-1}
                data-tour={item.anchor}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                // Never natively disabled: a disabled item must stay focusable so its reason can be heard.
                aria-disabled={item.disabled || undefined}
                className={cn(className, item.disabled && "cursor-not-allowed opacity-60")}
                onClick={() => { if (item.disabled) return; close(true); item.onSelect?.(); }}
              >
                {content}
              </Button>
            );
          })}
        </div>
      )}
    </span>
  );
}
