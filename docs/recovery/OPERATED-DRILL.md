# Operated recovery drill pack (SKAI-865 / NFR-REL-03)

This pack turns the synthetic rehearsal in [RUNBOOK.md](RUNBOOK.md) into an
operated drill against a representative pilot environment. It contains no
measurements: every number below is a blank to be filled from an actual drill.
Until a drill record is signed, the school-facing recovery promise stays **unset**
(see "School-facing commitment" below).

## 1. Objectives to agree before the first drill

| Item | Value | Agreed by / date |
| --- | --- | --- |
| Pilot scope (schools, campuses, data classes) | _unset_ | |
| Target recovery point (RPO) | _unset_ | |
| Target time to verified school readiness (RTO) | _unset_ | |
| Services covered (DB, private files, auth, queues, messaging, payments) | _unset_ | |
| Services explicitly excluded | _unset_ | |

Provider PITR retention is an input, not the RPO. Local synthetic timings in
`docs/recovery/evidence/` are not RPO/RTO.

## 2. Owner inventory

Use the dependency table in RUNBOOK.md ("Recovery dependency inventory") and add
a named accountable owner per row before the drill:

| Dependency | Backup source (snapshot/PITR/object versions) | Owner | Last verified |
| --- | --- | --- | --- |
| PostgreSQL | | | |
| Object storage (S3/R2) | | | |
| Auth and encryption material | | | |
| Configuration and release artifact | | | |
| Queues (outbox, BullMQ) | | | |
| External effects (payments, email, WhatsApp, SMS) | | | |

## 3. Drill procedure (isolated destination only)

1. Confirm the destination is a separate project with outbound email, WhatsApp,
   SMS, payment and webhook credentials withheld and workers stopped. Record the
   destination project ID twice (operator and reviewer).
2. Select an authorized backup/PITR point and the matching object versions.
   Record backup age at the start (`now - recovery point`).
3. Start the clock. Restore database, then referenced private objects.
4. Run reconciliation: table counts and tenant ownership, invoice/payment and
   ledger totals, SHA-256 of every referenced object, outbox effect receipts.
   Use the same checks as `scripts/recovery` and `.github/workflows/recovery.yml`.
5. Negative cases on the restored copy: remove one referenced object, withhold
   one encryption key, alter one financial total. Each must block reopening
   with a specific diagnostic. Record the diagnostic text.
6. Confirm queued work with a completed external receipt is not replayed
   (outbox effect receipts / uncertain-send stop, SKAI-740 / SKAI-863).
   Provider-side reconciliation is required before any selective replay.
7. Rehearse secret recovery from the secret manager and revoke current sessions
   on the restored copy. Never copy credentials or production records into CI
   artifacts or tickets.
8. Stop the clock at verified readiness (synthetic QA-01 sign-in and one
   academic journey succeed on the restored copy).

## 4. Drill record (copy per drill)

| Field | Value |
| --- | --- |
| Date (UTC), release SHA, environment | |
| Destination project ID (operator / reviewer) | |
| Recovery point used and backup age | |
| Dataset size (rows, objects, bytes) | |
| Restore duration (DB / objects) | |
| Time to verified school readiness | |
| Reconciliation discrepancies | |
| Negative-case diagnostics (missing file / key / financial total) | |
| Duplicate external effect check | |
| Objectives met? (RPO yes/no, RTO yes/no) | |
| Unmet objective: remediation owner and due date | |
| Independent reviewer, decision and evidence set | |

Store the sanitized record under `docs/recovery/evidence/<date>-operated/`
(no secrets, no real pupil or guardian data).

## 5. Schedule, overdue and failure alerts

- Cadence: one operated drill per quarter and after any change to backup
  provider, storage, encryption or outbox design. The weekly synthetic
  rehearsal in `.github/workflows/recovery.yml` continues unchanged.
- Overdue: a Jira SKAI task "Operated recovery drill due" is created 14 days
  before the due date; if no signed record exists 7 days after the due date,
  the release operator escalates to the founder and the school-facing promise
  is withdrawn back to "unset".
- Failure: any failed drill or unmet objective opens a SKAI Bug linked to
  SKAI-865 with a named owner and due date.

## 6. School-facing commitment

Publish only what the latest signed drill measured, for the services it
covered. Template (fill from the drill record, never from targets alone):

> For [covered services], we restore from backups taken at least every
> [measured backup interval]. In our most recent recovery exercise on [date],
> service was restored and verified in [measured time]. [Excluded services] are
> not covered by this statement.

## 7. School-facing incident update template

> Subject: Service update for [school] — [short impact]
>
> What happened: [plain description, no technical blame].
> What is affected: [features, campuses]; your data in [unaffected areas] is not affected.
> What we are doing: [current action].
> What you should do: [action or "no action needed"].
> Next update: by [time, school's timezone].

Sent only by the support lead through the authorized channel (RUNBOOK.md,
"Incident record"). SEV1 within 1 hour; SEV2 the same working day.
