import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// Admission enquiries (Lead CRM), extracted from POST/PATCH /api/admission-queries so the route and the AI
// Workflows adapter run the same rules. The route keeps its guards (assertStaffRole + admissions.add/edit)
// and returns exactly what these commands return.
// A created enquiry also records who took it (audit CREATE in the same transaction): the enquiry row has no
// creator column, and an AI replay may only ever reconcile with an enquiry its own actor recorded (RT17).

export const QUERY_SOURCES = ["WALK_IN", "PHONE", "WEBSITE", "REFERRAL", "ADVERT"];
export const QUERY_STATUSES = ["ACTIVE", "FOLLOW_UP", "CONVERTED", "LOST"];
export const ENQUIRY_TABLE = "admission_queries";

export async function createEnquiry(user: AuthUser, body: Record<string, any>) {
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

  const campusId = user.role === "SUPER_ADMIN" && body.campusId ? await resolveCampusId(user, String(body.campusId)) : user.campusId!;
  const status = String(body.status ?? "ACTIVE").toUpperCase();
  return schoolAiTransaction(user, async tx => {
    const query = await tx.admissionQuery.create({
      data: {
        campusId,
        name,
        phone,
        email: email || null,
        classInterestedId,
        source,
        status,
        assignedToId,
        note,
      },
    });
    await writeAuditEvent(tx, user, { table: ENQUIRY_TABLE, recordId: query.id, action: "CREATE", campusId: query.campusId, after: { source, status } });
    return query;
  });
}

export async function updateEnquiry(user: AuthUser, body: Record<string, any>) {
  const id = String(body.id ?? "");
  if (!id) throw new ApiError("id is required", 400);

  const existing = await prisma.admissionQuery.findFirst({
    where: { id, campus: { schoolId: user.schoolId }, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) },
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

    return prisma.$transaction(
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
  }

  return prisma.admissionQuery.update({
    where: { id },
    data: updates,
    include: {
      classInterested: { select: { id: true, name: true, section: true } },
      assignedTo: { select: { id: true, fullName: true, role: true } },
      convertedStudent: { select: { id: true, fullName: true, rollNo: true } },
    },
  });
}
