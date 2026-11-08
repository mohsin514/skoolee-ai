import { z } from "zod";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getSetupJourney } from "@/lib/school-ai/setup-journey-service";
export const runtime = "nodejs";
export async function GET(request: Request) {
 try {
  const user = await requireSchoolAiUser("view");
  const id = z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("recordId"));
  return Response.json(await getSetupJourney(user, id), { headers: { "Cache-Control": "private, no-store" } });
 } catch (error) { return schoolAiError(error); }
}
