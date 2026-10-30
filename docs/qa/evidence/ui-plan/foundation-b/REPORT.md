# Foundation B: field identity, ARIA and campus Today

Implemented on 2026-10-08. Application edits are limited to `src/components/ui/form-field.tsx` and `src/components/ui/date-picker.tsx`. `button.tsx` is unchanged: this slice did not identify a consumer needing a loading API. No global CSS, routes, localization files, drafts, form schemas or persistence behavior were edited.

## Before-fix evidence

`baseline-observations.json` records Chromium observations with the original HEAD versions of FormField and DatePicker bundled in memory; other shared components used the current working tree. No application file was reverted to produce the baseline.

- The compound input's caller ID `nested-custom` became `field-compound`.
- Caller `aria-describedby="external-one"` was replaced by the generated hint/error IDs.
- After removing shared error/hint/required state, caller `aria-invalid="spelling"` and the revised external description were removed, while `aria-required="true"` remained.
- The fixture's concurrent same-name fields rendered duplicate `field-name` IDs. The new explicit scope/ID props were previously unsupported.
- With browser local day October 7 and campus `todayDate`, min and max all October 8, the Today action was disabled even though October 8 was the calendar's current-date marker.

An initial test fixture used an exact text selector that incorrectly included an aria-hidden required star in label text. Those fixture selectors were corrected; the baseline JSON uses direct input observation and does not depend on them.

## Resulting contracts

- `FormField` accepts optional `id?: string` and `idScope?: string`. ID precedence is explicit FormField ID, scoped `field-${idScope}-${name}`, explicit immediate-child ID, existing nested control ID, then legacy `field-${name}`. Existing explicit InputGroup IDs continue to move onto the control, without a duplicate wrapper ID.
- The unscoped default remains `field-${name}` to preserve callers in `DesignSystemReference` and admission-form focus code. Concurrent forms must opt into stable, unique scopes or IDs; this change does not silently rename existing fields or claim default name IDs are globally unique.
- Direct controls receive label/error/hint/required semantics through cloned props. A data marker distinguishes these from compound wrappers that do not forward the props to the actual input. Compound wiring runs in a layout effect; cleanup restores only attributes still holding values written by the wrapper, preserving updated caller values.
- Caller descriptions are merged and deduplicated. A scoped field binder's references to its own unscoped hint/error are retargeted to the generated scoped messages. External descriptions remain intact. Removing shared error/required state restores caller ARIA, including explicit `false` or `spelling`, or removes only wrapper-owned attributes.
- `FormErrorSummary` retains `onFocusField`. Its default lookup uses the nearest form, dialog or alertdialog, finds the actual named FormField control, and falls back to the legacy ID within that scope. It no longer automatically selects an identically named field in another form/dialog.
- DatePicker parses `todayDate` once per render and uses that calendar day for the empty calendar cursor, current-date marker, Today bounds and Today selection. Invalid or absent `todayDate` falls back to the browser day. The native setter/input-event mechanism, form name/value, refs, locale/messages and controlled/uncontrolled API remain unchanged.

## Checks

`npx playwright test --config tests/design-system/foundation-b/playwright.config.ts`: **5 passed** (Chromium, America/Los_Angeles, fixed clock, React StrictMode).

Coverage: legacy ID/summary focus; two scoped same-name forms with binder-style IDs/descriptions; dialog and alertdialog summary focus; direct/native and compound caller ID/ARIA transitions; Urdu input label focus, text preservation and required removal; explicit FormField versus wrapper/child IDs; direct DatePicker prop forwarding; campus Today bounds/current marker; `onChange`, `onValueChange` and native FormData ISO date value.

`npx eslint src/components/ui/form-field.tsx src/components/ui/date-picker.tsx tests/design-system/foundation-b`: **passed**.

The fixture bundles the actual components with the existing transitive esbuild dependency from tsx. Only the locale server action is replaced by a default-locale stub; no database, app server or network service is required. Minimal fixture CSS supports interactions, so these checks are behavioral evidence, not app-wide visual or localization certification. Build/typecheck and real-page reference checks are consolidated by the parent agent. No second dev server, build or typecheck was run by this slice.

The installed Next.js accessibility and Server/Client Components guides and current AGENTS.md were read before implementation.
