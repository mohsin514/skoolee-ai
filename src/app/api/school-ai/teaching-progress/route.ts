import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { SchoolAiError } from "@/lib/school-ai/access";
import { getTeachingLine } from "@/lib/school-ai/teaching-progress-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-500: a class's Teaching Line over its current approved syllabus.
export async function GET(request: NextRequest) {
  try {
    const subjectId = request.nextUrl.searchParams.get("subjectId") ?? "", classId = request.nextUrl.searchParams.get("classId") ?? "";
    if (!subjectId || !classId || subjectId.length > 128 || classId.length > 128) throw new SchoolAiError("Choose a subject and class.", 400);
    return Response.json({ line: await getTeachingLine(await requireAuthUser(), { subjectId, classId }) }, { headers: noStore });
  } catch (error) { return schoolAiError(error); }
}
