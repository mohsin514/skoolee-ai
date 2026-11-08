import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { pilotLedger, updatePilotLedger } from "@/lib/school-ai/pilot-ledger-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
// SKO-507 Pilot Ledger: the latest computed metrics for an opted-in school; opt in, opt out or compute now.
export async function GET() {
  try { return Response.json({ ledger: await pilotLedger(await requireAuthUser()) }, { headers }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(request: Request) {
  try { assertSameOrigin(request); return Response.json({ ledger: await updatePilotLedger(await requireAuthUser(), await readBoundedJson(request, 2000)) }, { headers }); }
  catch (error) { return schoolAiError(error); }
}
