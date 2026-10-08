import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { getPlanLimits, normalizePlan } from "@/config/plans";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { isSchoolOperational } from "@/lib/billing/entitlements";
import type { AIRemarkRequest, AIRemarkResponse } from "@/types";
import { AI_PROMPT_VERSION, buildRemarkPrompt } from "./prompts";
import { transliterateToUrdu } from "@/lib/urdu";
import { assertNoPII, Pseudonymizer } from "./pseudonymize";
import { AI_POLICY_VERSION, AI_SOURCE_VERSION } from "./evaluation";

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
const AI_TIMEOUT_MS = boundedInteger(process.env.AI_TIMEOUT_MS, 20_000, 1_000, 120_000);
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

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("AI gateway policy has an invalid numeric limit");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error("AI gateway policy has an invalid numeric limit");
  }
  return parsed;
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Approved AI provider credentials are not configured");
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  return openaiClient;
}

function normalizeProvider(value: string | undefined): AIProvider | "auto" {
  const provider = value?.trim().toLowerCase();
  if (!provider || provider === "auto") return "auto";
  if (PROVIDERS.includes(provider as AIProvider)) return provider as AIProvider;
  throw new Error("AI gateway policy is invalid; generation is disabled until an approved provider is configured");
}

function providerOrder() {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);
  if (configuredProvider !== "auto") {
    if (configuredProvider === "pollinations" && process.env.AI_ALLOW_PUBLIC_PROVIDER !== "true") {
      throw new Error("AI gateway policy blocks the public provider destination");
    }
    if (configuredProvider === "ollama") validateOllamaDestination();
    if (configuredProvider === "pollinations") validatePollinationsDestination();
    return [configuredProvider];
  }

  // Default to OpenAI: it is contractually bound (DPA, no training on API
  // data by default). The free public pollinations endpoint is deliberately
  // NOT in the default chain — it has no data-processing agreement and must
  // never be the fallback for children's data. It can still be selected
  // explicitly via AI_PROVIDER / AI_PROVIDER_ORDER, and even then only ever
  // receives pseudonymized text (see completeWithProvider's egress scan).
  const configuredOrder = (process.env.AI_PROVIDER_ORDER || "openai")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!configuredOrder.length || configuredOrder.some((item) => !PROVIDERS.includes(item as AIProvider))) {
    throw new Error("AI gateway policy is invalid; generation is disabled until an approved provider order is configured");
  }
  if (new Set(configuredOrder).size !== configuredOrder.length) {
    throw new Error("AI gateway policy contains duplicate providers");
  }
  if (configuredOrder.includes("pollinations") && process.env.AI_ALLOW_PUBLIC_PROVIDER !== "true") {
    throw new Error("AI gateway policy blocks the public provider destination");
  }
  if (configuredOrder.includes("ollama")) validateOllamaDestination();
  if (configuredOrder.includes("pollinations")) validatePollinationsDestination();
  return configuredOrder as AIProvider[];
}

function validatePollinationsDestination() {
  let url: URL;
  try { url = new URL(POLLINATIONS_API_URL); } catch { throw new Error("AI gateway policy has an invalid public provider destination"); }
  const approvedHosts = new Set(["gen.pollinations.ai", "text.pollinations.ai"]);
  if (url.protocol !== "https:" || !approvedHosts.has(url.hostname) || url.username || url.password) {
    throw new Error("AI gateway policy blocks this public provider destination");
  }
}

