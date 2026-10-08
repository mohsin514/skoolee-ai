# FOUNDATION D — shared table accessibility

Date: 2026-10-08. Base commit: `bcd66035365201e90f9768dcfd612771cceab0aa`, with uncommitted shared foundation work from parallel agents. This report covers the bounded table changes and the requested workspace-title correction. It does **not** certify a feature route or the complete FOUNDATION D package.

## Reproduced problems

- The sortable workspace table showed sort icons but no `aria-sort` or column `scope`.
- Every record checkbox was named “Select row”; its identity and partial page selection were not exposed.
- A plain first cell used `<td onClick>`, with no keyboard action. A first-cell button could also bubble into that handler and invoke a second action.
- `start`/`end` alignment options were absent. The existing physical left/right meanings must remain available.
- Root's browser baseline found a clipped workspace title at phone width; the heading used `truncate`.

Five initial server-render regression tests were run against the original components and failed on the missing contracts. They passed after the changes; three further compatibility tests were added.

## Changed files and contract

- `src/components/shared-admin/workspace.tsx`: additive `caption`, `getRowLabel`, and `selectAllLabel` props; localized EN/AR/UR selection/action copy through the existing `useLocale`; native mixed checkbox state; column scope and active `aria-sort`; logical start/end alignment alongside unchanged physical left/right; native keyboard action beside noninteractive first-cell content; long heading wrapping.
- `src/components/ui/table.tsx`: `TableHead` defaults to `scope="col"`; explicitly provided HTML props still override it, including `scope="row"`.

The row's authored label is never translated. A supplied `getRowLabel` is preferred; otherwise the first cell's declared text is used, falling back to the row key. Header selection names default to “all displayed rows”; callers may supply an already localized `selectAllLabel` describing a different existing callback scope. Sorting, row keys, selected IDs, pagination and mutation callbacks retain ownership in callers.

The fallback Open button is a sibling of rendered content, not a wrapper. Native controls, the shared `Button`, href-bearing custom links and declared button/link roles suppress it. Truly opaque components can set the first `DataColumn.rowAction` to `"provided"`; the table does not invoke custom components to discover their markup. Cell pointer activation remains available, but clicks from controls no longer also invoke the cell handler. Each column render callback runs once per row.

Five existing `onRowClick` consumers were inspected: shared student roster, teacher student roster, report-card roster, faculty roster and admission enquiries. The shared student roster already supplies a native first-cell button and keeps that single action. The other four use plain first-cell markup and receive the additive Open action. These were source inspections, not authenticated feature-page browser passes.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| `node --import tsx --test tests/design-system/workspace-table.test.tsx` | PASS — 8 tests | Sort semantics, caption, selection identity/mixed ARIA, explicit callback-compatible action, alignment aliases, basic-header scope override, custom Button/link, opaque-control policy, one render per cell |
| Scoped ESLint for both changed components and three new test files | PASS | No new focus-ring overrides or adoption exemptions |
| `TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts tests/design-system/workspace-table.spec.ts --output test-results/foundation-d` | PASS — 3 cases, final run 3.1 seconds | Chromium via installed Playwright 1.62.1; one EN, AR and UR case |
| `git diff --check -- src/components/shared-admin/workspace.tsx src/components/ui/table.tsx` | PASS | Scoped patch whitespace |

Each browser case checks keyboard Enter sorting, Enter/Space row activation, single activation for a supplied button, first-cell pointer compatibility, native indeterminate/checked transitions, empty-state select-all disabling, no nested controls, computed logical end/physical right alignment and localized action/selection labels. Geometry and screenshots cover 1440×1000, 768×1024 and 390×844. Long EN/AR/UR headings wrap without clipping or whole-page overflow; the icon remains fixed. Wide table scrolling stays inside the existing table wrapper.

The browser test bundles the actual `DataTable`, `Checkbox` and `WorkspaceHeader` sources into a synthetic document intercepted only by Playwright. It loads the actual application CSS and root font classes from `/design-system?patterns=application`. The locale provider is a fixture boundary supplying each language; no real records, sessions or backend mutations are used. Test-fixture text such as column labels is deliberately English; the new table copy and long heading samples exercise all three languages. This proves local label behavior and RTL layout, **not** full locale-provider/service integration.

An intermediate fixture attempt accidentally copied Next devtools shadow-root styles, contaminating table alignment. The final harness copies only document styles and uses a same-origin intercepted document. Final computed-style assertions pass against the application CSS; no global CSS workaround was added by this agent.

## Screenshots

| Locale | Desktop | Tablet | Phone |
| --- | --- | --- | --- |
| English | 1440 (generated artifact removed during merge cleanup) | 768 (generated artifact removed during merge cleanup) | 390 (generated artifact removed during merge cleanup) |
| Arabic | 1440 (generated artifact removed during merge cleanup) | 768 (generated artifact removed during merge cleanup) | 390 (generated artifact removed during merge cleanup) |
| Urdu | 1440 (generated artifact removed during merge cleanup) | 768 (generated artifact removed during merge cleanup) | 390 (generated artifact removed during merge cleanup) |

Representative EN desktop, AR tablet and UR phone images were visually inspected. The final refresh retains the application's root font classes. Existing interactive-cell content remains unchanged; fallback actions sit beside plain content with a 44px minimum height, so dense rows may become taller when they previously lacked a real action target.

## Remaining scope / UNVERIFIED

- Authenticated feature routes, role/tenant gates, production locale loading, business workflows and real table datasets remain UNVERIFIED by this batch.
- Screen-reader announcements, WebKit/Firefox, real mobile keyboard/safe areas, zoom/forced-colors and additional viewport sizes were not checked here. Browser binary version beyond the installed Playwright package was not captured.
- Named keyboard-scroll regions/hints, secondary-column recovery, full bulk-selection policy, list pagination, general task feedback and the remainder of FOUNDATION D require subsequent scoped work. The current selection callback's business scope was not changed.
- Root owns consolidated type-check/build and broader regression checks. This agent did not run a full build or type-check, following the requested cost limit.

No route checklist row is promoted to PASS by this report.
