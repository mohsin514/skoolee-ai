import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, DoorOpen, LayoutList, MessageSquareQuote, Radio, Sparkles, TrendingUp } from "lucide-react";
import type { AiWorkspaceRecord, WorkspaceCapabilities } from "@/lib/school-ai/types";
import type { StudioAction } from "@/lib/school-ai/studio-access";
import type { StudioShellCopy } from "@/lib/school-ai/exam-studio-copy-shell";
import type { Language } from "@/lib/locale/package";
import type { StudioScopeSelection } from "./studio-scope";

/**
 * The frozen seven-space registry.
 *
 * The design names seven connected spaces, and four shipping slices fill them in. If each slice
 * registered its own space, the registry would be edited seven times by seven authors and the
 * ordering, the rail and the permission mapping would drift. So all seven entries exist **now**,
 * in their recorded order, and each one names its own module under `./spaces/`. A later slice adds
 * exactly one file — `spaces/<module>.tsx` with a default export — and touches nothing here.
 *
 * **A space whose module has not landed degrades; it never crashes.** `loadStudioSpace` resolves
 * the module through a computed specifier, so a missing file is a rejected promise at runtime
 * rather than an unresolved import at build time, and the shell renders the clearly-labelled
 * not-yet-available state from `spaces/pending-space.tsx`. That is also why `pending-space.tsx`
 * lives inside `./spaces/`: it gives the directory a real member, so the bundler has a directory to
 * resolve against before any slice has added its own.
 *
 * This module is directive-free and holds no JSX. It is a table plus one loader, which keeps it
 * importable from a test and from a server-rendered path; the `"use client"` boundary is the
 * shell's.
 */

/** Stable identifiers. The rail, the URL fragment and the readiness roll-up all key off these. */
export const STUDIO_SPACE_IDS = ["brief", "blueprint", "review", "rehearsal", "exam-room", "control-room", "improve"] as const;
export type StudioSpaceId = (typeof STUDIO_SPACE_IDS)[number];

/** Everything a space receives. One shape, so the registry never grows per-space props. */
export interface StudioSpaceProps {
  language: Language;
  scope: StudioScopeSelection;
  capabilities: WorkspaceCapabilities;
  records: readonly AiWorkspaceRecord[];
  /** Re-reads the studio scope from the server. A space calls it after it writes. */
  reload: () => void;
  /** Opens one of the existing full editors behind the studio, for work a space links to rather than repeats. */
  openTool?: (tool: StudioTool) => void;
}

/** The existing workspace editors a space may hand over to. */
export type StudioTool = "sources" | "curriculum" | "examPlanning" | "history";

export type StudioSpaceComponent = ComponentType<StudioSpaceProps>;

export interface StudioSpaceEntry {
  id: StudioSpaceId;
  /** The file under `./spaces/`, without an extension. A later slice creates exactly this file. */
  module: string;
  /** Position in the rail, 1-based, matching the design's numbering. */
  position: number;
  icon: LucideIcon;
  nameKey: keyof StudioShellCopy;
  hintKey: keyof StudioShellCopy;
  /**
   * The authority this space stands on. The `empty` state names it as the next action and the
   * `permission` state names it as the permission required, both in words (R24.1, R24.5).
   */
  requires: StudioAction;
}

export const STUDIO_SPACES: readonly StudioSpaceEntry[] = Object.freeze([
  { id: "brief", module: "brief-space", position: 1, icon: Sparkles, nameKey: "briefSpace", hintKey: "briefHint", requires: "AUTHOR_ITEM" },
  { id: "blueprint", module: "blueprint-space", position: 2, icon: LayoutList, nameKey: "blueprintSpace", hintKey: "blueprintHint", requires: "AUTHOR_ITEM" },
  { id: "review", module: "review-desk", position: 3, icon: MessageSquareQuote, nameKey: "reviewSpace", hintKey: "reviewHint", requires: "AUTHOR_ITEM" },
  { id: "rehearsal", module: "rehearsal-space", position: 4, icon: ClipboardCheck, nameKey: "rehearsalSpace", hintKey: "rehearsalHint", requires: "RUN_REHEARSAL" },
  { id: "exam-room", module: "exam-room-space", position: 5, icon: DoorOpen, nameKey: "examRoomSpace", hintKey: "examRoomHint", requires: "APPROVE_VERSION" },
  { id: "control-room", module: "control-room-space", position: 6, icon: Radio, nameKey: "controlRoomSpace", hintKey: "controlRoomHint", requires: "READ_ACTIVE_ATTEMPT" },
  { id: "improve", module: "improve-space", position: 7, icon: TrendingUp, nameKey: "improveSpace", hintKey: "improveHint", requires: "READ_UNRELEASED_RESULT" },
] as const satisfies readonly StudioSpaceEntry[]);

export const studioSpace = (id: StudioSpaceId): StudioSpaceEntry => STUDIO_SPACES.find((entry) => entry.id === id) ?? STUDIO_SPACES[0];

/**
 * Loads a space's module, or resolves to `null` when that slice has not landed.
 *
 * The specifier is computed on purpose. A literal `import("./spaces/brief-space")` for a file that
 * does not exist yet is a build error, which would force every slice boundary to edit this file;
 * a computed specifier is resolved against the directory, so an absent module rejects at runtime
 * and the caller falls back. A module that exists but throws while evaluating is caught by the same
 * branch — the shell still renders, with that one space marked unavailable.
 */
export async function loadStudioSpace(entry: StudioSpaceEntry): Promise<StudioSpaceComponent | null> {
  try {
    const loaded = (await import(`./spaces/${entry.module}`)) as { default?: StudioSpaceComponent };
    return typeof loaded.default === "function" ? loaded.default : null;
  } catch {
    return null;
  }
}
