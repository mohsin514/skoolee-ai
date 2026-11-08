/**
 * Tour registry and progress rules (pure; shared by TourProvider and /api/auth/tour).
 * One tour per console variant, versioned: bump `version` when the console changes enough to re-offer the tour.
 */
import { z } from "zod";
import { TOUR_IDS, type TourDef, type TourId, type TourProgress, type TourRecord, type TourStatus } from "./types";
import { superTour } from "./super";
import { adminSchoolTour } from "./admin-school";
import { adminCampusTour } from "./admin-campus";
import { principalTour } from "./principal";
import { teacherTour } from "./teacher";
import { accountantTour } from "./accountant";
import { receptionistTour } from "./receptionist";
import { librarianTour } from "./librarian";
import { parentTour } from "./parent";
import { studentTour } from "./student";
import { ownerTour } from "./owner";

export * from "./types";
export {
  tourForConsole, tourConsole, resolveTour, isConsoleLanding, isInsideConsole, startIndexFor, localize,
  writePendingStart, consumePendingStart, probeUnsavedWork, type StorageLike,
} from "./resolve";

export const TOURS: Record<TourId, TourDef> = {
  owner: ownerTour,
  super: superTour,
  "admin-school": adminSchoolTour,
  "admin-campus": adminCampusTour,
  principal: principalTour,
  teacher: teacherTour,
  accountant: accountantTour,
  receptionist: receptionistTour,
  librarian: librarianTour,
  parent: parentTour,
  student: studentTour,
};

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && (TOUR_IDS as readonly string[]).includes(value);
}

/** Stored progress never holds more keys than there are tours (≤ 32 by contract). */
export const MAX_PROGRESS_KEYS = 32;

/** POST /api/auth/tour body: a known tour, its version (never newer than the shipped one) and a final status. */
export const tourProgressInput = z.object({
  tourId: z.enum(TOUR_IDS),
  version: z.number().int().min(1),
  status: z.enum(["done", "dismissed"]),
}).strict().refine((input) => input.version <= TOURS[input.tourId].version, { message: "Unknown tour version", path: ["version"] });
export type TourProgressInput = z.infer<typeof tourProgressInput>;

/** Reads the stored JSON defensively: unknown ids and malformed entries are dropped. */
export function parseTourProgress(raw: unknown): TourProgress {
  const out: TourProgress = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isTourId(key) || !value || typeof value !== "object") continue;
    const { v, s, at } = value as Record<string, unknown>;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) continue;
    if (s !== "done" && s !== "dismissed") continue;
    out[key] = { v, s, at: typeof at === "string" ? at : new Date(0).toISOString() };
  }
  return out;
}

/**
 * Read-merge-write rule for the caller's own row. Returns the next stored object, or null when nothing changes
 * (same version and status already stored, or an older version posted after a newer one) — the POST stays idempotent.
 */
export function recordTourProgress(raw: unknown, input: { tourId: TourId; version: number; status: TourStatus }, now: Date): TourProgress | null {
  const current = parseTourProgress(raw);
  const existing = current[input.tourId];
  if (existing && (existing.v > input.version || (existing.v === input.version && existing.s === input.status))) return null;
  const next: TourProgress = { ...current, [input.tourId]: { v: input.version, s: input.status, at: now.toISOString() } satisfies TourRecord };
  if (Object.keys(next).length > MAX_PROGRESS_KEYS) return null;
  return next;
}

/** Auto-start once per (tourId, version): never seen, or seen at an older version. Dismissed at this version never auto-starts. */
export function shouldAutoStart(record: TourRecord | undefined, def: TourDef): boolean {
  return !record || record.v < def.version;
}

/**
 * Help dot (§9.5, §10.7 "stored version < current"): a re-offer only — the user finished or dismissed an older version
 * of this tour. A tour never seen has no dot: it auto-starts on the landing once the welcome story is done, and the
 * dot would otherwise be lit from the first sign-in, while the welcome is still waiting.
 */
export function hasNewTour(record: TourRecord | undefined, def: TourDef): boolean {
  return record !== undefined && record.v < def.version;
}
