import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { creditResetMonthKey, resetCreditUsage } from "@/lib/billing/credit-policy";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { normalizePlan } from "@/config/plans";
import { activeStudentWhere } from "@/lib/billing/entitlements";
import { monthlyAiCreditAllowance } from "@/lib/billing/plan-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

// Monthly AI-credit reset (Vercel Cron). Guarded by a platform marker so it
// only fires once per calendar month even if the schedule misfires or a manual
// run happens mid-month.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) {
    return Response.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runUnscoped("ai-credit-reset cron: cross-tenant monthly credit expiry", async () => {
    const now = new Date();
    const resetKey = creditResetMonthKey(now);

    const marker = await prisma.platformConfig.findUnique({
      where: { key: "ai_credits_reset_month" },
    });

    if (marker?.value === resetKey) {
      return Response.json({ success: true, skipped: true, month: resetKey });
    }

    const result = await prisma.school.updateMany({
      data: { aiCreditsUsed: resetCreditUsage(0) },
    });

    // Terms that scale credits by student get this month's allowance from today's active students:
    // max(fixed credits, per-student credits × active students). Other schools keep their saved credits.
    const schools = await prisma.school.findMany({ where: { status: { not: "DELETED" } }, select: { id: true, plan: true, commercialContract: true } });
    const perStudent = schools
      .map((school) => ({ id: school.id, terms: getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract) }))
      .filter(({ terms }) => terms.aiCreditsPerStudent > 0);
    const counts = perStudent.length
      ? await prisma.student.groupBy({ by: ["schoolId"], where: activeStudentWhere({ in: perStudent.map(({ id }) => id) }), _count: { _all: true } })
      : [];
    const active = new Map(counts.map((row) => [row.schoolId, row._count._all]));
    for (const { id, terms } of perStudent) {
      await prisma.school.update({ where: { id }, data: { aiCreditsLimit: monthlyAiCreditAllowance(terms, active.get(id) ?? 0) } });
    }

    await prisma.platformConfig.upsert({
      where: { key: "ai_credits_reset_month" },
      create: { key: "ai_credits_reset_month", value: resetKey },
      update: { value: resetKey },
    });

    return Response.json({ success: true, skipped: false, month: resetKey, schoolsReset: result.count, perStudentAllowances: perStudent.length });
  });
}
