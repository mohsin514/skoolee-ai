import { NextRequest } from "next/server";
import { ApiError, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { academicImpact } from "@/lib/academic/structure";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-462: what changing or removing a class or subject touches, shown before it is confirmed.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const params = new URL(req.url).searchParams, kind = params.get("kind"), id = params.get("id");
    if ((kind !== "class" && kind !== "subject") || !id) throw new ApiError("Choose a class or subject", 400);
    return Response.json({ success: true, impact: await schoolAiTransaction(user, tx => academicImpact(tx, user, kind, id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[academic impact] GET failed");
  }
}
