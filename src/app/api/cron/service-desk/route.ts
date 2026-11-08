import { NextRequest } from "next/server";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { overdueForEscalation } from "@/lib/service-desk/service";
import { escalate } from "@/lib/service-desk/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKO-441: escalate overdue service requests once per due time. Each request is claimed before the notice,
// so a repeated or overlapping run never escalates twice; a new due time can escalate again.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return Response.json({ error: "Cron not configured" }, { status: 503 });
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const due = await runUnscoped("find overdue service requests", () => overdueForEscalation());
  let escalated = 0;
  for (const request of due) {
    try { if (await runWithTenantContext({ schoolId: request.schoolId }, () => escalate(request))) escalated++; }
    catch (error) { console.error("[cron/service-desk] failed", request.id, error); }
  }
  return Response.json({ success: true, escalated });
}
