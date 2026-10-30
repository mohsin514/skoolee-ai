# Implementation sequence and validation

This plan improves appearance and usability while preserving business behavior. Start with a browser baseline for the selected batch, fix the shared foundation, then migrate pages in small groups. Source findings below identify what to reproduce; they are not claims of completed manual testing.

## Work package size and ownership

Use one foundation change or two to four closely related routes/views per implementation batch. A route with several large forms or console panels may require multiple batches. The 99 local console views are individual targets; reviewing a console home page does not clear its other views. Reused panels must still be checked in each role wrapper and permission context.

The checklist batch tag gives each route/view its primary migration owner. Other mentions below are consumer/integration checks: pupil detail belongs to STUDENTS with FAMILY access checks; subscription, suspended and payment pages belong to FINANCE with ONBOARDING transition checks; payroll belongs to FINANCE. Shared consumers can be checked early without duplicating ownership.

Every batch has: a route/view list, allowed files, a user problem, a proposed change, behavior invariants, baseline evidence, acceptance cases, implementation evidence, tests, and unresolved items. The worker updates the checklist after each batch. Do not leave a batch simply marked complete without evidence.

Read the current `AGENTS.md` and the installed Next.js guides relevant to files being changed. Next.js 16.2.3 is installed in the snapshot. Keep server layouts server-side; add client boundaries only where interaction needs them. Preserve awaited request APIs and promised route params. Use the local guides as implementation references.

## Ordered batches

| Order and tag | Scope and files | Concrete output | Acceptance before moving on |
| --- | --- | --- | --- |
| FOUNDATION A | `globals.css`, the existing design-system reference, source inventory/checklist | Baseline screenshots; documented computed styles; semantic token aliases; resolve a demonstrated cascade/focus/motion inconsistency in a small change | Field, button, card, table and modal samples still match intended appearance; no focus or contrast regression; all three languages recorded individually |
| FOUNDATION B | Existing fields, button, label, `form-field`, `input-group`, date picker | Stable field/button contracts and missing supported state examples; keep current public APIs | Keyboard/date/validation/autofill/RTL/disabled/loading states tested; adoption guard still passes |
| FOUNDATION C | `modal.tsx`, `dialog.tsx`, confirmations, existing wrappers | Consistent close policy, nested focus handling, dialog/sheet sizing, busy/discard behavior, layer contract | Open/close/Tab/Shift+Tab/Escape/backdrop/dirty/busy/nested/date-picker flows pass on phone and desktop |
| FOUNDATION D | `shared-admin/workspace.tsx`, table primitives, subnav, task feedback, skeletons | Keyboard-operable row actions, sort semantics, explicit selection scope, reusable empty/error/loading patterns | Dense/long/empty/error data states; selection and pagination; keyboard and RTL; no page-level overflow |
| FOUNDATION E | Shells, role page wrappers, older dashboard adapter, chat/toast coexistence | Shared spacing, responsive and safe-area rules; improved header/navigation only where supported by baseline issues | Expanded/collapsed sidebar, mobile navigation, header menus, scroll restoration, access recovery, chat and modal layering |
| AUTH-PUBLIC | Auth routes first in small groups; then public product/policy/pricing pages | Clear labels, form order, validation, password controls, loading/error states, readable public typography | Every route and redirect checked; no token/password exposure; EN/AR/UR content and applicable policies preserved |
| ONBOARDING | Registration continuations, onboarding, package selection/status, teacher onboarding, suspended/subscription/payment routes | Clear progress, next action, recoverable failures, truthful payment/status feedback | Resume/refresh/back/error/pending/completed/expired cases; use synthetic checkout data only |
| FAMILY | Parent pages, then student pages, shared pupil detail | Clear child/student context, results, attendance, timetable, fee visibility and history | Linked-child switching; legitimate no-data vs access denied; long names; authorized student access as parent; no cross-child confusion |
| TEACHING | Teacher overview/classes/students; attendance; marks/tests; reports; calendar/timetable; AI/insights/leave | One task-focused header, consistent filters and actions, preserved drafts/locks/review status | Unsaved work, validation, permission, stale data, generation progress, keyboard entry and error recovery |
| STUDENTS | Admin/principal student panels, admissions, classes, promotion/archive, older student routes | Shared roster/search/table/form behavior with domain-specific required steps intact | Create/edit/import validation, class membership, empty filters, bulk scope, archive confirmation and recovery |
| ACADEMICS | Year/model/setup, rooms, calendars, timetable, exam cycles, grading/report pipeline | Reuse academic panels, legible progress/dependencies, explicit locked or unavailable actions | Each nested panel/tab and wizard step; year/cycle guards; scheduling conflicts; drag alternative; review/publish gates |
| STAFF-OPS | Teachers/staff/hierarchy/permissions/leave; transport/dormitory/inventory; librarian and reception sections | Consistent list/detail/form pattern and role-specific task actions | Role restrictions; leaf sections; constrained data; nested dialogs; attachment/search/issue-return workflows |
| FINANCE | Accountant views, fee components, invoices/payments/accounts/payroll; family fee reuse; billing panels | Clear amounts, dates, status, reconciliation and correction feedback | Integer money and locale formatting unchanged; partial/failed/pending payment states; destructive/submit double-click protection; print/export controls |
| PLATFORM | Owner and super views, support access, plans, approvals and platform settings | Clear tenant/campus context, sensitive action explanation, scoped navigation | Every local view, cross-tenant administrative scope, support-access expiry, denied controls and modal states |
| CROSS-CUTTING | Messages/chat, jobs, memberships, invitations, locale/account settings, corrections, error/404 boundaries | Consistent recovery, accessible menus/alerts, state-specific guidance and translated labels | Context preservation, reconnect/retry, expiring links, stale sessions, restricted recipients/actions, boundary reset |
| LEGACY | Remaining `/dashboard/*` routes and older headers after their feature batches | Bring each page onto the verified shared primitives and surfaces | Each route manually checked; old scoped CSS removed only after every affected page is migrated |
| COVERAGE CLOSEOUT | Entire updated checklist and new route discovery | Reconciliation report, evidence index, remaining issues, scoped completion statement | Every discovered target accounted for; no unexplained omissions or inherited historical PASS claims |

