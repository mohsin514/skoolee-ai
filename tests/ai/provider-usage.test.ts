import assert from "node:assert/strict";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { mock, test } from "node:test";

// SKAI-837: direct provider calls (embeddings, media) record metadata-only usage per school.
const root = new URL("../..", import.meta.url).pathname;
const src = (path: string) => new URL(`../../src/${path}`, import.meta.url).href;
const logs: Array<Record<string, unknown>> = [];
const SECRET = "Synthetic pupil Zaraq Testname scored 41 on QA-01";
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: { aIUsageLog: { create: async ({ data }: { data: Record<string, unknown> }) => { logs.push(data); return data; } } } } });
mock.module(src("lib/db/tenant-context.ts"), { namedExports: { runWithTenantContext: (_c: unknown, fn: () => unknown) => fn() } });
const openaiUrl = pathToFileURL(realpathSync(createRequire(import.meta.url).resolve("openai"))).href;
class FakeOpenAI {
  embeddings = { create: async ({ input }: { input: string[] }) => ({ data: input.map((_t, index) => ({ index, embedding: Array(512).fill(0.1) })), usage: { total_tokens: 7 } }) };
  responses = { create: async () => ({ status: "completed", model: "doc-model", output_text: JSON.stringify({ text: SECRET, pages: [], uncertainties: [] }), usage: { total_tokens: 11 } }) };
}
mock.module(openaiUrl, { defaultExport: Object.assign(FakeOpenAI, { default: FakeOpenAI, toFile: async () => ({}) }) });
Object.assign(process.env, { OPENAI_API_KEY: "test-key", AI_PROVIDER: "openai", RAG_EMBEDDINGS_ENABLED: "true", SCHOOL_AI_MEDIA_EGRESS_APPROVED: "true", SCHOOL_AI_DOCUMENT_MODEL: "doc-model" });
delete process.env.OPENAI_BASE_URL;

test("embeddings log metadata only, attributed to each school separately", async () => {
  logs.length = 0;
  const { embedTexts } = await import("../../src/lib/rag/provider");
  assert.ok(await embedTexts([SECRET], { schoolId: "qa-school-a", campusId: "qa-campus-a1", userId: "u-a", feature: "RAG_INDEX" }));
  await embedTexts(["Library policy", "Leave policy"], { schoolId: "qa-school-b", campusId: "qa-campus-b1", userId: "u-b", feature: "RAG_SEARCH" });
  assert.deepEqual(logs.map(l => [l.schoolId, l.campusId, l.feature, l.action, l.tokensUsed]), [["qa-school-a", "qa-campus-a1", "RAG_INDEX", "EMBED", 7], ["qa-school-b", "qa-campus-b1", "RAG_SEARCH", "EMBED", 7]]);
  assert.equal((logs[1].metadata as { inputs: number }).inputs, 2);
  assert.ok(!JSON.stringify(logs).includes("Zaraq") && !JSON.stringify(logs).includes("policy"));
});

test("document extraction logs metadata only, never the bytes or the transcript", async () => {
  logs.length = 0;
  const { extractDocument } = await import("../../src/lib/school-ai/providers");
  const result = await extractDocument(Buffer.from(SECRET), "scan.png", "image/png", "en", { schoolId: "qa-school-b", userId: "u-b", feature: "SCHOOL_AI_INTAKE" });
  assert.equal(result.tokensUsed, 11);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].schoolId, "qa-school-b");
  assert.equal(logs[0].action, "EXTRACT_DOCUMENT");
  const stored = JSON.stringify(logs);
  assert.ok(!stored.includes("Zaraq") && !stored.includes(Buffer.from(SECRET).toString("base64")) && !stored.includes("scan.png"));
});

test("without attribution nothing is logged and the call still works", async () => {
  logs.length = 0;
  const { embedTexts } = await import("../../src/lib/rag/provider");
  assert.equal((await embedTexts(["x"]))?.length, 1);
  assert.equal(logs.length, 0);
});

// Guard: every OpenAI client must be built in an approved, instrumented file.
const ALLOWED = new Set(["src/lib/ai/openai.ts", "src/lib/rag/provider.ts", "src/lib/school-ai/providers.ts"]);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : /\.(m?[jt]sx?)$/.test(name) ? [path] : []; });
}
test("no direct OpenAI client is constructed outside the approved gateway files", () => {
  const offenders = files(join(root, "src")).map(path => relative(root, path)).filter(path => !ALLOWED.has(path)).filter(path => {
    const text = readFileSync(join(root, path), "utf8");
    return /new\s+OpenAI\s*\(|new\s+AzureOpenAI\s*\(|\bOpenAI\s*\(\s*\{|from\s+["']openai["']|require\(\s*["']openai["']\s*\)/.test(text);
  });
  assert.deepEqual(offenders, []);
});
