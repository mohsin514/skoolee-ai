// SKAI-150: client-safe allocation rules (no server imports), shared by the teacher picker and the server.

/** A teacher with no recorded specialties, or a generalist, never triggers the warning. */
export function specialtyMatches(teacher: { subjectSpecialties: string[]; teachesAllSubjects: boolean } | undefined, subjectName: string | undefined) {
  if (!teacher || !subjectName || teacher.teachesAllSubjects || !teacher.subjectSpecialties.length) return true;
  const want = subjectName.normalize("NFKC").trim().toLowerCase();
  return teacher.subjectSpecialties.some(s => s.normalize("NFKC").trim().toLowerCase() === want);
}

/** Weekly teaching periods a full-time teacher can take: class periods per day × working days. Null when periods are not set up yet. */
export function weeklyPeriodCapacity(classPeriodsPerDay: number, weekendDays: number) {
  if (classPeriodsPerDay <= 0) return null;
  return classPeriodsPerDay * Math.max(0, 7 - weekendDays);
}
