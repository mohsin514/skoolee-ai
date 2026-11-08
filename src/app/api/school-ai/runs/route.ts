import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { createSchoolRun, listSchoolRuns } from "@/lib/school-ai/run-service";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const user = await requireSchoolAiUser("view"), campus = z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("campusId")); return Response.json({ runs: await listSchoolRuns(user, campus) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireSchoolAiUser("edit"); return Response.json({ run: await createSchoolRun(user, await readBoundedJson(request, 30000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
