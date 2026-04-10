// ===========================================
// SkooleeAI - Core Type Definitions
// ===========================================

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "PARENT";
export type PlanType = "FREE" | "BASIC" | "PRO";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED";
export type StudentStatus = "ACTIVE" | "INACTIVE" | "GRADUATED" | "TRANSFERRED";
export type ExamType = "MONTHLY" | "MIDTERM" | "FINAL" | "UNIT_TEST" | "CUSTOM";
export type ExamStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "PUBLISHED";
export type ReportCardStatus = "DRAFT" | "GENERATED" | "SENT";
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

// ─── Student ───────────────────────────────────────────

export interface Student {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | null;
  gender?: Gender | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  guardianWhatsapp?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  classId?: string | null;
  status: StudentStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Class ─────────────────────────────────────────────

export interface Class {
  id: string;
  name: string;
  section?: string | null;
  gradeLevel: number;
  academicYear: string;
  teacherId?: string | null;
  capacity: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Subject ───────────────────────────────────────────

export interface Subject {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  maxMarks: number;
  passingMarks: number;
  isOptional: boolean;
  createdAt: Date;
}

// ─── Exam ──────────────────────────────────────────────

export interface Exam {
  id: string;
  name: string;
  type: ExamType;
  academicYear: string;
  term?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status: ExamStatus;
  createdAt: Date;
}

// ─── Marks ─────────────────────────────────────────────

export interface Mark {
  id: string;
  studentId: string;
  subjectId: string;
  examId: string;
  marksObtained: number;
  maxMarks: number;
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
  studentId: string;
  examId: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade?: string | null;
  rank?: number | null;
  overallRemarkEn?: string | null;
  overallRemarkUr?: string | null;
  pdfUrl?: string | null;
  status: ReportCardStatus;
  sentVia?: "WHATSAPP" | "EMAIL" | "BOTH" | null;
  sentAt?: Date | null;
  createdAt: Date;
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
  price: number;
  features: string[];
  aiCredits: number;
  maxStudents: number;
  maxTeachers: number;
  whatsappEnabled: boolean;
  pdfBulkExport: boolean;
}
