# SCRUM-308 — request and result states

## Contract (defined before consumer migration)
A read has one displayed result: loading, no-data, no-match, failure, success or denied. Loading wins while a fresh request is in flight. A failed HTTP response is never interpreted as a successful empty collection. 401/session and 403/404/access failures erase protected result rows, preserve local query and draft inputs, and offer a safe navigation action. HTTP 400/422, 409/412, 408/504, 429, 502/503 and other failures have distinct safe classifications. Response text is not retained in error objects. Only bounded opaque x-request-id references may be shown. Reads time out after 20 seconds; mutations are never replayed automatically.

Request shape, scoped URL parameters, response data and persistence remain compatible. Status classification precedes JSON parsing, including proxy HTML failures. Latest-request sequence guards prevent stale responses and old finalizers from changing current data/loading. Existing server authorization runs before data reads. UI changes do not grant access. Existing mutation transactions/idempotency and audit contracts remain domain-owned. No schema migration or backfill. Rollback: revert code.

## Inventory and dependencies
Shared primitives: ErrorState, EmptyState, AccessNotice, skeletons, toast, route-error, useValidatedForm, shared-admin workspace. The generic useFetch currently has no application consumers; changing it alone cannot correct the app. There are over 250 TSX fetch consumers and independent server action dashboards, requiring explicit accounting.

Initial affected operations: transport routes/vehicles, dormitory rooms/types, library categories/books/members/issues, inventory categories/stores/suppliers/items/transactions. These share operation table controls across permitted console roles. Form drafts and filters stay mounted during read failures. Load-dependent selector failure blocks the combined load instead of pretending its data is empty.

Unmerged PR #118 adds list query/URL behavior; #119 adds workspace layouts. Neither is included here. Both overlap directory/operations files and require conflict reconciliation at landing. Current work starts from origin/dev, independently of those branches. Their residual scope is not claimed here.

## Verification and scope accounting
In progress. Do not treat this inventory or a PR as full acceptance. Consumer, authorization, native-client, integration/export, browser and screenshot evidence will be recorded as verified, with unresolved gaps explicit.

## Explicit overlap with PR #118
Search filter changes use the installed Next.js native History API integration so the existing component can show offline failure and retain its draft instead of beginning a failing server navigation. PR #118 independently fixes this same pre-existing offline URL transition. This overlap is deliberate and must be reconciled at landing; it is not a claim to include #118's pagination/query work. Installed guide: `01-app/02-guides/single-page-applications.md`, shallow routing section.

CI prerequisites shared with unmerged #118/#119: outbox API tests must load the repository's server-only shim; the corrections mobile browser test uses its visible combobox. These two harness fixes are included explicitly because origin/dev still lacks them. No production feature changes from those PRs are copied as dependencies.

Resource-library refresh failures hide and make the already-authorized subtree inert while retaining its mounted authoring form and selected File. No new response data is accepted after a denial; retry restores the same draft. This is in-memory retention, not storage or logging. Guardian trip absence remains a compact-dashboard omission only after a successful empty response; failures now show an actionable state.

## Current verified evidence
- 11 targeted request/render/locale/API-correlation tests pass. Unexpected shared API errors log only requestId/status, preserving status and field-error contracts.
- 110 authorization tests pass; two existing skips. Eight design-system adoption tests pass.
- Application TypeScript and targeted ESLint pass. Full project TypeScript passed before subsequent family/resource updates; application check repeated after those updates.
- Nine real Chromium browser/API cases pass (including staff/rooms and learner timetable cases): provider/timeout/denial/success, Urdu mobile refresh/no-match, library draft denial, direct role/tenant/campus checks, invalid/conflicting duplicate submissions, true offline keyboard recovery, loading/no-data/no-match. Thirteen distinct screenshots are verified saved on Jira.
- `tests/states/states.browser.test.ts` requires isolated 127.0.0.1:55438/postgres and synthetic fixtures. No production seed/reset. All nine scenarios also pass in WebKit, including mobile RTL and true offline keyboard recovery. `.github/workflows/request-states.yml` reproduces the checks.

## Outstanding acceptance (draft PR; not ready for queue advancement)
The machine inventory has 271 consumer entries. Classification adoption and browser coverage do not yet cover every independently implemented dashboard, timetable, academic/exam, owner, notification, report/export and form-picker request. Existing domain-specific error/success flows are not claimed as verified merely because shared controls pass. Complete the audit and any corrections, broaden permission/partial-success/stale/retry regression evidence, verify supported browser engines/clients and latest-commit CI/reviews before marking the card In Review. No migration, new business mutation replay or background worker contract is introduced; broader domain idempotency acceptance remains unverified.

Additional audited consumers: academic room lists, subject syllabus and the shared staff-leave panel (teacher, principal, accountant, receptionist, librarian and HR portals) now use checked read outcomes and latest-request guards. Membership reads preserve their existing bare-object response contract explicitly; a failed refresh clears displayed members instead of silently retaining the prior list. These changes do not modify membership privileges, leave decisions, room capacity, syllabus mutations or their persisted models.

Jira has thirteen saved screenshots and a persisted web link to draft PR #120, verified after reload, plus a clickable PR comment. The draft is attached to the Codex chat. Vercel statuses on the initial commit are successful with description `Canceled by Ignored Build Step`; this is not deployment evidence and no rate-limit exception is asserted.

## Additional timetable and submission verification
Operation forms keep their drafts editable while loading or after a failed read, but cannot submit until the dependent read succeeds. The library browser case verifies disabled Save on denial and re-enabled Save with the same draft after recovery.

The learner timetable checks both timetable and calendar responses before displaying either result, clears stale records on failure, and distinguishes denied access from unpublished data. The class timetable API now checks staff module permission and class tenant/campus scope before publication lookup; families resolve through their authorized student relationship. Real HTTP tests verify an allowed class and denial for another tenant and another campus. A learner browser case verifies provider failure, denial, then recovery to a true unpublished result. All nine browser cases pass in Chromium and WebKit; application types, targeted lint and 110 authorization tests pass (two pre-existing skips).

At pushed head bde05cf8, nine GitHub workflows passed while recovery verification was pending. All five Vercel status descriptions explicitly read `Deployment rate limited — retry in 24 hours.` This is the user-permitted rate-limit exception only, not deployment validation. Subsequent commits require their own final checks. No review findings were present at that inspection.

The shared MyNextPaper learner/family exam timeline now renders a loading region and classified read failure with retry instead of disappearing. Its existing bare-object response contract is preserved. The learner timetable browser scenario additionally forces a timeline provider failure then recovers to a genuine empty exam date sheet; this expanded case passes in Chromium and WebKit. Focused tests and targeted lint pass.
