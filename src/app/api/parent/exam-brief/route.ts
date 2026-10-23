import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { AccessDenied } from "@/lib/auth/policy";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { withParentScope } from "@/lib/parent/resolve-child";
import { acknowledgeExamBrief, familyExamBrief } from "@/lib/academic/exam-brief";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function childOf(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { schoolId, id: studentId }, select: { id: true, classId: true } });
  if (!student) throw new AccessDenied("student");
  return student;
}
// SKO-505 Family Exam Brief: the date-sheet changes that concern this child, and the guardian's acknowledgement.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
      if (!permissions.learningRecords) throw new AccessDenied("exam schedule");
      return Response.json({ success: true, data: await familyExamBrief(schoolId, await childOf(schoolId, studentId!), user.userId) }, { headers });
    });
  } catch (error) { return errorResponse(error, "[parent/exam-brief] GET failed"); }
}
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    const { versionId } = z.strictObject({ versionId: z.string().min(1).max(120) }).parse(await req.json());
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
      if (!permissions.learningRecords) throw new AccessDenied("exam schedule");
      return Response.json({ success: true, data: await acknowledgeExamBrief(schoolId, await childOf(schoolId, studentId!), user.userId, versionId) }, { headers });
    });
  } catch (error) { return errorResponse(error, "[parent/exam-brief] POST failed"); }
}
