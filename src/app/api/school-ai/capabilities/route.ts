import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiProviderCapabilities } from "@/lib/school-ai/providers";
import { schoolAiError } from "@/lib/school-ai/http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireSchoolAiUser("view");
    return Response.json(schoolAiProviderCapabilities(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
