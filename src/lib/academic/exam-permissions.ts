import { isCampusAdminRole } from "@/lib/roles";

/**
 * Exam ownership split:
 *  - Teachers run their own classroom assessments (quizzes, class tests).
 *  - Office staff (admin / principal) run the formal term exams that go on
 *    report cards and need a school-wide datesheet.
 */
export const TEACHER_EXAM_TYPES = ["QUIZ", "CLASS_TEST"] as const;
export const OFFICE_EXAM_TYPES = ["MID_TERM", "FINAL", "CUSTOM"] as const;
export const EXAM_TYPES = [...TEACHER_EXAM_TYPES, ...OFFICE_EXAM_TYPES] as const;

export type ExamType = (typeof EXAM_TYPES)[number];

/** Plain-language names shown to teachers and office staff. */
export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  QUIZ: "Quiz",
  CLASS_TEST: "Class Test",
  MID_TERM: "Mid-Term Exam",
  FINAL: "Final Exam",
  CUSTOM: "Special Exam",
};

/** Office roles schedule term exams and own the datesheet. */
export function isOfficeRole(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
}

/** Exam types this role is allowed to create or edit. */
export function allowedExamTypes(role: string): readonly ExamType[] {
  if (isOfficeRole(role)) return EXAM_TYPES;
  if (role === "TEACHER") return TEACHER_EXAM_TYPES;
  return [];
}

export function canManageExamType(role: string, examType: string): examType is ExamType {
  return (allowedExamTypes(role) as readonly string[]).includes(examType);
}

/** Only office staff put exams on the school datesheet (date + period + room). */
export function canScheduleExams(role: string) {
  return isOfficeRole(role);
}

/**
 * Rejection message for a teacher reaching for a term exam. Kept in one place so
 * the API and the UI say the same thing.
 */
export const TERM_EXAM_DENIED_MESSAGE =
  "Mid-term and final exams are scheduled by the school office. You can create quizzes and class tests for your own subjects.";
