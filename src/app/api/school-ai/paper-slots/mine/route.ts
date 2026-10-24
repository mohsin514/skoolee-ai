import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { mySlots } from "@/lib/school-ai/paper-slot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-500: the paper requests that concern the reader (author, moderator, head of department, or office).
export async function GET() {
  try { return Response.json(await mySlots(await requireAuthUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
