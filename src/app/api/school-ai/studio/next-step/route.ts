import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { studioNextStep } from "@/lib/school-ai/next-step-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: the one next step Exam Studio shows this person (ordered rule in next-studio-step.ts).
export async function GET() {
  try { return Response.json(await studioNextStep(await requireAuthUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
