import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createTemplate, listForExam, startBatch } from "@/lib/marks-scan/service";

// SKO-412: paper marks sheets. GET ?examId=&subjectId= · POST {action: template, examId, subjectId, rowsPerPage?}
// · POST {action: start, templateId | qr}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const examId = request.nextUrl.searchParams.get("examId"), subjectId = request.nextUrl.searchParams.get("subjectId");
    if (!examId || !subjectId) throw new ApiError("examId and subjectId are required", 400);
    return Response.json({ success: true, data: await listForExam(user, examId, subjectId) });
  } catch (error) { return errorResponse(error, "[marks-scan] GET failed"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "template") return Response.json({ success: true, data: await createTemplate(user, body).then(t => ({ id: t.id, version: t.version, pageCount: t.pageCount })) }, { status: 201 });
    if (body.action === "start") return Response.json({ success: true, data: await startBatch(user, body).then(b => ({ id: b.id, status: b.status })) }, { status: 201 });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[marks-scan] POST failed"); }
}
