# SKO-201: locale package implementation and verification

English, Arabic and Urdu are supported in locale settings, shared role navigation/account controls, school settings, the fee/accounting workflow, family fee and attendance views, report review, notifications and printed invoice/report/receipt workflows. Authored names, notes, identifiers and approved remarks retain their original content. Translation fixtures and automated coverage are engineering checks, not independent native-language approval.

## Policy and financial behavior

- Append-only school/campus policies resolve by effective timestamp. Group administrators own school defaults; standalone administrators omit group hierarchy. Campus principals can change only explicitly delegated keys. Current database identity is rechecked on writes; vendor owners cannot change tenant policy.
- Personal en/ar/ur preference controls interface direction and copy. Signed, expiring previews bind the user, proposed values and current policy revision. Effective dates explicitly begin at 00:00 UTC. A different accountant must approve a currency change.
- Validated locations default PK to PKR, SA to SAR, AE (including Dubai imports) to AED, KW to KWD, and OTHER/unknown to USD. Location changes do not relabel or convert existing money.
- Currency identity is captured on fee sources, invoices, discounts, carry-forward, bank accounts and ledger entries. Database triggers prevent changing posted monetary identity. Cross-currency invoice additions and totals are rejected or explicitly filtered. Family fee pages select one currency; dashboards filter a declared currency; the group overview uses the school policy currency.
- Minor-unit precision is pinned independently of runtime CLDR data: PKR/SAR/AED/USD have two places, KWD three, JPY/KRW zero. Decimal parsing uses integer arithmetic and explicit half-away-from-zero rounding. This fixes a real Node/browser PKR precision disagreement found by bank-import testing.
- Payments, bank reconciliation and receipts use original invoice currency. Online gateway collection remains explicitly PKR-only. No foreign exchange is implemented.
- IANA zones, configurable week/weekend and Gregorian/ISO calendar display are validated. Birthdays/attendance remain date-only. Instant formatting uses the policy timezone. Future exam previews use real scoped papers and expose DST gaps/overlaps without rewriting stored dates or historical timestamps.

## Verification evidence

All tests use disposable local PostgreSQL at port 55401 and local Next at port 3201, with no remote credentials or outbound email/payment/AI calls.

| Acceptance area | Evidence |
| --- | --- |
| Locale inheritance, delegation, effective boundary, independent finance approval | package/database tests and actual signed-preview browser workflow |
| Same canonical values in interface, print and notification previews | shared workflow samples and snapshot-preservation assertions |
| Three languages and layouts | 99 locale-setting role/language/width combinations; 11 actual Urdu role dashboards/account forms at three widths |
| Financial workflow UI | Six finance screens × three languages × three widths; keyboard date selection and 200% dialog checks; zero detected explicit missing keys |
| Family financial identity | Student/parent × three languages × PKR/KWD/AED × three widths; displayed totals contain only selected currency |
| Date-only stability | Student/parent attendance in all three languages under Pacific/Honolulu and Pacific/Kiritimati; October 1 remains October 1 |
| Currency precision and storage | Zero/two/three-place tests, immutable currency DB trigger test, real KWD payment/ledger and bank opening balance, bank/ledger currency mismatch rejection, PKR/KWD/AED bank matching without payment side effects |
| DST and future events | New York/London gap/overlap tests; actual exam preview and independent finance review |
| Real notification paths | Persisted en/ar/ur report communications with NO_RECIPIENT; recipient-locale help and original IDs preserved |
| PDF shaping and identity | Invoice, report-card, class-grade and receipt renderers; repeated en/ar/ur output, Poppler extraction and Arabic/Urdu visual inspection; original marks, notes, dates and monetary amounts preserved |
| Release checks | TypeScript and locale/copy tests passed; final production build and updated-head CI recorded in the PR |

The catalog gate checks both languages and placeholder parity for explicit workflow keys. Runtime development diagnostics report missing keys rather than silently hiding coverage gaps. The source gate covers the workflow components named in `tests/locale/ui-coverage.test.ts`.

Representative synthetic artifacts are committed in [evidence](evidence/): Arabic invoice/class grades, Urdu report/receipt, Urdu phone finance and 200% bank-date dialog. All names and contact details are disposable test fixtures.

## Reproduction

Use only a disposable `sko201` or `sko201_replay` database on `127.0.0.1:55401`, with DATABASE_URL and DIRECT_URL explicitly set. Never copy a production .env into the worktree.

1. Apply all migrations to the empty database and generate Prisma in isolated dependencies.
2. Run `node --import tsx --test tests/locale/{package,country,events,ui-coverage,database,money-database}.test.ts`.
3. Run `tests/locale/fixture.ts`; start Next on port 3201 with `AUTH_SECRET=local-sko201-fixture`.
4. Run browser checks sequentially because role-language fixtures are shared: `browser-check`, `preview-check`, `header-browser-check`, `finance-browser-check`, `portal-browser-check`, `attendance-browser-check` `bank-import-check` and `bank-account-check` (all under `tests/locale`, using tsx).
5. Run the invoice/report/receipt PDF scripts, then inspect `/tmp/sko201-evidence` using Poppler.
6. Stop the local app before building. Delete only task-scoped fixtures/databases and stop the task-owned local PostgreSQL instance afterward.

External Vercel demo/dev checks reported a build quota limit at checkpoint f2b7743; GitHub recovery and outbox checks passed there. The PR records final-head status separately. No merge, production migration or deployment is included in this task.
