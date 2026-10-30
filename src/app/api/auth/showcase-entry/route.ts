import { resolveShowcaseEntry } from "@/lib/onboarding/showcase-entry";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    return Response.json(await resolveShowcaseEntry(), { headers });
  } catch {
    // Unknown session/setup state must never be mistaken for a new visitor.
    return Response.json({ error: "Unable to check your next step. Please retry." }, { status: 503, headers });
  }
}
