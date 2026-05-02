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
      orderBy: [{ class: { name: "asc" } }, { term: "asc" }],
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
      const parsed = feeStructureSchema.safeParse({
        ...body,
        campusId: user.role === "SUPER_ADMIN" ? body.campusId || "from-class" : user.campusId,
      });
      if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

      const cls = await scopedClass(body.classId, user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId);
      const feeStructure = await prisma.feeStructure.upsert({
        where: { classId_term: { classId: parsed.data.classId, term: parsed.data.term } },
        update: {
          tuitionMonthly: parsed.data.tuitionMonthly,
          examFee: parsed.data.examFee,
          annualFee: parsed.data.annualFee,
          monthsCount: parsed.data.monthsCount,
          campusId: cls.campusId,
        },
        create: {
          campusId: cls.campusId,
          classId: parsed.data.classId,
          term: parsed.data.term,
          tuitionMonthly: parsed.data.tuitionMonthly,
          examFee: parsed.data.examFee || 0,
          annualFee: parsed.data.annualFee || 0,
          monthsCount: parsed.data.monthsCount || 1,
        },
        include: { class: { select: { id: true, name: true, section: true } } },
      });

      return Response.json({ success: true, feeStructure });
    }

    if (action === "generate-invoices") {
      const parsed = generateInvoicesSchema.safeParse({
        ...body,
        campusId: user.role === "SUPER_ADMIN" ? body.campusId || "from-class" : user.campusId,
      });
      if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

      const cls = await scopedClass(parsed.data.classId, user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId);
      const feeStructure = await prisma.feeStructure.findFirst({
        where: { classId: cls.id, campusId: cls.campusId, term: parsed.data.term },
      });
      if (!feeStructure) throw new ApiError("Fee structure not found for this class and term", 404);

      const students = await prisma.student.findMany({
        where: { classId: cls.id, campusId: cls.campusId, campus: { schoolId: user.schoolId } },
        select: { id: true },
      });
      if (students.length === 0) throw new ApiError("No students found in this class", 404);

      const existingInvoices = await prisma.invoice.findMany({
        where: {
          studentId: { in: students.map((student) => student.id) },
          term: parsed.data.term,
          academicYear: parsed.data.academicYear,
        },
        select: { studentId: true },
      });
      const alreadyGenerated = new Set(existingInvoices.map((invoice) => invoice.studentId));
      const totalAmount =
        feeStructure.tuitionMonthly * feeStructure.monthsCount + feeStructure.examFee + feeStructure.annualFee;
      const dueDate = new Date(parsed.data.dueDate);
      if (Number.isNaN(dueDate.getTime())) throw new ApiError("Invalid due date", 400);

      const created = await prisma.$transaction(
        students
          .filter((student) => !alreadyGenerated.has(student.id))
          .map((student) =>
            prisma.invoice.create({
              data: {
                campusId: cls.campusId,
                studentId: student.id,
                term: parsed.data.term,
                academicYear: parsed.data.academicYear,
                totalAmount,
                dueDate,
                status: "PENDING",
              },
            })
          )
      );

      if (created.length > 0) {
        await triggerFeeDueReminders({ schoolId: user.schoolId, campusId: cls.campusId });
      }

      return Response.json({ success: true, created: created.length, skipped: alreadyGenerated.size, total: students.length });
    }

    if (action === "record-payment") {
      const parsed = paymentSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

      const invoice = await prisma.invoice.findFirst({
        where: { id: parsed.data.invoiceId, campus: { schoolId: user.schoolId } },
        include: { payments: { select: { amountPaid: true } } },
      });
      if (!invoice) throw new ApiError("Invoice not found", 404);
      if (user.role !== "SUPER_ADMIN" && invoice.campusId !== user.campusId) {
        throw new ApiError("Invoice is outside your campus", 403);
      }

      const paidBefore = invoice.payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
      const balanceBefore = Math.max(invoice.totalAmount - paidBefore, 0);
      if (parsed.data.amountPaid > balanceBefore) {
        throw new ApiError(`Payment exceeds remaining balance of Rs ${balanceBefore}`, 400);
      }

      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amountPaid: parsed.data.amountPaid,
          method: parsed.data.method,
          receiptNo: parsed.data.receiptNo,
          recordedBy: user.userId,
        },
      });

      const totalPaid = paidBefore + parsed.data.amountPaid;
      const status = totalPaid >= invoice.totalAmount ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status },
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
