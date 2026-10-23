import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { printSitting } from "@/lib/school-ai/exam-print-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-501: the sitting's sealed paper, printed only while its hash matches the seal (footer shows the prefix).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return new Response(await printSitting(await requireAuthUser(), (await context.params).id), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), display-capture=()",
    } });
  } catch (error) { return schoolAiError(error); }
}
