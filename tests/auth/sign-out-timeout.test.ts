// SKAI-1896: a sign-out request that never answers must not keep the app on the console.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve("tsx"))("esbuild");
const stub = resolve("tests/auth/fixtures/sign-out-stubs.ts");
const compiled = buildSync({
  entryPoints: [resolve("src/lib/auth/sign-out.ts")], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  alias: { "@/lib/drafts/store": stub, "@/components/nav/NavigationAccess": stub, "@/components/role-dashboard/ScopeBadge": stub, "@/lib/ui/workspace-pref-storage": stub },
}).outputFiles[0].text;
const loaded = { exports: {} as typeof import("../../src/lib/auth/sign-out") };
new Function("module", "exports", "require", compiled)(loaded, loaded.exports, require);
const { endServerSession } = loaded.exports;

const hanging = ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
})) as typeof fetch;

test("a hanging sign-out request is abandoned after both bounded attempts", async () => {
  const started = Date.now();
  assert.equal(await endServerSession(hanging, 50), false);
  assert.ok(Date.now() - started < 1000);
});

test("a confirmed sign-out resolves true on the first attempt", async () => {
  let calls = 0;
  const ok = (async () => { calls++; return new Response("{}", { status: 200 }); }) as typeof fetch;
  assert.equal(await endServerSession(ok, 50), true);
  assert.equal(calls, 1);
});

test("a stalled first attempt is retried once", async () => {
  let calls = 0;
  const flaky = ((url: string, init?: RequestInit) => (++calls === 1 ? hanging(url, init) : Promise.resolve(new Response("{}", { status: 200 })))) as typeof fetch;
  assert.equal(await endServerSession(flaky, 50), true);
  assert.equal(calls, 2);
});

test("the logout response no longer asks the browser to wipe its cache", () => {
  const route = readFileSync(resolve("src/app/api/auth/logout/route.ts"), "utf8");
  assert.doesNotMatch(route, /"Clear-Site-Data"\s*:/);
  assert.match(route, /"Cache-Control": "no-store"/);
});
