import { NextRequest } from "next/server";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { getSchoolSetupOptions } from "@/lib/school-ai/school-setup-service";
import { schoolAiError } from "@/lib/school-ai/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const user = await requireSchoolAiUser(); return Response.json({ options: await getSchoolSetupOptions(user, request.nextUrl.searchParams.get("campusId")) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
