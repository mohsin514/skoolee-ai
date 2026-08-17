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
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);

    const requestedCampusId = searchParams.get("campusId");
    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId
        ? null
        : await resolveCampusId(user, requestedCampusId);

    const status = searchParams.get("status");
    const classId = searchParams.get("classId");
    const search = searchParams.get("search");
    const month = searchParams.get("month");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const where: Prisma.InvoiceWhereInput = {
      campus: { schoolId: user.schoolId },
      ...(campusId ? { campusId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(classId ? { student: { classId } } : {}),
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

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              rollNo: true,
              class: { select: { name: true, section: true } },
            },
          },
        },
        orderBy: { invoiceDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return Response.json({
      success: true,
      data: invoices,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return errorResponse(error, "[fees/invoices] GET failed");
  }
}
