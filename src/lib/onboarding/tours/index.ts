/**
 * Tour registry and progress rules (pure; shared by TourProvider and /api/auth/tour).
 * One tour per console variant, versioned: bump `version` (here in the definition and in
 * progress.ts TOUR_VERSIONS) when the console changes enough to re-offer the tour.
 */
import type { TourDef, TourId, TourRecord } from "./types";
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
  TOUR_VERSIONS, isTourId, MAX_PROGRESS_KEYS, tourProgressInput, parseTourProgress, recordTourProgress, type TourProgressInput,
} from "./progress";
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
