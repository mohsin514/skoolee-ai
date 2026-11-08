/**
 * SKAI-148: the rules every class-setup write shares — seat capacity and
 * bulk creation from a grade range — so the API and both setup dialogs agree.
 */
import { ApiError } from "@/lib/api/scope";

export const MAX_CLASS_CAPACITY = 200;
export const MAX_GRADE_RANGE = 15;

/** Seats in a class: blank means "not set" (rollover warns, never assumes a number). */
export function parseClassCapacity(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const seats = Number(value);
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_CLASS_CAPACITY) {
    throw new ApiError(`Capacity must be a whole number from 1 to ${MAX_CLASS_CAPACITY}, or left blank.`, 400);
  }
  return seats;
}

/** A class cannot be given fewer seats than the students already enrolled in it. */
export function assertCapacityFitsEnrolled(capacity: number | null, enrolled: number) {
  if (capacity !== null && capacity < enrolled) {
    throw new ApiError(`${enrolled} students are enrolled, so capacity cannot be below ${enrolled}.`, 409);
  }
}

export type GradeRange = { prefix: string; from: number; to: number };

/** Reads `{ prefix, from, to }` from a request body; null when the body has no range. */
export function parseGradeRange(value: unknown): GradeRange | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw new ApiError("Give the grade range as a prefix with from and to grades.", 400);
  const raw = value as Record<string, unknown>;
  const prefix = typeof raw.prefix === "string" ? raw.prefix.trim().slice(0, 40) : "";
  const from = Number(raw.from), to = Number(raw.to);
  if (!prefix) throw new ApiError("A grade range needs a class name prefix, such as Grade.", 400);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) throw new ApiError("The last grade must be the same as or after the first grade.", 400);
  if (to - from + 1 > MAX_GRADE_RANGE) throw new ApiError(`A grade range can create at most ${MAX_GRADE_RANGE} grades at once.`, 400);
  return { prefix, from, to };
}

/** "Grade" 1–3 → Grade 1, Grade 2, Grade 3. */
export function gradeRangeNames(range: GradeRange): string[] {
  const names: string[] = [];
  for (let grade = range.from; grade <= range.to; grade++) names.push(`${range.prefix} ${grade}`);
  return names;
}
