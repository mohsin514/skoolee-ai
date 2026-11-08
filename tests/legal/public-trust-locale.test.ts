import test from "node:test";
import assert from "node:assert/strict";
import { publicLanguage, trustChrome, trustInfoDoc, langHref, type TrustInfoId } from "../../src/lib/legal/public-locale";

test("?lang wins over the cookie, the cookie over English, junk is ignored", () => {
  assert.equal(publicLanguage("ar", "ur"), "ar");
  assert.equal(publicLanguage(undefined, "ar"), "ar");
  assert.equal(publicLanguage(undefined, "ur"), "ur");
  assert.equal(publicLanguage("en", "ar"), "en");
  assert.equal(publicLanguage("fr", "zz"), "en");
  assert.equal(publicLanguage(["ar"], undefined), "en");
  assert.equal(publicLanguage(undefined, undefined), "en");
});

test("trust chrome exists in all three languages with the same navigation", () => {
  const en = trustChrome("en");
  for (const lang of ["ar", "ur"] as const) {
    const t = trustChrome(lang);
    assert.equal(t.nav.length, en.nav.length);
    assert.deepEqual(t.nav.map((n) => n.href), en.nav.map((n) => n.href));
    assert.notEqual(t.continueReading, en.continueReading, `${lang} is translated`);
  }
});

test("security, AI governance and human review pages are translated to AR and UR", () => {
  for (const id of ["security", "ai-governance", "human-review-policy"] as TrustInfoId[]) {
    const en = trustInfoDoc(id, "en");
    for (const lang of ["ar", "ur"] as const) {
      const doc = trustInfoDoc(id, lang);
      assert.equal(doc.sections.length, en.sections.length, `${id} ${lang}`);
      assert.notEqual(doc.title, en.title, `${id} ${lang} title`);
      assert.match(doc.title + doc.sections[0].body, /[؀-ۿ]/, `${id} ${lang} is in Arabic script`);
    }
  }
});

test("language links keep English clean and carry the choice otherwise", () => {
  assert.equal(langHref("/security", "en"), "/security?lang=en");
  assert.equal(langHref("/security", "ar"), "/security?lang=ar");
  assert.equal(langHref("/security", null), "/security");
});
