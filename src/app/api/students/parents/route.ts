import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// Existing-parent lookup for the admissions "pick a guardian" step.
// GET /api/students/parents?search= — PARENT users (campus-scoped) whose name,
//   phone or email matches, with their children attached so the picker can
//   auto-link the new student into the same sibling group.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Staff-only guardian lookup: campus-wide parent contact details and their
    // children. Families must never enumerate other families.
    assertStaffRole(user);
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    if (!search || search.length < 2) return Response.json({ success: true, data: [] });

    const parents = await prisma.user.findMany({
      where: {
        role: "PARENT",
        campusId,
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          ...(search.includes("@") || /\d/.test(search)
            ? [
                { email: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search, mode: "insensitive" as const } },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        parentedStudents: {
          select: {
            id: true,
            fullName: true,
            rollNo: true,
            siblingGroupId: true,
            class: { select: { name: true, section: true } },
          },
          take: 6,
        },
      },
      orderBy: { fullName: "asc" },
      take: 8,
    });

    return Response.json({ success: true, data: parents });
  } catch (error) {
    return errorResponse(error, "[students/parents] GET failed");
  }
}