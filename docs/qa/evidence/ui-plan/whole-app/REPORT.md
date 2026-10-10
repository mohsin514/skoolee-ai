# Application-wide shared UI adoption

Branch `codex/ui-shared-foundation`; dirty worktree based on `bcd66035365201e90f9768dcfd612771cceab0aa`. No commit, deployment, database migration/reset or real account/financial/academic write was performed for this UI migration.

## Implementation coverage

The source inventory accounts for all **84 pages, 14 layouts, 11 loading views, 12 error boundaries and one not-found view**. The existing checklist additionally tracks all **99 local console views** and nested interaction contexts. No route-specific field adoption exemption remains.

| Source group | Coverage | Evidence |
| --- | --- | --- |
| Auth/public/entry/reference | Earlier shared adoption plus canonical choice cards and inline FieldAction follow-up | [Prior increments](../README.md) |
| Remaining route wrappers, teacher/owner/super/admin/onboarding/jobs/corrections/legacy routes | 90 TSX files inspected; 41 edited; 171 buttons, 28 fields, five tables, 52 neutral panels and seven inline actions migrated | [Route report](../remaining-routes/REPORT.md) |
| Family/account/memberships/pupil, fees, academics, locale/settings | 61 files inspected; 47 edited; four bounded tables and shared calendar modal adopted | [Family/fees/academic report](../family-fees-academic/REPORT.md) |
| Role components, operations, billing, staff, timetable, chat, teacher and other shared panels | 91 files inspected; full manifest and scoped checks in the component report | [Component report](../component-adoption/REPORT.md) |
| Shared admin tools | All ten files inspected; 143 native buttons and 36 neutral panels migrated; field/wizard/table behavior consolidated | [Shared admin report](SHARED-ADMIN.md) |

These are source ownership groups, not additive counts of routes. Files already using the shared system were inspected and retained; shared wrappers propagate the foundation to their consumers. Machine-readable inventory (generated artifact removed during merge cleanup) records every source route/boundary and its static component dependencies.

## Enforcement and shared APIs

- `npm run check:ui` runs inside `npm run build`. It rejects ordinary native buttons/fields outside shared UI, page-specific focus-ring forks, and multiple Toaster owners. All 11 original path exemptions were removed across these increments.
- `npm run audit:ui` regenerates the complete source inventory.
- Standard actions use Button/buttonVariants or the existing BrandButton adapter. Choice controls use the shared choice variant; field reveal/regenerate/clear actions use FieldAction. Shared Button minimum width is 44px; reduced motion suppresses press scaling. Direct action icons use 16px while nested rich-card icons retain their layout.
- Standard panels use shared recipes. Dashboard-specific radius/border/table utility overrides and duplicated auth/onboarding motion definitions were removed.
- Table.containerClassName consolidates bounded scrolling and sticky positioning into one shared wrapper.
- Wizard fields use FormField with unique fallback names while preserving caller-provided IDs. Busy wizards disable their child fieldset, step navigation and dismissal.
- Shared modal focus captures the opener before descendant autofocus, tracks opening interactions for mounted-inactive dialogs, and supports explicit returnFocusRef for async/temporarily disabled triggers. Focus trapping excludes inherited disabled controls, negative tab indices and inert descendants; an entirely busy dialog retains Tab focus on its surface.
- Native file/range/radio/hidden/color and visually hidden checkbox inputs remain the plan's specialized browser-contract cases. Compound cards with independent nested controls retain their specialized shared composition. Those are not undocumented per-page exemptions.

## Regression findings resolved

The first combined run passed 179/180 cases and exposed sidebar centering caused by Button's default alignment. The expanded navigation alignment, original icon geometry and multiline sizing were restored; converted flex layouts across all ownership groups were audited for the same issue. The remaining 107-pixel reference difference was the intended canonical Collapse button typography/treatment. Both actual and diff images were inspected before updating the two affected baselines; no tolerance was widened.

New component fixtures exposed autofocus/async opener restoration; new central modal tests reproduced and verified the fix. A focusin-based intermediate fix was rejected by failing regression cases and replaced with opening pointer/keyboard tracking. Visual review also found a pending wizard Edit action still available; the shared fieldset lock and disabled-action/Tab assertions cover it. The fee fixture exposed a 390px status-filter overflow, now corrected with wrapping. Corrections' locally selected AR/UR calendar now receives that route's actual policy instead of a default EN provider.

