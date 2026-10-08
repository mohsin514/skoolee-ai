# Skoolee UI implementation plan

This is the handoff plan for improving the existing Skoolee AI interface with shared components. Preserve the purple brand, existing workflows, role and tenant boundaries, and English, Arabic, and Urdu content. Implement one small batch at a time using the detailed contracts below.

The original plan was based on a static inspection of commit `bcd66035365201e90f9768dcfd612771cceab0aa` on 8 October 2026. Application-wide shared UI source adoption is now implemented across the inventoried routes and components. See the [current implementation report](../qa/evidence/ui-plan/whole-app/REPORT.md) for enforcement, validation and remaining runtime acceptance limits. Checklist entries remain **IN PROGRESS** until their full state matrix is verified; source adoption alone does not earn a full-route PASS. The static indexes below describe the original planning baseline.

## Read in this order

| File | Purpose | When to read |
| --- | --- | --- |
| [Architecture map](architecture.md) | Where pages, layouts, shared UI, feature panels, styles, and localization belong | First |
| [Tokens and styles](tokens-and-styles.md) | Exact current tokens, proposed aliases, typography, spacing, surfaces, focus, motion, breakpoints, RTL, and class conventions | Foundation and any styling change |
| [Class recipes](class-recipes.md) | Exact Tailwind compositions, token exposure, layout/type/state classes and ownership | While implementing a shared owner or page |
| [Component contracts](component-contracts.md) | Existing exports and APIs, reuse rules, class/state contracts, gaps, proposed small components, accessibility | Only the components used by the batch |
| [Route and view checklist](route-checklist.md) | Every discovered page, layout, boundary, and 99 explicit console views; initial status and state targets | Select and track each batch |
| [Execution and validation](execution.md) | Ordered work packages, page recipes, UX review, browser matrix, evidence, tests, acceptance, and handoff rules | Every batch |
| [Original requirements](requirements.md) | The supplied full-app audit and implementation brief, preserved for later execution | When scope is unclear |
| [Implementation prompt](IMPLEMENTATION-PROMPT.md) | Ready-to-use instructions for the implementation model | Paste into its chat |

## Static inventory

The scan found **84 page route patterns, 14 layouts, 11 loading boundaries, 12 error boundaries, one not-found boundary, 311 TSX files, and seven CSS files**. Seven single-route role consoles also contain **99 explicitly typed local views**. Those views are separate audit targets, even when several reuse a panel. Further nested tabs, menus, overlays, and conditional states must be expanded during each page audit.

The large generated planning indexes were removed during merge cleanup. Source files are authoritative. Run `npm run audit:ui` to regenerate the current route/component inventory in the ignored `test-results/design-system/source-coverage.json` output.

## Main design decisions

1. Extend `src/app/globals.css`, `src/components/ui`, and the current composition components. Keep one design system.
2. Keep `RoleShell` as the shared role frame. Preserve the older `/dashboard` composition until it has its own deliberate migration; it already adapts the shared sidebar.
3. Reuse domain panels across roles. A fee-management panel belongs in the fee feature, while its buttons and inputs belong in shared UI.
4. Preserve the current public APIs and intentional adapters. `BrandButton`, `Dialog`, role page wrappers, and `ModalFrame` are not automatically duplicate systems.
5. Fix interaction defects in shared components before increasing their adoption. Source review identified specific modal, table, focus/cascade, and motion concerns; reproduce them before changing behavior.
6. Treat layout, language, permission, data, and interaction states as independent coverage dimensions. A passing desktop screenshot does not establish that a route passes on mobile or in Urdu.
7. Keep the existing light interface as the reference visual direction. Preserve `.dark` token compatibility and explicitly track dark surfaces; do not claim full dark-mode support while white surfaces remain.

Implementation has started on `codex/ui-shared-foundation`. See [implementation evidence](../qa/evidence/ui-plan/README.md) for the verified shared foundation and auth/public increments; use the route checklist to continue unfinished acceptance and subsequent batches. The original inventory counts above describe the planning baseline.
