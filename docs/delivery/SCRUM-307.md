# SCRUM-307 — record presentations

Jira: https://skooleeai.atlassian.net/browse/SCRUM-307

## Contract and boundaries

The presentation is local metadata, never authorization or business state. `view.<workspace>` accepts table/cards/grid/calendar. URL wins over a validated local-storage preference; Back restores the previous presentation. Only that namespaced parameter is changed, preserving scope, filters, record links and hash. Existing forms, detail dialogs, selection, pagination and query state stay in the parent. No network mutation or list refresh is triggered by a view switch. No records or personal information are persisted by this feature.

Table, grid and calendar consume the identical authorized row array, field renderers, permission-gated actions and stable row key. Existing domain cards remain in place. Grid is a responsive field grid. Calendar is a chronological agenda of the displayed records, explicitly labelled with the date field and configured timezone; the current page/filter boundary is visible. Missing/invalid dates appear in an undated group, never disappear. Enrollment and follow-up are civil dates; faculty joining dates use their civil date. The shared calendar also accepts explicit-offset instants and maps them with the locale's IANA timezone. No browser-local date parsing for day assignment.

No schema, migration, backfill, new endpoint, job, event, notification or business mutation is introduced. Existing list read contracts, server authorization, edit concurrency, idempotency, rate limits, audit and error responses are reused. Exports use the existing filtered records, independent of presentation. Rollback is a code revert; existing storage values remain compatible.

## Inventory and consumer accounting

- `shared-admin/workspace.tsx`: common preferences, view buttons, DataTable, selection and action renderers. Added grid/calendar here, not a parallel data workflow.
- `shared-admin/students-panel.tsx`: admin, principal and permitted operations student rosters; enrollment-date calendar, existing paging, bulk selection and read-only field filtering.
- `shared-admin/index.tsx` faculty panel: existing role-gated open/revoke actions, joining-date calendar. Pending invitations retain their separate invitation workflow under the directory.
- `shared-admin/index.tsx` enquiry panel: admin/reception admissions, next-follow-up calendar, same contact and detail actions, loading/error/empty states.
- `app/teacher/students/page.tsx`: assigned-student directory, enrollment-date calendar; source query/class effects observe those fields rather than a presentation-only URL change.
- `app/actions/dashboard.ts`, `/api/students`, `/api/admission-queries`, `lib/api/scope`, `lib/admissions/enquiries`: traced data sources and authorization. No additional read fields requested. Scoped inputs and existing mutation endpoints remain authoritative.
- `insights/chart-kit.tsx` and `design-system/ApplicationPatternsReference.tsx`: static DataTable consumers retain the default table rendering. They do not offer record-layout preferences.
- `academic/AcademicCalendar`, `YearSetupWizard`, `ExamCycleManager`, `ExamTimelineView`, `timetable/*`: specialized scheduling/editing workflows already have domain calendars/boards; these are intentional exceptions to generic record presentation. Their editing state and publication workflows are not replaced.
- Search results, financial ledgers, reports, form pickers and dashboard metric tiles are not interchangeable directory presentations; they retain their specialized controls. SCRUM-306 owns shared list-query/pagination corrections.
- Capacitor/Tauri wrappers render the same web consumers. Responsive web is covered; native device builds are a separate verification item, not implied by browser tests.

## SCRUM-306 dependency

PR #118 is open and unmerged. This branch starts at origin/dev 0de67d36 and imports none of its list feature code. Both changes touch the directory files; merge conflict review is required, but the view parameter has a separate namespace and is compatible with SCRUM-306 list state. Two minimal harness prerequisites also present in #118 are included after verification: the outbox API command needs the existing server-only preload (confirmed failing in this PR's CI), and the correction browser test must use the existing mobile combobox below 640px instead of its hidden desktop tab. These do not import or restart SCRUM-306's feature scope. SCRUM-306's truncated enquiry collection, independent-list inventory and residual query work are not silently claimed here.

## Failure behavior

Storage failures do not prevent view switching; malformed preferences and invalid URL layouts fall back safely. Existing loading, no-match, denied, offline/server and mutation-conflict surfaces remain owned by consumers. Presentation switching itself cannot create partial business effects or duplicate submissions because it performs no request. Date parsing failures retain the record in the explicit undated group. Existing drafts and dialog state are outside the presentation branch.

## Validation

- Date tests: civil date invariance, leap dates, invalid dates, DST fold/gap, midnight/year crossing, invalid timezone, identity and no omissions.
- Render tests: stable identities, actions, disabled permissions and selection across table/grid/calendar.
- Existing DataTable accessibility regression suite.
- Live browser/API suite: synthetic permitted and denied roles, two schools and three campuses, directory navigation, selection, refresh/Back, teacher context, Urdu/mobile, screenshot evidence.
- Final check results and remaining acceptance gaps are recorded in SCRUM-307-result.json. Do not infer full acceptance from this implementation inventory.
