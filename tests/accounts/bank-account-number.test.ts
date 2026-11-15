import { test } from "node:test";
import assert from "node:assert/strict";
import { maskBankAccountNumber, parseBankAccountNumber } from "../../src/lib/accounts/bank-account-number";
// SKAI-2234: bank account numbers are an IBAN (mod-97) or digits and hyphens; lists show them masked.
const rejected = (value: unknown) => { try { parseBankAccountNumber(value); return false; } catch { return true; } };
test("valid IBANs and plain account numbers are accepted and normalised", () => {
  assert.equal(parseBankAccountNumber("pk36 scbl 0000 0011 2345 6702"), "PK36SCBL0000001123456702");
  assert.equal(parseBankAccountNumber("1234-5678-90"), "1234-5678-90");
  assert.equal(parseBankAccountNumber(""), null);
});
test("free text, a bad checksum and a short PK IBAN are refused", () => {
  for (const bad of ["not-an-iban <script>", "PK00TEST0000000000000000", "PK36SCBL000000112345", 12345, "12"]) assert.equal(rejected(bad), true, String(bad));
});
test("masking keeps the last four characters", () => {
  assert.equal(maskBankAccountNumber("PK36SCBL0000001123456702"), "••••6702");
  assert.equal(maskBankAccountNumber(null), null);
});
