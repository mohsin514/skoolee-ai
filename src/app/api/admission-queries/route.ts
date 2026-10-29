import { listPagination, pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createEnquiry, updateEnquiry } from "@/lib/admissions/enquiries";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// Admission Query (Lead CRM).
// GET    /api/admission-queries?status=&source=&search=&overdue=true
// POST   /api/admission-queries               — { name, phone, email?, classInterestedId?, source, note? }
// PATCH  /api/admission-queries               — { id, ...updates } | { id, followUp: { note, nextDate } }
// DELETE /api/admission-queries?id=           — blocked with 409 once converted

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // The lead pipeline holds prospective families' names, phone numbers,
    // emails and free-text follow-up notes. The GET handler stopped at
    // requireAuthUser(), so every signed-in STUDENT and PARENT could read the
    // school's entire admissions list. Staff-only, and gated on the same
    // admissions.view bit as the screen it feeds.
    await assertModuleRead(user, "admissions");
    await assertListBudget(user, "admission-queries");
    const { searchParams } = req.nextUrl;
    const { page: requestedPage, limit } = listPagination(searchParams, 100, 100);
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const search = searchParams.get("search")?.trim();
    const showOverdue = searchParams.get("overdue") === "true";
    const campusId = searchParams.get("campusId") || user.campusId;

    const campus = await resolveCampusId(user, campusId);

    const where: any = {
      campusId: campus,
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(showOverdue
        ? { status: { in: ["ACTIVE", "FOLLOW_UP"] }, nextFollowUp: { not: null, lt: new Date() } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const total = await prisma.admissionQuery.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const queries = await prisma.admissionQuery.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        source: true,
        status: true,
        nextFollowUp: true,
        note: true,
        convertedStudentId: true,
        createdAt: true,
        classInterested: { select: { id: true, name: true, section: true } },
        assignedTo: { select: { id: true, fullName: true, role: true } },
        convertedStudent: { select: { id: true, fullName: true, rollNo: true } },
        _count: { select: { followUps: true } },
      },
      orderBy: [{ status: "asc" }, { nextFollowUp: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      skip, take: limit,
    });

    return Response.json({ success: true, data: queries, pagination: { page, limit, total, pages } });
  } catch (error) {
    return errorResponse(error, "[admission-queries] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // The matrix is the authority here. A receptionist is granted
    // admissions.add — taking enquiries at the front desk is the job — but the
    // canManageOperations gate in front of this check refused them.
    assertStaffRole(user);
    await assertPermission(user, "admissions", "add");

    const body = await parseBody(req, jsonObjectBody);
    const query = await createEnquiry(user, body);

    return Response.json({ success: true, data: query }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[admission-queries] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // SKO-398: the permission matrix is the authority, as for POST — a receptionist granted admissions.edit
    // can record follow-ups, and loses that the moment the grant is revoked.
    assertStaffRole(user);
    await assertPermission(user, "admissions", "edit");

    const body = await parseBody(req, jsonObjectBody);
    const updated = await updateEnquiry(user, body);
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[admission-queries] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "admissions", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.admissionQuery.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      select: { convertedStudentId: true, convertedStudent: { select: { fullName: true } } },
    });
    if (!existing) throw new ApiError("Admission query not found", 404);

    // Lost leads stay for reporting; converted leads link to a student.
    if (existing.convertedStudentId) {
      throw new ApiError(`Cannot delete: this query converted to ${existing.convertedStudent?.fullName ?? "a student"}`, 409);
    }

    await prisma.admissionQuery.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[admission-queries] DELETE failed");
  }
}