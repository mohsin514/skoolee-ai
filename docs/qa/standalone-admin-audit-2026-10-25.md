# Standalone school admin audit — 2026-10-25

Base: dev. Role: ADMIN with standalone institution ownership. Synthetic fixtures only.

## Fixed

- Today treated the entire amount of a PARTIAL invoice as collected. Collection now uses actual totalAmountPaid, includes receipts against overdue invoices, and excludes cancelled invoices.
- A locale-default currency could hide every invoice. Campus and principal summaries now use the same dominant billing-currency selection as the finance desk. Currency precision is preserved.
- The shared principal summary supplies actual receipts too, so the shared chart calculation does not regress that console.

## Validation

- `tests/admin/collection.test.ts`: four cases, including partial/overdue, cancellation, zero balance, JPY and older payloads.
- `tests/admin/standalone.browser.ts`: seven workspaces at 1440px and 390px (Today, students, classes, fees, people/access, school settings, billing); correct 25% collection; no horizontal overflow or browser exceptions; platform-owner API returns 403. Synthetic records are deleted afterward.
- 201 AI workflow database tests and 95 AI unit tests passed. These cover administrative roster, fee, people and planning workflows, role gates, tenant scope, confirmation, replay, provider-error behavior and RAG boundaries. These are deterministic provider tests, not a live-model accuracy certification.
- Role authorization: 110 passed, two skipped. Navigation: 31 passed.
- Source TypeScript, targeted lint and diff whitespace checks passed.

Screenshots are generated under ignored `test-results/standalone-admin/`; no generated images or dependency files are committed.

## Scope and remaining checks

The school administrator needs school ownership/settings, staff access, admissions, student records, academic operations when no principal is assigned, finance approvals and reviewed AI automation. These surfaces already exist; this change repairs misleading financial reporting rather than adding duplicate controls.

This is a focused regression audit, not certification of every school module, external payment provider, message delivery or real-model answer. The older class/settings browser suites were attempted but their selectors/first-login fixtures need updating; the campus-admin audit handles those separately. Concurrent section transfer returned a serialization error and is tracked for that PR. Multi-currency totals still present the dominant currency, matching the current finance-desk contract.