## Verification

Production build (including all three adoption guards), TypeScript and ESLint for all 232 changed/new TS/TSX files passed. The final combined node run passed 97 tests (including 91 component preservation cases); the separate locale/table/copy contract run passed 29. Generated logs and captures were removed during merge cleanup; regression tests and their required baselines remain.

The initial final browser run passed 210/211; public entry exceeded the five-second redirect assertion while build checks ran concurrently. The cause was not proven; a focused rerun passed all seven routing cases without source/test changes. The complete rerun, without further source or test changes, passed **211/211 browser cases** in 3.0 minutes. Scope-specific reports distinguish synthetic fixtures from actual anonymous-route checks. Production CSS and components are used; all mutating fixture requests are intercepted. Source-preservation checks cover route behavior/ARIA attributes, component requests/control contracts, and financial/date/payload calls.

## Acceptance limits

Source adoption is application-wide. This is not a claim that every role, record state, language, device or screen reader passed a complete runtime acceptance matrix. Authenticated console branches and real mutations require their own authorized fixtures and checks. Full AR/UR caller copy, physical devices, print/export workflows, background overlay inertness and comprehensive assistive-technology review remain unverified; mixed existing copy is noted in each report. The route checklist therefore keeps full-route PASS at zero rather than inventing completion evidence.

## Merge cleanup

Removed 207 generated captures/logs/inventories and the disposable test-results folder (about 117 MiB). Kept application assets, test source, the two tracked visual regression baselines and the control-contract fixture. The fixture now lives beside its test. New captures and `npm run audit:ui` output go to ignored test-results; local .codex worktrees are excluded from Git and preserved on disk. Cleanup validation: 97 node contracts and 37 focused browser cases passed; TypeScript, test/script ESLint, audit regeneration and git diff whitespace checks passed. The small output regenerated by these checks was removed again.

## Dashboard navigation and access recheck follow-up (9 October 2026)

RoleShell now marks its desktop/sidebar and mobile navigation as the shared navigation owner. WorkspaceSubnav omits duplicate card-top section strips inside that shell, while standalone pages retain their navigation. On access loading or failure, RoleShell keeps workspace children mounted but hidden. Loading fills the content area with shared SkeletonRegion/SkeletonBar placeholders instead of a lone message; error and supplied-portal recovery remain available.

Validation: 13 component browser cases passed, including 360px/1440px duplicate-strip suppression, actual role-shell focus recheck with a delayed response, protected-content hiding, draft preservation, failed-check retry and retained mobile/desktop navigation. 96 adoption/access-recovery/component contracts, TypeScript, scoped ESLint, production build and whitespace checks passed. Browser requests are synthetic; real authenticated role sessions were not exercised. Generated test output was removed.

The access-check follow-up now also skeletons the left sidebar and header, while keeping their real components mounted and hidden until access returns. Header Notifications and Settings share the outlined icon treatment. All account-menu links/actions use the same shared ghost/small row recipe, including Sign out. The expanded browser suite passed 14 cases, including header/menu computed-style equality and hidden navigation/header during pending access; 96 contracts and scoped lint passed.

## Shared chat polish (9 October 2026)

The dock and dedicated messages page share quieter header/badge/empty-state recipes, readable conversation rows, solid message bubbles and neutral panes. The full page uses a bounded card workspace; the dock uses a larger desktop panel capped by viewport height, with logical end-side placement. Both use shared action controls. The composer now places Send after the text field; a geometry assertion guards the shared input-group ordering. Search, filter, conversation selection, message payloads, Enter/Shift+Enter, pending sends, back controls, new-conversation and policy dialog behavior are preserved.

Validation: 18 browser cases passed (four new dock/full-page chat cases at 360px/1440px and 14 existing component cases), 94 adoption/preservation contracts passed, TypeScript and scoped ESLint passed, and the production build passed. Phone and desktop screenshots were visually inspected, including the corrected composer ordering. All messages and writes used synthetic fixture data; authenticated production messaging and physical devices remain unverified. Generated screenshots were removed after review.

The shared chat launcher is now fully round with a purple/pink gradient and three automatically moving circular layers. Decorative layers are clipped inside the circle; the unread badge remains outside. Reduced-motion settings stop the background animation. Five focused chat browser cases passed, including round geometry, three animated layers, reduced-motion behavior and opening the panel; lint and whitespace checks passed.
