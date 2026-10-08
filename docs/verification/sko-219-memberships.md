# SKO-219 membership authority

Institution registration kind (`GROUP`, `STANDALONE`, `UNVERIFIED`) is separate from the academic hierarchy's `institutionType`. Campus count never determines ownership. A historical ADMIN/SUPER_ADMIN is backfilled as an owner only when its email matches the institution registration contact. Unverified institutions require operator investigation; matching administrator labels grant no ownership. New registration writes ownership explicitly.

| Identifier | Work role / scope | Entry and landing | Forbidden examples |
| --- | --- | --- | --- |
| APP_OWNER | Vendor operator / platform | Provisioned operator, `/owner` | Customer invitation/selection |
| SUPER_ADMIN | Group administrator / institution | Verified creator setup, `/super` | Other institutions without operator authority |
| ADMIN | Legacy standalone administrator / campus; ownership separately verified | Verified creator setup, `/admin` | Ownership or purchase inferred from label |
| CAMPUS_ADMIN | Campus administrator / assigned campus | Invite profile/password, `/admin` | Institution setup, other campuses, undelegated purchases |
| PRINCIPAL | Academic lead / assigned campus | Invite profile/password, `/principal` | Institution setup, undelegated purchases |
| TEACHER | Teaching / assigned classes and campus | Invite profile/password, `/teacher` | Institution setup, billing purchase, other campus |
| ACCOUNTANT | Tuition/accounting / assigned campus | Invite profile/password, `/accountant` | Institution setup, undelegated subscription purchase |
| LIBRARIAN | Library / assigned campus | Invite profile/password, `/librarian` | Institution setup, undelegated purchases |
| RECEPTIONIST | Front desk / assigned campus | Invite profile/password, `/receptionist` | Institution setup, undelegated purchases |
| STUDENT | Explicit linked student / own records | Invite profile/password, `/student` | Staff roster, another pupil, setup, purchase |
| PARENT | Explicit linked children / family records | Invite profile/password, `/parent` | Unlinked child, staff roster, setup, purchase |

`/memberships` provides invitation scope and capability review, explicit purchasing/management delegation, role/campus reassignment and revocation. Family roles cannot receive administrative delegation. APP_OWNER, SUPER_ADMIN and legacy ADMIN cannot be invited through customer UI or API. Appointment/rank is stored separately and has no automatic permission effect.

Invitation acceptance consumes a pending, unexpired token atomically with account creation; competing/replayed acceptance cannot create a second account. Expired/cancelled links disclose no scope metadata and direct the invitee to their administrator. Acceptance collects the person's name and password, records audit evidence, and marks institutional onboarding complete without ownership. Family records still require explicit student/parent account links; sharing an email is not a relationship.

Reassigning or revoking access increments `accessVersion`, closes login sessions and stores before/after membership audit records in the same transaction. JWTs without a version are compatible only with unchanged version-zero accounts. Current-principal validation checks role and access version; background jobs instead resolve the current membership and re-evaluate policy. A fresh login after reassignment restores only the new scope.

Switching institution signs out through the shared session lifecycle and returns to credential verification and explicit institution selection. The existing password-verified school selector only lists accounts whose credentials match. No global identity or cross-school grant is inferred from email; this intentionally requires reauthentication at each switch.

All validation uses an isolated local database on port 55419 and app on 3219, synthetic `example.invalid` accounts and EMAIL_DEV_MODE. No remote database mutation or actual provider delivery is required.

## Verification results — 2026-10-08

- Production build (`npm run build`): passed.
- TypeScript (`npx tsc --noEmit`), focused ESLint, `git diff --check`: passed.
- `tests/memberships/access.test.ts`: 19/19 passed against the production app. Covers all eight invitable roles, denied setup and purchasing, forbidden vendor assignment, expired/cancelled/replayed/concurrent tokens, audited reassignment and revocation, stale-session rejection, independent rank changes, explicit owner preservation, password-verified multi-institution selection and delegated purchasing without tuition access.
- `tests/memberships/browser-check.ts`: all eleven role views passed. Owner invitation controls are absent for unprivileged roles. Real mobile invitation acceptance and keyboard review passed. Desktop 1440px, tablet 768px, phone 390px and Arabic role/capability RTL previews had no horizontal overflow.
- Recovery operator safeguard tests: 2/2 passed. The PR's existing Recovery verification workflow will rehearse migrations and restoration.
- Synthetic accounts and institutions are deleted by test teardown. Local database/app ports are 55419/3219; no remote database mutations, real mail, payments, merge or deployment were performed.

Screenshots: [desktop](sko-219/desktop.png), [tablet](sko-219/tablet.png), [phone](sko-219/phone.png), [RTL role preview](sko-219/rtl.png), [mobile acceptance](sko-219/accept-phone.png).

The additive migration must be applied through the existing reviewed release process before deploying schema-dependent application code. This PR does not execute remote migrations. Unverified historical ownership is deliberately not inferred from campus count or labels. Arabic support here covers role names and access previews; general application translation remains the localization workstream.
