# SKO-381 final engineering verification — 15 October 2026

**Environment:** dedicated PostgreSQL 16 on loopback port 55439; unique generated
rehearsal databases and local private files. All records, identities, artifacts and
jobs are synthetic. No production credentials, remote database, provider requests,
application server or worker entrypoint were used. Providerless handlers exercised
the actual outbox consumer after the restored records/files had reconciled.

This is agent-executed engineering QA. It does not fabricate a human operator
signature or authorize a production restore, deployment or school reopening.

## Current evidence

- Source commit: `1b366664ed5c4ea3b453df8077bf0cb81e273ce5` with uncommitted changes.
- Exact tested input manifest SHA-256: `534b6d451ac0621b81347b0ce5182badabb3062358aedc8eb83d86f1a8ba393c`.
- Positive rehearsal: **21/21 gates passed**, all 51 versioned migrations,
  157 application tables / 39 synthetic rows reconciled across all columns.
- Actual restored point: **2026-10-15 10:34:23.795131 UTC**.
- Verified restore elapsed: **15.845 seconds**; backup age at restore: **0.769828 seconds**.
- Full rehearsal: **50.701 seconds**. The source was quiesced; every restored record
  hash, schema/security definition and referenced object matched. No fixture loss
  was observed. These measurements are not contractual RPO/RTO promises.
- Post-restore job smoke: **7/7 checks passed**, 32 jobs at concurrency 4; 28 jobs in
  tenant A and 4 in tenant B. Load phase **44.707 ms**, p95 A **10.056 ms** / B **4.447 ms**.
  Declared development budgets: 5,000 ms per job / 30,000 ms total. **Zero actual
  provider calls**. The deliberately uncertain in-process sink was invoked once
  and could not be automatically replayed.
- Pure recovery tests: **16/16**. Actual email and payment readiness tests: **5/5**.
- Existing commercial contract regression tests: **7/7**.
- Focused ESLint, complete TypeScript check and whitespace check passed.
- **6/6 negative drills passed**: missing file, corrupt file, corrupt records,
  corrupt archive, schema drift and unrepaired migration each returned exit1 with
  the expected blocking reason and the same current input hash. Recorded in
  `negative-drill-summary.json`; final manifest comparison also matched source.

The original 18-gate report in the sibling `sko-381-2026-10-15` directory remains
historical evidence. Use this directory for current screenshots and QA remarks.

## Criterion-by-criterion review

