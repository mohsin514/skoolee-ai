/**
 * SKAI-1199 (SKO-166): pure plan for the synthetic "large class" QA fixture.
 * One class per QA school holding 100+ synthetic students, so roster, attendance,
 * marks entry, report cards and exports can be checked at realistic class sizes.
 * Names are synthetic EN / UR / AR mixes; no real student or guardian data.
 */
export const LARGE_CLASS_NAME = "QA Large Class";
export const LARGE_CLASS_SECTION = "L";
export const LARGE_CLASS_ROLL_PREFIX = "QAL-";
export const DEFAULT_LARGE_CLASS_SIZE = 120;
export const MAX_LARGE_CLASS_SIZE = 1000;

const GIVEN = ["Ali", "Ayesha", "Omar", "Fatima", "Hassan", "Zainab", "Bilal", "Maryam", "علی", "عائشة", "عمر", "فاطمہ"];
const FAMILY = ["Khan", "Ahmed", "Siddiqui", "Qureshi", "Malik", "الحسن", "رضا", "Raza with a deliberately long family name"];
const GENDERS = ["MALE", "FEMALE"] as const;

export type LargeClassStudent = { rollNo: string; admissionNo: string; fullName: string; gender: (typeof GENDERS)[number] };

export function parseSize(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_LARGE_CLASS_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 100 || n > MAX_LARGE_CLASS_SIZE) {
    throw new Error(`[qa-large-class] size must be an integer from 100 to ${MAX_LARGE_CLASS_SIZE}, got "${raw}"`);
  }
  return n;
}

/** Deterministic roster: same slug + size always gives the same rows, so reruns are idempotent. */
export function largeClassRoster(slug: string, size: number): LargeClassStudent[] {
  return Array.from({ length: size }, (_, i) => {
    const seq = String(i + 1).padStart(4, "0");
    const given = GIVEN[i % GIVEN.length];
    const family = FAMILY[Math.floor(i / GIVEN.length) % FAMILY.length];
    return {
      rollNo: `${LARGE_CLASS_ROLL_PREFIX}${seq}`,
      admissionNo: `${slug.toUpperCase()}-L${seq}`,
      fullName: `${given} ${family} ${seq}`,
      gender: GENDERS[i % 2 === 0 ? 0 : 1],
    };
  });
}
