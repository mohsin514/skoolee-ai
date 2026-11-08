import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

/** SKAI-149: a subject code is 1–12 letters, digits or dashes, stored upper-case. Empty means "no code". */
export function normalizeSubjectCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError("Subject code must be text.", 400);
  const code = value.normalize("NFKC").trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new ApiError("Use up to 12 letters, digits or dashes for the subject code.", 400);
  return code;
}

const sameName = (a: string, b: string) => a.normalize("NFKC").trim().toLowerCase() === b.normalize("NFKC").trim().toLowerCase();

/** A code means one subject across the whole school: MATH cannot be Mathematics in one class and Music in another. */
export async function assertSubjectCodeFree(tx: TxClient, schoolId: string, code: string | null, name: string, exceptId?: string) {
  if (!code) return;
  const users = await tx.subject.findMany({ where: { schoolId, code: { equals: code, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true }, take: 20 });
  const clash = users.find(row => !sameName(row.name, name));
  if (clash) throw new ApiError(`Code ${code} is already used for ${clash.name} in this school.`, 409);
}

export type SubjectPackItem = { name: string; code: string; isElective?: boolean };
/** Starter curriculum packs for bulk add. Names stay in English; schools rename after adding. */
export const SUBJECT_PACKS: Record<string, { label: string; subjects: SubjectPackItem[] }> = {
  primary: {
    label: "Primary core",
    subjects: [
      { name: "English", code: "ENG" }, { name: "Mathematics", code: "MATH" }, { name: "Science", code: "SCI" },
      { name: "Social Studies", code: "SST" }, { name: "Art", code: "ART", isElective: true }, { name: "Physical Education", code: "PE", isElective: true },
    ],
  },
  secondary: {
    label: "Secondary core",
    subjects: [
      { name: "English", code: "ENG" }, { name: "Mathematics", code: "MATH" }, { name: "Physics", code: "PHY" }, { name: "Chemistry", code: "CHEM" },
      { name: "Biology", code: "BIO" }, { name: "Computer Science", code: "CS", isElective: true }, { name: "Economics", code: "ECO", isElective: true },
    ],
  },
};