The order is a dependency sequence, not an instruction to redesign unrelated product workflows. If a blocking shared defect is discovered later, fix it in its owning component, validate its consumers, and resume the feature batch. Do not create all proposed missing components speculatively before a page needs them.

## Source findings to reproduce first

| Priority | Source concern | Smallest reproduction | Intended correction if confirmed |
| --- | --- | --- | --- |
| P1 | Shared modal has multiple dismissal paths; busy confirmation and dirty guard behavior may differ between Escape, backdrop, close button and sheet drag | Submit a synthetic delayed operation, then attempt each dismissal method; open discard confirmation and Tab in both directions | Route all close attempts through one explicit policy; keep active dialog focus contained and restore it predictably |
| P1 | Generic workspace table may rely on clickable cells for row activation and omit sorting/row-selection semantics | Navigate a populated sortable/selectable table using only keyboard and inspect accessible names | Use actual link/button row actions, `aria-sort`, and entity-specific selection labels without changing sort/data behavior |
| P1 | Global unlayered rules and older dashboard utility overrides can defeat shared utility tokens | Inspect computed border, radius, focus, hover, invalid and disabled styles in a regular role page and `/dashboard` | Resolve cascade locally with a verified layer strategy; remove old overrides only after their consumers are covered |
| P2 | Several reduced-motion rules express different behavior | Inspect animation/transition computed styles with reduced motion on; include logo, skeleton, modal and chat | One coherent motion contract; meaningful loading feedback remains visible without movement |
| P2 | Missing or inconsistent safe-area utility and fixed mobile bars may obscure controls | Phone with bottom inset, open keyboard, show toast and chat; inspect last field and last action | Define the shared utility where appropriate and reserve correct space for navigation/keyboard/footer |
| P2 | Eleven paths are exempted from shared-field adoption | Audit those exact paths in `tests/design-system/adoption.test.ts` | Migrate one path at a time, then remove its exemption after checks; never enlarge the exemption list |
| P2 | Dark variables coexist with white/hard-coded surfaces | Render a selected component sample under `.dark` | Preserve or improve contrast for changed components; track remaining dark mode coverage explicitly |

