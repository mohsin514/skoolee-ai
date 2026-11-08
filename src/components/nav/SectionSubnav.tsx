"use client";

import { WorkspaceSubnav } from "./WorkspaceSubnav";
import type React from "react";
import { type ModuleTone } from "@/lib/ui/module-tones";

/** Shared local navigation; wraps without direction-dependent scroll controls. */
export interface SectionNavItem {
  view: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Short grouping label; a hairline is drawn wherever it changes. */
  group: string;
  tone: ModuleTone;
}

export function SectionSubnav({
  ariaLabel,
  items: allItems,
  active,
  onNavigate,
  allowed,
}: {
  /** Names the strip for screen readers — "Academics", "Staff", "Students". */
  ariaLabel: string;
  items: SectionNavItem[];
  active: string;
  onNavigate: (view: string) => void;
  /** Views this user may open. Anything left out is hidden, not disabled. */
  allowed?: (view: string) => boolean;
}) {
  const items = allowed ? allItems.filter((item) => allowed(item.view)) : allItems;
  return <WorkspaceSubnav label={ariaLabel} items={items.map((item) => ({ id: item.view, label: item.label }))} active={active} onSelect={onNavigate} />;
}
