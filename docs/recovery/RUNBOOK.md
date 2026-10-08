# Recovery and migration operator runbook

Owner: platform operations (release operator plus independent reviewer). This is
an internal checklist, not a school-staff restore interface. No successful
rehearsal means **recovery is unverified**. A backup existing, its restoration
passing, and a school being ready to reopen are three separate decisions.
All evidence timestamps use UTC. Commands and hashes are read left-to-right.

## Supported history and adoption

The old baseline contains captured CLI output. The 26 legacy directories are
preserved unchanged in `prisma/legacy-migrations/`; they are not runnable history.
`20261008000000_verified_baseline` freezes the schema from `dev` commit `9c5193d`.
Its SQL was generated with the locked Prisma 6 CLI (`migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma --script`). A clean database now uses
`pnpm prisma migrate deploy`; deployment never falls back to `db push`.

Supported paths are (1) empty database to versioned head; (2) the schema-equivalent
`9c5193d` schema-push release, populated, to the verified baseline and head; and
(3) that baseline to head. There is no invented certification of an arbitrary
historical database. Earlier/drifted installations are **blocked** until a
reviewed, tested forward migration is added to this matrix. Adding a supported
version requires retaining its immutable schema and representative fixtures in
the rehearsal. The baseline must never be regenerated after adoption.

Before an existing environment can use the new workflow:

- Record operator, reviewer, environment, immutable release SHA, incident/change
  ticket, full destination project ID and independently verified database host.
- Take protected database and object backups; prove them in an isolated clone.
  Export existing migration ledger, extensions, roles, grants, RLS policies,
  triggers, functions and provider configuration. Prisma schema comparison does
  not certify these provider-managed objects.