Severity is based on impact: P0 exposed data or irreversible incorrect action; P1 blocked task, inaccessible essential action or lost work; P2 substantial confusion/inconsistency; P3 visual polish. Escalate a source concern only after recording its reproduction and affected users. Security/business-logic findings need their own fix scope, not a cosmetic workaround.

## Page recipes

These recipes are target compositions using existing components. Exact primitives/classes are in the token and component specifications. They define where to place information without mandating a rewrite of every file.

### List and management page

Use the existing role page wrapper or `WorkspaceHeader`, followed by compact statistics only when useful, `WorkspaceToolbar`, the chosen list view, `SelectionBar` when rows are selected, and `Pagination`. Put the primary create/action button in the header. Search has a visible or programmatic label; filters expose their active values and a clear reset. Keep result count next to the filters/results. Hide empty metrics only when that is truthful; zero is a valid value.

At phone widths stack the title and action area, allow the toolbar to wrap, and choose a deliberate table strategy. Simple records can use an existing card view with the same actions and state. Wide financial or grading tables retain a horizontally scrollable inner region with sticky identifying columns where safe; the whole page must not scroll horizontally. Essential data/actions must remain discoverable. Never render two independently fetched copies of a list solely for responsiveness.

Selecting all must communicate whether it means the current page, filtered results, or all records. Bulk confirmation states the count and target type. Changing filters or pagination follows the existing selection policy; any change to that policy must be explained and tested. Preserve search debounce, pagination bounds, URL behavior and workspace preference scope.

### Form page or form dialog

Order fields by user task: context and identity, required details, optional details, then review/submit. Use `FormField` for label, description and error; use `InputGroup` for affixes/actions. Group related fields under a real heading or `fieldset`/`legend` when their relationship is semantic. One column on narrow phones; two columns only for short related fields at the documented breakpoint. Long text and complex selection fields span the full width.

Show requiredness in text and programmatically. Use appropriate autocomplete and input modes. Validate on submission and, once an error is exposed, on the relevant correction event; do not show errors on untouched fields immediately. Keep user-entered values after server rejection. Move focus to the error summary or first invalid field and link summary items to the controls. Inline errors explain what to fix; a toast is supplementary.

During save show a localized busy label, prevent duplicate mutation, and retain the form/draft. After success reflect the persisted result and clear dirty state only when persistence is confirmed. Do not optimistically claim that financial or publish operations succeeded before the server confirms. A submission error must leave the task recoverable. Preserve existing draft version, record key, tenant scope and stale-record checks.

### Detail and review page

Header shows the record name, context, status, and one primary next action. Read-only information uses labelled text or a definition list, not disabled form controls. Group secondary actions in a menu only when the menu contract is implemented. Keep destructive actions visually separated and name their exact consequence. Timeline/history entries distinguish creation time, effective date, actor and current state where those already exist.

Review/publish/approve flows preserve required reviewer checks, version identity and locks. Make unavailable actions explain their prerequisite without revealing unauthorized data. Long summaries and localized names wrap. Read-only family views reuse the corresponding data presentation while preserving their restricted action set.

### Dashboard and metrics

Start with a useful status or task summary, then urgent actionable items, followed by supporting metrics. Preserve feature-specific cards and charts. Make cards clickable only when they have a clear destination and semantic link/button. Avoid charts that communicate only by color; use labelled values and a text/table alternative for essential data. Empty/no-permission/failed-load metrics must not appear as a misleading zero.

Use a stable responsive metric grid: one column when a card cannot fit, two on suitable phones/tablets, and more only where labels remain readable. Keep whole numbers, currency and trend labels legible. Do not invent trends or new metrics. Remove decorative content only when the baseline shows it obstructs a task and the before/after evidence demonstrates the benefit.

### Timetable and complex editors

Retain the domain-specific grid and controls. Identify day, period, class/teacher/room and selected context explicitly. Preserve conflict indicators and unavailable slots. Provide a keyboard or form-based alternative to drag-only actions. Keep a visible instruction for navigating the wide grid, maintain header/row relationships, and confine horizontal scrolling to the editor. Verify selection and scroll position after save, failure, filtering and switching views.

### Wizard and setup flow

