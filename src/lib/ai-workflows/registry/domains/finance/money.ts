import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { canManageFinance, soleChecker } from "@/lib/api/scope";
import { getLocalePackage } from "@/lib/locale/store";
import { formatMoney, parseMoney } from "@/lib/locale/package";
import { invoiceMonthDates } from "@/lib/school-ai/fee-invoices";
import { splitEvenly, validatePlan } from "@/lib/fees/installments";
import { schoolToday } from "@/lib/fees/statement";
import { ADJUSTMENT_KINDS } from "@/lib/fees/adjustments-service";
import { moneySeparationRequired, openPreparedCollections } from "@/lib/fees/collect-command";
import type { PermissionAction, PermissionModule } from "@/lib/permissions";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles, seatVacantForOperator } from "../../gates";
import { InputRequired, WorkflowError } from "../../../errors";
import { assignedClass } from "../../../resolve/scope";
import { classRoster, matchPupil, pupilLabel, type Pupil } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, HandoffPrepared } from "../../types";

/**
 * Money hand-offs for the finance desk (Slice 5, rule 5 / T5). Money never moves from AI: collecting a
 * payment, adjustments, invoice runs, payment plans, tax sign-off, bank statement commits, reconciliation
 * posting and payroll runs are all class C. Each one binds the records the user named (a pupil by name plus
 * the month, a staged statement, a pending reconciliation, a payroll month), checks what the domain would
 * refuse, and opens the existing screen with a prefill for the person who applies it. Nothing here writes a
 * money row: the screen's own route does, under its own guards.
 *
 * - Separation of duties: when the campus Delivery Policy requires a second person, the hand-off goes to an
 *   eligible colleague, never the requester; adjustments, plans, tax and payroll name the domain's own
 *   checker (requester ≠ approver) in `detail`.
 * - Bank account numbers, IBANs and card data are never an input, a prefill or a detail value. Bank
 *   statements and reconciliations are named by their period; invoice numbers are masked to their tail.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MONTH = z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/);
const NAME = z.string().trim().min(1).max(120);
/** Whole currency units as the user says them ("Rs 12,500"); converted to the minor unit on the server. */
const AMOUNT = z.number().int().min(1).max(100_000_000);
/** The last digits of an invoice number, as shown (masked) in a question's choices. */
const INVOICE_TAIL = z.string().trim().regex(/^\d{1,8}$/);

/** POST /api/fees/* guards: assertStaffRole + assertPermission(module, action) (+ canManageFinance); operators only while the accountant seat is empty. */
const FINANCE_ROLES: readonly UserRole[] = ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"];
const OPERATORS: readonly UserRole[] = ["CAMPUS_ADMIN", "ADMIN"];
const financeGates = (module: PermissionModule, action: PermissionAction, managesFinance = true) => [
  roles(FINANCE_ROLES), ...(managesFinance ? [predicate("canManageFinance", canManageFinance, FINANCE_ROLES)] : []), permission(module, action), ownCampus(),
  seatVacantForOperator("accountant", "ACCOUNTANT"),
];

function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}

/** The finance desk on this campus: the accountant, or the campus operators while no accountant holds the seat. */
async function deskRoles(ctx: CapabilityContext): Promise<UserRole[]> {
  return (await ctx.seats()).accountant ? ["ACCOUNTANT"] : [...OPERATORS];
}

type Screen = "collect" | "bank-import" | "reconciliation" | "invoices" | "tax" | "payroll";
/** The existing screen, in the console of whoever the hand-off targets. */
function screen(target: readonly UserRole[], name: Screen, query = "") {
  const accountant = target.length > 0 && target.every(role => role === "ACCOUNTANT");
  const path = accountant
    ? { collect: "/accountant?view=payments&tab=payments", "bank-import": "/accountant?view=payments&tab=bank-import", reconciliation: "/accountant?view=payments&tab=reconciliation", invoices: "/accountant?view=invoices", tax: "/accountant?view=tax", payroll: "/accountant?view=payroll" }[name]
    : { collect: "/admin?view=fees&tab=payments", "bank-import": "/admin?view=fees&tab=payments", reconciliation: "/admin?view=fees&tab=payments", invoices: "/admin?view=fees&tab=invoices", tax: "/admin?view=fees&tab=tax", payroll: "/admin?view=payroll" }[name];
  return `${path}${query}`;
}

async function money(ctx: CapabilityContext, currency?: string) {
  const policy = await getLocalePackage(ctx.user.schoolId, ctx.campusId);
  const code = currency ?? policy.currency;
  return { currency: code, toMinor: (amount: number) => parseMoney(String(amount), code).minor, show: (minor: number) => formatMoney({ minor, currency: code }, policy) };
}

/** The digits a person reads back from a masked number; undefined when the invoice has none. */
const invoiceTail = (value: string | null) => (value ?? "").replace(/[^0-9]/g, "").slice(-5) || undefined;
/** "INV-2026-AB12-00042" → "INV-…-00042": enough to tell two invoices apart, never the full number. */
export const maskInvoiceNumber = (value: string | null) => `${value?.split("-")[0] || "INV"}-…-${invoiceTail(value) || "?"}`;
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

// ─── who acts on the hand-off ─────────────────────────────────────────────

/** Active colleagues on this campus (or in the school) holding one of `among`, never the requester. */
async function colleagues(ctx: CapabilityContext, among: readonly UserRole[], scope: "campus" | "school" = "campus") {
  return prisma.user.findMany({
    where: { schoolId: ctx.user.schoolId, ...(scope === "campus" ? { campusId: ownCampusId(ctx) } : {}), isActive: true, role: { in: [...among] }, id: { not: ctx.user.userId } },
    select: { id: true, role: true }, orderBy: { id: "asc" }, take: 50,
  });
}

