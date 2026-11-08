# SKO-387 [011] Package comparison, trial and checkout during registration — QA 17 October 2026

## Existing foundation (verified, not rebuilt)
Versioned catalogue and idempotent checkout intents (`src/lib/billing/checkout-intents.ts`),
`/onboarding/package` and `/onboarding/package/status`, owner/delegated-buyer checks, settlement only from
verified provider webhooks, onboarding routes allowed while setup is incomplete.

## Gaps closed in this pass
1. **Regional payment routes** — `src/lib/billing/payment-routes.ts`. The catalogue is priced in PKR and the
   configured rails (SafePay, PK bank account, PKR Stripe prices) are only validated for Pakistani schools.
   The package API now returns `country`, `salesAssisted` and only regionally valid `paymentMethods`;
   checkout for a non-PK school is refused (409) before any provider call. The page offers
   "Request a custom quote" with an EN/AR/UR explanation instead of a dead checkout button. The free path
   stays available everywhere.
2. **Over-limit campuses kept as drafts** — `src/app/onboarding/page.tsx`. Adding a campus beyond the current
   package no longer discards it with an error toast; it is saved in the draft list, a persistent notice links
   to package comparison with the planned campus count, and launch is held until a fitting package is chosen
   (the server still enforces capacity via `assertPlanCapacity`).

## Results
| Check | Result |
| --- | --- |
| `tests/checkout-intents/domain.test.ts` + `payment-routes.test.ts` + `tests/commercial/contract.test.ts` | **15/15** |
| `tests/commercial/contract.database.test.ts` (55411/sko211) | **3/3** |
| `tests/checkout-intents/onboarding-package.browser.test.ts` (55438/postgres, app 3107) | **4/4** |
| `npm run check:commercial` | pass |
| `npx tsc --noEmit`, eslint on touched files | clean |

Browser coverage: Saudi owner at 1440 and 390 px sees quotes for paid tiers, no checkout button, free path,
no horizontal overflow, and a direct BASIC checkout POST returns 409; Arabic owner sees the RTL regional note
at 390 px; Pakistani owner keeps automated routes (only Enterprise is a quote); a second campus on a
1-campus package is kept as a draft with a "Compare packages" link carrying `campuses=2`.

## Screenshots
`package-sa-en-1440.png`, `package-sa-en-390.png`, `package-sa-ar-390.png`, `package-pk-en-1440.png`,
`onboarding-campus-draft-1440.png` — synthetic owners only.

## Boundaries
- No real payment provider was called; provider settlement paths are covered by existing intent tests.
- Non-PK automated checkout stays off until regional prices and payment rails are approved.
- Observed, pre-existing (SKO-388 area): the onboarding draft-recovery banner renders behind the header.
