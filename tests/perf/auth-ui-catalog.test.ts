// SKAI-1004: Arabic and Urdu pre-login pages load a generated subset of the UI catalog instead
// of the whole thing (~600 KB gzip). These tests keep the subset complete and current.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderModule } from "../../scripts/gen-auth-ui-catalog";
import { translateUi } from "../../src/lib/locale/ui-messages";
import ar from "../../src/lib/locale/auth-ui-catalog.ar";
import ur from "../../src/lib/locale/auth-ui-catalog.ur";

test("the committed auth catalogs match a fresh generation (run npm run gen:auth-ui-catalog)", () => {
  for (const lang of ["ar", "ur"] as const) {
    assert.equal(readFileSync(`src/lib/locale/auth-ui-catalog.${lang}.ts`, "utf8"), renderModule(lang), `auth-ui-catalog.${lang}.ts is stale`);
  }
});

test("every subset entry is exactly what the full catalog says", () => {
  for (const [lang, subset] of [["ar", ar], ["ur", ur]] as const) {
    assert.ok(Object.keys(subset).length > 50, `${lang} subset is suspiciously small`);
    for (const [source, value] of Object.entries(subset)) assert.equal(value, translateUi(source, lang), `${lang}: ${source}`);
  }
});

test("shared UI strings the auth pages render are in the subset", () => {
  // Spot checks across the shared components the (auth) pages use (form errors, password toggle, toasts).
  const ui = readFileSync("src/components/ui/input.tsx", "utf8") + readFileSync("src/components/ui/alert.tsx", "utf8");
  const sample = [...ui.matchAll(/\b(?:t|tr|translateUi)\("([^"]+)"/g)].map((m) => m[1]).filter((s) => translateUi(s, "ar") !== s);
  assert.ok(sample.length > 0, "no translated literals found in input/alert to spot-check");
  for (const s of sample) assert.equal(ar[s], translateUi(s, "ar"), `missing from ar subset: ${s}`);
});

test("the auth locale provider asks for the auth scope; the signed-in root does not", () => {
  const authProvider = readFileSync("src/components/locale/AuthLocaleProvider.tsx", "utf8");
  assert.match(authProvider, /loadUiCatalog\(lang, "auth"\)/);
  assert.match(authProvider, /catalogScope="auth"/);
  const root = readFileSync("src/components/locale/LocaleProvider.tsx", "utf8");
  assert.doesNotMatch(root, /"auth"/);
});
