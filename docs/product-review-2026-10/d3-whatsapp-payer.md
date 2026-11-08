# SKAI-903 — D3 WhatsApp payer recommendation

Research cut-off: 29 October 2026. Owner/decider: Mohsin Ali. **For founder approval; not yet recorded in the PRD decision log.**

## Options considered

| Option | Description |
| --- | --- |
| A — school-owned | Each school connects its own WhatsApp Business Account (WABA) through Embedded Signup; Meta bills the school directly. |
| B — metered pass-through | Skoolee owns one WABA/number, sends for all tenants and re-bills messages per school. |

## Evidence, interpretation and limits

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| [Meta WhatsApp pricing docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) (viewed 29 Oct 2026): per-delivered-template-message billing since 1 July 2025; rate changes 1 April 2026; AED added as billing currency April 2026. | Costs are per message, per category, per recipient country — easy to attribute to one school. | Exact current PK/SA/AE rates; read Meta's rate card before budgeting. |
| [YCloud, April 2026 update](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-april-1-2026) (viewed 29 Oct 2026): Pakistan utility/authentication ~USD 0.0054 → ~0.01; Saudi marketing ~USD 0.0455 → ~0.0501. | Rates rise on Meta's schedule; if Skoolee carries them, exposure is open-ended. | Third-party BSP reporting. |
| [WeTarseel](https://wetarseel.ai/whatsapp-api-pricing-all-you-need-to-know-in-2025/) (viewed 29 Oct 2026): service replies inside the 24-hour window are free. | Parent replies cost little; cost sits in outbound templates (fee reminders, results). | BSP blog, not Meta. |

Interpretation: a shared Skoolee number mixes tenants' reputation (one school's spam reports throttle every school), puts Meta billing risk on Skoolee, and shows parents "Skoolee" instead of their school — weak trust for fee messages. School-owned keeps each school's name, quality rating and bill separate, matching the tenant-isolation model.

## Recommendation

**School-owned WABA by default (A).** Offer B only as an optional "Skoolee-managed sending" add-on for schools that cannot complete Meta verification: one number per tenant, billed at Meta rate plus a fixed margin, with a prepaid monthly cap.

## Risks

- Meta business verification is hard for small schools → onboarding checklist and assisted setup; B as fallback.
- Per-school template approval creates support load → ship a pre-approved template library.
- Managed sending could spread one tenant's quality rating → separate numbers per tenant even under B.

## What it unblocks

WhatsApp messaging delivery tickets; D8 (the OTP number is a separate platform-owned exception); D1 (messaging is excluded from tier price).

## Follow-up tickets

1. D3-01 Embedded Signup flow storing per-school WABA ID and token (tenant-scoped, encrypted).
2. D3-02 Template library in EN/UR/AR (fee reminder, attendance, results), submitted per school.
3. D3-03 Managed-sending add-on: per-tenant number, prepaid cap, usage ledger.
4. D3-04 Record decision in the PRD decision log.
