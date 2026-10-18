import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { exportClinic, exportConcern } from "@/lib/care/service";

export const runtime = "nodejs";

// SKO-439: one confidential record as text. Access is rechecked here, so an expired grant cannot export.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    const file = p.get("concernId") ? await exportConcern(user, p.get("concernId")!) : p.get("studentId") ? await exportClinic(user, p.get("studentId")!) : null;
    if (!file) throw new ApiError("Choose a record to export.", 400);
    return new Response(file.body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[care/export] GET failed"); }
}
