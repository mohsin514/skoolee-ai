# SKO-208 authenticated layout validation — 2026-10-08

The initial design/navigation work is merged in PR #12. This follow-up includes the four subsequent shared-field/workspace/focus commits and the mobile legacy-header correction found in this validation.

## Environment and reproducibility

A new private PostgreSQL cluster ran on `127.0.0.1:55408`, database `sko208`. A credential-free copy of the app ran on port 3208; repository `.env` and `.env.test.local` were not used. No remote database or school account was changed. The tested `src/` tree was checksum-compared with the working source using `rsync -rcn`; it had no differences after the header fix.

Run `scripts/qa/design-system-role-audit.cjs` with explicit `TEST_BASE_URL` and `TEST_DATABASE_URL`. It refuses non-loopback targets and requires a `sko208`-prefixed database. It creates uniquely named temporary users, a school, campus, class and linked pupil/guardian. It verifies the login-session user ID matches its database fixture, deletes only its own fixture IDs in `finally`, and writes screenshots/results under ignored `test-results/design-system/roles/`.

## Results

- All 11 roles authenticated and reached their expected 10 distinct dashboards: APP_OWNER, SUPER_ADMIN, CAMPUS_ADMIN, ADMIN, PRINCIPAL, TEACHER, PARENT, STUDENT, ACCOUNTANT, LIBRARIAN, RECEPTIONIST.
- Every role passed page-width checks at 1280px desktop, 768px tablet and 360px phone, visible active primary navigation, mobile drawer open/Escape/focus restoration, and zero uncaught browser exceptions.
- The real parent fixture enabled only reports and attendance: Fees and Timetable navigation were absent; the overview fit at phone width with 200% root text sizing; direct `/parent/fees` showed the generic denial state.
- Authenticated `/dashboard/students` and `/messages` also fit at 360px. The legacy student header originally extended to 420px: its title, account controls and action group now wrap into phone-width rows. Wide data tables retain their own horizontal scroll containers.
- Teacher validation exercised the intentional no-active-academic-cycle recovery state, not a populated teaching workflow.
- Shared-system Node tests: 6/6 passed. Shared reference/application browser tests: 10/10 passed, including Arabic/RTL, contrast, form recovery, dropdown/calendar keyboard behavior, and login field colors. The first cold-server run lost an early search edit during hydration (9/10); its isolated retry and the subsequent full suite passed. This timing limitation remains recorded rather than hidden.
- TypeScript `tsc --noEmit` passed. Changed header/test files passed ESLint. Full source lint found three existing `no-assign-module-variable` errors in roles/permissions and tenants API files, plus six warnings outside this correction.
- `next build --webpack` compiled, then its route type validation stopped on the existing `verifyParentToken` export from `src/app/api/parent/token/route.ts`. That file is unchanged by this task; production build is not claimed passing.

## Scope of the evidence

This is local synthetic-data validation of all role shells and selected secondary layouts, not production certification or a claim that every domain transaction has been exercised. Admissions/reports/fees business mutations, populated academic cycles, complete localization, and real user task-completion studies remain separate validation work. Shared reference flows cover the common create/edit/review interaction contract; authoritative domain behavior remains owned by those modules.

Temporary fixture cleanup succeeded after the audit. The disposable cluster and app were stopped after evidence collection; the pre-existing server on port 3005 was left running.