interface Route { separation: "REQUIRED" | "NOT_REQUIRED"; targetRoles: UserRole[]; approverIds: string[] }

/**
 * Who opens a money screen. Without separation the desk (the requester's own seat) does. When the campus
 * policy requires a second person, the hand-off targets eligible colleagues only (another accountant first,
 * else a campus operator), and the Collect command refuses the requester's own post (RT6).
 */
async function routeMoney(ctx: CapabilityContext): Promise<Route> {
  const desk = await deskRoles(ctx);
  if (!(await moneySeparationRequired(ctx.user, ownCampusId(ctx)))) return { separation: "NOT_REQUIRED", targetRoles: desk, approverIds: [] };
  const others = await colleagues(ctx, FINANCE_ROLES);
  const accountants = others.filter(row => row.role === "ACCOUNTANT");
  const chosen = accountants.length ? accountants : others.filter(row => OPERATORS.includes(row.role as UserRole));
  if (!chosen.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ELIGIBLE_APPROVER", whoCan: FINANCE_ROLES.join(",") });
  return { separation: "REQUIRED", targetRoles: [...new Set(chosen.map(row => row.role as UserRole))], approverIds: chosen.map(row => row.id) };
}

/**
 * The domain's own checker for a request the desk files (adjustments, plans, tax, payroll): someone other than
 * the requester. `soleKind` lets a campus operator who is the only checker decide with a typed reason (SD3).
 */
async function checker(ctx: CapabilityContext, among: readonly UserRole[], options: { scope?: "campus" | "school"; soleKind?: "finance" | "tax" } = {}) {
  const others = await colleagues(ctx, among, options.scope);
  const sole = !others.length && options.soleKind ? await soleChecker(options.soleKind, ctx.user, ctx.campusId) : false;
  if (!others.length && !sole) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ELIGIBLE_APPROVER", whoCan: among.join(",") });
  return { decidedBy: [...among], approverIds: others.map(row => row.id), requesterId: ctx.user.userId, selfDecisionWithReason: sole };
}

// ─── pupils and invoices ──────────────────────────────────────────────────

async function pupilRoster(ctx: CapabilityContext, classId?: string): Promise<Pupil[]> {
  const campusId = ownCampusId(ctx);
  if (classId) return classRoster(ctx, (await assignedClass(ctx, classId)).id);
  return prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true, fullName: true, nameUr: true, rollNo: true }, orderBy: { fullName: "asc" } });
}

async function bindPupil(ctx: CapabilityContext, student: string, classId?: string) {
  const found = matchPupil(await pupilRoster(ctx, classId), student);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer: "/student", promptKey: "PUPIL_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(pupil => ({ value: pupil.rollNo, label: pupilLabel(pupil) })) }
    : { pointer: "/student", promptKey: "PUPIL_NOT_FOUND" }]);
}

const PAYABLE = { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] as Array<"PENDING" | "PARTIAL" | "OVERDUE"> }, balanceDue: { gt: 0 } };
type InvoiceRef = { student: string; classId?: string; month?: string; invoice?: string };

/**
 * One invoice of the named pupil: by month (the invoice date's month), narrowed by the masked number's tail
 * when the month has several. A question lists the choices with masked numbers; none is a refusal.
 */
async function bindInvoice(ctx: CapabilityContext, input: InvoiceRef, payable: boolean) {
  const campusId = ownCampusId(ctx);
  const pupil = await bindPupil(ctx, input.student, input.classId);
  const range = input.month ? invoiceMonthDates(input.month) : null;
  const rows = await prisma.invoice.findMany({
    where: { schoolId: ctx.user.schoolId, campusId, studentId: pupil.id, ...(payable ? PAYABLE : { status: { not: "CANCELLED" } }), ...(range ? { invoiceDate: { gte: range.start, lt: range.end } } : {}) },
    select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, balanceDue: true, totalAmount: true, totalAmountPaid: true, currency: true, status: true, studentId: true, campusId: true },
    orderBy: [{ invoiceDate: "desc" }, { id: "asc" }], take: 12,
  });
  const chosen = input.invoice ? rows.filter(row => (invoiceTail(row.invoiceNumber) ?? "").endsWith(input.invoice!)) : rows;
  if (chosen.length === 1) return { pupil, invoice: chosen[0] };
  if (!chosen.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: payable ? "NO_PAYABLE_INVOICE" : "NO_INVOICE", ...(input.month ? { month: input.month } : {}) });
  const show = (await money(ctx)).show;
  const months = new Set(chosen.map(row => monthOf(row.invoiceDate)));
  throw new InputRequired([months.size > 1 && !input.month
    ? { pointer: "/month", promptKey: "INVOICE_MONTH_AMBIGUOUS", params: { count: chosen.length }, options: [...months].slice(0, 8).map(month => ({ value: month, label: month })) }
    : { pointer: "/invoice", promptKey: "INVOICE_AMBIGUOUS", params: { count: chosen.length }, options: chosen.slice(0, 8).map(row => ({ value: invoiceTail(row.invoiceNumber) ?? row.id, label: `${maskInvoiceNumber(row.invoiceNumber)} · ${monthOf(row.invoiceDate)} · ${show(row.balanceDue)}` })) }]);
}

