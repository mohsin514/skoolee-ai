import type { NextRequest } from "next/server";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getPublicationOptions } from "@/lib/school-ai/school-operations-service";
export async function GET(request: NextRequest) { try { const user = await requireSchoolAiUser(), campusId = request.nextUrl.searchParams.get("campusId"); if (!campusId) throw new SchoolAiError("Choose a campus.", 400); return Response.json({ options: await getPublicationOptions(user, campusId) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
