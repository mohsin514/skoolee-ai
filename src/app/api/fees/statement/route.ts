import { getLocalePackage } from "@/lib/locale/store";
import { CURRENCIES } from "@/lib/locale/package";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertSharedModuleRead,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { resolveStudentFees } from "@/lib/fees/compute";
import { studentScope } from "@/lib/auth/policy";

// GET /api/fees/statement?studentId=&academicYear=
// Full fee statement for a student: resolved lines + discounts + carry-forward,
// plus every invoice and payment with running balance.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const year = Number(searchParams.get("academicYear") ?? new Date().getFullYear());

    if (!studentId) throw new ApiError("studentId required", 400);
    if (!Number.isInteger(year)) throw new ApiError("invalid academicYear", 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user, "finances") },
      select: {
        id: true,
        fullName: true,
        rollNo: true,
        campusId: true,
        classId: true,
        categoryId: true,
        class: { select: { id: true, name: true, section: true } },
      },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const currency = searchParams.get("currency") || (await getLocalePackage(user.schoolId, student.campusId)).currency;
    if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) throw new ApiError("Invalid currency", 400);
    // Resolve current-year obligation
    const assignment = await prisma.feeGroupAssignment.findFirst({
      where: { campusId: student.campusId, classId: student.classId, academicYear: year },
      include: {
        feeGroup: {
          include: { lines: { include: { feeType: { select: { id: true, name: true, code: true } } } } },
        },
      },
    });

    let resolved = null;
    if (assignment && assignment.feeGroup.currency === currency) {
      const lines = assignment.feeGroup.lines.map((line) => ({
        id: line.id,
        typeName: line.feeType.name,
        typeCode: line.feeType.code,
        amount: line.amount,
        dueDate: line.dueDate,
      }));

      const categoryDiscounts = student.categoryId
        ? await prisma.feeDiscount.findMany({
            where: { campusId: student.campusId, categoryId: student.categoryId },
            select: { id: true, name: true, code: true, type: true, value: true, currency: true },
          })
        : [];
      const explicit = await prisma.feeDiscountAssignment.findMany({
        where: { studentId: student.id },
        include: { discount: { select: { id: true, name: true, code: true, type: true, value: true, currency: true } } },
      });
      const seen = new Set(categoryDiscounts.map((d) => d.id));
      const discounts = [
        ...categoryDiscounts.map((d) => ({ ...d, type: d.type as "PERCENT" | "FLAT", source: "CATEGORY" as const })),
        ...explicit
          .filter((a) => !seen.has(a.discount.id))
          .map((a) => ({ ...a.discount, type: a.discount.type as "PERCENT" | "FLAT", source: "EXPLICIT" as const })),
      ];

      const carry = await prisma.feeCarryForward.findUnique({
        where: { studentId_toAcademicYear: { studentId: student.id, toAcademicYear: year } },
      });

      if (discounts.some((d) => d.type === "FLAT" && d.currency !== currency) || (carry && carry.balance !== 0 && carry.currency !== currency)) throw new ApiError("Currencies cannot be combined in a fee statement", 409);
      resolved = resolveStudentFees(lines, discounts, carry?.balance ?? 0);
    }

    // Invoice history
    const invoices = await prisma.invoice.findMany({
      where: { studentId: student.id, currency },
      orderBy: { invoiceDate: "desc" },
      include: {
        payments: { orderBy: { paymentDate: "desc" } },
      },
    });

    const statement = invoices.map((inv) => {
      const paid = inv.totalAmountPaid;
      return {
        id: inv.id,
        currency: inv.currency,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString().split("T")[0],
        dueDate: inv.dueDate.toISOString().split("T")[0],
        subtotal: inv.subtotal,
        discountAmount: inv.discountAmount,
        lateFeeAmount: inv.lateFeeAmount,
        taxAmount: inv.taxAmount,
        totalAmount: inv.totalAmount,
        totalPaid: paid,
        balanceDue: inv.balanceDue,
        status: inv.status,
        payments: inv.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          fineAmount: p.fineAmount,
          discountAmount: p.discountAmount,
          receiptNo: p.receiptNo,
          paymentMethod: p.paymentMethod,
          paymentDate: p.paymentDate.toISOString().split("T")[0],
          referenceNumber: p.referenceNumber,
          note: p.note,
        })),
      };
    });

    const totalDue = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.totalAmountPaid, 0);
    const totalFines = invoices.reduce(
      (s, i) => s + i.payments.reduce((ps, p) => ps + p.fineAmount, 0),
      0
    );

    return Response.json({
      success: true,
      data: {
        student: { id: student.id, fullName: student.fullName, rollNo: student.rollNo, class: student.class },
        academicYear: year,
        resolved,
        invoices: statement,
        currency,
        totals: { currency, totalDue, totalPaid, balance: totalDue - totalPaid, totalFines },
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/statement] GET failed");
  }
}
