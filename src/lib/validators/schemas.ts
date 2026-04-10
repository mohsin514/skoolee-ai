// ===========================================
// SkooleeAI - Zod Validation Schemas
// ===========================================

import { z } from "zod";

// ─── Tenant / Onboarding ───────────────────

export const onboardingSchema = z.object({
  schoolName: z.string().min(2, "School name must be at least 2 characters"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
});

// ─── Student ───────────────────────────────

export const studentSchema = z.object({
  registrationNo: z.string().min(1, "Registration number is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().email().optional().or(z.literal("")),
  guardianWhatsapp: z.string().optional(),
  address: z.string().optional(),
  classId: z.string().optional(),
});

export const bulkStudentSchema = z.object({
  students: z.array(studentSchema).min(1, "At least one student is required"),
});

// ─── Class ─────────────────────────────────

export const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  section: z.string().optional(),
  gradeLevel: z.coerce.number().int().min(1).max(12),
  academicYear: z.string().min(4, "Academic year is required"),
  teacherId: z.string().optional(),
  capacity: z.coerce.number().int().min(1).default(40),
});

// ─── Subject ───────────────────────────────

export const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().min(1, "Subject code is required"),
  description: z.string().optional(),
  maxMarks: z.coerce.number().int().min(1).default(100),
  passingMarks: z.coerce.number().int().min(0).default(33),
  isOptional: z.boolean().default(false),
});

// ─── Exam ──────────────────────────────────

export const examSchema = z.object({
  name: z.string().min(1, "Exam name is required"),
  type: z.enum(["MONTHLY", "MIDTERM", "FINAL", "UNIT_TEST", "CUSTOM"]),
  academicYear: z.string().min(4),
  term: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ─── Marks Entry ───────────────────────────

export const markEntrySchema = z.object({
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  examId: z.string().min(1),
  marksObtained: z.coerce.number().min(0),
  maxMarks: z.coerce.number().min(1).default(100),
});

export const bulkMarksSchema = z.object({
  marks: z.array(markEntrySchema).min(1, "At least one mark entry is required"),
});

// ─── AI Remarks ────────────────────────────

export const remarkRequestSchema = z.object({
  studentId: z.string().min(1),
  examId: z.string().min(1),
  language: z.enum(["en", "ur", "both"]),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("formal"),
});

export const batchRemarkRequestSchema = z.object({
  examId: z.string().min(1),
  studentIds: z.array(z.string()).min(1),
  language: z.enum(["en", "ur", "both"]),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("formal"),
});

// ─── Type exports from schemas ─────────────

export type OnboardingFormData = z.infer<typeof onboardingSchema>;
export type StudentFormData = z.infer<typeof studentSchema>;
export type ClassFormData = z.infer<typeof classSchema>;
export type SubjectFormData = z.infer<typeof subjectSchema>;
export type ExamFormData = z.infer<typeof examSchema>;
export type MarkEntryData = z.infer<typeof markEntrySchema>;
