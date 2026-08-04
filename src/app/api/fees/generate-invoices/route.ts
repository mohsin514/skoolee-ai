import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateInvoicesSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";

function generateInvoiceNumber(campusId: string, year: number, sequence: number): string {
  const shortId = campusId.split("-").pop()?.slice(0, 4).toUpperCase() ?? "XX";
  return `INV-${year}-${shortId}-${String(sequence).padStart(5, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const parsed = generateInvoicesSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(flat).map(([k, v]) => `${k}: ${v?.join(", ")}`).join("; ");
      return Response.json({ error: msg || "Validation failed" }, { status: 400 });
    }

    const campusId = await resolveCampusId(user, body.campusId);
    const [year, month] = parsed.data.generationMonth.split("-").map(Number);
    const dueDate = new Date(year, month, 0);

    const invoiceDate = new Date(year, month - 1, 1);

    const classWhere: any = { campusId };
    if (parsed.data.classId) classWhere.id = parsed.data.classId;

    const students = await prisma.student.findMany({
      where: {
        campusId,
        status: "active",
        class: classWhere,
      },
      include: {
        class: true,
        invoices: {
          where: {
            invoiceDate: {
              gte: new Date(year, month - 1, 1),
              lt: new Date(year, month, 1),
            },
          },
          select: { id: true },
        },
      },
    });

    if (students.length === 0) {
      throw new ApiError("No active students found for this class/campus", 404);
    }

    const existingInvoices = students.filter((s) => s.invoices.length > 0);
    if (existingInvoices.length > 0) {
      throw new ApiError(
        `Invoices already exist for ${existingInvoices.length} student(s) this month`,
        409
      );
    }

    const feeStructures = await prisma.feeStructure.findMany({
      where: {
        campusId,
        activeFrom: { lte: dueDate },
        AND: [
          { activeTo: null },
          { OR: [{ activeTo: { gte: invoiceDate } }, { activeTo: null }] },
        ],
      },
      include: { class: true },
    });

    const feeMap = new Map(feeStructures.map((fs) => [fs.classId, fs]));

    const maxSeq = await prisma.invoice.findFirst({
      where: { campusId },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    let sequence = maxSeq?.invoiceNumber
      ? parseInt(maxSeq.invoiceNumber.split("-").pop() ?? "0", 10) + 1
      : 1;

    const results: Array<{ studentId: string; status: string; error?: string }> = [];

    for (const student of students) {
      const feeStructure = feeMap.get(student.classId);
      if (!feeStructure) {
        results.push({ studentId: student.id, status: "error", error: "No fee structure for class" });
        continue;
      }

      const monthlyFee = feeStructure.monthlyFee;
      const oneTimeFees: Record<string, number> = (feeStructure.oneTimeFeesJson as Record<string, number>) ?? {};
      const oneTimeTotal = Object.values(oneTimeFees).reduce((sum, v) => sum + v, 0);

      const grossDues: Record<string, number> = (feeStructure.discountRulesJson as Record<string, number>) ?? {};
      const discountPct = Object.values(grossDues).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
      const discountAmount = Math.round((monthlyFee + oneTimeTotal) * Math.min(discountPct, 100) / 100);

      const subtotal = monthlyFee + oneTimeTotal;
      const taxPct = feeStructure.taxPercentage ?? 0;
      const taxAmount = taxPct > 0
        ? Math.round((subtotal - discountAmount) * taxPct / 100)
        : 0;

      let lateFeeAmount = 0;
      if (parsed.data.includeLateFees) {
        const prevInvoice = await prisma.invoice.findFirst({
          where: { studentId: student.id, status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { dueDate: "desc" },
        });
        if (prevInvoice) {
          const daysOverdue = Math.floor((invoiceDate.getTime() - prevInvoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysOverdue > 0) {
            const monthsOverdue = Math.ceil(daysOverdue / 30);
            let lateBase = prevInvoice.balanceDue;
            for (let i = 0; i < monthsOverdue; i++) {
              const fee = Math.round(lateBase * (feeStructure.lateFeePercentage ?? 2.0) / 100);
              lateFeeAmount += fee;
              if (feeStructure.compoundLateFee) lateBase += fee;
            }
          }
        }
      }

      const totalAmount = subtotal - discountAmount + lateFeeAmount + taxAmount;

      const invoice = await prisma.invoice.create({
        data: {
          campusId,
          studentId: student.id,
          invoiceNumber: generateInvoiceNumber(campusId, year, sequence++),
          invoiceDate,
          dueDate,
          monthlyFee,
          oneTimeFees: oneTimeTotal,
          subtotal,
          discountAmount,
          lateFeeAmount,
          taxAmount,
          totalAmount,
          totalAmountPaid: 0,
          balanceDue: totalAmount,
          status: "PENDING",
        },
      });

      results.push({ studentId: student.id, status: "generated" });
    }

    await prisma.auditLog.create({
      data: {
        tableName: "invoice",
        recordId: `batch-${parsed.data.generationMonth}`,
        newValue: { month: parsed.data.generationMonth, count: results.length, errors: results.filter((r) => r.error).length },
        userId: user.userId,
      },
    });

    const generated = results.filter((r) => r.status === "generated").length;
    const errors = results.filter((r) => r.error);

    notify("INVOICES_GENERATED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      count: generated,
      className: students[0]?.class?.name,
    });

    return Response.json(
      {
        success: true,
        jobId: `invoice-gen-${parsed.data.generationMonth}`,
        status: "completed",
        totalStudents: students.length,
        generated,
        errors,
        message: `Generated ${generated} invoices for ${parsed.data.generationMonth}`,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[fees/generate-invoices] POST failed");
  }
}
