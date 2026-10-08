# SKO-201 locale packages — implementation and remaining acceptance work

This is an in-progress implementation. It is not approval to release full Arabic coverage or a completed SKO-201 acceptance claim.

## Implemented

- Append-only, effective-dated school and campus locale packages. Current database roles and school-group ownership govern writes; campus principals can change only delegated keys. Existing nondelegated overrides survive a delegated reset.
- Personal English/Arabic preference; bilingual locale settings, validation/help states, shared interface/print/notification preview, RTL controls and mixed-direction tokens.
- Signed expiring preview receipt, reauthorization and serializable application. Currency changes wait for a different accountant's review. No currency conversion.
- Date-only formatting never applies timezone conversion. Instant formatting uses validated IANA zones. Gregorian/ISO display only; unsupported calendars are rejected.
- Integer currency parsing with explicit half-away-from-zero rounding, zero/two/three decimal currencies, exact formatting through the safe integer range, and currency-mixing rejection.
- Real attendance defaults resolve the active campus timezone. Real calendar feeds apply historical/future weekend rules per date; week start changes reorder the grid. Exam scheduling conflict checks and parent timetable views use the same policy. Legacy timezone/weekend writes cannot bypass reviewed policy.
- Invoices retain a currency code (existing legacy sources remain PKR) and issuance locale snapshot. Actual invoice PDF uses Arabic shaping, localized copy, date-only fields and original currency minor units. Previously the PDF displayed integer minor units directly as rupees; the localized renderer uses the currency precision.
- Notification templates have language identity. Arabic/English fallback catalogs have matching placeholders. Recipient preference overrides display language, original invoice amounts/dates are formatted from the invoice snapshot, and communication metadata retains locale. The email frame carries language/direction and Arabic copy. No test sent any message.

## Still required before release / issue completion

- Apply and verify personal/school language across the existing role workspaces, all enabled forms, help and validation copy. An AST inventory found 3,088 unique static user-facing strings in 288 TSX files (11,645 source words), before dynamic messages. Existing workspaces do not yet switch completely to Arabic.
- Integrate and validate the real academic report-card PDF language path; current report-card functionality still has the existing English/Urdu behavior.
- Show real future scheduled events and their timezone effects in the settings preview; the current timezone comparison is a clearly marked synthetic UTC event. Preserve each historical event's original timezone context where needed.
- Complete currency identity propagation for non-PKR fee sources and all downstream accounting totals/payment paths. Existing legacy accounting sources remain PKR, deliberately not reinterpreted by changing the display policy.
- Human translation approval is not implied by synthetic fixtures or catalog completeness checks.

## Validation completed locally

- Unit regressions: 7 passed, including date-only stability, New York/London DST transitions, currencies JPY/SAR/KWD, negative rounding, safe-integer precision, delegation/role denial, catalog/placeholder completeness and HTML escaping.
- PostgreSQL integration: effective instant boundaries, campus inheritance, legacy and changed weekend dates, finance gate, tenant denial, notification rendering/persistence with NO_RECIPIENT. Fixture rows are scoped to a disposable local database.
- Browser matrix: 11 roles × 1440/768/390px = 33 checks; Arabic settings RTL, allowed controls, vendor denial, no horizontal overflow. These checks cover the locale settings screen, not unimplemented whole-workspace Arabic coverage.
- Browser workflow: signed Arabic preview, PDF print, apply to FINANCE_REVIEW, independent accountant approval, original School.timezone unchanged.
- Arabic browser-print PDF and actual invoice renderer PDF inspected visually and by text extraction, including Latin IDs and Arabic/Western digits.
- TypeScript no-emit and focused ESLint pass at the recorded implementation point; rerun after subsequent edits.

## Local reproduction

Use only a disposable PostgreSQL instance at `127.0.0.1:55401/sko201`, with `DATABASE_URL` and `DIRECT_URL` explicitly set to that instance. The fixture and database harness refuse other addresses. Do not copy production `.env` files.

1. Apply committed migrations to the empty local database and run `prisma generate` in isolated dependencies.
2. Run `npm run test:locale` and `npm run test:locale:db`.
3. Run `node --import tsx tests/locale/fixture.ts` with the local database variables.
4. Run Next on port 3201 with the local database variables and `AUTH_SECRET=local-sko201-fixture`.
5. Run `tests/locale/browser-check.ts`, then `tests/locale/preview-check.ts` with `node --import tsx`.
6. `tests/locale/invoice-pdf-check.ts` writes a synthetic PDF to `/tmp/sko201-evidence`; inspect with Poppler.
7. Stop the app, drop only the disposable local database, and stop the local PostgreSQL instance.

No remote database writes, emails, payments, AI calls, merges to shared branches or deployments are part of this verification.

## Completion work after expanded English / Arabic / Urdu requirements

- Added Urdu settings, invoice, academic report and all ten notification-template catalogs plus RTL email framing. Report font caches are separated by language after a repeated-render regression; six consecutive English/Arabic/Urdu renders passed. Urdu invoice/report visually reviewed with Latin IDs and Arabic digits; report remains one page.
- Added validated PK/SA/AE/KW/OTHER location choices and default PKR/SAR/AED/KWD/USD mapping (Dubai normalization maps AE). Unknown new locale defaults to USD. Preview derives country currency server-side and requires currency delegation plus independent finance review.
- Future exam preview reads actual scoped scheduled papers and their local period start times, showing before/after UTC interpretations. Dates/local times remain stored unchanged. DST gaps/overlaps are explicit. Two-zone DST tests pass.
- Added immutable currency identity to monetary sources and ledger. Original legacy records remain PKR. Invoice generation copies source currency; cross-currency discounts, carry-forward, late fees and overpayment credit are refused. Payment collection uses invoice precision and posts its currency to ledger.
- Actual invoice/fee collection displays and CSV amounts use record currency minor units. Ledger/profit and fee-summary reports filter currency, with selectors. PKR-only gateway rejects other invoice currencies.
- Fresh localhost migration replay passed baseline, locale, report snapshot, money identity and outbox migrations. Real KWD payment/ledger and database immutable-currency checks passed. Policy/notification persistence passed after USD default change.

Still in progress: full shared/role UI translation coverage and missing-key gate; remaining legacy financial editing/statement surfaces; complete three-language real workflow preview/role/browser coverage; final production build and recovery checks. The PR remains draft and Linear remains In Progress until these are completed.
