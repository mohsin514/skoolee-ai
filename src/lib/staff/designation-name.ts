/**
 * A rank name is unique within a school (the `(school_id, name)` constraint on
 * staff designations). A duplicate write surfaces as Prisma's P2002, which the
 * routes map to a 409 with a plain explanation instead of a 500.
 */
export function isDuplicateDesignationName(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export function duplicateDesignationNameMessage(name: string): string {
  return `A rank called "${name}" already exists in this school. Pick a different name.`;
}
