import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { invoiceGenerationTransaction } from "@/lib/fees/invoice-generation";
import { calculateInvoiceAmounts, invoiceMonthDates, MAX_INVOICE_MINOR } from "@/lib/school-ai/fee-invoices";
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
    const { start: invoiceDate, end: nextMonth } = invoiceMonthDates(parsed.data.generationMonth);
    const year = invoiceDate.getUTCFullYear();
    const dueDate = new Date(nextMonth.getTime() - 86400000);
    const committed = await invoiceGenerationTransaction(user, campusId, async tx => {

    const classWhere = { campusId, schoolId: user.schoolId, archivedAt: null, status: "ACTIVE", ...(parsed.data.classId ? { id: parsed.data.classId } : {}) };

    const students = await tx.student.findMany({
      where: {
        schoolId: user.schoolId, campusId, archivedAt: null,
        status: "active",
        class: classWhere,
      },
      include: {
        class: true,
        invoices: {
          where: {
            invoiceDate: {
              gte: invoiceDate,
              lt: nextMonth,
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

    const feeStructures = await tx.feeStructure.findMany({
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

    const maxSeq = await tx.invoice.findFirst({
      where: { campusId, invoiceNumber: { startsWith: generateInvoiceNumber(campusId, year, 0).slice(0, -5) } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    let sequence = maxSeq?.invoiceNumber
      ? parseInt(maxSeq.invoiceNumber.split("-").pop() ?? "0", 10) + 1
      : 1;

    const results: Array<{ studentId: string; status: string; error?: string }> = [];

    for (const student of students) {
      // 1. New-model resolution (FeeGroupAssignment + lines + discounts + carry-forward)
      const assignment = await tx.feeGroupAssignment.findFirst({
        where: { campusId, classId: student.classId, academicYear: year },
        include: {
          feeGroup: {
            include: {
              lines: { include: { feeType: { select: { id: true, name: true, code: true } } } },
            },
          },
        },
      });

      let currency = "PKR";
      let monthlyFee = 0;
      let oneTimeTotal = 0;
      let subtotal = 0;
      let discountAmount = 0;
      let taxAmount = 0;
      let lateFeeAmount = 0;

      if (assignment) {
        currency = assignment.feeGroup.currency;
        const lines = assignment.feeGroup.lines.map((line) => ({
          id: line.id,
          name: line.feeType.name,
          code: line.feeType.code,
          amount: line.amount,
          dueDate: line.dueDate?.toISOString().slice(0, 10) ?? null,
        }));

        const categoryDiscounts = student.categoryId
          ? await tx.feeDiscount.findMany({
              where: { campusId, categoryId: student.categoryId },
              select: { id: true, name: true, code: true, type: true, value: true, currency: true },
            })
          : [];
        const explicitAssignments = await tx.feeDiscountAssignment.findMany({
          where: { studentId: student.id },
          include: { discount: { select: { id: true, name: true, code: true, type: true, value: true, currency: true } } },
        });
        const seen = new Set(categoryDiscounts.map((d) => d.id));
        const discounts = [
          ...categoryDiscounts.map((d) => ({ ...d, type: d.type as "PERCENT" | "FLAT", source: "CATEGORY" as const })),
          ...explicitAssignments
            .filter((a) => !seen.has(a.discount.id))
            .map((a) => ({ ...a.discount, type: a.discount.type as "PERCENT" | "FLAT", source: "EXPLICIT" as const })),
        ];

        const carryForward = await tx.feeCarryForward.findUnique({
          where: { studentId_toAcademicYear: { studentId: student.id, toAcademicYear: year } },
        });

        if (discounts.some((d) => d.type === "FLAT" && d.currency !== currency) || (carryForward && carryForward.balance !== 0 && carryForward.currency !== currency)) {
          results.push({ studentId: student.id, status: "error", error: "Currencies cannot be combined. Review the discount or carry-forward." }); continue;
        }
        if (carryForward?.balance) { results.push({ studentId: student.id, status: "error", error: "Review carry-forward allocation before generating another invoice." }); continue; }
        try {
          const resolved = calculateInvoiceAmounts(lines, discounts, currency);
          monthlyFee = resolved.monthlyFee;
          oneTimeTotal = resolved.oneTimeFees;
          subtotal = resolved.subtotal;
          discountAmount = resolved.discountAmount;
        } catch { results.push({ studentId: student.id, status: "error", error: "Review fee and discount amounts." }); continue; }
      } else {
        // 2. Legacy fallback: feeStructure per class
        const feeStructure = feeMap.get(student.classId);
        if (!feeStructure) {
          results.push({ studentId: student.id, status: "error", error: "No fee structure for class" });
          continue;
        }

        currency = feeStructure.currency;
        const oneTimeFees: Record<string, number> = (feeStructure.oneTimeFeesJson as Record<string, number>) ?? {};
        oneTimeTotal = Object.values(oneTimeFees).reduce((sum, v) => sum + v, 0);

        const grossDues: Record<string, number> = (feeStructure.discountRulesJson as Record<string, number>) ?? {};
        const discountPct = Object.values(grossDues).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

        monthlyFee = feeStructure.monthlyFee;
        subtotal = monthlyFee + oneTimeTotal;
        discountAmount = Math.round(subtotal * Math.min(discountPct, 100) / 100);

        const taxPct = feeStructure.taxPercentage ?? 0;
        taxAmount = taxPct > 0
          ? Math.round((subtotal - discountAmount) * taxPct / 100)
          : 0;

        if (parsed.data.includeLateFees) {
          const prevInvoice = await tx.invoice.findFirst({
            where: { studentId: student.id, status: { in: ["PENDING", "OVERDUE"] } },
            orderBy: { dueDate: "desc" },
          });
          if (prevInvoice && prevInvoice.currency !== currency) { results.push({ studentId: student.id, status: "error", error: "Cannot combine late fees across currencies" }); continue; }
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
      }

      const totalAmount = subtotal - discountAmount + lateFeeAmount + taxAmount;
      if ([monthlyFee, oneTimeTotal, subtotal, discountAmount, lateFeeAmount, taxAmount, totalAmount].some(value => !Number.isSafeInteger(value) || value < 0 || value > MAX_INVOICE_MINOR) || discountAmount > subtotal) { results.push({ studentId: student.id, status: "error", error: "Review fee, discount and tax amounts." }); continue; }

      const localeSnapshot = await getLocalePackage(user.schoolId, campusId, invoiceDate, undefined, tx);
      await tx.invoice.create({
        data: {
          campusId,
          studentId: student.id,
          currency,
          localeSnapshot,
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

    await tx.auditLog.create({
      data: {
        tableName: "invoice",
        recordId: `batch-${parsed.data.generationMonth}`,
        newValue: { month: parsed.data.generationMonth, count: results.length, errors: results.filter((r) => r.error).length },
        userId: user.userId,
      },
    });

    const generated = results.filter((r) => r.status === "generated").length;
    const errors = results.filter((r) => r.error);

    return { generated, errors, totalStudents: students.length, className: students[0]?.class?.name };
    });
    const { generated, errors } = committed;
    notify("INVOICES_GENERATED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      count: generated,
      className: committed.className,
    });

    return Response.json(
      {
        success: true,
        jobId: `invoice-gen-${parsed.data.generationMonth}`,
        status: "completed",
        totalStudents: committed.totalStudents,
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
