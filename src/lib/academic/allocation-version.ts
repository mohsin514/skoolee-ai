// SKAI-1759: the teacher the editor saw, sent with a staffing save so the server can reject a stale page (409).
// undefined when the row is not loaded, so the server falls back to an unchecked save rather than a false conflict.
// SKAI-209: screens load either the scalar id or only the nested teacher, so read whichever is present.
type Person = { id: string } | null;
type StaffedClass = { id: string; classTeacherId?: string | null; classTeacher?: Person; subjects?: { id: string; teacherId?: string | null; teacher?: Person }[] };

export function currentClassTeacherId(classes: StaffedClass[] | null | undefined, classId: string) {
  const cls = classes?.find((row) => row.id === classId);
  return cls ? cls.classTeacherId ?? cls.classTeacher?.id ?? null : undefined;
}

export function currentSubjectTeacherId(classes: StaffedClass[] | null | undefined, subjectId: string) {
  for (const cls of classes ?? []) {
    const subject = cls.subjects?.find((row) => row.id === subjectId);
    if (subject) return subject.teacherId ?? subject.teacher?.id ?? null;
  }
  return undefined;
}
