import { NextRequest } from "next/server";
import { assertSharedModuleRead, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { familyStatement } from "@/lib/fees/family-statement";

// GET /api/fees/family-statement?studentId=&currency=
// SKO-431: the whole statement for one authorized child in one currency (no silent conversion), with
// each invoice's due state in the school's timezone and a reconciliation the family can check.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const statement = await familyStatement(user, req.nextUrl.searchParams.get("studentId"), req.nextUrl.searchParams.get("currency"), req.nextUrl.searchParams.get("invoice"));
    return Response.json({ success: true, data: statement }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[fees/family-statement] GET failed");
  }
}
