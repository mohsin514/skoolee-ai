/**
 * SKAI-1249: pure plan (no DB access) for the richer synthetic QA academics seed —
 * classes, students, subjects + syllabus (curriculum), exams with schedules and marks,
 * a published timetable and a draft payroll run. All names and numbers are synthetic.
 */
export type ClassPlan = { name: string; section: string; capacity: number };
export type SubjectPlan = { name: string; code: string; topics: string[] };
export type ExamPlan = { title: string; term: string; examType: string; status: string; offsetDays: number };

export const ACADEMIC_CLASSES: ClassPlan[] = [
  { name: "Grade 5", section: "A", capacity: 30 },
  { name: "Grade 6", section: "A", capacity: 30 },
  { name: "Grade 7", section: "B", capacity: 30 },
];

export const STUDENTS_PER_CLASS = 6;

export const ACADEMIC_SUBJECTS: SubjectPlan[] = [
  { name: "English", code: "ENG", topics: ["Reading comprehension", "Grammar: tenses", "Creative writing"] },
  { name: "Mathematics", code: "MATH", topics: ["Fractions", "Decimals", "Geometry basics"] },
  { name: "Science", code: "SCI", topics: ["Living things", "Matter and energy", "Earth and space"] },
  { name: "Urdu اردو", code: "URD", topics: ["نثر", "نظم", "قواعد"] },
];

/** One exam already published (results visible), one upcoming in draft. */
export const ACADEMIC_EXAMS: ExamPlan[] = [
  { title: "QA Mid-Term", term: "TERM_1", examType: "MID_TERM", status: "PUBLISHED", offsetDays: -30 },
  { title: "QA Final", term: "TERM_2", examType: "FINAL", status: "DRAFT", offsetDays: 30 },
];

export const PERIODS = [
  { periodNumber: 1, startTime: "08:00", endTime: "08:40" },
  { periodNumber: 2, startTime: "08:40", endTime: "09:20" },
  { periodNumber: 3, startTime: "09:20", endTime: "10:00" },
  { periodNumber: 4, startTime: "10:20", endTime: "11:00" },
];
export const SCHOOL_DAYS = [1, 2, 3, 4, 5];

/** Monthly basic salary in paisa per seeded staff role. */
export const STAFF_SALARIES: Record<string, number> = { principal: 250_000_00, teacher: 120_000_00, accountant: 90_000_00 };

const FIRST = ["Ayesha", "Bilal", "Fatima", "Hamza", "Zainab", "Omar"];
const FIRST_UR = ["عائشہ", "بلال", "فاطمہ", "حمزہ", "زینب", "عمر"];

export function studentsFor(classIndex: number) {
  return Array.from({ length: STUDENTS_PER_CLASS }, (_, i) => ({
    // Roll numbers are unique per campus, so they carry the grade.
    rollNo: `QA${classIndex + 5}-${String(i + 1).padStart(2, "0")}`,
    admissionNo: `QA-${classIndex + 5}-${String(i + 1).padStart(3, "0")}`,
    fullName: `${FIRST[i]} QA${classIndex + 5}`,
    nameUr: `${FIRST_UR[i]} کیو اے`,
    gender: (i % 2 === 0 ? "FEMALE" : "MALE") as "FEMALE" | "MALE",
  }));
}

/** Round-robin subject per (day, period) so every subject appears each week. */
export function subjectIndexFor(day: number, period: number) {
  return (day + period) % ACADEMIC_SUBJECTS.length;
}

/** Deterministic synthetic mark out of 100 (40..97). */
export function markFor(studentIndex: number, subjectIndex: number) {
  return 40 + ((studentIndex * 17 + subjectIndex * 11) % 58);
}

export function previousMonth(now: Date) {
  const m = now.getUTCMonth(); // 0-based current month
  return m === 0 ? { month: 12, year: now.getUTCFullYear() - 1 } : { month: m, year: now.getUTCFullYear() };
}
