import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { feeStructureSchema, generateInvoicesSchema, paymentSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageBilling,
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
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const classId = searchParams.get("classId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const [billing, feeStructures] = await Promise.all([
      getBillingSnapshot(user.schoolId),
      prisma.feeStructure.findMany({
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
      }),
    ]);

    return Response.json({ success: true, billing, feeStructures });
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
      const [year, month] = parsed.data.generationMonth.split("-").map(Number);
      const invoiceDate = new Date(year, month - 1, 1);
      const dueDate = new Date(year, month, 0);

      const classWhere: any = { campusId };
      if (parsed.data.classId) classWhere.id = parsed.data.classId;

      const students = await prisma.student.findMany({
        where: { campusId, status: "active", class: classWhere },
        select: { id: true, classId: true },
      });
      if (students.length === 0) throw new ApiError("No active students found", 404);

      const feeStructure = await prisma.feeStructure.findFirst({
        where: {
          campusId,
          classId: parsed.data.classId || students[0].classId,
          activeFrom: { lte: invoiceDate },
          AND: [{ OR: [{ activeTo: null }, { activeTo: { gte: invoiceDate } }] }],
        },
      });
      if (!feeStructure) throw new ApiError("Fee structure not found for this period", 404);

      const existingInvoices = await prisma.invoice.findMany({
        where: { studentId: { in: students.map((s) => s.id) }, invoiceDate },
        select: { studentId: true },
      });
      const alreadyGenerated = new Set(existingInvoices.map((inv) => inv.studentId));

      const oneTimeFees: Record<string, number> = (feeStructure.oneTimeFeesJson as Record<string, number>) ?? {};
      const oneTimeTotal = Object.values(oneTimeFees).reduce((sum, v) => sum + v, 0);
      const subtotal = feeStructure.monthlyFee + oneTimeTotal;
      const totalAmount = subtotal;

      const created = await prisma.$transaction(
        students
          .filter((s) => !alreadyGenerated.has(s.id))
          .map((student) =>
            prisma.invoice.create({
              data: {
                campusId,
                studentId: student.id,
                monthlyFee: feeStructure.monthlyFee,
                oneTimeFees: oneTimeTotal,
                subtotal,
                totalAmount,
                totalAmountPaid: 0,
                balanceDue: totalAmount,
                invoiceDate,
                dueDate,
                status: "PENDING",
              },
            })
          )
      );

      if (created.length > 0) {
        await triggerFeeDueReminders({ schoolId: user.schoolId, campusId });
      }

      return Response.json({ success: true, created: created.length, skipped: alreadyGenerated.size, total: students.length });
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

      const receiptNo = `RCP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

      const payment = await prisma.payment.create({
        data: {
          campusId: invoice.campusId,
          invoiceId: invoice.id,
          studentId: invoice.student.id,
          amount: parsed.data.amount,
          paymentDate: new Date(parsed.data.paymentDate),
          paymentMethod: parsed.data.paymentMethod,
          referenceNumber: parsed.data.referenceNumber ?? null,
          receiptNo,
          recordedBy: user.userId,
        },
      });

      const totalPaid = paidBefore + parsed.data.amount;
      const newBalance = invoice.totalAmount - totalPaid;
      const status = newBalance <= 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmountPaid: totalPaid,
          balanceDue: Math.max(0, newBalance),
          status,
        },
      });

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
