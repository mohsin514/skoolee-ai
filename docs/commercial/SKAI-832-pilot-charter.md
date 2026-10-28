# SKAI-832 — Pilot charter and evidence worksheet

Status: DRAFT — no school agreement, activation, payment or publication approval.
Ticket: https://skooleeai.atlassian.net/browse/SKAI-832
Prepared: 2026-10-28. Required second-person review: pending.

This worksheet supports founder and school review. It is not an executed contract,
legal advice, a price offer or evidence of a paying customer. Complete approved
records in the restricted commercial evidence store; keep only non-sensitive
references in Jira and the repository. QA-01 is synthetic and never a customer.

## Decisions needed before a school offer

| Decision / evidence | Current state | Required decision maker |
| --- | --- | --- |
| Buyer cohort and discovery evidence (M01-01) | Pending | Founder |
| Representative task benchmark (M01-02) | Pending | Research lead, to be confirmed |
| Sustainable pilot price (M10-01) | Pending | Founder / commercial approver |
| School purchaser and authority to commit | No school identified | School authorized purchaser |
| Named school champion and vendor coordinator | Unassigned | Each party |
| Data authority, privacy and deployment readiness | Pending; see SKAI-1000 trust pack | School authority and authorized reviewers |
| Duration, capacity and support commitments | Not agreed | Both parties |
| Legal review of cancellation, refund and data terms | Pending | Authorized legal reviewer |

Do not infer a pilot fee from the subscription catalog. Refer to
[the commercial contract](CONTRACT.md) for the existing catalog; this worksheet
does not change its prices, entitlements, provider setup or approved terms.

## Charter version to review

All fields below are pending until evidence is recorded. Do not invent names,
dates, signatures, fees, capacity or acceptance on either party's behalf.

| Field | Agreed value / restricted evidence reference |
| --- | --- |
| Charter ID, version and previous version | Pending |
| School reference, country, campus and language | Pending |
| Authorized purchaser, authority evidence | Pending |
| Named school champion, vendor coordinator, measurement owner | Pending |
| Smallest useful outcome, in school language | Pending |
| Supported modules and exact workflow start / finish | Pending |
| Included classes, users, campuses and volume limits | Pending |
| Excluded modules, integrations and bespoke work | Pending |
| Start, end, review dates and delivery hours | Pending |
| School responsibilities: preparation, attendance, review, approvals | Pending |
| Vendor responsibilities: setup, training, support and escalation | Pending |
| Pilot fee, currency, taxes, invoice reference and due date | Pending |
| Payment arrangement, actual amount received and dated source | Pending |
| Cancellation triggers, notice, refund eligibility and timing | Pending legal and mutual review |
| Student-data authority and operational consent reference | Pending |
| Approved data scope, access, retention and exit policy | Pending |
| Deployment, privacy, security and rehearsal evidence | Pending |
| Purchase acceptance: both parties, version, date, source | Pending |
| Publication choice: none / anonymized / named | None; separate approval required |
| Publication scope, source, reviewer and review date | Pending |

Declining publication does not prevent participation or ordinary product use.
Purchase consent does not authorize a case study, quote, logo or school name.
Bespoke work requires a separate reviewed change with effort and price approved.

## Manual activation decision and waiting states

These are review states for the commercial evidence register, not new application
status values. Keep the application pilot PLANNED until the manual checks pass.
An application ACTIVE label alone is not evidence of an approved live pilot.

| Stage | Evidence needed / action |
| --- | --- |
| Qualified | Cohort fit, decision authority and supported workflow confirmed |
| Offered | Reviewed version delivered; no assumption of acceptance |
| Signed | Both parties accepted the same version; no assumption of payment |
| Waiting: payment | Invoice pending, failed payment or unresolved arrangement; retain draft |
| Waiting: provider | Required service unavailable; record owner and retry evidence |
| Waiting: readiness | Missing authority, privacy, deployment or rehearsal evidence |
| Ready for manual activation | Signed scope, confirmed payment arrangements, readiness and capacity all reviewed |
| Active | Actual approved start recorded with reviewer, date and source; never synthetic |
| Completed | Agreed cycles and review recorded; no assumption of renewal |
| Closed | Actual commercial outcome and exit evidence recorded |

Track signed, paid, activated and completed separately. Record cash collected
only against a dated receipt or verified settlement source; a promise is not cash.
Keep waiting reasons visible until resolved, without silently dropping failures.

## Baseline and cycle evidence

Agree methods and thresholds before the first live cycle. Record version, task,
participants using pseudonyms, comparable difficulty, observer, source and date.
Distinguish active work, correction time and elapsed time; record assistance,
incomplete attempts, exclusions with reasons, denominators and unknown values.
No numerical target is a measured result. Do not turn unknown values into zero.

| Cycle | Baseline / follow-up reference | Complete? | Support / failure reference | Reviewer / date |
| --- | --- | --- | --- | --- |
| 1 | Pending | Not run | Pending | Pending |
| 2 | Pending | Not run | Pending | Pending |

Require at least two complete relevant cycles before claiming repeatable workflow
benefit. Keep partial cycles visible. Two cycles alone do not establish causation
or satisfy every statistical threshold; apply the existing findings rules too.
Log days and staff hours from agreement to first useful cycle, direct delivery
and support costs, revenue collected, and change requests with source dates.

## Scope changes and closure

Preserve each original charter version. For every change record old and proposed
scope / success criteria, reason, effort, commercial impact, effective date and
both parties' approval references. Keep the previous scope in force until approved.
Do not overwrite baseline evidence to make a revised target appear achieved.

Closure record: actual paid / renewed / declined / stopped outcome; reason;
source reference; decision date; both parties' review; unresolved obligations.
Record agreed export scope and format, authorized recipient, export verification,
unpaid balances and refund resolution, then access closure and retention/deletion
under the approved policy. Keep unresolved exit items open with named ownership.
No automatic renewal, refund promise or deletion period is established here.

## Existing implementation and verification boundaries

Source inspection at base 98ed29b6651ebf626de0dc6db355fcb0aac99b72:

- `src/lib/pilots/service.ts`: creates pilot metadata and workflow definitions;
  activation checks a consent reference. Publication consent is separate.
- `src/lib/pilots/findings.ts`: separates synthetic / incomplete evidence,
  measured values, denominators and claim support.
- `src/config/commercial-contract.ts`: snapshots catalog terms and entitlements.
- `src/lib/readiness/service.ts`: provides institution readiness evidence.

Known limitation: `updateCharter` does not itself enforce payment, provider or
readiness checks, prevent synthetic ACTIVE records, version bilateral scope
changes, or establish a two-cycle commercial gate. This document adds a manual
review worksheet, not automated enforcement. Keep these limitations visible in
SKAI-832 and downstream SKAI-980 journey verification; do not claim all acceptance
criteria pass from this document or the existing application status field.

## Review and evidence sign-off

- [ ] Founder confirms cohort, bounded outcome, price and capacity.
- [ ] School authority and named champion confirm scope and data authority.
- [ ] Authorized reviewer confirms legal / privacy / deployment readiness.
- [ ] Both parties approve the dated charter version and change process.
- [ ] Independent reviewer checks baseline method and two completed cycles.
- [ ] Publication permission is checked independently for every claim.
- [ ] Closure evidence includes actual outcome, source and date.
- [ ] QA records environment, commit, observed failures, reviewers and limitations.

No visual change: repository documentation only. EN/UR/AR product screenshots,
keyboard checks and 200% zoom are not evidence for this document-only change.
A school-facing translation and comprehension review remain pending for the
language actually agreed with a school. No live deployment or pilot is asserted.
