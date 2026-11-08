/**
 * SKAI-1480: the one lifecycle split shared by the student roster and its CSV export, so the
 * archived export lists exactly what the archived screen shows (consolidated aliases included).
 */
export const ARCHIVED_STUDENT_STATUSES = ["inactive", "archived", "transferred", "graduated", "consolidated"];

export const rosterStatusWhere = (archivedOnly: boolean) =>
  archivedOnly ? { status: { in: ARCHIVED_STUDENT_STATUSES } } : { status: { notIn: ARCHIVED_STUDENT_STATUSES } };

/** SKAI-1526: the one roster search, shared by the list and its CSV export (admission number and ID included). */
export const rosterSearchWhere = (search: string) => ({
  OR: (["id", "admissionNo", "fullName", "rollNo", "guardianName", "guardianPhone"] as const).map(field => ({ [field]: { contains: search, mode: "insensitive" as const } })),
});
