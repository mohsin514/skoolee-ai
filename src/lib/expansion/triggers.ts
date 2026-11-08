import { EXPANSION_OBSERVATIONS, EXPANSION_TRIGGERS, type ExpansionTrigger, type TriggerCondition } from "./trigger-config";

export type ConditionStatus = { id: string; metric: string; source: string; threshold: number | true; value: number | boolean | null; met: boolean };
export type TriggerStatus = { market: string; anyOf: boolean; met: boolean; conditions: ConditionStatus[] };

export function conditionMet(condition: TriggerCondition, value: number | boolean | undefined): boolean {
  if (condition.kind === "boolean") return value === true;
  return typeof value === "number" && Number.isFinite(value) && value >= (condition.threshold as number);
}

/** Pure: every trigger with each condition's value and met state. Unknown values are not met. */
export function evaluateExpansionTriggers(values: Partial<Record<string, number | boolean>> = EXPANSION_OBSERVATIONS.values, triggers: readonly ExpansionTrigger[] = EXPANSION_TRIGGERS): TriggerStatus[] {
  return triggers.map(trigger => {
    const conditions = trigger.conditions.map(condition => {
      const value = values[condition.id];
      return { id: condition.id, metric: condition.metric, source: condition.source, threshold: condition.threshold, value: value ?? null, met: conditionMet(condition, value) };
    });
    const anyOf = Boolean(trigger.anyOf);
    return { market: trigger.market, anyOf, met: anyOf ? conditions.some(c => c.met) : conditions.every(c => c.met), conditions };
  });
}
