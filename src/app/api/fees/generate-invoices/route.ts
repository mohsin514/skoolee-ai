import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { existingMonthlyStudentInvoices, invoiceGenerationTransaction } from "@/lib/fees/invoice-generation";
import { invoiceEnrollmentContext } from "@/lib/fees/invoice-context";
import { minorUnits } from "@/lib/locale/package";
import { activationFor, issueDocuments, taxForActivation } from "@/lib/tax/service";
import { classYearKey, loadInvoiceGenerationInputs, memoByKey } from "@/lib/fees/invoice-generation-inputs";
import { calculateInvoiceAmounts, invoiceMonthDates, MAX_INVOICE_MINOR } from "@/lib/school-ai/fee-invoices";
import { evaluateFeeCap, feeCapDecision } from "@/lib/fees/regulator-cap";
import { generateInvoicesSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  assertPermission,
  canManageFinance,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { feeStructureActiveWhere, invoiceBatchStatus, pickStructureForClass } from "@/lib/fees/structure-year";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKAI-1968: rows per bulk insert. All chunks stay inside the one generation transaction, so a batch is still all-or-nothing.
const INVOICE_CHUNK = 500;

function generateInvoiceNumber(campusId: string, year: number, sequence: number): string {
  const shortId = campusId.split("-").pop()?.slice(0, 4).toUpperCase() ?? "XX";
  return `INV-${year}-${shortId}-${String(sequence).padStart(5, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await parseBody(req, jsonObjectBody);
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
        status: { equals: "active", mode: "insensitive" },
        class: classWhere,
      },
      include: {
        class: true,
      },
    });

    // SKAI-1946: nobody to bill is an empty result, not a missing resource, so it answers 200 with a zero count.
    if (students.length === 0) return null;

    const existingInvoices = await existingMonthlyStudentInvoices(tx, user.schoolId, campusId, students.map(student => student.id), invoiceDate, nextMonth);
    if (existingInvoices.length > 0) {
      throw new ApiError(
        `Invoices already exist for ${existingInvoices.length} student(s) this month`,
        409
      );
    }

    const feeStructures = await tx.feeStructure.findMany({
      where: {
        campusId,
        ...feeStructureActiveWhere(invoiceDate, dueDate),
      },
      include: { class: true, academicYear: { select: { academicYear: true } } },
      orderBy: { activeFrom: "desc" },
    });

    // SKAI-1123: a class is billed from the structure priced for its own academic year.
    const feeMap = new Map<string, typeof feeStructures[number]>();
    for (const student of students) {
      if (feeMap.has(student.classId)) continue;
      const picked = pickStructureForClass(feeStructures, student.classId, student.class.academicYear);
      if (picked) feeMap.set(student.classId, picked);
    }
    // SKAI-1254: the school's regulator fee-cap policy (OFF unless the school opted in).
    const capSchool = await tx.school.findUnique({ where: { id: user.schoolId }, select: { feeCapMode: true } });
    const capMode = capSchool?.feeCapMode ?? "OFF";
    const enrollments = await tx.studentEnrollment.findMany({ where: { schoolId: user.schoolId, campusId, studentId: { in: students.map(student => student.id) }, NOT: { origin: { startsWith: "LEGACY" } } }, select: { id: true, studentId: true, classId: true, academicYear: true, startDate: true, endDate: true } });

    const maxSeq = await tx.invoice.findFirst({
      where: { campusId, invoiceNumber: { startsWith: generateInvoiceNumber(campusId, year, 0).slice(0, -5) } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    let sequence = maxSeq?.invoiceNumber
      ? parseInt(maxSeq.invoiceNumber.split("-").pop() ?? "0", 10) + 1
      : 1;

    const results: Array<{ studentId: string; status: string; error?: string }> = [];
    // SKAI-1814: read every per-student input once for the batch instead of once per student.
    const inputs = await loadInvoiceGenerationInputs(tx, { schoolId: user.schoolId, campusId }, students, Boolean(parsed.data.includeLateFees));
    const enrollmentsByStudent = new Map<string, typeof enrollments>();
    for (const period of enrollments) { const list = enrollmentsByStudent.get(period.studentId); if (list) list.push(period); else enrollmentsByStudent.set(period.studentId, [period]); }
    const activationOn = memoByKey(day => activationFor(tx, user.schoolId, campusId, new Date(`${day}T00:00:00.000Z`)));
    let localeSnapshot: Awaited<ReturnType<typeof getLocalePackage>> | undefined;
    // SKAI-1968: validated rows are written in bulk after the loop instead of one insert (and one tax document) per student.
    const pending: Array<{ data: Prisma.InvoiceCreateManyInput; packageTax: ReturnType<typeof taxForActivation>; studentName: string }> = [];

    for (const student of students) {
      const invoiceContext = invoiceEnrollmentContext((enrollmentsByStudent.get(student.id) ?? []).filter(period => period.classId === student.classId && period.academicYear === student.class.academicYear), invoiceDate, dueDate);
      if (!invoiceContext) { results.push({ studentId: student.id, status: "error", error: "Review enrollment for this billing period before generating an invoice." }); continue; }
      // 1. New-model resolution (FeeGroupAssignment + lines + discounts + carry-forward)
      const assignment = inputs.assignmentByClassYear.get(classYearKey(student.classId, student.class.academicYear));

      let currency = "PKR";
      let monthlyFee = 0;
      let oneTimeTotal = 0;
      let subtotal = 0;
      let discountAmount = 0;
      let taxAmount = 0;
      let lateFeeAmount = 0;
      // SKAI-1154: the regulator-approved fee printed on the invoice (legacy fee structures only).
      let approvedFee: number | null = null;
      let approvedFeeReference: string | null = null;
      // SKO-444: the fee lines this invoice charges, for an approved country package to tax.
      let taxLines: { code: string; name: string; amount: number }[] = [];

      if (assignment) {
        currency = assignment.feeGroup.currency;
        const lines = assignment.feeGroup.lines.filter(line => !line.dueDate || line.dueDate >= invoiceDate && line.dueDate < nextMonth).map((line) => ({
          id: line.id,
          name: line.feeType.name,
          code: line.feeType.code,
          amount: line.amount,
          dueDate: line.dueDate?.toISOString().slice(0, 10) ?? null,
        }));

        const categoryDiscounts = student.categoryId
          ? (inputs.categoryDiscountsByCategory.get(student.categoryId) ?? []).map(({ categoryId: _categoryId, ...discount }) => discount)
          : [];
        const explicitAssignments = inputs.explicitDiscountsByStudent.get(student.id) ?? [];
        const seen = new Set(categoryDiscounts.map((d) => d.id));
        const discounts = [
          ...categoryDiscounts.map((d) => ({ ...d, type: d.type as "PERCENT" | "FLAT", source: "CATEGORY" as const })),
          ...explicitAssignments
            .filter((a) => !seen.has(a.discount.id))
            .map((a) => ({ ...a.discount, type: a.discount.type as "PERCENT" | "FLAT", source: "EXPLICIT" as const })),
        ];

        const carryForward = inputs.carryForwardByStudentYear.get(classYearKey(student.id, student.class.academicYear));

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
          taxLines = lines.filter(line => line.amount > 0).map(line => ({ code: line.code, name: line.name, amount: line.amount }));
        } catch { results.push({ studentId: student.id, status: "error", error: "Review fee and discount amounts." }); continue; }
        // SKAI-1254: a fee-group invoice prints the class's approved fee and is checked against it, like a per-class fee.
        const classStructure = feeMap.get(student.classId);
        approvedFee = classStructure?.approvedFee ?? null;
        approvedFeeReference = classStructure?.approvedFeeReference ?? null;
        const cap = feeCapDecision(evaluateFeeCap({ mode: capMode, fee: monthlyFee, approvedFee }), capMode);
        if (cap.error) { results.push({ studentId: student.id, status: "error", error: cap.error }); continue; }
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
        approvedFee = feeStructure.approvedFee ?? null;
        approvedFeeReference = feeStructure.approvedFeeReference ?? null;
        subtotal = monthlyFee + oneTimeTotal;
        discountAmount = Math.round(subtotal * Math.min(discountPct, 100) / 100);

        taxLines = [{ code: "MONTHLY_FEE", name: "Monthly fee", amount: monthlyFee }, ...Object.entries(oneTimeFees).filter(([, v]) => v > 0).map(([name, amount]) => ({ code: name, name, amount }))];
        const taxPct = feeStructure.taxPercentage ?? 0;
        taxAmount = taxPct > 0
          ? Math.round((subtotal - discountAmount) * taxPct / 100)
          : 0;

        if (parsed.data.includeLateFees) {
          const prevInvoice = inputs.latestOpenInvoiceByStudent.get(student.id);
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

      // SKO-444: when an approved country package covers this campus on the invoice date, its rules decide the
      // tax (the legacy per-structure percentage applies only where no package does). Late fees stay untaxed.
      let packageTax: ReturnType<typeof taxForActivation> = null;
      try { packageTax = taxForActivation(await activationOn(invoiceContext.invoiceDate), currency, taxLines, discountAmount); }
      catch (error) { results.push({ studentId: student.id, status: "error", error: error instanceof Error ? error.message : "Review the invoice package." }); continue; }
      if (packageTax) taxAmount = packageTax.calc.tax;
      const totalAmount = subtotal - discountAmount + lateFeeAmount + taxAmount;
      try { minorUnits(currency); } catch { results.push({ studentId: student.id, status: "error", error: "Review the configured fee currency." }); continue; }
      if ([monthlyFee, oneTimeTotal, subtotal, discountAmount, lateFeeAmount, taxAmount, totalAmount].some(value => !Number.isSafeInteger(value) || value < 0 || value > MAX_INVOICE_MINOR) || discountAmount > subtotal) { results.push({ studentId: student.id, status: "error", error: "Review fee, discount and tax amounts." }); continue; }

      localeSnapshot ??= await getLocalePackage(user.schoolId, campusId, invoiceDate, undefined, tx);
      pending.push({
        packageTax,
        studentName: student.fullName,
        data: {
          campusId,
          studentId: student.id,
          currency,
          localeSnapshot: { ...localeSnapshot, currency },
          invoiceNumber: generateInvoiceNumber(campusId, year, sequence++),
          invoiceDate: new Date(`${invoiceContext.invoiceDate}T00:00:00.000Z`),
          enrollmentId: invoiceContext.enrollmentId,
          dueDate,
          monthlyFee,
          approvedFee,
          approvedFeeReference,
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

    const createdByNumber = new Map<string, { id: string; invoiceDate: Date }>();
    for (let start = 0; start < pending.length; start += INVOICE_CHUNK) {
      const rows = await tx.invoice.createManyAndReturn({ data: pending.slice(start, start + INVOICE_CHUNK).map(row => row.data), select: { id: true, invoiceNumber: true, invoiceDate: true } });
      for (const row of rows) if (row.invoiceNumber) createdByNumber.set(row.invoiceNumber, row);
    }
    // Tax documents follow student order, so their numbers run in the same order as the invoice numbers.
    await issueDocuments(tx, user.schoolId, pending.flatMap(({ data, packageTax, studentName }) => {
      const created = createdByNumber.get(data.invoiceNumber!);
      if (!packageTax) return [];
      if (!created) throw new Error(`Invoice ${data.invoiceNumber} was not created`);
      return [{ invoice: { id: created.id, campusId, invoiceNumber: data.invoiceNumber!, invoiceDate: created.invoiceDate, studentName }, tax: packageTax }];
    }));

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
    if (!committed) {
      return Response.json({ success: false, error: "No active students found for this class/campus", totalStudents: 0, generated: 0, errors: [] });
    }
    const { generated, errors } = committed;
    const status = invoiceBatchStatus(generated, errors.length);
    if (status !== 201) {
      return Response.json(
        { success: false, error: `No invoices generated: ${errors[0]?.error ?? "review the class setup"}`, totalStudents: committed.totalStudents, generated, errors },
        { status }
      );
    }

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
        // SKAI-1765: generation runs synchronously and its result is this response; no pseudo job ID is issued.
        success: true,
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
