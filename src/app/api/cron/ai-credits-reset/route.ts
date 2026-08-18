import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";

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

  return runUnscoped("ai-credit-reset cron: cross-tenant credit rollover", async () => {
    const now = new Date();
    const resetKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const marker = await prisma.platformConfig.findUnique({
      where: { key: "ai_credits_reset_month" },
    });

    if (marker?.value === resetKey) {
      return Response.json({ success: true, skipped: true, month: resetKey });
    }

    const result = await prisma.school.updateMany({
      data: { aiCreditsUsed: 0 },
    });

    await prisma.platformConfig.upsert({
      where: { key: "ai_credits_reset_month" },
      create: { key: "ai_credits_reset_month", value: resetKey },
      update: { value: resetKey },
    });

    return Response.json({ success: true, skipped: false, month: resetKey, schoolsReset: result.count });
  });
}