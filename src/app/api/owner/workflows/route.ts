import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { reconcile } from "@/lib/queue/outbox";
import { operateWorkflow, requireWorkflowOperator } from "@/lib/queue/operations";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { workflowOperationSchema } from "@/lib/queue/operation-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  const eventId = new URL(request.url).searchParams.get("eventId") || undefined;
  if (!schoolId || schoolId.length > 100) return Response.json({ error: "schoolId required" }, { status: 400, headers: noStore });
  if (eventId && !z.string().uuid().safeParse(eventId).success) return Response.json({ error: "Invalid eventId" }, { status: 400, headers: noStore });
  try {
    const workflows = await prisma.$transaction(async tx => {
      await requireWorkflowOperator(tx, user.userId, user.schoolId);
      return reconcile(tx, schoolId, eventId);
    });
    return Response.json({ workflows }, { headers: noStore });
  } catch (error) {
    const denied = error instanceof Error && error.message === "OPERATOR_REQUIRED";
    return Response.json({ error: denied ? "Operator access required" : "Reconciliation unavailable. Committed events remain recoverable." }, { status: denied ? 403 : 503, headers: noStore });
  }
}
export async function POST(request: Request) {
  try { assertSameOrigin(request); }
  catch { return Response.json({ error: "Cross-site request refused" }, { status: 403, headers: noStore }); }
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const parsed = workflowOperationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Select a valid action and its documented recovery reason." }, { status: 400, headers: noStore });
  try {
    const result = await prisma.$transaction(async tx => {
      await requireWorkflowOperator(tx, user.userId, user.schoolId);
      return operateWorkflow(tx, { schoolId: parsed.data.schoolId, eventId: parsed.data.eventId }, user.userId, parsed.data.action, parsed.data.reason);
    });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OPERATION_FAILED";
    const allowed = ["OPERATOR_REQUIRED", "WORKFLOW_NOT_FOUND", "FAILED_WORKFLOW_REQUIRED", "RECONCILE_EXTERNAL_OUTCOME_FIRST", "WORKFLOW_ALREADY_TERMINAL", "INVALID_OPERATION_REASON"];
    return Response.json({ error: allowed.includes(code) ? code : "OPERATION_FAILED" }, { status: code === "OPERATOR_REQUIRED" ? 403 : 409, headers: noStore });
  }
}