| Required criterion / QA flow | Observed engineering result | Evidence |
| --- | --- | --- |
| Clean install from versioned migrations, no manual schema edits | Pass. Empty DB deploy, migration status and Prisma drift check succeeded. | `report.json`: clean-provisioning gate; manifest covers all migrations |
| Supported populated upgrade paths | Pass. Frozen `dev-9c5193d` predecessor with grades/invoices/attachments adopted as the verified baseline, then upgraded to head; all predecessor values retained and intended enrollment backfill reconciled. The supported baseline-to-head segment is exercised in the same run. Arbitrary unsupported historical schemas are not claimed. | populated-upgrade, additive-table and enrollment-backfill gates |
| Complete recovery inventory | Implemented. DB ledger/security catalog, files/artifacts, authentication/encryption, config, queues and external-effect ownership documented. Local exercise proves the synthetic subset; provider-managed globals remain environment-specific. | `docs/recovery/RUNBOOK.md`, schema/security and file checks |
| Isolated DB and file restoration; no real notifications | Pass. Scrubbed allowlisted subprocess environment validated before DB creation; unique loopback destinations, synthetic fixture files, no provider SDK/worker entrypoint. Both object references, hashes, published artifact bytes/reference and all table hashes reconcile. | `environment-preflight.json`, `reconciliation.json`, records/files/artifact gates |
| Recovery point, backup age and elapsed time measured | Pass. Point read from restored marker, elapsed measured with monotonic clock; no provider-plan assumption or promised RPO/RTO. | `report.json`, metrics above |
| Missing/corrupt object, records, archive or schema blocks readiness | Required negative drills rerun at current input hash; exact failed check and nonzero exit retained. No green result or promotion receipt is produced. | `negative-drill-summary.json`, individual fault reports |
| Interrupted migration / documented forward repair | Pass. Deliberate transactional SQL failure rolls back; ordinary retry remains blocked; only the known isolated rollback is marked rolled back before corrected migration is reapplied. Unrepaired negative drill fails. | migration-failure gates and `migration.json` |
| Deployment gate and evidence provenance | Implemented and local guard tests pass. Controlled workflow requires recovery dependency, exact SHA, evidence URL, migration status/drift and explicit forward decision. Dirty-tree report cannot certify promotion of HEAD. Actual remote branch protection/provider settings are not claimed. | workflow YAML, `test_decision.py`, `test_verification.py`, input manifest |
| Production authorization and destination confirmation | Implemented procedure; no production execution is needed or authorized for development acceptance. Decision helper rejects blocked/incomplete/stale-release evidence, is append-only and always records production/reopening authorization false. | runbook incident procedure and decision tests |
| Config validated by names/purposes; secrets redacted | Pass. Missing, incomplete, invalid, disabled and configured-unverified states tested; malformed destinations/runtime hooks block the synthetic envelope; secret values omitted from JSON/HTML. Generic `.env` values were not inspected or used. | preflight tests and rendered report |
| Provider/storage/payment/email truthful states | Pass for engineering configuration/readiness contract. Key presence does not claim provider connectivity. Email dev bypass cannot mark delivery SENT; invitation callers receive failure, outbound-disabled wins. Safepay placeholder and partial bank details are unavailable; Stripe requires key/account shape plus onboarding. Checkout missing all methods returns503 and the existing localized package UI disables paid choices with alternatives. Local file bytes are actually restored; remote storage/provider health is explicitly not-tested. | `provider-readiness.test.ts`, payment/email consumers, preflight report |
| Job failure/retry and tenant-load observability | Pass for recovery smoke. Actual outbox functions record sanitized failure, retry, one committed effect despite duplicate consumption, cross-tenant denial and failed uncertain receipt. Scoped reconciliation exposes only its tenant's correlation IDs. Both tenants complete within declared development budgets. Redis delivery, scheduler fairness and production capacity are separate feature/load certification. | `job-smoke.json`, `scripts/recovery/job-smoke.ts` |
| Environment, range, restore/smoke summary and correlation IDs in evidence | Pass. Synthetic environment label, source/input hashes, migration range, record/file hashes, timing/threshold summary, sanitized job IDs and failure names are retained. | report, manifest, job-smoke and fault reports |
| Schedule and accountable review path | Implemented weekly Monday03:20UTC, PR and manual/reusable CI triggers; operation owner and one-working-day review/failure follow-up documented. Actual remote schedule runs after merge; no human review is invented. | recovery workflow and runbook |
| Operator UX, keyboard/mobile and error recovery | Static semantic HTML report and plain runbook, no app mutation controls/modals or keyboard traps; reports preserve stage, scope, discrepancies and next action. Failed destinations retained; passing destinations cleaned. Root review provides current desktop/mobile screenshots. | `report.html`, screenshots attached to Linear by root |
| Regional/language cohort application | Recovery compares stored bytes and tenant relationships independently of curriculum, language, timezone or currency. This feature adds an internal English report, not a localized pupil workflow; its optional operator-view wording does not claim deployed AR/UR coverage or external regional hosting. Product localization/provider-regional checks remain with their owning features. | runbook scope and report labels |

## Concrete changes from the first review

1. Added a redacted, fail-closed subprocess preflight plus an offline application
   configuration inventory. Both preserve configured versus actually verified.
2. Fixed the Vercel setup runbook's obsolete shared-database and generic backup
   credential instructions. Intended environment names no longer claim discovered
   live deployments. Controlled promotion and distinct environment stores are explicit.
3. Fixed actual email/payment readiness false positives, including consumers that
   previously could record a development email as SENT or return a fake available
   bank/Safepay checkout. No real payment/SMTP/provider calls were made.
4. Added published artifact recovery and actual post-restore outbox retry/isolation
   smoke with finite test load, measured timings and sanitized correlations.

## Gates before an actual environment is promoted or restored

These are operational gates at the time of use, not a demand to deploy production
to finish the development ticket:

- Confirm a named nonproduction target and environment-specific secret ownership;
  do not infer one from a generic local `.env` or a project name in documentation.
- Run clean-commit CI against the exact release and configure provider Git/branch
  protections; this dirty-tree result is implementation QA, not release approval.
- Verify the actual provider sandbox, storage ACL/KMS and database roles/PITR,
  secrets-manager recovery, integrations and regional residency before enabling them.
- Establish customer recovery/scale objectives from representative environment
  drills; the local regression budget is not a production SLA.
- Record the named operator/reviewer, incident-specific destination confirmation,
  forward/cutover decision and external-effect reconciliation before a real restore.

No cloud resource was provisioned and no live staging/provider health was asserted.
