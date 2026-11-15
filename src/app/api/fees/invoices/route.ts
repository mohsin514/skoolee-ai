import { assertListBudget } from "@/lib/lists/access";
import { listPagination, pageWindow } from "@/lib/lists/query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  ValidationError,
} from "@/lib/api/scope";
import { Prisma } from "@prisma/client";
import { parseInvoiceListFilters } from "@/lib/fees/invoice-list-filters";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertListBudget(user, "fees/invoices");
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);

    const requestedCampusId = searchParams.get("campusId");
    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId
        ? null
        : await resolveCampusId(user, requestedCampusId);

    const filters = parseInvoiceListFilters(searchParams);
    if (!filters.ok) throw new ValidationError(filters.fieldErrors);
    const { status, month } = filters;
    const classId = searchParams.get("classId");
    const search = searchParams.get("search");
    const { page: requestedPage, limit: pageSize } = listPagination(searchParams, 20, 50, "pageSize");

    const where: Prisma.InvoiceWhereInput = {
      campus: { schoolId: user.schoolId },
      ...(campusId ? { campusId } : {}),
      ...(status ? { status } : {}),
      ...(classId ? { enrollment: { classId } } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { student: { fullName: { contains: search, mode: "insensitive" } } },
              { student: { rollNo: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(month
        ? {
            invoiceDate: {
              gte: new Date(`${month}-01`),
              lt: new Date(
                new Date(`${month}-01`).getFullYear(),
                new Date(`${month}-01`).getMonth() + 1,
                1
              ),
            },
          }
        : {}),
    };

    const total = await prisma.invoice.count({ where });
    const { page } = pageWindow(total, requestedPage, pageSize);
    const invoices = await prisma.invoice.findMany({
        where,
        include: {
          enrollment: true,
          student: {
            select: {
              id: true,
              fullName: true,
              rollNo: true,
              class: { select: { name: true, section: true } },
            },
          },
        },
        orderBy: [{ invoiceDate: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

    return Response.json({
      success: true,
      data: invoices.map(invoice => invoice.enrollment ? { ...invoice, student: { ...invoice.student, rollNo: invoice.enrollment.rollNo, class: { name: invoice.enrollment.className, section: null } } } : invoice),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return errorResponse(error, "[fees/invoices] GET failed");
  }
}
