import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PostedPayrollReversal } from "../../src/components/payroll/posted-payroll-reversal";
import { HandedLibraryCharges } from "../../src/components/fees/handed-library-charges";
import { libraryChargeActionsEnabled, payrollReversalEnabled } from "../../src/lib/feature-flags";

// SKAI-1506 / SKAI-1669: the finance action buttons ship behind their own flags, off by default.
test("both flags are off unless their env var is exactly 1", () => {
  delete process.env.NEXT_PUBLIC_FEATURE_PAYROLL_REVERSAL; delete process.env.NEXT_PUBLIC_FEATURE_LIBRARY_CHARGE_ACTIONS;
  assert.equal(payrollReversalEnabled(), false);
  assert.equal(libraryChargeActionsEnabled(), false);
  process.env.NEXT_PUBLIC_FEATURE_PAYROLL_REVERSAL = "true";
  assert.equal(payrollReversalEnabled(), false);
  process.env.NEXT_PUBLIC_FEATURE_PAYROLL_REVERSAL = "1"; process.env.NEXT_PUBLIC_FEATURE_LIBRARY_CHARGE_ACTIONS = "1";
  assert.equal(payrollReversalEnabled(), true);
  assert.equal(libraryChargeActionsEnabled(), true);
  delete process.env.NEXT_PUBLIC_FEATURE_PAYROLL_REVERSAL; delete process.env.NEXT_PUBLIC_FEATURE_LIBRARY_CHARGE_ACTIONS;
});

test("with the flag off, the payroll reversal button is not rendered", () => {
  const html = renderToStaticMarkup(<PostedPayrollReversal />);
  assert.doesNotMatch(html, /Reverse posted payroll expense|data-payroll-reversal/);
  assert.match(renderToStaticMarkup(<PostedPayrollReversal enabled />), /data-payroll-reversal/);
});

test("with the flag off, the library charge Accept / Return buttons are not rendered", () => {
  const html = renderToStaticMarkup(<HandedLibraryCharges />);
  assert.doesNotMatch(html, /accept-library-charge|return-library-charge|data-library-charges-queue/);
  assert.match(renderToStaticMarkup(<HandedLibraryCharges enabled />), /data-library-charges-queue/);
});
