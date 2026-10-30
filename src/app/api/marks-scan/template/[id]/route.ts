import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { templateSheet } from "@/lib/marks-scan/service";

// SKO-412: the printable sheet (pages, rows, one QR per page holding only the opaque reference).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireAuthUser(); const { id } = await params; return Response.json({ success: true, data: await templateSheet(user, id) }); }
  catch (error) { return errorResponse(error, "[marks-scan/template] GET failed"); }
}
