# SKAI-1043 [D1-03]: PKR paid-pilot offer sheet (Lahore / Islamabad school groups)

**Status: draft offer sheet. Founder sign-off and legal review are required before it goes to any school.** Source: founder decision D1 ([d1-business-model.md](../product-review-2026-10/d1-business-model.md), approved). The bounded scope comes from [SKAI-1017](SKAI-1017-bounded-pilot-offer.md) and the success method from the [SKAI-832 charter](SKAI-832-pilot-charter.md). This sheet contains no buyer evidence, no quote and no signature.

Fields marked **FOUNDER-SET** are not in the app catalogue and must be filled in by the founder for each group. Every other price is copied from `src/config/plans.ts` (`COMMERCIAL_CATALOG_VERSION` `2026-10-08.1`, currency PKR, calendar-month billing). If the catalogue changes, this sheet must be updated in the same PR.

## 1. Who it is for

There are three owner-run school groups in Lahore or Islamabad, each with 1–5 campuses. Each pilot covers **one school, at most two agreed campuses, one grade/term and one approved mathematics pack** (SKAI-1007; e.g. the BISE Lahore Grade 9 maths pack, SKAI-1010). The pilot runs alongside the school's existing SIS. Data moves only by verified import and export (SKAI-1015), and real data is processed only after the Pakistan trust gate passes (SKAI-1016).

## 2. Catalogue tiers (from the app)

| App tier id | Name shown | PKR / month | AI credits / month | Students | Teachers | Campuses |
| --- | --- | --- | --- | --- | --- | --- |
| `FREE` | Basic | 0 | 100 | 50 | 2 | 1 |
| `BASIC` | Pro | 4,000 | 1,000 | 500 | 10 | 1 |
| `PRO` | Enterprise | 7,000 | 5,000 | 2,500 | 50 | 5 |
| `ENTERPRISE` | Custom | quoted (**FOUNDER-SET**) | contract | contract | contract | contract |

Annual billing gets a 20% discount (`ANNUAL_DISCOUNT`). Unused credits expire at the calendar-month reset; there is no rollover (`AI_CREDIT_POLICY`). D1 includes Exam Studio from the Pro tier upward, and AI credits are the margin lever.

> Discrepancy to resolve: the D1 document quotes 50 / 800 / 4,000 credits (from the marketing site), but the app grants 100 / 1,000 / 5,000. This sheet uses the app values. The founder must align the two (D7) before any quote goes out.

## 3. Pilot offer

| Item | Value |
| --- | --- |
| Recommended tier | Pro (`BASIC`, PKR 4,000/mo) for one campus; Enterprise (`PRO`, PKR 7,000/mo) when two campuses are in scope |
| Pilot length | one term, with two complete measurement cycles (SKAI-832) — dates **FOUNDER-SET** |
| Pilot price | catalogue price for the chosen tier, or a pilot discount: **FOUNDER-SET** (amount and end date) |
| Onboarding / setup fee | **FOUNDER-SET** (no catalogue value; onboarding cost not yet measured) |
| Extra AI credits | **FOUNDER-SET** price per block. Must stay above the measured cost per credit in the SKAI-1042 report (Owner console → Insights → AI cost per credit) |
| Payment | invoice to owner or group finance. SafePay is `SANDBOX_INCOMPLETE` (SKAI-1017 §3), so no card or wallet payment is promised |
| Conversion | at the end of the pilot the school moves to the same tier at catalogue price, or exits with a full export |
| Exit | export format and retention handling per SKAI-1017 §2 |

## 4. What we will and will not claim

We may claim only verified and gated features. We may not claim any of the following (enforced by `validateProposal()`): ERP replacement, guaranteed accuracy or time savings, official certification, board or government connectors, or unreviewed compliance. Any example figure must be labelled illustrative (`claimsPolicy`).

## 5. Before sending

- [ ] Founder has set every **FOUNDER-SET** field and recorded a versioned proposal (Owner console → Pilot readiness)
- [ ] The latest SKAI-1042 report shows margin at or above zero for the chosen tier
- [ ] Legal review of the agreement wording
- [ ] Pack approved, and trust gate passed for real data

## Human-only

Outreach to the three groups, the price decisions, negotiation, signature, invoicing and collection.
