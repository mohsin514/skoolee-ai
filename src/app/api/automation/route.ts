import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { prisma } from "@/lib/db/prisma";
import { inTenant } from "@/lib/ai-workflows/jobs/actor";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";

export const dynamic = "force-dynamic";

/**
 * Retired engine (SKO-550 Slice 1h). Earlier jobs stay readable for one release; nothing new starts here.
 * New requests use /api/ai-workflows, where each change is confirmed or handed to its approver.
 */
export async function GET() {
  try {
    const user = await requireAutomaticUser();
    const rows = await inTenant(user, () => prisma.schoolAiRequest.findMany({ where: { schoolId: user.schoolId, actorId: user.userId, feature: "AUTOMATIC_SETUP_V1" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, createdAt: true, reply: true } }));
    return workflowJson({ retired: true, jobs: rows.map(row => ({ id: row.id, status: row.status, createdAt: row.createdAt, job: row.reply ? JSON.parse(row.reply) : null })) });
  } catch (error) { return workflowErrorResponse(error); }
}

export function POST() {
  return workflowJson({ code: "NOT_CONNECTED", successor: "/api/ai-workflows" }, { status: 410 });
}
