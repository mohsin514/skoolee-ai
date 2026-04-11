// ===========================================
// GET /api/ai/credits — Check remaining AI credits
// ===========================================

export const dynamic = "force-dynamic";

import { getAuthUser } from "@/lib/auth";
import { getTenantForUser } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await getAuthUser();
    const userId = user?.userId;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant" }, { status: 403 });
    }

    const s = await prisma.school.findUnique({
      where: { id: tenant.schoolId },
      select: {
        aiCreditsUsed: true,
        aiCreditsLimit: true,
        plan: true,
      },
    });

    return Response.json({
      success: true,
      data: {
        used: s?.aiCreditsUsed || 0,
        limit: s?.aiCreditsLimit || 100,
        remaining: (s?.aiCreditsLimit || 100) - (s?.aiCreditsUsed || 0),
        plan: s?.plan || "FREE",
      },
    });
  } catch (error) {
    console.error("[ai/credits] Error:", error);
    return Response.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