const invoiceDetail = (invoice: { invoiceNumber: string | null; invoiceDate: Date; dueDate: Date; balanceDue: number; currency: string; status: string }) => ({
  invoice: maskInvoiceNumber(invoice.invoiceNumber), month: monthOf(invoice.invoiceDate), dueDate: invoice.dueDate.toISOString().slice(0, 10), balanceDueMinor: invoice.balanceDue, currency: invoice.currency, status: invoice.status,
});

const handoffSource = (route: string, kind: string) => ({ route, service: `src/lib/ai-workflows/executor/step-runner.ts:openHandoff (${kind})`, reuse: "handoff-only" as const });

// ─── fees.collect_payment ─────────────────────────────────────────────────

/**
 * "Record Rs 12,500 cash from Ali Raza for the October fee." Opens the Collect desk with the invoice, amount
 * and method filled in. The desk claims the hand-off (a second device sees "Being handled by …"), posts it
 * through the shared collect command with the hand-off id, and the unique (school, hand-off) index lets it post
 * once. While it is open, a payment typed by hand on that invoice is refused.
 */
const collectInput = z.strictObject({
  /** The pupil the user named ("Ali Raza", "roll 12"). */
  student: NAME,
  /** Narrows the pupil search to one class. */
  classId: z.string().min(1).optional(),
  /** The month the fee is for (the invoice's month), e.g. "the October fee" → 2026-10. */
  month: MONTH.optional(),
  /** Only from the user's choice in a question: the tail of a masked invoice number. */
  invoice: INVOICE_TAIL.optional(),
  /** Whole currency units as said. */
  amount: AMOUNT,
  method: z.enum(["CASH", "BANK", "CHEQUE", "MOBILE_WALLET"]).optional(),
  paymentDate: DAY.optional(),
});
type CollectInput = z.infer<typeof collectInput>;

const COLLECT = defineCapability<CollectInput>({
  key: "fees.collect_payment", version: 1, cluster: "C6", inventoryKeys: ["fees.collect_payment"], risk: "FINANCIAL", roles: FINANCE_ROLES, class: "C",
  input: collectInput, evidence: ["/student", "/amount"],
  gates: financeGates("fees", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Record a fee payment", "Open the Collect desk with the pupil's invoice, the amount and the method filled in; you check it and record it there.", "Record Rs 12,500 cash from Ali Raza's father for the October fee"],
    ["تسجيل دفعة رسوم", "فتح مكتب التحصيل وفيه فاتورة الطالب والمبلغ وطريقة الدفع؛ تراجعها وتسجلها هناك.", "سجّل دفعة نقدية ١٢٥٠٠ من والد علي رضا لرسوم أكتوبر"],
    ["فیس کی وصولی درج کریں", "کلیکٹ ڈیسک طالب علم کے انوائس، رقم اور طریقۂ ادائیگی کے ساتھ کھولیں؛ آپ وہیں دیکھ کر درج کریں گے۔", "علی رضا کے والد سے اکتوبر کی فیس کے 12,500 روپے نقد وصول درج کر دیں"],
  ),
  source: handoffSource("POST /api/fees/collect", "DOMAIN_SCREEN; src/lib/fees/collect-command.ts:collectPaymentCore"),
  async resolve(ctx, input) {
    const { pupil, invoice } = await bindInvoice(ctx, input, true);
    return { ...input, student: pupil.fullName, month: monthOf(invoice.invoiceDate), invoice: invoiceTail(invoice.invoiceNumber) };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const { pupil, invoice } = await bindInvoice(ctx, input, true);
      // One prepared collection per invoice at a time: a second one could post the same fee twice (RT6).
      if ((await openPreparedCollections(ctx.user.schoolId, invoice.id)).length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "COLLECTION_ALREADY_PREPARED" });
      const units = await money(ctx, invoice.currency);
      const amount = units.toMinor(input.amount);
      const route = await routeMoney(ctx);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: route.targetRoles, link: screen(route.targetRoles, "collect", `&invoice=${encodeURIComponent(invoice.id)}`),
        prefill: { invoiceId: invoice.id, studentId: pupil.id, amount, currency: invoice.currency, method: input.method ?? null, ...(input.paymentDate ? { paymentDate: input.paymentDate } : {}) },
        detail: {
          ...invoiceDetail(invoice), amountShown: units.show(amount), overpaymentMinor: Math.max(0, amount - invoice.balanceDue),
          separation: route.separation, approverIds: route.approverIds, requesterId: ctx.user.userId,
          claim: true, completesWith: "payment.workflowHandoffId", posted: false,
        },
      };
    },
  },
});

// ─── fees.request_adjustment ──────────────────────────────────────────────

/**
 * "Refund the Rs 5,000 extra transport fee Hamza Khan paid." Opens the invoice's Adjustments panel with the
 * request filled in; the desk files it there (the row will carry FinancialAdjustment.workflowHandoffId), and
 * a campus operator other than the requester decides it. Nothing is refunded or credited here.
 */
const adjustmentInput = z.strictObject({
  kind: z.enum(ADJUSTMENT_KINDS),
  student: NAME,
  classId: z.string().min(1).optional(),
  month: MONTH.optional(),
  invoice: INVOICE_TAIL.optional(),
  amount: AMOUNT,
  /** Why, in the user's own words; the family-facing explanation is written on the screen. */
  reason: z.string().trim().min(3).max(500),
});
type AdjustmentInput = z.infer<typeof adjustmentInput>;