Show current step and total where stable; explain prerequisites before the user reaches a blocked action. Preserve values when moving backward. Distinguish saving a draft from completing setup. Give a review step when existing business rules require it. On failure retain completed steps and show the specific recovery action. Do not allow Back/Close to silently discard entered data.

### Search, menus and notifications

Search must identify its scope. Distinguish no records from no matches, and offer reset filters for the latter. Announce a meaningful result-count change without announcing every keystroke. Keep clear controls keyboard accessible. A navigation link stays a link; an action stays a button. Do not make ordinary site navigation into an ARIA application menu.

Toasts report a completed action or supplemental error; persistent task errors stay near the affected content. Do not hide required confirmation, invoice status, recovery instructions or validation only in a timed toast. Keep the single app toaster, current safe-area offsets and stacking behavior until coexistence with modals/chat is verified.

## UX evidence before changing a workflow

For each larger change record the following before implementing it:

```text
Issue ID:
Route and local view:
Role, locale, viewport, fixture:
User goal:
Observed obstacle and exact reproduction:
Current number of steps or misleading state:
Proposed smaller/clearer flow:
Business rules, permissions and data that must remain:
Before evidence:
Acceptance task:
After result and evidence:
Remaining limitation:
```

Prefer localized labels that name the action and object. Choose defaults from existing valid context, not arbitrary values. Do not replace translations with English literals. Avoid removing required fields, permission gates, review steps, audit history or business confirmations to reduce clicks. Visual grouping and better labels are usually safer than a new navigation model; larger changes require a written rationale in the batch report.

## Responsive validation matrix

| Viewport | Purpose | Required scope |
| --- | --- | --- |
| 320 × 720 | Narrow-phone stress case | Every distinct page composition and any page with dense tables, dialogs, long labels or overflow risk |
| 390 × 844 | Standard phone | Every route and important local view |
| 430 × 932 | Larger phone | Every distinct shell, long form, modal/sheet and dense feature composition |
| 768 × 1024 | Tablet portrait | Every route and important local view |
| 1024 × 768 | Tablet/laptop boundary and short viewport | Navigation breakpoints, long forms, sticky bars, calendars and modal placement |
| 1440 × 1000 | Desktop | Every route and important local view |
| 1920 × 1080 | Wide display | Dashboards, analytics, large lists and every distinct page composition |

Every route's core content is inspected in EN, AR and UR at 390, 768 and 1440 widths. Redirect-only routes verify the redirect and its destination in applicable locales. Runtime dynamic routes use synthetic valid, missing and forbidden IDs. The development reference needs Urdu support before its Urdu cases can pass; current EN/AR-only reference controls do not count as Urdu coverage.

Exercise each important page-local interaction at the core device sizes and supported locales where the interaction is present. Shared primitive behavior may additionally use its focused reference suite, but that never replaces checking the real page integration. Record justified not-applicable cases with a reason. Record unavailable data, roles, languages or target environments as **UNVERIFIED**, not PASS.

When shells, modals or navigation breakpoints change, also check widths 639/640 and 767/768. Use the main browser first and include WebKit/Safari and a second desktop engine for shared fields, date/select enhancements, dialogs, viewport sizing, autofill and safe-area behavior where those browsers are supported. Missing engines remain named coverage gaps. Check real text zoom at 200%, reflow under browser zoom, touch, software keyboard, reduced motion and forced-colors mode on changed shared components. Desktop emulation alone is not evidence for native mobile keyboard or device safe-area behavior; record that limitation.

## Interaction matrix for each page

Expand the following into individual case records when applicable:

| Area | Cases |
| --- | --- |
| Data | Initial loading, loaded, zero records, no filter matches, large dataset, very long names, mixed-script text, missing optional values |
| Access | Authorized role, read-only role, revoked/denied access, signed out, expired session, suspended account and feature/module unavailable |
| Form | Empty submit, malformed values, field/server errors, keyboard submit, password visibility, autofill, file errors, date boundaries, disabled/read-only values |
| Mutation | Saving, success, failure, retry, double-click, stale version, unsaved close, draft restore, lost connection and reconnect |
| Overlay | Trigger by keyboard, initial focus, Tab loop, reverse Tab, Escape, backdrop, close icon, nested confirmation, return focus, mobile scrolling |
| Table/list | Sort directions, page boundaries, page-size change, select one/all, bulk actions, row action keyboard access, empty search, horizontal scroll and RTL |
| Navigation | Active item, local sections, direct deep link, reload, Back/Forward, collapsed sidebar, mobile overflow menu, permission-dependent visibility |
| Feedback | Hover, pressed, focus-visible, invalid, disabled, busy, success/error/status announcements; toast placement and duplicate suppression |
| Locale | Long translations, AR/UR direction, numbers/money/dates, weekday/weekend conventions, icons, placeholders, error copy, portal direction |

