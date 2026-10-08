import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { reconcile } from "@/lib/queue/outbox";
import { operateWorkflow, requireWorkflowOperator } from "@/lib/queue/operations";
import { z } from "zod";

export const runtime = "nodejs";
const input = z.object({ schoolId: z.string().min(1).max(100), eventId: z.string().uuid(), action: z.enum(["retry", "cancel"]) });
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  const eventId = new URL(request.url).searchParams.get("eventId") || undefined;
  if (!schoolId || schoolId.length > 100) return Response.json({ error: "schoolId required" }, { status: 400 });
  if (eventId && !z.string().uuid().safeParse(eventId).success) return Response.json({ error: "Invalid eventId" }, { status: 400 });
  try {
    const workflows = await prisma.$transaction(async tx => {
      await requireWorkflowOperator(tx, user.userId, user.schoolId);
      return reconcile(tx, schoolId, eventId);
    });
    return Response.json({ workflows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const denied = error instanceof Error && error.message === "OPERATOR_REQUIRED";
    return Response.json({ error: denied ? "Operator access required" : "Reconciliation unavailable. Committed events remain recoverable." }, { status: denied ? 403 : 503 });
  }
}
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid workflow operation" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      await requireWorkflowOperator(tx, user.userId, user.schoolId);
      return operateWorkflow(tx, parsed.data, user.userId, parsed.data.action);
    });
    return Response.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "OPERATION_FAILED";
    const allowed = ["OPERATOR_REQUIRED", "WORKFLOW_NOT_FOUND", "FAILED_WORKFLOW_REQUIRED", "RECONCILE_EXTERNAL_OUTCOME_FIRST", "WORKFLOW_ALREADY_TERMINAL"];
    return Response.json({ error: allowed.includes(code) ? code : "OPERATION_FAILED" }, { status: code === "OPERATOR_REQUIRED" ? 403 : 409 });
  }
}
