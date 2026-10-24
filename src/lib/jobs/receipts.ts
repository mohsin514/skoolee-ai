import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
const receiptSchema = z.object({
  id: z.string().min(1).max(512),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string().regex(/^[0-9]{1,12}$/),
});
/** Verify the exact request bytes before parsing any provider data. */
export function verifiedMetaSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
) {
  if (!secret || !signature || !/^sha256=[0-9a-f]{64}$/.test(signature))
    return false;
  const actual = Buffer.from(signature.slice(7), "hex");
  return timingSafeEqual(
    actual,
    createHmac("sha256", secret).update(body).digest(),
  );
}
export async function recordMetaReceipts(body: unknown) {
  const input = body as {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          statuses?: Array<{
            id?: string;
            status?: string;
            timestamp?: string;
          }>;
          metadata?: { phone_number_id?: string };
        };
      }>;
    }>;
  };
  if (!input || !Array.isArray(input.entry)) return;
  for (const entry of input.entry)
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (
        !process.env.WHATSAPP_PHONE_NUMBER_ID ||
        change?.field !== "messages" ||
        change.value?.metadata?.phone_number_id !==
          process.env.WHATSAPP_PHONE_NUMBER_ID
      )
        continue;
      for (const candidate of Array.isArray(change.value?.statuses) ? change.value.statuses : []) {
        const parsed = receiptSchema.safeParse(candidate);
        if (!parsed.success) continue;
        const status = parsed.data;
        const at = new Date(Number(status.timestamp) * 1000);
        if (
          !Number.isFinite(at.getTime()) ||
          at.getTime() > Date.now() + 300000
        )
          continue;
        // Provider message id resolves tenancy; callers cannot supply a school or communication id.
        // Receipts remain independent of cancellation. The originating intent
        // precedes the provider call; sent_at is recorded after its response and
        // can be later than a legitimate provider event. Compare creation time
        // at provider-second precision, and dedupe each signed state/time receipt.
        // Prisma DateTime columns are UTC timestamp-without-time-zone. Cast the
        // normalized ISO string explicitly so the database session timezone cannot
        // reinterpret the origin while comparing a bound timestamptz parameter.
        const occurredAt = at.toISOString();
        const [result] = await prisma.$queryRaw<Array<{ origins: number; ready: boolean }>>`WITH origins AS (
      SELECT id,school_id,sent_at,created_at FROM parent_communications
      WHERE provider_message_id=${status.id} AND channel='WHATSAPP'
    ), inserted AS (
    INSERT INTO delivery_receipts(id,school_id,communication_id,provider_message_id,state,occurred_at)
    SELECT ${randomUUID()},origin.school_id,origin.id,${status.id},${status.status},${occurredAt}::timestamp FROM origins origin
    WHERE (SELECT count(*) FROM origins)=1 AND origin.sent_at IS NOT NULL
      AND ${occurredAt}::timestamp >= date_trunc('second',origin.created_at)
    ON CONFLICT(communication_id,state,occurred_at) DO NOTHING RETURNING id
    ) SELECT count(*)::int AS origins,coalesce(bool_and(sent_at IS NOT NULL),false) AS ready FROM origins`;
        // A callback may race the provider response being persisted. Acknowledge
        // only after a unique origin exists; a retry can then store the receipt.
        // Never guess a tenant or silently discard an ambiguous provider identity.
        if (result.origins !== 1 || !result.ready) throw new Error("RECEIPT_ORIGIN_NOT_READY");
      }
    }
}
