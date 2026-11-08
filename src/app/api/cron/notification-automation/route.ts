import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enterTenantContext, runUnscoped } from "@/lib/db/tenant-context";
import { runNotificationAutomationSweep } from "@/lib/notifications/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * SKAI-1128: scheduled notification sweep (fee due/overdue, marks-entry deadline, principal review pending, ...).
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`; POST is accepted for manual or workflow runs.
 * Fails closed: with no CRON_SECRET configured the endpoint refuses to run.
 */
async function sweep(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return Response.json({ error: "Cron endpoint is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Enumerating schools is the one cross-tenant step; each sweep then runs inside that school's own scope.
  const schools = await runUnscoped("notification-automation cron: enumerate active schools", () =>
    prisma.school.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] } }, select: { id: true } }),
  );

  const results: Array<{ schoolId: string; sent?: number; error?: string }> = [];
  for (const school of schools) {
    enterTenantContext({ schoolId: school.id });
    try {
      const sent = await runNotificationAutomationSweep({ schoolId: school.id });
      results.push({ schoolId: school.id, sent: Array.isArray(sent) ? sent.length : 0 });
    } catch (error) {
      // One school's failure must not stop the sweep for the rest.
      console.error(`[cron/notification-automation] school ${school.id} failed`, error);
      results.push({ schoolId: school.id, error: "sweep failed" });
    }
  }

  return Response.json({ success: true, schools: schools.length, failed: results.filter((r) => r.error).length, results });
}

export const GET = sweep;
export const POST = sweep;
