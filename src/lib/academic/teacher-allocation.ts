import { ApiError } from "@/lib/api/scope";
import { specialtyMatches } from "./teacher-load";

export { specialtyMatches, weeklyPeriodCapacity } from "./teacher-load";

/** SKAI-150: pure teacher-allocation rules shared by the picker, the availability route and the bulk allocate route. */
export const MAX_BULK_ALLOCATIONS = 200;

export type AllocationRequest = { subjectId: string; teacherId: string | null; expectedTeacherId?: string | null };
export type AllocationWarning = { subjectId: string; teacherId: string; code: "OFF_SPECIALTY" | "AT_LOAD_LIMIT"; message: string };

export function parseAllocations(value: unknown): AllocationRequest[] {
  if (!Array.isArray(value) || !value.length) throw new ApiError("Choose at least one subject to allocate.", 400);
  if (value.length > MAX_BULK_ALLOCATIONS) throw new ApiError(`Allocate at most ${MAX_BULK_ALLOCATIONS} subjects at a time.`, 400);
  const id = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 128;
  const rows = value.map((row): AllocationRequest => {
    if (!row || typeof row !== "object" || !id((row as AllocationRequest).subjectId)) throw new ApiError("Each allocation needs a subject.", 400);
    const { subjectId, teacherId, expectedTeacherId } = row as AllocationRequest;
    if (teacherId !== null && !id(teacherId)) throw new ApiError("Each allocation needs a teacher, or null to remove one.", 400);
    if (expectedTeacherId !== undefined && expectedTeacherId !== null && !id(expectedTeacherId)) throw new ApiError("A valid current teacher is required.", 400);
    return { subjectId, teacherId, ...(expectedTeacherId !== undefined ? { expectedTeacherId } : {}) };
  });
  if (new Set(rows.map(r => r.subjectId)).size !== rows.length) throw new ApiError("Each subject can be allocated once per request.", 400);
  return rows;
}

/** Optimistic concurrency: the caller states the teacher it saw; another saved teacher means a newer edit won. */
export function assertTeacherCurrent(expected: string | null | undefined, current: string | null) {
  if (expected === undefined) return;
  if ((expected ?? null) !== current) throw new ApiError("This subject's teacher changed since you opened the page. Reload to see the latest allocation, then try again.", 409);
}

/** Load and specialty warnings for a planned set of allocations. Warnings never block; clashes are blocked by timetable validation. */
export function allocationWarnings(
  plan: { subjectId: string; subjectName: string; teacherId: string | null; scheduledPeriods: number; currentTeacherId: string | null }[],
  teachers: Map<string, { fullName: string; subjectSpecialties: string[]; teachesAllSubjects: boolean; weeklyPeriods: number }>,
  capacity: number | null,
) {
  const warnings: AllocationWarning[] = [];
  const added = new Map<string, number>();
  for (const row of plan) {
    if (!row.teacherId || row.teacherId === row.currentTeacherId) continue;
    added.set(row.teacherId, (added.get(row.teacherId) ?? 0) + row.scheduledPeriods);
  }
  for (const row of plan) {
    const teacher = row.teacherId ? teachers.get(row.teacherId) : undefined;
    if (!teacher || row.teacherId === row.currentTeacherId) continue;
    if (!specialtyMatches(teacher, row.subjectName)) warnings.push({ subjectId: row.subjectId, teacherId: row.teacherId!, code: "OFF_SPECIALTY", message: `${teacher.fullName} is not a ${row.subjectName} specialist` });
    const load = teacher.weeklyPeriods + (added.get(row.teacherId!) ?? 0);
    if (capacity !== null && load > capacity) warnings.push({ subjectId: row.subjectId, teacherId: row.teacherId!, code: "AT_LOAD_LIMIT", message: `${teacher.fullName} would teach ${load} of ${capacity} weekly periods` });
  }
  return warnings;
}
