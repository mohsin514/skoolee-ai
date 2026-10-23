import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { approveAsDepartmentHead, listDepartmentQueue } from "@/lib/school-ai/department-approvals-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-500: the head of department's queue (syllabi sent for review, Teaching Line jumps) and its approve action.
export async function GET() {
  try { return Response.json({ queue: await listDepartmentQueue(await requireAuthUser()) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request) {
  try { assertSameOrigin(request); return Response.json({ record: await approveAsDepartmentHead(await requireAuthUser(), await readBoundedJson(request, 2000)) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
