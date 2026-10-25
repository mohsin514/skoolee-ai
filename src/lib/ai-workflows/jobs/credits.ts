import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { AI_POLICY_VERSION } from "@/lib/ai/evaluation";
import { ensureAICreditsAvailable, consumeAICreditAndLog, AICreditError } from "@/lib/ai/openai";
import { WorkflowError } from "../errors";

/**
 * Credits (control P9, founder decision D4 as reconciled by the red team):
 *  - every provider attempt is logged with its tokens at zero credit;
 *  - one credit is charged per AI action, only when the provider returned tokens;
 *  - each job has a cap (free-form 5, questionnaire 20 model actions) and pauses when it is reached;
 *  - availability is checked before each call and charged after it, so no reservation can leak.
 *  - APP_OWNER uses platform-funded usage, never a school allowance; provider attempts remain bounded.
 */
export const OWNER_MODEL_ATTEMPT_CAP = 90;
export const FEATURE = "AI_WORKFLOWS_V2";
export const JOB_CREDIT_CAP = { FREEFORM: 5, FOLLOW_UP: 5, UNDO: 5, QUESTIONNAIRE: 20 } as const;

interface JobCredits { id: string; schoolId: string; campusId: string | null; origin: string; creditsCharged: number }

/**
 * Families and students share the school's credits with its staff (red team RT7c): each person has a
 * rolling 24-hour cap, so one account cannot spend the school's balance.
 */
export const ROLE_DAILY_CREDIT_CAP: Partial<Record<AuthUser["role"], number>> = { PARENT: 10, STUDENT: 15 };

export async function assertCanSpend(user: AuthUser, job: JobCredits) {
  if (user.role === "APP_OWNER") {
    const attempts = await prisma.aiWorkflowEvent.count({ where: { jobId: job.id, schoolId: job.schoolId, type: "MODEL_ATTEMPT_STARTED" } });
    if (attempts >= OWNER_MODEL_ATTEMPT_CAP) throw new WorkflowError("BUDGET_EXHAUSTED", { cap: OWNER_MODEL_ATTEMPT_CAP, scope: "modelAttempts" });
    return;
  }
  const cap = JOB_CREDIT_CAP[job.origin as keyof typeof JOB_CREDIT_CAP] ?? 5;
  if (job.creditsCharged >= cap) throw new WorkflowError("BUDGET_EXHAUSTED", { cap });
  const daily = ROLE_DAILY_CREDIT_CAP[user.role];
  if (daily !== undefined) {
    const spent = await prisma.aiWorkflowJob.aggregate({ where: { schoolId: user.schoolId, actorId: user.userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } }, _sum: { creditsCharged: true } });
    if ((spent._sum.creditsCharged ?? 0) >= daily) throw new WorkflowError("BUDGET_EXHAUSTED", { cap: daily, scope: "daily" });
  }
  await ensureAICreditsAvailable(user.schoolId).catch(error => {
    if (error instanceof AICreditError && error.code === "SUBSCRIPTION_SUSPENDED") throw new WorkflowError("SUSPENDED");
    if (error instanceof AICreditError && error.status === 402) throw new WorkflowError("CREDITS_EXHAUSTED");
    throw error;
  });
}

export interface AttemptUsage { model: string; tokensUsed: number; action: string; stepKey?: string | null }

/** Logs the attempt; charges one credit only if tokens were used. Returns credits charged (0 or 1). */
export async function recordAttempt(user: AuthUser, job: JobCredits, usage: AttemptUsage): Promise<0 | 1> {
  const metadata = { jobId: job.id, stepKey: usage.stepKey ?? null };
  if (usage.tokensUsed <= 0 || user.role === "APP_OWNER" || usage.action !== "PLAN") {
    await prisma.aIUsageLog.create({ data: { schoolId: job.schoolId, campusId: job.campusId, userId: user.userId, feature: FEATURE, action: usage.action, model: usage.model, tokensUsed: Math.max(0, usage.tokensUsed), approvalStatus: "DRAFT", metadata: { ...metadata, policyVersion: AI_POLICY_VERSION, creditsCharged: 0 } } });
    return 0;
  }
  await consumeAICreditAndLog({ schoolId: job.schoolId, campusId: job.campusId, userId: user.userId, feature: FEATURE, action: usage.action, model: usage.model, tokensUsed: usage.tokensUsed, metadata }, async tx => {
    await tx.aiWorkflowJob.update({ where: { id_schoolId: { id: job.id, schoolId: job.schoolId } }, data: { creditsCharged: { increment: 1 } } });
    return null;
  });
  return 1;
}
