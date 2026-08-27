import { isCampusAdminRole } from "@/lib/roles";

/**
 * Exam ownership split.
 *
 *  - Teachers run their own classroom assessments (quizzes, class tests).
 *  - Office staff (admin / principal) run the formal term exams that go on
 *    report cards and need a school-wide datesheet.
 *
 * §80 tightened the office half. The admin console used to offer every type,
 * so an admin could create a quiz — which then sat on the exam board next to
 * the mid-terms, needing a date sheet and a seating plan it would never have,
 * and pulling the board's counts away from the thing the office actually runs.
 * A quiz is a teacher's tool; the office schedules mid-terms and finals.
 */
export const TEACHER_EXAM_TYPES = ["QUIZ", "CLASS_TEST"] as const;

/** What the office may create today. */
export const OFFICE_EXAM_TYPES = ["MID_TERM", "FINAL"] as const;

/**
 * Types that exist in data but are no longer offered anywhere.
 *
 * Schools created these before §80, and their marks and report cards are real.
 * They stay readable, gradeable and publishable — they simply cannot be
 * created again.
 */
export const LEGACY_EXAM_TYPES = ["CUSTOM"] as const;

export const EXAM_TYPES = [
  ...TEACHER_EXAM_TYPES,
  ...OFFICE_EXAM_TYPES,
  ...LEGACY_EXAM_TYPES,
] as const;

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

/** Exam types this role may create. Legacy types are never creatable. */
export function allowedExamTypes(role: string): readonly ExamType[] {
  if (isOfficeRole(role)) return OFFICE_EXAM_TYPES;
  if (role === "TEACHER") return TEACHER_EXAM_TYPES;
  return [];
}

/**
 * Exam types this role may edit or move along the pipeline.
 *
 * Wider than `allowedExamTypes` on purpose: the office has to be able to
 * review, lock and publish a legacy CUSTOM exam, and a teacher whose class
 * test predates §80 must still be able to finish marking it.
 */
export function manageableExamTypes(role: string): readonly ExamType[] {
  if (isOfficeRole(role)) return EXAM_TYPES;
  if (role === "TEACHER") return TEACHER_EXAM_TYPES;
  return [];
}

export function canManageExamType(role: string, examType: string): examType is ExamType {
  return (manageableExamTypes(role) as readonly string[]).includes(examType);
}

export function canCreateExamType(role: string, examType: string): examType is ExamType {
  return (allowedExamTypes(role) as readonly string[]).includes(examType);
}

/**
 * Rejection message for a teacher reaching for a term exam. Kept in one place so
 * the API and the UI say the same thing.
 */
export const TERM_EXAM_DENIED_MESSAGE =
  "Mid-term and final exams are scheduled by the school office. You can create quizzes and class tests for your own subjects.";

/** The mirror image: an office user reaching for a classroom assessment. */
export const CLASSROOM_EXAM_DENIED_MESSAGE =
  "Quizzes and class tests belong to teachers, who create them for their own subjects. The office schedules mid-term and final exams.";
