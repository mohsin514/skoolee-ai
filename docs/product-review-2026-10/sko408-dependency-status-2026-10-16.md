# SKO-408 dependency map and live status — 16 October 2026

Read directly from native Linear relations (`IssueRelation.blocks`) and current workflow
states in the `skoolee-ai-app` workspace. This is a status reading, not completion evidence.

## SKO-408 direct blockers (native `blocks` edges into SKO-408)

| Blocker | State |
| --- | --- |
| SKO-383 [009] AI provider policy, privacy and evaluation gateway | Todo |
| SKO-407 [033] Reviewed question bank and assessment blueprints | Todo |
| SKO-449 [075] Safe Exam Browser integration | Todo |
| SKO-476 [101] Campus-scoped audit history and sensitive change coverage | Todo |

SKO-408 itself is **Todo**. It cannot be validated or closed until all four above are Done
with attached, fresh QA evidence — not source presence or screenshots alone.

## Full prerequisite graph with live states

30 prerequisites. `Done` = 4, `In Progress` = 3, `Todo` = 23.

| # | Ticket | State | Blocked by |
| --- | --- | --- | --- |
| 1 | SKO-377 [002] Shared authorization and tenant/campus/child ownership | Done | — |
| 2 | SKO-379 [001] Shared design system and role-based navigation | Done | — |
| 3 | SKO-381 [007] Backups, restore rehearsals and migration checks | Done | — |
| 4 | SKO-382 [010] Durable event outbox and job orchestration | Done | SKO-381 ✔ |
| 5 | SKO-375 [005] Approved report versions and publication gates | In Progress | SKO-377 ✔ |
| 6 | SKO-386 [013] Job status, retries and delivery receipts | In Progress | SKO-382 ✔ |
| 7 | SKO-388 [014] Draft recovery, consistent navigation and accessibility | In Progress | SKO-379 ✔ |
| 8 | SKO-376 [003] Role assignment, invitations and membership UX | Todo | SKO-377 ✔, SKO-379 ✔ |
| 9 | SKO-380 [004] Reliable account lifecycle and administrator MFA | Todo | SKO-377 ✔ |
| 10 | SKO-384 [008] Auditable grade and finance corrections | Todo | SKO-377 ✔ |
| 11 | SKO-392 [018] Language, RTL, timezone, calendar and currency packages | Todo | SKO-379 ✔ |
| 12 | SKO-394 [020] Permanent student identity and enrollment history | Todo | SKO-377 ✔, SKO-381 ✔ |
| 13 | SKO-378 [006] Truthful marketing and synchronized pricing entitlements | Todo | SKO-375, SKO-379 |
| 14 | SKO-396 [022] Reversible imports and clear validation | Todo | SKO-381 ✔, SKO-382 ✔, SKO-384 |
| 15 | SKO-390 [016] Audited support access and service operations | Todo | SKO-377 ✔, SKO-380, SKO-384 |
| 16 | SKO-393 [019] Configurable curriculum, grading and term structures | Todo | SKO-392 |
| 17 | SKO-395 [021] Multiple guardians and granular access/consent | Todo | SKO-377 ✔, SKO-394 |
| 18 | SKO-383 [009] AI provider policy, privacy and evaluation gateway | Todo | SKO-375, SKO-377 ✔ |
| 19 | SKO-387 [011] Package comparison, trial and checkout | Todo | SKO-382 ✔, SKO-378 |
| 20 | SKO-447 [073] Regional hosting and data lifecycle controls | Todo | SKO-381 ✔, SKO-383, SKO-390 |
| 21 | SKO-476 [101] Campus-scoped audit history and sensitive change coverage | Todo | SKO-377 ✔, SKO-447 |
| 22 | SKO-391 [017] Standalone/school-group onboarding with resumable setup | Todo | SKO-376, SKO-387 |
| 23 | SKO-397 [023] Guided school setup and import reconciliation | Todo | SKO-391, SKO-392, SKO-393, SKO-394, SKO-395, SKO-396 |
| 24 | SKO-400 [026] Learning resource and document library | Todo | SKO-377 ✔, SKO-386, SKO-397 |
| 25 | SKO-406 [032] Curriculum and learning objective map | Todo | SKO-393, SKO-400 |
| 26 | SKO-407 [033] Reviewed question bank and assessment blueprints | Todo | SKO-406 |
| 27 | SKO-409 [035] Assignments, submissions and rubrics | Todo | SKO-400, SKO-406 |
| 28 | SKO-410 [036] Assessment accommodations and accessible materials | Todo | SKO-388, SKO-409 |
| 29 | SKO-411 [037] Focused exam session with autosave and recovery | Todo | SKO-382 ✔, SKO-407, SKO-410 |
| 30 | SKO-449 [075] Safe Exam Browser integration | Todo | SKO-410, SKO-411 |
| — | **SKO-408 [034] AI Exam Studio** | **Todo** | SKO-383, SKO-407, SKO-449, SKO-476 |

## Currently actionable (every native blocker is Done)

| Ticket | State | Note |
| --- | --- | --- |
| SKO-375 | In Progress | needs completion evidence |
| SKO-386 | In Progress | backend evidence exists; UI/browser + production build outstanding |
| SKO-388 | In Progress | needs completion evidence |
| SKO-376 | Todo | eligible to start |
| SKO-380 | Todo | eligible to start |
| SKO-384 | Todo | eligible to start |
| SKO-392 | Todo | eligible to start |
| SKO-394 | Todo | eligible to start |

## Execution rule

Implement and verify each prerequisite, attach its own QA/screenshots or operational
evidence, then move it to Done before starting its dependents. A prerequisite is never
complete from source presence or a screenshot alone. SKO-408 stays Todo until SKO-383,
SKO-407, SKO-449 and SKO-476 are each Done with evidence.
