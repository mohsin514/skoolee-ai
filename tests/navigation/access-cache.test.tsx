import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/**
 * Addendum 2026-10-22 §3: the shell keeps the last confirmed access map for the session (memory + sessionStorage,
 * keyed by user + school + role + access version) and revalidates in the background, so navigation, `?view=` and
 * focus never reopen the skeleton. These cases pin the policy and the identity rule (never shared across users).
 * The provider is bundled like tests/design-system/navigation-recovery.test.tsx (locale actions stubbed).
 */
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve("tsx"))("esbuild");
const compiled = buildSync({
  entryPoints: [resolve("src/components/nav/NavigationAccess.tsx")], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  alias: { "@/app/actions/locale": resolve("tests/design-system/foundation-b/locale-action.ts") },
}).outputFiles[0].text;
const loaded = { exports: {} as typeof import("../../src/components/nav/NavigationAccess") };
new Function("module", "exports", "require", compiled)(loaded, loaded.exports, require);
const {
  ACCESS_FOCUS_REVALIDATE_MS, ACCESS_REVALIDATE_MS, acceptRevalidation, accessCacheKey, clearNavigationAccessCache, noteNavigationIdentity,
  shouldRevalidate, NavigationAccessProvider, useNavigationAccess,
} = loaded.exports;

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
  get size() { return this.items.size; }
}
const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { sessionStorage: storage };

const STORAGE_KEY = "skoolee.navigation-access.v1";
const A = { userId: "user-a", schoolId: "school-1", role: "CAMPUS_ADMIN", accessVersion: 3 };

function Probe() {
  const access = useNavigationAccess();
  return <p>{access.status}:{access.has("fees") ? "fees" : "no-fees"}</p>;
}
const render = () => renderToStaticMarkup(<NavigationAccessProvider><Probe /></NavigationAccessProvider>);
function storeFor(scope: typeof A, access: Record<string, boolean>) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ key: accessCacheKey(scope), access, at: Date.now() }));
}

test("revalidation policy: once a minute on mount and route changes, five minutes on focus, always when it must", () => {
  const now = 1_000_000;
  assert.equal(ACCESS_REVALIDATE_MS, 60_000);
  assert.equal(ACCESS_FOCUS_REVALIDATE_MS, 300_000);
  // Nothing confirmed yet: always ask.
  assert.equal(shouldRevalidate("route", now - 1, now, false), true);
  assert.equal(shouldRevalidate("focus", null, now, true), true);
  // Route change and mount: throttled to one request a minute.
  assert.equal(shouldRevalidate("route", now - 59_000, now, true), false);
  assert.equal(shouldRevalidate("route", now - 60_000, now, true), true);
  assert.equal(shouldRevalidate("mount", now - 10_000, now, true), false);
  // Focus: only once the map is five minutes old.
  assert.equal(shouldRevalidate("focus", now - 120_000, now, true), false);
  assert.equal(shouldRevalidate("focus", now - 300_000, now, true), true);
  // A back/forward restore, a retry and an explicit access change never wait.
  for (const reason of ["restore", "retry", "changed"] as const) assert.equal(shouldRevalidate(reason, now - 1, now, true), true, reason);
});

test("the cache key names the user, school, role and access version, and nothing less", () => {
  assert.equal(accessCacheKey(A), "user-a|school-1|CAMPUS_ADMIN|3");
  assert.notEqual(accessCacheKey({ ...A, accessVersion: 4 }), accessCacheKey(A), "a permission change bumps the key");
  assert.notEqual(accessCacheKey({ ...A, role: "PRINCIPAL" }), accessCacheKey(A));
  assert.equal(accessCacheKey({ ...A, userId: "" }), null);
  assert.equal(accessCacheKey(null), null);
  assert.equal(accessCacheKey({ userId: "u", schoolId: "s", role: "TEACHER", accessVersion: null }), "u|s|TEACHER|0");
});

test("a stored map is shown first only to the identity it was confirmed for", () => {
  clearNavigationAccessCache();
  storeFor(A, { fees: true });
  // Nobody confirmed yet (a reload before the session read): the skeleton state, never someone's stored map.
  assert.match(render(), /loading:no-fees/);
  // Another user in the same tab: never their map, and the stale entry is dropped.
  noteNavigationIdentity({ ...A, userId: "user-b" });
  assert.equal(storage.getItem(STORAGE_KEY), null, "another identity's stored map is dropped");
  assert.match(render(), /loading:no-fees/);
  // The same identity: the confirmed map shows at once (no skeleton).
  clearNavigationAccessCache();
  storeFor(A, { fees: true });
  noteNavigationIdentity(A);
  assert.match(render(), /ready:fees/);
});

test("a bumped access version or a sign-out drops the cache", () => {
  clearNavigationAccessCache();
  storeFor(A, { fees: true });
  noteNavigationIdentity(A);
  assert.match(render(), /ready:fees/);
  noteNavigationIdentity({ ...A, accessVersion: 4 });
  assert.equal(storage.getItem(STORAGE_KEY), null, "a new access version clears the stored map");
  assert.match(render(), /loading:no-fees/);
  storeFor({ ...A, accessVersion: 4 }, { fees: true });
  noteNavigationIdentity(null);
  assert.equal(storage.getItem(STORAGE_KEY), null, "signed out: nothing is kept");
  assert.match(render(), /loading:no-fees/);
});

test("a revalidation that returns a different scope drops the map confirmed for the old one", () => {
  clearNavigationAccessCache();
  storeFor(A, { fees: true, timetable: true });
  noteNavigationIdentity(A);
  assert.match(render(), /ready:fees/);
  // Same scope: the fresh map replaces the old one under the same key.
  acceptRevalidation(A, { fees: true, timetable: false });
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")?.access, { fees: true, timetable: false });
  // The server now answers for another scope (a bumped access version): nothing from the old scope survives, the new
  // map is stored under the new key, becomes the identity and is what the shell shows.
  const B = { ...A, accessVersion: 4 };
  acceptRevalidation({ ...B, campusId: "campus-2" } as typeof B, { fees: false });
  const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
  assert.equal(stored?.key, accessCacheKey(B));
  assert.deepEqual(stored?.access, { fees: false }, "the old scope's keys are gone, not merged");
  assert.match(render(), /ready:no-fees/);
  // A session read for the old scope afterwards cannot bring the old map back.
  noteNavigationIdentity(A);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.match(render(), /loading:no-fees/);
});

test("a supplied map (token portal) never reads or writes the cache", () => {
  clearNavigationAccessCache();
  storeFor(A, { fees: true });
  noteNavigationIdentity(A);
  const html = renderToStaticMarkup(<NavigationAccessProvider access={{ fees: false }}><Probe /></NavigationAccessProvider>);
  assert.match(html, /ready:no-fees/);
});
