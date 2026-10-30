import test from "node:test";
import assert from "node:assert/strict";
import { TRUST_PACK_CHROME, trustPackDoc, trustPackLang, type TrustPackId } from "../../src/lib/legal/trust-pack";

const IDS: TrustPackId[] = ["privacy", "terms", "dpa", "guardian"];

test("every trust-pack document exists in EN and UR with matching sections", () => {
  for (const id of IDS) {
    const en = trustPackDoc(id, "en");
    const ur = trustPackDoc(id, "ur");
    assert.equal(ur.sections.length, en.sections.length, id);
    assert.notEqual(ur.title, en.title, `${id} UR title is translated`);
  }
});

test("placeholders for legal entity details survive translation", () => {
  for (const id of IDS) {
    const placeholders = (lang: "en" | "ur") =>
      JSON.stringify(trustPackDoc(id, lang)).match(/\[[A-Z][A-Z0-9 ,'—-]+[^\]]*\]/g)?.sort() ?? [];
    assert.ok(placeholders("en").length > 0, `${id} has placeholders`);
    assert.deepEqual(placeholders("ur"), placeholders("en"), id);
  }
  assert.match(JSON.stringify(trustPackDoc("privacy", "en")), /\[LEGAL ENTITY NAME\]/);
});

test("both languages carry the legal-review draft banner", () => {
  for (const lang of ["en", "ur"] as const) assert.match(TRUST_PACK_CHROME[lang].draft, /DRAFT — requires legal review/);
});

test("unknown languages fall back to English", () => {
  assert.equal(trustPackLang("ur"), "ur");
  assert.equal(trustPackLang(["ur"]), "en");
  assert.equal(trustPackLang("fr"), "en");
  assert.equal(trustPackLang(undefined), "en");
});