Never simulate a successful backend save just to mark the workflow as passing. A mocked UI fixture may prove the rendering/recovery contract; mark it as mocked and separately record that real integration remains unverified.

## Accessibility acceptance

Use semantic HTML before adding ARIA. Keep a logical heading hierarchy, visible labels, and meaningful names for icon controls. Status is communicated in text as well as color. Normal text must meet 4.5:1 contrast; qualifying large text must meet 3:1. Evaluate actual backgrounds, gradients, opacity and states, not token values alone. See the [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

The product target is at least 44 × 44 CSS pixels for standalone touch controls, preferably the existing 48px field height. This is a product design target; WCAG 2.2 AA's target-size criterion is 24 × 24 with stated exceptions, not a universal 44px minimum. See [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Dense controls can have smaller visible icons inside a sufficiently large target without overlapping adjacent targets.

Modal focus enters the dialog, remains in the active dialog, and returns to the invoking control or a sensible surviving destination. Keep an accessible title and visible dismissal. Escape ordinarily dismisses; any temporary exception for a noninterruptible operation must be explicit, announced, and released on completion/failure. Use the existing modal engine. See the [W3C modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Menu buttons expose expanded state and menu semantics only for actual menus. Enter/Space opens an action menu and transfers focus; Escape closes and restores focus; arrow-key navigation must match the menu contract. Ordinary navigation and simple disclosure panels retain their native semantics. See the [W3C menu-button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).

For each changed essential flow, perform a keyboard-only pass and a screen-reader spot check in the available platform reader. Inspect accessible names/states and announcements. Automated accessibility checks are supplemental. Do not claim screen-reader or contrast verification without recorded results.

## Locale invariants

Use `useUiText`/`UiText` and existing feature dictionaries. Interface copy is translated; user-authored names/content must not be fed through the UI translation dictionary. Preserve `dir="auto"`/`bdi` for mixed-script content where appropriate. Emails, URLs, phone/number fields may remain LTR inside RTL layouts; do not mirror data itself. Directional arrows may mirror; brand marks, checkmarks and nondirectional icons do not.

Use logical margins, padding, borders and text alignment. Verify direction in portals as well as page content. Retain the existing locale package for currency, numbering, timezone, calendar, week start and weekend. Date-only values must not acquire a timezone conversion; instant timestamps must follow the configured timezone. Keep integer minor-unit money parsing/formatting intact. Do not silently default all financial output to PKR or assume all currencies have two decimals.

English uses the established Plus Jakarta Sans stack. Arabic/Urdu need actual glyph and line-height checks against the font contracts; the presence of Noto font files alone does not prove browser adoption. Test diacritics, multiline labels, mixed English/numeric content, and focus/selection in those scripts.

## Evidence and checklist rules

Use these exact statuses:

| Status | Meaning |
| --- | --- |
| NOT STARTED | Target identified; audit has not begun |
| IN PROGRESS | Work or validation is actively underway |
| PASS | All declared required cases for this target passed on the recorded build with evidence |
| NEEDS FIX | A reproduced issue remains unresolved |
| UNVERIFIED | A required case remains unchecked or could not be completed in the batch; record the remaining check or blocker and next step |

Keep a separate `verification` outcome of `UNVERIFIED` until the required checks pass; failures, blocked cases, missing roles/data and untested states never receive a passing outcome. Initial checklist rows therefore have `status=NOT STARTED` and `verification=UNVERIFIED`; reproduced failures use `status=NEEDS FIX` and still `verification=UNVERIFIED`.

A route's aggregate status cannot be PASS while one required device/language/role/state is unverified or failing. Use separate case rows to prevent a later result overwriting an earlier failure. A genuinely inapplicable state needs a written reason, not an invented PASS. An inaccessible authorized route is a blocker; a deliberately forbidden route can pass its denied-access case.

Create a per-batch folder such as `docs/qa/evidence/ui-plan/foundation-c/`. Store synthetic/redacted screenshots, relevant trace references and a short report. Record current commit plus whether the worktree is dirty; evidence must identify the code actually tested. Keep secrets, session state and real personal records out of evidence.

Minimum case-record shape:

```json
{
  "id": "UI-TEACHER-MARKS-001",
  "route": "/teacher/marks",
  "view": "mark-entry",
  "source": "src/app/teacher/marks/page.tsx",
  "build": "commit plus dirty-worktree note",
  "role": "TEACHER",
  "fixture": "synthetic-scoped-teacher",
  "language": "ur",
  "viewport": { "width": 390, "height": 844 },
  "browser": "record engine/version",
  "state": "save failure retains entered marks",
  "status": "NOT STARTED",
  "verification": "UNVERIFIED",
  "testedAt": null,
  "steps": [],
  "expected": "Localized error is visible; marks and dirty state remain; retry is possible",
  "actual": null,
  "evidence": [],
  "issue": null,
  "blocker": null
}
```

Record UX issues separately with severity, user impact, source, before/after evidence and fix. Screenshots prove only the visible state; interaction claims also need steps and observed results or a trace. Keep the route checklist linked to these case reports.

## Checks and commands

These are implementation commands, not a claim they were run for this documentation task. Read the target test's setup before execution. Local database-backed suites must use confirmed isolated synthetic data. Do not run reset/seed/schema-push commands for a styling batch. Keep existing unrelated changes and baseline failures visible in the report.

From the repository root, use the applicable subset after each batch:

```sh
# Type-check after component/API changes; avoid writing an incremental cache.
npx tsc --noEmit --incremental false

# Lint actual edited TypeScript files, adding each explicit path as needed.
npx eslint src/components/ui/button.tsx src/components/ui/form-field.tsx

# Existing source/adoption/navigation contracts.
node --import tsx --test tests/design-system/adoption.test.ts tests/design-system/navigation.test.ts tests/design-system/navigation-recovery.test.tsx

# Pure locale contracts when formatting or interface copy changes.
npm run test:locale
node --import tsx --test tests/locale/ui-coverage.test.ts

# Start a local dev instance only if no suitable instance is already running.
npm run dev -- --port 3005

# In a separate terminal; select focused specs if the batch has narrower scope.
TEST_BASE_URL=http://localhost:3005 npx playwright test --config tests/design-system/playwright.config.ts

# Build at foundation milestones and after each completed feature batch.
npm run build

# Whitespace and final change review.
git diff --check
git diff --stat
git diff
```

`npm run build` also generates Prisma and runs the commercial contract check before Next builds. Report missing environment/network/font/database prerequisites as actual blockers; do not remove checks or bypass type errors to get a green result. `npm run test:e2e` uses the root config and discovers `tests/e2e`, not the separate design-system specs. The design-system config has no automatic web server and defaults to port 3005. Its snapshots are platform-sensitive and current baselines include Darwin names; never replace baselines blindly.

Use tests relevant to changed behavior. Modal focus/close changes need meaningful keyboard/stack cases; table changes need sort/selection/action cases; a color-token edit usually needs computed/visual/contrast verification rather than a unit test that repeats a constant. Avoid writing tautological tests. Broaden shared-component consumer testing when the change's reach requires it.

Before execution, inspect test files and local target configuration. Some historical scripts can contact a remote environment or mutate fixtures. Only use an established isolated test target for those; mocked reference screens can still be validated independently while integration remains UNVERIFIED.

## Batch completion report

Report the user problem and resulting behavior, affected routes/views, shared components/tokens reused, checks with actual results, evidence links, remaining issues and coverage limits. Include changed APIs and the next batch's dependencies. Say whether behavior, data contracts or permissions changed; any such change needs its own justification and tests.

Before calling the full project complete, rediscover route/page/layout files, compare to the checklist, revisit all added local views and overlays, and reconcile each required case. Report counts for PASS, NEEDS FIX and UNVERIFIED with reasons. Do not equate a successful build or completed code migration with an app-wide UX audit.
