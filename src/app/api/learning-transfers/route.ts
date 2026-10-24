import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { createBridge, importTransfer, listTransfers, reviewMapping, setDestination } from "@/lib/learning/transfer";

// SKO-471: staff side of the learning transfer bridge.
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId") ?? "";
    if (!studentId || studentId.length > 120) throw new ApiError("Choose a learner", 400);
    return Response.json({ success: true, data: await listTransfers(await requireAuthUser(), studentId) }, { headers });
  } catch (error) { return errorResponse(error, "[learning-transfers] GET failed"); }
}
const Body = z.object({ action: z.enum(["import", "destination", "review", "bridge"]), data: z.unknown() }).strict();
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Invalid transfer request", 400);
    const { action, data } = parsed.data;
    const result = action === "import" ? await importTransfer(user, data) : action === "destination" ? await setDestination(user, data) : action === "review" ? await reviewMapping(user, data) : await createBridge(user, data);
    return Response.json({ success: true, data: result }, { headers });
  } catch (error) { return errorResponse(error, "[learning-transfers] POST failed"); }
}
