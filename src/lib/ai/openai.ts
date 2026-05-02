import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPlanLimits } from "@/config/plans";
import { isSchoolOperational } from "@/lib/billing/entitlements";
import type { AIRemarkRequest, AIRemarkResponse } from "@/types";
import { AI_PROMPT_VERSION, buildRemarkPrompt } from "./prompts";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export function getAIModel() {
  return MODEL;
}

export interface AIDraftResult {
  text: string;
  tokensUsed: number;
  model: string;
  promptVersion: string;
}

export interface AIUsageRecordInput {
  schoolId: string;
  campusId?: string | null;
  userId?: string | null;
  feature: string;
  action: string;
  promptVersion?: string | null;
  model?: string | null;
  tokensUsed: number;
  approvalStatus?: string;
  output?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  credits?: number;
}

export class AICreditError extends Error {
  status = 402;
}

export async function getAICreditSnapshot(schoolId: string) {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { aiCreditsUsed: true, aiCreditsLimit: true, plan: true, status: true },
  });

  if (school && !isSchoolOperational(school.status)) {
    throw new AICreditError("Subscription suspended. Open billing to update your plan or payment method.");
  }

  const used = school?.aiCreditsUsed || 0;
  const limit = getPlanLimits(school?.plan).aiCredits;

  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    plan: school?.plan || "FREE",
  };
}

export async function ensureAICreditsAvailable(schoolId: string, credits = 1) {
  const snapshot = await getAICreditSnapshot(schoolId);
  if (snapshot.remaining < credits) {
    throw new AICreditError("AI credit limit reached");
  }
  return snapshot;
}

export async function consumeAICreditAndLog<T = null>(
  input: AIUsageRecordInput,
  afterLog?: (tx: Prisma.TransactionClient) => Promise<T>
) {
  const credits = input.credits ?? 1;

  return prisma.$transaction(async (tx) => {
    const school = await tx.school.findUnique({
      where: { id: input.schoolId },
      select: { aiCreditsUsed: true, plan: true, status: true },
    });

    if (!school) {
      throw new AICreditError("AI credit limit reached");
    }

    if (!isSchoolOperational(school.status)) {
      throw new AICreditError("Subscription suspended. Open billing to update your plan or payment method.");
    }

    if (school.aiCreditsUsed + credits > getPlanLimits(school.plan).aiCredits) {
      throw new AICreditError("AI credit limit reached");
    }

    await tx.school.update({
      where: { id: input.schoolId },
      data: { aiCreditsUsed: { increment: credits } },
    });

    const usageLog = await tx.aIUsageLog.create({
      data: {
        schoolId: input.schoolId,
        campusId: input.campusId || null,
        userId: input.userId || null,
        feature: input.feature,
        action: input.action,
        promptVersion: input.promptVersion || AI_PROMPT_VERSION,
        model: input.model || MODEL,
        tokensUsed: input.tokensUsed,
        approvalStatus: input.approvalStatus || "DRAFT",
        output: input.output,
        metadata: input.metadata,
      },
    });

    const extra = afterLog ? await afterLog(tx) : null;
    return { usageLog, extra };
  });
}

export async function generateAIDraft({
  system,
  prompt,
  temperature = 0.4,
  maxTokens = 700,
}: {
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<AIDraftResult> {
  const response = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  return {
    text: response.choices[0]?.message?.content?.trim() || "",
    tokensUsed: response.usage?.total_tokens || 0,
    model: MODEL,
    promptVersion: AI_PROMPT_VERSION,
  };
}

/**
 * Generate AI-powered report card remarks for a student.
 */
export async function generateRemark(
  request: AIRemarkRequest
): Promise<AIRemarkResponse> {
  const prompt = buildRemarkPrompt(request);

  const response = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an experienced school teacher writing report card remark drafts. " +
          "Write professional, personalized remarks based on a student's performance. " +
          "Be encouraging yet honest. Address specific strengths and areas for improvement. " +
          "The remark is a draft and must be approved by school leadership before sending.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const text = response.choices[0]?.message?.content?.trim() || "";
  const tokensUsed = response.usage?.total_tokens || 0;

  if (request.language === "both") {
    const parts = text.split("---").map((s) => s.trim());
    return {
      remarkEn: parts[0] || text,
      remarkUr: parts[1] || "",
      tokensUsed,
      model: MODEL,
      promptVersion: AI_PROMPT_VERSION,
    };
  }

  return {
    remarkEn: request.language === "en" ? text : undefined,
    remarkUr: request.language === "ur" ? text : undefined,
    tokensUsed,
    model: MODEL,
    promptVersion: AI_PROMPT_VERSION,
  };
}

/**
 * Generate remarks in batch for multiple students.
 */
export async function generateBatchRemarks(
  requests: AIRemarkRequest[]
): Promise<AIRemarkResponse[]> {
  const results: AIRemarkResponse[] = [];
  for (const req of requests) {
    const result = await generateRemark(req);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return results;
}
