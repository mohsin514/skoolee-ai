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

## Current verification
The expanded suite contains 17 browser/API scenarios. All have passed in Chromium and WebKit: a complete 14-scenario Chromium run plus the new cases and updated notification wording; a 15-scenario WebKit run with one teacher-timetable timeout followed by a passing isolated rerun and both new queue/integration cases. Initial WebKit login attempts were interrupted by development compiler restarts; the isolated server was restarted with an 8 GiB heap. These local retries are recorded, not counted as first-run passes. Latest-head CI must also pass.

Coverage includes all 11 canonical role dashboards; provider, timeout, denial and recovery; true offline keyboard retry; English and Urdu RTL at 390px; query refresh; retained library drafts with Save disabled during denial; duplicate/conflicting submissions; tenant/campus API denial; learner and teacher timetable dependencies; exam timeline; family fee header claims; front-desk queue; failed notification save; disabled denied report export; family result notes; staff trip queues; and integration delivery filters.

The broad regression run passed 172 tests with two pre-existing skips across authorization, navigation, notification links, shared states, localization and UI adoption. The focused suite adds confidential-log protection. Application types and targeted lint pass; rerun after any subsequent change. Twenty-three synthetic screenshots are saved on Jira. The PR web link remains persisted on the ticket.

## Additional shared and consumer corrections
The existing useFetch hook now uses checked reads, a 20-second timeout, request sequencing, cancellation, optional collection validation and URL-bound results. A previous request or finalizer cannot overwrite the selected scope. Its failure object drives the same ErrorState used elsewhere; existing string error consumers remain compatible. Explicitly disabled reads do not auto-run on connectivity restoration.

Family notes, weekly digests, care messages, journey cards, learning-transfer lists and staff leave/trip queues reuse that hook. Compact optional cards omit themselves only after a genuine empty success. Staff trip selectors are required dependencies. Integration connection/delivery reads preserve filters and expose failures instead of empty delivery histories. Detail fetch failures are caught; worker replay/idempotency contracts are unchanged.

The receptionist dashboard reuses the existing private dashboard hook. Its queue rejects a failed dependency. Family fees clear header summaries while reading or failed. Teacher/parent timetable, unified academic calendar and cover follow-up use checked reads and latest-request guards. Owner capacity export is disabled until a current successful read. Optional teacher-availability enrichment clears stale records on failure and keeps its inline unavailable indicator.

Notification Seen/Open/Mark all actions only report success after a confirmed server response. A ref blocks same-tick duplicates. Failed saves retain unread state, and denied/session failures remove protected results. Mutations are never automatically replayed. Internal errors suppressed by userMessage no longer print confidential raw exception payloads.

## Acceptance limits and remaining audit
This is still a draft, not a claim of full issue acceptance. The 271-entry candidate inventory records the exact reviewed portions; it does not mark every raw fetch site complete. Remaining examples include care pickers/queues, transport planner/riders/offline queue, identity candidates, dormitory pupil history, learning-transfer detail/mapping, and independent owner/report/form mutations. Existing domain-specific flows need explicit classification and preservation review before the card can advance.

Capacitor/Tauri render the shared web application; no native bridge or packaged-asset changes are introduced. Chromium/WebKit coverage is not a claim that installed iOS/Android/Tauri clients have been exercised. Native acceptance remains unverified. No schema migration or backfill is required; rollback is the code revert. Keep Jira In Progress and do not merge or advance the queue until full acceptance and latest-head checks/reviews are recorded.

The previous pushed head 866e9493 passed all ten GitHub workflows with no review findings. Its five Vercel statuses explicitly read `Deployment rate limited — retry in 24 hours.` That exact exception was permitted; it is not deployment validation. Each new head requires a fresh check.

## Dev reconciliation
PR #118 landed on dev during this work. Merged dev commit 8ede23c3 and reconciled its pagination, sorting, URL history and complete-list collection with the classified failures, latest-request guards and disabled denied submissions. Search retains pushState/back support with typed timeout outcomes. Paginated selectors now classify HTTP failures before parsing and never return partial collections. The earlier notes about #118 being unmerged are historical; #119 remains independently scoped. Full acceptance gaps above still apply.
