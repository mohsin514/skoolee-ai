import { pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { UserRole } from "@prisma/client";
import { ownerPagination } from "@/lib/owner/list-query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertListBudget(user, "super/users");
    // G12: the institution authority (group admin, or the school admin of a single school), school-scoped.
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator can open this.", 403);

    const { searchParams } = new URL(req.url);
    const { page: requestedPage, limit } = ownerPagination(searchParams);
    const search = searchParams.get("search")?.trim() || "";
    const role = searchParams.get("role") || "";
    const campusId = searchParams.get("campusId") || "";
    const status = searchParams.get("status") || "";

    const where: any = { schoolId: user.schoolId };
    if (role && !Object.values(UserRole).includes(role as UserRole)) throw new ApiError("Choose a valid role", 400);
    if (role) where.role = role;
    if (campusId) where.campusId = campusId;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.user.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          onboardingComplete: true,
          lastLogin: true,
          lastPasswordChange: true,
          createdAt: true,
          campus: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      });

    return Response.json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    return errorResponse(error, "[super/users] GET failed");
  }
}
