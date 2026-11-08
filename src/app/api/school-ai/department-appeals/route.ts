import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { listDepartmentAppeals } from "@/lib/school-ai/exam-results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return Response.json(await listDepartmentAppeals(await requireAuthUser(), new URL(request.url).searchParams.get("cursor")), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
