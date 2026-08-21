import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// Admission Query (Lead CRM).
// GET    /api/admission-queries?status=&source=&search=&overdue=true
// POST   /api/admission-queries               — { name, phone, email?, classInterestedId?, source, note? }
// PATCH  /api/admission-queries               — { id, ...updates } | { id, followUp: { note, nextDate } }
// DELETE /api/admission-queries?id=           — blocked with 409 once converted

const QUERY_SOURCES = ["WALK_IN", "PHONE", "WEBSITE", "REFERRAL", "ADVERT"];
const QUERY_STATUSES = ["ACTIVE", "FOLLOW_UP", "CONVERTED", "LOST"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // The lead pipeline holds prospective families' names, phone numbers,
    // emails and free-text follow-up notes. The GET handler stopped at
    // requireAuthUser(), so every signed-in STUDENT and PARENT could read the
    // school's entire admissions list. Staff-only, and gated on the same
    // admissions.view bit as the screen it feeds.
    await assertModuleRead(user, "admissions");
    const { searchParams } = req.nextUrl;
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
      orderBy: [{ status: "asc" }, { nextFollowUp: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    return Response.json({ success: true, data: queries });
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

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const classInterestedId = body.classInterestedId ? String(body.classInterestedId) : null;
    const source = String(body.source ?? "WALK_IN").toUpperCase();
    const note = body.note ? String(body.note).slice(0, 2000) : null;
    const assignedToId = body.assignedToId ? String(body.assignedToId) : null;

    if (!name || !phone) throw new ApiError("name and phone are required", 400);
    if (!QUERY_SOURCES.includes(source)) {
      throw new ApiError(`source must be one of: ${QUERY_SOURCES.join(", ")}`, 400);
    }
    if (!QUERY_STATUSES.includes(String(body.status ?? "ACTIVE").toUpperCase())) {
      throw new ApiError(`status must be one of: ${QUERY_STATUSES.join(", ")}`, 400);
    }

    const campusId = user.role === "SUPER_ADMIN" ? (classInterestedId ? null : body.campusId) : undefined;

    const query = await prisma.admissionQuery.create({
      data: {
        campusId: user.role === "SUPER_ADMIN" && body.campusId ? await resolveCampusId(user, String(body.campusId)) : user.campusId!,
        name,
        phone,
        email: email || null,
        classInterestedId,
        source,
        status: String(body.status ?? "ACTIVE").toUpperCase(),
        assignedToId,
        note,
      },
    });

    return Response.json({ success: true, data: query }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[admission-queries] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("You don't have permission to manage admission queries", 403);
        await assertPermission(user, "admissions", "edit");

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.admissionQuery.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { convertedStudent: { select: { fullName: true } } },
    });
    if (!existing) throw new ApiError("Admission query not found", 404);
    if (existing.convertedStudent && body.status !== "CONVERTED") {
      throw new ApiError(`This query already converted — it's linked to ${existing.convertedStudent.fullName}`, 409);
    }

    const updates: any = {};
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.phone === "string" && body.phone.trim()) updates.phone = body.phone.trim();
    if (typeof body.email === "string") updates.email = body.email.trim() || null;
    if (typeof body.note === "string") updates.note = body.note.slice(0, 2000);
    if (body.classInterestedId !== undefined) updates.classInterestedId = body.classInterestedId ? String(body.classInterestedId) : null;
    if (body.source) {
      const source = String(body.source).toUpperCase();
      if (!QUERY_SOURCES.includes(source)) throw new ApiError(`source must be one of: ${QUERY_SOURCES.join(", ")}`, 400);
      updates.source = source;
    }
    if (body.status) {
      const status = String(body.status).toUpperCase();
      if (!QUERY_STATUSES.includes(status)) throw new ApiError(`status must be one of: ${QUERY_STATUSES.join(", ")}`, 400);
      updates.status = status;
    }
    if (body.nextFollowUp !== undefined && body.nextFollowUp !== "") {
      updates.nextFollowUp = new Date(String(body.nextFollowUp));
    } else if (body.nextFollowUp === null) {
      updates.nextFollowUp = null;
    }
    if (body.assignedToId !== undefined) updates.assignedToId = body.assignedToId ? String(body.assignedToId) : null;

    // Conversion: the admission form prefilled this lead; the student was just
    // created. Guard against double-conversion via the unique constraint.
    if (body.convertedStudentId) {
      const studentId = String(body.convertedStudentId);
      if (existing.convertedStudentId && existing.convertedStudentId !== studentId) {
        throw new ApiError("This query has already been converted", 409);
      }
      const student = await prisma.student.findFirst({
        where: { id: studentId, campus: { schoolId: user.schoolId } },
        select: { id: true, fullName: true },
      });
      if (!student) throw new ApiError("Student not found", 404);
      updates.convertedStudentId = studentId;
      updates.status = "CONVERTED";
    }

    // Follow-up log: also roll nextFollowUp forward when a follow-up is logged.
    if (body.followUp) {
      const note = String(body.followUp.note ?? "").trim();
      if (!note) throw new ApiError("followUp.note is required", 400);
      const date = body.followUp.date ? new Date(String(body.followUp.date)) : new Date();
      if (Number.isNaN(date.getTime())) throw new ApiError("followUp date is invalid", 400);
      updates.nextFollowUp = body.followUp.nextDate ? new Date(String(body.followUp.nextDate)) : existing.nextFollowUp;
      if (updates.nextFollowUp && Number.isNaN(updates.nextFollowUp.getTime())) throw new ApiError("followUp.nextDate is invalid", 400);

      const updated = await prisma.$transaction(
        async (tx) => {
          await tx.admissionQueryFollowUp.create({
            data: { queryId: id, date, note, nextDate: updates.nextFollowUp ?? null, actorId: user.userId },
          });
          return tx.admissionQuery.update({
            where: { id },
            data: { ...updates, status: updates.status ?? existing.status === "ACTIVE" ? "FOLLOW_UP" : updates.status ?? existing.status },
          });
        },
        { timeout: 20000 }
      );
      return Response.json({ success: true, data: updated });
    }

    const updated = await prisma.admissionQuery.update({
      where: { id },
      data: updates,
      include: {
        classInterested: { select: { id: true, name: true, section: true } },
        assignedTo: { select: { id: true, fullName: true, role: true } },
        convertedStudent: { select: { id: true, fullName: true, rollNo: true } },
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[admission-queries] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("You don't have permission to delete admission queries", 403);
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