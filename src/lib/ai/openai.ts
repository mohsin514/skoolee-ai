import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPlanLimits } from "@/config/plans";
import { isSchoolOperational } from "@/lib/billing/entitlements";
import type { AIRemarkRequest, AIRemarkResponse } from "@/types";
import { AI_PROMPT_VERSION, buildRemarkPrompt } from "./prompts";

type AIProvider = "pollinations" | "openai" | "ollama";
type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ProviderResult {
  text: string;
  tokensUsed: number;
  model: string;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: { content?: string | null };
    text?: string | null;
  }>;
  usage?: { total_tokens?: number | null };
  response?: string;
  text?: string;
}

interface OllamaResponse {
  message?: { content?: string };
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

const PROVIDERS: AIProvider[] = ["pollinations", "openai", "ollama"];
const OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini";
const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || process.env.AI_MODEL || "openai";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || process.env.AI_MODEL || "llama3.2";
const POLLINATIONS_API_URL =
  process.env.POLLINATIONS_API_URL || "https://gen.pollinations.ai/v1/chat/completions";
const POLLINATIONS_PUBLIC_FALLBACK_URL = "https://text.pollinations.ai/openai";
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(
  /\/+$/,
  ""
);

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set AI_PROVIDER=pollinations for the free no-key provider, or add a valid OpenAI key."
    );
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function normalizeProvider(value: string | undefined): AIProvider | "auto" {
  const provider = value?.trim().toLowerCase();
  if (!provider || provider === "auto") return "auto";
  if (PROVIDERS.includes(provider as AIProvider)) return provider as AIProvider;
  return "auto";
}

function providerOrder() {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);
  if (configuredProvider !== "auto") return [configuredProvider];

  const configuredOrder = (process.env.AI_PROVIDER_ORDER || "pollinations,ollama")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const ordered = configuredOrder.filter((item): item is AIProvider =>
    PROVIDERS.includes(item as AIProvider)
  );

  return ordered.length ? ordered : PROVIDERS;
}

function modelForProvider(provider: AIProvider) {
  switch (provider) {
    case "openai":
      return OPENAI_MODEL;
    case "ollama":
      return OLLAMA_MODEL;
    case "pollinations":
    default:
      return POLLINATIONS_MODEL;
  }
}

function modelLabel(provider: AIProvider) {
  return `${provider}:${modelForProvider(provider)}`;
}

export function getAIModel() {
  const [provider] = providerOrder();
  return modelLabel(provider);
}

export function getAIProvider() {
  return providerOrder()[0];
}

function estimateTokens(messages: ChatMessage[], output = "") {
  const text = `${messages.map((message) => message.content).join("\n")}\n${output}`;
  return Math.max(1, Math.ceil(text.length / 4));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function trimProviderError(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 240);
}

async function parseTextResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as OpenAICompatibleResponse;
  }

  const text = await response.text();
  return { text };
}

function extractText(payload: OpenAICompatibleResponse) {
  return (
    payload.choices?.[0]?.message?.content?.trim() ||
    payload.choices?.[0]?.text?.trim() ||
    payload.response?.trim() ||
    payload.text?.trim() ||
    ""
  );
}

async function failFromResponse(provider: AIProvider, response: Response) {
  const body = trimProviderError(await response.text().catch(() => ""));
  throw new Error(
    `${provider} returned ${response.status}${body ? `: ${body}` : ""}`
  );
}

async function responseErrorSummary(response: Response) {
  const body = trimProviderError(await response.text().catch(() => ""));
  return `${response.status}${body ? `: ${body}` : ""}`;
}

async function completeWithOpenAI({
  messages,
  temperature,
  maxTokens,
}: {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}): Promise<ProviderResult> {
  const response = await getOpenAIClient().chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const text = response.choices[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenAI returned an empty response");

  return {
    text,
    tokensUsed: response.usage?.total_tokens || estimateTokens(messages, text),
    model: modelLabel("openai"),
  };
}

async function completeWithPollinations({
  messages,
  temperature,
  maxTokens,
}: {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}): Promise<ProviderResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain",
  };

  if (process.env.POLLINATIONS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
  }

  const urls =
    process.env.POLLINATIONS_API_URL || process.env.POLLINATIONS_API_KEY
      ? [POLLINATIONS_API_URL]
      : [POLLINATIONS_PUBLIC_FALLBACK_URL];

  const failures: string[] = [];

  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: POLLINATIONS_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      failures.push(`${url} -> ${await responseErrorSummary(response)}`);
      continue;
    }

    const payload = await parseTextResponse(response);
    const text = extractText(payload);
    if (!text) {
      failures.push(`${url} -> empty response`);
      continue;
    }

    return {
      text,
      tokensUsed: payload.usage?.total_tokens || estimateTokens(messages, text),
      model: modelLabel("pollinations"),
    };
  }

  throw new Error(`Pollinations failed. ${failures.join(" | ")}`);
}

async function completeWithOllama({
  messages,
  temperature,
  maxTokens,
}: {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}): Promise<ProviderResult> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!response.ok) await failFromResponse("ollama", response);

  const payload = (await response.json()) as OllamaResponse;
  const text = payload.message?.content?.trim() || payload.response?.trim() || "";
  if (!text) throw new Error("Ollama returned an empty response");

  return {
    text,
    tokensUsed:
      (payload.prompt_eval_count || 0) + (payload.eval_count || 0) ||
      estimateTokens(messages, text),
    model: modelLabel("ollama"),
  };
}

async function completeWithProvider(
  provider: AIProvider,
  input: {
    messages: ChatMessage[];
    temperature: number;
    maxTokens: number;
  }
) {
  switch (provider) {
    case "openai":
      return completeWithOpenAI(input);
    case "ollama":
      return completeWithOllama(input);
    case "pollinations":
    default:
      return completeWithPollinations(input);
  }
}

async function completeChat({
  messages,
  temperature,
  maxTokens,
}: {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}): Promise<ProviderResult> {
  const failures: string[] = [];

  for (const provider of providerOrder()) {
    try {
      return await completeWithProvider(provider, { messages, temperature, maxTokens });
    } catch (error) {
      failures.push(`${provider}: ${trimProviderError(errorMessage(error))}`);
      if (normalizeProvider(process.env.AI_PROVIDER) !== "auto") break;
    }
  }

  throw new Error(
    `AI provider failed. Tried ${providerOrder().join(", ")}. ${failures.join(" | ")}`
  );
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
        model: input.model || getAIModel(),
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
  const result = await completeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature,
    maxTokens,
  });

  return {
    text: result.text,
    tokensUsed: result.tokensUsed,
    model: result.model,
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

  const result = await completeChat({
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
    maxTokens: 500,
  });

  if (request.language === "both") {
    const parts = result.text.split("---").map((s) => s.trim()).filter(Boolean);
    return {
      remarkEn: parts[0] || result.text,
      remarkUr: parts[1] || "",
      tokensUsed: result.tokensUsed,
      model: result.model,
      promptVersion: AI_PROMPT_VERSION,
    };
  }

  return {
    remarkEn: request.language === "en" ? result.text : undefined,
    remarkUr: request.language === "ur" ? result.text : undefined,
    tokensUsed: result.tokensUsed,
    model: result.model,
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
