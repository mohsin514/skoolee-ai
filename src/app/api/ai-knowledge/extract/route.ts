import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedForm, schoolAiError } from "@/lib/school-ai/http";
import { extractDocument } from "@/lib/school-ai/providers";
import { SchoolAiError, assertWorkspacePermission } from "@/lib/school-ai/access";
import { isKnowledgeManager } from "@/lib/rag/service";
import { workflowJson } from "@/lib/ai-workflows/http";
import { authorizeActor, inTenant } from "@/lib/ai-workflows/jobs/actor";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    await inTenant(user, async () => {
      await authorizeActor(user);
      if (!isKnowledgeManager(user.role)) throw new SchoolAiError("Only knowledge managers can import documents.", 403);
      if (user.role !== "APP_OWNER") await assertWorkspacePermission(user, "ai", "edit");
    });
    if (!(await authRateLimit(`rag-extract:${user.userId}`, { limit: 5, windowMs: 300000 })).ok) throw new SchoolAiError("Too many uploads. Try again shortly.", 429);
    const form = await readBoundedForm(request, 8 * 1024 * 1024 + 32000), file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) throw new SchoolAiError("Choose a document up to 8 MB.", 422);
    const extension = file.name.toLowerCase().split(".").pop();
    const textFile = ["txt", "md", "csv"].includes(extension ?? "");
    const mime = textFile ? "text/plain" : extension === "pdf" ? "application/pdf" : ["png", "jpg", "jpeg"].includes(extension ?? "") ? extension === "png" ? "image/png" : "image/jpeg" : null;
    if (!mime) throw new SchoolAiError("Use TXT, Markdown, CSV, PDF, PNG or JPEG. Export Word documents as PDF first.", 422);
    if (textFile && file.size > 320000) throw new SchoolAiError("Text documents must be at most 80,000 characters.", 422);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (mime === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") throw new SchoolAiError("The file is not a valid PDF.", 422);
    const result = await extractDocument(bytes, file.name.slice(0, 160), mime, "en");
    return workflowJson({ title: file.name.slice(0, 160), content: result.text, uncertainties: result.uncertainties, requiresReview: true });
  } catch (error) { return schoolAiError(error); }
}
