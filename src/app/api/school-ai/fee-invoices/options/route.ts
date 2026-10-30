import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { getFeeInvoiceOptions } from "@/lib/school-ai/fee-invoices-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const user = await requireSchoolAiUser();
    const options = await getFeeInvoiceOptions(user, request.nextUrl.searchParams.get("campusId"), request.nextUrl.searchParams.get("classId"));
    return Response.json({ options }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SchoolAiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return errorResponse(error, "Unable to load fee invoice choices.");
  }
}
