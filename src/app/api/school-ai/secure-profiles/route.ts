import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { listProfiles, saveProfile } from "@/lib/school-ai/secure-browser-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { return Response.json({ profiles: await listProfiles(await requireAuthUser()) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request) {
  try { assertSameOrigin(request); return Response.json({ profile: await saveProfile(await requireAuthUser(), await readBoundedJson(request, 64000)) }, { status: 201, headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
