# Original UI and UX requirements

The user supplied the following brief for later implementation. The current request is to create the detailed plan first; the brief does not authorize this planning turn to start changing the app.

You are the UI/UX and design-system agent for the Skoolee AI application. Your goal is to audit and improve the entire app UI systematically, page by page and interaction by interaction. Treat the codebase as potentially much larger than the work completed so far. Do not assume previous audits covered the whole application.
Start by mapping the application before changing it:
1. Read all applicable AGENTS.md files and the relevant installed Next.js guides in node_modules/next/dist/docs/ before editing Next.js code.
2. Inventory every route, nested page, layout, dialog/modal, drawer, menu, popover, toast, tooltip, loading/skeleton state, empty/error state, table, form, and responsive variant. Include role-protected and feature-flagged screens where they can be identified.
3. Group routes by feature and user role. Build a checklist and keep it updated. Do not skip routes because they look similar; inspect each page and its important states individually.
4. Identify the app’s existing visual patterns, brand assets, fonts, colors, spacing, radii, borders, shadows, icons, motion, focus states, and responsive conventions. Base the design system on the actual product and established brand, not on arbitrary trends.
Create a design-system proposal and shared foundation before broad page refactoring:
- Define reusable tokens for typography, color, spacing, sizing, radii, borders, shadows, elevation, focus rings, transitions, and breakpoints.
- Provide shared components and patterns for buttons, links, inputs, selects, checkboxes, radios, switches, badges, cards, tables, tabs, navigation, dialogs, drawers, menus, alerts, toasts, tooltips, loaders, skeletons, empty states, and page headers.
- Preserve accessibility: semantic HTML, keyboard operation, visible focus, screen-reader labels, contrast, reduced motion, and correct dialog/menu behavior.
- Preserve existing product behavior, permission checks, localized content, and English/Arabic/Urdu support, including RTL layout. Do not replace translations with hard-coded strings.
- Avoid duplicating component systems or introducing a large dependency for patterns the project can support with its existing stack.
Then improve the application in small, reviewable batches:
- Migrate page-specific hard-coded styles and repeated markup to the shared tokens and components where it is safe.
- Improve interaction feedback consistently: hover, pressed, focus, disabled, loading, success, error, and confirmation states.
- Make layouts work on small phones, larger phones, tablets, laptops, and wide screens. Check overflow, touch target sizes, table strategies, dialogs, navigation, and forms at real viewport sizes.
- Keep each feature’s visual hierarchy clear and consistent while retaining function-specific controls where appropriate.
- Do not do blind global replacements. Verify each migration against existing behavior and the design audit.
Manual validation is required for every in-scope page:
- Open and inspect every route in a browser at desktop, tablet, and mobile sizes; test actual modals, menus, toasts, loaders, forms, tables, empty/error states, and keyboard flows where applicable.
- Inspect supported languages and RTL layouts, especially Arabic and Urdu.
- Test representative roles and verify restricted controls remain restricted. Never use real customer records for test interactions.
- Capture screenshots or other reviewable evidence and record what was actually tested. Mark failures, blocked routes, missing roles/data, and untested states explicitly as UNVERIFIED; never describe them as passing.
- Run relevant checks and tests after each batch. Read the final diff for regressions and confirm changed pages still build and render.
Work tracking and delivery:
- Maintain a route-by-route checklist with status: NOT STARTED, IN PROGRESS, PASS, NEEDS FIX, or UNVERIFIED. Include device sizes, language, role, key states tested, evidence, issues found, and fixes.
- Prioritize issues by user impact and severity. Fix the shared foundation first, then migrate groups of pages in small batches.
- Preserve unrelated user changes. Use an isolated branch/worktree if available.
- Keep changes scoped and reviewable. Do not claim the whole application is complete until every discovered route and important UI state has been accounted for, manually inspected, and either passed or clearly listed as blocked/unverified.
- Provide a final report with the complete route inventory, design-system decisions, shared components created or reused, pages updated, validation evidence, unresolved issues, and a clear statement of coverage limits.
UX improvements are part of the task, not just visual polish. For every page and key flow, assess whether people can understand what to do, complete it with minimal effort, recover from mistakes, and tell what happened.
Improve confusing navigation, labels, information hierarchy, form order and validation, search and filtering, table actions, confirmations, empty states, errors, progress feedback, and help text where evidence supports a change. Prefer clear defaults and fewer steps while preserving permissions, required business rules, and user data. Check usability for different roles, screen sizes, keyboard and assistive-technology users, and English, Arabic, and Urdu. Explain larger workflow changes in the audit before implementing them, and record the user problem and validation evidence for each change.
