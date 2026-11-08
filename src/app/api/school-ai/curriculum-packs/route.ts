import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { requestCurriculumPack, schoolCurriculumPacks } from "@/lib/school-ai/curriculum-pack-service";
import { packError, packHeaders } from "@/lib/school-ai/curriculum-pack-http";

export const dynamic = "force-dynamic";

// SKAI-1008..1012: a school's curriculum pack requests (group owner, campus admin, principal).
export async function GET() {
  try { return Response.json(await schoolCurriculumPacks(await requireAuthUser()), { headers: packHeaders }); }
  catch (error) { return packError(error); }
}

export async function POST(request: Request) {
  try { assertSameOrigin(request); return Response.json(await requestCurriculumPack(await requireAuthUser(), await readBoundedJson(request, 4000)), { status: 201, headers: packHeaders }); }
  catch (error) { return packError(error); }
}
