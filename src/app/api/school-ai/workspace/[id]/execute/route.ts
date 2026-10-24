import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser, readSchoolAiJson, SchoolAiError } from "@/lib/school-ai/access";
import { executionInputSchema, executionOperationSchema, executeSchoolAiTool, listSchoolAiExecutions, previewSchoolAiExecution } from "@/lib/school-ai/execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
function executionError(error: unknown, fallback: string) {
  if (error instanceof SchoolAiError) return Response.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  return errorResponse(error, fallback);
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireSchoolAiUser();
    const { id } = await context.params;
    if (request.nextUrl.searchParams.get("history") === "1") return Response.json({ executions: await listSchoolAiExecutions(user, id) }, { headers: { "Cache-Control": "private, no-store" } });
    const operation = executionOperationSchema.safeParse(request.nextUrl.searchParams.get("operation"));
    if (!operation.success) throw new SchoolAiError("Choose a supported school AI tool.", 400, "INVALID_OPERATION");
    const preview = await previewSchoolAiExecution(user, id, operation.data, Number(request.nextUrl.searchParams.get("version")));
    return Response.json({ preview }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return executionError(error, "Unable to preview this school AI operation."); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("edit");
    const { id } = await context.params;
    const value = await readSchoolAiJson(request, 2048);
    const input = executionInputSchema.safeParse(value);
    if (!input.success) throw new SchoolAiError("Choose a supported tool with its reviewed version and preview.");
    const execution = await executeSchoolAiTool(user, id, input.data);
    return Response.json({ execution }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return executionError(error, "Unable to execute this school AI operation."); }
}
