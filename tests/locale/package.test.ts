import test from "node:test";
import assert from "node:assert/strict";
import { assertDelegatedChanges, dateOnly, defaultLocale, formatDateOnly, formatInstant, formatMoney, localePackageSchema, minorUnits, parseMoney, resolvePackage, sumMoney } from "../../src/lib/locale/package";
import { catalogs } from "../../src/lib/locale/messages";
import { workflowSample } from "../../src/lib/locale/samples";

test("language and direction never mutate canonical amounts, dates or identifiers", () => {
 const original = { date: "2015-01-01", amount: { minor: 123456, currency: "SAR" }, id: "INV-014" }; const copy = structuredClone(original);
 for (const language of ["en", "ar", "ur"] as const) for (const timezone of ["America/New_York", "Asia/Riyadh", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
 const p = { ...defaultLocale, language, timezone }; assert.ok(formatDateOnly(original.date, p)); assert.ok(formatMoney(original.amount, p));
 assert.equal(formatDateOnly(original.date, p), formatDateOnly(original.date, { ...p, timezone: "UTC" })); }
 assert.deepEqual(original, copy); assert.throws(() => dateOnly("2027-02-29")); assert.equal(dateOnly("2028-02-29"), "2028-02-29");
});
test("currency precision and explicit rounding cover zero, two and three decimal units", () => {
 for (const [code, digits, minor] of [["JPY", 0, 1235], ["SAR", 2, 123457], ["KWD", 3, 1234567]] as const) { assert.equal(minorUnits(code), digits); assert.equal(parseMoney("1234.567", code).minor, minor); }
 assert.match(formatMoney({ minor: 9007199254740991, currency: "USD" }, defaultLocale), /90,071,992,547,409\.91/);
 assert.equal(parseMoney("-1.005", "USD").minor, -101); assert.equal(parseMoney("1.004", "USD").minor, 100);
 assert.deepEqual(sumMoney([{ minor: 100, currency: "JPY" }, { minor: 234, currency: "JPY" }]), { minor: 334, currency: "JPY" });
 assert.throws(() => sumMoney([{ minor: 100, currency: "JPY" }, { minor: 100, currency: "USD" }]));
 assert.throws(() => parseMoney("9999999999999999", "USD")); assert.throws(() => parseMoney("1e3", "USD"));
});
test("DST transitions display the same UTC instant with correct wall clocks", () => {
 const ny = { ...defaultLocale, timezone: "America/New_York" }; const london = { ...defaultLocale, timezone: "Europe/London" };
 assert.match(formatInstant("2026-03-08T06:59:00Z", ny), /1:59/); assert.match(formatInstant("2026-03-08T07:00:00Z", ny), /3:00/);
 assert.match(formatInstant("2026-03-29T00:59:00Z", london), /12:59|00:59/); assert.match(formatInstant("2026-03-29T01:00:00Z", london), /2:00/);
 const snapshot = { ...ny }; const historical = formatInstant("2026-11-01T05:30:00Z", snapshot); ny.timezone = "Asia/Tokyo"; assert.equal(formatInstant("2026-11-01T05:30:00Z", snapshot), historical);
});
test("only validated calendars and timezones can be activated", () => {
 assert.throws(() => localePackageSchema.parse({ ...defaultLocale, calendar: "islamic" })); assert.throws(() => localePackageSchema.parse({ ...defaultLocale, timezone: "Invented/Zone" }));
 assert.throws(() => localePackageSchema.parse({ ...defaultLocale, weekend: [1, 1] })); assert.equal(resolvePackage({ language: "ar" }, { timezone: "Asia/Riyadh" }, "en").language, "en");
});
test("role and campus delegation deny vendor, sibling, and nondelegated writes", () => {
 for (const role of ["APP_OWNER", "TEACHER", "STUDENT", "PARENT", "ACCOUNTANT", "HR", "LIBRARIAN"]) assert.throws(() => assertDelegatedChanges(role, "a", null, 2, [], { language: "ar" }));
 assert.doesNotThrow(() => assertDelegatedChanges("SUPER_ADMIN", null, null, 2, [], { language: "ar" })); assert.doesNotThrow(() => assertDelegatedChanges("ADMIN", "a", null, 1, [], { language: "ar" }));
 assert.throws(() => assertDelegatedChanges("ADMIN", "a", null, 2, [], { language: "ar" })); assert.doesNotThrow(() => assertDelegatedChanges("PRINCIPAL", "a", "a", 2, ["language"], { language: "ar" }));
 assert.throws(() => assertDelegatedChanges("PRINCIPAL", "a", "b", 2, ["language"], { language: "ar" })); assert.throws(() => assertDelegatedChanges("PRINCIPAL", "a", "a", 2, ["language"], { currency: "SAR" }));
});
test("enabled workflow catalogs have complete nonempty coverage and shared sample values", () => {
 assert.deepEqual(Object.keys(catalogs.ar).sort(), Object.keys(catalogs.en).sort());
 assert.deepEqual(Object.keys(catalogs.ur).sort(), Object.keys(catalogs.en).sort());
 for (const value of Object.values(catalogs.ar)) assert.ok(Array.isArray(value) ? value.length === 7 && value.every(Boolean) : value.length > 0);
 for (const language of ["en", "ar", "ur"] as const) { const sample = workflowSample({ ...defaultLocale, language }); assert.ok(sample.notification.includes(sample.attendance)); assert.ok(sample.notification.includes(sample.amount)); assert.ok(sample.notification.includes(sample.invoiceId)); }
});

test("all supported notification templates carry Arabic copy and escaped RTL HTML", async () => {
 const { defaultTemplateFor, NOTIFICATION_TEMPLATE_KEYS } = await import("../../src/lib/notifications/templates");
 const { notificationHtml } = await import("../../src/lib/locale/notification-catalog");
 for (const language of ["ar", "ur"] as const) for (const key of NOTIFICATION_TEMPLATE_KEYS) {
  const en = defaultTemplateFor(key, "EMAIL", "en")!; const ar = defaultTemplateFor(key, "EMAIL", language)!;
  assert.notEqual(ar.body, en.body); assert.match(ar.body, /[\u0600-\u06ff]/);
  const placeholders = (body: string) => [...body.matchAll(/\{\{(\w+)\}\}/g)].map((v) => v[1]).sort();
  assert.deepEqual(placeholders(ar.body), placeholders(en.body));
 }
 const html = notificationHtml('<script>alert("x")</script> DEMO-014', "ar"); assert.match(html, /dir="rtl"/); assert.ok(!html.includes("<script>")); assert.ok(html.includes("&lt;script&gt;"));
});
