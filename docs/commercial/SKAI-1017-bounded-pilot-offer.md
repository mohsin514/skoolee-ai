# SKAI-1017: bounded pilot offer, procurement and payment-readiness handoff

**Status: draft template. The agreement wording requires legal review.** This document records no buyer evidence, no price and no signature. It follows the [SKAI-832 pilot charter](SKAI-832-pilot-charter.md) and the D1 recommendation (PR #165, `d1-business-model.md`, which still awaits founder approval). Under that recommendation, Pakistan pilots use the existing PKR tiers, and KSA/Dubai get SAR/AED quotes only after discovery, with no published Gulf price. SKAI-894 owns willingness to pay. SKAI-1005 owns real buyer evidence.

## 1. Offer boundary

The offer covers one school, at most two agreed campuses, one grade/term and one mathematics pack, running alongside the school's existing SIS/LMS. Data moves through verified import and export only (SKAI-1015). The pack must be approved (SKAI-1007), and real data may be processed only after the market's trust gate passes (SKAI-1016).

## 2. Proposal template (versioned; each change gets a new version and the old ones are kept)

| Field | Value or explicit unknown |
| --- | --- |
| Version / date | |
| Geography (city) and pack / academic year | |
| Campuses / users | at most 2 campuses |
| Dates | start / end |
| Price | amount in the market currency, or **UNDECIDED** |
| Budget approver / academic champion / data-processing approver | names held in restricted storage, not here |
| Permissions and source rights | SKAI-1016 references |
| Baseline and follow-up success criteria | method, denominator, two complete cycles (SKAI-832) |
| Support | channel and hours, with the support-effort estimate marked as an assumption |
| Exit/export | format and retention handling |

## 3. Procurement and currency matrix (assumptions, not measured data)

| Market | Currency | Procurement path | Payment rail in the product |
| --- | --- | --- | --- |
| Pakistan | PKR | Owner or group finance; invoice | SafePay, sandbox only. Success, failure, refund, webhook and reconciliation paths are not yet recorded as tested, so the label is `SANDBOX_INCOMPLETE` |
| KSA | SAR | Principal plus budget and processing approvers (D2) | **Unavailable**: no provider integrated |
| Dubai | AED | Head of secondary plus bursar/IT or group procurement (D2) | **Unavailable**: no provider integrated |

Onboarding and support costs are unknown until they are measured from the first pilots. Formatting an amount in a currency does not mean that market is ready to take payment. The labels come from `paymentReadiness()` in `src/lib/school-ai/pilot-offer.ts`. A live-payment claim needs separate sandbox evidence for every path and a human code owner.

## 4. Commercial classification

The stages are `DEMO_INTEREST`, `DECLINED_PAYMENT`, `UNDECIDED`, `CONSENTED_PILOT` (needs a signed agreement reference) and `PAID_COMMITMENT` (also needs a settlement reference). `classifyStage()` never moves a pilot forward on an intention alone.

## 5. Truthful-claims checklist

`validateProposal()` rejects these claims, and demos must avoid them too:

- ERP replacement
- Guaranteed accuracy or time savings
- Official certification
- Noor, Madrasati or KHDA connectors
- Unreviewed compliance claims

Demonstrate only verified supported paths.

## Human-only

The following need people, not code: outreach, signing, pricing decisions, payment, real-school activation and legal review of the agreement.
