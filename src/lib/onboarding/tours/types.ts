import type { ConsoleId } from "@/lib/navigation/role-nav";

/** Copy for one string in [en, ar, ur], the convention of role-guide-copy.ts. */
export type Localized = readonly [en: string, ar: string, ur: string];

export const TOUR_IDS = [
  "owner", "super", "admin-school", "admin-campus", "principal", "teacher",
  "accountant", "receptionist", "librarian", "parent", "student",
] as const;
export type TourId = (typeof TOUR_IDS)[number];

export interface TourStep {
  id: string;
  /** data-tour value (desktop). */
  anchor: string;
  title: Localized;
  /** ONE sentence: what the control does (and who decides, where relevant). */
  body: Localized;
  placement?: "auto" | "top" | "bottom" | "start" | "end";
  /** Access keys; the step is skipped unless all are true. */
  requires?: string[];
  /** The step is skipped if any of these keys is true. */
  unless?: string[];
  /** View consoles: navigateConsoleView first. */
  view?: string;
  tab?: string;
  /** Path consoles: router.push first. */
  route?: string;
  /** Registry group id to open (automatic for shell.nav.<id> anchors). */
  revealGroup?: string;
  /** Default: shell.nav.<id> → shell.mobile.<id> when it is a mobile slot, else shell.mobile.more. */
  mobile?: { anchor?: string; skip?: boolean };
  interaction?: "none" | "try";
  /** Milliseconds to wait for the anchor before skipping the step (default 2500). Shorter for a control rendered only
   *  in some states (e.g. a Today card shown only while there is something to show), so its absence is not a pause. */
  waitMs?: number;
  /** The first variant whose access key is true replaces title and/or body. */
  variants?: { when: string; title?: Localized; body?: Localized }[];
}

export interface TourDef {
  id: TourId;
  version: number;
  console: ConsoleId;
  steps: TourStep[];
}

export type TourStatus = "done" | "dismissed";
export interface TourRecord { v: number; s: TourStatus; at: string }
export type TourProgress = Partial<Record<TourId, TourRecord>>;

/* ── Shared with the welcome story (SPEC §10.5). Dependency-free on purpose: FirstRunGuide is mounted in the root
   layout and LaunchGuide is loaded on demand, so both import these without pulling in the tour engine, the navigation
   registry, the tour copy or the translation catalogs. ── */
export const START_TOUR_EVENT = "skoolee:start-tour";
export const TOUR_STATE_EVENT = "skoolee:tour-state";
export const REVEAL_NAV_EVENT = "skoolee:reveal-nav";
export const WELCOME_FINISHED_EVENT = "skoolee:welcome-finished";
/** Help → "Replay welcome" (SPEC §4.2). The floating replay button is gone (M106); Help is the one way back in. */
export const REPLAY_WELCOME_EVENT = "skoolee:replay-welcome";

/** sessionStorage key for a tour handed over from a framed route (SPEC §9.1). */
export const pendingStartKey = (userId: string) => `skoolee.tour.pending.${userId}`;

/* Availability store: lets LaunchGuide offer "Show me around" only while a console tour can run (a mounted
   TourProvider that has a tour for the caller). */
let availableProviders = 0;
const availabilityListeners = new Set<() => void>();
export function subscribeTourAvailability(listener: () => void): () => void {
  availabilityListeners.add(listener);
  return () => { availabilityListeners.delete(listener); };
}
export function tourAvailableSnapshot(): boolean {
  return availableProviders > 0;
}
/** TourProvider only: +1 while it offers a tour, −1 when it stops. */
export function changeTourAvailability(delta: 1 | -1): void {
  availableProviders = Math.max(0, availableProviders + delta);
  availabilityListeners.forEach((listener) => listener());
}
