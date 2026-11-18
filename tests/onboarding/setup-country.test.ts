// SKAI-2255: the wizard's country becomes the school's locale policy at activation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySetupCountry } from "@/lib/onboarding/setup-service";

function fakeTx(settings: Record<string, unknown> | null) {
  const created: unknown[] = [];
  const tx = { localePolicy: { findFirst: async () => (settings ? { settings } : null), create: async (args: { data: unknown }) => { created.push(args.data); return args.data; } } };
  return { tx: tx as never, created };
}

test("a changed country writes a new school-scope policy with its currency", async () => {
  const { tx, created } = fakeTx({ country: "PK", countryIso: "PK", currency: "PKR" });
  await applySetupCountry(tx, "school-1", "AE", "user-1");
  assert.equal(created.length, 1);
  const row = created[0] as { schoolId: string; scopeKey: string; settings: Record<string, unknown> };
  assert.equal(row.schoolId, "school-1");
  assert.equal(row.scopeKey, "school");
  assert.deepEqual(row.settings, { country: "AE", countryIso: "AE", currency: "AED" });
});

test("an unchanged, empty or unlisted country is handled without a stray row", async () => {
  const same = fakeTx({ country: "PK", countryIso: "PK", currency: "PKR" });
  await applySetupCountry(same.tx, "s", "PK", "u");
  await applySetupCountry(same.tx, "s", "", "u");
  assert.equal(same.created.length, 0);
  const other = fakeTx(null);
  await applySetupCountry(other.tx, "s", "QA", "u");
  assert.deepEqual((other.created[0] as { settings: unknown }).settings, { country: "OTHER", countryIso: "QA", currency: "USD" });
});
