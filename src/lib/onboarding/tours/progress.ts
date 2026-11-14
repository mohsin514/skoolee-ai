/**
 * Tour progress rules (pure; used by /api/auth/tour and re-exported by the tour registry).
 * Deliberately imports no tour definition and no `./resolve`: those pull in every Arabic and Urdu UI catalog, which
 * the progress route never needs. `TOUR_VERSIONS` must match `TOURS[id].version` (asserted in tests/tour).
 */
import { z } from "zod";
import { TOUR_IDS, type TourId, type TourProgress, type TourRecord, type TourStatus } from "./types";

/** Shipped version of each tour. Bump here and in the tour definition together to re-offer a tour. */
export const TOUR_VERSIONS: Record<TourId, number> = {
  owner: 1,
  super: 1,
  "admin-school": 1,
  "admin-campus": 1,
  principal: 1,
  teacher: 1,
  accountant: 1,
  receptionist: 1,
  librarian: 1,
  parent: 1,
  student: 1,
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
}).strict().refine((input) => input.version <= TOUR_VERSIONS[input.tourId], { message: "Unknown tour version", path: ["version"] });
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
