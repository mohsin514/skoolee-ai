import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { getAuthUser } from "@/lib/auth";
import { withParentScope } from "@/lib/parent/resolve-child";
import { familyInbox } from "@/lib/parent/inbox";

export const runtime = "nodejs";

// SKO-419: the family action inbox. A signed-in guardian sees every verified child, each under that
// child's own permissions; a single-child link sees that child only and gains nothing else.
export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async scope => {
      const token = req.nextUrl.searchParams.get("token");
      const user = token ? null : await getAuthUser();
      const data = await familyInbox({
        guardianUserId: user?.userId ?? null,
        schoolId: scope.schoolId,
        children: token ? [] : scope.children,
        singleStudentId: token ? scope.studentId : null,
        tokenPermissions: token ? scope.permissions : undefined,
        linkQuery: childId => token ? `?token=${encodeURIComponent(token)}` : `?student=${encodeURIComponent(childId)}`,
      });
      return Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) {
    return errorResponse(error, "[parent/inbox] GET failed");
  }
}
