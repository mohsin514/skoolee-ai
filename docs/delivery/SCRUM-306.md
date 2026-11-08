# SCRUM-306 — list contract and inventory

## Contract (defined before implementation)

Lists are read-only GET operations. Authentication, module permission, tenant, campus and record predicates run before counting and paging. No persisted fields or migrations are introduced. Existing response shapes remain compatible. Page and size are positive safe integers with a bounded database offset; invalid URL values normalize to defaults. Sorting uses allowlisted fields and a unique ID tie-breaker. Query/filter/sort changes invalidate the page, while unrelated URL scope and draft parameters survive. Browser history must restore both controls and results. Retry repeats the read without business mutations; obsolete requests must not overwrite current results. Failed sources are explicitly partial; diagnostics must not contain raw search terms or database errors with record values.

## Inventory

- Shared record search: `/search` → `SearchWorkspace` → `/api/search` → `lib/search/service` → students/classes/users/admission applications. Campus operators, principals and receptionists have permitted record types. Other roles are deliberately denied by the existing product permission contract.
- Shared roster: `shared-admin/students-panel`, `workspace` controls, `/api/students`, consumed by administrative/academic portals. Search, categories/groups, class/year, guardian/login filters and preferences currently mix URL and local state.
- Platform/group administration: `/api/owner/{schools,users,sessions,audit-logs}`, `/api/super/{users,sessions,audit-logs}` use `ownerPagination`; platform owner is intentionally cross-tenant, group administration remains school scoped.
- Financial lists: invoices, payments and account ledger have independent offset parsing and date ordering; their reports/exports use the same authorized predicates but independent download contracts.
- Additional consumers requiring explicit regression coverage: admissions, operations library/inventory, chat directories/messages, audit history, teacher/parent/student dashboard lists, staff directories and entity pickers.
- Capacitor/Tauri wrap the web UI and API; no separate native query implementation found. No list mutation jobs or notification events are introduced. Existing business mutations and unsaved forms must stay independent of list query state.

## Validation and delivery

Evidence and final scope accounting will be appended after implementation and checks. This document is not a claim that every acceptance criterion has passed.

## Implemented

- Shared bounded pagination and URL patching; owner/super consumers retain their compatibility import.
- Namespaced URL state for roster filters, sorting and page size; owner/group searches and filters; teacher/enquiry/archive directories; library/inventory search; invoices/payments. Back and refresh read URL state without remounting drafts.
- Existing shared pager adopted by teacher and enquiry directories. Search offers name ascending/descending and retains unique tie-breakers. Roster, classes, invoices, payments and ledger also receive deterministic ties.
- Search clamps pages after results shrink, propagates denied options access, retries partial results with an actual request, aborts stale requests and bounds timeout. Request budgets use shared database counters. Sensitive search auditing records only access metadata, never terms or result contents.

## Validation to date

- `node --import tsx --test tests/lists/query.test.ts tests/owner/helpers.test.ts tests/search/result-href.test.ts`: 11 passed.
- `NODE_OPTIONS=--max-old-space-size=12288 tsc --noEmit`: passed. Default Node heap exhausted memory; larger heap resolves it.
- UI adoption: 8 passed. Authorization: 110 passed, 2 existing skips.
- Synthetic PostgreSQL/browser suite: 14 passed before the final invoice-specific case was added. Includes two tenants, two campuses, denied roles, revoked permissions, foreign class IDs, stable pages, stale pages, browser Back, refresh, stale response suppression, English/Arabic/Urdu, mobile overflow and audit privacy.
- Applied the existing `20261020900000_search_fold` migration to the isolated test DB; no new schema migration is required. Rollback is a code revert; existing records are unchanged.
- Actual screenshots attached to SCRUM-306: `scrum306-search-sorted-en-1440.png`, `scrum306-search-ur-390.png`, `students-directory-en-1440.png`.

## Open acceptance work (draft PR, not closure)

Complete financial/operations/owner consumer browser regression, large-dataset/performance and explicit offline/timeout/rate-limit recovery evidence. Audit remaining app list contracts (including library/inventory APIs and independently implemented admissions, chat and dashboard queries) for bounded server reads and consistent sorting/filter/paging. Some legacy endpoints still return complete authorized collections for form selectors, and some directories still page after loading; these are compatibility constraints, not a claim of full server-pagination coverage. Native wrappers share web code but device-specific testing remains outstanding. Do not close the card from this draft or the passing search suite alone.
