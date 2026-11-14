import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { getTransfer } from "@/lib/learning/transfer";

type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try { return ok(await getTransfer(await requireAuthUser(), (await context.params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failFrom(error, "[learning-transfers/:id] GET failed"); }
}
