import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  scopedCampusWhere,
} from "@/lib/api/scope";

// GET /api/students/<id> — the full record behind one student.
//
// The roster used to carry every field for every student because the detail
// modal read them off the list item: address, medical notes, allergies,
// medications, special needs and the latest report card, for the whole campus,
// on every dashboard load. Only ever one student's worth is read at a time.
//
// Fetching it here means the list can carry the summary alone, and the most
// sensitive fields in the product leave the database only when a member of
// staff actually opens that child's profile.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    if (!canManageOperations(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "students", "view");

    const { id } = await params;
    const student = await prisma.student.findFirst({
      where: { id, ...scopedCampusWhere(user, user.campusId) },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        studentUser: { select: { id: true, email: true, isActive: true } },
        campus: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        documents: { select: { id: true, kind: true, fileName: true } },
        reportCards: {
          select: {
            id: true,
            percentage: true,
            grade: true,
            status: true,
            remarksApproved: true,
            deliveryStatus: true,
            isSent: true,
            generatedAt: true,
            exam: { select: { title: true, term: true, status: true } },
          },
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!student) return Response.json({ error: "Student not found" }, { status: 404 });
    return Response.json({ success: true, data: student });
  } catch (error) {
    return errorResponse(error, "[students/id] GET failed");
  }
}