- Compare the clone to the frozen baseline and current application schema with
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma
  --to-schema-datamodel prisma/schema.prisma --exit-code`, with BOTH URLs pointing
  to the confirmed clone. A nonzero result blocks adoption. When later migrations
  exist, compare against the baseline schema separately before applying them.
- For schema-push databases without a ledger, use `pnpm prisma migrate resolve
  --applied 20261008000000_verified_baseline` only after equivalence and protected
  restore are approved. Then `pnpm prisma migrate deploy` and `migrate status`.
- If a ledger exists, do not delete or silently rewrite it. The operator must
  review its successful/failed entries and archive it in a separate restricted
  audit schema under the incident procedure, preserving checksums and provenance,
  before initializing the new ledger. This exceptional path is not automated or
  certified by the synthetic matrix; rehearse that exact transition first.
- Reconcile all application records and referenced objects before/after. Attach
  findings, SQL diff, migration outputs and reviewer approval to the ticket.
  Repeat the reviewed process for the real destination during an approved window.

Merging this PR is code review of the proposed history, not authorization to
baseline an existing environment. CI intentionally cannot perform adoption.

## Recovery dependency inventory

| Dependency | What must be captured and restored | Verification / owner |
| --- | --- | --- |
| PostgreSQL | Consistent database snapshot/PITR point, migration ledger, all tenant records, roles/grants, extensions, functions, triggers and RLS policies | Operations: restore without ignoring errors; compare all table counts/content and tenant ownership, FK integrity, grades, invoices/payments/ledger totals |
| Object storage | S3/R2 buckets, versions, keys, bytes, metadata, access policies and encryption-key versions | Operations: manifest of every referenced key, SHA-256 and size; restore to a separate bucket; missing/mismatched objects block readiness |
| File references | Student/staff document `file_key`, leave attachment keys, chat storage keys, library file keys, report-card PDFs, invoice/receipt/bank-file URLs, communication attachments, school/campus logos and user/student profile images | Inventory includes external URLs, embedded data and local `public/generated` files; classify each as captured, reproducibly regenerable or an explicit blocking gap |
| Authentication and encryption | `AUTH_SECRET`, provider keys, storage/KMS key versions, database TLS material, secret-manager recovery/access process | Security: recover separately from dumps; never put secrets or pupil records in CI artifacts; test old ciphertext/files; rotate/revoke sessions after incident as appropriate |
| Configuration | Release SHA, lockfile, schema, environment mapping, domain/DNS, Vercel runtime/build settings, public build-time values, webhook destinations | Release operator: reproduce the exact artifact; Next public variables are frozen at build time |
| Queues and integrations | Redis/BullMQ pending jobs, delivery deduplication state, SMTP/WhatsApp/payment/AI credentials and webhook events | Operations: keep workers stopped; inventory in-flight effects and reconcile provider-side actions before selective replay |
| External state | Payment gateway settlement, email/WhatsApp already sent, provider auth/config and external files | Domain owners: these are not rolled back by PostgreSQL restore; reconciliation and duplicate-prevention approval required |

Provider retention/PITR promises are not measured application RPO/RTO. Contractual
targets remain unset until actual full-environment drills and operating commitments
exist. Synthetic local-file restoration tests the manifest contract; it does not
prove S3/R2 access, KMS recovery, remote provider PITR or public traffic recovery.

## Scheduled isolated rehearsal

`Recovery verification` runs on PRs, weekly Monday at 03:20 UTC, manually, and as a
required dependency of deployment. GitHub schedules run from the default branch;
until this workflow reaches that branch, the operator runs it manually weekly.
Platform operations reviews every run within one working day, opens a remediation
issue for any failure/missed run, and records a named decision. Configure GitHub
workflow failure notifications and a required `Recovery verification / rehearse`
branch check; absence/staleness of evidence blocks release approval.

Local prerequisites: Node dependencies installed, PostgreSQL 16 client tools on
PATH, and a disposable PostgreSQL 16 instance bound to loopback. Example:

```sh
python3 scripts/recovery/rehearse.py --port 55412 --output /tmp/recovery-run-unique
```

The harness creates unique `rehearsal_*` databases and never reads `.env`. Its
subprocess environment excludes notification, payment, AI and cloud credentials;
it runs no app or worker. All identities use `example.invalid`, with a synthetic
user for every database role. Do not attach real data or provider credentials.
The destination host is hard-coded to `127.0.0.1`; only the explicit port/user and
optional `RECOVERY_PG_PASSWORD` for the disposable CI service are accepted.

The harness verifies clean provisioning and drift, upgrades populated records,
backs up PostgreSQL plus a referenced object, restores both, hashes every public
application table, checks invoice/grade values and file content, then forces a
transactional migration failure, blocked retry and reviewed forward repair. It
records a marker read from the restored database, backup age, recovery elapsed
time, total drill time, destination, findings and logs. The synthetic source is
quiesced between the marker and dump; production's actual point must come from its
snapshot/PITR recovery metadata and domain reconciliation, never this marker.

Negative drills (each must exit nonzero and name its actual discrepancy):

```sh
python3 scripts/recovery/rehearse.py --port 55412 --fault missing-file --output /tmp/recovery-missing-unique
python3 scripts/recovery/rehearse.py --port 55412 --fault corrupt-record --output /tmp/recovery-corrupt-unique
python3 scripts/recovery/rehearse.py --port 55412 --fault migration --output /tmp/recovery-migration-unique
```

Successful runs remove their databases; failures retain them and diagnostics for
authorized diagnosis. Record findings before disposing only the exact database
names listed in `report.json`. CI retains synthetic artifacts for 30 days; archive
approved evidence in the change record for the organizational retention period.
Do not upload production dumps to GitHub artifacts.

## Review the result and record the decision

“Restore completed. Verification is still pending.” means no readiness decision
has been made. A missing file means “Release blocked: file reconciliation did not
pass.” Errors preserve stage logs and the destination, without a fake completion
percentage. Logs are plain text and searchable; the JSON report lists textual
checks and explicit UTC times for a readable mobile incident checklist.

After reviewing a successful report, the **human operator** records:

```sh
python3 scripts/recovery/record-decision.py \
  --report /tmp/recovery-run-unique/report.json \
  --reviewer 'operator identity' --release 'immutable commit SHA' \
  --ticket 'approved change ticket URL' --decision accept-synthetic-rehearsal \
  --notes 'Reviewed checks and limitations; full environment evidence linked in ticket' \
  --output /tmp/recovery-run-unique/operator-decision.json
