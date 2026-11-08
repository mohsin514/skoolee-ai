import { CRITERION_KEYS, GO_NO_GO_CRITERIA, VERDICT_RULE, type CriterionKey, type NumericThreshold, type Rag } from "./go-no-go-config";

/**
 * SKAI-1102 pure go/no-go evaluation. The service loads the existing metrics; this turns them into a
 * red/amber/green state per criterion and an overall verdict. Unknown is AMBER, never GREEN: a missing
 * or withheld metric can hold a pilot but cannot pass it.
 */

export type Verdict = "GO" | "HOLD" | "NO_GO";

export type GoNoGoInputs = {
  gate: { allowed: true } | { allowed: false; blockers: { item: string; reason: string }[] } | null;
  decision: string | null;
  commercialStage: string | null;
  /** Measured rates in percent, or null with the reason they are withheld. */
  teacherUsage: { value: number | null; withheld: string | null };
  paperAcceptance: { value: number | null; withheld: string | null };
  taskTimeChange: { value: number | null; withheld: string | null };
};

export type CriterionResult = { key: CriterionKey; source: string; metric: string; value: string | null; threshold: string; state: Rag; note: string | null };
export type GoNoGoResult = { verdict: Verdict; criteria: CriterionResult[]; reasons: string[] };

export function numericState(value: number | null, t: NumericThreshold): Rag {
  if (value == null || !Number.isFinite(value)) return "AMBER";
  const meetsGreen = t.direction === "higher" ? value >= t.green : value <= t.green;
  const pastRed = t.direction === "higher" ? value < t.red : value > t.red;
  return meetsGreen ? "GREEN" : pastRed ? "RED" : "AMBER";
}

export const describeThreshold = (t: NumericThreshold) =>
  t.direction === "higher" ? `Green ≥ ${t.green}${t.unit} · Red < ${t.red}${t.unit}` : `Green ≤ ${t.green}${t.unit} · Red > ${t.red}${t.unit}`;

function listState(value: string | null, green: readonly string[], red: readonly string[]): Rag {
  if (value && green.includes(value)) return "GREEN";
  if (value && red.includes(value)) return "RED";
  return "AMBER";
}

export function evaluateGoNoGo(input: GoNoGoInputs): GoNoGoResult {
  const c = GO_NO_GO_CRITERIA;
  const numeric = (key: "TEACHER_USAGE" | "PAPER_ACCEPTANCE" | "TASK_TIME_CHANGE", m: { value: number | null; withheld: string | null }): CriterionResult => ({
    key, source: c[key].source, metric: c[key].metric, value: m.value == null ? null : `${m.value}${c[key].threshold.unit}`,
    threshold: describeThreshold(c[key].threshold), state: numericState(m.value, c[key].threshold), note: m.value == null ? (m.withheld ?? "No measured value yet.") : null,
  });
  const gate = input.gate;
  const criteria: CriterionResult[] = [
    {
      key: "READINESS_GATE", source: c.READINESS_GATE.source, metric: c.READINESS_GATE.metric,
      value: gate ? (gate.allowed ? "Allowed" : `${gate.blockers.length} blocker(s)`) : null, threshold: "Green = gate allows activation",
      state: gate?.allowed ? "GREEN" : "AMBER",
      note: !gate ? "No readiness record." : gate.allowed ? null : gate.blockers.slice(0, 3).map((b) => `${b.item}: ${b.reason}`).join(" · "),
    },
    { key: "DECISION", source: c.DECISION.source, metric: c.DECISION.metric, value: input.decision, threshold: `Green = ${c.DECISION.green.join("/")} · Red = ${c.DECISION.red.join("/")}`, state: listState(input.decision, c.DECISION.green, c.DECISION.red), note: input.decision ? null : "No signed decision." },
    { key: "COMMERCIAL_STAGE", source: c.COMMERCIAL_STAGE.source, metric: c.COMMERCIAL_STAGE.metric, value: input.commercialStage, threshold: `Green = ${c.COMMERCIAL_STAGE.green.join("/")} · Red = ${c.COMMERCIAL_STAGE.red.join("/")}`, state: listState(input.commercialStage, c.COMMERCIAL_STAGE.green, c.COMMERCIAL_STAGE.red), note: input.commercialStage ? null : "No commercial stage recorded." },
    numeric("TEACHER_USAGE", input.teacherUsage),
    numeric("PAPER_ACCEPTANCE", input.paperAcceptance),
    numeric("TASK_TIME_CHANGE", input.taskTimeChange),
  ];
  const stateOf = (key: CriterionKey) => criteria.find((r) => r.key === key)!.state;
  const reasons: string[] = [];
  const vetoed = VERDICT_RULE.vetoOnRed.filter((k) => stateOf(k) === "RED");
  if (vetoed.length) { reasons.push(`Red on ${vetoed.join(", ")}.`); return { verdict: "NO_GO", criteria, reasons }; }
  const missingRequired = VERDICT_RULE.requiredGreen.filter((k) => stateOf(k) !== "GREEN");
  const greens = CRITERION_KEYS.filter((k) => stateOf(k) === "GREEN").length;
  if (missingRequired.length) reasons.push(`Not yet green: ${missingRequired.join(", ")}.`);
  if (greens < VERDICT_RULE.minGreen) reasons.push(`${greens} of ${VERDICT_RULE.minGreen} required green criteria.`);
  return { verdict: reasons.length ? "HOLD" : "GO", criteria, reasons };
}
