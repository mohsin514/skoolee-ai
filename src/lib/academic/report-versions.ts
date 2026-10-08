import { createHash, randomUUID } from "node:crypto";
import { prisma, type TxClient } from "@/lib/db/prisma";
import {
  getTenantContext,
  resolveTenantFromRequest,
  runWithTenantContext,
} from "@/lib/db/tenant-context";
import { getLiveReportCardPayload, isLockedStatus } from "./report-cards";
import { appendEvent } from "@/lib/queue/outbox";

export class ReportConflict extends Error {
  status = 409;
}
export type ReportSnapshot = Awaited<
  ReturnType<typeof getLiveReportCardPayload>
>;
export function contentHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Serializable source reads and approval write reject concurrent edits, including marks and grading rules. */
export async function versionTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const context = getTenantContext() ?? (await resolveTenantFromRequest());
  const schoolId = context?.schoolId;
  if (!schoolId)
    throw new ReportConflict("An authenticated tenant context is required.");
  try {
    return await runWithTenantContext(
      { ...context, schoolId, unscoped: false, rlsSession: true },
      () =>
        prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
            return fn(tx as TxClient);
          },
          { isolationLevel: "Serializable", timeout: 30000 },
        ),
    );
  } catch (error) {
    if ((error as { code?: string }).code === "P2034")
      throw new ReportConflict(
        "This report changed during review. Reload and review the new version.",
      );
    throw error;
  }
}

async function capture(tx: TxClient, id: string) {
  const raw = await getLiveReportCardPayload(id, tx);
  const r = raw.reportCard;
  const expectedSubjects = await tx.subject.findMany({
    where: {
      classId: r.exam.classId,
      ...(r.exam.subjectId ? { id: r.exam.subjectId } : {}),
    },
    select: { id: true, name: true },
  });
  const exam = await tx.exam.findUniqueOrThrow({
    where: { id: r.examId },
    select: { status: true, isLocked: true },
  });
  const blockers: string[] = [];
  if (!exam.isLocked && !isLockedStatus(exam.status))
    blockers.push("Exam must be locked");
  const missing = expectedSubjects.filter(
    (s) => !raw.marks.some((m) => m.subjectId === s.id),
  );
  if (!expectedSubjects.length || missing.length)
    blockers.push(
      `Missing marks: ${missing.map((s) => s.name).join(", ") || "no subjects"}`,
    );
  const total = raw.marks.reduce((sum, m) => sum + m.total, 0);
  r.totalMarks = total;
  r.obtainedMarks = raw.marks.reduce((sum, m) => sum + m.obtained, 0);
  r.percentage = total ? Math.round((r.obtainedMarks / total) * 1000) / 10 : 0;
  const { gradeForPercentage } = await import("./grade-calculator");
  r.grade = gradeForPercentage(r.percentage, raw.weightConfig?.thresholds);
  const language = r.reportLanguage;
  const remark =
    language === "ar"
      ? r.remarksAr
      : language === "ur"
        ? r.remarksUr
        : r.remarksEn;
  if (!remark?.trim()) blockers.push(`Missing ${language} remarks`);
  // Only document-visible identity is captured. Guardian contacts and private review notes never enter a snapshot.
  const snapshot = JSON.parse(
    JSON.stringify({
      ...raw,
      language,
      reportCard: {
        id: r.id,
        schoolId: r.schoolId,
        campusId: r.campusId,
        studentId: r.studentId,
        examId: r.examId,
        totalMarks: r.totalMarks,
        obtainedMarks: r.obtainedMarks,
        percentage: r.percentage,
        grade: r.grade,
        rank: r.rank,
        attendancePresent: r.attendancePresent,
        attendanceTotal: r.attendanceTotal,
        remarksEn: r.remarksEn,
        remarksUr: r.remarksUr,
        remarksAr: r.remarksAr,
        sourceRevision: r.sourceRevision,
        reportLanguage: language,
        generatedAt: r.generatedAt,
        campus: r.campus,
        exam: r.exam,
        student: {
          id: r.student.id,
          fullName: r.student.fullName,
          rollNo: r.student.rollNo,
          class: r.student.class,
        },
        status: "APPROVED",
        deliveryStatus: "—",
      },
    }),
  ) as ReportSnapshot;
  // Regeneration time does not change approved content.
  const hashInput = {
    ...snapshot,
    reportCard: { ...snapshot.reportCard, generatedAt: undefined },
  };
  return { snapshot, blockers, hash: contentHash(hashInput), language };
}

