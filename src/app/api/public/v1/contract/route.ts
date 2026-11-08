import { V1 } from "@/lib/integrations/contract";

export const runtime = "nodejs";

// SKO-445: the published v1 contract — schemas, pagination, errors, idempotency, ordering and deprecation policy.
export function GET() {
  return Response.json(V1, { headers: { "Skoolee-Api-Version": "v1", "Cache-Control": "public, max-age=300" } });
}
