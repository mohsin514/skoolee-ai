# SKAI-1142 — Admissions module gap vs UK/US SIS products

*Audit date: 2026-10-29. Compared against the admissions modules typically found in UK products (Arbor, Bromcom, SIMS Admissions, iSAMS Admissions Portal, Schoolbase) and US/international ones (PowerSchool Enrollment, Veracross, Blackbaud Enrollment Management, OpenApply, Finalsite Enrollment). The comparison uses the workflow these products share, not any one vendor's screens.*

## What Skoolee has today

| Stage | Where it lives | State |
|---|---|---|
| Enquiry / lead CRM | `AdmissionQuery` + `AdmissionQueryFollowUp`, `/api/admission-queries`, `src/lib/admissions/enquiries.ts` | **Have.** Source, status (ACTIVE/FOLLOW_UP/CONVERTED/LOST), owner, next follow-up, follow-up log, overdue filter, delete blocked once converted. |
| Online application form | `AdmissionForm` / `AdmissionFormVersion` (SKO-398), public `/api/public/admissions` | **Have.** Form designer, versioned publications (a draft application keeps its version), conditional fields, EN/AR/UR labels, resume by reference + key, consent capture, staff entry on the family's behalf. |
| Document upload | `AdmissionDocument`, `/api/(public/)admissions/documents` | **Have.** Required/conditional documents per form, PDF/JPEG/PNG with magic-byte checks, 5 MB cap, SHA-256, missing-document list on review. |
| Review pipeline | `AdmissionApplication.status` + `AdmissionApplicationEvent` | **Have.** SUBMITTED → UNDER_REVIEW → INFO_REQUESTED, owner + next-contact, mine/unassigned/overdue views, office note vs family message, optimistic version check. |
| Offer / acceptance / decline | `actOnApplication` offer, record-acceptance/decline; `familyRespond` | **Have.** Offer names an intake class; the family accepts or declines online; decisions limited to the campus admin. |
| Waitlist | status `WAITLISTED` | **Partial.** A status only: no position, no ordering, nothing to say who is next. |
| Duplicate detection | `duplicatesFor` | **Have.** Configurable identity keys, explicit recorded choice before conversion. |
| Conversion to enrolled pupil | `convertApplication` | **Have.** Creates the pupil once (row lock + unique link), closes the linked enquiry. |

## Gaps (ranked by value to a UK/US school)

| # | Gap | Typical SIS behaviour | Value | Effort |
|---|---|---|---|---|
| 1 | **Assessment / interview scheduling** | Book an entrance assessment, interview, taster day or tour against an application; record the outcome (attended, no-show, score/recommendation); show what is upcoming. Every product listed has it. | **High** — independent and selective schools cannot run admissions without it; today staff keep it in notes. | M |
| 2 | **Offer response deadline** | An offer carries a "respond by" date; past it the family can no longer accept online and staff see it as lapsed. (UK: national offer-day deadlines; US: enrollment-contract deadlines.) | **High** — stops places being held indefinitely; needed before a waitlist can move. | S |
| 3 | **Waitlist position** | Ranked waitlist per intake; staff reorder; the next family is obvious when a place frees up. | **High** — `WAITLISTED` without an order is just a label. | S |
| 4 | Intake capacity (seats per class/year) | Offers counted against seats; warns when over-offering. | Medium | M |
| 5 | Acceptance deposit / enrolment contract | Deposit invoice or e-signed contract on acceptance (US especially). | Medium — touches payments (code-owner area). | L |
| 6 | Communication templates & bulk messages per stage | Templated emails/SMS for offer, waitlist, reminder. | Medium — touches messaging (code-owner area). | M |
| 7 | Admissions funnel reporting | Enquiry → application → offer → enrolled conversion, by source and year. | Medium | S |
| 8 | Scoring rubric / criteria (sibling, catchment, faith) | Configurable priority criteria and a score used to rank offers. | Medium (UK state-funded oversubscription criteria) | M |
| 9 | Sibling linking at application time | Auto-link applying child to existing sibling families. | Low — duplicate detection covers part of it. | S |
| 10 | Applicant self-booking of slots | Family picks an assessment slot online. | Low until #1 exists. | M |

## Built under SKAI-1142

Gaps **1–3**, the highest value with the least risk (no payments or messaging):

- `AdmissionAssessment` (interview / assessment / tour / taster day) with schedule, reschedule, outcome and cancel actions on the existing staff PATCH; outcomes go on the application history.
- `offerExpiresAt` on an offer: families cannot accept after it; staff see the deadline and a "lapsed" badge.
- `waitlistRank` assigned when an application is waitlisted, reorderable by the campus admin, shown in the pipeline.

Left for follow-up tickets: 4–10.
