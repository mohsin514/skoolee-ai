import { createHash, randomUUID } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import {
  appendEvent,
  WorkflowStopped,
  type WorkflowContext,
} from "@/lib/queue/outbox";
import { runAsCurrentActor } from "@/lib/auth/job-policy";
import { resolveCurrentPrincipal } from "@/lib/auth/principal";
import { renderReportCardPdfBuffer } from "@/lib/academic/pdf";
import { processBankImport } from "./bank-import";
import { authorizeJob, createJob, jobTransaction } from "./service";
import { ApiError } from "@/lib/api/scope";

export async function startPdfJob(
  user: AuthUser,
  exam: { id: string; campusId: string; classId: string; title: string },
) {
  const reports = await prisma.reportCard.findMany({
    where: { examId: exam.id },
    include: { student: { select: { fullName: true } } },
    orderBy: { id: "asc" },
  });
  if (reports.some((r) => !r.publishedVersionId))
    throw new ApiError(
      "Publish approved reports before generating this batch.",
      409,
    );
  const identity = createHash("sha256")
    .update(reports.map((r) => r.publishedVersionId).join(":"))
    .digest("hex");
  return jobTransaction(user, async (tx) => {
    const jobId = await createJob(tx, {
      schoolId: user.schoolId,
      campusId: exam.campusId,
      classId: exam.classId,
      actorId: user.userId,
      kind: "PDF",
      sourceId: exam.id,
      label: exam.title,
      identity: `pdf:${identity}`,
    });
    for (const r of reports) {
      const itemId = randomUUID();
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`INSERT INTO activity_items(id,school_id,job_id,reference_id,label,version_id) VALUES(${itemId},${user.schoolId},${jobId},${r.id},${r.student.fullName},${r.publishedVersionId}) ON CONFLICT(job_id,reference_id) DO NOTHING RETURNING id`;
      if (!rows.length) continue;
      const workflowId = await appendEvent(tx, {
        schoolId: user.schoolId,
        actorId: user.userId,
        kind: "ACTIVITY_PDF",
        version: 1,
        referenceId: itemId,
        identity: `activity:${itemId}`,
      });
      await tx.$executeRaw`UPDATE activity_items SET workflow_id=${workflowId} WHERE id=${itemId} AND school_id=${user.schoolId}`;
    }
    return jobId;
  });
}
export async function startImportJob(
  user: AuthUser,
  campusId: string,
  payload: Record<string, string>,
) {
  const identity = createHash("sha256")
    .update(JSON.stringify([campusId, payload]))
    .digest("hex");
  return jobTransaction(user, async (tx) => {
    const jobId = await createJob(tx, {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      kind: "IMPORT",
      sourceId: campusId,
      label: payload.accountName || payload.fileName,
      identity: `import:${identity}`,
    });
    const itemId = randomUUID();
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`INSERT INTO activity_items(id,school_id,job_id,reference_id,label,payload) VALUES(${itemId},${user.schoolId},${jobId},${identity},${payload.fileName},${JSON.stringify(payload)}::jsonb) ON CONFLICT(job_id,reference_id) DO NOTHING RETURNING id`;
    if (rows.length) {
      const workflowId = await appendEvent(tx, {
        schoolId: user.schoolId,
        actorId: user.userId,
        kind: "ACTIVITY_IMPORT",
        version: 1,
        referenceId: itemId,
        identity: `activity:${itemId}`,
      });
      await tx.$executeRaw`UPDATE activity_items SET workflow_id=${workflowId} WHERE id=${itemId} AND school_id=${user.schoolId}`;
    }
    return jobId;
  });
}
export async function processingWorkflow(ctx: WorkflowContext) {
  if (!["ACTIVITY_PDF", "ACTIVITY_IMPORT"].includes(ctx.kind))
    throw new WorkflowStopped("UNKNOWN_EVENT_KIND");
  const permissionModule = ctx.kind === "ACTIVITY_IMPORT" ? "fees" : "reports";
  try {
    await runAsCurrentActor(
      ctx.schoolId,
      ctx.actorId,
      permissionModule,
      "edit",
      async () => {
        const [item] = await prisma.$queryRaw<
          Array<{
            id: string;
            reference_id: string;
            version_id: string;
            payload: Record<string, string>;
            job_id: string;
          }>
        >`SELECT * FROM activity_items WHERE id=${ctx.referenceId} AND school_id=${ctx.schoolId}`;
        if (!item)
          throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
        const actor = await resolveCurrentPrincipal({
          schoolId: ctx.schoolId,
          userId: ctx.actorId,
        });
        if (!actor)
          throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
        const job = await prisma.activityJob.findUniqueOrThrow({
          where: { id: item.job_id },
        });
        await authorizeJob(
          actor,
          {
            id: job.id,
            school_id: job.schoolId,
            campus_id: job.campusId,
            class_id: job.classId,
            kind: job.kind,
            source_id: job.sourceId,
            source_label: job.sourceLabel,
            created_at: job.createdAt,
            cancel_requested_at: job.cancelRequestedAt,
          },
          true,
        );
        if (ctx.kind === "ACTIVITY_PDF") {
          // Rendering can be repeated after a crash; it uses the exact immutable approved snapshot.
          const { buffer } = await renderReportCardPdfBuffer(
            item.reference_id,
            item.version_id,
          );
          await ctx.effect(`pdf:${item.id}`, async (tx) => {
            await tx.$executeRaw`UPDATE activity_items SET state='completed',updated_at=now(),result=${JSON.stringify({ bytes: buffer.length, url: `/api/reports/download?reportCardId=${item.reference_id}&versionId=${item.version_id}` })}::jsonb WHERE id=${item.id} AND school_id=${ctx.schoolId}`;
          });
        } else {
          await ctx.effect(`import:${item.id}`, async (tx) => {
            const form = new FormData();
            for (const [key, value] of Object.entries(item.payload))
              if (key !== "csv") form.set(key, value);
            form.set(
              "file",
              new File([item.payload.csv], item.payload.fileName, {
                type: "text/csv",
              }),
            );
            const response = await processBankImport(
              actor,
              form,
              tx as TxClient,
            );
            if (response.status === 403)
              throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
            if (response.status >= 500)
              throw new Error("Import processing unavailable");
            if (!response.ok) throw new WorkflowStopped("INVALID_FILE");
            const result = await response.json();
            await tx.$executeRaw`UPDATE activity_items SET state='completed',updated_at=now(),result=${JSON.stringify(result.data)}::jsonb WHERE id=${item.id} AND school_id=${ctx.schoolId}`;
          });
        }
      },
    );
  } catch (error) {
    if ([403, 404].includes((error as { status?: number }).status || 0))
      throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
    throw error;
  }
}
