import assert from "node:assert/strict";
import test from "node:test";
import { COUNTRIES } from "@/lib/locale/country";
import { automatedCheckoutAvailable, regionalPaymentMethods } from "@/lib/billing/payment-routes";

const configured = ["stripe", "safepay", "bank_transfer"] as const;

test("Pakistani schools keep every configured automated payment route", () => {
  assert.equal(automatedCheckoutAvailable("PK"), true);
  assert.deepEqual(regionalPaymentMethods("PK", configured), [...configured]);
});

test("schools outside validated markets get no automated route and use a quote instead", () => {
  for (const country of COUNTRIES.filter(item => item !== "PK")) {
    assert.equal(automatedCheckoutAvailable(country), false, country);
    assert.deepEqual(regionalPaymentMethods(country, configured), [], country);
  }
});

test("regional filtering never adds a route that is not configured", () => {
  assert.deepEqual(regionalPaymentMethods("PK", ["bank_transfer"]), ["bank_transfer"]);
  assert.deepEqual(regionalPaymentMethods("PK", []), []);
});
