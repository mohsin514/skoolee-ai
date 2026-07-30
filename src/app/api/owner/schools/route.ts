import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10), 1), 100);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "";
    const plan = searchParams.get("plan") || "";

    const where: any = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        where,
        include: {
          campuses: {
            select: {
              id: true,
              name: true,
              city: true,
              _count: { select: { students: true, users: true, classes: true } },
            },
          },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.school.count({ where }),
    ]);

    const data = schools.map((school) => ({
      id: school.id,
      name: school.name,
      slug: school.slug,
      contactEmail: school.contactEmail,
      city: school.city,
      status: school.status,
      plan: school.plan,
      aiCreditsUsed: school.aiCreditsUsed,
      aiCreditsLimit: school.aiCreditsLimit,
      createdAt: school.createdAt,
      campusCount: school.campuses.length,
      totalStudents: school.campuses.reduce((sum, c) => sum + c._count.students, 0),
      totalStaff: school.campuses.reduce((sum, c) => sum + c._count.users, 0),
      totalClasses: school.campuses.reduce((sum, c) => sum + c._count.classes, 0),
      campuses: school.campuses.map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        students: c._count.students,
        staff: c._count.users,
        classes: c._count.classes,
      })),
    }));

    return Response.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools] GET failed");
  }
}
