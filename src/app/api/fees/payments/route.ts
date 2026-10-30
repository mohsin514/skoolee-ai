import { assertListBudget } from "@/lib/lists/access";
import { listPagination, pageWindow } from "@/lib/lists/query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertListBudget(user, "fees/payments");
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);

    const requestedCampusId = searchParams.get("campusId");
    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId
        ? null
        : await resolveCampusId(user, requestedCampusId);

    const method = searchParams.get("method");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const { page: requestedPage, limit: pageSize } = listPagination(searchParams, 20, 50, "pageSize");

    const where: Prisma.PaymentWhereInput = {
      campus: { schoolId: user.schoolId },
      ...(campusId ? { campusId } : {}),
      ...(method ? { paymentMethod: method } : {}),
      ...(dateFrom || dateTo
        ? {
            paymentDate: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { receiptNo: { contains: search, mode: "insensitive" } },
              { referenceNumber: { contains: search, mode: "insensitive" } },
              { student: { fullName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const total = await prisma.payment.count({ where });
    const { page } = pageWindow(total, requestedPage, pageSize);
    const payments = await prisma.payment.findMany({
        where,
        include: {
          student: {
            select: {
              fullName: true,
              rollNo: true,
              class: { select: { name: true, section: true } },
            },
          },
          invoice: {
            select: {
              invoiceNumber: true,
              currency: true,
              totalAmount: true,
              balanceDue: true,
              status: true,
            },
          },
        },
        orderBy: [{ paymentDate: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

    return Response.json({
      success: true,
      data: payments,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return errorResponse(error, "[fees/payments] GET failed");
  }
}
