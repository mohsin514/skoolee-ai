# SKAI-907 — D7 marketing site recommendation

Research cut-off: 29 October 2026. Owner/decider: Mohsin Ali. **For founder approval; not yet recorded in the PRD decision log.**

## Options considered

| Option | Description |
| --- | --- |
| Sync | Keep the separate marketing app (`skoolee-ai-marketing`) and generate its pricing from the app's plan catalogue at build time. |
| Redirect pricing | Keep marketing pages for narrative and SEO; send every pricing link to the app's `src/app/(public)/pricing` page. |
| Retire site | Fold everything into the app. |

## Evidence, interpretation and limits

- Marketing pricing is hard-coded in `skoolee-ai-marketing/lib/data.ts` (Basic PKR 0 / 50 credits, Pro PKR 4,000 / 800, Enterprise PKR 7,000 / 4,000, Custom quote), while the app renders its own `components/marketing/PricingPage`. Two hand-maintained sources will drift — the same failure already seen with the two student rosters.
- D1 makes PKR tiers canonical for Pakistan and forbids public Gulf prices, so every public price must come from one catalogue.
- The [Competition Commission of Pakistan](https://www.cc.gov.pk/) (viewed 29 Oct 2026) enforces deceptive-marketing provisions (Competition Act 2010, s.10); advertising a price that differs from what is charged is a needless risk.

## Recommendation

**Redirect pricing: replace the marketing pricing section with a CTA and 301 `/pricing` to the app's pricing page; keep the marketing site for narrative/SEO.** Build-time sync is revisited only if marketing needs pricing inside its own layout — a redirect is one change, a sync is a pipeline to maintain.

## Risks

- SEO loss for pricing queries → 301 keeps link equity.
- Visual mismatch between sites → shared design tokens.
- Feature claims elsewhere still drift → quarterly claims audit against capability flags (SKAI-1020).

## What it unblocks

D1 price changes ship from one place; sales claims stay aligned with capability exclusions.

## Follow-up tickets

1. D7-01 Replace marketing pricing section with CTA and 301 to the app's `/pricing`.
2. D7-02 Remove plan data from marketing `lib/data.ts`.
3. D7-03 Claims audit of marketing copy against capability flags.
