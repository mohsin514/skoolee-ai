# SKO-209 — account lifecycle and administrator MFA

Implemented against `origin/dev` (`de2ae4d`) using the merged SKO-207 authorization and SKO-219 membership authority. The original working checkout and its user edits were not changed.

## Behaviour

- Invitations bind acceptance to the school/campus/role/delegations actually reviewed. Atomic claims include the token and captured context, so resend/cancel/context changes cannot race an old acceptance. Expired holders can request a replacement without creating a user or duplicate invitation. Administrator resend retains explicit delivery failure and attempt time.
- Current membership/accessVersion remains authoritative on every protected request. All browser sessions now require a live, unexpired server row. Missing rows and database lookup failures deny access. Login waits for recording and has a unique JWT ID. Role/campus changes and removal retain the shared membership invalidation logic; password changes, password recovery, MFA recovery and authenticator replacement also invalidate previous sessions.
- Owners, platform operators, administrative roles, principals and holders of purchasing/membership delegations must complete MFA. Password verification only grants a 10-minute HttpOnly purpose-bound ticket. No privileged session exists until an authenticator challenge and explicit recovery acknowledgement succeed.
- TOTP uses RFC 6238 SHA-1, six digits, 30-second periods and a ±1 step window. Successful steps cannot be replayed. Secrets use authenticated AES-256-GCM encryption. Ten high-entropy recovery codes are returned once, only after a successful setup challenge; only their SHA-256 digests persist. A conditional update consumes each recovery code once even across competing browser sessions.
- Lost-device replacement requires a full MFA-authenticated session, current password and another valid factor. It audits the change, ends all sessions, discards old factors and restarts enrollment. Email recovery never disables MFA. There is no support impersonation or email-only MFA bypass.
- `/account/security` lists personal device/browser details, sign-in and expiry times, identifies the current device and ends individual sessions. It deliberately makes no geolocation claim. The role-header menu links to it. English, Arabic and Urdu guidance uses RTL with codes isolated LTR.
- Security throttles use atomic shared database counters with hashed keys. MFA/session mutations reject cross-site origins. Password recovery responds generically before account lookup or delivery; delivery failures are audited and the undelivered reset token is removed. Public resend also returns a generic response.

## Local evidence — 2026-10-08

Only synthetic `example.invalid` accounts on loopback PostgreSQL port **55409** and app port **3209** were used. Fixtures clean up their own school/account rows. No remote database, real account, provider credential, external delivery or deployment was used.

| Validation | Result |
| --- | --- |
| Lifecycle/API + revocation unit suite | 33 passed |
| Chromium roles × widths 1440 / 768 / 390 | 33 passed |
| Browser MFA challenge/acknowledgement and password-reset server action | 2 passed |
| Unconfigured invitation delivery/resend and generic password recovery | 2 passed |
| TOTP published test vector, replay and authenticated encryption | included |
| Concurrent two-browser recovery-code consumption | exactly one succeeds |
| Real staff removal: existing session, marks, messaging, report download and AI request | all denied on next protected request |
| Real membership campus update | old session denied |
| Invitation concurrent acceptance/context mutation/expired reissue | passed, one account only |
| Session ownership and individual revocation | passed |
| Lost-authenticator replacement and session invalidation | passed |
| RTL / LTR code isolation / keyboard / horizontal overflow | passed across role security flows |
| TypeScript, new security-file ESLint, whitespace checks | passed |
| Production build | passed |
| Recovery rehearsal: clean deployment, populated upgrade, full records/files restore | verified-awaiting-sign-off; 11.984s verified restoration |

Executable suites are under `tests/account-lifecycle`. New CI runs lifecycle/browser/delivery checks against a disposable Postgres/Redis service. Existing outbox/authorization fixture sessions now explicitly represent completed MFA and include server-side session records. The legacy logout suite uses environment-specific fixture accounts and was not run against a shared/remote environment.

## Rollout and limits

Apply `20261008020900_account_lifecycle` before deploying the application; no remote migration was executed here. Existing administrator sessions without MFA and legacy unrecorded sessions must sign in again. This is intentional. Announce the authenticator enrollment and recovery-code requirement before enabling real schools.

Set `MFA_ENCRYPTION_KEY` to stable, independently generated secret material and retain it securely with backups; if omitted, encryption derives from `AUTH_SECRET` for compatibility. Changing the effective encryption key without re-enrollment makes existing authenticators unreadable. Encrypted factors and recovery digests are included in normal protected database backups. A future key-version rotation mechanism is outside this issue.

Set a trusted `NEXT_PUBLIC_APP_URL` before production invitation delivery. Production never derives invitation links from an arbitrary request Origin. Configure SMTP separately. Actual mail provider delivery and a physical authenticator app were not exercised; local success mode and unconfigured-provider failure were verified. TOTP was checked with a published vector and real browser challenge flow. Losing both authenticator and all recovery codes has no automated identity-bypass path.

The database-outage denial decision is unit-tested with an injected failing lookup; no production outage was induced. A restore rehearsal verifies synthetic recovery, not production readiness or operator sign-off. No merge or deployment is part of this PR.
