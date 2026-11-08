// SKAI-1004: the root error and not-found boundaries ship on every route's first
// load. Their views pull in the full EN/AR/UR UI catalog (~875 KB gzip), so they
// must be code-split and fetched only when an error or 404 actually renders.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const staticImports = (src: string) => [...src.matchAll(/^import(?! type)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

test("root error and not-found boundaries do not statically import the heavy views", () => {
  for (const file of ["src/app/error.tsx", "src/app/not-found.tsx", "src/components/ui/lazy-boundaries.tsx"]) {
    const imports = staticImports(read(file));
    for (const heavy of ["@/components/ui/route-error", "@/components/ui/not-found-view", "@/lib/locale/ui-messages"]) {
      assert.ok(!imports.includes(heavy), `${file} statically imports ${heavy}`);
    }
  }
  const lazy = read("src/components/ui/lazy-boundaries.tsx");
  assert.match(lazy, /dynamic\(\(\) => import\("\.\/route-error"\)/);
  assert.match(lazy, /dynamic\(\(\) => import\("\.\/not-found-view"\)/);
});

test("the hard-load splash beat is short", () => {
  const src = read("src/components/SplashScreen.tsx");
  const hold = Number(src.match(/const HOLD_MS = (\d+);/)?.[1]);
  assert.ok(hold > 0 && hold <= 1500, `HOLD_MS is ${hold}`);
});

test("the light translator matches the full catalog once loaded and never loads it for English", async () => {
  const light = await import("../../src/lib/locale/ui-translate");
  assert.equal(light.isUiCatalogReady("en"), true);
  assert.equal(light.translateUi("Page not found", "en"), "Page not found");
  await light.loadUiCatalog("ar");
  const full = await import("../../src/lib/locale/ui-messages");
  for (const lang of ["ar", "ur"] as const) {
    assert.equal(light.isUiCatalogReady(lang), true);
    assert.equal(light.translateUi("Page not found", lang), full.translateUi("Page not found", lang));
    assert.notEqual(light.translateUi("Page not found", lang), "Page not found");
  }
});

test("client providers and shared UI use the light translator", () => {
  for (const file of ["src/components/locale/LocaleProvider.tsx", "src/components/ui/toast.ts", "src/components/ui/confirm-action.tsx", "src/components/shared-admin/index.tsx"]) {
    assert.ok(!staticImports(read(file)).includes("@/lib/locale/ui-messages"), file);
  }
});

test("client components resolve media URLs without the AWS SDK", async () => {
  for (const file of ["src/app/(auth)/login/page.tsx", "src/components/ui/avatar-image.tsx", "src/components/role-dashboard/RoleSidebar.tsx"]) {
    assert.ok(!staticImports(read(file)).includes("@/lib/storage/s3"), file);
  }
  const { resolveMediaUrl } = await import("../../src/lib/storage/media-url");
  assert.equal(resolveMediaUrl("logos/a.png"), "/api/media/logos/a.png");
  assert.equal(resolveMediaUrl("https://x.test/a.png"), "https://x.test/a.png");
  assert.equal(resolveMediaUrl(null), null);
});
