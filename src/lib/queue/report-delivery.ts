import { resolveCurrentPrincipal } from "@/lib/auth/principal";
import { authorizeJob } from "@/lib/jobs/service";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runAsCurrentActor } from "@/lib/auth/job-policy";
import { assertCommunicationTarget } from "@/lib/auth/communication-policy";
import { getPublishedVersion } from "@/lib/academic/report-versions";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { sendEmailMessage, hasEmailProviderConfig } from "@/lib/email";
import { WorkflowStopped, type WorkflowContext } from "./outbox";

/** Delivery content is already frozen; recheck actor, recipient and version before the fenced external effect. */
export async function reportDeliveryWorkflow(
  ctx: WorkflowContext,
  deliver?: (communication: {
    channel: string;
    recipient: string;
    body: string;
    subject: string | null;
  }) => Promise<{ success: boolean; messageId?: string; error?: string }>,
) {
  if (ctx.kind !== "REPORT_DELIVERY")
    throw new WorkflowStopped("UNKNOWN_EVENT_KIND");
  await runAsCurrentActor(
    ctx.schoolId,
    ctx.actorId,
    "reports",
    "edit",
    async () => {
      const c = await prisma.parentCommunication.findUniqueOrThrow({
        where: { id: ctx.referenceId },
      });
      const metadata = c.metadata as { reportVersionId?: string } | null;
      const authorize = async (db: TxClient = prisma) => {
        if (!["EMAIL", "WHATSAPP"].includes(c.channel)) throw new WorkflowStopped("UNKNOWN_EVENT_KIND");
        const actor = await resolveCurrentPrincipal({ schoolId: ctx.schoolId, userId: ctx.actorId });
        const report = c.relatedId && await db.reportCard.findFirst({ where: { id: c.relatedId, schoolId: ctx.schoolId, campusId: c.campusId || undefined, studentId: c.studentId || "" }, include: { exam: { select: { id: true, classId: true, title: true } } } });
        if (!actor || !report || !c.campusId || !c.parentUserId) throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
        await authorizeJob(actor, { id: ctx.referenceId, school_id: ctx.schoolId, campus_id: c.campusId, class_id: report.exam.classId, kind: "REPORT_DELIVERY", source_id: report.exam.id, source_label: report.exam.title, created_at: c.createdAt, cancel_requested_at: null }, true, db);
        await assertCommunicationTarget(
          {
            schoolId: c.schoolId,
            campusId: c.campusId,
            studentId: c.studentId,
            parentUserId: c.parentUserId,
            recipient: c.recipient,
          },
          c.channel,
          "learningRecords",
        );
        const version = await getPublishedVersion(c.relatedId || "", undefined, db);
        if (version.id !== metadata?.reportVersionId)
          throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
      };
      await authorize();
      if (c.status === "SENT") return;
      if (!deliver && process.env.DISABLE_OUTBOUND_MESSAGES === "true") throw new WorkflowStopped("PROVIDER_UNAVAILABLE");
      if (!deliver && c.channel === "WHATSAPP" && (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN)) throw new WorkflowStopped("PROVIDER_UNAVAILABLE");
      if (!deliver && c.channel === "EMAIL" && !hasEmailProviderConfig()) throw new WorkflowStopped("PROVIDER_UNAVAILABLE");
      await ctx.external(`deliver:${c.id}`, tx => authorize(tx as TxClient), async () => {
        const result = deliver
          ? await deliver(c)
          : c.channel === "WHATSAPP"
            ? await sendWhatsAppMessage({ to: c.recipient, text: c.body })
            : await sendEmailMessage({
                to: c.recipient,
                subject: c.subject || "Report published",
                text: c.body,
              });
        await prisma.parentCommunication.update({
          where: { id: c.id },
          data: {
            status: result.success ? "SENT" : "FAILED",
            providerMessageId: result.messageId || null,
            failedReason: result.success
              ? null
              : result.error || "Delivery failed",
            sentAt: result.success ? new Date() : null,
          },
        });
        if (result.success)
          await prisma.reportCard.updateMany({
            where: {
              id: c.relatedId || "",
              publishedVersionId: metadata?.reportVersionId,
            },
            data: {
              isSent: true,
              sentAt: new Date(),
              status: "SENT",
              deliveryStatus: "SENT",
            },
          });
        if (!result.success)
          throw new Error(
            "Report delivery provider failed; reconcile before retry.",
          );
      });
    },
  ).catch((error) => {
    if ([402, 403, 404, 409].includes((error as { status?: number }).status || 0))
      throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
    throw error;
  });
}
