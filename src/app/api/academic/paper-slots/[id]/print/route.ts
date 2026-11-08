import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { printSealedSlot } from "@/lib/school-ai/moderation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-501: print the sealed version only, refused once the paper changed after the Seal.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    return new Response(await printSealedSlot(await requireAuthUser(), (await ctx.params).id), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) { return errorResponse(error, "[paper-slots/:id/print] GET failed"); }
}
