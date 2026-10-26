# In-progress Linear review — 26 October 2026

Base updated to `dev` at `7d039b47`, including PR #114. Reviewed SKO-545, SKO-460, SKO-494, SKO-397, SKO-408 and SKO-452. This is a code and synthetic-test checkpoint, not closure of these six feature tickets.

## Changes

- **SKO-460:** Conversation exports now continue through every history page. Previously an export containing more than 2,000 exchanges silently omitted its oldest exchanges. The regression uses 2,001 exchanges and checks their complete order.
- **SKO-460:** Retention rechecks last activity and pending requests before each deletion, reports and audits only actual deletions, and the cron commits deletion and audit together in a retried serializable transaction. The regression resumes one selected conversation and adds a pending turn to another before deletion; both survive without false deletion audits.
- **SKO-397:** The setup-delegation acceptance fixture now explicitly assigns its campus administrator as the institution's setup delegate. The existing authority restriction stays intact.
- **SKO-452:** Demo-reset acceptance now expects the current five accounts and three exams, matching the seed and runbook. Failed workflow-demo register preparation reports the run outcome and step error codes to make diagnosis possible without printing private conversation text.

- **SKO-545:** Added confirmed library-category rename with campus scope, duplicate/stale checks and preserved book associations. Coverage now measures the live registry per role; the checker rejects stale generated reports. 148 of 864 inventory rows have a connected adapter.
- **CI:** Aligned RAG relation update actions with deployed migration semantics, repaired a typed OCR fixture, and updated enrollment browser assertions to verify current family/operator staff-console redirects.

## Verification

All databases were disposable local PostgreSQL instances with synthetic records; no customer database was modified.

| Check | Result |
| --- | --- |
| School AI unit suite | 501 passed |
| AI Workflows unit suite | 99 passed |
| Onboarding unit suite | 25 passed |
| Full AI Workflows database suite, fully migrated database | 204 passed |
| Conversation/setup-task and demo-reset database suites | 18 passed |
| Exam Studio release database suite | 4 passed |
| School readiness database suite | 5 passed |
| Fresh database migration deployment | All 149 migrations applied |
| Capability coverage check | Passes its existing ratchet; 195 registry entries, 659 capabilities not connected, 29 handlers awaiting inventory |
| Changed-file ESLint and whitespace check | Passed |
| Repository TypeScript check (12 GiB heap) | Passed |
| Production build | Passed with `next build --webpack`; local Turbopack rejects the external node_modules symlink |
| Library database acceptance | 10 passed, including rename, cross-campus denial, duplicate and stale-name rejection |
| Migration/schema drift | No difference detected against all 149 migrations |
| AI release promotion check | Correctly blocked: no recorded evaluation for the candidate |

The initial schema-only database omitted SQL triggers and therefore could not validate enrollment creation or immutable exam/readiness evidence. The full workflow suite above used all migrations. The focused exam/readiness checks used their existing migration invariants. A `prisma db push` result alone is not migration acceptance.

## Remaining work by card

| Card | Current evidence and remaining requirement |
| --- | --- |
| SKO-545 — AI Workflows for every role | All nine child slices are marked Done in Linear, and all 204 database tests pass. However, the coverage check still reports 659 unconnected capabilities and 29 unmapped handlers. The parent's unrestricted role-coverage promise is not satisfied by the completed slices or this PR. Further typed adapters and their domain-specific acceptance remain implementation work. |
| SKO-460 — Multimodal assistant | Export and retention defects above are repaired. Full real-device voice/camera, multilingual and deployed end-to-end acceptance are not established by this checkpoint. |
| SKO-494 — Educator evaluation | `CURRENT_AI_RELEASE_EVALUATION` remains null. The release gate must remain closed until authentic educator results for the exact candidate and dataset are recorded. Automated checks cannot substitute for that review. |
| SKO-397 — Guided setup | Local readiness and delegation acceptance pass. The card's migration-blocked description is older than `docs/operations/onboarding-launch.md`, which records both `20261020020000_setup_generation_requests` and `20261020150000_role_launch_guide` applied to Supabase on 20 October. This review did not independently inspect remote migration state or deploy the new changes. |
| SKO-408 — Exam Studio | All four focused release checks pass, including immutable seals and rehearsal requirements. The complete learning-action/family-delivery/reassessment journey and school-pilot acceptance remain outside this focused release check. The separate Exam Studio and UI work from PR #114 is now incorporated through latest dev; the updated unit suites, TypeScript check and production build pass. |
| SKO-452 — LEAP readiness | Reset repeatability and the complete recorded workflow seed pass against synthetic data. The runbook still requires actual captioned EN/AR recordings, timed live/offline rehearsals, native Arabic review and permissioned claims evidence. No recording or commercial outcome was invented. |

## Educator handoff for SKO-494

A reviewer needs the actual model outputs for every case in `src/lib/ai/evaluation.ts` and its imported case dataset, using the candidate named by `scripts/check-ai-release.ts`. Record case outcomes, reviewer names and review time, and educator review of Arabic, Urdu and answer-key cases. Only after those real results exist should `src/config/ai-release-evaluation.ts` be populated with an `AIReleaseEvaluation` for the matching model, prompt, policy and dataset versions. Run `node --import tsx scripts/check-ai-release.ts`; failed or missing cases must still block promotion.

No Linear card was marked Done, no release gate was bypassed, and no deployment was performed.
