import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { exportTransfer } from "@/lib/learning/transfer";

// Consent and the caller's access are rechecked on every download; nothing is cached.
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = await exportTransfer(await requireAuthUser(), id);
    return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="transfer-${id}.json"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[learning-transfers/:id/export] GET failed"); }
}
