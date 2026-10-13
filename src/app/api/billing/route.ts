import { existingMonthlyStudentInvoices, invoiceGenerationTransaction } from "@/lib/fees/invoice-generation";
import { invoiceEnrollmentContext } from "@/lib/fees/invoice-context";
import { minorUnits } from "@/lib/locale/package";
import { invoiceMonthDates, MAX_INVOICE_MINOR } from "@/lib/school-ai/fee-invoices";
import { recordPayment } from "@/lib/fees/payment";
import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { feeStructureSchema, generateInvoicesSchema, paymentSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageBilling,
  canManageSubscription,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { triggerFeeDueReminders } from "@/lib/notifications/automation";

async function scopedClass(classId: string, user: Awaited<ReturnType<typeof requireAuthUser>>, requestedCampusId?: string | null) {
  const campusId = user.role === "SUPER_ADMIN" ? requestedCampusId || undefined : user.campusId || undefined;
  const cls = await prisma.class.findFirst({
    where: {
      id: classId,
      campus: { schoolId: user.schoolId },
      ...(campusId ? { campusId } : {}),
    },
    select: { id: true, campusId: true },
  });
  if (!cls) throw new ApiError("Class not found", 404);
  return cls;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const canReadTuition = canManageBilling(user) || user.role === "ACCOUNTANT";
    const canManagePlan = canManageSubscription(user);
    if (!canReadTuition && !canManagePlan) throw new ApiError("Billing is not delegated to this membership", 403);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const classId = searchParams.get("classId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const [billing, feeStructures] = await Promise.all([
      canManagePlan ? getBillingSnapshot(user.schoolId) : Promise.resolve(null),
      canReadTuition ? prisma.feeStructure.findMany({
      where: {
        ...scopedCampusWhere(user, campusId),
        ...(classId ? { classId } : {}),
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            section: true,
            academicYear: true,
            _count: { select: { students: true } },
          },
        },
      },
      orderBy: [{ class: { name: "asc" } }, { activeFrom: "desc" }],
      }) : Promise.resolve([]),
    ]);

    return Response.json({ success: true, billing: billing ? { ...billing, canPurchaseSubscription: canManagePlan } : null, feeStructures });
  } catch (error) {
    return errorResponse(error, "[billing] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageBilling(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const { action } = body;

    if (action === "create-fee-structure") {
      const parsed = feeStructureSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

      const campusId = await resolveCampusId(user, body.campusId);
      await scopedClass(parsed.data.classId, user, campusId);
      const activeFrom = new Date(parsed.data.activeFrom);
      const activeTo = parsed.data.activeTo ? new Date(parsed.data.activeTo) : null;
      const oneTimeFeesJson = parsed.data.oneTimeFeesJson ? JSON.parse(parsed.data.oneTimeFeesJson) : undefined;
      const discountRulesJson = parsed.data.discountRulesJson ? JSON.parse(parsed.data.discountRulesJson) : undefined;

      const feeStructure = await prisma.feeStructure.upsert({
        where: { classId_activeFrom: { classId: parsed.data.classId, activeFrom } },
        update: {
          monthlyFee: parsed.data.monthlyFee,
          oneTimeFeesJson: oneTimeFeesJson as any,
          installmentType: parsed.data.installmentType ?? undefined,
          discountRulesJson: discountRulesJson as any,
          lateFeePercentage: parsed.data.lateFeePercentage,
          compoundLateFee: parsed.data.compoundLateFee,
          taxPercentage: parsed.data.taxPercentage,
          activeTo,
          updatedBy: user.userId,
        },
        create: {
          campusId,
          classId: parsed.data.classId,
          monthlyFee: parsed.data.monthlyFee,
          oneTimeFeesJson: oneTimeFeesJson as any,
          installmentType: parsed.data.installmentType ?? undefined,
          discountRulesJson: discountRulesJson as any,
          lateFeePercentage: parsed.data.lateFeePercentage,
          compoundLateFee: parsed.data.compoundLateFee,
          taxPercentage: parsed.data.taxPercentage,
          activeFrom,
          activeTo,
          createdBy: user.userId,
        },
        include: { class: { select: { id: true, name: true, section: true } } },
      });

      return Response.json({ success: true, feeStructure });
    }

    if (action === "generate-invoices") {
      const parsed = generateInvoicesSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

      const campusId = await resolveCampusId(user, body.campusId);
      const { start: invoiceDate, end: nextMonth } = invoiceMonthDates(parsed.data.generationMonth);
      const dueDate = new Date(nextMonth.getTime() - 86400000);
      const result = await invoiceGenerationTransaction(user, campusId, async tx => {
        const students = await tx.student.findMany({
          where: { schoolId: user.schoolId, campusId, archivedAt: null, status: { equals: "active", mode: "insensitive" }, class: { campusId, archivedAt: null, status: "ACTIVE", ...(parsed.data.classId ? { id: parsed.data.classId } : {}) } },
          select: { id: true, classId: true, class: { select: { academicYear: true } } },
        });
        if (!students.length) throw new ApiError("No active students found", 404);
        const structures = await tx.feeStructure.findMany({ where: { campusId, classId: { in: [...new Set(students.map(student => student.classId))] }, activeFrom: { lte: invoiceDate }, OR: [{ activeTo: null }, { activeTo: { gte: invoiceDate } }] }, orderBy: { activeFrom: "desc" } });
        const existing = await existingMonthlyStudentInvoices(tx, user.schoolId, campusId, students.map(student => student.id), invoiceDate, nextMonth);
        const alreadyGenerated = new Set(existing.map(invoice => invoice.studentId));
        const enrollments = await tx.studentEnrollment.findMany({ where: { schoolId: user.schoolId, campusId, studentId: { in: students.map(student => student.id) }, NOT: { origin: { startsWith: "LEGACY" } } }, select: { id: true, studentId: true, classId: true, academicYear: true, startDate: true, endDate: true } });
        const localeSnapshot = await getLocalePackage(user.schoolId, campusId, invoiceDate, undefined, tx);
        let created = 0;
        for (const student of students) {
          if (alreadyGenerated.has(student.id)) continue;
          const invoiceContext = invoiceEnrollmentContext(enrollments.filter(period => period.studentId === student.id && period.classId === student.classId && period.academicYear === student.class.academicYear), invoiceDate, dueDate);
          if (!invoiceContext) throw new ApiError("Review student enrollment for this billing period before generating invoices", 409);
          const structure = structures.find(item => item.classId === student.classId);
          if (!structure) throw new ApiError("Fee structure not found for a selected class and period", 404);
          try { minorUnits(structure.currency); } catch { throw new ApiError("Review the configured fee currency", 422); }
          const entries = Object.values((structure.oneTimeFeesJson as Record<string, unknown>) ?? {});
          if (entries.some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_INVOICE_MINOR)) throw new ApiError("Review configured fee amounts", 422);
          const oneTimeFees = (entries as number[]).reduce((sum, value) => sum + value, 0);
          const subtotal = structure.monthlyFee + oneTimeFees;
          if (![structure.monthlyFee, oneTimeFees, subtotal].every(value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_INVOICE_MINOR)) throw new ApiError("Review configured fee amounts", 422);
          await tx.invoice.create({ data: { schoolId: user.schoolId, campusId, studentId: student.id, enrollmentId: invoiceContext.enrollmentId, currency: structure.currency, localeSnapshot: { ...localeSnapshot, currency: structure.currency }, monthlyFee: structure.monthlyFee, oneTimeFees, subtotal, totalAmount: subtotal, totalAmountPaid: 0, balanceDue: subtotal, invoiceDate: new Date(`${invoiceContext.invoiceDate}T00:00:00.000Z`), dueDate, status: "PENDING" } });
          created++;
        }
        await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "invoices", recordId: `batch-${parsed.data.generationMonth}`, newValue: { month: parsed.data.generationMonth, created, skipped: alreadyGenerated.size } } });
        return { created, skipped: alreadyGenerated.size, total: students.length };
      });
      if (result.created > 0) await triggerFeeDueReminders({ schoolId: user.schoolId, campusId });
      return Response.json({ success: true, ...result });
    }

    if (action === "record-payment") {
      const parsed = paymentSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

      const invoice = await prisma.invoice.findFirst({
        where: { id: parsed.data.invoiceId, campus: { schoolId: user.schoolId } },
        include: { payments: { select: { amount: true } }, student: { select: { id: true, campusId: true } } },
      });
      if (!invoice) throw new ApiError("Invoice not found", 404);
      if (user.role !== "SUPER_ADMIN" && invoice.campusId !== user.campusId) {
        throw new ApiError("Invoice is outside your campus", 403);
      }

      const paidBefore = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const balanceBefore = Math.max(invoice.totalAmount - paidBefore, 0);
      if (parsed.data.amount > balanceBefore) {
        throw new ApiError(`Payment exceeds remaining balance of Rs ${balanceBefore}`, 400);
      }

      const { payment } = await prisma.$transaction(tx => recordPayment(tx, {
        campusId: invoice.campusId, invoiceId: invoice.id, studentId: invoice.studentId,
        amount: parsed.data.amount, paymentDate: new Date(parsed.data.paymentDate),
        paymentMethod: parsed.data.paymentMethod, referenceNumber: parsed.data.referenceNumber,
        recordedBy: user.userId,
      }), { isolationLevel: "Serializable" });
      const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const totalPaid = updatedInvoice.totalAmountPaid;
      const status = updatedInvoice.status;

      return Response.json({
        success: true,
        payment,
        invoice: updatedInvoice,
        status,
        totalPaid,
        balanceDue: Math.max(updatedInvoice.totalAmount - totalPaid, 0),
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "[billing] POST failed");
  }
}
