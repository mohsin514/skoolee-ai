import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { normalizePlan } from "@/lib/owner/provisioning";
import { csvCell } from "@/lib/csv";
import { ApiError } from "@/lib/api/scope";
import { computeCostReport, COST_REPORT_CSV_HEADER, type CostRates, type UsageAggregate } from "@/lib/owner/ai-cost-math";

/**
 * SKAI-1042 (D1-02): AI cost per credit, per school and calendar month (UTC).
 *
 * OpenAI spend is not stored anywhere: ai_usage_logs keeps the model and total tokens per call. Spend is therefore
 * tokens × a founder-set blended USD rate per model, converted at a founder-set PKR/USD rate. No rate is assumed:
 * until the platform owner saves rates, spend reads "not priced" instead of a made-up number.
 */
export const COST_RATES_KEY = "ai_cost_rates";

export const costRatesSchema = z.object({
  usdPerMillionTokens: z.record(z.string().trim().min(1).max(100), z.number().finite().min(0).max(10_000)).refine(v => Object.keys(v).length <= 50, "At most 50 models."),
  pkrPerUsd: z.number().finite().positive().max(100_000).nullable(),
});

export async function readCostRates(): Promise<CostRates> {
  const row = await runUnscoped("ai cost report: platform-wide cost rates", () => prisma.platformConfig.findUnique({ where: { key: COST_RATES_KEY } }));
  const parsed = costRatesSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { usdPerMillionTokens: {}, pkrPerUsd: null };
}

export async function saveCostRates(actorId: string, raw: unknown) {
  const parsed = costRatesSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("Give each model a non-negative USD rate per million tokens and a positive PKR per USD rate.", 400);
  const before = await readCostRates();
  await runUnscoped("ai cost report: save founder-set cost rates", async () => {
    await prisma.platformConfig.upsert({ where: { key: COST_RATES_KEY }, create: { key: COST_RATES_KEY, value: parsed.data }, update: { value: parsed.data } });
    await prisma.superAdminAuditLog.create({ data: { userId: actorId, action: "AI_COST_RATES_UPDATED", targetType: "platform_config", targetId: COST_RATES_KEY, targetName: "AI cost rates", oldValues: before as Prisma.InputJsonValue, newValues: parsed.data as Prisma.InputJsonValue } });
  });
  return parsed.data;
}

export function monthsSince(months: number, now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
}

export async function buildCostReport(months: number) {
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new ApiError("months must be between 1 and 24", 400);
  const since = monthsSince(months);
  const [rates, usage, schools] = await Promise.all([
    readCostRates(),
    runUnscoped("ai cost report: AI usage totals across schools for the platform owner", () => prisma.$queryRaw<{ school_id: string; month: string; model: string | null; tokens: bigint; credits: bigint; calls: bigint }[]>`
      SELECT school_id, to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, model,
             SUM(tokens_used)::bigint AS tokens,
             SUM(CASE WHEN (metadata->>'creditsCharged') ~ '^[0-9]{1,9}$' THEN (metadata->>'creditsCharged')::int ELSE 1 END)::bigint AS credits,
             COUNT(*)::bigint AS calls
      FROM ai_usage_logs WHERE created_at >= ${since} GROUP BY 1, 2, 3`),
    runUnscoped("ai cost report: school names and plan contracts", () => prisma.school.findMany({ select: { id: true, name: true, plan: true, commercialContract: true } })),
  ]);
  const plans = new Map(schools.map(s => {
    const contract = getSchoolPlanContract(normalizePlan(s.plan), s.commercialContract);
    return [s.id, { name: s.name, plan: normalizePlan(s.plan), planPricePkr: contract.price, planCredits: contract.aiCredits }];
  }));
  const aggregates: UsageAggregate[] = usage.map(r => ({ schoolId: r.school_id, month: r.month, model: r.model, tokens: Number(r.tokens), credits: Number(r.credits), calls: Number(r.calls) }));
  return { since: since.toISOString(), rates, rows: computeCostReport(aggregates, plans, rates) };
}

export function costReportCsv(rows: Awaited<ReturnType<typeof buildCostReport>>["rows"]) {
  const lines = [COST_REPORT_CSV_HEADER.join(",")];
  for (const r of rows) lines.push([r.month, r.schoolId, r.schoolName, r.plan, r.calls, r.tokens, r.unpricedTokens, r.credits, r.spendUsd, r.spendPkr, r.costPerCreditPkr, r.planPricePkr, r.planCredits, r.pricePerCreditPkr, r.marginPkr, r.marginPct].map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
