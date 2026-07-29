export type FeeTab = "overview" | "structures" | "invoices" | "payments" | "reports";

export interface FeeSummary {
  totalReceivable: number;
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  collectionRate: number;
  byClass: ClassCollection[];
  atRiskStudents: AtRiskStudent[];
  recentPayments?: RecentPayment[];
}

export interface ClassCollection {
  className: string;
  totalDue: number;
  totalPaid: number;
  collectionRate: number;
}

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  className: string;
  totalOverdue: number;
  daysOverdue: number;
  paymentStatus: string;
}

export interface RecentPayment {
  id: string;
  studentName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  receiptNo: string;
  invoiceNumber: string;
}

export interface FeeStructure {
  id: string;
  classId: string;
  campusId: string;
  monthlyFee: number;
  oneTimeFeesJson: Record<string, number> | null;
  installmentType: string | null;
  discountRulesJson: Record<string, number> | null;
  lateFeePercentage: number;
  compoundLateFee: boolean;
  taxPercentage: number;
  activeFrom: string;
  activeTo: string | null;
  createdAt: string;
  class: { id: string; name: string; section: string | null };
  campus: { id: string; name: string };
}

export interface Invoice {
  id: string;
  campusId: string;
  studentId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  monthlyFee: number;
  oneTimeFees: number;
  subtotal: number;
  discountAmount: number;
  lateFeeAmount: number;
  taxAmount: number;
  totalAmount: number;
  totalAmountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  student: { id: string; fullName: string; rollNo: string | null; class: { name: string; section: string | null } };
  payments?: PaymentRecord[];
}

export type InvoiceStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export interface PaymentRecord {
  id: string;
  campusId: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  receiptNo: string | null;
  recordedAt: string;
  student: { fullName: string; rollNo: string | null; class: { name: string; section: string | null } };
  invoice: { invoiceNumber: string; totalAmount: number; balanceDue: number; status: string };
}

export interface ClassOption {
  id: string;
  name: string;
  section: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DefaulterRecord {
  studentId: string;
  studentName: string;
  rollNo: string | null;
  className: string;
  section: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  totalDue: number;
  totalPaid: number;
  totalOverdue: number;
  daysOverdue: number;
  overdueInvoices: number;
}

export interface CollectionReport {
  className: string;
  totalStudents: number;
  totalDue: number;
  totalPaid: number;
  totalOverdue: number;
  collectionRate: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  total: number;
  percentage: number;
}
