// SKAI-1042: pure arithmetic for the AI cost-per-credit report (no I/O, unit-tested).

export type CostRates = { usdPerMillionTokens: Record<string, number>; pkrPerUsd: number | null };
export type UsageAggregate = { schoolId: string; month: string; model: string | null; tokens: number; credits: number; calls: number };
export type PlanInfo = { name: string; plan: string; planPricePkr: number | null; planCredits: number };
export type CostRow = {
  month: string; schoolId: string; schoolName: string; plan: string; calls: number; tokens: number; unpricedTokens: number; credits: number;
  spendUsd: number | null; spendPkr: number | null; costPerCreditPkr: number | null;
  planPricePkr: number | null; planCredits: number; pricePerCreditPkr: number | null; marginPkr: number | null; marginPct: number | null;
};

export const COST_REPORT_CSV_HEADER = ["month", "school_id", "school", "plan", "ai_calls", "tokens", "unpriced_tokens", "credits_consumed", "openai_spend_usd", "openai_spend_pkr", "cost_per_credit_pkr", "plan_price_pkr", "plan_credits", "plan_price_per_credit_pkr", "margin_pkr", "margin_pct"] as const;

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Spend = Σ tokens/1e6 × the model's USD rate. Tokens from a model with no saved rate make spend unknown (null),
 * never zero: an unpriced model is how a margin silently looks healthy. Margin compares the month's plan price
 * with the month's PKR spend; a FREE plan has price 0 so its margin is the (negative) spend.
 */
export function computeCostReport(usage: UsageAggregate[], plans: Map<string, PlanInfo>, rates: CostRates): CostRow[] {
  const groups = new Map<string, UsageAggregate[]>();
  for (const u of usage) {
    const key = `${u.month}|${u.schoolId}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  const rows: CostRow[] = [];
  for (const [key, items] of groups) {
    const [month, schoolId] = key.split("|");
    const plan = plans.get(schoolId) ?? { name: "(deleted school)", plan: "UNKNOWN", planPricePkr: null, planCredits: 0 };
    let usd = 0, unpricedTokens = 0, tokens = 0, credits = 0, calls = 0;
    for (const u of items) {
      tokens += u.tokens; credits += u.credits; calls += u.calls;
      const rate = u.model ? rates.usdPerMillionTokens[u.model] : undefined;
      if (rate === undefined) unpricedTokens += u.tokens; else usd += (u.tokens / 1_000_000) * rate;
    }
    const spendUsd = unpricedTokens > 0 ? null : round(usd, 4);
    const spendPkr = spendUsd === null || rates.pkrPerUsd === null ? null : round(spendUsd * rates.pkrPerUsd);
    const pricePerCreditPkr = plan.planPricePkr === null || plan.planCredits <= 0 ? null : round(plan.planPricePkr / plan.planCredits, 4);
    const marginPkr = spendPkr === null || plan.planPricePkr === null ? null : round(plan.planPricePkr - spendPkr);
    rows.push({
      month, schoolId, schoolName: plan.name, plan: plan.plan, calls, tokens, unpricedTokens, credits, spendUsd, spendPkr,
      costPerCreditPkr: spendPkr === null || credits === 0 ? null : round(spendPkr / credits, 4),
      planPricePkr: plan.planPricePkr, planCredits: plan.planCredits, pricePerCreditPkr, marginPkr,
      marginPct: marginPkr === null || !plan.planPricePkr ? null : round((marginPkr / plan.planPricePkr) * 100, 1),
    });
  }
  return rows.sort((a, b) => b.month.localeCompare(a.month) || a.schoolName.localeCompare(b.schoolName));
}
