// ===========================================
// GET /api/ai/credits — Check remaining AI credits
// ===========================================

export const dynamic = "force-dynamic";

import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getAICreditSnapshot } from "@/lib/ai/openai";

export async function GET() {
  try {
    const user = await getAuthUser();
    const userId = user?.userId;
    if (!userId || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId;

    const [snapshot, usageByFeature, pendingReviews] = await Promise.all([
      getAICreditSnapshot(schoolId),
      prisma.aIUsageLog.groupBy({
        by: ["feature"],
        where: { schoolId },
        _count: { _all: true },
        _sum: { tokensUsed: true },
      }),
      prisma.aIReviewItem.count({
        where: {
          schoolId,
          status: "PENDING",
          ...(user.campusId ? { campusId: user.campusId } : {}),
        },
      }),
    ]);

    return Response.json({
      success: true,
      data: {
        used: snapshot.used,
        limit: snapshot.limit,
        remaining: snapshot.remaining,
        plan: snapshot.plan,
        pendingReviews,
        usageByFeature: usageByFeature.map((row) => ({
          feature: row.feature || "legacy",
          requests: row._count._all,
          tokensUsed: row._sum.tokensUsed || 0,
        })),
      },
    });
  } catch (error) {
    console.error("[ai/credits] Error:", error);
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
