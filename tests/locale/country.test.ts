import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultLocale, resolvePackage } from "../../src/lib/locale/package";
import { countrySchema, currencyForCountry, normalizeCountry } from "../../src/lib/locale/country";

test("validated institution location selects currency without confusing Dubai and Saudi Arabia", () => {
 for (const [country, currency] of [["Pakistan", "PKR"], ["Saudi Arabia", "SAR"], ["Dubai", "AED"], ["United Arab Emirates", "AED"], ["Kuwait", "KWD"], ["Canada", "USD"], ["", "USD"]]) {
  assert.equal(currencyForCountry(normalizeCountry(country)), currency);
 }
 assert.equal(normalizeCountry(undefined), "OTHER");
 assert.equal(countrySchema.safeParse("Dubai").success, false);
 assert.equal(countrySchema.safeParse("SA").success, true);
});

test("unknown new location defaults to USD while explicit historical currency remains intact", () => {
 assert.equal(defaultLocale.currency, "USD");
 assert.equal(resolvePackage({country:"KW"}).currency, "KWD");
 assert.equal(resolvePackage({country:"PK",currency:"PKR"},{country:"AE"}).currency,"AED");
 assert.equal(resolvePackage({country:"OTHER",currency:"PKR"}).currency,"PKR");
});
