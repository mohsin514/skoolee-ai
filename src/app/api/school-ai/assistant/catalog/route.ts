import { z } from "zod";
import { ApiError } from "@/lib/api/scope";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { assistantFocusSchema } from "@/lib/school-ai/assistant-focus";
import { assistantCatalogQuerySchema } from "@/lib/school-ai/assistant-catalog";
import { assertCatalogFocus, getAssistantCatalog } from "@/lib/school-ai/assistant-catalog-service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireSchoolAiUser("add"), params = new URL(request.url).searchParams;
    const campusId = z.string().min(1).max(128).nullable().parse(params.get("campusId"));
    const domain = assistantFocusSchema.parse({ domain: params.get("domain") }).domain;
    const raw = z.string().min(1).max(1000).parse(params.get("query"));
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new ApiError("Choose a valid workflow query.", 400); }
    const query = assistantCatalogQuerySchema.parse(parsed); assertCatalogFocus(domain, query);
    return Response.json(await getAssistantCatalog(user, campusId, query), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
