import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { supportRecords } from "@/lib/accommodations/service";
import { readJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ planId: string }> };

// Confidential supporting records: designated approvers only; every read is audited.
export async function GET(_req: NextRequest, context: Context) {
  try { return Response.json({ records: await supportRecords(await requireAuthUser(), (await context.params).planId) }, { headers: noStore }); }
  catch (error) { return schoolAiError(error); }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    assertSameOrigin(req);
    return Response.json({ records: await supportRecords(await requireAuthUser(), (await context.params).planId, await readJsonBody(req)) }, { status: 201, headers: noStore });
  } catch (error) { return schoolAiError(error); }
}
