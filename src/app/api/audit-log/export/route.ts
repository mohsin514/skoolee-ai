import { NextRequest } from "next/server";
import { auditExportQuery, exportAuditHistory } from "@/lib/audit-history";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const query = auditExportQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!query.success) throw new ApiError("Choose valid export filters.", 400);
    // Export is a separate, revocable permission on top of history access.
    const result = await exportAuditHistory(user, query.data, actor => assertPermission(actor, "reports", "view"));
    return new Response("﻿" + result.csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Export-Rows": String(result.rows),
      "X-Export-Truncated": String(result.truncated),
    } });
  } catch (error) {
    const response = errorResponse(error, "[audit-log] export failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
