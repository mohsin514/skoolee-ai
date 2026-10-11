import test from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGE_COOKIE, LANGUAGE_NATIVE_NAMES, directionFor, languageCookieAttributes, parseLanguage, parseLanguageCookie, serializeLanguageCookie,
} from "../../src/lib/locale/language-cookie";

test("parseLanguage accepts only the three literals", () => {
  for (const lang of ["en", "ar", "ur"] as const) assert.equal(parseLanguage(lang), lang);
  for (const bad of ["", "EN", "fr", "ar ", "en-US", "<script>", null, undefined, 1, {}, ["en"]]) assert.equal(parseLanguage(bad), null);
});

test("cookie serializes with the documented attributes", () => {
  assert.equal(LANGUAGE_COOKIE, "skoolee-lang");
  assert.equal(serializeLanguageCookie("ar", false), "skoolee-lang=ar; Path=/; Max-Age=31536000; SameSite=Lax");
  assert.equal(serializeLanguageCookie("ur", true), "skoolee-lang=ur; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  const attrs = languageCookieAttributes();
  assert.deepEqual({ ...attrs, secure: undefined }, { path: "/", sameSite: "lax", httpOnly: false, maxAge: 31_536_000, secure: undefined });
  assert.equal(typeof attrs.secure, "boolean");
});

test("cookie string parsing round-trips and ignores tampered values", () => {
  assert.equal(parseLanguageCookie(serializeLanguageCookie("ur", false).split(";")[0]), "ur");
  assert.equal(parseLanguageCookie("a=1; skoolee-lang=ar; b=2"), "ar");
  assert.equal(parseLanguageCookie("skoolee-lang=fr"), null);
  assert.equal(parseLanguageCookie("skoolee-lang=ar%22%3E"), null);
  assert.equal(parseLanguageCookie("skoolee-langx=ar"), null);
  assert.equal(parseLanguageCookie(""), null);
});

test("direction and native names", () => {
  assert.equal(directionFor("en"), "ltr");
  assert.equal(directionFor("ar"), "rtl");
  assert.equal(directionFor("ur"), "rtl");
  assert.deepEqual(LANGUAGE_NATIVE_NAMES, { en: "English", ar: "العربية", ur: "اردو" });
});