const REQUEST_ADJUSTMENT = defineCapability<AdjustmentInput>({
  key: "fees.request_adjustment", version: 1, cluster: "C6", inventoryKeys: ["fees.request_adjustment"], risk: "FINANCIAL", roles: FINANCE_ROLES, class: "C",
  input: adjustmentInput, evidence: ["/student", "/amount", "/reason"],
  gates: financeGates("fees", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Request a refund, credit or waiver", "Prepare the request on the pupil's invoice; you file it there and a campus admin other than you decides it.", "Refund the Rs 5,000 extra transport fee Hamza Khan paid"],
    ["طلب استرداد أو تخفيض أو إعفاء", "تجهيز الطلب على فاتورة الطالب؛ تقدّمه من هناك ويقرّره مدير فرع غيرك.", "استرد ٥٠٠٠ دفعها حمزة خان زيادة في رسوم النقل"],
    ["رقم واپسی، کریڈٹ یا معافی کی درخواست", "طالب علم کے انوائس پر درخواست تیار کریں؛ آپ وہیں جمع کرائیں گے اور آپ کے علاوہ کوئی کیمپس ایڈمن فیصلہ کرے گا۔", "حمزہ خان نے ٹرانسپورٹ فیس کے جو 5,000 روپے زیادہ دیے وہ واپس کر دیں"],
  ),
  source: handoffSource("POST /api/fees/adjustments", "DOMAIN_REQUEST; src/lib/fees/adjustments-service.ts:requestAdjustment"),
  async resolve(ctx, input) {
    const { pupil, invoice } = await bindInvoice(ctx, input, false);
    return { ...input, student: pupil.fullName, month: monthOf(invoice.invoiceDate), invoice: invoiceTail(invoice.invoiceNumber) };
  },
  handoff: {
    kind: "DOMAIN_REQUEST",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const { pupil, invoice } = await bindInvoice(ctx, input, false);
      const units = await money(ctx, invoice.currency);
      const amount = units.toMinor(input.amount);
      let paymentId: string | null = null;
      if (input.kind === "REFUND") {
        // A refund names one confirmed payment; with several the person picks it on the screen.
        const payments = await prisma.payment.findMany({ where: { schoolId: ctx.user.schoolId, invoiceId: invoice.id, reversalOfId: null, amount: { gt: 0 } }, select: { id: true }, take: 2 });
        if (!payments.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_PAYMENT_TO_REFUND" });
        paymentId = payments.length === 1 ? payments[0].id : null;
      } else {
        const open = await prisma.financialAdjustment.aggregate({ where: { schoolId: ctx.user.schoolId, invoiceId: invoice.id, kind: { in: ["CREDIT_NOTE", "WAIVER"] }, status: "REQUESTED" }, _sum: { amount: true } });
        if (amount > invoice.balanceDue - (open._sum.amount ?? 0)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ADJUSTMENT_EXCEEDS_BALANCE" });
      }
      const decision = await checker(ctx, OPERATORS, { soleKind: "finance" });
      const desk = await deskRoles(ctx);
      return {
        kind: "DOMAIN_REQUEST", targetRoles: desk, link: screen(desk, "invoices", `&invoice=${encodeURIComponent(invoice.id)}`),
        prefill: { invoiceId: invoice.id, studentId: pupil.id, kind: input.kind, amount, currency: invoice.currency, paymentId, reason: input.reason },
        detail: { ...invoiceDetail(invoice), amountShown: units.show(amount), ...decision, completesWith: "financialAdjustment.workflowHandoffId", requested: false },
      };
    },
  },
});

// ─── fees.generate_monthly_invoices ───────────────────────────────────────

/**
 * "Generate November invoices for all classes." A prepared preview for the person who applies it on the
 * Invoices screen: how many pupils would be billed, how many already have the month's invoice, and classes
 * with no fee group. Nothing is issued here; separation REQUIRED sends it to another desk member.
 */
const invoicesInput = z.strictObject({ month: MONTH, classId: z.string().min(1).optional() });
type InvoicesInput = z.infer<typeof invoicesInput>;

const GENERATE_INVOICES = defineCapability<InvoicesInput>({
  key: "fees.generate_monthly_invoices", version: 1, cluster: "C6", inventoryKeys: ["fees.generate_monthly_invoices"], risk: "FINANCIAL", roles: FINANCE_ROLES, class: "C",
  input: invoicesInput, evidence: [],
  gates: financeGates("fees", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Prepare a month's invoices", "Count who would be billed for the month and open Invoices with it chosen; you review the run and generate it there.", "Generate November invoices for all classes"],
    ["تجهيز فواتير شهر", "حساب من ستصدر لهم فواتير الشهر وفتح شاشة الفواتير والشهر محدد؛ تراجع وتصدرها من هناك.", "أصدر فواتير نوفمبر لكل الصفوف"],
    ["مہینے کے انوائس تیار کریں", "مہینے کے انوائس کن کے بنیں گے یہ گن کر انوائس اسکرین مہینہ منتخب کر کے کھولیں؛ آپ وہیں دیکھ کر بنائیں گے۔", "نومبر کے انوائس تمام کلاسوں کے لیے بنا دیں"],
  ),
  source: handoffSource("POST /api/fees/generate-invoices", "DOMAIN_SCREEN; src/lib/fees/invoice-generation.ts:invoiceGenerationTransaction"),
  async resolve(ctx, input) {
    ownCampusId(ctx);
    if (input.classId) await assignedClass(ctx, input.classId);
    return input;
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const campusId = ownCampusId(ctx);
      const classId = input.classId ? (await assignedClass(ctx, input.classId)).id : null;
      const { start, end } = invoiceMonthDates(input.month);
      const students = await prisma.student.findMany({
        where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null, status: { equals: "active", mode: "insensitive" }, class: { campusId, schoolId: ctx.user.schoolId, archivedAt: null, status: "ACTIVE", ...(classId ? { id: classId } : {}) } },
        select: { id: true, classId: true, class: { select: { academicYear: true } } },
      });
      if (!students.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ACTIVE_STUDENTS" });
      const invoiced = await prisma.invoice.findMany({ where: { schoolId: ctx.user.schoolId, studentId: { in: students.map(row => row.id) }, invoiceDate: { gte: start, lt: end } }, select: { studentId: true }, distinct: ["studentId"] });
      if (invoiced.length === students.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ALREADY_INVOICED", month: input.month });
      const classes = [...new Map(students.map(row => [row.classId, row.class.academicYear])).entries()];
      const assigned = await prisma.feeGroupAssignment.findMany({ where: { schoolId: ctx.user.schoolId, campusId, OR: classes.map(([id, academicYear]) => ({ classId: id, academicYear })) }, select: { classId: true } });
      const withFees = new Set(assigned.map(row => row.classId));
      const route = await routeMoney(ctx);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: route.targetRoles, link: screen(route.targetRoles, "invoices"),
        prefill: { generationMonth: input.month, ...(classId ? { classId } : {}), includeLateFees: true },
        detail: {
          pupils: students.length, alreadyInvoiced: invoiced.length, toInvoice: students.length - invoiced.length,
          classes: classes.length, classesWithoutFeeGroup: classes.filter(([id]) => !withFees.has(id)).length,
          separation: route.separation, approverIds: route.approverIds, requesterId: ctx.user.userId, issued: false,
        },
      };
    },
  },
});

