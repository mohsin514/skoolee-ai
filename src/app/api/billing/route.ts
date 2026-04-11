// ─────────────────────────────────────────────────────────────────
// Diagram 3 — Billing APIs
// POST /api/billing/fee-structures   — Create/update fee structure
// GET  /api/billing/fee-structures   — Get fee structures for campus
// POST /api/billing/invoices/generate — Bulk generate invoices
// GET  /api/billing/invoices         — List invoices
// PATCH /api/billing/invoices/[id]   — Mark as paid
// POST /api/billing/payments         — Record a payment
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { feeStructureSchema, generateInvoicesSchema, paymentSchema } from "@/lib/validators/schemas";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const campusId = searchParams.get("campusId") || user.campusId;

  const feeStructures = await prisma.feeStructure.findMany({
    where: { campusId: campusId || undefined },
    include: { class: { select: { name: true, section: true } } },
    orderBy: { term: "asc" },
  });

  return Response.json({ success: true, feeStructures });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "create-fee-structure") {
    const parsed = feeStructureSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const fs = await prisma.feeStructure.upsert({
      where: { classId_term: { classId: parsed.data.classId, term: parsed.data.term } },
      update: {
        tuitionMonthly: parsed.data.tuitionMonthly,
        examFee: parsed.data.examFee,
        annualFee: parsed.data.annualFee,
        monthsCount: parsed.data.monthsCount,
      },
      create: {
        campusId: parsed.data.campusId,
        classId: parsed.data.classId,
        term: parsed.data.term,
        tuitionMonthly: parsed.data.tuitionMonthly,
        examFee: parsed.data.examFee || 0,
        annualFee: parsed.data.annualFee || 0,
        monthsCount: parsed.data.monthsCount || 1,
      },
    });
    return Response.json({ success: true, feeStructure: fs });
  }

  if (action === "generate-invoices") {
    const parsed = generateInvoicesSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { campusId, classId, term, academicYear, dueDate } = parsed.data;

    // Get fee structure for this class/term
    const feeStructure = await prisma.feeStructure.findUnique({
      where: { classId_term: { classId, term } },
    });
    if (!feeStructure) return Response.json({ error: "Fee structure not found for this class/term" }, { status: 404 });

    // Get all students in class
    const students = await prisma.student.findMany({ where: { classId, campusId } });
    if (students.length === 0) return Response.json({ error: "No students found in this class" }, { status: 404 });

    // Calculate total per student
    const totalAmount = (feeStructure.tuitionMonthly * feeStructure.monthsCount) + feeStructure.examFee + feeStructure.annualFee;

    // Bulk create invoices (skip if exists)
    const invoices = await Promise.allSettled(
      students.map((student) =>
        prisma.invoice.create({
          data: {
            campusId,
            studentId: student.id,
            term,
            academicYear,
            totalAmount,
            dueDate: new Date(dueDate),
            status: "PENDING",
          },
        }).catch(() => null) // Skip duplicates
      )
    );

    const created = invoices.filter((r) => r.status === "fulfilled" && r.value !== null).length;
    return Response.json({ success: true, created, total: students.length });
  }

  if (action === "record-payment") {
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { invoiceId, amountPaid, method, receiptNo } = parsed.data;

    // Get invoice
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });

    // Record payment
    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amountPaid,
        method,
        receiptNo,
        recordedBy: user.userId,
      },
    });

    // Calculate total paid
    const allPayments = await prisma.payment.aggregate({
      where: { invoiceId },
      _sum: { amountPaid: true },
    });
    const totalPaid = allPayments._sum.amountPaid || 0;

    // Update invoice status
    let status: "PAID" | "PARTIAL" | "PENDING" = "PENDING";
    if (totalPaid >= invoice.totalAmount) status = "PAID";
    else if (totalPaid > 0) status = "PARTIAL";

    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

    return Response.json({ success: true, payment, status, totalPaid });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
