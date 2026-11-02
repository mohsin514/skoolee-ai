/** SKAI-1622: the class teacher or any subject teacher of the exam's class. */
export function teachesExamClass(cls: { classTeacherId: string | null; subjects: { teacherId: string | null }[] }, userId: string) {
  return cls.classTeacherId === userId || cls.subjects.some(s => s.teacherId === userId);
}
