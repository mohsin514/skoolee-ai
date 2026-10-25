# Multi-campus group admin functionality and AI audit — 25 October 2026

Branch: `codex/group-admin-functional-audit`, based on the owner fixes in PR #68. The group changes are a separate reviewable commit/PR. Tests used disposable local school groups, campuses and users. No production tenant data was modified.

## What this role needs

The group administrator oversees one institution across its campuses. The existing application already has most of the necessary domains; this pass improves their reliability rather than adding parallel management systems.

| Responsibility | Required behavior | Result of this audit |
| --- | --- | --- |
| Network oversight | Compare campuses, see actual fee collection, find leadership gaps and pending approvals | Corrected collection calculations, staff counts and zero-score handling; added reliable refresh and failure states |
| Campus lifecycle | Find campuses by name/city/leadership, add/edit safely, inspect blockers, archive and restore | Added search and leadership filters, creation receipts and invitation recovery; fixed early edit/archive clicks and mobile return navigation |
| People and access | Appoint leaders, invite staff, review campus/role changes, revoke access and expire sessions | Exercised invitations/cancellation, reviewed reassignment, stale-write refusal, foreign-school refusal and revocation; fixed password reset and active-session filtering |
| Group standards | Prepare shared templates, review versions and exceptions with a traceable decision | Existing group-policy capabilities exercised by the workflow database suite; templates/policies/review views checked in the browser |
| Billing and approvals | Institution subscription, support consent, policy/tax reviews; clear separation from tuition collection | Existing pages/tabs verified; missing approval data now produces a warning instead of suggesting there is no pending work |
| Identity and records | School profile, locale, identity/integrations, data settings and audit history | Views checked across screen sizes/languages; membership/activity exports downloaded; reviewed campus edits persisted |
| AI governance | Scoped reads, preparation, missing-field questions, explicit write confirmation, replay protection and review handoffs | Full workflow suite, scripted browser/API tests and five live-provider cases passed |

The group overview does not need a second classroom-setup questionnaire card, full learner/guardian contact records, or duplicate campus-level operational forms. Removed the competing setup card and unused roster/detail payloads. Campus administrators retain their day-to-day admissions, teaching, fee collection and academic workflows. The group administrator does not acquire platform-owner controls or access to another institution.

## Defects fixed

- A partially paid invoice was counted at its full face value as collected revenue. The group dashboard now uses `totalAmountPaid` and excludes cancelled invoices. A 1,000 invoice with 250 paid now displays 25%, not 100%.
- Zero assessment scores were excluded from averages. Finite zero scores now count in campus/class averages.
- Staff totals included inactive/family accounts. Group dashboard staff counts now use active staff roles.
- The group dashboard fetched and returned learner names, guardian contacts, class rosters and recent report/exam details that its governance charts did not need. It now requests only the dates/grades those charts consume, alongside existing counts.
- Campus creation could commit successfully and then report total failure when the invitation failed. The form now displays a creation receipt, invitation status and a shareable link where available. It does not invite duplicate creation.
- Leader invitation email failures could trap the user in a form even though the invitation existed. The group flow now receives delivery status explicitly and shows the saved invitation with a delivery warning. Other callers retain their existing error contract.
- Server errors in campus/leader forms were toast-only and could be obscured by the modal. They are now visible inside the dialog; input survives retries. Busy forms cannot be dismissed; cancellation labels are accurate. Missing clipboard support is handled inline.
- Clicking Edit or Archive before campus details finished loading could do nothing. Pending requests now execute once the data arrives, without reopening after a refresh. Campus detail state remounts when selecting a different campus.
- Mobile campus details lacked an accessible return action. The page now has an explicit Back to all campuses control.
- The campus list had no search or leadership filter. Added name/city search, missing-admin/principal filters, result counts and a clear-filters empty state.
- Approval-count failures could appear as no outstanding decisions, and counts did not refresh with the dashboard. Failures now remain visible and Refresh reloads the counts and dashboard.
- Super admin password resets accepted the current password and left old sessions active. They now reject reuse, revoke sessions and require replacement of the temporary password, while retaining MFA and institution-owner protections.
- Super users/sessions/audit endpoints could receive invalid numeric pagination/date inputs. Added bounded parsing and deterministic ordering; invalid role filters are rejected. Expired sessions no longer appear as active.
- Added Arabic/Urdu copy for the new states. Updated stale source-contract assertions to reflect the group readiness entry and selected pilot detail behavior.