// ─── fees.propose_payment_plan ────────────────────────────────────────────

/**
 * "Ahmed's family will pay the remaining 30,000 in three instalments." Splits what is still owed evenly (the
 * remainder on the last), monthly from the first due date, checks it the way the plan route does, and opens
 * the invoice's instalment panel to propose it. Someone other than the proposer approves it there.
 */
const planInput = z.strictObject({
  student: NAME,
  classId: z.string().min(1).optional(),
  month: MONTH.optional(),
  invoice: INVOICE_TAIL.optional(),
  instalments: z.number().int().min(2).max(24),
  firstDueDate: DAY,
});
type PlanInput = z.infer<typeof planInput>;

const PROPOSE_PLAN = defineCapability<PlanInput>({
  key: "fees.propose_payment_plan", version: 1, cluster: "C6", inventoryKeys: ["fees.propose_payment_plan"], risk: "FINANCIAL", roles: FINANCE_ROLES, class: "C",
  input: planInput, evidence: ["/student"],
  gates: financeGates("fees", "add", false), scope: { kind: "own-campus" },
  copy: c(
    ["Propose an instalment plan", "Split what a family still owes into monthly instalments and open the invoice to propose it; another staff member approves it.", "Ahmed's family will pay the remaining fee in three instalments from 10 November"],
    ["اقتراح خطة أقساط", "تقسيم المبلغ المتبقي على الأسرة إلى أقساط شهرية وفتح الفاتورة لاقتراحها؛ يعتمدها موظف آخر.", "ستدفع أسرة أحمد الرسوم المتبقية على ثلاثة أقساط من ١٠ نوفمبر"],
    ["قسطوں کا منصوبہ تجویز کریں", "خاندان کے ذمے باقی رقم ماہانہ قسطوں میں بانٹ کر انوائس پر تجویز کے لیے کھولیں؛ کوئی دوسرا عملہ منظوری دے گا۔", "احمد کے گھر والے باقی فیس 10 نومبر سے تین قسطوں میں دیں گے"],
  ),
  source: handoffSource("POST /api/fees/payment-plans", "DOMAIN_SCREEN; src/lib/fees/installments.ts:validatePlan"),
  async resolve(ctx, input) {
    const { pupil, invoice } = await bindInvoice(ctx, input, true);
    return { ...input, student: pupil.fullName, month: monthOf(invoice.invoiceDate), invoice: invoiceTail(invoice.invoiceNumber) };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const { pupil, invoice } = await bindInvoice(ctx, input, true);
      const open = await prisma.paymentPlan.count({ where: { schoolId: ctx.user.schoolId, invoiceId: invoice.id, status: { in: ["proposed", "active"] } } });
      if (open) throw new WorkflowError("DOMAIN_REFUSED", { reason: "PLAN_ALREADY_OPEN" });
      const school = await prisma.school.findUniqueOrThrow({ where: { id: ctx.user.schoolId }, select: { timezone: true } });
      const instalments = splitEvenly(invoice.balanceDue, input.instalments, input.firstDueDate);
      const problem = validatePlan(instalments, invoice.balanceDue, schoolToday(school.timezone, ctx.now));
      if (problem) throw new WorkflowError("DOMAIN_REFUSED", { reason: "PLAN_INVALID" });
      const decision = await checker(ctx, FINANCE_ROLES);
      const desk = await deskRoles(ctx);
      const units = await money(ctx, invoice.currency);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: desk, link: screen(desk, "invoices", `&invoice=${encodeURIComponent(invoice.id)}`),
        prefill: { invoiceId: invoice.id, studentId: pupil.id, currency: invoice.currency, installments: instalments },
        detail: { ...invoiceDetail(invoice), instalmentsShown: instalments.map(row => `${row.dueDate} · ${units.show(row.amount)}`), ...decision, proposed: false },
      };
    },
  },
});

