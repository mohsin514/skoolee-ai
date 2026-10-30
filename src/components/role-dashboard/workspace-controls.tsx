"use client";

import { createContext, useCallback, useContext, useEffect, useState, type RefObject } from "react";
import { ArrowUp, Keyboard, Minimize2 } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Modal } from "@/components/ui/modal";

export type Density = "comfortable" | "compact";

const FOCUS_KEY = "skoolee.workspace.focus";
const DENSITY_KEY = "skoolee.workspace.density";

export interface WorkspacePrefs {
  focus: boolean;
  setFocus: (on: boolean) => void;
  density: Density;
  setDensity: (density: Density) => void;
  openShortcuts: () => void;
}

const noop = () => undefined;
export const WorkspacePrefsContext = createContext<WorkspacePrefs>({ focus: false, setFocus: noop, density: "comfortable", setDensity: noop, openShortcuts: noop });
export const useWorkspacePrefs = () => useContext(WorkspacePrefsContext);

const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* blocked storage keeps the session choice only */ } };

/** A keystroke typed into a field, or one meant for an open dialog, is never a workspace shortcut. */
export function isTypingOrInDialog(event: KeyboardEvent) {
  const el = event.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return true;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'));
}

/** Focus mode and density, remembered on this device. Ctrl/⌘ + . toggles focus, Escape leaves it, ? opens the shortcut sheet. */
export function useWorkspacePrefsState(): WorkspacePrefs & { shortcutsOpen: boolean; closeShortcuts: () => void } {
  const [focus, setFocusState] = useState(false);
  const [density, setDensityState] = useState<Density>("comfortable");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    setFocusState(read(FOCUS_KEY) === "1");
    setDensityState(read(DENSITY_KEY) === "compact" ? "compact" : "comfortable");
  }, []);

  const setFocus = useCallback((on: boolean) => { setFocusState(on); write(FOCUS_KEY, on ? "1" : "0"); }, []);
  const setDensity = useCallback((next: Density) => { setDensityState(next); write(DENSITY_KEY, next); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        if (isTypingOrInDialog(event)) return;
        event.preventDefault();
        setFocusState((current) => { write(FOCUS_KEY, current ? "0" : "1"); return !current; });
        return;
      }
      if (event.metaKey || event.ctrlKey || isTypingOrInDialog(event)) return;
      if (event.key === "?") { event.preventDefault(); setShortcutsOpen(true); return; }
      if (event.key === "Escape" && !document.querySelector("[data-maximized]")) {
        setFocusState((current) => { if (current) write(FOCUS_KEY, "0"); return false; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { focus, setFocus, density, setDensity, openShortcuts: () => setShortcutsOpen(true), shortcutsOpen, closeShortcuts: () => setShortcutsOpen(false) };
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** In focus mode the sidebar and header step aside; this small dock keeps the way back in reach. */
export function FocusDock({ onExit }: { onExit: () => void }) {
  const t = useUiText();
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => setMod(isMac() ? "⌘" : "Ctrl"), []);
  return (
    <div data-focus-dock role="region" aria-label={t("Focus mode")} className="sk-focus-dock">
      <span className="hidden text-xs font-semibold text-ink-muted sm:inline">{t("Focus mode")}</span>
      <span aria-hidden="true" className="sk-ai-fine-only items-center gap-1"><Kbd>{mod}</Kbd><Kbd>.</Kbd></span>
      <Button size="sm" variant="outline" onClick={onExit}><Minimize2 aria-hidden="true" />{t("Exit focus mode")}</Button>
    </div>
  );
}

/** Every keyboard shortcut in one place, opened with ? or from the account menu. */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const t = useUiText();
  const mod = isMac() ? "⌘" : "Ctrl";
  const rows: Array<[string[], string]> = [
    [[mod, "."], "Turn focus mode on or off"],
    [["Alt", "Shift", "["], "Collapse or expand the sidebar"],
    [["Alt", "Shift", "K"], "Find a workspace"],
    [["/"], "Filter the current list"],
    [["Esc"], "Close a dialog, restore a card or leave focus mode"],
    [["?"], "Show this list"],
  ];
  return (
    <Modal onClose={onClose} title={t("Keyboard shortcuts")} subtitle={t("Work faster without leaving the keyboard.")} icon={Keyboard} size="sm"
      footer={<Button onClick={onClose}>{t("Done")}</Button>}>
      <dl className="divide-y divide-border-subtle">
        {rows.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-ink">{t(label)}</dt>
            <dd dir="ltr" className="flex shrink-0 items-center gap-1">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/**
 * Watches whichever area inside the workspace scrolls (consoles own their scroll areas): the header slims while
 * reading downwards and returns on the way back up, and a Back to top button appears once you are well down a page.
 */
export function useWorkspaceScroll(ref: RefObject<HTMLElement | null>) {
  const [compactHeader, setCompactHeader] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const last = new WeakMap<HTMLElement, number>();
    const onScroll = (event: Event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el.closest("[role=dialog], [data-maximized]")) return;
      const top = el.scrollTop;
      const previous = last.get(el) ?? 0;
      last.set(el, top);
      if (top < 48) setCompactHeader(false);
      else if (top - previous > 6) setCompactHeader(true);
      else if (previous - top > 6) setCompactHeader(false);
      setTarget(top > 640 ? el : null);
    };
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => root.removeEventListener("scroll", onScroll, { capture: true });
  }, [ref]);
  const toTop = useCallback(() => {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }, [target]);
  return { compactHeader, showBackToTop: target !== null, toTop };
}

export function BackToTop({ onClick }: { onClick: () => void }) {
  const t = useUiText();
  return (
    <Button data-back-to-top variant="outline" size="sm" onClick={onClick} className="sk-back-to-top">
      <ArrowUp aria-hidden="true" />{t("Back to top")}
    </Button>
  );
}
