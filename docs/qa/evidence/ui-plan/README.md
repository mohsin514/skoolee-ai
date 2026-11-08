# UI implementation evidence

Branch: `codex/ui-shared-foundation`. Starting source commit: `bcd66035365201e90f9768dcfd612771cceab0aa`. Only synthetic browser fixtures are used. This records implementation increments, not full-app acceptance.

## Current application-wide adoption

Shared UI adoption now covers the entire source inventory: 84 pages, 14 layouts, 11 loading views, 12 error boundaries, one not-found view, the 99 console views and their component dependencies. The production build enforces adoption with zero per-file exemptions. [Current report and validation](whole-app/REPORT.md) supersede the historical adoption failures and pending source migration notes in the increments below. Final verification: **211 browser cases passed**, **97 adoption/navigation/component contracts passed**, and **29 locale/table/copy contracts passed**. Production build, TypeScript and ESLint for 232 changed/new files passed. Full runtime acceptance remains separate and is explicitly tracked.

## Increment 1: shared foundation

| Slice | Implemented | Evidence and limits |
| --- | --- | --- |
| A | Semantic panel/workspace geometry, shadow and motion tokens; corrected border cascade; reviewed visual baselines | [Report](foundation-a/REPORT.md). English reference and RTL geometry; full AR/UR reference remains outstanding. |
| B | Compatible field ID scopes, caller ARIA preservation, scoped error-summary focus, campus Today date selection | [Report](foundation-b/REPORT.md). Scoped IDs are opt-in to preserve existing focus callers. |
| C | Shared busy dismissal policy, safe initial confirmation focus, trapped dirty confirmation, backdrop/drag fixes | [Report](foundation-c/REPORT.md). Background inertness and real-page adoption remain outstanding; translated internal chrome is covered in the follow-up below. |
| D | Table header/sort/selection semantics, native keyboard row actions, full narrow heading wrapping | [Evidence folder](foundation-d/). Synthetic EN/AR/UR table composition; real consumers still need route checks. |
| E | One AppToaster, CSS-owned status appearance, document-locale labels, navigation-breakpoint clearance, existing safe-area utility | [Report](foundation-e/APP_TOASTER_REPORT.md), [baseline](foundation-e/REPORT.md). Phone toast can still cover body content; footer checks do not prove universal no-overlap. |

Integrated verification:

- `TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts --output test-results/foundation-integrated`: **46 passed**. Actual-app reference/field/toast checks plus isolated shared-component fixtures.
- Node tests for table contracts, navigation/access recovery, locale package and locale copy coverage: **21 passed**.
- `npx tsc --noEmit --incremental false`: **passed**, including a final check after integration.
- Targeted ESLint over changed production files and root specs: **passed**; agents separately linted their new fixtures/specs.
- `npm run build`: **passed**, including Prisma generation, commercial-contract check, optimized Next compilation and route generation. Sandbox IPC restrictions required the authorized escalation; no database reset or migration was run.
- Diff whitespace checks: **passed**.
- The two broad adoption guards remain **failing on existing app-wide debt**. HEAD and working-tree logs are saved in A; no exemptions were added. Their displayed violation signatures matched before the next route batches.

The locale copy guard initially failed. Added missing Urdu keys for Audited support access approvals/Reconciliation and Arabic/Urdu Resolve as unmatched, preserving existing terminology; the coverage guard now passes. This is catalog coverage evidence, not native-speaker review or every-page localization acceptance.

Two reference snapshots were updated only after inspecting their actual/diff images. Changes reflect intended explicit borders and the existing Record corrections entry absent from older snapshots. Soft screenshot assertions retain failures while allowing recovery interactions to continue; the final suite passes both visual and interaction assertions.

No real route is marked fully PASS against the entire required matrix. R040 (development reference) and L05 (root layout) are PARTIAL. Physical mobile safe-area/keyboard behavior, screen readers, other engines, full dark mode, all menus/chat/overlays and real role/data contexts remain tracked acceptance work. No business logic or persistence contract was intentionally changed.

## Following batches

AUTH-PUBLIC begins with login/invitation, registration and password recovery in separate agent-owned files. Remaining route/view statuses live in [the checklist](../../../ui-plan/route-checklist.md); shared fixture checks never automatically clear those rows.

## Increment 2: shared overlay locale and AUTH-PUBLIC adoption

- [Shared overlay locale](overlay-locale/REPORT.md):22 focused tests passed, including translated AR/UR framework chrome and EN/AR/UR logical action alignment. Authored page content is not translated by this helper.
- [Login and invitation](auth-login-invite/REPORT.md):31 focused tests passed, with synthetic authentication/invitation responses and bounded actual-route checks. Includes visible cold-load query feedback.
- [Password recovery](auth-password-recovery/REPORT.md):9 focused tests passed, including persistent focused failure feedback and retryable link verification. No real credential change.
- [Registration](auth-register/REPORT.md):11 focused tests passed, including both registration types and pending-state controls. All account writes were intercepted.
- [First login](auth-first-login/REPORT.md):12 focused tests passed; password policy, payload and role landing behavior preserved with synthetic responses.
- [Account protection](auth-protect-account/REPORT.md):16 focused tests passed; shared controls, translated feedback and busy locks. No real MFA enrollment or challenge performed.
- [Verification success](auth-verification/REPORT.md):12 focused tests passed; reachable narrow-screen content, countdown, manual login and reduced motion. No activation request performed.
- [Public routing](auth-routing/REPORT.md):7 focused tests passed; existing verification success and sign-in alias are reachable anonymously while adjacent protected paths remain gated.
- [Pricing](pricing/REPORT.md):3 focused tests passed across EN/AR/UR and four widths; shared controls and unchanged catalogue values checked. Shared RTL picker chevron corrected from actual Urdu review.
- [Six product pages](product-pages/REPORT.md):6 route-specific tests passed; nested interactive CTA markup removed, shared navigation/actions/panels adopted.
- [Four trust pages](trust-pages/REPORT.md):4 route-specific tests passed; shared navigation/panels and reduced-motion background checked. Policy text unchanged.
- Node contract/navigation/locale tests including commercial contract:29 passed.

These are scoped checks, not full-app completion. Catalogue copy remains partially English; most auth/public pages still need full AR/UR content work and broader device/accessibility acceptance. Final repository-wide build and TypeScript checks passed after the auth agents finished. Existing app-wide adoption debt remains tracked; no broad exemption was added.


## Final integrated verification for these increments

- Browser suite: **176 passed (2.6 minutes)**, including shared controls, overlays, tables, auth/public routes, responsive layouts and scoped EN/AR/UR checks. Run log (generated artifact removed during merge cleanup).
- Node contract/navigation/locale/commercial tests: **29 passed**.
- Production build and TypeScript: **passed**. Build log (generated artifact removed during merge cleanup), type-check log (generated artifact removed during merge cleanup).
- Targeted ESLint and diff whitespace checks: **passed**.
- Shared semantic links now receive hover/press states; reduced motion suppresses press scaling. Shared confirmation action palettes were measured for normal/hover label contrast; details remain in the overlay report.
- The two repository-wide adoption guards still fail on untouched app-wide debt. This remains a migration task, not a passing result; no exemption was added (the migrated MFA exemption was removed).

Auth/public/reference route rows remain **PARTIAL**, including verification success. Onboarding and role workspaces still require their planned migration and page-specific checks. Background overlay inertness, full localization, physical devices and screen-reader acceptance remain outstanding.