export async function refreshVersion(tx: TxClient, id: string) {
  const report = await tx.reportCard.findUniqueOrThrow({ where: { id } });
  const captured = await capture(tx, id);
  const previous = report.currentVersionId
    ? await tx.reportVersion.findUnique({
        where: { id: report.currentVersionId },
      })
    : null;
  if (
    previous?.contentHash === captured.hash &&
    JSON.stringify(previous.blockers) === JSON.stringify(captured.blockers)
  )
    return previous;
  const lastApproved = await tx.reportVersion.findFirst({
    where: { reportCardId: id, approvedAt: { not: null } },
    orderBy: { number: "desc" },
  });
  const prior = lastApproved?.snapshot as unknown as ReportSnapshot | undefined;
  const changes: string[] = [];
  if (
    !prior ||
    contentHash(prior.marks) !== contentHash(captured.snapshot.marks)
  )
    changes.push("Marks");
  if (
    !prior ||
    contentHash([
      prior.weightConfig,
      prior.subjectDistribution,
      prior.overall,
    ]) !==
      contentHash([
        captured.snapshot.weightConfig,
        captured.snapshot.subjectDistribution,
        captured.snapshot.overall,
      ])
  )
    changes.push("Grading rules and weighted results");
  if (
    !prior ||
    contentHash([
      prior.reportCard.remarksEn,
      prior.reportCard.remarksUr,
      prior.reportCard.remarksAr,
    ]) !==
      contentHash([
        captured.snapshot.reportCard.remarksEn,
        captured.snapshot.reportCard.remarksUr,
        captured.snapshot.reportCard.remarksAr,
      ])
  )
    changes.push("Remarks");
  if (!prior || prior.reportCard.reportLanguage !== captured.language)
    changes.push("Language");
  if (!changes.length) changes.push("Document identity or attendance");
  const version = await tx.reportVersion.create({
    data: {
      schoolId: report.schoolId,
      reportCardId: id,
      number: (previous?.number ?? 0) + 1,
      contentHash: captured.hash,
      language: captured.language,
      documentIdentity: `report-${randomUUID()}`,
      snapshot: captured.snapshot as never,
      blockers: captured.blockers,
      changedSections: changes,
      predecessorId: report.publishedVersionId,
    },
  });
  await tx.reportCard.update({
    where: { id },
    data: {
      currentVersionId: version.id,
      remarksApproved: false,
      approvedBy: null,
      approvedAt: null,
      pdfUrl: null,
    },
  });
  return version;
}

export async function reviewQueue(
  ids: string[],
  retry = true,
): Promise<
  Array<
    Omit<Awaited<ReturnType<typeof refreshVersion>>, "documentBytes"> & {
      reviewerName: string | undefined;
      priorSnapshot: unknown;
      publishedVersionId: string | null;
    }
  >
