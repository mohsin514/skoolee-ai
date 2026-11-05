import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";

// SKAI-847 (AI-11): with AI off, or the provider failing, AI entry points refuse with a manual way
// forward, saved work is left as it was, and the core manual routes never depend on the AI gateway.
// No database and no provider: every dependency below is an in-memory stand-in with synthetic data.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

class AICreditError extends Error { status = 402; code = "AI_CREDITS_EXHAUSTED"; }
class AIProviderQuotaError extends Error { status = 503; code = "AI_PROVIDER_QUOTA_EXHAUSTED"; }
class GenerationCancelledError extends Error {}
const credits = { reserved: 0, consumed: 0 };
let providerConfigured = false;

mock.module(src("lib/ai/openai.ts"), {
  namedExports: {
    AICreditError, AIProviderQuotaError, GenerationCancelledError,
    getAITextProviderStatus: () => ({ configured: providerConfigured, providers: providerConfigured ? ["openai"] : [], model: null }),
    isOpenAIQuotaExhausted: () => false,
    lockAndReconcileAICredits: async () => undefined,
    reserveAICredits: async () => { credits.reserved++; },
    consumeAICreditAndLog: async () => { credits.consumed++; },
    generateAIDraft: async () => { throw new Error("generateAIDraft must be injected in this test"); },
  },
});

// Every write the generation service makes goes through this recorder.
const writes: Array<{ model: string; method: string; data?: unknown }> = [];
const tx = new Proxy({}, {
  get: (_target, model: string) => new Proxy({}, {
    get: (_inner, method: string) => async (args: { data?: unknown } = {}) => {
      if (!/^find/.test(method)) writes.push({ model, method, data: args.data });
      if (method === "findFirst") return null;
      if (method === "create") return { id: "synthetic-request-1" };
      if (method === "updateMany") return { count: 1 };
      return {};
    },
  }),
});
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_user: unknown, work: (client: unknown) => unknown) => work(tx) } });
class SchoolAiError extends Error { constructor(message: string, public status = 400, public code?: string) { super(message); } }
mock.module(src("lib/school-ai/access.ts"), { namedExports: { SchoolAiError, assertWorkspaceDomainPermission: async () => undefined } });
mock.module(src("lib/school-ai/conversation-service.ts"), { namedExports: { assertConversationActor: async () => ({}) } });
const curriculum = { subjectId: "subject-qa", classId: "class-qa" };
mock.module(src("lib/school-ai/repository.ts"), {
  namedExports: {
    getWorkspaceRecordInTransaction: async () => ({ id: "curriculum-qa", kind: "CURRICULUM", status: "APPROVED", version: 3, campusId: "campus-qa-a", data: curriculum }),
    workspaceRequestHash: () => "synthetic-hash",
  },
});
mock.module(src("lib/school-ai/teaching-progress-service.ts"), { namedExports: { overlayTeachingLine: async (_tx: unknown, _school: string, _id: string, data: unknown) => data } });
mock.module(src("lib/school-ai/curriculum-pack-service.ts"), { namedExports: { curriculumPackGateFor: async () => ({ gated: false }) } });
mock.module(src("lib/school-ai/provider-confidentiality.ts"), { namedExports: { assertUnreleasedPaperTextAllowed: async () => undefined } });
mock.module(src("lib/school-ai/paper-figures.ts"), { namedExports: { figureTextContext: () => [] } });
mock.module(src("lib/ai/output-schema.ts"), { namedExports: { aiOutputSchema: () => ({}) } });
const passthrough = { parse: (value: unknown) => value };
mock.module(src("lib/school-ai/assessment.ts"), {
  namedExports: { curriculumDataSchema: passthrough, paperDataSchema: passthrough, prepareGeneratedQuestions: (questions: unknown) => questions, validateBlueprint: () => [], validateCurriculumApproval: () => [], validatePaperApproval: () => [] },
});
const unknownPaperGeneration = { error: "The provider outcome could not be confirmed.", code: "AI_GENERATION_UNKNOWN", state: "UNKNOWN" };
mock.module(src("lib/school-ai/paper-generation.ts"), {
  namedExports: {
    PAPER_GENERATION_FEATURE: "PAPER_GENERATION", PAPER_GENERATION_LEASE_MS: 180_000, unknownPaperGeneration,
    paperGenerationFingerprint: (value: unknown) => value, paperGenerationInputSchema: passthrough, paperGenerationReplySchema: passthrough, paperGenerationReplayState: () => "FAILED",
  },
});

const user = { userId: "teacher-qa-01", schoolId: "school-qa-01", campusId: "campus-qa-a", role: "TEACHER", fullName: "QA Teacher" } as never;
const input = { curriculumId: "curriculum-qa", curriculumVersion: 3, language: "en", blueprint: {}, coverageSection: "all", idempotencyKey: "11111111-1111-4111-8111-111111111111" };
// Models that hold a teacher's or school's own work. An AI failure must never write to any of them.
const SAVED_WORK = /^(schoolAiWorkspaceRecord|schoolAiRevision|exam|examQuestion|attendance|reportCard|mark|feePayment)/;

