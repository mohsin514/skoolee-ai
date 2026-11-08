import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BRAND_PALETTE, assertScriptName, assertShortName, brandHex, contrastRatio, localizedSchoolName, parseBrandColor } from "../../src/lib/school/branding";
import { schoolBrandingUiEntries } from "../../src/lib/locale/school-branding-ui-messages";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKAI-114: school identity and branding.
test("every palette colour keeps white text and white paper at WCAG AA (4.5:1)", () => {
  for (const { id, hex } of BRAND_PALETTE) assert.ok(contrastRatio(hex, "#FFFFFF") >= 4.5, `${id} ${contrastRatio(hex, "#FFFFFF").toFixed(2)}`);
  assert.equal(new Set(BRAND_PALETTE.map(({ id }) => id)).size, BRAND_PALETTE.length);
  assert.ok(contrastRatio("#FFFF00", "#FFFFFF") < 4.5);
});

test("only palette ids are stored as the brand colour", () => {
  assert.equal(parseBrandColor("teal"), "teal");
  assert.equal(parseBrandColor(""), null);
  assert.equal(parseBrandColor(null), null);
  for (const bad of ["#FFFF00", "yellow", "TEAL", 7]) assert.throws(() => parseBrandColor(bad), /from the palette/);
  assert.equal(brandHex("teal"), "#0F766E");
  assert.equal(brandHex("retired"), null);
});

test("Urdu and Arabic names need Arabic script; short names stay short", () => {
  assert.equal(assertScriptName("ہورائزن اکیڈمی", "Urdu name"), "ہورائزن اکیڈمی");
  assert.equal(assertScriptName(null, "Urdu name"), null);
  assert.throws(() => assertScriptName("Horizon Academy", "Arabic name"), /Arabic script/);
  assert.throws(() => assertScriptName("أ".repeat(121), "Arabic name"), /120 characters/);
  assert.equal(assertShortName("HA"), "HA");
  for (const bad of ["H", "H".repeat(25)]) assert.throws(() => assertShortName(bad), /2 to 24/);
});

test("documents use the official name in their language and fall back to English", () => {
  const school = { name: "Horizon Academy", nameUr: "ہورائزن اکیڈمی", nameAr: null };
  assert.equal(localizedSchoolName(school, "ur"), "ہورائزن اکیڈمی");
  assert.equal(localizedSchoolName(school, "ar"), "Horizon Academy");
  assert.equal(localizedSchoolName(school, "en"), "Horizon Academy");
  assert.equal(localizedSchoolName(null, "en"), "");
});

test("identity fields are written only by the institution authority, for the caller's school, with an audit row", () => {
  const settings = readFileSync("src/app/actions/settings.ts", "utf8");
  const update = settings.slice(settings.indexOf("export async function updateSchoolDetails"), settings.indexOf("export async function updateCampusDetails"));
  assert.match(update, /assertCanEditSchool\(session\);/);
  assert.match(update, /assertScriptName\(optionalText\(input\.nameUr\), "Urdu name"\)/);
  assert.match(update, /assertScriptName\(optionalText\(input\.nameAr\), "Arabic name"\)/);
  assert.match(update, /parseBrandColor\(input\.brandColor\)/);
  assert.match(update, /tx\.school\.update\(\{ where: \{ id: session\.schoolId \}, data \}\)/);
  assert.match(update, /expectedRevision !== recordRevision\(current\)/);
  assert.match(update, /tx\.auditLog\.create/);
  // A slow database must not expire the read-update-audit transaction mid-save.
  assert.match(update, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable, maxWait: 10_000, timeout: 30_000/);
  assert.match(settings, /if \(isInstitutionAuthority\(session\)\) return;\n {2}throw new Error\("Only the institution administrator can change school details\."\)/);
});

test("report cards and PDF headers carry the brand colour and localized name", () => {
  const pdf = readFileSync("src/lib/pdf.tsx", "utf8"), card = readFileSync("src/lib/academic/pdf.tsx", "utf8"), payload = readFileSync("src/lib/academic/report-cards.ts", "utf8");
  assert.match(pdf, /brandHex\(campus\.school\?\.brandColor\)/);
  assert.match(card, /localizedSchoolName\(school, locale\.language\)/);
  assert.match(payload, /nameUr: true, nameAr: true, brandColor: true/);
});

test("every new branding string has Arabic and Urdu", () => {
  for (const [en, ar, ur] of schoolBrandingUiEntries) {
    assert.ok(en && ar && ur && ar !== en && ur !== en, en);
    assert.notEqual(translateUi(en, "ar"), en, `ar: ${en}`);
    assert.notEqual(translateUi(en, "ur"), en, `ur: ${en}`);
  }
  assert.equal(new Set(schoolBrandingUiEntries.map(([en]) => en)).size, schoolBrandingUiEntries.length);
});
