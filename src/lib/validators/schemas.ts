// ===========================================
// SkooleeAI - Zod Validation Schemas
// Covers all 3 Flow Diagrams
// ===========================================

import { z } from "zod";

// ─── DIAGRAM 2: Registration Flow ─────────────────────────

// School Group path: School info
export const schoolGroupSchema = z.object({
  schoolName: z.string().min(2, "School name must be at least 2 characters"),
  city: z.string().min(2, "City is required"),
  contactEmail: z.string().email("Valid email required"),
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
});

// School Group path: First campus
export const firstCampusSchema = z.object({
  campusName: z.string().min(2, "Campus name is required"),
  campusCity: z.string().min(2, "City is required"),
  board: z.string().min(1, "Board is required"),
});

// School Group path: Owner password
export const ownerPasswordSchema = z.object({
  ownerName: z.string().min(2, "Full name required"),
  ownerEmail: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Standalone path: single form
export const standaloneCampusSchema = z.object({
  campusName: z.string().min(2, "Campus name is required"),
  city: z.string().min(2, "City is required"),
  board: z.string().min(1, "Board is required"),
  adminName: z.string().min(2, "Admin name required"),
  adminEmail: z.string().email("Valid email required"),
  password: z.string().min(8, "Minimum 8 characters"),
  confirmPassword: z.string(),
  logoUrl: z.string().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Onboarding: first class
export const firstClassSchema = z.object({
  name: z.string().min(1, "Class name required"),
  section: z.string().optional(),
  academicYear: z.coerce.number().int().min(2000).max(2100),
});

// Onboarding: teacher invite
export const teacherInviteSchema = z.object({
  email: z.string().email("Valid email required"),
  fullName: z.string().min(2, "Full name required"),
});

// Auth
export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

// Legacy combined onboarding (kept for existing routes)
export const onboardingSchema = z.object({
  schoolName: z.string().min(2, "School name must be at least 2 characters"),
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
});

// ─── DIAGRAM 3: Academic & Billing Flow ────────────────────

export const studentSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  rollNo: z.string().min(1, "Roll number required"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  classId: z.string().min(1, "Class required"),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  parentUserId: z.string().optional(),
});

export const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  section: z.string().optional(),
  academicYear: z.coerce.number().int().min(2000).max(2100),
  classTeacherId: z.string().optional(),
});

export const subjectSchema = z.object({
  name: z.string().min(1, "Subject name required"),
  classId: z.string().min(1, "Class required"),
  teacherId: z.string().optional(),
  totalMarks: z.coerce.number().int().min(1).default(100),
});

export const examSchema = z.object({
  title: z.string().min(1, "Exam title required"),
  term: z.string().min(1, "Term required"),
  classId: z.string().min(1, "Class required"),
  academicYear: z.coerce.number().int().min(2000).max(2100),
});

// Single mark entry
export const markEntrySchema = z.object({
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  examId: z.string().min(1),
  marksObtained: z.coerce.number().min(0),
});

// Bulk marks (teacher enters entire class)
export const bulkMarksSchema = z.object({
  examId: z.string().min(1),
  campusId: z.string().min(1),
  entries: z.array(z.object({
    studentId: z.string(),
    subjectId: z.string(),
    marksObtained: z.coerce.number().min(0),
  })).min(1),
});

// Exam lock (principal action)
export const lockExamSchema = z.object({
  examId: z.string().min(1),
  campusId: z.string().min(1),
});

// AI remarks generation
export const remarkRequestSchema = z.object({
  studentId: z.string().min(1),
  examId: z.string().min(1),
  campusId: z.string().min(1),
  language: z.enum(["en", "ur", "both"]).default("both"),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("encouraging"),
});

export const batchRemarkSchema = z.object({
  examId: z.string().min(1),
  campusId: z.string().min(1),
  language: z.enum(["en", "ur", "both"]).default("both"),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("encouraging"),
});

// Fee structure
export const feeStructureSchema = z.object({
  campusId: z.string().min(1),
  classId: z.string().min(1),
  term: z.string().min(1),
  tuitionMonthly: z.coerce.number().int().min(0),
  examFee: z.coerce.number().int().min(0).default(0),
  annualFee: z.coerce.number().int().min(0).default(0),
  monthsCount: z.coerce.number().int().min(1).default(1),
});

// Generate invoices for all students in a class/term
export const generateInvoicesSchema = z.object({
  campusId: z.string().min(1),
  classId: z.string().min(1),
  term: z.string().min(1),
  academicYear: z.coerce.number().int(),
  dueDate: z.string().min(1),
});

// Record a payment
export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amountPaid: z.coerce.number().int().min(1),
  method: z.enum(["CASH", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER"]),
  receiptNo: z.string().optional(),
});

// ─── Type exports ──────────────────────────────────────────
export type SchoolGroupFormData = z.infer<typeof schoolGroupSchema>;
export type FirstCampusFormData = z.infer<typeof firstCampusSchema>;
export type OwnerPasswordFormData = z.infer<typeof ownerPasswordSchema>;
export type StandaloneCampusFormData = z.infer<typeof standaloneCampusSchema>;
export type FirstClassFormData = z.infer<typeof firstClassSchema>;
export type TeacherInviteFormData = z.infer<typeof teacherInviteSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type OnboardingFormData = z.infer<typeof onboardingSchema>;
export type StudentFormData = z.infer<typeof studentSchema>;
export type ClassFormData = z.infer<typeof classSchema>;
export type SubjectFormData = z.infer<typeof subjectSchema>;
export type ExamFormData = z.infer<typeof examSchema>;
export type MarkEntryData = z.infer<typeof markEntrySchema>;
export type BulkMarksData = z.infer<typeof bulkMarksSchema>;
export type FeeStructureFormData = z.infer<typeof feeStructureSchema>;
export type PaymentFormData = z.infer<typeof paymentSchema>;
