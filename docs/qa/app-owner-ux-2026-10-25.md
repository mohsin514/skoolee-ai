# App owner UX and functional validation — 25 October 2026

Branch: `codex/app-owner-ux-validation`

The owner console's 11 views were reviewed and exercised in an isolated local environment. The final runs passed **21/21 UX groups** and **45/45 existing HTTP/browser acceptance checks**. The changes below fix defects reproduced during that review. This report describes the tested coverage; it does not certify every possible input, integration, or production condition.

Generated screenshots, CSV downloads and result files were removed after review at the user’s request. The regression suite regenerates its evidence under ignored `test-results/owner-ux/`; the existing acceptance suite writes to `test-results/owner-audit/`.

## Fixes

| Area | Defect and resulting behavior |
| --- | --- |
| Pricing | Blank school prices now retain inheritance instead of becoming unintended overrides. Decimal prices save correctly. Default pricing cannot be saved before a successful load. Stale default edits return a conflict and offer reload. Delayed school responses cannot overwrite the latest selection. |
| Provisioning | Long forms have one scrolling body and a pinned footer. Cancel says Cancel. Saving prevents duplicate actions or closing the dialog. Passwords require eight characters; school/campus context is preselected where possible; administrator role labels reflect their scope. Clipboard failures are visible inside the credential dialog, with credentials hidden initially. |
| Tenant users | Failed school-list loading provides an inline retry and prevents an incomplete Add user flow. Tablet layouts use cards so user actions remain accessible. |
| Support | The action selector and submitted action now agree: Write displays its required fields. Duration is validated. Ending access refreshes the grant screen immediately so the owner can continue through closure. |
| School suspension | An owner can suspend and restore the institution attached to their own account without entering a redirect loop. The operational layout follows the existing owner exemption; the welcome endpoint allows authenticated access to the caller's own preferences during suspension. Tenant operational restrictions remain in place. |
| Pilots | Delayed detail responses cannot replace the selected pilot. Forms reset between pilots. Creation waits for required list data. Errors appear inside the open dialog and scroll into view; failed submissions retain entered values. Evidence fields show their requirements. |
| Capacity | Limits require finite integers in range; scoped policies require a future expiry. Failed saves retain input and display their error inside the dialog. Saving prevents repeat actions. Empty failing-workload lists are explicit. |
| Subscription/provider review | Refresh updates both queues. Refresh failures remain visible after an earlier successful load, and stale actions are withheld until retry succeeds. |
| Payment settings | Refresh failures remain visible even when older settings are already displayed. |
| Languages | Added Arabic/Urdu copy for new error and recovery states, and aligned conflicting AI Workflows translations. |

## Executed coverage

Browser actions used real local endpoints and database persistence checks. Selected responses were intentionally delayed or replaced with HTTP 503 errors to test races, recovery and preservation of input. The support browser test seeds approval; the separate acceptance suite executes the school approval endpoint.

| View or flow | Checks performed |
| --- | --- |
| Schools | List/details/tabs; standalone and group provisioning; plan confirmation/cancel/save; AI live acknowledgement/on/off; suspend and restore, including the owner's own institution; archive confirmation and restoration through the API; generated handoff completion and replay protection. |
| Tenant users | School filter and isolation; preselected context; all eight staff roles through the API; duplicate rejection; short-password rejection; failed creation/retry; successful creation; clipboard failure; password-history rejection, session revocation and required password replacement. |
| Subscription requests | Approval cancellation; grace approval and duplicate-review rejection; decline reason persistence; both review queues refresh and recover from failure. |
| Pricing | Default/override save and reload; invalid payload rejection; decimals; clear override to inherit; null defaults; load failure/retry; concurrent default edit conflict/reload; delayed school selection response. |
| Payment gateways | Bank validation/save/reload and redacted audit entry; settings display. |
| Plans & revenue | Statistics/report reads, responsive display and CSV download. |
| Support access | Request validation/pending grant; approval boundary; approved start; scoped read; queue/apply write; end session; close grant; out-of-scope refusal; platform operations denied during support. |
| Audit | Read, paging/date validation, responsive display and CSV download. |
| Sessions | Active/expired filtering; cancellation and actual termination; password-reset revocation. |
| Pilot evidence | Create with failure/retry; delayed selection; consent and aggregate permission; start/close; observation/measurement validation and persistence; unsupported synthetic claim refusal, return for revision and export. |
| Capacity | Report; limit/expiry validation; failed save/retry; scoped policy apply/revert; CSV download. |
| Entry and AI handoff | Actual password sign-in/MFA deferral; owner AI sidebar navigation; prepared-school handoff populates the form, provisions once and completes its workflow. |
| Access boundaries | School administrators denied on all 14 owner read endpoints exercised by the acceptance suite. |

