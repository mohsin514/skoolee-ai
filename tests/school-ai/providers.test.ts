import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolAiProviderCapabilities, extractDocument } from "../../src/lib/school-ai/providers";
import { schoolAiError } from "../../src/lib/school-ai/http";
import { AIProviderQuotaError, isOpenAIQuotaExhausted } from "../../src/lib/ai/openai";
import { PIILeakError } from "../../src/lib/ai/pseudonymize";
import { ApiError } from "../../src/lib/api/scope";
import { SchoolAiError } from "../../src/lib/school-ai/access";

test("binary media stays disabled without an explicit policy and approved destination", () => {
  const keys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "SCHOOL_AI_MEDIA_EGRESS_APPROVED", "SCHOOL_AI_DOCUMENT_MODEL", "SCHOOL_AI_TRANSCRIPTION_MODEL", "AI_PROVIDER"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { OPENAI_API_KEY: "synthetic-test-key-never-sent", AI_PROVIDER: "openai", SCHOOL_AI_DOCUMENT_MODEL: "synthetic-document-model", SCHOOL_AI_TRANSCRIPTION_MODEL: "synthetic-voice-model", SCHOOL_AI_MEDIA_EGRESS_APPROVED: "false" });
    delete process.env.OPENAI_BASE_URL;
    assert.equal(schoolAiProviderCapabilities().documentExtraction, false);
    assert.equal(schoolAiProviderCapabilities().voiceTranscription, false);
    process.env.SCHOOL_AI_MEDIA_EGRESS_APPROVED = "true";
    assert.equal(schoolAiProviderCapabilities().documentExtraction, true);
    for (const destination of ["https://unapproved.example/v1", "http://api.openai.com/v1", "https://api.openai.com/other", "https://api.openai.com/v1?forward=elsewhere", "https://user:secret@api.openai.com/v1"]) {
      process.env.OPENAI_BASE_URL = destination;
      const capabilities = schoolAiProviderCapabilities();
      assert.equal(capabilities.documentExtraction, false);
      assert.equal(capabilities.voiceTranscription, false);
      assert.equal(capabilities.assistant, false);
    }
  } finally { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
});

test("native multilingual text extraction preserves content without inventing physical pages", async () => {
  const text = "اعداد صحیح — اعداد صحيحة — integers\n".repeat(800);
  const source = await extractDocument(Buffer.from(text), "syllabus.txt", "text/plain", "ur");
  assert.equal(source.text, text); assert.deepEqual(source.pages, []); assert.equal(source.tokensUsed, 0);
});

test("binary extraction requests JSON in the input message required by OpenAI JSON mode", async () => {
  const keys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "SCHOOL_AI_MEDIA_EGRESS_APPROVED", "SCHOOL_AI_DOCUMENT_MODEL"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  let calls = 0;
  try {
    Object.assign(process.env, { OPENAI_API_KEY: "synthetic-test-key-never-sent", OPENAI_BASE_URL: "https://api.openai.com/v1", SCHOOL_AI_MEDIA_EGRESS_APPROVED: "true", SCHOOL_AI_DOCUMENT_MODEL: "synthetic-document-model" });
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.store, false);
      assert.equal(request.text.format.type, "json_object");
      assert.ok(request.input.some((message: { content: Array<{ type: string; text?: string }> }) => message.content.some(content => content.type === "input_text" && /json/i.test(content.text ?? ""))), "JSON instructions must appear in input, not only the separate instructions field");
      const text = JSON.stringify({ text: "2 + 2 = 4", pages: [{ page: 1, text: "2 + 2 = 4", reviewed: false, regions: [] }], uncertainties: [], expectedPageCount: 1, missingPages: [], structureReviewed: false });
      return new Response(JSON.stringify({ id: "synthetic-response", object: "response", status: "completed", model: "synthetic-document-model", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }], usage: { total_tokens: 10 } }), { headers: { "Content-Type": "application/json" } });
    };
    const extracted = await extractDocument(Buffer.from("synthetic-image"), "syllabus.png", "image/png", "en");
    assert.equal(extracted.text, "2 + 2 = 4");
    assert.equal(extracted.structureReviewed, false);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = nativeFetch;
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});

test("text readiness follows the gateway's normalized approved provider order", () => {
  const keys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "AI_PROVIDER", "AI_PROVIDER_ORDER"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { OPENAI_API_KEY: "synthetic-test-key-never-sent", AI_PROVIDER: " auto ", AI_PROVIDER_ORDER: " openai , ollama " });
    delete process.env.OPENAI_BASE_URL;
    assert.equal(schoolAiProviderCapabilities().assistant, true);
    assert.equal(schoolAiProviderCapabilities().paperGeneration, true);
    process.env.AI_PROVIDER_ORDER = "openai,unknown";
    assert.equal(schoolAiProviderCapabilities().assistant, false);
    process.env.AI_PROVIDER = " OPENAI ";
    assert.equal(schoolAiProviderCapabilities().assistant, true);
    process.env.OPENAI_API_KEY = "";
    assert.equal(schoolAiProviderCapabilities().assistant, false);
  } finally { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
});

test("provider errors cannot disclose their response bodies or credentials", async () => {
  for (const status of [400, 401, 429, 500]) {
    const response = schoolAiError(Object.assign(new Error("PRIVATE PROVIDER BODY synthetic-secret"), { status }));
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes("PRIVATE"), false);
  }
  assert.equal(schoolAiError(new ApiError("Choose a source.", 400)).status, 400);
  assert.equal(schoolAiError(new SchoolAiError("Review the current version.", 409)).status, 409);
});

test("exhausted provider quota is reported with a safe actionable code", async () => {
  const response = schoolAiError(new AIProviderQuotaError());
  assert.equal(response.status, 503);
  const payload = await response.json() as { error: string; code: string };
  assert.equal(payload.code, "AI_QUOTA_EXHAUSTED");
  assert.match(payload.error, /quota/i);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("provider credit failures are classified by known status and codes without reading response text", () => {
  assert.equal(isOpenAIQuotaExhausted({ status: 429, code: "credit_balance_exhausted" }), true);
  assert.equal(isOpenAIQuotaExhausted({ status: 429, error: { code: "insufficient_quota" } }), true);
  assert.equal(isOpenAIQuotaExhausted({ status: 429, type: "insufficient_quota" }), true);
  assert.equal(isOpenAIQuotaExhausted({ status: 429, code: "rate_limit_exceeded", message: "quota PRIVATE PROVIDER BODY" }), false);
  assert.equal(isOpenAIQuotaExhausted({ status: 400, code: "credit_balance_exhausted" }), false);
  assert.equal(isOpenAIQuotaExhausted(new Error("credit_balance_exhausted PRIVATE PROVIDER BODY")), false);
});

test("PII safety refusal stays blocked and returns no identifier values", async () => {
  const response = schoolAiError(new PIILeakError("private identifier must not be serialized"));
  assert.equal(response.status, 422);
  const payload = await response.json() as { error: string; code: string };
  assert.equal(payload.code, "AI_SENSITIVE_CONTENT_BLOCKED");
  assert.match(payload.error, /personal identifiers/i);
  assert.equal(JSON.stringify(payload).includes("private identifier"), false);
});
