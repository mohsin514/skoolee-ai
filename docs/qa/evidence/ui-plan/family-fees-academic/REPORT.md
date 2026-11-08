# Family, account, fees and academic UI adoption

Date: 2026-10-08. Scope: the nine directories delegated to this agent. This report does not certify all routes or authenticated roles.

## Result

- Inventoried **61 files**; changed **47**, retained **14** without changes. Exact per-file coverage is below and in coverage.json (generated artifact removed during merge cleanup).
- Baseline AST inventory: 221 native buttons, 29 selects, 3 textareas, 45 inputs. Final inventory: no native buttons/selects/textareas; four intentionally specialized native inputs remain (institution logo file, grading range, payment-method radio, CSV file). Standard fields use existing shared Input, Select, Textarea and Checkbox; ordinary and choice actions use shared Button.
- Existing field, action, focus, neutral card and table skin duplication was removed. Existing neutral cards use sk-panel; four native tables use the shared table family. Report-card scrolling retains the 22rem bound on Table.containerClassName, with one scroll owner. Exam table headers expose aria-sort.
- Choice buttons expose existing selected/toggle state; icon-only actions have names. Existing flex start alignment and stacked card display are explicit where Button's defaults would change them. Existing native labels remain associated, including formerly separate label/control pairs consolidated as wrapping labels.
- AcademicCalendar now uses the shared Modal instead of a custom portal and document listeners. It gets the central stack, focus trap, focus return and body lock. Its dirty guard remains; pending holiday saves protect fields and dismissal. Calendar day decoration no longer contains a second interactive element. ExamCycleManager's unused createPortal import was removed; its existing dialogs already use Modal.
- YearSetupWizard's small calendar is now one column at narrow widths, with full-height day controls and date/action names; its holiday and weekend handlers and values remain unchanged. Invoice status buttons wrap at narrow widths.

## Verification

- **11 focused Playwright cases passed (10.6s)** against the already-running local server on port 3000. The fixture mounts production components and production locale provider/catalog, while mocking the locale server-action boundary and intercepting every API request. Fee shell-only BrandButton/EmptyState and next/link are fixture shims. No live reset, credentials, financial, holiday or academic mutations were sent.
- Calendar original-source baseline: the Git HEAD component was mounted through the same fixture. It reproduced the missing aria-modal failure; baseline-calendar-dialog.png (generated artifact removed during merge cleanup) records the custom popover. The final focus/semantics case passes; calendar-dialog.png (generated artifact removed during merge cleanup) records the shared modal. Baseline is a replay of the original component with current shared primitives/styles, not a historical full-app screenshot.
- Scoped ESLint: all 61 production files plus the focused fixture/spec, **0 errors and 0 warnings**. See lint.json (generated artifact removed during merge cleanup). Owned git diff --check: passed. The root agent owns consolidated type checking, build and the full adoption guard/suite.
- Static contract comparison found all **357** tracked fetch, request, JSON.stringify and money-conversion call expressions identical to the pre-migration source. This supports payload/date/money preservation; it is not a substitute for live workflow tests.
- Browser launch initially hit the known macOS Chromium MachPort sandbox restriction. The approved escalation succeeded. Fixture-only selector/baseline resolver errors were corrected. The only product failure found in the focused run was invoice status-filter overflow at 390px; wrapping fixed it.

Commands:

```sh
TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts family-fees-academic.spec.ts --output /private/tmp/owned-ui-tests
# Expected failing original-component regression demonstration:
OWNED_BASELINE=1 TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts family-fees-academic.spec.ts --grep 'calendar dialog uses modal' --output /private/tmp/owned-ui-baseline
```

## Observed states and limits

| Surface | Actual observation | Not certified |
| --- | --- | --- |
| Academic calendar | Empty feed; selected layer/view controls; ADMIN holiday form; PARENT read-only dialog; date reversal/min constraint; dirty cancel; pending POST with exact synthetic body; failure/retry enabled; focus containment/return; EN/AR/UR narrow geometry | Real holiday success/reload; populated multi-event feeds; all roles; custom school locale policies |
| Invoice filters | Empty data; status selected state; named keyboard search; unchanged query/campus/page size; 390px no page overflow | Generation, refunds/voiding, payment posting, export, reconciliation, populated pagination |
| Academic model | Draft reset/title, year min/max, add period, read-only GET boundary, narrow geometry | Validation matrix, template delegation, preview, simulation, save, activation, historical reports |
| Account security | EN/AR/UR actual local copy labels; session fixture; current-password/one-time-code autocomplete; narrow geometry | Revoke session, MFA replacement, redirects, real session/account data |
| Currency | Existing localized label, KWD/JPY option values and change callback, narrow geometry | Persisted locale/currency policy, approvals, money calculations |