function validateOllamaDestination() {
  let url: URL;
  try { url = new URL(OLLAMA_BASE_URL); } catch { throw new Error("AI gateway policy has an invalid Ollama destination"); }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocal = url.protocol === "http:" && localHosts.has(url.hostname);
  const isApprovedRemote = url.protocol === "https:" && !!process.env.AI_APPROVED_OLLAMA_HOSTS?.split(",").map((host) => host.trim().toLowerCase()).includes(url.host.toLowerCase());
  if (url.username || url.password || url.search || url.hash || (!isLocal && !isApprovedRemote)) {
    throw new Error("AI gateway policy blocks this Ollama destination; approve its exact HTTPS host or use a loopback address");
  }
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

export function validateAIGatewayPolicy() {
  return { providers: providerOrder(), timeoutMs: AI_TIMEOUT_MS, promptVersion: AI_PROMPT_VERSION };
}

function estimateTokens(messages: ChatMessage[], output = "") {
  const text = `${messages.map((message) => message.content).join("\n")}\n${output}`;
  return Math.max(1, Math.ceil(text.length / 4));
}

function requestSignal() {
  return AbortSignal.timeout(AI_TIMEOUT_MS);
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
  throw new Error(`${provider} returned HTTP ${response.status}`);
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
  if (process.env.OPENAI_BASE_URL) {
    let url: URL;
    try { url = new URL(process.env.OPENAI_BASE_URL); } catch { throw new Error("AI gateway policy has an invalid OpenAI destination"); }
    if (url.protocol !== "https:" || url.hostname !== "api.openai.com") {
      throw new Error("AI gateway policy blocks this OpenAI destination");
    }
  }
  const response = await getOpenAIClient().chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  }, { timeout: AI_TIMEOUT_MS });

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

  const urls = [POLLINATIONS_API_URL || POLLINATIONS_PUBLIC_FALLBACK_URL];

  const failures: string[] = [];

  for (const url of urls) {
    const response = await fetch(url, {
      signal: requestSignal(),
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
      failures.push(`${url} -> HTTP ${response.status}`);
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
  validateOllamaDestination();
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    signal: requestSignal(),
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
  // Apply the same full-payload scanner to every destination, including a
  // custom Ollama host. A provider label is not proof of local processing.
  for (const message of input.messages) {
    assertNoPII(message.content, `${provider} request`);
  }

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
      failures.push(`${provider}: ${error instanceof Error && error.name === "AbortError" ? "request timed out" : "request failed"}`);
      if (normalizeProvider(process.env.AI_PROVIDER) !== "auto") break;
    }
  }

  throw new Error(
    `AI provider request failed. ${failures.join(" | ")}`
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
    select: { aiCreditsUsed: true, aiCreditsLimit: true, plan: true, status: true, commercialContract: true },
  });

  if (school && !isSchoolOperational(school.status)) {
    throw new AICreditError("Subscription suspended. Open billing to update your plan or payment method.");
  }

  const used = school?.aiCreditsUsed || 0;
  const limit = school ? getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract).aiCredits : getPlanLimits("FREE").aiCredits;

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
  afterLog?: (tx: TxClient) => Promise<T>
) {
  const credits = input.credits ?? 1;

  return prisma.$transaction(async (tx) => {
    const school = await tx.school.findUnique({
      where: { id: input.schoolId },
      select: { aiCreditsUsed: true, plan: true, status: true, commercialContract: true },
    });

    if (!school) {
      throw new AICreditError("AI credit limit reached");
    }

    if (!isSchoolOperational(school.status)) {
      throw new AICreditError("Subscription suspended. Open billing to update your plan or payment method.");
    }

    if (school.aiCreditsUsed + credits > getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract).aiCredits) {
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
        metadata: {
          ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
            ? input.metadata as Record<string, Prisma.InputJsonValue>
            : {}),
          policyVersion: AI_POLICY_VERSION,
          sourceVersion: AI_SOURCE_VERSION,
        },
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
  // The student's real name is the identifier here. Swap it for a token
  // before the prompt is built, and put it back in the model's reply. The
  // model writes about "[STUDENT_1]"; the school user only ever sees the
  // real name.
  const pseudonymizer = new Pseudonymizer();
  const safeRequest: AIRemarkRequest = {
    ...request,
    studentName: pseudonymizer.token(request.studentName, "STUDENT"),
  };
  const prompt = buildRemarkPrompt(safeRequest);

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

  // Restore the real student name in the generated draft.
  const text = pseudonymizer.unmask(result.text);

  if (request.language === "both") {
    const parts = text.split("---").map((s) => s.trim()).filter(Boolean);
    const remarkEn = parts[0] || text;
    const remarkUr = parts[1] || transliterateToUrdu(remarkEn);
    return {
      remarkEn,
      remarkUr,
      tokensUsed: result.tokensUsed,
      model: result.model,
      promptVersion: AI_PROMPT_VERSION,
    };
  }

  return {
    remarkEn: request.language === "en" ? text : undefined,
    remarkUr: request.language === "ur" ? text : undefined,
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
