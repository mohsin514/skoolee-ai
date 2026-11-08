import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { getTransfer } from "@/lib/learning/transfer";

type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try { return Response.json({ success: true, data: await getTransfer(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error, "[learning-transfers/:id] GET failed"); }
}
