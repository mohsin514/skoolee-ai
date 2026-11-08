import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { activateDue, expireOverrides } from "@/lib/group-policy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKO-443: activate scheduled group policy versions at their date and mark expired overrides. Each activation is
// claimed under a per-template lock, so overlapping runs record one activation.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return Response.json({ error: "Cron not configured" }, { status: 503 });
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const schools = await runUnscoped("find schools with group policy work", async () => [...new Set([
    ...(await prisma.policyTemplateVersion.findMany({ where: { status: "SCHEDULED", effectiveFrom: { lte: new Date() } }, select: { schoolId: true } })).map(r => r.schoolId),
    ...(await prisma.policyOverride.findMany({ where: { status: "APPROVED", validUntil: { lte: new Date() } }, select: { schoolId: true } })).map(r => r.schoolId),
  ])]);
  let activated = 0, expired = 0;
  for (const schoolId of schools) {
    try { await runWithTenantContext({ schoolId }, async () => { activated += await activateDue(schoolId); expired += await expireOverrides(schoolId); }); }
    catch (error) { console.error("[cron/group-policy] failed", schoolId, error); }
  }
  return Response.json({ success: true, activated, expired });
}
