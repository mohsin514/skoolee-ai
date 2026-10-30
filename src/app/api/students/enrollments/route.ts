import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { isFamily, studentScope } from "@/lib/auth/policy";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { applyEnrollment, assertPlacementTarget, assertRegistrar, canPlaceAcrossCampuses, dateOnly, enrollmentHistoryWhere, enrollmentImpact, readPupil } from "@/lib/students/enrollment";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const id = req.nextUrl.searchParams.get("studentId") || "";
    const pupil = await readPupil(user, id);
    const family = isFamily(user);
    let canManage = false;
    if (!family) { try { await assertRegistrar(user); canManage = true; } catch { /* Read access does not grant transition authority. */ } }
    const documentId = req.nextUrl.searchParams.get("documentId");
    if (documentId) {
      if (!canManage) throw new ApiError("Confidential admission documents are restricted to registrars", 403);
      const document = await prisma.studentDocument.findFirst({ where: { id: documentId, studentId: id }, select: { fileKey: true, fileName: true, student: { select: { campusId: true } } } });
      if (!document || !matchesDocumentKey(document.fileKey, "student-docs", document.student.campusId, id)) throw new ApiError("Document not found", 404);
      return privateDownloadResponse(document.fileKey, document.fileName);
    }
    const enrollmentId = req.nextUrl.searchParams.get("enrollmentId");
    if (enrollmentId) {
      if (!pupil.enrollments.some(e => e.id === enrollmentId)) throw new ApiError("Enrollment not found", 404);
      const history = enrollmentHistoryWhere(user);
      const [attendance, invoices, reports] = await Promise.all([
        prisma.attendance.findMany({ where: { studentId: id, enrollmentId, ...history.attendance }, select: { id: true, date: true, status: true }, orderBy: { date: "desc" }, take: 100 }),
        prisma.invoice.findMany({ where: { studentId: id, enrollmentId, ...history.invoices }, select: { id: true, invoiceNumber: true, invoiceDate: true, currency: true, balanceDue: true }, orderBy: { invoiceDate: "desc" }, take: 100 }),
        prisma.reportCard.findMany({ where: { studentId: id, enrollmentId, ...history.reports }, select: { id: true, generatedAt: true, status: true, exam: { select: { title: true } } }, take: 100 }),
      ]);
      return Response.json({ attendance, invoices, reports, limit: 100 }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [proposals, classes, documents] = !canManage ? [[], [], []] : await Promise.all([
      prisma.enrollmentProposal.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" } }),
      // SKAI-170: a campus registrar is offered only its own campus's classes; seats come with each one.
      prisma.class.findMany({ where: { status: "ACTIVE", archivedAt: null, ...(canPlaceAcrossCampuses(user) ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, name: true, section: true, campusId: true, academicYear: true, capacity: true, campus: { select: { name: true } }, _count: { select: { students: { where: { archivedAt: null, status: "active" } } } } }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }] }),
      prisma.studentDocument.findMany({ where: { studentId: id }, select: { id: true, kind: true, fileName: true, uploadedAt: true } }),
    ]);
    // The timeline is served by /api/students/timeline (SKAI-166), the one scoped and paged reader.
    return Response.json({ pupil, proposals, classes, documents, canConsolidate: isInstitutionAuthority(user), canManage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to load enrollment history"); }
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertRegistrar(user);
    const body = await parseBody(req, jsonObjectBody);
    const id = String(body.studentId || "");
    await readPupil(user, id);
    if (body.action === "confirm") {
      if (body.reviewed !== true || body.capacityChecked !== true) throw new ApiError("Review identity, history, guardian impact and target capacity first", 400);
      const result = await prisma.$transaction(async tx => {
        const proposal = await tx.enrollmentProposal.findFirst({ where: { id: String(body.proposalId), studentId: id, status: "PROPOSED" } });
        if (!proposal) throw new ApiError("Proposal unavailable or already confirmed", 409);
        const pupil = await tx.student.findFirst({ where: { id, ...studentScope(user) } });
        if (!pupil) throw new ApiError("Pupil not found", 404);
        // SKAI-170: capacity and campus are re-checked at confirmation; seats may have filled since the proposal.
        const target = await tx.class.findFirst({ where: { id: proposal.targetClassId }, select: { id: true, campusId: true, capacity: true } });
        if (!target) throw new ApiError("The target class is no longer available. Reload the pupil record.", 409);
        await assertPlacementTarget(tx, user, pupil, target);
        const result = await applyEnrollment(tx, { studentId: id, fromId: proposal.fromEnrollmentId, targetClassId: proposal.targetClassId, effectiveDate: proposal.effectiveDate, rollNo: proposal.rollNo, actorId: user.userId, reason: proposal.reason });
        await tx.enrollmentProposal.update({ where: { id: proposal.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: user.userId } });
        return result;
      }, { isolationLevel: "Serializable" });
      return Response.json(result);
    }
    const effectiveDate = dateOnly(body.effectiveDate);
    const fromId = String(body.fromEnrollmentId || "");
    const targetClassId = String(body.targetClassId || "");
    const rollNo = String(body.rollNo || "").trim();
    const reason = String(body.reason || "").trim();
    if (!rollNo || !reason || reason.length > 1000) throw new ApiError("Roll number and a reason (up to 1000 characters) are required", 400);
    const impact = await enrollmentImpact(prisma, id, fromId, targetClassId, effectiveDate, true);
    const seats = await assertPlacementTarget(prisma, user, impact.pupil, impact.target);
    if (body.action === "preview") return Response.json({ preserved: impact.preserved, guardianAccess: impact.guardianAccess, capacity: impact.capacity, targetOccupancy: seats.occupied, targetCapacity: seats.capacity, policy: impact.policy });
    if (body.action !== "propose") throw new ApiError("Unknown action", 400);
    // SKAI-170: one open proposal per current enrollment, so a double submit or retry cannot queue two moves.
    const open = await prisma.enrollmentProposal.findFirst({ where: { studentId: id, fromEnrollmentId: fromId, status: "PROPOSED" }, select: { id: true, targetClassId: true, effectiveDate: true } });
    if (open) {
      if (open.targetClassId === targetClassId && open.effectiveDate.valueOf() === effectiveDate.valueOf()) return Response.json({ proposal: open, replayed: true });
      throw new ApiError("This pupil already has an open enrollment proposal. Confirm or review it first.", 409);
    }
    const proposal = await prisma.enrollmentProposal.create({ data: { studentId: id, campusId: impact.pupil.campusId, fromEnrollmentId: fromId, targetClassId, effectiveDate, rollNo, reason, createdBy: user.userId } });
    return Response.json({ proposal }, { status: 201 });
  } catch (error) { return errorResponse(error, "Enrollment transition could not be saved. Reload and review conflicting records."); }
}
