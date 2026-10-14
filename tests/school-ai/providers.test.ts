import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolAiProviderCapabilities, extractDocument } from "../../src/lib/school-ai/providers";
import { schoolAiError } from "../../src/lib/school-ai/http";
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

test("provider errors cannot disclose their response bodies or credentials", async () => {
  for (const status of [400, 401, 429, 500]) {
    const response = schoolAiError(Object.assign(new Error("PRIVATE PROVIDER BODY synthetic-secret"), { status }));
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes("PRIVATE"), false);
  }
  assert.equal(schoolAiError(new ApiError("Choose a source.", 400)).status, 400);
  assert.equal(schoolAiError(new SchoolAiError("Review the current version.", 409)).status, 409);
});
