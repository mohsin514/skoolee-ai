import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { templateSheet } from "@/lib/marks-scan/service";

// SKO-412: the printable sheet (pages, rows, one QR per page holding only the opaque reference).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireAuthUser(); const { id } = await params; return ok(await templateSheet(user, id)); }
  catch (error) { return failFrom(error, "[marks-scan/template] GET failed"); }
}
