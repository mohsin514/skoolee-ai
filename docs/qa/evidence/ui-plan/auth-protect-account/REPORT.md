# AUTH-PUBLIC — protect-account shared controls

Date: 2026-10-08. Route R005 `/protect-account`. **Scoped implementation and synthetic checks pass; real MFA integration remains UNVERIFIED.** Shared working tree includes concurrent foundation/auth changes.

## Scope and baseline

Changed only `src/app/(auth)/protect-account/page.tsx`; added `tests/design-system/protect-account.fixture.tsx`, `protect-account.spec.ts`, and this evidence. Read the plan's route/component/execution entries, installed Next Server/Client Components/forms guides, existing shared APIs, and the MFA route handler before implementation. The handler was read only to preserve its contract and was not executed or edited.

Baseline checks used the original page in an isolated browser fixture. Two tests failed as expected: the initial status request had no announced loading state, and the recovery-mode checkbox remained editable while a challenge was pending. Source inspection also found raw Select/Input/Checkbox/buttons and no error/stage focus management. Baseline images are saved under `baseline/`.

No real `/protect-account` page or MFA endpoint was visited by this batch. All setup/challenge/verification/acknowledgement results came from explicit synthetic fixture responses. The secret and recovery values visibly start with `SYNTHETIC`; they cannot represent an enrolled account. The fixture's `000000` test entry never leaves that intercepted environment.

## Implementation

- The language field, verification field, actions, and boolean controls now use shared Select, FormField, Input, Button, Label, and Checkbox. Existing page layout/brand family remains; secret/code surfaces use the shared subtle surface.
- Original EN/AR/UR security instructions and labels remain intact. Small local translations cover Language, Checking account, Try again, and Working. No shared catalog was changed.
- Initial status has an announced loading message. A failed initial request exposes a retry that performs the same GET with `cache: no-store`; it cannot trigger a security action. Unmounted/stale status requests do not update the page.
- Server errors persist in a focusable alert. Existing code guidance is associated with the shared field; a current error is also described by the field without labelling every service failure as a field-validation error.
- The verification field receives focus when challenge/setup verification becomes available. Recovery-code delivery focuses the existing save/recovery instructions. A pending request makes the code read-only and disables recovery/acknowledgement changes. A busy guard also rejects duplicate sends.
- The return-to-sign-in link remains on its own row. Screenshot review caught and corrected an intermediate inline layout that placed it against Enter workspace; a focused rerun verified the final acknowledgement view.

## Preserved security contract

GET still calls `/api/auth/mfa` with `cache: no-store`. POST still calls the same endpoint with JSON containing exactly `action`, `code`, `recovery`, and `acknowledged`.

The existing actions are unchanged: setup for unenrolled accounts, verify-setup after receiving a secret, challenge for enrolled accounts, and acknowledge after the user checks that recovery codes were saved. Delivery of a secret still clears old recovery codes and acknowledgement; delivery of recovery codes still clears the secret and entered code. Recovery mode still clears the entered code when changed. Enter workspace remains disabled until acknowledgement is checked, and stays disabled during the request. Resume without locally available codes still offers the original Start setup again action.

Only a returned `data.user` causes `router.replace`, preserving `/first-login` for `mustChangePassword` and `dashboardPathForRole` otherwise. No server-side MFA, ticket, code-consumption, rate-limit, session, tenant, or authorization rule changed. No credential logging, browser storage, secret caching, downloads, or copy-to-clipboard feature was added.

## Validation

```text
npx playwright test --config tests/design-system/playwright.config.ts protect-account.spec.ts --output test-results/protect-account --reporter=list
16 passed (6.4s)

npx playwright test --config tests/design-system/playwright.config.ts protect-account.spec.ts --grep 'synthetic setup' --output test-results/protect-account-visual --reporter=list
1 passed (1.2s) — after return-link row correction

npx eslint 'src/app/(auth)/protect-account/page.tsx' tests/design-system/protect-account.fixture.tsx tests/design-system/protect-account.spec.ts
PASS (exit 0)

git diff --check -- [same scoped page and test files]
PASS (exit 0)
```

Chromium runs use the authorized local process escalation and configured reduced motion. The fixture bundles the actual page and shared controls, compiles current global CSS, stubs router/Link/LocaleProvider, replaces fetch before mount, and aborts other network requests. It does not load the real Next root layout/font or cookies. Screenshots establish the listed control layout in that fixture, not full production font/rendering or live security behavior. One test locator was corrected to use the textbox's accessible name rather than exact label text containing the shared required marker; no product behavior was changed for that correction.

| State | Coverage | Result |
|---|---|---|
| Status pending | Deferred synthetic GET, EN phone | PASS: localized status announced, shared selector, no POST |
| Failed status + retry | Rejected synthetic GET then enrolled result | PASS: persistent error, GET-only retry with no-store, code focus, no POST |
| Enrolled challenge pending + invalid code | Delayed synthetic 400 | PASS: disabled mode, read-only code, duplicate Enter produces one request; retained input and focused error |
| New setup | Synthetic unenrolled response and delayed secret | PASS: setup busy/disabled, exact action payload, synthetic secret shown and code focused |
| Verify setup + recovery delivery | Synthetic code response | PASS: secret removed, recovery codes/instructions shown, instructions focused, no navigation before acknowledgement |
| Acknowledge gate + pending | Synthetic delayed success | PASS: disabled until checked; checkbox and action disabled while busy; exact acknowledged payload; first-login destination |
| Recovery-code challenge | Synthetic enrolled account | PASS: choosing recovery clears field and changes input mode to text; exact recovery flag/code; parent destination |
| Expired ticket | Synthetic initial 401 | PASS: error and login link; no setup/challenge/ack controls or POST |
| Resumed unacknowledged setup | Synthetic awaitingAcknowledgement state | PASS: original restart action/payload |
| Shared control layout | EN/AR/UR at 390×844, 768×1024, 1440×1000 | PASS: correct main direction, LTR code data, shared fields, selector at least 48px, no document overflow |
| Modal/toast | No modal or toast exists on this route | NOT APPLICABLE; feedback remains inline |

## Evidence and remaining acceptance

`after/` contains `status-loading.png`, `challenge-error.png`, `recovery-codes-synthetic.png`, and the nine `mfa-{language}-{width}.png` images. Urdu phone, focused error, and acknowledgement screenshots were visually inspected; the final acknowledgement image shows separated primary/return actions. Some captures follow programmatic focus scrolling, so they are state evidence rather than an initial viewport claim.

- Real ticket validity, real authenticator clocks/codes, recovery consumption/session invalidation, enrollment persistence, acknowledgement security, and expired-setup recovery remain **UNVERIFIED**. Only client behavior/payloads were tested; server security logic was not changed or exercised.
- Complete keyboard traversal, live screen-reader announcements, Safari/Firefox, native OTP autofill, 320px/200% text stress, long school names, native keyboards/safe areas, and root-font appearance remain **UNVERIFIED**.
- POST network failure/429, setup failure, acknowledgement failure and retry, token expiry during a pending step, and all role destinations beyond first-login/parent remain **UNVERIFIED**. The existing common error/action logic is preserved; no security acceptance is inferred from representative client tests.
- Existing server-supplied error text may be English in AR/UR. Local status/control copy is translated; server message localization was not changed.
- The root agent owns aggregate type/build/adoption checks and route checklist reconciliation. This batch does not establish complete AUTH-PUBLIC coverage.