test("(a) AI off: the flag refuses new AI work and the entry point answers with a manual way forward", async () => {
  const { aiWorkflowsV2Enabled } = await import("../../src/lib/ai-workflows/flag");
  const { WorkflowError } = await import("../../src/lib/ai-workflows/errors");
  assert.equal(aiWorkflowsV2Enabled("qa-01", { AI_WORKFLOWS_V2: "off" }), false);
  assert.equal(aiWorkflowsV2Enabled("qa-01", { NODE_ENV: "production" }), false, "unset in production means off");
  assert.equal(aiWorkflowsV2Enabled("qa-01", { AI_WORKFLOWS_V2: "qa-02" }), false, "another school's rollout does not switch this one on");
  // Job and questionnaire entry points throw this code when the flag is off: a clean 4xx, not a crash.
  assert.equal(new WorkflowError("NOT_CONNECTED").status, 422);
  assert.equal(new WorkflowError("PROVIDER_UNAVAILABLE").status, 503);

  providerConfigured = false;
  const { assertSchoolAiTextProvider, schoolAiProviderCapabilities } = await import("../../src/lib/school-ai/providers");
  assert.equal(schoolAiProviderCapabilities().assistant, false);
  assert.throws(assertSchoolAiTextProvider, (error: Error & { status?: number }) => error.status === 503 && /continue editing manually/.test(error.message));
});

test("(a)+(b) provider outage: the browser gets a 503 saying saved work is unchanged, with no provider detail", async () => {
  const { schoolAiError } = await import("../../src/lib/school-ai/http");
  const response = schoolAiError(new Error("AI provider request failed. openai: request failed (synthetic secret-ish detail)"));
  assert.equal(response.status, 503);
  const body = await response.json() as { error: string };
  assert.match(body.error, /saved work is unchanged/);
  assert.doesNotMatch(body.error, /openai|synthetic/);
});

test("(b) AI off at dispatch: paper generation refuses before reserving credit or writing anything", async () => {
  writes.length = 0; credits.reserved = 0; providerConfigured = false;
  const { generatePaperWithReceipt } = await import("../../src/lib/school-ai/paper-generation-service");
  await assert.rejects(generatePaperWithReceipt(user, input), (error: Error & { status?: number }) => error.status === 503 && /manually/.test(error.message));
  assert.equal(credits.reserved, 0);
  assert.deepEqual(writes, []);
});

test("(b) provider fails mid-generation: the existing paper is untouched and the credit hold is released", async () => {
  writes.length = 0; credits.reserved = 0; credits.consumed = 0;
  const { generatePaperWithReceipt } = await import("../../src/lib/school-ai/paper-generation-service");
  const outcome = await generatePaperWithReceipt(user, input, { assertProvider: () => undefined, generate: async () => { throw new Error("AI provider request failed. openai: request timed out"); } });
  assert.equal(outcome.status, 409);
  assert.equal((outcome.body as { code: string }).code, "AI_GENERATION_UNKNOWN");
  assert.equal(credits.consumed, 0, "no credit charged for a failed generation");
  assert.deepEqual(writes.filter(write => SAVED_WORK.test(write.model)), [], "no saved work is written or replaced");
  assert.ok(writes.every(write => ["schoolAiRequest", "school", "auditLog"].includes(write.model)), `unexpected write: ${JSON.stringify(writes.map(write => write.model))}`);
  const settled = writes.filter(write => write.model === "schoolAiRequest" && write.method === "updateMany").at(-1)?.data as { reservedCredits?: number; status?: string };
  assert.equal(settled.reservedCredits, 0);
  assert.equal(settled.status, "UNKNOWN");
  assert.ok(writes.some(write => write.model === "school" && JSON.stringify(write.data).includes("decrement")), "the reserved credit is given back");
});

test("(b) provider quota exhausted: an uncharged 503 receipt, and no saved work is touched", async () => {
  writes.length = 0;
  const { generatePaperWithReceipt } = await import("../../src/lib/school-ai/paper-generation-service");
  const outcome = await generatePaperWithReceipt(user, input, { assertProvider: () => undefined, generate: async () => { throw new AIProviderQuotaError("quota"); } });
  assert.equal(outcome.status, 503);
  assert.match((outcome.body as { error: string }).error, /No credit was charged/);
  assert.deepEqual(writes.filter(write => SAVED_WORK.test(write.model)), []);
});

// (c) The manual routes for the core pilot tasks must keep working with AI off. They do if they never
// load the AI gateway at all: walk each route's runtime import graph (type-only imports are erased).
const GATEWAY = /^src\/lib\/(ai\/openai|ai\/openai-settings|school-ai\/providers|ai-workflows\/)/;
const MANUAL_ROUTES = [
  "src/app/api/attendance/register/route.ts", // the class register the attendance screen posts to
  "src/app/api/fees/collect/route.ts",
  "src/app/api/marks/route.ts",
  "src/app/api/reports/[id]/remarks/route.ts",
];
const IMPORT = /(?:^|[^\w.])(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
function resolveImport(from: string, spec: string) {
  const base = spec.startsWith("@/") ? join(root, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + ext)) return base + ext;
  return null;
}
function gatewayChain(entry: string) {
  const parent = new Map<string, string | null>([[join(root, entry), null]]);
  const queue = [join(root, entry)];
  while (queue.length) {
    const file = queue.shift()!;
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const next = resolveImport(file, match[1] ?? match[2]);
      if (!next || parent.has(next)) continue;
      parent.set(next, file);
      if (GATEWAY.test(relative(root, next))) {
        const chain: string[] = [];
        for (let at: string | null | undefined = next; at; at = parent.get(at)) chain.unshift(relative(root, at));
        return { chain, size: parent.size };
      }
      queue.push(next);
    }
  }
  return { chain: null, size: parent.size };
}

for (const route of MANUAL_ROUTES) {
  test(`(c) manual route ${route} never loads the AI gateway`, () => {
    assert.ok(existsSync(join(root, route)), `${route} moved: update this list`);
    const { chain, size } = gatewayChain(route);
    assert.ok(size > 5, "the import walk followed the route's dependencies");
    assert.equal(chain, null, `AI gateway reached via ${chain?.join(" -> ")}`);
  });
}
