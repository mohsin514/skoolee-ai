# Registration UI batch — R006

2026-10-08. Scope: `src/app/(auth)/register/page.tsx`, new tests in `tests/design-system/auth-register/`, and this evidence folder. No shared component, global style, catalog, layout, endpoint, schema or policy edits.

## Baseline and bounded changes

The actual local `/register` page was inspected with every POST blocked. No valid registration was sent. `baseline-observations.json` and the two `baseline-*.png` captures record:

- ArrowRight did not change the role-radio selection, and both options remained in the Tab order.
- Empty submit left focus on Submit and the empty name field `aria-invalid=false` with no linked error. Phone help had no description association.
- The country select had its own focus ring recipe. Password controls shared the same name without controlled-field or pressed state.
- Auto/Manual targets were 21.5px high.
- At 320px the document was 374px wide; the account-step logo/progress row exceeded its container.

The page now uses shared Select, FormField and InputGroup appearance, with shared Button variants for Continue, Back, Create Account, Auto/Manual, regenerate and reveal controls. The login CTA remains a Link styled through `buttonVariants`. Specialized institution radio cards and the existing native consent checkbox retain their contracts. Radio arrow navigation wraps and only the selected option is tabbable. Errors use the existing rules, appear after blur/submission and remain associated with their fields. Invalid submit focuses the first failing field; server failure focuses the persistent alert. Password reveal buttons distinguish their fields and expose state, and the checklist describes both password fields.

The mobile account header stacks logo/progress; Auto/Manual now have at least 44px targets after the existing entrance animation settles. Current progress is identified programmatically. `after-errors-{320,390,768,1440}.png` captures the resulting field error state.

## Pending-request safeguard

`busy-baseline.json` records a separate synthetic delayed request reproduction: the name input and Back remained enabled, and Back returned to institution choice while signup-step1 was pending. Header Back now disables while loading, and a native disabled fieldset holds editable setup controls, ID mode, consent, reveal controls, inner Back and Submit steady during the existing request. The submit handler also ignores another submission while loading. Failure re-enables the form with values intact. The request sequence and server policy are unchanged.

## Behavior preserved

All three wizard steps and both institution types remain. Name/institution/ID length rules, email expression, password composition/matching, explicit consent, generated ID prefixes/uppercase manual IDs, country/currency text and all policy links remain. The two original POST endpoints, order and payload fields remain. Password values are unchanged; tests retain only a boolean match when recording synthetic payload metadata. Warning toast, verification instructions and `/login` links remain. This file has no persisted draft hook, invitation context or provider event workflow to migrate.

## Verification

- `npx playwright test --config tests/design-system/auth-register/playwright.config.ts`: **11 passed** against the real local frontend, after final shared Button adoption and busy guards.
- Focused ESLint and `git diff --check`: **passed**.
- Cases: radio keyboard/Back/value retention; empty/malformed validation and focus; helper descriptions/shared Select; independent reveal; composition/matching/consent gates; country/manual/auto ID; mocked duplicate identity and signup failure/retry; delayed mock success for both types with unchanged payloads, disabled editing/navigation and no duplicate request; initial/account error layout at 320, 390, 768 and 1440px.

Every test intercepts signup POSTs with synthetic replies and aborts every other POST before it reaches the server. This proves frontend rendering/recovery and request-shape compatibility; real registration, email delivery and account verification are **UNVERIFIED**. No accounts, invitations or emails were created. Passwords/emails in the fixture are synthetic. Existing consent decoration required keyboard Space in the fixture; a direct click on the visually hidden input was an invalid harness interaction. Geometry checks wait for the existing Framer entrance to settle.

Remaining scope: the page remains English-only as before; translated registration copy, actual device keyboard/autofill, screen-reader operation, second browser engines, zoom/forced-colors, interruption by browser navigation, and all backend integration states are not certified by this batch. The tests use a reduced-motion browser preference but do not certify every existing Framer animation honors it. Root consolidates global typecheck/build/adoption checks; this slice ran no additional server or global build/typecheck. Current AGENTS.md, the installed Next forms guide and the route/execution plan were read.