// ─── tax.request_signoff ──────────────────────────────────────────────────

/**
 * "Send the tax package for sign-off." Opens Tax packages with the ready draft chosen; the desk submits it
 * there and the institution authority (never the preparer, unless they are the only one) signs it off.
 */
const taxInput = z.strictObject({ package: z.string().trim().min(1).max(80).optional() });
type TaxInput = z.infer<typeof taxInput>;

async function bindDraft(ctx: CapabilityContext, said?: string) {
  const drafts = await prisma.taxActivation.findMany({ where: { schoolId: ctx.user.schoolId, status: "DRAFT" }, select: { id: true, packageCode: true, packageVersion: true, campusIds: true, preparedById: true, configHash: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const fold = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const mine = drafts.filter(row => !row.campusIds.length || row.campusIds.includes(ownCampusId(ctx)));
  const chosen = said ? mine.filter(row => fold(row.packageCode).includes(fold(said)) || fold(said).includes(fold(row.packageCode))) : mine;
  if (chosen.length === 1) return chosen[0];
  if (!chosen.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_TAX_DRAFT" });
  throw new InputRequired([{ pointer: "/package", promptKey: "TAX_DRAFT_AMBIGUOUS", params: { count: chosen.length }, options: chosen.slice(0, 8).map(row => ({ value: row.packageCode, label: `${row.packageCode} v${row.packageVersion}` })) }]);
}

const TAX_SIGNOFF = defineCapability<TaxInput>({
  key: "tax.request_signoff", version: 1, cluster: "C6", inventoryKeys: ["tax.request_signoff"], risk: "UPDATE", roles: FINANCE_ROLES, class: "C",
  input: taxInput, evidence: [],
  gates: financeGates("fees", "view"), scope: { kind: "own-campus" },
  copy: c(
    ["Send a tax package for sign-off", "Open Tax packages with the ready draft chosen; you submit it there and the school's authority signs it off.", "Send the tax package for sign-off"],
    ["إرسال حزمة الضريبة للاعتماد", "فتح حزم الضريبة والمسودة الجاهزة محددة؛ ترسلها من هناك ويعتمدها صاحب الصلاحية في المدرسة.", "أرسل حزمة الضريبة للاعتماد"],
    ["ٹیکس پیکج منظوری کے لیے بھیجیں", "ٹیکس پیکجز تیار مسودہ منتخب کر کے کھولیں؛ آپ وہیں سے بھیجیں گے اور اسکول کے مجاز افسر منظوری دیں گے۔", "ٹیکس پیکج منظوری کے لیے بھیج دیں"],
  ),
  source: handoffSource("POST /api/tax (action: request-signoff)", "DOMAIN_SCREEN; src/lib/tax/service.ts:requestSignOff"),
  async resolve(ctx, input) {
    const draft = await bindDraft(ctx, input.package);
    return { package: draft.packageCode };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const draft = await bindDraft(ctx, input.package);
      const run = await prisma.taxFixtureRun.findFirst({ where: { activationId: draft.id }, orderBy: { createdAt: "desc" }, select: { configHash: true, passed: true } });
      const decision = await checker(ctx, ["SUPER_ADMIN", "ADMIN"], { scope: "school", soleKind: "tax" });
      const desk = await deskRoles(ctx);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: desk, link: screen(desk, "tax"),
        prefill: { activationId: draft.id, action: "request-signoff" },
        detail: { packageCode: draft.packageCode, packageVersion: draft.packageVersion, fixturesPassing: Boolean(run && run.passed && run.configHash === draft.configHash), ...decision, submitted: false },
      };
    },
  },
});

// ─── imports.commit_bank_statement ────────────────────────────────────────

/**
 * "Match this month's statement with the payments." Deep-links to Bank import with the staged statement
 * open, named by its period and row counts. The file and its account details stay on that screen.
 */
const statementInput = z.strictObject({ month: MONTH.optional() });
type StatementInput = z.infer<typeof statementInput>;

async function bindStatement(ctx: CapabilityContext, month?: string) {
  const batches = await prisma.importBatch.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ownCampusId(ctx), kind: "BANK_STATEMENT", state: "STAGED", expiresAt: { gt: ctx.now } }, select: { id: true, data: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const shaped = batches.map(batch => {
    const data = (batch.data ?? {}) as { rows?: Array<{ state?: string; selected?: boolean }>; metadata?: { statementFrom?: unknown; statementTo?: unknown } };
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const from = typeof data.metadata?.statementFrom === "string" ? data.metadata.statementFrom : null, to = typeof data.metadata?.statementTo === "string" ? data.metadata.statementTo : null;
    return { id: batch.id, from, to, rows: rows.length, selected: rows.filter(row => row.state === "ACCEPTED" && row.selected).length, unresolved: rows.filter(row => row.state === "UNRESOLVED").length };
  });
  const chosen = month ? shaped.filter(row => (row.from ?? "").slice(0, 7) <= month && month <= (row.to ?? row.from ?? "").slice(0, 7)) : shaped;
  if (chosen.length === 1) return chosen[0];
  if (!chosen.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_STAGED_STATEMENT" });
  throw new InputRequired([{ pointer: "/month", promptKey: "STATEMENT_AMBIGUOUS", params: { count: chosen.length }, options: chosen.slice(0, 8).map(row => ({ value: (row.from ?? "").slice(0, 7), label: `${row.from ?? "?"} – ${row.to ?? "?"} · ${row.rows}` })) }]);
}

const COMMIT_STATEMENT = defineCapability<StatementInput>({
  key: "imports.commit_bank_statement", version: 1, cluster: "C3", inventoryKeys: ["imports.commit_bank_statement"], risk: "FINANCIAL", roles: FINANCE_ROLES, class: "C",
  input: statementInput, evidence: [],
  gates: financeGates("fees", "add", false), scope: { kind: "own-campus" },
  copy: c(
    ["Commit a bank statement", "Open Bank import with the staged statement; you check the matched rows and commit it there.", "Match this month's HBL statement with the payments"],
    ["اعتماد كشف حساب بنكي", "فتح استيراد البنك والكشف المجهّز مفتوح؛ تراجع الصفوف المطابقة وتعتمده من هناك.", "طابق كشف هذا الشهر مع الدفعات"],
    ["بینک اسٹیٹمنٹ کمٹ کریں", "بینک امپورٹ تیار اسٹیٹمنٹ کے ساتھ کھولیں؛ آپ ملائی گئی قطاریں دیکھ کر وہیں کمٹ کریں گے۔", "اس مہینے کی HBL اسٹیٹمنٹ ادائیگیوں سے ملا دیں"],
  ),
  source: handoffSource("POST /api/import-batches/[batchId] (action: commit)", "DEEP_LINK"),
  async resolve(ctx, input) {
    const statement = await bindStatement(ctx, input.month);
    return statement.from ? { month: statement.from.slice(0, 7) } : input;
  },
  handoff: {
    kind: "DEEP_LINK",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const statement = await bindStatement(ctx, input.month);
      if (!statement.selected) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ROWS_SELECTED" });
      const desk = await deskRoles(ctx);
      return {
        kind: "DEEP_LINK", targetRoles: desk, link: screen(desk, "bank-import", `&batch=${encodeURIComponent(statement.id)}`),
        prefill: { batchId: statement.id },
        detail: { from: statement.from, to: statement.to, rows: statement.rows, selected: statement.selected, unresolved: statement.unresolved, committed: false },
      };
    },
  },
});

// ─── fees.post_bank_reconciliation ────────────────────────────────────────

/**
 * "Post the October reconciliation." Opens Reconciliation with the pending statement chosen; posting turns
 * each matched row into a payment there, once. Separation REQUIRED sends it to another desk member.
 */
const reconcileInput = z.strictObject({ month: MONTH.optional() });
type ReconcileInput = z.infer<typeof reconcileInput>;

async function bindReconciliation(ctx: CapabilityContext, month?: string) {
  const rows = await prisma.bankReconciliation.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ownCampusId(ctx), status: "pending" }, select: { id: true, statementPeriodFrom: true, statementPeriodTo: true, matchedCount: true, unmatchedCount: true, reconciliationDetailsJson: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const period = (row: typeof rows[number]) => ({ from: row.statementPeriodFrom?.toISOString().slice(0, 10) ?? null, to: row.statementPeriodTo?.toISOString().slice(0, 10) ?? null });
  const chosen = month ? rows.filter(row => { const p = period(row); return (p.from ?? "").slice(0, 7) <= month && month <= (p.to ?? p.from ?? "").slice(0, 7); }) : rows;
  if (chosen.length === 1) return { ...chosen[0], ...period(chosen[0]) };
  if (!chosen.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_PENDING_RECONCILIATION" });
  throw new InputRequired([{ pointer: "/month", promptKey: "RECONCILIATION_AMBIGUOUS", params: { count: chosen.length }, options: chosen.slice(0, 8).map(row => { const p = period(row); return { value: (p.from ?? "").slice(0, 7), label: `${p.from ?? "?"} – ${p.to ?? "?"} · ${row.matchedCount}/${row.matchedCount + row.unmatchedCount}` }; }) }]);
}

const POST_RECONCILIATION = defineCapability<ReconcileInput>({
  key: "fees.post_bank_reconciliation", version: 1, cluster: "C6", inventoryKeys: ["fees.post_bank_reconciliation"], risk: "FINANCIAL", roles: FINANCE_ROLES, class: "C",
  input: reconcileInput, evidence: [],
  gates: financeGates("fees", "add", false), scope: { kind: "own-campus" },
  copy: c(
    ["Post a bank reconciliation", "Open Reconciliation with the pending statement chosen; you check it and post the matched payments there.", "Post the October bank reconciliation"],
    ["ترحيل مطابقة بنكية", "فتح المطابقة والكشف المعلّق محدد؛ تراجعه وترحّل الدفعات المطابقة من هناك.", "رحّل مطابقة بنك أكتوبر"],
    ["بینک مطابقت پوسٹ کریں", "مطابقت کی اسکرین زیرِ التوا اسٹیٹمنٹ منتخب کر کے کھولیں؛ آپ دیکھ کر ملی ہوئی ادائیگیاں وہیں پوسٹ کریں گے۔", "اکتوبر کی بینک مطابقت پوسٹ کر دیں"],
  ),
  source: handoffSource("POST /api/fees/reconciliations (action: post)", "DOMAIN_SCREEN"),
  async resolve(ctx, input) {
    const rec = await bindReconciliation(ctx, input.month);
    return rec.from ? { month: rec.from.slice(0, 7) } : input;
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const rec = await bindReconciliation(ctx, input.month);
      const matched = Array.isArray(rec.reconciliationDetailsJson) ? rec.reconciliationDetailsJson as Array<{ amountMinor?: number }> : [];
      const route = await routeMoney(ctx);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: route.targetRoles, link: screen(route.targetRoles, "reconciliation", `&reconciliation=${encodeURIComponent(rec.id)}`),
        prefill: { reconciliationId: rec.id, action: "post" },
        detail: {
          from: rec.from, to: rec.to, matched: rec.matchedCount, unmatched: rec.unmatchedCount,
          matchedMinor: matched.reduce((sum, row) => sum + (Number(row.amountMinor) || 0), 0),
          separation: route.separation, approverIds: route.approverIds, requesterId: ctx.user.userId, posted: false,
        },
      };
    },
  },
});

// ─── payroll.prepare_run ──────────────────────────────────────────────────

/**
 * "اکتوبر کی تنخواہیں تیار کر دیں" (prepare October salaries). A role-task chain on the SKO-434 runs engine:
 * without a payroll policy or provider mapping in effect, the task goes to the campus admin who owns them;
 * otherwise the finance desk prepares the run on Payroll, and a campus admin other than the preparer (when the
 * policy requires separation) approves it. Nothing is calculated or paid here.
 */
const PAYROLL_PREPARERS: readonly UserRole[] = ["ACCOUNTANT", "CAMPUS_ADMIN", "ADMIN"];
const payrollInput = z.strictObject({ month: MONTH });
type PayrollInput = z.infer<typeof payrollInput>;

const PREPARE_PAYROLL = defineCapability<PayrollInput>({
  key: "payroll.prepare_run", version: 1, cluster: "C6", inventoryKeys: ["payroll.prepare_run"], risk: "FINANCIAL", roles: PAYROLL_PREPARERS, class: "C",
  input: payrollInput, evidence: [],
  gates: [roles(PAYROLL_PREPARERS), permission("payroll", "view"), ownCampus(), seatVacantForOperator("accountant", "ACCOUNTANT")], scope: { kind: "own-campus" },
  copy: c(
    ["Prepare a payroll run", "Hand the month's payroll to whoever prepares it on Payroll, then to the campus admin who approves it; says who must set up payroll first.", "Prepare October salaries"],
    ["تجهيز مسير الرواتب", "تسليم رواتب الشهر لمن يجهّزها في شاشة الرواتب ثم لمدير الفرع الذي يعتمدها؛ ويذكر من عليه إعداد الرواتب أولاً.", "جهّز رواتب أكتوبر"],
    ["تنخواہوں کا رن تیار کریں", "مہینے کی تنخواہیں تیار کرنے والے کو پے رول اسکرین پر، پھر منظوری کے لیے کیمپس ایڈمن کو سونپیں؛ پہلے پے رول کس نے ترتیب دینا ہے یہ بھی بتائیں۔", "اکتوبر کی تنخواہیں تیار کر دیں"],
  ),
  source: handoffSource("POST /api/payroll/runs (action: prepare)", "ROLE_TASK; src/lib/payroll-runs/service.ts:prepareRun"),
  async resolve(ctx, input) { ownCampusId(ctx); return input; },
  handoff: {
    kind: "ROLE_TASK",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const campusId = ownCampusId(ctx);
      const [year, month] = input.month.split("-").map(Number);
      const periodEnd = new Date(Date.UTC(year, month, 0));
      const exported = await prisma.payrollCalculation.count({ where: { campusId, year, month, correctionOfId: null, status: "EXPORTED" } });
      if (exported) throw new WorkflowError("DOMAIN_REFUSED", { reason: "PAYROLL_ALREADY_EXPORTED", month: input.month });
      const [policy, provider] = await Promise.all([
        prisma.payrollPolicy.findFirst({ where: { campusId, effectiveFrom: { lte: periodEnd } }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }], select: { id: true, version: true, requireSeparation: true } }),
        prisma.payrollProvider.findFirst({ where: { campusId }, orderBy: [{ createdAt: "desc" }, { version: "desc" }], select: { id: true } }),
      ]);
      const prefill = { year, month };
      if (!policy || !provider) {
        // The campus admin owns the policy and the export mapping; preparing waits for them.
        return { kind: "ROLE_TASK", targetRoles: [...OPERATORS], link: screen(OPERATORS, "payroll"), prefill, detail: { step: "setup", missing: [...(!policy ? ["policy"] : []), ...(!provider ? ["provider"] : [])].join(","), next: "payroll.prepare_run", prepared: false } };
      }
      const desk = await deskRoles(ctx);
      // The approver must differ from whoever prepares; the requester is the preparer when they hold the desk.
      const approvers = await colleagues(ctx, OPERATORS);
      if (policy.requireSeparation && !approvers.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ELIGIBLE_APPROVER", whoCan: OPERATORS.join(",") });
      return {
        kind: "ROLE_TASK", targetRoles: desk, link: screen(desk, "payroll"), prefill: { ...prefill, providerId: provider.id },
        detail: { step: "prepare", next: "payroll.approve_run", approveRoles: [...OPERATORS], approverIds: approvers.map(row => row.id), requesterId: ctx.user.userId, separation: policy.requireSeparation ? "REQUIRED" : "NOT_REQUIRED", policyVersion: policy.version, prepared: false },
      };
    },
  },
});

export const FINANCE_MONEY_ENTRIES: readonly CapabilityEntry[] = [COLLECT, REQUEST_ADJUSTMENT, GENERATE_INVOICES, PROPOSE_PLAN, TAX_SIGNOFF, COMMIT_STATEMENT, POST_RECONCILIATION, PREPARE_PAYROLL];