```

Use `--decision blocked` for unresolved findings and link the remediation issue.
The append-only decision binds the report hash and destination; it never authorizes
production restoration or reopening. CI leaves sign-off empty; automation must not
invent an operator. A protected ticket's authenticated reviewer identity is the
approval authority, not an arbitrary string supplied to this local helper.

## Deployment and forward-recovery gates

Disable Vercel automatic Git deployments **in every managed project** first.
The checked-in `vercel.json` disables Git-triggered deployments, including legacy
main/preview projects once they consume this commit. Independently confirm the
provider settings and cancel queued deployments from older commits during rollout.
`Migrate & Deploy` builds the exact reviewed checkout with pinned Vercel CLI and
deploys that prebuilt artifact only after synthetic recovery, approval, versioned
migration, ledger status and schema drift checks pass. It rejects stale branch
heads before migration and before promotion; even a push during promotion cannot
substitute newer source into the immutable local artifact. Dispatch environment must match the selected branch, and
concurrency is keyed by destination. No continue-on-error promotion path exists.

Configure each GitHub Environment with required reviewers (mandatory production),
branch restrictions, `DATABASE_URL`, `DIRECT_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`
and environment-specific `VERCEL_PROJECT_ID` secrets and:

| Environment variable | Required value |
| --- | --- |
| `VERCEL_AUTO_DEPLOY_DISABLED` | `true`, after verifying the actual provider setting |
| `RELEASE_APPROVED_SHA` | Exact candidate commit, refreshed after any change |
| `RELEASE_EVIDENCE_URL` | Protected change record URL with named sign-off, current backup/restore evidence and critical-workflow results |
| `FORWARD_RECOVERY_DECISION` | `approved-forward-repair-or-isolated-restore`, only after reviewing the decision below |

The evidence record must contain representative populated staging upgrade checks,
current backup age/point, all storage reconciliation, role-specific login and
critical school workflows (grade entry/read, invoices/payments and attachments),
notification isolation, desktop/mobile smoke results where changed, environment
and release IDs, unresolved gaps, owner and reviewer. This infrastructure change
adds no role UI; its automated fixtures cover every role's records, not browser
login/authorization. Full environment/app evidence remains a human release gate.
Do not set approval variables until those checks are complete. GitHub/provider
settings are external prerequisites, not changes this repository can enforce.

Before promotion decide: on migration failure, freeze deployment and writes that
could worsen the incident, preserve logs/ledger and backup, and inspect transaction
boundaries. Prefer a reviewed forward repair when existing data is intact. A
transactional failure can be marked rolled back **only after verifying no partial
changes**, then corrected and reapplied under review. Nontransactional/partially
applied migrations require a separate forward correction, not blind retry or
`db push`. The harness demonstrates rollback and repair only for its deliberately
transactional synthetic failure. Never edit an already successful migration.
If data integrity is uncertain, use the isolated restore procedure below. An app
rollback is allowed only when the prior app is compatible with the current schema.

## Production incident procedure (manual, separately authorized)

1. Incident commander opens a restricted ticket and records impact, candidate
   backup and actual recovery point, expected loss, encryption dependencies,
   elapsed-time objective (if agreed), operator and independent authorizer.
2. Operator and authorizer independently confirm source/destination project IDs,
   database host, region, storage bucket, environment and immutable release.
   Record explicit authorization before any write. School administrators cannot
   execute restores; provide them a plain service update through the incident owner.
3. Restore into an isolated destination with network egress denied to real
   notifications/payments, credentials withheld, webhooks disabled and workers
   stopped. Obtain snapshot/PITR metadata and object versions; preserve originals.
4. Reconcile all records, ownership, grades, invoices/payments/settlements, every
   referenced object and encryption dependency; exercise critical workflows with
   synthetic/sink accounts. Record actual restored point, backup age, measured
   recovery elapsed time and all discrepancies. Any discrepancy blocks cutover.
5. Independent reviewer signs the evidence and incident-specific cutover plan,
   including forward recovery if cutover fails. Record destination confirmation
   again. Only then perform the approved traffic/configuration switch.
6. Domain owners reconcile external side effects and approve controlled worker
   replay. Incident commander separately records school reopening authorization,
   communicates the demonstrated limits, monitors health, and schedules follow-up.

There is deliberately no production restore command or one-click replacement in
this tooling. Never run the synthetic harness against a tunnel to production.

Implementation references: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [prebuilt deployment](https://vercel.com/docs/cli/deploy), and [local build](https://vercel.com/docs/cli/build).
