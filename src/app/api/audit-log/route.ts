import { NextRequest } from "next/server";
import { auditHistoryQuery, listAuditHistory } from "@/lib/audit-history";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const query = auditHistoryQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!query.success) throw new ApiError("Choose valid history filters.", 400);
    const result = await listAuditHistory(user, query.data);
    return Response.json({ success: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = errorResponse(error, "[audit-log] GET failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
