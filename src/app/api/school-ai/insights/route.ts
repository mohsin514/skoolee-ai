import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getWorkspaceInsights } from "@/lib/school-ai/insights-service";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const user = await requireSchoolAiUser("view"), query = new URL(request.url).searchParams; const campus = z.string().min(1).max(128).parse(query.get("campusId")), days = z.coerce.number().int().min(1).max(90).parse(query.get("days") ?? 30); return Response.json(await getWorkspaceInsights(user, campus, days), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
