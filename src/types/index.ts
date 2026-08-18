// ===========================================
// SkooleeAI - Core Type Definitions
// ===========================================

import type { UserRole } from "@/lib/roles";

export type { UserRole } from "@/lib/roles";
export type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED";
export type StudentStatus = "ACTIVE" | "INACTIVE" | "GRADUATED" | "TRANSFERRED";
export type ExamType = "MONTHLY" | "MIDTERM" | "FINAL" | "UNIT_TEST" | "CUSTOM";
export type ExamStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "PUBLISHED";
export type ReportCardStatus = "DRAFT" | "GENERATED" | "REVIEWED" | "PUBLISHED" | "SENT";
export type NotificationType = "WHATSAPP" | "EMAIL" | "SMS";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "DELIVERED" | "READ";
export type Gender = "MALE" | "FEMALE" | "OTHER";

// ─── Tenant ────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  schemaName: string;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: TenantStatus;
  plan: PlanType;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

// Central MVP models mirror prisma/schema.prisma and should be the default
// data contract for new dashboard work. Tenant-schema types remain below only
// where legacy /dashboard routes still need them.

export interface School {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: PlanType;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  city: string;
  address?: string | null;
  regId: string;
  contactEmail: string;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  establishedYear?: number | null;
  tagline?: string | null;
  createdAt: Date;
}

export interface Campus {
  id: string;
  schoolId: string;
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  principalName?: string | null;
  regId: string;
  board?: string | null;
  logoUrl?: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  campusId?: string | null;
  schoolId: string;
  email: string;
  username?: string | null;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  isActive: boolean;
  onboardingComplete: boolean;
  createdAt: Date;
}

// ─── Student ───────────────────────────────────────────

export interface Student {
  id: string;
  campusId?: string;
  classId?: string | null;
  parentUserId?: string | null;
  fullName?: string;
  rollNo?: string;
  phone?: string | null;
  registrationNo?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date | null;
  gender?: Gender | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  guardianWhatsapp?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  status?: StudentStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─── Class ─────────────────────────────────────────────

export interface Class {
  id: string;
  campusId?: string;
  name: string;
  section?: string | null;
  classTeacherId?: string | null;
  gradeLevel?: number;
  academicYear: number | string;
  teacherId?: string | null;
  capacity?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─── Subject ───────────────────────────────────────────

export interface Subject {
  id: string;
  campusId?: string;
  classId?: string;
  name: string;
  code?: string;
  description?: string | null;
  teacherId?: string | null;
  totalMarks?: number;
  maxMarks?: number;
  passingMarks?: number;
  isOptional?: boolean;
  createdAt?: Date;
}

// ─── Exam ──────────────────────────────────────────────

export interface Exam {
  id: string;
  campusId?: string;
  classId?: string;
  title?: string;
  name?: string;
  type?: ExamType;
  academicYear: number | string;
  term?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  isLocked?: boolean;
  lockedBy?: string | null;
  lockedAt?: Date | null;
  status?: ExamStatus;
  createdAt?: Date;
}

// ─── Marks ─────────────────────────────────────────────

export interface Mark {
  id: string;
  campusId?: string;
  studentId: string;
  subjectId: string;
  examId: string;
  marksObtained: number;
  maxMarks?: number;
  grade?: string | null;
  remarks?: string | null;
  aiRemarkEn?: string | null;
  aiRemarkUr?: string | null;
  enteredBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Report Card ───────────────────────────────────────

export interface ReportCard {
  id: string;
  campusId?: string;
  studentId: string;
  examId: string;
  totalMarks?: number;
  obtainedMarks?: number;
  percentage?: number;
  grade?: string | null;
  rank?: number | null;
  remarksEn?: string | null;
  remarksUr?: string | null;
  overallRemarkEn?: string | null;
  overallRemarkUr?: string | null;
  pdfUrl?: string | null;
  isSent?: boolean;
  status?: ReportCardStatus;
  sentVia?: "WHATSAPP" | "EMAIL" | "BOTH" | null;
  sentAt?: Date | null;
  generatedAt?: Date;
  createdAt?: Date;
}

export interface Attendance {
  id: string;
  campusId: string;
  studentId: string;
  date: Date;
  status: "PRESENT" | "ABSENT" | "LEAVE";
  markedBy?: string | null;
}

export interface Invoice {
  id: string;
  campusId: string;
  studentId: string;
  term: string;
  academicYear: number;
  totalAmount: number;
  dueDate: Date;
  status: "PENDING" | "PAID" | "PARTIAL" | "CANCELLED";
  challanUrl?: string | null;
  generatedAt: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  receiptNo?: string | null;
  paidAt: Date;
  recordedBy?: string | null;
}

// ─── API Response Types ────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── AI Remark Types ───────────────────────────────────

export interface AIRemarkRequest {
  studentName: string;
  className: string;
  subjects: {
    name: string;
    marksObtained: number;
    maxMarks: number;
    grade: string;
  }[];
  language: "en" | "ur" | "both";
  tone?: "formal" | "encouraging" | "constructive";
}

export interface AIRemarkResponse {
  remarkEn?: string;
  remarkUr?: string;
  tokensUsed: number;
  model?: string;
  promptVersion?: string;
}

export interface AIInsight {
  id: string;
  schoolId: string;
  campusId?: string | null;
  userId: string;
  role: UserRole | string;
  feature: string;
  action: string;
  title: string;
  summary: string;
  output?: unknown;
  promptVersion: string;
  model: string;
  tokensUsed: number;
  approvalStatus: string;
  status: string;
  createdAt: Date;
}

// ─── Dashboard Analytics ───────────────────────────────

export interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  recentExams: Exam[];
  topStudents: {
    student: Student;
    percentage: number;
  }[];
  classPerformance: {
    className: string;
    averagePercentage: number;
    totalStudents: number;
  }[];
}

// ─── Stripe / Billing ──────────────────────────────────

export interface PlanDetails {
  type: PlanType;
  name: string;
  price: number | null;
  priceLabel: string;
  stripePriceEnv?: string;
  stripeAnnualPriceEnv?: string;
  isCustom?: boolean;
  features: string[];
  aiCredits: number;
  maxStudents: number;
  maxTeachers: number;
  maxCampuses: number;
  whatsappEnabled: boolean;
  pdfExportEnabled: boolean;
  pdfBulkExport: boolean;
  analyticsEnabled: boolean;
}
