# SKAI-1018 (D2-12) — Sequential pilot readiness and go/no-go review

Status: **gate and template only. No school is named, no pilot has run, no result is measured.** Built 29 October 2026 against the approved D2 plan (`docs/product-review-2026-10/d2-market-research.md`, founder approval in chat 28 October 2026).

## Enforcement

`src/lib/school-ai/pilot-readiness.ts` (`evaluatePilotReadiness`) composes the SKAI-1007 rule (`pilot-eligibility.ts`) and is fail-closed. A pilot for one school and one pack is available only when **all** hold:

1. The pack passes SKAI-1007 eligibility (approved, dated, not stale, approved geography, Gulf budget approver).
2. Market sequence: Pakistan first; KSA and Dubai each require a recorded Pakistan go decision, and are gated independently of each other. No chain-wide or all-market activation exists.
3. School scope names school, campuses, academic lead and teachers (pseudonymous roles only; email/phone refused). Fewer than two campuses or two teachers needs a written exception.
4. Every readiness item below is `PASSED` exactly once, with a reference, reviewer and non-future review date. Only AI-05 may be marked not applicable, and only when the pilot runs with AI off.
5. A measurement-console pilot (SKO-430, `src/lib/pilots`) is linked with a defined baseline; success thresholds were agreed **before** the decision date.
6. A signed decision is `GO`, with founder and school approver, rollback plan, exit/export plan and a completed sales/demo claim review. `NARROW`, `STOP` and `DEFER` keep the pilot unavailable.

Tests: `tests/school-ai/pilot-readiness.test.ts` prove each missing item, invalid evidence, wrong sequence and non-GO decision blocks activation.

## Readiness checklist (one per school × pack)

| Item | Evidence owner | Evidence link | Reviewer / date | Status |
| --- | --- | --- | --- | --- |
| PACK_EDITION_APPROVAL | SKAI-1008 + pack ticket (SKAI-1009/1010/…) | | | MISSING |
| SOURCE_RIGHTS | SKAI-1008 + pack ticket | | | MISSING |
| LANGUAGE_QA | SKAI-1013 | | | MISSING |
| END_TO_END_CYCLE | SKAI-1014 | | | MISSING |
| EXCHANGE_RECOVERY | SKAI-1015 | | | MISSING |
| LEGAL_SECURITY_PERMISSIONS | SKAI-1016 / SKAI-1000 | | | MISSING |
| SCHOOL_PERMISSIONS | School approver | | | MISSING |
| COMMERCIAL_SCOPE | D1 / SKAI-894 | | | MISSING |
| AI05_STATUS | AI-05 release gate (or AI_OFF) | | | MISSING |

Visible demand/payment prerequisites, not readiness items: SKAI-1005 (interviews) and SKAI-894 (payment evidence) must be complete before any demand or paid-commitment claim.

## Measurement plan (reuse SKO-430 console)

- Record baseline and comparable follow-up task definitions per workflow key; time, correction and support effort; release errors; consent permission (`NONE`/`AGGREGATE`/`NAMED`); dates.
- The console already refuses percentage claims below `MIN_PAIRS_FOR_PERCENT` pairs and blocks export of synthetic pilots. Do not generalize tiny samples.
- Repeatability needs at least two independent schools; label anything stronger as a proposed rollout target, not completed evidence.

## Go/no-go review record

| Field | Value |
| --- | --- |
| Market / school ref / pack | |
| Outcome (GO / NARROW / STOP / DEFER) | |
| Rationale, contradictions, refusal to pay, switching burden, correction/support cost, rights/security constraints | |
| Negative evidence preserved (list) | |
| Evidence level reached (L3 / L4 / L5) | |
| Founder approver / school approver / date | |
| Rollback plan / exit-export plan | |
| Sales/demo claims reviewed | |

## Human-only, not done here

Selecting and recruiting schools, any outreach or contract, setting thresholds with the founder and school, running baseline and follow-up cycles, legal/security review, and signing the decision. Ticket planning does not authorize outreach, contracts or real-data ingestion.