The calendar and currency checks use actual EN/AR/UR locale/catalog content. Account checks use its existing EN/AR/UR local copy. This is not a complete translation audit: calendar blocked-reason strings remain English in AR/UR (pre-existing copy); model, fees and wider academic views have mixed existing copy. No catalogs were edited by this agent. Synthetic RTL geometry is distinguished from complete translated-content coverage. Other owned files below have source adoption + lint coverage only. No authenticated whole-page pass is claimed; real role/permission/data combinations remain data-blocked or unobserved.

## Per-file coverage

| Source file | Implementation | Browser coverage |
| --- | --- | --- |
| `src/components/settings/LocaleSettingsPanel.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/settings/InstitutionSettingsPanel.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/YearEndPanel.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/ReportCardPipeline.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/DatesheetBuilder.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/ExamBoardCard.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/AcademicCalendar.tsx` | Migrated | Synthetic EN: modal focus/return, dirty guard, date boundaries, POST body, pending safeguards, ADMIN/PARENT boundary; EN/AR/UR 390px dialog geometry. |
| `src/components/academic/AcademicSubnav.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/components/academic/ExamTableView.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/GradingRulesPanel.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/AcademicHub.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/ExamTimelineView.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/ExamCycleManager.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/YearSetupWizard.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/RoomsManager.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/YearClosureChecklist.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/AcademicModelPanel.tsx` | Migrated | Synthetic EN: draft title, year bounds, add period, 390px geometry; no save/activation. |
| `src/app/account/security/page.tsx` | Migrated | Synthetic EN/AR/UR: account labels, autocomplete contracts and 390px geometry; GET fixture only. |
| `src/components/locale/LocaleProvider.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/components/locale/CurrencySelect.tsx` | Migrated | Synthetic EN/AR/UR: KWD to JPY value preserved; 390px geometry. |
| `src/components/academic/exams/ExamDetailDialog.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/exams/SeatingPlanner.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/exams/SessionWizard.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/exams/ExamsWorkspace.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/exams/ReportCardsPanel.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/exams/shared.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/academic/exams/MasterDatesheet.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/FeeInvoicesTab.tsx` | Migrated | Synthetic EN: selected status, keyboard search query, campus/page size, 390px wrap; no invoice mutation. |
| `src/components/fees/FeeOverviewTab.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/FeeReportsTab.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/FeeLayersTab.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/AccountsTab.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/FeeStructuresTab.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/fee-utils.ts` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/components/fees/fee-types.ts` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/components/fees/FeesPanel.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/components/fees/FeePaymentsTab.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/student/error.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/student/layout.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/student/student-data-context.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/student/attendance/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/student/timetable/page.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/parent/timetable/page.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/parent/parent-shell.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/loading.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/parent/error.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/layout.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/student/fees/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/student/student-shell.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/student/loading.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/student/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/parent-data-context.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/student/coursework/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/pupils/[id]/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/student/schedule/page.tsx` | Inspected; unchanged | Source/lint only; runtime unverified. |
| `src/app/memberships/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/attendance/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/student/reports/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/results/page.tsx` | Migrated | Source/lint only; runtime unverified. |
| `src/app/parent/fees/page.tsx` | Migrated | Source/lint only; runtime unverified. |

## Evidence

- [Focused spec](../../../../../tests/design-system/family-fees-academic.spec.ts) and [fixture](../../../../../tests/design-system/fixtures/family-fees-academic.tsx).
- Calendar: EN phone (generated artifact removed during merge cleanup), AR phone (generated artifact removed during merge cleanup), UR phone (generated artifact removed during merge cleanup).
- Invoice filters phone (generated artifact removed during merge cleanup), academic model phone (generated artifact removed during merge cleanup).
- Account: EN (generated artifact removed during merge cleanup), AR (generated artifact removed during merge cleanup), UR (generated artifact removed during merge cleanup).
- Currency: EN (generated artifact removed during merge cleanup), AR (generated artifact removed during merge cleanup), UR (generated artifact removed during merge cleanup).
