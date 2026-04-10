// ===========================================
// GET /api/ai/credits — Check remaining AI credits
// ===========================================

import { auth } from "@clerk/nextjs/server";
import { getTenantForUser } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant" }, { status: 403 });
    }

    const t = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: {
        aiCreditsUsed: true,
        aiCreditsLimit: true,
        plan: true,
      },
    });

    return Response.json({
      success: true,
      data: {
        used: t?.aiCreditsUsed || 0,
        limit: t?.aiCreditsLimit || 100,
        remaining: (t?.aiCreditsLimit || 100) - (t?.aiCreditsUsed || 0),
        plan: t?.plan || "FREE",
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
