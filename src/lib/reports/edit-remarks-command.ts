import type { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError } from "@/lib/api/scope";
import { reportScope } from "@/lib/auth/policy";
import type { reportRemarkSchema } from "@/lib/validators/schemas";
import { approveVersions, refreshVersion, versionTransaction } from "@/lib/academic/report-versions";
import { isCampusAdminRole } from "@/lib/roles";

/**
 * Changing one report card (PATCH /api/reports/[id] and its /remarks alias), shared by that route and
 * the AI Workflows `reports.edit_remarks` capability. The caller has already passed reports.edit.
 * Reviewers (principal, campus operators, the group admin) approve a version or send it back; a teacher
 * edits remarks only on reports of a class they lead or teach in. Any edit clears the approval, the
 * approver and the PDF, so the reviewer approves the new version again. The audit row records which
 * parts changed and the resulting version, never the remark text.
 * Refusals are the ApiErrors (message and status) the route always returned.
 */
export type ReportCardPatch = z.infer<typeof reportRemarkSchema>;

export const isReportReviewer = (user: AuthUser) => user.role === "SUPER_ADMIN" || user.role === "PRINCIPAL" || isCampusAdminRole(user.role);

/** The report cards this person may change: their campus, and for a teacher, only their own classes. */
export function editableReportWhere(user: AuthUser) {
  return {
    ...reportScope(user),
    ...(user.role === "TEACHER"
      ? { exam: { class: { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } } }
      : {}),
  };
}

export async function updateReportCardCommand(user: AuthUser, id: string, data: ReportCardPatch) {
  const reviewer = isReportReviewer(user);
  if (!reviewer && user.role !== "TEACHER") throw new ApiError("Insufficient permissions", 403);
  const report = await prisma.reportCard.findFirst({ where: { id, ...editableReportWhere(user) } });
  if (!report) throw new ApiError("Report unavailable", 403);
  const editing =
    data.remarksEn !== undefined ||
    data.remarksUr !== undefined ||
    data.remarksAr !== undefined ||
    data.reportLanguage !== undefined;
  if (data.approve) {
    if (!reviewer) throw new ApiError("Only reviewers can approve reports", 403);
    if (editing || !data.versionId) throw new ApiError("Save edits, inspect the version, then approve its version ID", 409);
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
    if (data.requestCorrection && !reviewer) throw new ApiError("Only reviewers can request correction", 403);
    await versionTransaction(async (tx) => {
      if (data.requestCorrection) {
        const current = await refreshVersion(tx, id);
        if (current.id !== data.versionId) throw new ApiError("This version changed. Reload before requesting correction.", 409);
        if (!data.reviewerNote?.trim()) throw new ApiError("Add a private correction note", 400);
      }
      await tx.reportCard.update({
        where: { id },
        data: {
          ...(data.requestCorrection ? { sourceRevision: { increment: 1 }, remarksApproved: false, approvedBy: null, approvedAt: null } : {}),
          ...(data.remarksEn !== undefined ? { remarksEn: data.remarksEn } : {}),
          ...(data.remarksUr !== undefined ? { remarksUr: data.remarksUr } : {}),
          ...(data.remarksAr !== undefined ? { remarksAr: data.remarksAr } : {}),
          ...(data.reportLanguage ? { reportLanguage: data.reportLanguage } : {}),
          ...(editing ? { remarksApproved: false, approvedBy: null, approvedAt: null, pdfUrl: null } : {}),
        },
      });
      const v = await refreshVersion(tx, id);
      if (data.reviewerNote !== undefined && reviewer && !v.publishedAt)
        await tx.reportVersion.update({ where: { id: v.id }, data: { reviewerNote: data.reviewerNote } });
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
  return prisma.reportCard.findUnique({ where: { id } });
}

export type RemarkLanguage = "EN" | "UR" | "AR";
const REMARK_FIELD = { EN: "remarksEn", UR: "remarksUr", AR: "remarksAr" } as const;

/** The remark edit path only: one language's remark, nothing approved or sent back. */
export function editRemarksCommand(user: AuthUser, reportCardId: string, language: RemarkLanguage, remark: string) {
  return updateReportCardCommand(user, reportCardId, { [REMARK_FIELD[language]]: remark });
}
