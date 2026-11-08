# FOUNDATION A — shared style baseline and token extraction

Implementation branch: `codex/ui-shared-foundation`. Starting source snapshot: `bcd66035365201e90f9768dcfd612771cceab0aa`.

## Scope and baseline (recorded before implementation)

Allowed files: global styles, shared Card/PageCard surfaces, development reference, focused foundation tests and evidence. No business mutations or route migrations.

On the running development server, manually opened `/design-system?patterns=application` at 1440×1000 in the Codex browser. The `.sk-panel` border computed as `rgb(206, 195, 213)` despite its component rule declaring `--border-subtle` (`#e4dced`). The unlayered universal border rule overrides layered component and utility colors. Page overflow was false. Field borders computed as `#d8cfe5`; invalid and disabled states retained their dedicated borders. Screenshots of the reference and the synthetic Review changes dialog were captured in this conversation before changes; these are visual observations, not persisted screenshot files or full route coverage.

User problem: surface boundaries ignore their shared semantic color, including explicit component styles. Proposed change: put the universal default in the base layer; preserve the deliberate unlayered field state contract. Extract existing panel/workspace radii, elevation and motion values into semantic variables. Do not redefine Tailwind's existing radius scale or legacy dashboard overrides.

Invariants: field focus hue/halo and invalid/disabled states, button behavior, modal timing and stacking, workspace padding, fonts, brand palette, data fetching, permissions and public component APIs. Fixed white surfaces remain white in this extraction; full dark-theme migration is outside this batch.

Acceptance: computed default/subtle/explicit borders; unchanged field focus; panel/workspace geometry and shadows; no reference overflow at desktop/tablet/phone; reduced-motion timing; existing reference interactions. EN/AR/UR cases and browser/device gaps must be recorded individually. Real application routes remain NOT STARTED until separately migrated and verified.

## Results

Implemented semantic geometry/motion/elevation variables and adopted panel, toolbar and PageCard values. Moved the universal border default to the base layer; kept field-state ownership unlayered. Removed the misleading 120ms reduced-motion declaration (the existing effective global duration remains .01ms).

Verification:
- Chromium: 14/14 passing in `style-foundation.spec.ts`, `application-patterns.spec.ts`, and `field-focus.spec.ts`. Includes standalone/compound/date fields, invalid/disabled/hover/focus states, login tinted fills, token contrast checks, RTL direction, reduced motion and widths 390/639/640/767/768/1440.
- Targeted ESLint for PageCard and style spec: passed. Diff whitespace check: passed at this stage.
- Manual Codex browser: corrected panel border `rgb(228,220,237)`, radius28, unchanged shadow; desktop and 390px RTL composition inspected with no page overflow. A narrow title truncation was observed and assigned to FOUNDATION D; a no-overflow result does not clear readability defects.
- Persisted EN reference screenshots: `reference-en-390.png`, `reference-en-768.png`, `reference-en-1440.png` in this folder.
- Locale package tests: 8/8 passed; navigation/access recovery tests: 5/5 passed.
- Existing adoption guards: both fail on untouched app-wide debt. `adoption-baseline.log` reproduces the failures from an isolated archive of HEAD; `adoption-current.log` records the working tree result. No exemptions were added.
- Existing locale UI coverage test fails catalog parity (Arabic-only keys Audited support access approvals and Reconciliation). No catalogs were modified by this batch.

Coverage limits: the application reference contains English copy; its direction toggle tests RTL geometry, not complete Arabic/Urdu localization. Full AR/UR reference validation, remaining dark-theme components, WebKit/Firefox, native mobile keyboard/safe area, real text zoom and forced-colors remain UNVERIFIED. Shared fields/modals/tables receive additional isolated coverage in their own batch reports. Real routes have not been cleared by reference tests.


Visual baseline review: initial existing reference run passed 7/8 tests; staff flow stopped at a screenshot mismatch. Changed its two screenshot assertions to soft assertions so validation, draft preservation, stale recovery and final receipt still execute while visual failures remain failures. The full flow then passed its interaction assertions with two visual diffs (968/944 pixels). Inspected both diff images and the full form result: deltas are intended explicit button/selection borders now winning the cascade, plus the existing Record corrections navigation entry absent from the older snapshots. Accepted those two reviewed baselines; preserved diff PNGs in this folder. This is a deliberate reviewed baseline update, not a tolerance increase. A subsequent passing rerun is recorded in the integration summary.


After auth/public migration: `adoption-after-auth-public.log` still records both broad guard failures on remaining routes. Changed auth/pricing files no longer appear in the displayed violations. The migrated protect-account path was removed from the original debt exemption set; no exemption was added. This does not clear untouched app-wide debt or certify every control on every route.
