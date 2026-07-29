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

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional().nullable()
).optional();

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().email().optional().nullable()
).optional();

export const studentSchema = z.object({
  fullName: optionalText,
  firstName: optionalText,
  lastName: optionalText,
  nameUr: optionalText,
  rollNo: optionalText,
  registrationNo: optionalText,
  dateOfBirth: optionalText,
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
  bloodType: z.enum(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]).optional().nullable(),
  nationality: optionalText,
  phone: optionalText,
  guardianName: optionalText,
  guardianNameUr: optionalText,
  guardianPhone: optionalText,
  guardianEmail: optionalEmail,
  guardianWhatsapp: optionalText,
  guardianRelationship: z.enum(["father", "mother", "uncle", "aunt", "sibling", "other"]).optional().nullable(),
  guardianOccupation: optionalText,
  studentEmail: optionalEmail,
  address: optionalText,
  city: optionalText,
  province: optionalText,
  postalCode: optionalText,
  medicalNotes: optionalText,
  specialNeeds: optionalText,
  allergies: optionalText,
  medications: optionalText,
  previousSchool: optionalText,
  classId: z.string().min(1, "Class is required"),
}).superRefine((data, ctx) => {
  const fullName = data.fullName || [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
  const rollNo = data.rollNo || data.registrationNo;

  if (!fullName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fullName"],
      message: "Student name is required",
    });
  }

  if (!rollNo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rollNo"],
      message: "Roll number is required",
    });
  }
}).transform((data) => ({
  fullName: data.fullName || [data.firstName, data.lastName].filter(Boolean).join(" ").trim(),
  nameUr: data.nameUr || null,
  rollNo: data.rollNo || data.registrationNo || "",
  dateOfBirth: data.dateOfBirth || null,
  gender: data.gender || "OTHER",
  bloodType: data.bloodType || null,
  nationality: data.nationality || null,
  phone: data.phone || null,
  guardianName: data.guardianName || null,
  guardianNameUr: data.guardianNameUr || null,
  guardianPhone: data.guardianPhone || null,
  guardianEmail: data.guardianEmail || null,
  guardianWhatsapp: data.guardianWhatsapp || null,
  guardianRelationship: data.guardianRelationship || null,
  guardianOccupation: data.guardianOccupation || null,
  studentEmail: data.studentEmail || null,
  address: data.address || null,
  city: data.city || null,
  province: data.province || null,
  postalCode: data.postalCode || null,
  medicalNotes: data.medicalNotes || null,
  specialNeeds: data.specialNeeds || null,
  allergies: data.allergies || null,
  medications: data.medications || null,
  previousSchool: data.previousSchool || null,
  classId: data.classId,
}));

export const bulkStudentSchema = z.object({
  students: z.array(studentSchema),
});


export const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  section: optionalText,
  gradeLevel: z.coerce.number().int().min(1).max(12).default(1),
  academicYear: z.coerce.number().int().min(2000).max(2100),
  teacherId: z.string().optional(),
  classTeacherId: z.string().optional(),
  capacity: z.coerce.number().int().min(1).default(40),
});

export const subjectSchema = z.object({
  name: z.string().min(1, "Subject name required"),
  code: z.string().optional(),
  description: optionalText,
  classId: z.string().min(1, "Class required"),
  teacherId: z.string().optional(),
  totalMarks: z.coerce.number().int().min(1).default(100),
  maxMarks: z.coerce.number().int().min(1).default(100),
  passingMarks: z.coerce.number().int().min(0).default(33),
  isOptional: z.boolean().default(false),
});

export const attendanceSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  date: z.string().min(1, "Date is required"),
  entries: z.array(z.object({
    studentId: z.string().min(1),
    status: z.enum(["PRESENT", "ABSENT", "LEAVE"]),
  })).min(1, "At least one attendance entry is required"),
});

export const examSchema = z.object({
  title: z.string().min(1, "Exam title required"),
  term: z.string().min(1, "Term required"),
  classId: z.string().min(1, "Class required"),
  academicYear: z.coerce.number().int().min(2000).max(2100),
  examType: z.enum(["QUIZ", "CLASS_TEST", "MID_TERM", "FINAL", "CUSTOM"]).optional().default("CLASS_TEST"),
  subjectId: z.string().optional(),
});

