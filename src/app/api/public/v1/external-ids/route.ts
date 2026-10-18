import { authenticate, linkExternalId, PublicError } from "@/lib/integrations/service";
import { respond } from "@/lib/integrations/http";

export const runtime = "nodejs";

// SKO-445: POST /api/public/v1/external-ids — roster.write; requires Idempotency-Key.
export async function POST(request: Request) {
  return respond(request, async setCaller => {
    const caller = await authenticate(request, "roster.write", "v1"); setCaller(caller);
    const body = await request.json().catch(() => { throw new PublicError(400, "VALIDATION_FAILED", "Send a JSON body."); }) as Record<string, unknown>;
    const r = await linkExternalId(caller, request.headers.get("idempotency-key"), body);
    const extra: Record<string, string> = r.replayed ? { "Idempotent-Replayed": "true" } : {};
    return { status: r.status, body: r.body, headers: extra };
  });
}
