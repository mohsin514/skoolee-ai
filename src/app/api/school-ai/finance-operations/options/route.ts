import { NextRequest } from "next/server";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getFinanceOperationsOptions } from "@/lib/school-ai/finance-operations-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { const user = await requireSchoolAiUser(); return Response.json({ options: await getFinanceOperationsOptions(user, request.nextUrl.searchParams.get("campusId")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
