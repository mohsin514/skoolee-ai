import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { GRACE_PERIOD_DAYS } from "@/lib/billing/entitlements";
import { notify } from "@/lib/notifications/in-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";
const DAY_MS = 86_400_000;

// Daily license sweep (Vercel Cron):
//  - within the grace window (paid period ended, not yet grace+GRACE_PERIOD_DAYS)
//    the school keeps working and managers are warned once on the first overdue day;
//  - past the grace window the school is SUSPENDED — logins and server actions are
//    blocked (requireAuthUser / assertSchoolOperational), billing stays reachable
//    so the customer can renew, and the SafePay webhook flips it back to ACTIVE.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  // In production the CRON_SECRET must be configured — otherwise anyone could
  // fire this endpoint early and suspend schools (or, for the reset cron,
  // roll back AI usage). Locally an empty secret keeps testing simple.
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) {
    return Response.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runUnscoped("subscription-expiry cron: cross-tenant license sweep", async () => {
    const now = new Date();
    const graceMs = GRACE_PERIOD_DAYS * DAY_MS;

    const schools = await prisma.school.findMany({
      where: {
        planEndsAt: { not: null },
        status: { in: ["ACTIVE", "TRIAL"] },
      },
      select: { id: true, name: true, plan: true, planEndsAt: true },
    });

    const suspended: string[] = [];
    const warned: string[] = [];

    for (const school of schools) {
      const end = school.planEndsAt!;
      const overdue = now.getTime() - end.getTime();
      if (overdue <= 0) continue;

      if (overdue > graceMs) {
        await prisma.school.update({
          where: { id: school.id },
          data: { status: "SUSPENDED" },
        });
        notify("SUBSCRIPTION_SUSPENDED", {
          schoolId: school.id,
          actorName: "System",
          plan: school.plan,
          planEndsAt: end.toISOString(),
        });
        suspended.push(school.name);
      } else if (overdue <= DAY_MS) {
        // First day of grace — one warning, then the sweep keeps quiet
        // until the grace window expires.
        notify("SUBSCRIPTION_EXPIRING", {
          schoolId: school.id,
          actorName: "System",
          plan: school.plan,
          planEndsAt: end.toISOString(),
        });
        warned.push(school.name);
      }
    }

    return Response.json({
      success: true,
      scanned: schools.length,
      warned: warned.length,
      suspended: suspended.length,
      suspendedSchools: suspended,
    });
  });
}
