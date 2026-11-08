import type { AiWorkflowJob } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PLANS, PLAN_ORDER } from "@/config/plans";
import { capability } from "../registry";
import { checkCapabilityAccess } from "../registry/gates";
import type { CapabilityContext } from "../registry/types";
import type { PlannedStep } from "../jobs/job-service";
import { WorkflowError } from "../errors";

const KEY = "platform.set_default_plan_pricing";
type Plan = keyof typeof PLANS;
/** User-facing names always win; internal BASIC/PRO ids must never silently select another tier. */
export function readPriceAnswer(text: string, pending?: Plan): { selectedPlan?: Plan; prices: Partial<Record<Plan, number | null>>; invalid: boolean; unassignedPrice?: number } {
  const names = PLAN_ORDER.map(id => ({ id, name: PLANS[id].name.toLowerCase() }));
  const found = [...text.matchAll(/\b(basic|pro|enterprise|custom|free)\b/gi)];
  const prices: Partial<Record<Plan, number | null>> = {};
  let selectedPlan = pending;
  let invalid = false;
  const amount = (value: string) => {
    const numeric = value.match(/(?:^|\s)(-?\d[\d,]*(?:\.\d+)?)(?=\s|[.!?;]|$)/g)?.map(v => Number(v.trim().replaceAll(",", ""))) ?? [];
    if (numeric.length !== 1 || !Number.isFinite(numeric[0]) || numeric[0] < 0 || numeric[0] > 100_000_000 || /\b(?:annual|yearly|usd|dollars|percent|%)\b/i.test(value)) return undefined;
    return numeric[0];
  };
  for (let index = 0; index < found.length; index++) {
    const match = found[index];
    const id = match[1].toLowerCase() === "free" ? "FREE" : names.find(row => row.name === match[1].toLowerCase())!.id;
    selectedPlan = id;
    const tail = text.slice(match.index! + match[0].length, found[index + 1]?.index ?? text.length);
    const value = amount(tail.replace(/[:=]/g, " "));
    if (value !== undefined) prices[id] = value;
    else if (/\d/.test(tail)) invalid = true;
  }
  if (!found.length && pending) {
    const value = amount(text.replace(/[:=]/g, " "));
    if (value !== undefined) prices[pending] = value;
    else if (/\d/.test(text)) invalid = true;
  }
  const unassignedPrice = !found.length && !pending ? amount(text.replace(/[:=]/g, " ")) : undefined;
  return { selectedPlan, prices, invalid, ...(unassignedPrice !== undefined ? { unassignedPrice } : {}) };
}

export async function planPricingDialogue(ctx: CapabilityContext, job: AiWorkflowJob, segments: Array<{ text: string; ordinal: number }>): Promise<PlannedStep[] | null> {
  if (ctx.user.role !== "APP_OWNER") return null;
  const current = job.planVersion ? await prisma.aiWorkflowStep.findMany({ where: { schoolId: job.schoolId, jobId: job.id, planVersion: job.planVersion } }) : [];
  const previous = current.length === 1 && current[0].capabilityKey === KEY ? current[0] : null;
  const first = segments[0]?.text ?? "";
  if (!previous && (current.length || !/\b(?:update|change|set|edit)\b/i.test(first) || !/\b(?:package|plan|default)\b/i.test(first) || !/\bprices?\b/i.test(first) || /\b(?:don't|do not|school named)\b/i.test(first))) return null;
  const entry = capability(KEY)!;
  if (!(await checkCapabilityAccess(ctx, entry)).ok) throw new WorkflowError("ROLE_NOT_ALLOWED");
  // Replay the human transcript, not model-proposed amounts or identifiers from an older plan.
  let selectedPlan: Plan | undefined;
  const prices: Partial<Record<Plan, number | null>> = {};
  let invalid = false;
  let unassignedPrice: number | undefined;
  for (const segment of segments) {
    const answer = readPriceAnswer(segment.text, selectedPlan);
    selectedPlan = answer.selectedPlan;
    if (answer.unassignedPrice !== undefined) unassignedPrice = answer.unassignedPrice;
    if (selectedPlan && unassignedPrice !== undefined && answer.prices[selectedPlan] === undefined) { prices[selectedPlan] = unassignedPrice; unassignedPrice = undefined; }
    Object.assign(prices, answer.prices);
    if (answer.invalid) { invalid = true; if (selectedPlan) delete prices[selectedPlan]; }
    else if (Object.keys(answer.prices).length) invalid = false;
  }
  const missingFields = !selectedPlan ? ["/selectedPlan"] : invalid || prices[selectedPlan] === undefined ? ["/prices"] : [];
  return [{ stepKey: previous?.stepKey ?? "s1", capabilityKey: KEY, input: { prices, ...(selectedPlan ? { selectedPlan } : {}) }, missingFields, invalidFields: invalid ? ["/prices"] : [] }];
}