## Executed functional coverage

### Group console

The final full browser/API run passed 13 groups; a subsequent dedicated membership regression passed one additional group (**14 distinct groups**):

1. School-scoped API reads, teacher denial, malformed pagination and role validation.
2. Password reuse rejection, reset, session revocation and required password replacement; own/foreign administrator protection.
3. Expired-session exclusion and school-scoped termination.
4. Actual collection percentage and absence of synthetic learner/guardian names from dashboard action responses.
5. Approval-count outage and refresh recovery.
6. Campus search, leadership filters, empty state, detail and return navigation.
7. Campus validation, injected failed-save recovery, creation, invitation link/copy failure and inherited calendar.
8. Leader email validation, saved-invitation delivery warning and cancellation.
9. Reviewed campus editing, including opening the editor before settings finish loading.
10. Successful campus creation with an unsuccessful invitation, without a duplicate-create action.
11. Archive blockers, archive, restore and preserved campus records.
12. Actual membership and activity CSV downloads.
13. Eighteen views/tab combinations at English 1440/768/390px and Arabic/Urdu 390px: **90 layout captures**, with no document-level horizontal overflow or uncaught browser errors.
14. Reviewed cross-campus membership reassignment, stale version conflict, old-session invalidation, foreign-campus refusal, revocation and audit rows.

The 18 combinations cover overview, campuses, leadership/everyone/permissions, support/tax/policy approvals, templates/policies, billing, and profile/locale/identity/integrations/data/activity/setup settings. Visual inspection included desktop overview, mobile campus list and Arabic people/access. Captures are test artifacts, not a claim that every possible modal or business scenario was exercised.

### AI Workflows and Ask

- **201 database tests passed** across the complete workflow suite. This includes group campus creation/calendar/replay, capacity refusal, one-campus-per-step and pinned-scope enforcement, policy drafting/submission, prepared invitations, identity domains, readiness, class-C handoffs and role denial; it also covers common planner, evidence, confirmation, access, retry and recovery behavior.
- **95 workflow unit tests passed**.
- **7 scripted-provider browser/API groups passed** using the real local application and a loopback provider (13 provider calls): missing city/retained name, failed answer/retry, preview before write, confirmed creation, command replay/reload, multi-campus readiness, forbidden platform capability, pinned-campus refusal, provider outage/resume, workspace/catalogue/waiting/setup/readiness navigation, all five network-insight actions and visible overview generation. These are controlled recovery/flow tests, not real-model quality claims.
- **5 real-provider scenarios passed** using the configured AI provider with synthetic data only (8 provider calls): group readiness read; campus creation only after explicit confirmation; retaining a supplied campus name through a missing-city answer, then cancellation; refusal of platform-wide data access; and conversation as a read operation. The temporary live-test institution was deleted afterwards. These sampled scenarios do not prove that all prompts are reliable.
- Existing capability inventory passed: **194 entries connected**, **660 capabilities not connected**, **29 handlers awaiting inventory**. No claim is made that Ask can automate the entire application. No executable adapter was added solely to bypass a confirmation or permission boundary.

## Other validation

| Check | Result |
| --- | --- |
| Group console source contracts | 25 passed |
| Financial/academic metrics | 3 passed |
| Locale catalog conflicts/precedence | 6 passed |
| Authorization | 110 passed, 2 skipped, 0 failed |
| UI adoption | 8 passed |
| Application plus owner/super tests TypeScript | Passed |
| Targeted ESLint and `git diff --check` | Passed |
| Production build, including commercial/UI/capability checks | Passed |

