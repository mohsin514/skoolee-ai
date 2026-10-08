# Remaining route UI migration

Date: 2026-10-08. Scope owner: `nextjs_review`. This report covers the remaining `src/app` route UI batch, not the whole application's runtime acceptance.

## Scope and result

Audited all **90 TSX files** assigned to this batch. **41 files changed; 49 needed no changes.** Every file is accounted for in [route-inventory.md](route-inventory.md). Auth/public, account, memberships, parent, student, and pupils are separate batches. Root owns the root layout/global CSS/shared components. API handlers, server actions, permissions, pricing, authentication, data loading and mutation implementations were not rewritten.

- **171 native buttons** adopted shared `Button` or `FieldAction`. Normal action color, focus, disabled, size and elevation come from shared variants. Stateful choices use `choice` and retain their existing selection/keyboard state. Added pressed semantics where visual selection previously had none.
- **28 native fields** adopted shared inputs: seven selects, five textareas, nine normal/date inputs and seven checkboxes. Existing shared-field callers also shed local field skins. Native file inputs remain in the CSV import and onboarding logo upload because their file/ref/change contracts are specialized.
- **Seven end-affix actions** use `FieldAction`, including search clearing, roll/session regeneration and password visibility. The owner's password fields now have linked visible labels; its visibility and pagination icon actions have accessible names.
- **Five native tables** adopted `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, and `TableCell`. Existing scroll boundaries moved to root's new `Table.containerClassName` API rather than adding nested overflow containers. Sticky column offsets use logical `start-*`; column widths, numeric alignment, row refs, editing handlers, locked states and selection gates remain intact.
- **52 ordinary neutral panels** adopted `sk-panel`. Existing selected/domain-status surfaces, branded heroes, chart/status decoration, icon badges, and the logo dropzone keep their meaning-specific treatment. One former `sk-panel` selectable report card now uses the shared `choice` action surface, so the net `sk-panel` source occurrence increase is 51.
- Removed duplicate onboarding/teacher-onboarding inline animation definitions; existing global recipes own them. Preserved the original start alignment for 45 flex actions explicitly to avoid shared Button's centered default changing list/choice layout.

Installed Next.js **16.2.3** documentation was read for layouts/pages, server/client boundaries, forms, CSS, accessibility, loading and errors before the migration. The installed error guide recommends `unstable_retry`; the installed runtime still passes **both `reset` and `unstable_retry`** (`node_modules/next/dist/client/components/error-boundary.js`). This UI-only migration deliberately preserves each existing `reset` handler contract.

## Preservation audit

The pre-edit TSX snapshot was compared to the final source with the TypeScript parser:

- **370 original native/shared controls** were matched in source order across all 90 files.
- All **824 core behavioral attributes** remained equivalent: handlers, values/default values, checked state, disabled/read-only/required gates, ranges, refs, field/form names, keys, keyboard roles and tab indices.
- All **66 pre-existing ARIA attributes** remained unchanged; new accessible labels/pressed states were additive.
- Shared `Checkbox` supplies its native `type="checkbox"`; shared `DatePicker` supplies `type="date"`. These equivalent native-type contracts were normalized for the audit.
- All owned TSX files parse. The final owned scope contains **zero ordinary raw buttons/selects/textareas/tables** and only the two specialized file inputs above. No route-local focus ring/outline/border/shadow fork remains.

source-contract-audit.json (generated artifact removed during merge cleanup) records per-file source hashes, control/attribute counts and the comparison result. scoped-checks.json (generated artifact removed during merge cleanup) records the scoped inventory and ARIA check. This is a point-in-time source preservation check, not proof that every server-side flow or every route state has run. The original snapshot used for the comparison is session-local at `/private/tmp/owned-route-before.json`.

## Focused browser verification

**9 tests passed** in the final Chromium run. Command:

```sh
npx playwright test --config tests/design-system/playwright.config.ts tests/design-system/remaining-routes.spec.ts --output test-results/remaining-routes
```

Fixture source: `tests/design-system/remaining-routes.fixture.tsx`. Test source: `tests/design-system/remaining-routes.spec.ts`. Final output: playwright.txt (generated artifact removed during merge cleanup).

The fixture bundles the **actual route components and actual shared UI/CSS**, stubbing Next navigation/link and the locale provider boundary. Every fetch is intercepted by a strict in-memory response queue, all other network traffic is aborted, and navigation is captured locally. No credentials, real payment request, real correction, real pupil data, real import commit, or actual invite/auth action is used.

| Actual component/state | Covered behavior | Width/locale |
| --- | --- | --- |
| `corrections/view.tsx`: selected mark, review preview, reviewed checkbox, pending correction request | Exact source/version/review-hash/reason payloads; review gate; busy disabled request; phone width containment | 390px EN |
| Corrections: local language changed from EN to AR/UR with provider deliberately still EN | Main direction, select styling, numeric bounds, localized shared calendar accessible name and RTL content, Escape dismissal, width containment | 390px AR and UR |
| `onboarding/package/page.tsx`: catalogue, institution sizing, annual period, pending free selection | Sizing/period/saved-step/idempotency payload, pressed period state, disabled pending action, no document horizontal overflow | 390px and 1440px EN |
| `teacher/error.tsx`: recovery card | Keyboard activation calls the original retry handler exactly once; Home retains `/login`; retry target at least 44px; width containment | 390px and 1440px EN |
| `dashboard/students/bulk-import-dialog.tsx`: staged review, accepted row, unresolved row, modal close | Native CSV file contract; shared table/select/input/checkbox; exact row-selection and uncontrolled blur-edit PATCH bodies; 320px table scroll bound; Cancel dismissal; no commit endpoint requested | 390px and 1440px EN |

The corrections route carries `initialLocale` and its own language selector without a `LocaleProvider`. A generic `Input type="date"` would use the default locale in the real route. Its history date filter therefore uses **the existing shared `DatePicker` directly**, with the route's policy, existing `datePickerMessages`, timezone/day/week settings and unchanged date value/change handler. The tests change the local language while the provider remains English to cover this exact boundary.

The first browser attempt could not start inside the macOS sandbox (`MachPortRendezvousServer` permission denied). The permitted local Chromium escalation succeeded. Early fixture corrections used HTTPS for the real `crypto.randomUUID` API, used the route's actual “Retry” label, and awaited the server-authoritative import checkbox response. Those were fixture issues; no business handlers were changed to satisfy them.

## Visual evidence

The following screenshots are entirely synthetic and were inspected:

- Corrections review, phone (generated artifact removed during merge cleanup)
- Package selection, phone (generated artifact removed during merge cleanup)
- Package selection, desktop (generated artifact removed during merge cleanup)
- Import review, phone (generated artifact removed during merge cleanup)
- Import review, desktop (generated artifact removed during merge cleanup)

The import table intentionally scrolls horizontally at phone width. Its modal content scrolls vertically; Cancel was reached and activated through the rendered UI. These checks do not assert that every footer stays fixed in the viewport.

## Remaining runtime coverage limits

All files received source review/inventory; the nine synthetic tests cover the representative states above. **No authenticated live end-to-end pass is claimed.** Root performs the integrated typecheck/build/global guard and wider existing suites.

The following affected route families retain their source-level contracts but were not exercised through every state in this batch:

- Onboarding identity/campus/academic/review steps, logo selection and campus-delete modal; teacher onboarding subject/step/profile submission.
- Owner school/user/log/session/support/pricing/bank screens and their details, support, user-add/password, plan and confirmation modals.
- Super campus/billing/support review screens and campus/detail/billing modals; admin/principal domain workflows.
- Teacher attendance status radios and roving keyboard behavior, monthly breakdown; assessment selection/dirty-discard, mark entry/fill/clear/final-grade/grading modals; leave request, AI expansion, report preview, pupil detail and action routes.
- Dashboard admissions/parent picker/Urdu keyboard, communications/reports/marks, jobs retry/cancel, and message settings actions.
- Paid checkout/external redirects/mailto, CSV commit/receipt/reversal, real corrections approval/rejection, and every route toast success/failure rendering. These mutations were not called against real services.
- Sticky column behavior for the two gradebooks, owner user table and teacher insights table is source-preserved but not separately browser-measured here; import table geometry was measured in the focused fixture.

The remaining 49 unchanged TSX files are explicitly listed in the inventory, including route layouts, shared skeleton loaders, delegation wrappers and pages already using the shared system. They are not silent migration exclusions.
