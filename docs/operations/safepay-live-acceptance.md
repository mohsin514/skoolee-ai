# Safepay live acceptance runbook (SKAI-990, INT-PAY-PK-01)

Status: **waiting on a human owner.** The code paths exist on `dev`. Live acceptance needs a Safepay merchant account in the target environment, which an agent cannot create or use.

## What already exists in code

| Area | File |
| --- | --- |
| Order creation and signing (HMAC-SHA256) | `src/lib/payments/safepay.ts` |
| Webhook: signature checked over the raw body, 64 KB cap, zod validation, replay-safe via `claimProviderEvent` | `src/app/api/safepay/notification/route.ts` |
| Sandbox simulator (not for production) | `src/app/api/safepay/simulate/route.ts` |
| Tests | `tests/payments/safepay-webhook.test.ts`, `tests/payments/safepay-simulate-plan.test.ts` |

Webhook events handled: `order.completed` (amount checked against the saved intent), `order.cancelled` and `order.failed` (intent marked `CANCELLED` / `FAILED`).

**Known gap:** there is no refund event handling in the Safepay webhook. A refund made in the Safepay dashboard is not reflected in Skoolee automatically. Until a follow-up ticket adds it, record refunds by hand and reconcile them (step 6).

## Environment variables (set by the owner, never committed)

`SAFEPAY_MERCHANT_ID`, `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`, `SAFEPAY_PRODUCTION` (`true` only in the live environment), `SAFEPAY_COUNTRIES`.

## Human steps

1. Owner obtains Safepay live (or production-equivalent) merchant credentials and stores them in the target environment's secret store.
2. Register the webhook URL `https://<env-host>/api/safepay/notification` in the Safepay dashboard.
3. **Success:** with a synthetic QA school (QA-01), pay the smallest real amount. Expect the intent `COMPLETED`, a payment row, and the plan active.
4. **Failure:** use a declined card or cancel at the gateway. Expect `FAILED` or `CANCELLED`, and no plan change.
5. **Delayed / duplicate callback:** ask Safepay to resend the notification (or replay it from the dashboard) after some minutes. Expect `200` or `202` with no second payment row.
6. **Refund:** refund the success payment in the Safepay dashboard. Record it in Skoolee by hand (see Known gap) and confirm the daily totals match.
7. **Reconciliation:** export the Safepay settlement report for the test day and compare each order ref and amount with Skoolee payments for that school. Any difference is a defect.
8. Attach evidence to the parent ticket with the QA comment template: environment, commit, role, locale, screenshots, server outcome. Blur any card or account details.

## Denied paths to spot-check

- A notification with a bad signature returns `400 Invalid signature`.
- A notification with an amount that differs from the saved intent returns `400 Amount mismatch`.
- The simulator route must not be reachable in production.
