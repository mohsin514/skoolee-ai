# Archived ticket recovery review — 15 October 2026

This is a new-work review of the 374 archived records in the preserved pre-change snapshot. Archived issues were not reopened. A new issue is created only when repository evidence identifies a distinct, buildable gap without an active owner.

## Recreated as active work

- **Archived SKO-167 — Verify audit log entries for all CRUD operations → new [SKO-476 — Campus-scoped audit history and sensitive change coverage](https://linear.app/skoolee-ai-app/issue/SKO-476).** The old card had no description; source inspection found `src/app/api/audit-log/route.ts` relies on the Prisma tenant guard for school scope but does not filter by campus; `AuditLog` has no `campusId`, while campus-limited roles can see recent school-wide events in a modal labeled campus-specific. New scope defines explicit campus-scoped API access, consequential-event coverage, privacy, export, retention and QA. It is blocked by SKO-377 and SKO-447, coordinates with SKO-384/SKO-390, and gates real-learner integrity telemetry in SKO-408.

## Not recreated

- **184 legacy QA/domain proposals:** mapped provisionally to existing feature owners. They describe old route-level test cases, not 184 separate products. Useful assertions belong in each owner’s QA acceptance; a defect needs a reproducible case before a new ticket.
- **154 explicit successors and 24 QA-coverage records:** already represented by a current feature owner or test coverage.
- **Five vague defects** (SKO-183, 193, 194, 199, 206): insufficient source details to specify expected behavior. Recover the route, input, expected output, locale/policy and evidence before creating implementation tickets.
- **SKO-5 Dummy Users and Data:** archived record has no product acceptance contract and is not enough evidence for a customer feature.
- **Four Linear setup/tutorial records and one historical index:** not school product work.

The historical crosswalk is intentionally retained as a snapshot. Its original `191` triage count has one resolved-to-new-work candidate (SKO-167); the remaining 190 are still provisional or underspecified, rather than automatic build tickets.

## Dependency graph added

Each newly created issue has native Linear blocker relations. SKO-471 depends on identity, consent, curriculum and intervention owners; SKO-472 depends on regrade, report-version and learning-action owners; SKO-473 depends on assignment/rubric, AI policy and accommodation owners; SKO-474/475 depend on invoice, reconciliation and (for receipt allocation) ledger owners; SKO-476 depends on authorization and data lifecycle. SKO-476 blocks the full SKO-408 learner-telemetry release while leaving authoring and synthetic QA available.
