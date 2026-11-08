import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-844 (AI-08): unreleased paper text reaches the AI provider only while the school's delivery policy allows it.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const calls: Array<string | null> = [];
let chain: Record<string, unknown> | undefined;
mock.module(src("lib/school-ai/repository.ts"), {
  namedExports: { resolveScopeDeliveryPolicy: async (_user: unknown, campusId: string | null) => { calls.push(campusId); return { policy: chain ? { chain } : null }; } },
});

const load = async () => (await import(src("lib/school-ai/provider-confidentiality.ts"))).assertUnreleasedPaperTextAllowed as (user: unknown, campusId: string | null, tx: unknown) => Promise<void>;
const user = { userId: "teacher-a", schoolId: "school-a", role: "TEACHER", campusId: "campus-a" };

test("SKAI-844: the platform default (no school policy) allows paper text", async () => {
  chain = undefined;
  const assertUnreleasedPaperTextAllowed = await load();
  await assertUnreleasedPaperTextAllowed(user, "campus-a", {});
  assert.deepEqual(calls.at(-1), "campus-a");
});

test("SKAI-844: OPT_IN allows, OFF refuses with a manual-path message", async () => {
  const assertUnreleasedPaperTextAllowed = await load();
  chain = { providerConfidentiality: { unreleasedPaperText: "OPT_IN" } };
  await assertUnreleasedPaperTextAllowed(user, "campus-a", {});
  chain = { providerConfidentiality: { unreleasedPaperText: "OFF" } };
  await assert.rejects(assertUnreleasedPaperTextAllowed(user, "campus-b", {}), (error: { status: number; code: string; message: string }) => error.status === 403 && error.code === "PROVIDER_CONFIDENTIALITY_OFF" && /by hand/.test(error.message));
  assert.equal(calls.at(-1), "campus-b", "the policy is resolved for the paper's own campus");
});

test("SKAI-844: generation checks the policy before any provider call when pinned paper items are sent", () => {
  const service = readFileSync(join(__dirname, "..", "..", "src/lib/school-ai/paper-generation-service.ts"), "utf8");
  const begin = service.slice(service.indexOf("async function begin"), service.indexOf("export async function recoverPaperGeneration"));
  assert.match(begin, /if \(input\.lockedQuestions\?\.length\) await assertUnreleasedPaperTextAllowed\(user, record\.campusId, tx\);/);
  assert.ok(begin.indexOf("assertUnreleasedPaperTextAllowed") < begin.indexOf("schoolAiRequest.create"), "refused before a request is claimed or credits reserved");
});
