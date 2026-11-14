import { lockTimetableCampus } from "@/lib/timetable/locking";
import { openExamExceptions } from "@/lib/academic/exam-office-service";
import { correctionReleased } from "@/lib/corrections/visibility";
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

/** Serializable source reads and approval write reject concurrent edits, including marks and grading rules.
 *  Refresh-on-view alone passes "RepeatableRead" (see refreshOne). */
export async function versionTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  isolationLevel: "Serializable" | "RepeatableRead" = "Serializable",
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
          { isolationLevel, timeout: 30000 },
        ),
    );
  } catch (error) {
    if ((error as { code?: string }).code === "P2034" || (error as { code?: string; meta?: { code?: string } }).code === "P2010" && ["40001", "40P01"].includes(String((error as { meta?: { code?: string } }).meta?.code)))
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

type ReviewVersion = Omit<Awaited<ReturnType<typeof refreshVersion>>, "documentBytes">;
const CAPTURE_CONCURRENCY = 4;
const REFRESH_ATTEMPTS = 3;

/**
 * Refreshes one card on view in its own short transaction. SKAI-1961: a serializable refresh tracks predicate locks
 * on every source it reads, so concurrent first views of different cards and exams (the principal's Report cards
 * fan-out) aborted each other with write conflicts. Refresh-on-view needs only a consistent snapshot (repeatable
 * read) and one writer per card (the row lock); approval, review and publication stay serializable and re-check the
 * live sources, so they still reject any version that no longer matches. A conflict on the same card means another
 * view just wrote its version: the next attempt reads it.
 */
async function refreshOne(id: string, attempt = 1): Promise<ReviewVersion> {
  try {
    const { documentBytes: _bytes, ...version } = await versionTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM report_cards WHERE id = ${id} AND school_id = current_setting('app.current_school_id', true) FOR UPDATE`;
      return refreshVersion(tx, id);
    }, "RepeatableRead");
    return version;
  } catch (error) {
    if (attempt < REFRESH_ATTEMPTS && error instanceof ReportConflict) return refreshOne(id, attempt + 1);
    throw error;
  }
}

/** Two views of one card on this instance share one refresh instead of queueing on its row lock and retrying. */
const refreshing = new Map<string, Promise<ReviewVersion>>();
function refreshShared(schoolId: string, id: string): Promise<ReviewVersion> {
  const key = `${schoolId}:${id}`;
  const running = refreshing.get(key);
  if (running) return running;
  const started = refreshOne(id).finally(() => refreshing.delete(key));
  refreshing.set(key, started);
  return started;
}

/**
 * SKAI-1961: refresh-on-view without one exam-wide write transaction. The snapshot of every card is
 * compared with its current version outside any transaction; only cards that changed (or have no
 * version yet) are refreshed, each in its own short transaction (see refreshOne), so an unchanged exam
 * is read with no writes. The remaining per-card lookups are batched by reportCardId.
 */
export async function reviewQueue(ids: string[]): Promise<
  Array<
    ReviewVersion & {
      reviewerName: string | undefined;
      priorSnapshot: unknown;
      publishedVersionId: string | null;
    }
  >
> {
  if (!ids.length) return [];
  const context = getTenantContext() ?? (await resolveTenantFromRequest());
  const schoolId = context?.schoolId;
  if (!schoolId)
    throw new ReportConflict("An authenticated tenant context is required.");
  return runWithTenantContext({ ...context, schoolId, unscoped: false }, async () => {
    const cards = await prisma.reportCard.findMany({
      where: { id: { in: ids }, schoolId },
      select: { id: true, currentVersionId: true, publishedVersionId: true },
    });
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const currentIds = cards.flatMap((c) => (c.currentVersionId ? [c.currentVersionId] : []));
    const stored = currentIds.length
      ? await prisma.reportVersion.findMany({
          where: { id: { in: currentIds }, schoolId },
          omit: { documentBytes: true },
        })
      : [];
    const versionById = new Map(stored.map((v) => [v.id, v]));
    const current = new Map<string, ReviewVersion>();
    for (const c of cards) {
      const v = c.currentVersionId ? versionById.get(c.currentVersionId) : undefined;
      if (v && v.reportCardId === c.id) current.set(c.id, v);
    }

    // Read phase: which snapshots no longer match their current version.
    const unique = [...new Set(ids)];
    const stale = new Set(unique.filter((id) => !current.has(id)));
    const toCheck = unique.filter((id) => current.has(id));
    for (let i = 0; i < toCheck.length; i += CAPTURE_CONCURRENCY) {
      await Promise.all(
        toCheck.slice(i, i + CAPTURE_CONCURRENCY).map(async (id) => {
          const captured = await capture(prisma, id);
          const v = current.get(id)!;
          if (v.contentHash !== captured.hash || JSON.stringify(v.blockers) !== JSON.stringify(captured.blockers))
            stale.add(id);
        }),
      );
    }
    // Write phase: refreshVersion re-reads the sources inside the refresh transaction.
    for (const id of unique.filter((x) => stale.has(x))) current.set(id, await refreshShared(schoolId, id));

    const approved = await prisma.reportVersion.findMany({
      where: { reportCardId: { in: unique }, schoolId, approvedAt: { not: null } },
      orderBy: [{ reportCardId: "asc" }, { number: "desc" }],
      select: { id: true, reportCardId: true, number: true, approvedAt: true, publishedAt: true, approvedBy: true },
    });
    const approvedByCard = new Map<string, typeof approved>();
    for (const v of approved) approvedByCard.set(v.reportCardId, [...(approvedByCard.get(v.reportCardId) ?? []), v]);
    const priorByCard = new Map<string, (typeof approved)[number]>();
    for (const id of unique) {
      const prior = approvedByCard.get(id)?.find((v) => v.number < current.get(id)!.number);
      if (prior) priorByCard.set(id, prior);
    }
    const priorIds = [...priorByCard.values()].map((v) => v.id);
    const reviewerIds = [...new Set(unique.flatMap((id) => {
      const reviewerId = current.get(id)!.approvedBy ?? priorByCard.get(id)?.approvedBy;
      return reviewerId ? [reviewerId] : [];
    }))];
    const [priorSnapshots, reviewers, deliveries] = await Promise.all([
      priorIds.length
        ? prisma.reportVersion.findMany({ where: { id: { in: priorIds }, schoolId }, select: { id: true, snapshot: true } })
        : [],
      reviewerIds.length
        ? prisma.user.findMany({ where: { id: { in: reviewerIds }, schoolId }, select: { id: true, fullName: true } })
        : [],
      prisma.parentCommunication.findMany({
        where: { relatedId: { in: unique }, schoolId, templateKey: "REPORT_CARD_PUBLISHED" },
        select: { relatedId: true, channel: true, status: true, metadata: true },
      }),
    ]);
    const snapshotById = new Map(priorSnapshots.map((v) => [v.id, v.snapshot]));
    const reviewerById = new Map(reviewers.map((u) => [u.id, u.fullName]));

    return ids.map((id) => {
      const review = current.get(id)!;
      const card = cardById.get(id);
      const publishedVersionId = card?.publishedVersionId ?? null;
      const prior = priorByCard.get(id);
      const lastReviewerId = review.approvedBy ?? prior?.approvedBy;
      const delivery = deliveries
        .filter((d) => d.relatedId === id && (d.metadata as { reportVersionId?: unknown } | null)?.reportVersionId === (publishedVersionId ?? "none"))
        .map((d) => ({ channel: d.channel, status: d.status }));
      return {
        ...review,
        delivery,
        history: (approvedByCard.get(id) ?? []).slice(0, 20).map((v) => ({ id: v.id, number: v.number, approvedAt: v.approvedAt, publishedAt: v.publishedAt })),
        reviewerName: lastReviewerId ? reviewerById.get(lastReviewerId) : undefined,
        lastReviewerId,
        lastReviewedAt: review.approvedAt ?? prior?.approvedAt,
        priorSnapshot: prior ? (snapshotById.get(prior.id) ?? null) : null,
        publishedVersionId,
      };
    });
  });
}

export async function approveVersions(
  items: Array<{ reportCardId: string; versionId: string }>,
  reviewer: string,
  note?: string,
  correctionReason?: string,
  audit?: (tx: TxClient, approved: Array<{ id: string; number: number }>) => Promise<void>,
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
      const owner = await tx.reportCard.findUniqueOrThrow({ where: { id: item.reportCardId }, select: { studentId: true } });
      const correctionRequests = await tx.correction.findMany({ where: { kind: "MARK", status: "APPLIED", requesterId: reviewer, studentId: owner.studentId } });
      if (correctionRequests.length) {
        const policy = await tx.school.findUniqueOrThrow({ where: { id: v.schoolId }, select: { correctionSeparateApprover: true } });
        for (const correction of correctionRequests) if ((policy.correctionSeparateApprover || correction.separateApprover) && !await correctionReleased(tx, correction.reportVersionIds as string[])) throw new ReportConflict("School policy requires a different reviewer to approve this correction's report version.");
      }
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
    // Callers that audit the approval pass this so the event commits with it.
    if (audit) await audit(tx, approved);
    return approved;
  });
}

export async function reviewExam(
  examId: string,
  reviewer: string,
  audit?: (tx: TxClient, before: { status: string }, after: { status: string }) => Promise<void>,
) {
  return versionTransaction(async (tx) => {
    const scope = await tx.exam.findUniqueOrThrow({ where: { id: examId }, select: { schoolId: true, campusId: true } });
    await lockTimetableCampus(tx, scope.schoolId, scope.campusId, true);
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
    const reviewed = await tx.exam.update({
      where: { id: examId },
      data: {
        status:
          exam.status === "PUBLISHED" ? "PUBLISHED" : "PRINCIPAL_REVIEWED",
        reviewedBy: reviewer,
        reviewedAt: new Date(),
      },
    });
    // Callers that audit the review pass this so the event commits with it.
    if (audit) await audit(tx, { status: exam.status }, { status: reviewed.status });
    return reviewed;
  });
}

export async function publishExam(
  examId: string,
  actorId: string,
  correctionReason?: string,
  audit?: (tx: TxClient, before: { status: string }, after: { status: string; versions: number }) => Promise<void>,
) {
  return versionTransaction(async (tx) => {
    const scope = await tx.exam.findUniqueOrThrow({ where: { id: examId }, select: { schoolId: true, campusId: true } });
    await lockTimetableCampus(tx, scope.schoolId, scope.campusId, true);
    const exam = await tx.exam.findUniqueOrThrow({ where: { id: examId } });
    if (!["PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status))
      throw new ReportConflict(
        "Principal review is required before publishing.",
      );
    // SKO-506: nothing reaches families while an exception, a result appeal or a result correction is open.
    const open = await openExamExceptions(tx, exam.schoolId, examId);
    if (open.total)
      throw new ReportConflict(
        `Resolve the open exam exceptions first: ${open.exceptions} exception(s), ${open.appeals} result appeal(s), ${open.corrections} result correction(s).`,
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
    if (audit) await audit(tx, { status: exam.status }, { status: "PUBLISHED", versions: ids.length });
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

/** The fields familyVersion() reads: never the cached PDF bytes. */
const familyVersionSelect = {
  id: true,
  reportCardId: true,
  number: true,
  language: true,
  documentIdentity: true,
  snapshot: true,
  correctionReason: true,
  predecessorId: true,
} as const;

/**
 * SKAI-1835: getPublishedVersion() for many cards in two school-scoped queries, in input order.
 * Same release rules (published exam, approved + published current version); throws like the
 * per-card read when any card has no released version.
 */
export async function publishedVersionsFor(
  reportCardIds: string[],
  schoolId: string,
  db: TxClient = prisma,
) {
  if (!reportCardIds.length) return [];
  const cards = await db.reportCard.findMany({
    where: { id: { in: reportCardIds }, schoolId, publishedVersionId: { not: null }, exam: { status: "PUBLISHED" } },
    select: { id: true, publishedVersionId: true },
  });
  const versionIdByCard = new Map(cards.map((c) => [c.id, c.publishedVersionId as string]));
  if (reportCardIds.some((id) => !versionIdByCard.has(id)))
    throw new ReportConflict("This report has no published version.");
  const versions = await db.reportVersion.findMany({
    where: {
      id: { in: [...versionIdByCard.values()] },
      reportCardId: { in: reportCardIds },
      schoolId,
      approvedAt: { not: null },
      publishedAt: { not: null },
    },
    select: familyVersionSelect,
  });
  const byId = new Map(versions.map((v) => [v.id, v]));
  return reportCardIds.map((cardId) => {
    const v = byId.get(versionIdByCard.get(cardId) as string);
    if (!v || v.reportCardId !== cardId)
      throw new ReportConflict("This report has no approved published version.");
    return v;
  });
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
  v: Pick<
    Awaited<ReturnType<typeof getPublishedVersion>>,
    keyof typeof familyVersionSelect
  >,
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
