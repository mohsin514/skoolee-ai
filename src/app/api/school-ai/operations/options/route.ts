import type { NextRequest } from "next/server";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { isSchoolOperationsOperation } from "@/lib/school-ai/school-operations";
import { getSchoolOperationsOptions } from "@/lib/school-ai/school-operations-service";
export async function GET(request: NextRequest) {
  try { const user = await requireSchoolAiUser(), search = request.nextUrl.searchParams, operation = search.get("operation") ?? ""; if (!isSchoolOperationsOperation(operation) || !search.get("campusId")) throw new SchoolAiError("Choose an operation and campus.", 400); return Response.json({ options: await getSchoolOperationsOptions(user, search.get("campusId")!, operation, search.get("classId"), search.get("date")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
