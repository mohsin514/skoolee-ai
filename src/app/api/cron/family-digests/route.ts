import { NextRequest } from "next/server";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { dispatchDigest, dueDigests } from "@/lib/family/digests";
import { notifyDigestDeliveries } from "@/lib/family/digest-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKO-423: send scheduled family digests whose time has come. Safe to retry: deliveries are unique per
// child, week, guardian and channel, so a repeated run never sends twice.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return Response.json({ error: "Cron not configured" }, { status: 503 });
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const due = await runUnscoped("find scheduled family digests", () => dueDigests());
  const results = [];
  for (const digest of due) {
    try {
      const result = await runWithTenantContext({ schoolId: digest.schoolId }, async () => {
        const sent = await dispatchDigest(digest.schoolId, digest.id);
        await notifyDigestDeliveries(digest.schoolId, digest.campusId, sent.created);
        return sent;
      });
      results.push({ id: digest.id, delivered: result.created.length, blocked: result.blocked });
    } catch (error) { console.error("[cron/family-digests] failed", digest.id, error); results.push({ id: digest.id, error: true }); }
  }
  return Response.json({ success: true, results });
}
