import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { deliverDue } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKO-445: send due webhook deliveries. Each delivery is leased before sending, so overlapping runs never send it twice.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return Response.json({ error: "Cron not configured" }, { status: 503 });
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const schools = await runUnscoped("find schools with due webhook deliveries", async () => [...new Set((await prisma.integrationDelivery.findMany({ where: { status: { in: ["PENDING", "DELIVERING"] }, nextAttemptAt: { lte: new Date() } }, select: { schoolId: true }, distinct: ["schoolId"] })).map(r => r.schoolId))]);
  let sent = 0;
  for (const schoolId of schools) {
    try { sent += await runWithTenantContext({ schoolId }, () => deliverDue(schoolId)); }
    catch (error) { console.error("[cron/integrations] failed", schoolId, error); }
  }
  return Response.json({ success: true, sent });
}
