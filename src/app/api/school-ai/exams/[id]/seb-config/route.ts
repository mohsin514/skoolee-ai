import { requireAuthUser } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { schoolAiError } from "@/lib/school-ai/http";
import { scopedAssignment } from "@/lib/school-ai/exam-service";
import { configFile } from "@/lib/school-ai/secure-browser-service";

export const dynamic = "force-dynamic";
// The starting Safe Exam Browser configuration for this exam; anyone who can open the exam may download it.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { assignment } = await scopedAssignment(await requireAuthUser(), (await context.params).id);
    const body = await configFile(prisma, assignment, process.env.SEB_PUBLIC_ORIGIN ?? new URL(request.url).origin);
    return new Response(body, { headers: { "Content-Type": "application/seb", "Content-Disposition": `attachment; filename="exam-${assignment.id.slice(0, 8)}.seb"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
