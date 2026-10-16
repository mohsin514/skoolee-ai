import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import {
  requireAuthUser,
  assertPermission,
  errorResponse,
  ApiError,
} from "@/lib/api/scope";
import { reportScope } from "@/lib/auth/policy";
import { reportRemarkSchema } from "@/lib/validators/schemas";
import {
  approveVersions,
  refreshVersion,
  versionTransaction,
} from "@/lib/academic/report-versions";
import { isCampusAdminRole } from "@/lib/roles";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "reports", "edit");
    const { id } = await params;
    const parsed = reportRemarkSchema.safeParse(await req.json());
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    const data = parsed.data;
    const reviewer =
      user.role === "SUPER_ADMIN" ||
      user.role === "PRINCIPAL" ||
      isCampusAdminRole(user.role);
    if (!reviewer && user.role !== "TEACHER")
      throw new ApiError("Insufficient permissions", 403);
    const report = await prisma.reportCard.findFirst({
      where: {
        id,
        ...reportScope(user),
        ...(user.role === "TEACHER"
          ? {
              exam: {
                class: {
                  OR: [
                    { classTeacherId: user.userId },
                    { subjects: { some: { teacherId: user.userId } } },
                  ],
                },
              },
            }
          : {}),
      },
    });
    if (!report) throw new ApiError("Report unavailable", 403);
    const editing =
      data.remarksEn !== undefined ||
      data.remarksUr !== undefined ||
      data.remarksAr !== undefined ||
      data.reportLanguage !== undefined;
    if (data.approve) {
      if (!reviewer)
        throw new ApiError("Only reviewers can approve reports", 403);
      if (editing || !data.versionId)
        throw new ApiError(
          "Save edits, inspect the version, then approve its version ID",
          409,
        );
      await approveVersions(
        [{ reportCardId: id, versionId: data.versionId }],
        user.userId,
        data.reviewerNote,
        data.correctionReason,
        (tx, approved) => writeAuditEvent(tx, user, {
          table: "report_cards", recordId: id, action: "APPROVE", campusId: report.campusId,
          after: { versionId: approved[0]?.id ?? data.versionId ?? null, versionNumber: approved[0]?.number ?? null },
        }),
      );
    } else {
      if (data.requestCorrection && !reviewer)
        throw new ApiError("Only reviewers can request correction", 403);
      await versionTransaction(async (tx) => {
        if (data.requestCorrection) {
          const current = await refreshVersion(tx, id);
          if (current.id !== data.versionId)
            throw new ApiError(
              "This version changed. Reload before requesting correction.",
              409,
            );
          if (!data.reviewerNote?.trim())
            throw new ApiError("Add a private correction note", 400);
        }
        await tx.reportCard.update({
          where: { id },
          data: {
            ...(data.requestCorrection
              ? {
                  sourceRevision: { increment: 1 },
                  remarksApproved: false,
                  approvedBy: null,
                  approvedAt: null,
                }
              : {}),
            ...(data.remarksEn !== undefined
              ? { remarksEn: data.remarksEn }
              : {}),
            ...(data.remarksUr !== undefined
              ? { remarksUr: data.remarksUr }
              : {}),
            ...(data.remarksAr !== undefined
              ? { remarksAr: data.remarksAr }
              : {}),
            ...(data.reportLanguage
              ? { reportLanguage: data.reportLanguage }
              : {}),
            ...(editing
              ? {
                  remarksApproved: false,
                  approvedBy: null,
                  approvedAt: null,
                  pdfUrl: null,
                }
              : {}),
          },
        });
        const v = await refreshVersion(tx, id);
        if (data.reviewerNote !== undefined && reviewer && !v.publishedAt)
          await tx.reportVersion.update({
            where: { id: v.id },
            data: { reviewerNote: data.reviewerNote },
          });
        // Only which parts changed and the resulting version; remark text stays out.
        await writeAuditEvent(tx, user, {
          table: "report_cards", recordId: id, action: data.requestCorrection ? "REJECT" : "UPDATE", campusId: report.campusId,
          before: { remarksApproved: report.remarksApproved, reportLanguage: report.reportLanguage },
          after: {
            versionId: v.id, versionNumber: v.number, remarksEdited: editing, correctionRequested: Boolean(data.requestCorrection),
            reviewerNoteSet: data.reviewerNote !== undefined && reviewer && !v.publishedAt,
            ...(data.reportLanguage ? { reportLanguage: data.reportLanguage } : {}),
          },
        });
      });
    }
    return Response.json({
      success: true,
      reportCard: await prisma.reportCard.findUnique({ where: { id } }),
    });
  } catch (error) {
    return errorResponse(error, "Report update failed");
  }
}
