# AUTH-PUBLIC — login and invitation control adoption

Date: 2026-10-08. Scoped routes R004 `/login` and R001 `/accept-invite`. Shared working tree includes concurrent foundation/recovery work. **Implemented and focused checks pass; route-wide acceptance remains PARTIAL.**

## Scope, baseline, and implementation

Only the two page files and new tests/evidence were changed by this batch. Read `AGENTS.md`, installed Next accessibility, Server/Client Components, CSS, forms, useRouter/useSearchParams guides, and the plan's component/route/execution contracts before changes. No action, endpoint, validator, layout, shared primitive, authorization rule, or translation catalog was edited.

Read-only local baseline at 390×844 confirmed that empty login marked both fields invalid without `aria-describedby`; no login request occurred. The original registration order also focused Password before the first invalid Work Email field. Invitation's language selector was a raw 44px native control with its own focus outline; switching to Urdu left the missing-token notice in English despite an existing translation. Baseline screenshots and `baseline/observations.json` preserve these observations. Two initial synthetic acceptance tests failed on missing descriptions and the nonshared Select as expected.

Login now links inline errors and Caps Lock feedback to their controls, registers fields in visual order, exposes password reveal state/control association, focuses a server-error summary or the newly opened school-choice heading, and marks busy states. Standard sign-in/back buttons use shared Button. Shared InputGroup owns affix positioning and focus; existing intentional blue/pink surfaces remain. Status error copy uses shared status tokens. The specialized school-choice cards and visually hidden remember checkbox retain their native contracts.

Invitation now uses shared Select and the shared reissue/submit buttons, removes redundant input appearance/focus forks, uses the existing translated missing-token notice, associates password requirements with both inputs, supplies `autocomplete=new-password`, exposes the reveal toggle's state and both controlled fields, and focuses the persistent submission-error summary.

A further actual direct-load check found `/login?verified=true` cleared its query while showing no toast: the page's effect emitted before the sibling root toaster subscribed. The page now schedules the existing query notice and URL cleanup one task later and cancels a superseded timer. Message text, priority, and 8000ms duration remain unchanged. Actual direct load and all three synthetic notice variants pass after this fix. Cleanup now removes only status/error parameters and preserves unrelated parameters such as `redirect`; it does not use that value as a navigation destination.

An additional direct local baseline confirmed `/login?error=Invalid%20verification%20link` displayed no error. The page now recognizes the four existing verification-endpoint errors (`Invalid verification link`, `This verification link is invalid or has expired`, `User not found`, `Verification failed`) and presents the matching plain string in its persistent focused error summary. Unknown/empty error values use fixed generic guidance rather than arbitrary URL text. The existing verified → invitation accepted → session-expired priority is retained ahead of an error when multiple status parameters occur. The endpoint itself was only read; no verification request or activation ran. Baseline `verification-error-ignored.png` and final `after/verification-error-focused.png` capture the actual direct URL.

All existing auth fetch/action calls, payload fields, password requirements, invite context identity, statuses, cooldown interpretation, remember choice, success delays, and landing paths remain unchanged. No real credentials or invitation secret was used. No real authentication, accept-invite, or reissue action was executed.

## Tests and evidence boundaries

New files:

- `tests/design-system/auth-login-invite.fixture.tsx`: imports the actual pages; replaces fetch and the invitation Server Action with explicit synthetic responses; records only fixed synthetic payloads and navigation destinations.
- `tests/design-system/auth-login-invite.spec.ts`: synthetic behavior contract and responsive field checks. Browser network is blocked; router/Link/LocaleProvider and CSS-module imports are replaced. Current global CSS and real shared controls/toaster are used. These screenshots do not establish root font, decorative logo/image appearance, actual authorization, cookie/session behavior, or real Server Action integration.
- `tests/design-system/auth-login-invite-live.spec.ts`: real local page integration with empty login, no-token invitation, and verified-query feedback. Mutating auth/invite requests are blocked defensively and asserted absent for the invalid/no-token checks. Actual root font, app CSS, images, and toaster are present.

```text
TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts auth-login-invite.spec.ts auth-login-invite-live.spec.ts --output test-results/auth-login-invite --reporter=list
31 passed (24.2s)

npx eslint 'src/app/(auth)/login/page.tsx' 'src/app/(auth)/accept-invite/page.tsx' tests/design-system/auth-login-invite.fixture.tsx tests/design-system/auth-login-invite.spec.ts tests/design-system/auth-login-invite-live.spec.ts
PASS (exit 0)

git diff --check -- [same scoped page and test files]
PASS (exit 0)
```

After the verification-query follow-up, the affected query cases were run separately:

```text
TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts auth-login-invite.spec.ts auth-login-invite-live.spec.ts --grep 'verification|unknown query|synthetic login notice|real direct' --output test-results/auth-verification-query --reporter=list
10 passed (6.1s)
Scoped login/spec ESLint and diff check: PASS
```