export const examStatusSchema = z.object({
  id: z.string().min(1, "Exam id required"),
  status: z.enum(["DRAFT", "ACTIVE", "MARKS_ENTRY", "PRINCIPAL_REVIEWED", "PUBLISHED"]),
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
  campusId: z.string().min(1).optional(),
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
  campusId: z.string().min(1).optional(),
  language: z.enum(["en", "ur", "both"]).default("both"),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("encouraging"),
});

export const batchRemarkSchema = z.object({
  examId: z.string().min(1),
  campusId: z.string().min(1).optional(),
  language: z.enum(["en", "ur", "both"]).default("both"),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("encouraging"),
});

export const aiFeatureRequestSchema = z.object({
  feature: z.enum([
    "generate_remarks",
    "rewrite_remark",
    "translate_remark",
    "weak_topics",
    "homework_suggestions",
    "lesson_plan",
    "at_risk_students",
    "class_performance_summary",
    "teacher_class_comparison",
    "intervention_suggestions",
    "pending_review_queue",
    "campus_comparison",
    "weak_campuses",
    "ai_usage_by_campus",
    "fee_recovery_insights",
    "academic_trend_summary",
    "explain_report_card",
    "study_plan",
    "school_faq",
  ]),
  campusId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
  examId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  reportCardId: z.string().min(1).optional(),
  tone: z.enum(["formal", "encouraging", "constructive"]).optional(),
  targetLanguage: z.enum(["en", "ur"]).optional(),
  text: z.string().max(5000).optional(),
  question: z.string().max(1000).optional(),
  topic: z.string().max(500).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

export const reportActionSchema = z.object({
  examId: z.string().min(1),
  action: z.enum(["generate", "pdf", "review", "publish", "send"]),
});

export const reportRemarkSchema = z.object({
  remarksEn: z.string().optional().nullable(),
  remarksUr: z.string().optional().nullable(),
  approve: z.boolean().optional(),
});

// Fee structure
export const feeStructureSchema = z.object({
  campusId: z.string().optional(),
  classId: z.string().min(1),
  monthlyFee: z.coerce.number().int().min(0),
  oneTimeFeesJson: z.string().optional(),
  installmentType: z.enum(["11-month", "6-month", "quarterly", "one-time"]).optional(),
  discountRulesJson: z.string().optional(),
  lateFeePercentage: z.coerce.number().min(0).max(100).default(2.0),
  compoundLateFee: z.boolean().default(true),
  taxPercentage: z.coerce.number().min(0).max(100).default(0.0),
  activeFrom: z.string().min(1),
  activeTo: z.string().optional(),
});

// Generate invoices
export const generateInvoicesSchema = z.object({
  campusId: z.string().optional(),
  classId: z.string().optional(),
  generationMonth: z.string().min(1),
  includeLateFees: z.boolean().default(true),
});

// Invoice generation job poll
export const generationJobSchema = z.object({
  jobId: z.string().min(1),
});

// Record a payment
export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().int().min(1),
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(["cash", "bank_transfer", "card", "mobile_wallet", "cheque"]),
  referenceNumber: z.string().optional(),
});

// Bank import
export const bankImportSchema = z.object({
  accountName: z.string().min(1),
  statementFrom: z.string().min(1),
  statementTo: z.string().min(1),
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
export type ExamStatusData = z.infer<typeof examStatusSchema>;
export type AttendanceFormData = z.infer<typeof attendanceSchema>;
export type MarkEntryData = z.infer<typeof markEntrySchema>;
export type BulkMarksData = z.infer<typeof bulkMarksSchema>;
export type FeeStructureFormData = z.infer<typeof feeStructureSchema>;
export type PaymentFormData = z.infer<typeof paymentSchema>;
export type GenerateInvoicesFormData = z.infer<typeof generateInvoicesSchema>;
export type BankImportFormData = z.infer<typeof bankImportSchema>;
