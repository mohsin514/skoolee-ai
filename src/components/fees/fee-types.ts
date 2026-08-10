export type FeeTab = "overview" | "structures" | "invoices" | "payments" | "reports" | "accounts";

export type LayerTab = "types" | "groups" | "master" | "assign" | "discounts" | "carry" | "legacy";

export interface FeeTypeRow {
  id: string;
  campusId: string;
  name: string;
  code: string;
  description: string | null;
  _count?: { masters: number };
}

export interface FeeGroupRow {
  id: string;
  campusId: string;
  name: string;
  description: string | null;
  lines: MasterLineRow[];
  assignments: GroupAssignmentRow[];
}

export interface MasterLineRow {
  id: string;
  campusId: string;
  feeGroupId: string;
  feeTypeId: string;
  amount: number;
  dueDate: string | null;
  feeType?: { id: string; name: string; code: string };
  feeGroup?: { id: string; name: string };
}

export interface GroupAssignmentRow {
  id: string;
  campusId: string;
  feeGroupId: string;
  classId: string;
  academicYear: number;
  feeGroup?: { id: string; name: string };
  class?: { id: string; name: string; section: string | null };
}

export interface FeeDiscountRow {
  id: string;
  campusId: string;
  name: string;
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  assignments?: { id: string; studentId: string }[];
  _count?: { assignments: number };
}

export interface DiscountAssignmentRow {
  id: string;
  discountId: string;
  studentId: string;
  discount?: { id: string; name: string; code: string; type: string; value: number };
  student?: { id: string; fullName: string; rollNo: string | null };
}

export interface CarryForwardRow {
  id: string;
  campusId: string;
  studentId: string;
  fromAcademicYear: number;
  toAcademicYear: number;
  balance: number;
  note: string | null;
  student?: { id: string; fullName: string; rollNo: string | null };
}

export interface StudentLite {
  id: string;
  fullName: string;
  rollNo: string | null;
  classId?: string | null;
  class?: { id: string; name: string; section: string | null } | null;
}

export interface ResolvedFees {
  mode: "layers" | "legacy" | "none";
  academicYear: number;
  feeGroup?: { id: string; name: string } | null;
  legacyStructure?: { id: string; activeFrom: string } | null;
  lines: { id: string; typeName: string; typeCode: string; amount: number; dueDate: string | null }[];
  subtotal: number;
  flatDiscounts: { id: string; name: string; code: string; type: string; value: number; amount: number; source: string }[];
  percentDiscounts: { id: string; name: string; code: string; type: string; value: number; amount: number; source: string }[];
  totalDiscount: number;
  carryForwardBalance: number;
  payable: number;
  remainingCredit: number;
  carryForwardId?: string | null;
}


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
