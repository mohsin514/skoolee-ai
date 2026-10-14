import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
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
  for (const entry of input.entry || [])
    for (const change of entry.changes || []) {
      if (
        !process.env.WHATSAPP_PHONE_NUMBER_ID ||
        change.field !== "messages" ||
        change.value?.metadata?.phone_number_id !==
          process.env.WHATSAPP_PHONE_NUMBER_ID
      )
        continue;
      for (const status of change.value?.statuses || []) {
        if (
          !status.id ||
          !["sent", "delivered", "read", "failed"].includes(status.status || "")
        )
          continue;
        const at = new Date(Number(status.timestamp) * 1000);
        if (
          !Number.isFinite(at.getTime()) ||
          at.getTime() > Date.now() + 300000
        )
          continue;
        // Provider message id resolves tenancy; callers cannot supply a school or communication id.
        // Receipts remain independent of cancellation and arrive monotonically without rewriting processing outcomes.
        await prisma.$executeRaw`INSERT INTO delivery_receipts(id,school_id,communication_id,provider_message_id,state,occurred_at)
    SELECT ${randomUUID()},school_id,id,${status.id},${status.status},${at} FROM parent_communications
    WHERE provider_message_id=${status.id} AND channel='WHATSAPP' AND sent_at IS NOT NULL
    ON CONFLICT(communication_id,state,occurred_at) DO NOTHING`;
      }
    }
}
