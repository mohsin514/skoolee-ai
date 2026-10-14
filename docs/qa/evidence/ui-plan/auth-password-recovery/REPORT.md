# AUTH-PUBLIC — password recovery

Date: 2026-10-08. Scope: `src/app/(auth)/forgot-password/page.tsx`, its focused fixture/spec and this evidence directory. There is no `reset-password/page.tsx`: `/forgot-password?token=…` is the reset mode of the existing route. This report does not certify the whole AUTH-PUBLIC batch.

## Baseline and change

The first focused Chromium run against the original page produced two expected failures: invalid email had no `aria-invalid`/linked description, and a keyboard user had no password visibility action. The actual no-token route was opened read-only and captured at the three base dimensions (`baseline-request-*.png`). Source inspection also found toast-only request/reset errors and an unhandled verification rejection that left the spinner indefinitely.

The page now adopts shared `FormField`, `InputGroup`, `Input` and `Button` contracts. Native fields keep their autocomplete and explicit IDs; errors and password policy are connected to the fields. Both password actions have distinct names and support Enter/Space. Pending controls are named and disabled, fields become read-only, and status announcements remain separate from button names. Server errors stay visible beside the form, receive focus in a named summary group, and retain entered values for retry. Verification rejection offers a retry; server `valid: false` still renders the expired state. Success/expired/error headings receive focus after the state transition. The phone checklist stacks, uses readable text, and exposes met/unmet text to assistive technology.

No backend, email, token, expiration, rate-limit, single-use, password policy, resend policy or navigation contract changed. Client requirements remain eight characters, uppercase, number, special character and matching confirmation; the existing backend 8–72-character limit remains untouched. Request success keeps the enumeration-safe wording and five-minute guidance. Reset success still pushes `/login`; expired-link action still pushes `/forgot-password`.

## Verification boundary

- **Actual route, read-only PASS:** `/forgot-password` visible request shell, no horizontal page overflow and screenshots at 1440×1000, 768×1024, 390×844. No live form submission or live token verification was performed.
- **Synthetic browser PASS:** production page/components bundled with mocked auth actions, Next search/router/link, toast boundary and locale provider. The intercepted fixture document reuses the running application's CSS/font classes; the production logo CSS is bundled. Only synthetic email/password/token values are used, no backend action module is bundled and no fixture payload is sent to the server.
- **Language boundary:** existing page copy remains English. `ar`/`ur` cases test RTL layout and direction only. Arabic/Urdu translations are **UNVERIFIED / pending** the separate public-auth locale batch. They are not translated-language PASS claims.
- Chromium only. Real screen-reader speech, Firefox/WebKit, real email delivery, token redemption, throttling, database/session changes and authenticated redirects remain **UNVERIFIED**. Router destinations are asserted through the mock, not a real credential change. No build or global typecheck was run by this batch.

## Focused results

Final command:

```sh
TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts tests/design-system/password-recovery.spec.ts --output test-results/auth-password-recovery
```

**9 passed, 8.3s.** Baseline ran before source changes: two target failures plus one read-only capture passed. Intermediate fixture-selector corrections accounted for the required marker; a pending button name regression found during implementation was corrected by moving the status outside the button.

| State / behavior | Coverage and result |
| --- | --- |
| Empty request submit | Mock fixture: invalid/email description, field focus, zero action calls — PASS |
| Request pending | Named disabled action, status, read-only email, Enter cannot submit again — PASS |
| Request failure/retry | Focused persistent error, retained email, retry invokes mocked action — PASS |
| Request success | Focused heading, eligibility-safe text, five-minute copy, no resend action, login link — PASS |
| Token verification pending | Status and no password fields — PASS |
| Verification rejection | Focused error heading and retry — PASS |
| Invalid/expired token result | Expired heading, keyboard new-link action and destination — PASS |
| Valid reset mode | Both reveal actions keyboard-operated; no submission from toggle — PASS |
| Password validation | Empty/minimum length, uppercase/number/special requirements individually, mismatch and associated errors/focus — PASS |
| Reset pending/failure/success | Disabled named save/reveal actions, read-only fields, focused persistent error/value retention, retry and mocked `/login` navigation — PASS |
| Responsive reset controls | EN direction, AR direction, UR direction; 1440×1000, 768×1024, 390×844, stress 320×720; no horizontal overflow, fields and actions ≥44px, logical icon/action placement — PASS |

Scoped ESLint passed for the page and both new test files; scoped `git diff --check` passed. Root consolidates global type checking. A subsequent unsupported success-color class was replaced with existing `text-emerald-800`; the focused reset-constraints/failure/success test passed again (1 test, 1.4s) and refreshed `reset-error-390.png`.

## Evidence

- Baseline: `baseline-request-{1440,768,390}.png`.
- Actual final no-token route: `request-{1440,768,390}.png`.
- Synthetic reset geometry: `reset-{en,ar,ur}-{1440,768,390,320}.png` (English copy throughout).
- Synthetic phone states: `request-error-390.png`, `request-success-390.png`, `verification-error-390.png`, `expired-390.png`, `reset-error-390.png`.
- Visually inspected baseline phone, final reset desktop, final RTL 320px, and request-success phone. Remaining captures have geometry assertions but no separate manual visual sign-off.

23 screenshots total; final suite source is `tests/design-system/password-recovery.spec.ts`, fixture is `tests/design-system/fixtures/password-recovery.tsx`.
