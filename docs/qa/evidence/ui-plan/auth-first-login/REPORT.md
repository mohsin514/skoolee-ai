# AUTH-PUBLIC — first login

Date: 2026-10-08. Scope: `src/app/(auth)/first-login/page.tsx`, its new fixture/spec and this directory. Route R002 remains only partially verified; this is not a whole-page/all-language/authenticated-flow certification.

## Baseline and result

The original page failed two focused Chromium targets: confirmation mismatch was visually shown but had no accessible description, and pending submit replaced its label with an unnamed spinner. The read-only anonymous route check passed: `/first-login` redirected to `/login`. Three baseline screenshots were captured using the production component in the synthetic fixture.

The page now uses shared `FormField`, `InputGroup`, `Input`, `Button` and `FieldError`. Field errors and password requirements are programmatically connected; each password has its own named keyboard-operable reveal action. The pending save retains `Saving…`, a separate status announces progress, and both fields are read-only while submitting. Server errors persist in a named, focused summary; values survive retry. The phone header/checklist stack and readable policy text expose met/unmet status beyond icon/color. The disabled-until-valid submission behavior is preserved.

Backend endpoint, request method/payload, authentication/session rules and destinations are unchanged. Required policy remains eight characters, at least one letter and one number, plus matching confirmation. A symbol remains recommended, not required. Successful teacher setup still routes to `/teacher-onboarding` when onboarding is incomplete; other cases retain `dashboardPathForRole` and `router.refresh()`.

## Verified states and boundaries

| Case | Evidence/result |
| --- | --- |
| Actual anonymous `/first-login` | Read-only navigation redirected to `/login` — PASS |
| Empty/invalid form | Save disabled; short/no-letter/no-number values rejected; policy/error descriptions linked — synthetic PASS |
| Symbol optional | Matching `Synthetic9` accepted without a symbol — synthetic PASS |
| Confirmation mismatch | `aria-invalid` and linked message — synthetic PASS |
| Password actions | New and confirm actions separately named; Enter/Space toggle each field without exposing the other — synthetic PASS |
| Pending save | Named disabled button; read-only fields; intercepted PUT and unchanged `{newPassword}` payload — synthetic PASS |
| Server failure/retry | Existing same-as-temporary error text, persistent alert, focused summary, retained values and successful retry — synthetic PASS |
| Success destinations | Incomplete teacher → onboarding; complete teacher → teacher; student → student; unknown role → login; admin retry → admin. Refresh preserved — synthetic PASS |
| Geometry | EN LTR plus AR/UR RTL direction, 1440×1000, 768×1024, 390×844, stress 320×720; no page overflow or heading clipping; fields/actions ≥44px and logical affix placement — synthetic PASS |

The fixture bundles the actual page/components, production logo styles and role mapping. It mocks only Next router, toast and locale-provider boundaries, copies loaded app CSS/font classes, and intercepts **every** fixture PUT `/api/auth/first-password`. No real password, credential change or backend request was submitted. Synthetic request payload assertions use `Synthetic9` only. Router targets are mock assertions; they do not claim real authenticated navigation.

Arabic and Urdu **copy is untranslated / UNVERIFIED**; these cases cover direction/geometry with existing English text only. Forced-password authenticated context, revisit after reset, real cookie/session renewal, endpoint authorization and server policies, actual credential changes, other browser engines and screen-reader speech remain UNVERIFIED. No server/global build/typecheck was run for this batch.

## Checks

```sh
TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts tests/design-system/first-login.spec.ts --output test-results/auth-first-login
```

Final: **12 passed, 10.2s**. Baseline before edits: **2 targeted failures, 1 read-only/geometry pass, 13.7s**. Scoped ESLint and `git diff --check` passed for the changed page and tests. Root owns integrated checks.

Files: `tests/design-system/first-login.spec.ts` and `tests/design-system/fixtures/first-login.tsx`.

19 screenshots: three `baseline-first-login-{1440,768,390}.png`; three final EN fixture `first-login-{1440,768,390}.png`; twelve `first-login-{en,ar,ur}-{1440,768,390,320}.png`; `error-390.png`. Visually inspected baseline phone, final EN desktop, RTL 320px, and focused server-error phone. Other screenshots have automated geometry assertions where stated; no separate manual visual sign-off claimed.
