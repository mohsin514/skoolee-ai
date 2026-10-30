import { NextRequest } from "next/server";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { dueReminders } from "@/lib/meetings/service";
import { remind } from "@/lib/meetings/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKO-420: remind both sides of meetings in the next day. Each booking is claimed before sending, so a
// repeated or overlapping run never reminds twice; a moved meeting is reminded again for its new time.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return Response.json({ error: "Cron not configured" }, { status: 503 });
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const due = await runUnscoped("find meetings to remind", () => dueReminders());
  let reminded = 0;
  for (const booking of due) {
    try { if (await runWithTenantContext({ schoolId: booking.schoolId }, () => remind(booking))) reminded++; }
    catch (error) { console.error("[cron/meeting-reminders] failed", booking.id, error); }
  }
  return Response.json({ success: true, reminded });
}
