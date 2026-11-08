# Implementation handoff prompt

Paste the following into the implementation model's chat. This prompt starts one concrete batch; use the batch report to choose the next one.

---

You are implementing the existing Skoolee AI UI/UX plan in this repository. Read `AGENTS.md`, `docs/ui-plan/README.md`, `docs/ui-plan/architecture.md`, and the FOUNDATION A section in `docs/ui-plan/execution.md`. Read the relevant installed Next.js guides before modifying Next.js code. Then read only the relevant sections of `tokens-and-styles.md`, `class-recipes.md`, `component-contracts.md`, and `route-checklist.md` for the current batch. The token plan owns names/values; execution.md owns the batch order, status meanings and validation matrix. The original brief is preserved in requirements.md.

Start with FOUNDATION A. Inspect current source and git status, preserve unrelated changes, and prefer a suitable isolated implementation branch/worktree. The plan is based on a snapshot: verify current APIs, selectors and runtime behavior before editing. Static source findings are not verified browser failures.

Before changing code, write a short batch note listing: affected files/routes/states, observed user problem, proposed change, invariants, and validation cases. Open the actual development reference and representative role/older-dashboard pages using synthetic data to capture the baseline. If a page or locale cannot be reached, mark it UNVERIFIED with the precise blocker and continue independent foundation work. Do not remove auth or permission checks to open it.

Implement the smallest coherent change in the existing shared system. Keep the purple brand, established visual character, existing business rules, session/tenant/role checks, English/Arabic/Urdu translations, RTL, locale formatters, draft recovery and accessibility. Existing `Button`, `Input`, `Select`, `FormField`, `InputGroup`, `Modal`, `PageCard`, workspace helpers and role wrappers are the default building blocks. Preserve intentional compatibility wrappers. Proposed APIs in the plan do not exist until implemented; never import a proposed file and assume it is available.

For FOUNDATION A, extend semantic token aliases and catalogue cases only where needed, and fix a reproduced shared cascade/focus/motion issue in a reviewable change. Do not broadly refactor all pages, introduce another component library, change the palette, or create every proposed primitive upfront. Do not do blind class replacements. Do not change backend contracts, schema or permissions to make a UI check pass.

Manually validate the changed states at the required sizes and supported languages, including keyboard/focus and relevant RTL behavior. Record actual screenshots/results in a batch evidence folder. Run relevant existing checks, inspect the diff, and update the checklist and case statuses accurately. Never mark a blocked or untested case PASS; old screenshots do not count as current evidence. Treat mocked UI and real integration as separate claims.

Finish with a concise batch report: changes, files, route/view coverage, tests and results, evidence, unresolved issues, and the next batch. Continue subsequent authorized batches one at a time using the same process, while keeping each change reviewable. If the user only requested one batch, stop after that batch.

For later work, replace “FOUNDATION A” with the exact next batch and its target routes/views. Read the batch prerequisites before starting. Query the large JSON indexes only for relevant files; do not load them wholesale into context.
