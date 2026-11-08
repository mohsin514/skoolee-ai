# SKO-196 — draft recovery and accessible interrupted forms

Verified locally on 2026-10-08 against the production Next.js build, using an isolated PostgreSQL database on loopback port 55496 and application port 3296. Accounts, pupils, marks and schools were synthetic. No remote database, real user credentials, outbound messages, deployment or merge was used.

## Long-form inventory and policy

| Form | Eligible recovery | Deliberately excluded |
| --- | --- | --- |
| New admission | Identity/enrollment, guardian phone, address, school choices, current wizard section | Health/allergy/medication/special-needs notes and login/invite emails |
| Existing pupil record | Allowlisted pupil/contact/enrollment fields, per pupil ID | Confidential health notes and uploads |
| Teacher mark sheet | Per-exam, per-pupil/subject scores and absent values | Assessment submission or publication while offline |
| School/campus settings | Allowlisted institution details, per institution/campus | Logos/uploads and credentials |
| Institution onboarding | School/campus setup and academic-cycle choices, current section | Logo binary/upload |
| Teacher onboarding | Name/phone, qualifications and teaching preferences, current section | National ID, birth date, home street address, emergency contacts and profile photo |
| Attendance | Existing shared unsaved-navigation protection | Persistent attendance recovery is not introduced by this change |
| Imports, payments, credentials and confidential free-text workflows | Existing validation/submit behavior | Files, payment data, secrets and unrestricted notes are never added to device recovery |

The shared contract distinguishes unsaved form state, tab-saved draft, server saving, server confirmation and recovery errors. Drafts use `sessionStorage`, expire after 24 hours and are scoped to a server-issued digest of login/account, school, campus and role, plus record and schema version. Signing out purges the namespace. Account/session changes purge inaccessible drafts before recovery; revoked account/record access is checked before displaying or applying recovered values. This is a tab-local recovery mechanism, not offline transactional synchronization or cross-device storage.

Recovery never auto-applies. It shows the draft timestamp, expiry, current values and saved input. A three-way comparison requires an explicit choice for each conflicting field; untouched current server fields survive. Current record access/data are checked again at application. Pupil edits use conditional writes; marks and settings use serializable revision checks. Only confirmed server success clears the corresponding draft. A failed connection preserves the eligible draft and explains its actual durability.

## Shared accessibility repairs

- Reuse the established role shells and active navigation. Admission/record editing stays in shared dialogs; existing loading shells remain while initial records load.
- Shared field labels/error descriptions bind to the actual nested input. Error summaries focus named fields and preserve valid input. Modal cancel respects unsaved guards; Escape, contained focus and trigger focus return use the shared dialog contract.
- Admission content scrolls as one region at 200% text, with reachable footer actions. RTL scroll locking constrains the document root as well as body. Telephone/email/URL/numeric shared inputs default to LTR unless explicitly overridden.
- Teacher content can scroll its enlarged heading/navigation away. A save bar that becomes too tall for the visual viewport moves into document flow, preserving access to focused cells and errors.
- Incomplete teachers reach teacher onboarding, and changing the last Next button into a submit button no longer causes premature submission.

## Reproducible checks

Use a dedicated local database named `sko208_196`; the form audit rejects any non-loopback target. Generate the Prisma client normally in an independent checkout, sync only that isolated database, build and start with the same local database and an ephemeral local AUTH_SECRET. Never load the repository's remote `.env` for this audit.

```sh
node --import tsx --test tests/drafts/store.test.ts
npx next build --webpack
TEST_BASE_URL=http://127.0.0.1:3296 TEST_DATABASE_URL=postgresql://LOCAL_USER@127.0.0.1:55496/sko208_196 node scripts/qa/draft-recovery-audit.cjs
TEST_BASE_URL=http://127.0.0.1:3296 TEST_DATABASE_URL=postgresql://LOCAL_USER@127.0.0.1:55496/sko208_196 node scripts/qa/design-system-role-audit.cjs
```

Both browser audits create scoped temporary fixtures and remove them in `finally`. Results JSON and representative screenshots accompany this report. The role audit records real logins, active navigation, keyboard drawer entry/Escape/focus return and desktop 1280, tablet 768 and phone 360 layouts for all eleven roles. The form audit uses actual rendered forms and authenticated APIs; concurrent changes are real database changes, not mocked fixture responses. It also checks focused inputs with browser hit-testing, because a bounding box alone did not detect RTL scrolling and overlay failures.

Unit checks cover scope separation, expiry/schema rejection, allowlisting and explicit three-way conflict resolution. Targeted ESLint, production compilation/TypeScript and whitespace checks pass. The browser runs cover admission interruption, existing-pupil conflicts and confirmed writes, settings conflicts, marks validation and conflict protection, keyboard-only recovery/save at 200%, school onboarding sign-out isolation and teacher onboarding completion. Offline-input and account-revocation results are recorded in the final form JSON.

## Limits

This is a Chromium local acceptance run, not a production, screen-reader or cross-browser accessibility certification. Browser Back/Forward confirmation uses the Navigation API where supported; other browsers retain eligible drafts and use the native refresh/close prompt but may not show an in-app traversal prompt. Closing a tab intentionally ends its draft lifetime. New privacy-sensitive fields must be explicitly reviewed before being added to an allowlist. The role matrix checks each role's accessible shell, not every operation available to that role. Contrast/readability received visual review of the designated paths; no whole-product WCAG conformance claim is made.