This focused follow-up includes four known errors, unknown HTML-like query text with a safe fixed fallback, simultaneous status priority, unrelated redirect-parameter preservation, actual direct error focus, and the existing cold-load notice cases. The root agent owns the later aggregate rerun.

Chromium required the already authorized local process escalation. Tests use configured reduced motion. A test-only correction clicked the visible remember label instead of its visually hidden checkbox; another scoped the alert locator to main to exclude Next's route announcer. Neither required a product workaround. The coordinating agent owns repository-wide type/build/adoption checks.

## Case matrix

| Route/state | Environment and coverage | Result |
|---|---|---|
| Login empty/invalid, first invalid focus, reveal toggle | Actual local route 390×844, 768×1024, 1440×1000 EN; synthetic 390×844 | PASS; linked messages, email focus, pressed state, no authentication request, no page overflow |
| Login server error, cooldown, retained input, remember | Synthetic 429 with Retry-After 2, 390×844 EN | PASS; summary focus; disabled countdown then retry; exact first-pass payload retained |
| Login school choice and pending second pass | Synthetic school response + delayed second result, 390×844 EN | PASS; heading focus, choices/back disabled while busy, same credentials plus exact schoolId; teacher destination |
| Login pending and success handoffs | Synthetic MFA, must-change-password, incomplete teacher onboarding, ordinary parent cases | PASS; disabled pending; `/protect-account`, `/first-login`, `/teacher-onboarding`, `/parent` captured without real navigation/session creation |
| Login query notices | Synthetic verified/invite accepted/session expired; actual verified cold load | PASS; original message and cleanup to `/login`; cold-load race fixed |
| Login verification-query errors | Four known + unknown synthetic values; actual invalid-link direct URL | PASS; persistent focused plain-text summary, safe fallback, original success-notice priority, unrelated query preserved; no verification endpoint invoked |
| Invitation no token/language switch | Actual EN/AR/UR at 390×844, 768×1024, 1440×1000; synthetic Urdu | PASS for form/notice; shared 48px Select, translated alert, no request/action, no page overflow |
| Invitation pending scope/form layout | Synthetic EN/AR/UR at 390/768/1440×844 | PASS for fields, direction, shared selector height, document width; actual protected scope not verified |
| Invitation status loading | Synthetic deferred status | PASS; status message and activation disabled until status resolved |
| Invitation password mismatch | Synthetic pending invitation | PASS; named requirement remains Needed, activation disabled, no action call |
| Invitation activation pending/error | Synthetic action rejection | PASS; disabled busy action, persistent/focused error, password draft retained, exact token/password/name/context payload |
| Invitation activation success | Synthetic action success | PASS; existing institution toast and `/login?invite=accepted` destination |
| Invitation invalid/cancelled/accepted | Synthetic status responses | PASS; alert and activation disabled; no accept action |
| Invitation expired/reissue | Synthetic expired status and intercepted reissue | PASS; existing explanatory result and exact POST token payload; no message sent |
| Modal states | Neither route opens a modal | NOT APPLICABLE to these pages; no modal migration claim |

## Saved visuals

`baseline/` contains the actual login invalid and Urdu missing-token screens. `after/login-invalid-{390,768,1440}.png` and `after/invite-no-token-{en,ar,ur}-{390,768,1440}.png` are actual local route captures. Phone login and tablet Urdu invitation were visually inspected. Other `after/invite-{language}-{width}.png` and recoverable-error captures are synthetic fixtures and have the appearance limitations described above.

The login reveal is focused in the final screenshots, after the separate assertion that invalid submission first focuses email. The development indicator is present in actual screenshots and is not production UI.

## Open acceptance items

- Login remains English-only; full AR/UR translation is a separate copy/adoption gap. Invitation's existing decorative desktop brand panel remains English in RTL and is not counted as fully translated UI. The missing-token form notice is corrected with existing translations.
- Screen readers/live announcement behavior, Safari/Firefox, native autofill/password managers, Caps Lock hardware, 200% zoom/text, 320px stress, very long institution/campus strings, software keyboard/safe areas, and normal-motion appearance remain **UNVERIFIED**.
- Real authentication/authorization/cookie/session behavior, real account selection, MFA, password-change/onboarding destination pages, accept/reissue delivery, expired-time enforcement, and invitation context validation remain **UNVERIFIED** by design. The tests verify existing client contracts with synthetic boundaries, not the servers.
- Invitation status network rejection, reissue network rejection, repeated school-choice rejection/back recovery, stale token/language races, and every role destination beyond the representative cases remain **UNVERIFIED**. Existing branch logic was preserved; no unrelated business fix is claimed.
- Query notices for invited/session-expired are synthetic checks; only verified cold load has actual app integration coverage in this batch.
- Full AUTH-PUBLIC completion must not be inferred from this scoped report.
