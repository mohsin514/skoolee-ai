import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

/**
 * Every timetable writer fences the campus before reading bookings. A same-value
 * row write preserves campus metadata but changes its MVCC row version, forcing
 * a waiting SERIALIZABLE writer to restart with a fresh scheduling snapshot.
 * Acquire campus fences in sorted ID order if an operation spans campuses.
 */
export async function lockTimetableCampus(tx: TxClient, schoolId: string, campusId: string, allowArchivedCleanup = false): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`UPDATE campuses SET created_at=created_at WHERE id=${campusId} AND school_id=${schoolId} AND (archived_at IS NULL OR ${allowArchivedCleanup}) RETURNING id`;
  if (!rows.length) throw new ApiError("Campus not found or no longer active", 404);
}
