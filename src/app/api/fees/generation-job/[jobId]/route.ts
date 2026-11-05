import { NextRequest } from "next/server";
import { assertFeesRead, errorResponse, requireAuthUser } from "@/lib/api/scope";

/**
 * SKAI-1765: invoice generation is synchronous — POST /api/fees/generate-invoices returns the outcome
 * itself and persists no job. This endpoint used to answer "completed" for any month-shaped id, including
 * months never generated and other schools' months. With no job to resolve, every id is not found; the
 * fees-read check still runs first.
 */
export async function GET(
  _req: NextRequest,
  _ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await requireAuthUser();
    await assertFeesRead(user);
    return Response.json({ error: "Invoice generation job not found" }, { status: 404 });
  } catch (error) {
    return errorResponse(error, "[fees/generation-job] GET failed");
  }
}
