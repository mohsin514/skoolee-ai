import { Prisma } from "@prisma/client";
import { retryDatabaseTransaction } from "@/lib/school-ai/transaction";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { sweepConversationRetention } from "@/lib/school-ai/conversation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

// SKO-460: daily retention sweep for private School AI conversations. The period comes from
// SCHOOL_AI_CONVERSATION_RETENTION_DAYS (default 365, minimum 30); at most 500 per run.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) return Response.json({ error: "Cron not configured" }, { status: 503 });
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const days = Number.parseInt(process.env.SCHOOL_AI_CONVERSATION_RETENTION_DAYS ?? "365", 10);
  const result = await runUnscoped("conversation retention sweep across schools", () => retryDatabaseTransaction(() => prisma.$transaction(
    tx => sweepConversationRetention(tx, new Date(), Number.isInteger(days) ? days : 365),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
  )));
  return Response.json(result);
}
