"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { IconButton } from "./icon-button";

/**
 * Lets one card fill the screen and come back. The card stays where it is in the tree (no remount, so its form and
 * scroll state survive); CSS lifts it over the page with a backdrop. Escape or the same button restores it, and
 * focus returns to the button that opened it.
 */
export function useMaximize<T extends HTMLElement>() {
  const [maximized, setMaximized] = React.useState(false);
  const ref = React.useRef<T>(null);
  const restoreFocus = React.useRef<HTMLElement | null>(null);

  const open = React.useCallback(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setMaximized(true);
  }, []);
  const close = React.useCallback(() => {
    setMaximized(false);
    window.requestAnimationFrame(() => restoreFocus.current?.focus());
  }, []);

  React.useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.dataset.cardMaximized = "";
    ref.current?.scrollTo?.({ top: 0 });
    return () => { window.removeEventListener("keydown", onKey); delete document.documentElement.dataset.cardMaximized; };
  }, [maximized, close]);

  return { ref, maximized, toggle: maximized ? close : open, close };
}

/** The backdrop behind a maximized card; a click on it restores the card. */
export function MaximizeBackdrop({ onClose }: { onClose: () => void }) {
  return <div aria-hidden="true" className="sk-max-backdrop" onClick={onClose} />;
}

export function MaximizeButton({ maximized, onToggle, className }: { maximized: boolean; onToggle: () => void; className?: string }) {
  const t = useUiText();
  return (
    <IconButton size="sm" variant="ghost" data-maximize-toggle label={maximized ? t("Restore") : t("Maximize")} aria-pressed={maximized}
      className={className} onClick={(event) => { event.stopPropagation(); onToggle(); }}>
      {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
    </IconButton>
  );
}
