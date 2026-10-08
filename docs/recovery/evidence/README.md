# SKO-212 local verification — 2026-10-08 UTC

Synthetic PostgreSQL 16 on loopback port 55412; no remote database writes,
notifications, application deployment or provider setting changes. Source schema:
`dev` commit `9c5193d`. All 26 archived migrations matched that commit byte for byte.

- `success.json`: clean provisioning, schema equality, populated adoption/upgrade,
  every application's table count/content hash, invoice/grade integrity, referenced
  object content, migration rollback, blocked retry and reviewed forward repair.
  Actual restored point 2026-10-08 04:42:00.826411 UTC; verified restore 5.905 seconds;
  total drill 20.438 seconds. These are local measurements, not provider RPO/RTO.
- `missing-file.json`: missing referenced attachment fails with the precise file key.
- `corrupt-record.json`: changed grade fails whole-record reconciliation.
- `migration.json`: unrepaired migration blocks promotion after a blocked retry.
- `reconciliation.json`: counts/hashes for every public application table, with a
  synthetic recovery-point marker. Role fixtures cover every `UserRole` enum value.

Two operator-decision tests passed: accept valid evidence while prohibiting
production authorization/overwriting, and reject acceptance of blocked evidence.
Both workflow YAML files parsed successfully; `git diff --check` passed.

Raw synthetic dumps/logs and failed drill databases were retained under the local
`/private/tmp/sko-212-*` paths for diagnosis; they are not committed. CI regenerates
and retains equivalent artifacts. Human operator sign-off is intentionally empty.
No pupil dashboard changed, so layout/browser account checks are not applicable to
this infrastructure patch. Full provider storage/PITR/KMS and role workflow checks
remain explicit release gates in the runbook.
