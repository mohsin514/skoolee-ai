import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { ok, failFrom } from "../../src/lib/api/envelope";
import { readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1212: the resources action route moves to the envelope; its only client caller reads it through the shared helpers.
const ROUTE = "src/app/api/resources/[id]/route.ts";

test("resources action route emits only the envelope", () => {
  const source = readFileSync(ROUTE, "utf8");
  assert.doesNotMatch(source, /Response\.json\(/, "route still builds a raw response");
  assert.doesNotMatch(source, /errorResponse\(/, "route still uses the legacy error shape");
  assert.match(source, /from "@\/lib\/api\/envelope"/);
  assert.match(source, /parseBody\(/, "route must keep SKAI-1161 validation");
});

test("resources action success is { data } and errors keep their code", async () => {
  const body = await ok({ version: 2, uploadUrl: null }).json();
  assert.deepEqual(body, { data: { version: 2, uploadUrl: null } });
  const denied = await (await failFrom(new ApiError("Insufficient permissions", 403))).json();
  assert.deepEqual(denied, { error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
  assert.equal(readApiError(denied), "Insufficient permissions");
});

test("resources client caller reads the envelope, not the legacy result key", () => {
  const source = readFileSync("src/components/resources/ResourceLibrary.tsx", "utf8");
  assert.doesNotMatch(source, /added\.result\./);
  assert.match(source, /added\.data\.uploadUrl/);
  assert.match(source, /readApiError\(data\)/);
});

// SKAI-1212 slice: resource create answers on the envelope; its client caller unwraps { data }.
test("resources create route POST emits only the envelope", () => {
  const source = readFileSync("src/app/api/resources/route.ts", "utf8");
  const post = source.slice(source.indexOf("export async function POST"));
  assert.doesNotMatch(post, /Response\.json\(/, "create still builds a raw response");
  assert.doesNotMatch(post, /errorResponse\(/, "create still uses the legacy error shape");
  assert.match(post, /ok\(await createResource/);
});

test("resources create client caller reads { data: { resource, uploadUrl } }", () => {
  const source = readFileSync("src/components/resources/ResourceLibrary.tsx", "utf8");
  assert.match(source, /result\.data\.resource\.id/);
  assert.match(source, /result\.data\.uploadUrl/);
  assert.doesNotMatch(source, /result\.resource\./);
});
