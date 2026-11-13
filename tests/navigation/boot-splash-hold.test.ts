// SKAI-1897: the boot splash keeps holding over a whole-page skeleton so a first load shows one loader, not two.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve("tsx"))("esbuild");
const compiled = buildSync({
  entryPoints: [resolve("src/components/BootSplash.tsx")], bundle: false, write: false, platform: "node", format: "cjs", loader: { ".tsx": "tsx" }, jsx: "automatic",
}).outputFiles[0].text;
const loaded = { exports: {} as typeof import("../../src/components/BootSplash") };
const fakeRequire = (id: string) => (id.startsWith("@/") || id === "next/navigation" ? {} : require(id));
new Function("module", "exports", "require", compiled)(loaded, loaded.exports, fakeRequire);
const { pageStillLoading } = loaded.exports;

type Box = { w: number; h: number; inSplash?: boolean };
const doc = (boxes: Box[]) => ({
  defaultView: { innerWidth: 1000, innerHeight: 800 },
  querySelectorAll: () => boxes.map((b) => ({
    closest: () => (b.inSplash ? {} : null),
    getBoundingClientRect: () => ({ width: b.w, height: b.h }),
  })),
}) as unknown as Document;

test("a whole-page skeleton keeps the splash up", () => {
  assert.equal(pageStillLoading(doc([{ w: 900, h: 700 }])), true);
});

test("a small busy widget does not hold the splash", () => {
  assert.equal(pageStillLoading(doc([{ w: 300, h: 200 }])), false);
});

test("nothing busy releases the splash", () => {
  assert.equal(pageStillLoading(doc([])), false);
});

test("the splash's own progress region is ignored", () => {
  assert.equal(pageStillLoading(doc([{ w: 1000, h: 800, inSplash: true }])), false);
});
