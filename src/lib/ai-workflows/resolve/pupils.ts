import { prisma } from "@/lib/db/prisma";
import type { CapabilityContext } from "../registry/types";
import { InputRequired, type RequiredField } from "../errors";

/**
 * Binds the pupil names a user typed ("Ali", "زینب", "roll 12") to the roster of one class. Names
 * never go to the model as a list: the model copies the user's own words (masked, then unmasked), and
 * this resolver matches them here. A name with no match or several becomes a question with choices.
 */
export interface Pupil { id: string; fullName: string; nameUr: string | null; rollNo: string }

const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function classRoster(ctx: CapabilityContext, classId: string): Promise<Pupil[]> {
  return prisma.student.findMany({
    where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId ?? "", classId, status: "active", archivedAt: null },
    select: { id: true, fullName: true, nameUr: true, rollNo: true }, orderBy: { rollNo: "asc" },
  });
}

export function matchPupil(roster: readonly Pupil[], text: string): Pupil[] {
  const wanted = fold(text);
  if (!wanted) return [];
  const roll = wanted.match(/^(?:roll\s*(?:no\s*)?|رول\s*(?:نمبر\s*)?|#)?(\d{1,6})$/u)?.[1];
  if (roll) return roster.filter(pupil => fold(pupil.rollNo) === roll);
  const names = (pupil: Pupil) => [pupil.fullName, pupil.nameUr].filter((name): name is string => Boolean(name)).map(fold);
  const exact = roster.filter(pupil => names(pupil).includes(wanted));
  if (exact.length) return exact;
  // "Ali" matches "Ali Raza"; "Ali R" matches by prefix of each word.
  const parts = wanted.split(" ");
  return roster.filter(pupil => names(pupil).some(name => { const words = name.split(" "); return parts.every((part, index) => words[index]?.startsWith(part) || words.includes(part)); }));
}

export const pupilLabel = (pupil: Pupil) => `${pupil.fullName}${pupil.nameUr ? ` · ${pupil.nameUr}` : ""} · ${pupil.rollNo}`;

/** Resolves every reference or throws one InputRequired listing each unclear name with its choices. */
export function resolvePupils(roster: readonly Pupil[], refs: ReadonlyArray<{ pointer: string; text: string }>): Map<string, Pupil> {
  const bound = new Map<string, Pupil>(), unclear: RequiredField[] = [];
  for (const ref of refs) {
    const found = matchPupil(roster, ref.text);
    if (found.length === 1) bound.set(ref.pointer, found[0]);
    else unclear.push(found.length
      ? { pointer: ref.pointer, promptKey: "PUPIL_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(pupil => ({ value: pupil.rollNo, label: pupilLabel(pupil) })) }
      : { pointer: ref.pointer, promptKey: "PUPIL_NOT_FOUND" });
  }
  const ids = [...bound.values()].map(pupil => pupil.id);
  const twice = ids.find((id, index) => ids.indexOf(id) !== index);
  if (twice) unclear.push({ pointer: [...bound].find(([, pupil]) => pupil.id === twice)![0], promptKey: "PUPIL_TWICE" });
  if (unclear.length) throw new InputRequired(unclear);
  return bound;
}
