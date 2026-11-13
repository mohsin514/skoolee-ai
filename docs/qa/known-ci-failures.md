# Known CI failures

Register of CI jobs that are red on unrelated branches, so a red check is not
mistaken for a regression. Each entry has a follow-up ticket and needs a code
owner. Do not skip, disable or `.only` these tests (AGENTS.md rule 7). Remove an
entry when its ticket is Done and the job is green on three consecutive runs.

Last checked: 2026-11-13 (SKAI-1256), runs on branches SKAI-230, SKAI-1917.

| Workflow | Failing tests | Symptom | Area / owner | Ticket |
| --- | --- | --- | --- | --- |
| `ai-workflows.yml` | `test:ai-workflows:db` #6 model draft, #115 social conversation, #161 knowledge follow-ups | `1 !== 2` on activation lock; DB assertions | AI (AI-05 review) | SKAI-1920 |
| `destructive-confirmations.yml` | `tests/destructive/operations.database.test.ts` #1, #4, #9, #10 | Prisma request errors (likely schema drift vs CI DB) | Finance deletion | SKAI-1921 |
| `account-lifecycle.yml` | #17 SKAI-1290 deactivated cookie, #26 SKAI-87 forced change | `401 !== 200`, `409 !== 400` | Auth | SKAI-1922 |
| `pr-checks.yml` | `tests/checkout-intents/settlement-replay.test.mts` | `client.school.findUnique is not a function` on CI only (mock.module vs dynamic import) | Payments | SKAI-1923 |

Already fixed: design-system adoption (enrollment, check:ui), recovery PGDG
client, ai-workflows registry expectation (PR #727). `recovery.yml` is green again.

Repro: `gh run list --workflow <file> --limit 3`, then `gh run view <id> --log-failed`.
