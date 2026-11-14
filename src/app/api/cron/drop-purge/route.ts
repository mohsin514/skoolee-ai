import { fail, ok } from "@/lib/api/envelope";
import { NextRequest } from "next/server";
import { purgeExpiredDrops } from "@/lib/drop/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKAI-1847: remove Skoolee Drop sessions and their staged files an hour after they expire.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return fail("INTERNAL", "Cron not configured", undefined, 503);
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return fail("UNAUTHORIZED", "Unauthorized");
  return ok(await purgeExpiredDrops());
}