> {
  return versionTransaction(async (tx) => {
    const result = [];
    for (const id of ids) {
      const current = await refreshVersion(tx, id);
      const report = await tx.reportCard.findUniqueOrThrow({
        where: { id },
        select: { publishedVersionId: true },
      });
      const prior = await tx.reportVersion.findFirst({
        where: {
          reportCardId: id,
          approvedAt: { not: null },
          number: { lt: current.number },
        },
        orderBy: { number: "desc" },
      });
      const history = await tx.reportVersion.findMany({
        where: { reportCardId: id, approvedAt: { not: null } },
        orderBy: { number: "desc" },
        take: 20,
        select: { id: true, number: true, approvedAt: true, publishedAt: true },
      });
      const lastReviewerId = current.approvedBy ?? prior?.approvedBy;
      const reviewer = lastReviewerId
        ? await tx.user.findUnique({
            where: { id: lastReviewerId },
            select: { fullName: true },
          })
        : null;
      const delivery = await tx.parentCommunication.findMany({
        where: {
          relatedId: id,
          templateKey: "REPORT_CARD_PUBLISHED",
          metadata: {
            path: ["reportVersionId"],
            equals: report.publishedVersionId ?? "none",
          },
        },
        select: { channel: true, status: true },
      });
      const { documentBytes: _bytes, ...review } = current;
      result.push({
        ...review,
        delivery,
        history,
        reviewerName: reviewer?.fullName,
        lastReviewerId,
        lastReviewedAt: current.approvedAt ?? prior?.approvedAt,
        priorSnapshot: prior?.snapshot ?? null,
        publishedVersionId: report.publishedVersionId,
      });
    }
    return result;
  }).catch((error) => {
    if (retry && error instanceof ReportConflict)
      return reviewQueue(ids, false);
    throw error;
  });
}

export async function approveVersions(
  items: Array<{ reportCardId: string; versionId: string }>,
  reviewer: string,
  note?: string,
  correctionReason?: string,
) {
  if (!items.length)
    throw new ReportConflict("Select an eligible version to approve.");
  return versionTransaction(async (tx) => {
    const approved = [];
    for (const item of items) {
      const v = await refreshVersion(tx, item.reportCardId);
      if (v.id !== item.versionId)
        throw new ReportConflict(
          "This report changed during review. Reload and review the new version.",
        );
      if ((v.blockers as string[]).length)
        throw new ReportConflict((v.blockers as string[]).join("; "));
      const reason = v.predecessorId
        ? correctionReason?.trim() || v.correctionReason
        : null;
      if (v.predecessorId && !reason)
        throw new ReportConflict(
          "Enter a family-facing correction reason before approving.",
        );
      if (v.approvedAt) {
        if (reason !== v.correctionReason)
          throw new ReportConflict(
            "The correction reason changed. Request a new review before approving.",
          );
        approved.push(v);
        continue;
      }
      const now = new Date();
      const { renderApprovedSnapshot } = await import("./pdf");
      const bytes =
        v.documentBytes ||
        (await renderApprovedSnapshot({
          ...(v.snapshot as unknown as ReportSnapshot),
          versionInfo: {
            number: v.number,
            documentIdentity: v.documentIdentity,
            correctionReason: reason,
            predecessorId: v.predecessorId,
          },
        }));
      approved.push(
        await tx.reportVersion.update({
          where: { id: v.id },
          data: {
            documentBytes: new Uint8Array(bytes),
            correctionReason: reason,
            approvedBy: reviewer,
            approvedAt: now,
            reviewerNote: note ?? null,
          },
        }),
      );
      await tx.reportCard.update({
        where: { id: item.reportCardId },
        data: { remarksApproved: true, approvedBy: reviewer, approvedAt: now },
      });
    }
    return approved;
  });
}

export async function reviewExam(examId: string, reviewer: string) {
  return versionTransaction(async (tx) => {
    const cards = await tx.reportCard.findMany({ where: { examId } });
    if (!cards.length) throw new ReportConflict("Generate reports first.");
    for (const r of cards) {
      const v = await refreshVersion(tx, r.id);
      if (!v.approvedAt || (v.blockers as string[]).length)
        throw new ReportConflict(
          "Every report needs approval of its current version.",
        );
    }
    const exam = await tx.exam.findUniqueOrThrow({ where: { id: examId } });
    return tx.exam.update({
      where: { id: examId },
      data: {
        status:
          exam.status === "PUBLISHED" ? "PUBLISHED" : "PRINCIPAL_REVIEWED",
        reviewedBy: reviewer,
        reviewedAt: new Date(),
      },
    });
  });
}

