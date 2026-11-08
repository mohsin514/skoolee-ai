import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";

/** Who a direct provider call is attributed to. Never carries prompt, input text or media bytes. */
export type ProviderUsageContext = { schoolId: string; campusId?: string | null; userId?: string | null; role?: string; feature: string };

/**
 * SKAI-837: embeddings and media calls use their own approved OpenAI clients, so they record
 * metadata-only usage here. Logging is best effort and never changes the call's outcome.
 * Credits are not reserved: a reservation could block existing RAG indexing/search fallbacks.
 */
export async function recordProviderUsage(context: ProviderUsageContext | undefined, entry: { action: string; model: string; tokensUsed: number; metadata: Record<string, Prisma.InputJsonValue> }) {
  if (!context?.schoolId) return;
  try {
    await runWithTenantContext({ schoolId: context.schoolId, userId: context.userId ?? undefined, campusId: context.campusId ?? null, role: context.role }, () => prisma.aIUsageLog.create({
      data: { schoolId: context.schoolId, campusId: context.campusId || null, userId: context.userId || null, feature: context.feature, action: entry.action, model: entry.model, tokensUsed: Math.max(0, Math.trunc(entry.tokensUsed) || 0), metadata: { ...entry.metadata, gateway: "direct-provider", content: "not-retained" } },
    }));
  } catch { /* Usage logging must not break embeddings or extraction. */ }
}
