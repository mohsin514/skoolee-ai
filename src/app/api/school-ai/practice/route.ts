import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { learnerPractice } from "@/lib/school-ai/practice-service";

export const dynamic = "force-dynamic";
// SKO-408 R18.6: approved practice for the learner's class, key-free.
export async function GET() {
  try { return Response.json(await learnerPractice(await requireAuthUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