export async function publishExam(
  examId: string,
  actorId: string,
  correctionReason?: string,
) {
  return versionTransaction(async (tx) => {
    const exam = await tx.exam.findUniqueOrThrow({ where: { id: examId } });
    if (!["PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status))
      throw new ReportConflict(
        "Principal review is required before publishing.",
      );
    const cards = await tx.reportCard.findMany({ where: { examId } });
    if (!cards.length) throw new ReportConflict("Generate reports first.");
    const ids = [];
    for (const r of cards) {
      const v = await refreshVersion(tx, r.id);
      if (!v.approvedAt || (v.blockers as string[]).length)
        throw new ReportConflict(
          "Every report needs approval of its current version.",
        );
      if (
        r.publishedVersionId &&
        r.publishedVersionId !== v.id &&
        !v.correctionReason
      )
        throw new ReportConflict("Enter a family-facing correction reason.");
      if (
        correctionReason?.trim() &&
        v.predecessorId &&
        correctionReason.trim() !== v.correctionReason
      )
        throw new ReportConflict(
          "The correction reason changed after approval. Review a new version.",
        );
      if (!v.publishedAt)
        await tx.reportVersion.update({
          where: { id: v.id },
          data: {
            publishedAt: new Date(),
            predecessorId: r.publishedVersionId,
          },
        });
      await tx.reportCard.update({
        where: { id: r.id },
        data: {
          publishedVersionId: v.id,
          status: "PUBLISHED",
          ...(r.publishedVersionId !== v.id
            ? {
                isSent: false,
                deliveryStatus: "NOT_SENT",
                deliveryError: null,
                sentAt: null,
              }
            : {}),
        },
      });
      ids.push(v.id);
    }
    await tx.exam.update({
      where: { id: examId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const workflowId = await appendEvent(tx, {
      schoolId: exam.schoolId,
      actorId,
      referenceId: examId,
      kind: "REPORT_PUBLISHED",
      version: 1,
      identity: `report-published:${examId}:${contentHash(ids)}`,
    });
    return { workflowId, versions: ids, backgroundDelivery: "pending" as const };
  });
}

/** Old public links resolve to the current release; restricted history is staff-only. */
export async function getPublishedVersion(
  reportCardId: string,
  requestedVersionId?: string,
  db: TxClient = prisma,
) {
  const report = await db.reportCard.findUniqueOrThrow({
    where: { id: reportCardId },
    include: { exam: { select: { status: true } } },
  });
  if (!report.publishedVersionId || report.exam.status !== "PUBLISHED")
    throw new ReportConflict("This report has no published version.");
  const v = await db.reportVersion.findFirst({
    where: {
      id: report.publishedVersionId,
      reportCardId,
      approvedAt: { not: null },
      publishedAt: { not: null },
    },
  });
  if (!v)
    throw new ReportConflict("This report has no approved published version.");
  return {
    ...v,
    superseded: Boolean(requestedVersionId && requestedVersionId !== v.id),
  };
}

export async function getArtifactVersion(
  reportCardId: string,
  versionId?: string,
) {
  if (!versionId) return getPublishedVersion(reportCardId);
  const v = await prisma.reportVersion.findFirst({
    where: { id: versionId, reportCardId, approvedAt: { not: null } },
  });
  if (!v)
    throw new ReportConflict("Approve this exact version before PDF export.");
  return v;
}

export function familyVersion(
  v: Awaited<ReturnType<typeof getPublishedVersion>>,
) {
  const p = v.snapshot as unknown as ReportSnapshot;
  return {
    ...p.reportCard,
    versionId: v.id,
    version: v.number,
    language: v.language,
    documentIdentity: v.documentIdentity,
    examTitle: p.reportCard.exam.title,
    term: p.reportCard.exam.term,
    academicYear: p.reportCard.exam.academicYear,
    correctionReason: v.correctionReason,
    predecessorId: v.predecessorId,
    status: v.predecessorId ? "CORRECTED" : "PUBLISHED",
    marks: p.marks,
  };
}
