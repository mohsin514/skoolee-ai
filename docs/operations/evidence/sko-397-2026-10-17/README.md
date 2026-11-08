# SKO-397 [023] Guided school setup and import reconciliation — QA 17 October 2026

## Audited first (kept, built on)
SKO-391 institution setup state (adoption mode, `unresolvedOptionalWork`, setup delegate), staged import batches
and receipts, guided AI setup interview (`/ai?setup=1`), Academic Hub progress.

## Built
| Need | Implementation |
| --- | --- |
| Persistent readiness checklist that follows the school's own configuration | `src/lib/readiness/checks.ts`: campus, explicit locale (not the platform default), active cycle + first class, staff, roster, imports, guardians and fees (full operations only), first-class rehearsal. Each check carries its evidence and a fix link |
| Reconciliation before start | `src/lib/readiness/service.ts` reads every non-expired import batch: source rows vs accepted/rejected/unresolved, unknown-class rows (from the staging error), staged batches block go-live; live pupils, pupils without a verified guardian, opening balances |
| Practice mode that cannot send or charge | The rehearsal is a read-only preview over the real configuration with labelled synthetic learners (attendance register, assessment subjects, family view). Only the step time is stored; a DB test proves no attendance, notification, parent communication, payment, ledger, exam or invoice rows are created |
| Readiness approval | `school_readiness` (one per school): lead only (owner, group super admin or SKO-391 setup delegate), version-checked, checks re-evaluated at approval, records approver, time and evidence incl. every open follow-up; migration guard makes a recorded approval immutable |
| Optional work with owners | `readiness_tasks`, seeded from onboarding's unresolved optional work; lead assigns owners; assigned staff see and close only their own |
| Entry points | Onboarding completion now lands on `/setup/readiness`; Academic Hub links to it; it links on to guided AI setup |

Migration `20261017140000_school_readiness` applied to the isolated QA DB and to dev Supabase (up to date, no drift).

## Results
| Check | Result |
| --- | --- |
| `tests/readiness/checks.test.ts` | **4/4** |
| `tests/readiness/readiness.database.test.ts` (55438) | **5/5** |
| `tests/readiness/readiness.browser.test.ts` (55438 / app 3107) | **4/4** |
| `tests/onboarding/setup-state` + `setup.database` (55470) | **20/20** |
| `npm run test:school-ai` | **358/358** |
| `npx tsc --noEmit`, eslint on touched files | clean |

## Boundaries
- Guardian, staff and opening-balance imports do not exist as ImportBatch kinds yet; they are reconciled from live records (guardian links, carry-forward balances), not from source files.
- The rehearsal is a preview; it does not create a sandbox copy of the school.

## Screenshots (also attached in Linear)
`readiness-setup-en-1440.png`, `readiness-practice-family-en-1440.png`, `readiness-approved-en-1440.png`,
`readiness-teacher-task-en-390.png`, `readiness-owner-ar-390.png`, `readiness-delegate-ur-390.png` — synthetic data only.
