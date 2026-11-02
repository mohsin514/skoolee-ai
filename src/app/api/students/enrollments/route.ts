import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { isFamily, studentScope } from "@/lib/auth/policy";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { applyEnrollment, applyReadmission, assertPlacementTarget, assertRegistrar, assertRollNoFree, canPlaceAcrossCampuses, dateOnly, enrollmentHistoryWhere, enrollmentImpact, readPupil } from "@/lib/students/enrollment";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

const PAGE_SIZE = 100;

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
      // SKAI-1503: each collection is paged by keyset (id tie-break) with its own cursor and total, so older rows stay reachable.
      const cursor = (name: string) => req.nextUrl.searchParams.get(name) || undefined;
      const page = <T extends { id: string }>(rows: T[]) => {
        const hasMore = rows.length > PAGE_SIZE;
        const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
      };
      const after = (value?: string) => (value ? { cursor: { id: value }, skip: 1 } : {});
      const [attendanceRows, invoiceRows, reportRows, attendanceTotal, invoiceTotal, reportTotal] = await Promise.all([
        prisma.attendance.findMany({ where: { studentId: id, enrollmentId, ...history.attendance }, select: { id: true, date: true, status: true }, orderBy: [{ date: "desc" }, { id: "desc" }], take: PAGE_SIZE + 1, ...after(cursor("attendanceCursor")) }),
        prisma.invoice.findMany({ where: { studentId: id, enrollmentId, ...history.invoices }, select: { id: true, invoiceNumber: true, invoiceDate: true, currency: true, balanceDue: true }, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }], take: PAGE_SIZE + 1, ...after(cursor("invoiceCursor")) }),
        prisma.reportCard.findMany({ where: { studentId: id, enrollmentId, ...history.reports }, select: { id: true, generatedAt: true, status: true, exam: { select: { title: true } } }, orderBy: [{ generatedAt: "desc" }, { id: "desc" }], take: PAGE_SIZE + 1, ...after(cursor("reportCursor")) }),
        prisma.attendance.count({ where: { studentId: id, enrollmentId, ...history.attendance } }),
        prisma.invoice.count({ where: { studentId: id, enrollmentId, ...history.invoices } }),
        prisma.reportCard.count({ where: { studentId: id, enrollmentId, ...history.reports } }),
      ]);
      const attendance = page(attendanceRows);
      const invoices = page(invoiceRows);
      const reports = page(reportRows);
      return Response.json({ attendance: attendance.items, invoices: invoices.items, reports: reports.items, nextCursors: { attendance: attendance.nextCursor, invoices: invoices.nextCursor, reports: reports.nextCursor }, totals: { attendance: attendanceTotal, invoices: invoiceTotal, reports: reportTotal }, limit: PAGE_SIZE }, { headers: { "Cache-Control": "private, no-store" } });
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
    // SKAI-1387: explicit re-admission of a withdrawn pupil. It runs before enrollmentImpact, which needs a live pupil.
    if (body.action === "readmit") {
      const result = await prisma.$transaction(tx => applyReadmission(tx, { studentId: id, targetClassId, rollNo, effectiveDate, actorId: user.userId, reason }), { isolationLevel: "Serializable" });
      return Response.json(result, { status: 201 });
    }
    const impact = await enrollmentImpact(prisma, id, fromId, targetClassId, effectiveDate, true);
    const seats = await assertPlacementTarget(prisma, user, impact.pupil, impact.target);
    // SKAI-172: surface a roll-number clash at preview/propose, not only when the move is confirmed.
    await assertRollNoFree(prisma, id, impact.target.campusId, rollNo);
    if (body.action === "preview") return Response.json({ preserved: impact.preserved, guardianAccess: impact.guardianAccess, capacity: impact.capacity, targetOccupancy: seats.occupied, targetCapacity: seats.capacity, policy: impact.policy });
    if (body.action !== "propose") throw new ApiError("Unknown action", 400);
    // SKAI-170: one open proposal per current enrollment, so a double submit or retry cannot queue two moves.
    // SKAI-1598: the open-proposal check and the create share a per-enrollment lock, so simultaneous
    // submissions cannot both pass the check; the second replays or gets 409.
    const outcome = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enrollment-proposal:${user.schoolId}:${id}:${fromId}`}))`;
      const open = await tx.enrollmentProposal.findFirst({ where: { studentId: id, fromEnrollmentId: fromId, status: "PROPOSED" }, select: { id: true, targetClassId: true, effectiveDate: true } });
      if (open) {
        if (open.targetClassId === targetClassId && open.effectiveDate.valueOf() === effectiveDate.valueOf()) return { proposal: open, replayed: true as const };
        throw new ApiError("This pupil already has an open enrollment proposal. Confirm or review it first.", 409);
      }
      return { proposal: await tx.enrollmentProposal.create({ data: { studentId: id, campusId: impact.pupil.campusId, fromEnrollmentId: fromId, targetClassId, effectiveDate, rollNo, reason, createdBy: user.userId } }), replayed: false as const };
    });
    if (outcome.replayed) return Response.json(outcome);
    return Response.json({ proposal: outcome.proposal }, { status: 201 });
  } catch (error) { return errorResponse(error, "Enrollment transition could not be saved. Reload and review conflicting records."); }
}
