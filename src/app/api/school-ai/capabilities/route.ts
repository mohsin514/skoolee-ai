import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiProviderCapabilities } from "@/lib/school-ai/providers";
import { schoolAiError } from "@/lib/school-ai/http";
import { schoolPlanFeatures } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireSchoolAiUser("view");
    // SKAI-2177: a configured provider is not enough; the school's plan must include Exam Studio.
    const plan = await schoolPlanFeatures(user.schoolId);
    const providers = schoolAiProviderCapabilities();
    return Response.json({ ...providers, paperGeneration: providers.paperGeneration && plan.examStudioEnabled, examStudio: plan.examStudioEnabled }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
