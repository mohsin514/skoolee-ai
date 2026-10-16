# SKO-380 [004] Reliable account lifecycle and administrator MFA — QA 17 October 2026

## Environment
- Isolated Postgres `127.0.0.1:55409/postgres` (synthetic fixtures only, created and removed by each suite).
- Isolated `next dev` on `http://localhost:3209` via `/private/tmp/sko-app.sh 3209 55409 postgres`
  (`DISABLE_OUTBOUND_MESSAGES=true`, explicit `AUTH_SECRET`; repository `.env` not used).

## Results
| Suite | Result |
| --- | --- |
| `tests/account-lifecycle/lifecycle.test.ts` + `delivery.test.ts` + `browser.test.ts` (`--test-concurrency=1`) | **60/60 pass** |
| `tests/mfa/*.test.ts` (crypto, flow, manage, manage-route) | **59/59 pass** |

Browser coverage: every role's security flow at 1440/768/390 px with no page errors; administrator MFA
enrollment completes only after a valid code and explicit recovery-code acknowledgement; password reset
through the real server action revokes active sessions and consumes the link; suppressed delivery keeps a
pending invitation with `deliveryStatus=failed` and resend returns 503; unknown and known recovery emails
receive identical guidance.

## Test maintenance in this pass (no product change)
`browser.test.ts` predated the 11 Oct MFA UI redesign:
- the authenticator key is now displayed in 4-character groups — the test now strips whitespace before
  computing the TOTP (authenticator apps accept the grouped form);
- recovery codes now render as an accessible `<ol aria-label="Recovery codes">` instead of `<pre>` — the
  test now waits for that list.

## Screenshots
`super_admin-{1440,768,390}.png`, `teacher-{1440,768,390}.png` (synthetic accounts).

## Boundaries
Synthetic local data only; no real mail provider, remote database or deployment.
