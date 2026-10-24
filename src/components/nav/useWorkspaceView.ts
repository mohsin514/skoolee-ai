'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { workspaceViewFromSearch, workspaceViewUrl } from '@/lib/navigation/workspace-view';

const WORKSPACE_VIEW_CHANGE = 'skoolee:workspace-view-change';
/** One notification source for the visible workspace and its access fence. */
export function subscribeWorkspaceNavigation(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener('pageshow', callback);
  window.addEventListener(WORKSPACE_VIEW_CHANGE, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('pageshow', callback);
    window.removeEventListener(WORKSPACE_VIEW_CHANGE, callback);
  };
}

/** Preserve local console sections through Back/Forward and refresh without refetching a route. */
export function useWorkspaceView<T extends string>(allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const snapshot = useCallback(() => workspaceViewFromSearch(window.location.search, allowed, fallback), [allowed, fallback]);
  // A stable server snapshot avoids guessing a browser query during hydration.
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const active = useSyncExternalStore(subscribeWorkspaceNavigation, snapshot, serverSnapshot);
  const setView = useCallback((next: T) => {
    const url = workspaceViewUrl(window.location.href, next, allowed);
    if (!url || snapshot() === next) return;
    // Use the public History API so existing router and navigation guards keep
    // observing navigation; never replace their wrappers or force a traversal.
    window.history.pushState(null, '', url);
    window.dispatchEvent(new Event(WORKSPACE_VIEW_CHANGE));
  }, [allowed, snapshot]);
  return [active, setView];
}