## Screenshot evidence

The completed run captured and reviewed **89 screenshots**, including a 55-image layout matrix: all 11 views at English desktop **1440px**, tablet **768px**, mobile **390px**, and Arabic/Urdu mobile **390px**. Additional screenshots capture long-page lower sections, confirmations, validation errors, retry states, provisioning receipts and completed support/pilot actions. The test asserts no document-level horizontal overflow and no uncaught browser errors. Desktop, mobile and RTL contact sheets and selected action screenshots were visually inspected. Gallery links and filters also passed a browser check.

Screenshots use synthetic records; temporary-password inputs are masked. A magenta mask may overlap a clipped, offscreen input's bounding box in a scrolling dialog. Five real CSV downloads were also checked. This is coverage of sampled screen states, not a screenshot of every possible state combination.

## Validation results

| Check | Result |
| --- | --- |
| Existing owner HTTP/browser acceptance | 45 passed |
| Expanded owner UX browser suite | 21 passed |
| Owner helpers/navigation, commercial contract/console, pilot findings | 24 passed |
| Authorization suite | 110 passed, 2 skipped, 0 failed |
| UI adoption checks | 8 passed |
| Locale catalog conflicts/precedence | 6 passed |
| Source and owner-test TypeScript | Passed |
| ESLint on changed source/test files | Passed |
| `git diff --check` | Passed |

The two authorization skips remain skips, not passes. A production build and deployment were not performed in this pass.

## Reproducing the checks

The local PostgreSQL database `owner_audit_20261024` must already exist with the application schema. These runners deliberately refuse another database or auth secret. They retain synthetic fixtures for inspection. Do not point them at application data. Start a dedicated server on port 3094:

```sh
DATABASE_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024?connection_limit=3' \
DIRECT_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024' \
AUTH_SECRET='synthetic-owner-audit-only-20261024' \
NEXT_PUBLIC_APP_URL='http://127.0.0.1:3094' \
NEXT_BUILD_DIR='.next-owner-audit' STRIPE_SECRET_KEY='' RESEND_API_KEY='' \
npm run dev -- --hostname 127.0.0.1 --port 3094
```

Run each browser suite sequentially with the same synthetic settings:

```sh
DATABASE_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024' \
AUTH_SECRET='synthetic-owner-audit-only-20261024' \
node --import tsx tests/owner/acceptance.ts

DATABASE_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024' \
AUTH_SECRET='synthetic-owner-audit-only-20261024' \
node --import tsx tests/owner/ux.acceptance.ts

NODE_OPTIONS=--max-old-space-size=8192 npx tsc --project tsconfig.owner-audit.json --noEmit --pretty false
npm run test:authz
npm run check:ui
node --import tsx --test tests/owner/helpers.test.ts tests/owner/navigation.test.ts tests/commercial/owner-console.test.ts tests/commercial/contract.test.ts tests/pilots/findings.test.ts
node --import tsx --test tests/locale/catalog-conflicts.test.ts tests/locale/catalog-precedence.test.ts
git diff --check
```

## Remaining integration limits

Live Stripe onboarding, charges/refunds, settlement and webhook delivery, email delivery, and external model output quality were not exercised. The provider-event test records a resolution note without invoking payment providers. Pilot tests validate synthetic evidence handling and refusal of an unsupported claim, not approval of a real public claim. Capacity policy controls were tested; production load objectives were not benchmarked. Emergency support, every support data domain, every locale/device/browser combination and concurrent lifecycle operations are outside this run. No production data was changed or deployment performed.
