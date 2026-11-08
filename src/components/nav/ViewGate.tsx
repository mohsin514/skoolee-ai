"use client";

/**
 * Access reads for code rendered inside RoleShell (SPEC §10.2). The provider lives in RoleShell, so console
 * pages call these inside the shell's children. Presentation only: every API keeps its own server gate.
 */

import { useCallback, type ReactNode } from "react";
import { ROLE_NAV, findLeaf, leafVisible, type ConsoleId } from "@/lib/navigation/role-nav";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { AccessNotice } from "@/components/ui/access-notice";

export const DEFAULT_DENIED_REASON = "This workspace is not available with your current access.";

export function useConsoleAccess(): { ready: boolean; has(key: string): boolean; leafVisible(consoleId: ConsoleId, viewOrLeafId: string): boolean } {
  const access = useNavigationAccess();
  const ready = access.status === "ready";
  const map = access.access ?? null;
  const has = useCallback((key: string) => map?.[key] === true, [map]);
  const visible = useCallback((consoleId: ConsoleId, viewOrLeafId: string) => {
    if (!ready || !map) return false;
    const leaf = findLeaf(consoleId, viewOrLeafId);
    // A view the registry does not list is not a nav destination; its own server gate decides.
    if (!leaf) return true;
    return leafVisible(ROLE_NAV[consoleId], leaf, map);
  }, [ready, map]);
  return { ready, has, leafVisible: visible };
}

/** Renders `children` only when the view's registry leaf is visible; otherwise the leaf's AccessNotice. */
export function ViewGate({ console: consoleId, view, children }: { console: ConsoleId; view: string; children: ReactNode }) {
  const access = useConsoleAccess();
  if (!access.ready) return <></>;
  if (access.leafVisible(consoleId, view)) return <>{children}</>;
  const leaf = findLeaf(consoleId, view);
  return <AccessNotice reason={leaf?.deniedReason ?? DEFAULT_DENIED_REASON} />;
}
