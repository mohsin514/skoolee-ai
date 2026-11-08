# Pilot authoritative-sources agreement and coexistence runbook (SKAI-915, SKMR-22 / M02-03)

Status: template for agreement with each pilot school's owner, IT administrator and registrar. Nothing here is agreed with a real school yet. Pair it with `docs/pilots/scoped-exchange-contract.md` (SKAI-1015).

A pilot school keeps its current SIS. Skoolee runs only the agreed pilot scope (the assessment workflow). This page records who owns which data and how changes move between the two systems. It does not describe a new connector or a second connection screen. Configuration, test runs, sync status and errors stay in the existing identity/roster workspace (the identity section of `/admin`, `src/components/identity/identity-admin.tsx`).

## 1. What is supported (say this before setup)

| Route | Status | Notes |
|---|---|---|
| OpenID Connect sign-in (authorization code + PKCE) | Supported | `src/lib/identity/service.ts`. Directory groups map to roles. Directories can never grant owner or super administrator roles. |
| Roster sync by JSON rows with stable `externalId` (preview, then commit) | Supported | Preview shows ADD / UPDATE / WITHDRAW / UNCHANGED / CONFLICT / ERROR for each row before anything is written. |
| Manual CSV roster import / export | Supported, **manual** | See section 4. A CSV export from the SIS is a manual exchange. It is **not** a certified integration. |
| Public v1 student + external-ID contract | Supported (narrow) | `src/lib/integrations/contract.ts`: `student`, `externalRef`, `linkExternalId`. |
| SAML, SCIM, OneRoster | **Not available** | The UI says so. Offer the manual CSV route instead. Never record these as working. |
| Noor, Madrasati, KHDA or any vendor SIS/LMS connector | **Not available** | Not listed until it is authorised and covered by its own end-to-end test. |

## 2. Authoritative-source agreement (fill in one per school)

| Item | Value |
|---|---|
| School / campus (synthetic QA-01 for rehearsal) | |
| Authoritative SIS (product + version) | |
| Modules that stay in the SIS during the pilot | e.g. admissions, fees, timetable, attendance |
| Modules active in Skoolee for the pilot | e.g. assessment only |
| Source-system name used for external IDs | |
| Registrar (decides ownership conflicts) | |
| IT administrator (runs exchanges) | |
| Exchange cadence (section 4) | |
| Agreement version and date, signed by | |

### Field ownership

Each synced field is managed either in the **source system** (`SOURCE`, the default) or **here** (`LOCAL`). The fields are `fullName`, `admissionNo`, `className` and `status`.

| Field | Owner (SOURCE / LOCAL) | Who may edit in Skoolee | Notes for the registrar |
|---|---|---|---|
| fullName | | | |
| admissionNo | | | |
| className (enrollment) | | | |
| status (active / withdrawn) | | | |

Rules a registrar needs to know (these match the current code):
- **SOURCE fields:** the upstream value is applied on commit. If someone also edited the field in Skoolee since the last sync, the row becomes a **CONFLICT** and nothing is applied until an authorised user picks KEEP_LOCAL or takes the source value.
- **LOCAL fields:** an upstream difference is shown but never applied.
- **Blank upstream values:** a missing or null field keeps the local value. Leave a field out to mean "no information". Do not send an empty string, which can be read as a new value. To clear a value, edit it in the owning system.
- **Roles** are never changed by a roster. Role differences are shown only. Change them through the directory group mapping or in Skoolee.

## 3. Identity rules (what keeps the right learner)

- External IDs are stored per connection (one connection = one school and one source system) and kind (`rosterExternalId` unique on connection + kind + externalId). The same external ID from another school or another source system is a different person.
- People are matched by external ID only, never by name or email. A renamed pupil keeps the same ID, record and history. If an admission number already belongs to a pupil linked to a different source ID, the row becomes a CONFLICT rather than a silent relink.
- If a staff email already has an account, the row is a CONFLICT ("link it deliberately"). A second account is never created.
- A pupil at another campus is an ERROR. Rows never move pupils between campuses.
- A class change on a SOURCE-owned `className` creates the enrollment transition when committed.
- `status: withdrawn` is shown as a destructive WITHDRAW in the preview. For staff, committing revokes access and ends sessions, so their next request fails. Records stay.
- A stale preview (data changed after review) is refused. Re-run the preview. Replaying the same batch returns the stored result and does not create a parallel history.

## 4. Manual CSV exchange cadence (until an automated adapter is supported)

Default cadence (adjust in section 2): weekly during the pilot, plus same day for any withdrawal of staff access.

1. IT administrator exports from the SIS with a stable external ID column. Names and emails are not IDs.
2. Upload in the existing roster/import workspace and open the **preview**. Do not commit yet.
3. Registrar reviews: every WITHDRAW and CONFLICT row, every ERROR with its reason, and counts against the SIS export.
4. Resolve each CONFLICT (KEEP_LOCAL or take the source value). Fix ERROR rows in the source and re-export them, not in the file by hand.
5. Commit. Record the batch reference and the counts in the log below.
6. If the upload or commit is interrupted, open the same batch again (re-uploading the same file returns the same batch). Do not start a second import.

### Reconciliation checklist (each exchange)

- [ ] Row counts: SIS export = ACCEPTED/ADD + UPDATE + UNCHANGED + WITHDRAW + SKIPPED + CONFLICT + ERROR
- [ ] No CONFLICT left unresolved past the agreed age (proposed: 5 school days)
- [ ] Withdrawn staff checked: they can no longer sign in
- [ ] Spot-check 5 pupils: name, admission number and class match the SIS
- [ ] Any incorrect overwrite recorded in the log, with the field and owner
- [ ] Batch reference saved against this agreement version

### Exchange log

| Date | Batch ref | Rows | Conflicts open | Errors | Incorrect overwrites | By |
|---|---|---|---|---|---|---|

## 5. Measures (proposed research gates, not yet measured)

- Time from agreement to the first reconciled exchange.
- Unresolved sync exceptions by age and source. Incorrect overwrites detected.
- Share of pilot schools that adopt without migrating unrelated ERP modules.

## Human-only (open)

- Agree and sign section 2 with each pilot school's owner and registrar.
- Confirm the incumbent SIS export can supply a stable external ID.
- Link the exact M06 connection/reconciliation card. Until then, the existing identity/roster workspace is the shared surface.
- QA on dev with two schools and a denied role, following the ticket's "QA & evidence" section.
