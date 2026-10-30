import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// Provider settings are read once at module load, so each policy runs in a fresh process.
// Every provider variable is set explicitly because Prisma loads the repository .env for unset ones.
function policy(env: Record<string, string>) {
  const script = `import("./src/lib/ai/openai.ts").then(m => { try { console.log(JSON.stringify({ ok: m.validateAIGatewayPolicy().providers })); } catch (e) { console.log(JSON.stringify({ error: e.message })); } });`;
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) if (/^(AI_|OPENAI_|OLLAMA_|POLLINATIONS_)/.test(key)) delete childEnv[key];
  Object.assign(childEnv, { OPENAI_API_KEY: "", AI_PROVIDER: "", AI_PROVIDER_ORDER: "" }, env);
  const run = spawnSync(process.execPath, ["--import", "tsx", "-e", script], { cwd: new URL("../..", import.meta.url), env: childEnv, encoding: "utf8" });
  const line = run.stdout.trim().split("\n").pop() || "";
  return JSON.parse(line) as { ok?: string[]; error?: string };
}

test("default policy uses only the contracted provider, never the public fallback", () => {
  assert.deepEqual(policy({}).ok, ["openai"]);
});

test("malformed, unknown or duplicate provider orders fail closed", () => {
  for (const order of ["openai,mystery", "openai,openai", " ", ","]) {
    const result = policy({ AI_PROVIDER_ORDER: order });
    assert.ok(result.error && /policy/i.test(result.error), `${order}: ${JSON.stringify(result)}`);
  }
});

test("the public provider requires explicit opt-in", () => {
  assert.match(policy({ AI_PROVIDER_ORDER: "openai,pollinations" }).error || "", /public provider/);
  assert.match(policy({ AI_PROVIDER: "pollinations" }).error || "", /public provider/);
});

test("an Ollama label does not make a remote endpoint local", () => {
  assert.deepEqual(policy({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "http://127.0.0.1:11434" }).ok, ["ollama"]);
  for (const url of ["http://ollama.example.com:11434", "https://ollama.example.com", "http://user:secret@127.0.0.1:11434"]) {
    assert.match(policy({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: url }).error || "", /Ollama destination/, url);
  }
  assert.deepEqual(policy({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "https://ollama.example.com", AI_APPROVED_OLLAMA_HOSTS: "ollama.example.com" }).ok, ["ollama"]);
});

