"use client";

/**
 * `?view=` / `?tab=` state for a registry console (SPEC §10.2).
 *
 * - Old view ids (bookmarks, notifications, tests) resolve through `ROLE_NAV[id].aliases`; the URL is
 *   rewritten in place (replaceState) so Back does not bounce through the alias.
 * - Retired view ids land on the console's default view and expose `retiredNotice` (an EN UI key) for the
 *   landing view to show once.
 * - Unknown ids fall back to the default view (a forged `?view=` never selects anything).
 * - View changes use the public History API and dispatch `skoolee:workspace-view-change`, the same
 *   notification `useWorkspaceView` and the access provider already observe; no router round trip.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ROLE_NAV, consoleViews, type ConsoleId, type ViewTarget } from "@/lib/navigation/role-nav";
import { subscribeWorkspaceNavigation } from "@/components/nav/useWorkspaceView";

export const WORKSPACE_VIEW_CHANGE = "skoolee:workspace-view-change";

/** Shell-level params that survive a view change; everything else belongs to the view being left. */
const SHELL_PARAMS = ["settings", "lang"] as const;

const searchSnapshot = () => window.location.search;
const serverSearchSnapshot = () => "";

export interface ConsoleViewState {
  view: string;
  tab: string | null;
  setView(view: string, tab?: string | null): void;
  setTab(tab: string | null): void;
  retiredNotice: string | null;
}

type Resolved = { view: string; tab: string | null; rewrite: ViewTarget | null; retired: string | null };

/** Pure resolution of a search string against a console registry entry (exported for tests). */
export function resolveConsoleView(consoleId: ConsoleId, search: string): Resolved {
  const nav = ROLE_NAV[consoleId];
  const fallback = nav.defaultView ?? "";
  const params = new URLSearchParams(search);
  const requested = params.get("view");
  const tab = params.get("tab");
  if (!requested) return { view: fallback, tab, rewrite: null, retired: null };
  const alias = nav.aliases[requested];
  if (alias) return { view: alias.view, tab: alias.tab ?? tab, rewrite: alias, retired: null };
  if (Object.prototype.hasOwnProperty.call(nav.retired, requested)) {
    return { view: fallback, tab: null, rewrite: { view: fallback }, retired: nav.retired[requested] };
  }
  if (!consoleViews(consoleId).includes(requested)) return { view: fallback, tab: null, rewrite: null, retired: null };
  return { view: requested, tab, rewrite: null, retired: null };
}

function consoleHref(base: string, view: string, tab: string | null | undefined, keepFrom?: string): string {
  const current = new URLSearchParams(keepFrom ?? "");
  const next = new URLSearchParams();
  for (const key of SHELL_PARAMS) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  next.set("view", view);
  if (tab) next.set("tab", tab);
  return `${base}?${next.toString()}`;
}

function announce() {
  window.dispatchEvent(new Event(WORKSPACE_VIEW_CHANGE));
}

/**
 * Same as `setView`, usable outside React (the spotlight tour). When `opts.consoleId` names a console whose
 * base is not the current pathname, a native pushState would not render that route in Next 16, so the
 * caller's `opts.push` (router.push) is used instead.
 */
export function navigateConsoleView(view: string, tab?: string | null, opts?: { consoleId?: ConsoleId; push?: (href: string) => void }): void {
  if (typeof window === "undefined") return;
  const base = opts?.consoleId ? ROLE_NAV[opts.consoleId].base : window.location.pathname;
  const href = consoleHref(base, view, tab, window.location.search);
  if (window.location.pathname !== base) {
    if (opts?.push) opts.push(href);
    else window.location.assign(href);
    return;
  }
  if (`${window.location.pathname}${window.location.search}` === href) return;
  window.history.pushState(null, "", href);
  announce();
}

export function useConsoleView(consoleId: ConsoleId): ConsoleViewState {
  const search = useSyncExternalStore(subscribeWorkspaceNavigation, searchSnapshot, serverSearchSnapshot);
  const resolved = useMemo(() => resolveConsoleView(consoleId, search), [consoleId, search]);
  const [retiredNotice, setRetiredNotice] = useState<string | null>(null);

  // Rewrite aliases and retired ids in place so the address bar names the real view.
  useEffect(() => {
    if (!resolved.rewrite) return;
    if (resolved.retired) setRetiredNotice(resolved.retired);
    const base = ROLE_NAV[consoleId].base;
    if (window.location.pathname !== base) return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", resolved.rewrite.view);
    if (resolved.rewrite.tab) params.set("tab", resolved.rewrite.tab);
    else if (resolved.retired) params.delete("tab");
    window.history.replaceState(window.history.state, "", `${base}?${params.toString()}${window.location.hash}`);
    announce();
  }, [consoleId, resolved]);

  const setView = useCallback((view: string, tab?: string | null) => {
    setRetiredNotice(null);
    navigateConsoleView(view, tab, { consoleId });
  }, [consoleId]);

  const setTab = useCallback((tab: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (tab) params.set("tab", tab); else params.delete("tab");
    const query = params.toString();
    const href = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    window.history.replaceState(window.history.state, "", href);
    announce();
  }, []);

  return { view: resolved.view, tab: resolved.tab, setView, setTab, retiredNotice };
}
