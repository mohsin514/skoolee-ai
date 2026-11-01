import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { getAuthUser } from "@/lib/auth";
import { withParentScope } from "@/lib/parent/resolve-child";
import { familyInbox } from "@/lib/parent/inbox";

export const runtime = "nodejs";

// SKO-419: the family action inbox. A signed-in guardian sees every verified child, each under that
// child's own permissions. Retired capability-token parameters never change this signed-in scope.
export async function GET(req: NextRequest) {
  try {
    // A missing, expired or disabled session is an authentication failure (401), not a permission one.
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return await withParentScope(req, async scope => {
      const data = await familyInbox({
        guardianUserId: user.userId,
        schoolId: scope.schoolId,
        children: scope.children,
        singleStudentId: null,
        linkQuery: childId => `?student=${encodeURIComponent(childId)}`,
      });
      return Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) {
    return errorResponse(error, "[parent/inbox] GET failed");
  }
}
