import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { profileConfigDownload } from "@/lib/school-ai/secure-browser-service";

export const dynamic = "force-dynamic";
// SKO-501: the profile's own Safe Exam Browser file. Open it in the SEB Configuration Tool and register the
// Config Key it shows on the profile; every sitting of this profile version serves these same bytes.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const file = await profileConfigDownload(await requireAuthUser(), (await context.params).id, process.env.SEB_PUBLIC_ORIGIN ?? new URL(request.url).origin);
    return new Response(file.body, { headers: { "Content-Type": "application/seb", "Content-Disposition": `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
