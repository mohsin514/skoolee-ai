import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { suggestSchoolTimetable } from "@/lib/school-ai/school-operations-service";
export async function POST(request: Request) {
  try { assertSameOrigin(request); const user = await requireSchoolAiUser("add"); return Response.json({ suggestion: await suggestSchoolTimetable(user, await readBoundedJson(request, 160000)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
