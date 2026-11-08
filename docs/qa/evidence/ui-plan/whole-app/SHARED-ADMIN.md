# Shared admin migration

Worktree: `codex/ui-shared-foundation`, dirty source based on `bcd66035365201e90f9768dcfd612771cceab0aa`. Synthetic fixture only; no admissions, class changes, uploads or assignments submitted to an API.

All ten TSX files under `src/components/shared-admin` inventoried. 143 native buttons migrated to the canonical Button; normal action skins removed, including 33 dynamic class bases. Layout and conditional selection/status classes preserved. 36 ordinary neutral panels now use `sk-panel`; existing standard fields lose their duplicated visual skins. Two hidden file inputs retain native browser upload contracts.

Wizard Field now delegates label/control/error/hint/required wiring to FormField with unique scopes, replacing a locally cloned control and unattached label. Wizard pending state prevents dismissal, step/back navigation and child edits. Reduced-motion scroll uses `auto`. Class settings drawer still uses the shared dialog behavior hook; pending class save now blocks all close paths.

Table adds optional `containerClassName` for bounded/sticky consumers, retaining the original 24px radius through the existing token. It allows one scroll owner rather than a nested wrapper. Existing workspace table native markup remains the shared implementation, not a page-level fork.

Validation: focused lint/type checks passed. Initial three wizard cases failed from a test locator excluding the required star; the next run reached release but pressed Escape before React committed the busy-state update. Corrected the test to await enabled Close. Then all four wizard/table checks passed. Visual review subsequently found Edit still enabled while pending; the production fieldset lock and assertion were added. The next focused run passed all seven wizard/table/button cases, including disabled Edit. Existing workspace table checks: three passed.

The fixture verifies EN/AR/UR direction and shared semantics, not translated caller copy. All real role/data contexts, screen readers and physical devices remain unverified.

Final focused modal/admin run: 24 passed, including the new default-autofocus and mounted-inactive opener regressions. Final production build, full TypeScript check and changed-file ESLint passed; see the application-wide report for integrated browser results.
