# SKAI-901 — D1 business model recommendation

Research cut-off: 29 October 2026. Owner/decider: Mohsin Ali (founder). **For founder approval; not yet recorded in the PRD decision log.**
This is a desk-research decision package. No paid pilot, signed contract or willingness-to-pay interview is evidenced. Price figures below are benchmarks, not a validated price.

## Options considered

| Option | Description |
| --- | --- |
| A | PKR plans for Pakistani owner-run school groups (current 4-tier catalogue: Basic PKR 0 / 50 AI credits, Pro PKR 4,000 / 800, Enterprise PKR 7,000 / 4,000 per month, Custom quote; metered by campuses, students and AI credits — `skoolee-ai-marketing/lib/data.ts`). |
| B | USD/SAR/AED-priced Exam Studio module sold to international and Gulf private schools. |
| Goal conflict | PRD targets a ≥USD 10M raise; SKMR targets a PKR 50 crore sale. One must guide spend. |

## Evidence, interpretation and limits

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| [SkoolPro listing, Software Advice AU](https://www.softwareadvice.com.au/software/695234/SkoolPro) (viewed 29 Oct 2026): PKR 40–55 per student per month. | Pakistani per-student ERP pricing exists; a 1,000-student school would pay ~PKR 40k–55k/month for a full ERP. | That buyers pay this for an AI exam workflow. Third-party listing. |
| [HysabOne education](https://hysabone.com/industries/education/) (viewed 29 Oct 2026): flat plans from PKR 3,499/month. | Flat low-PKR plans are the local anchor; our Pro PKR 4,000 sits at that anchor. | Feature parity. |
| [Teachmint on Capterra](https://capterra.com/p/163105/Teachmint/) (viewed 29 Oct 2026): from USD 5 per user per year. | Regional ERP is commoditised at very low per-seat prices. | Gulf pricing; Classera publishes no price (quote-only). |
| D2 ([d2-market-research.md](d2-market-research.md)): Noor/Madrasati/Classera already cover Saudi core records and exams. | In KSA/Dubai a full ERP is not the wedge; a bounded exam workflow alongside existing systems is. | Gulf willingness to pay. |

Interpretation: ERP seats are cheap and crowded in all three markets. Skoolee's PKR flat tiers sit at the floor; margin must come from AI credits and the exam workflow, not seat counts. OpenAI cost per credit must stay below the credit price in PKR — a pricing constraint, not a provider choice.

## Recommendation

**Choose A for paid pilots now; run B as parallel discovery with no build spend until two Gulf schools agree a paid pilot.** Price Pakistani pilots in PKR on the existing tiers, with Exam Studio included in Pro and above and AI credits as the margin lever. For KSA/Dubai, quote Exam Studio as a per-campus annual module in SAR/AED only after discovery calls; do not publish Gulf prices.

**Goal to guide spend: the PKR 50 crore sale path (SKMR) for the next two quarters**, measured by paying Pakistani campuses and net revenue retention. The USD 10M raise is revisited once L5 pilot evidence exists; nothing in this review supports raising before revenue evidence.

## Risks

- PKR tiers may be too cheap to cover AI usage at scale → monitor cost per credit monthly; cap free-tier credits.
- PKR devaluation erodes cover for USD-denominated AI cost → reprice credits quarterly.
- Gulf discovery stalls without a product variant → bounded by the two-paid-pilot gate.

## What it unblocks

V3 payment evidence, D7 (prices become canonical in one catalogue), D3 messaging cost model, SKAI-1005 demand evidence.

## Follow-up tickets

1. D1-01 Record decision in the PRD decision log (Confluence) and on SKAI-901.
2. D1-02 AI cost-per-credit report (OpenAI spend ÷ credits consumed, per tenant).
3. D1-03 Paid-pilot offer sheet in PKR for three Lahore/Islamabad groups.
4. D1-04 Gulf discovery script and SAR/AED quote template (no public price).
