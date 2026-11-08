"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { WorkspaceLaunchTab } from "./workspace-launchpad";
import { useWorkspaceDraftNavigation } from "./draft-safety";

/** Resolve saved/shared workflow links against this account's current capabilities. */
export function WorkspaceIntent({ permitted, onOpen }: { permitted: readonly WorkspaceLaunchTab[]; onOpen: (tab: WorkspaceLaunchTab, unavailable: boolean) => void }) {
  const searchParams = useSearchParams();
  const intent = searchParams.get("workflow");
  const guard = useWorkspaceDraftNavigation();
  const handled = useRef("");
  const permissions = permitted.join(",");
  useEffect(() => {
    if (!intent) { handled.current = ""; return; }
    const key = `${intent}:${permissions}`;
    if (handled.current === key) return;
    const frame = requestAnimationFrame(() => {
      handled.current = key;
      const allowed = permissions.split(",").includes(intent);
      guard(() => onOpen(allowed ? intent as WorkspaceLaunchTab : "overview", !allowed));
    });
    return () => cancelAnimationFrame(frame);
  }, [intent, permissions, guard, onOpen]);
  return null;
}

export function replaceWorkspaceIntent(tab?: WorkspaceLaunchTab) {
  const url = new URL(window.location.href);
  url.searchParams.delete("setup");
  if (tab) url.searchParams.set("workflow", tab);
  else url.searchParams.delete("workflow");
  // Native history integrates with useSearchParams without losing saved client state.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
