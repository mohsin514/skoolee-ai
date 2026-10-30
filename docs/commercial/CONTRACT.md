# Commercial contract

Catalog version `2026-10-08.1` is the approved source for plan prices, limits, and AI-credit reset wording. Application comparisons and enforcement use [`src/config/plans.ts`](../../src/config/plans.ts); `src/config/commercial-contract.ts` checks the release contract and snapshots each school's agreed terms.

| Plan | Monthly price | Students | Teachers | Campuses | AI credits per calendar month |
| --- | ---: | ---: | ---: | ---: | ---: |
| Basic | PKR 0 | 50 | 2 | 1 | 100 |
| Pro | PKR 4,000 | 500 | 10 | 1 | 1,000 |
| Enterprise | PKR 7,000 | 2,500 | 50 | 5 | 5,000 |
| Custom | Quoted | Unlimited | Unlimited | Unlimited | 50,000 |

Annual checkout is 12 monthly amounts less the published 20% discount. A configured Stripe price must match the exact PKR amount, currency, and monthly or annual interval before the app opens checkout. Missing or mismatched annual configuration is not replaced with a monthly Stripe price.

AI credits reset to zero used at the calendar-month boundary. The plan allowance remains the monthly limit, unused credits expire at reset, and they do not roll over. The cron reset marker makes one reset run per calendar month.

New registration asks for the institution country. The default currency is PKR in Pakistan, SAR in Saudi Arabia, AED in the UAE, KWD in Kuwait, and USD elsewhere. That value is a regional display preference; it does not convert the catalogue's PKR prices. Invoices, ledgers, and prior amounts keep their recorded currency.

## Claims and evidence

No customer quote, measured saving, market-size figure, or competitor comparison is approved in this repository. Public dashboard figures are synthetic examples and carry an explicit label. A future claim needs a source, owner, review date, and permission to publish. A feature described as generally available must exist in the application and pass the same plan gate described by the catalogue.

## Existing customer terms

The migration records each current school's approved plan name, limits, feature gates, AI allowance, price and currency in `commercial_contract`. A catalogue edit affects new plan selections. It does not silently update the saved school contract. An authorized plan change or verified payment captures a new version and effective date. The billing screen describes proposed catalogue rates without claiming that they take effect automatically.

Run `pnpm check:commercial` before release. The check fails if catalog copy disagrees with enforced limits, if credit rollover is promised while the reset expires credits, or if the published currency changes without a contract update.