The membership suite for a different fixed local environment (port 55419) was not run against an arbitrary database. The new dedicated regression above verifies the relevant reassignment/revocation behavior on this audit's server instead.

## Test environment and reproduction

Application server: `127.0.0.1:3094`, synthetic database `owner_audit_20261024` on local PostgreSQL 5432. AI database suites: disposable `ai_workflows_test` on local PostgreSQL 55438. The browser tests assert the exact test database and synthetic auth secret. They retain synthetic fixtures for inspection and write evidence only under ignored `test-results/`; the real-provider test removes its fixture.

Start the QA app with these overrides (the database/schema must already exist):

```sh
DATABASE_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024?connection_limit=3' \
DIRECT_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024' \
AUTH_SECRET='synthetic-owner-audit-only-20261024' \
NEXT_PUBLIC_APP_URL='http://127.0.0.1:3094' NEXT_BUILD_DIR='.next-owner-audit' \
DISABLE_OUTBOUND_MESSAGES=true EMAIL_DEV_MODE=true STRIPE_SECRET_KEY='' RESEND_API_KEY='' \
AI_PROVIDER=ollama OLLAMA_BASE_URL='http://127.0.0.1:11499' OPENAI_API_KEY='' \
npm run dev -- --hostname 127.0.0.1 --port 3094
```

Run these browser suites with `DATABASE_URL` set to the same URL **without** the query string and the same synthetic `AUTH_SECRET`:

```sh
node --import tsx tests/super/acceptance.ts
SUPER_QA_MOCK_AI=1 node --import tsx tests/super/ask.browser.ts
```

The Ask runner hosts its own scripted provider on port 11499. Run it only against the QA app configured above. `SUPER_QA_FILTER` selects a functional group; `SUPER_QA_SKIP_LAYOUT=1` omits the layout sweep.

For the workflow database suite, set both `DATABASE_URL` and `DIRECT_URL` to `postgresql://angular_dev_15@127.0.0.1:55438/ai_workflows_test`, with external AI disabled:

```sh
npm run test:ai-workflows:db
npm run test:ai-workflows
node --import tsx --test tests/settings/group-console.test.ts tests/super/metrics.test.ts tests/locale/catalog-conflicts.test.ts tests/locale/catalog-precedence.test.ts
npm run test:authz
npm run check:ui
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --project tsconfig.super-audit.json --noEmit --pretty false
```

`tests/super/live-ai.ts` is explicitly opt-in (`SUPER_QA_LIVE_AI=1`), uses that disposable AI database, and loads only AI provider configuration from `.env`. It requires network access and incurs provider usage; it refuses more than twelve provider calls. Invoke with `node --import ./tests/support/server-only.mjs --import tsx tests/super/live-ai.ts` only when a live test is intended.

The production build used `NEXT_BUILD_DIR=.next-group-build` and the isolated database with outbound messages disabled.

## Remaining limits and environment issue

- The initial local SMTP attempt failed authentication. Subsequent tests explicitly disabled outbound messages. Saved invitations, failure notices and manual links are verified; **actual email delivery needs valid SMTP configuration and a delivery check**. Production SMTP configuration was not inspected or changed.
- Live payments, refunds, settlement, webhooks, SSO provider setup and third-party integration delivery were not exercised. Screens loading does not certify their external services.
- The suite verifies the listed group policy/identity/approval paths; it is not exhaustive coverage of every policy, tax package, locale transition or destructive data-lifecycle operation.
- No production load/capacity benchmark, simultaneous campus-limit stress test or complete mobile-device/browser matrix was performed. No deployment was performed.
- Generated screenshot/download files are excluded from commits. The owner screenshot gallery and downloads were deleted as requested; the reusable tests and compact audit reports are retained.
