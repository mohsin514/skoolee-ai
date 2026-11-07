import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_PAGE_IDS, productLocale } from "../../src/lib/marketing/product-locale";

test("every marketing product page has AR and UR copy with the same shape as EN", () => {
  const en = productLocale("en");
  for (const lang of ["ar", "ur"] as const) {
    const loc = productLocale(lang);
    assert.equal(loc.chrome.stats.length, en.chrome.stats.length);
    assert.equal(loc.chrome.checks.length, en.chrome.checks.length);
    for (const id of PRODUCT_PAGE_IDS) {
      const a = en.pages[id], b = loc.pages[id];
      assert.ok(b, `${lang} ${id}`);
      assert.equal(b.highlights.length, a.highlights.length, `${lang} ${id} highlights`);
      assert.equal(b.sections.length, a.sections.length, `${lang} ${id} sections`);
      assert.equal(b.proof.length, a.proof.length, `${lang} ${id} proof`);
      assert.match(b.title, /[؀-ۿ]/, `${lang} ${id} title is translated`);
    }
  }
});

test("English copy is unchanged from the original pages", () => {
  assert.equal(productLocale("en").pages["multi-campus-school-erp"].title, "Give school groups one control center for every campus.");
  assert.equal(productLocale("en").chrome.demo, "Book a demo");
});
