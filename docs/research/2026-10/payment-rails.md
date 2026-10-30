# GCC payment rails spike (SKAI-1107)

Date: 2026-10-29. Status: spike. Provider facts below are from desk research and must be confirmed with each provider's sales and compliance team before a contract; none were tested against a sandbox.

## Existing abstraction

| Piece | File | Notes |
|---|---|---|
| Rail readiness (Stripe, SafePay, bank transfer) | `src/lib/payments/configuration.ts`, `gateway.ts` | Syntactic env/settings checks only |
| SafePay client | `src/lib/payments/safepay.ts` | Direct functions, no interface; PKR only |
| Fee online-payment gate | `src/lib/fees/online-payment.ts` | `ONLINE_PAYMENT_CURRENCIES = ["PKR"]`, SafePay env names hardcoded |
| Routes | `src/app/api/safepay/*`, `src/app/api/fees/pay-online`, `src/app/api/onboarding/package` | Call SafePay directly |
| Dev test checkout | `src/lib/payments/test-checkout.ts` | `ALLOW_TEST_CHECKOUT`, never on the live host |

Gap: there was no provider interface. Every route that takes money knows it is SafePay, and the currency list is PKR only, so a GCC school (AED, SAR, KWD...) cannot pay online.

## Added in this PR

`src/lib/payments/provider.ts`:

- `PaymentProvider` interface: `id`, `currencies`, `requiredEnv`, `createCheckout`, `verifyWebhook`.
- `safePayProvider()` wraps the existing SafePay client (behaviour unchanged; callers not yet migrated).
- `gccSkeletonProvider(id)` for the six GCC rails: declares currencies and env names, returns `NOT_IMPLEMENTED`, and rejects every webhook.
- `resolvePaymentProvider(currency, env)`: PKR resolves to SafePay; anything else resolves only with `PAYMENT_GCC_RAILS_ENABLED=true`, outside production, to the provider named in `PAYMENT_GCC_PROVIDER`.
- `currencyExponent()`: KWD, BHD and OMR use 3 decimal places. Today's code assumes 2.

No live or sandbox keys, no network calls from skeletons, and no route wiring.

## Provider comparison

| Provider | Markets (licensed / strongest) | Currencies (indicative) | Local methods | Hosted checkout | Webhook signing | Fit for school fees |
|---|---|---|---|---|---|---|
| Stripe (UAE entity) | UAE; KSA via partners | AED, USD, many | Cards, Apple Pay, Google Pay | Checkout Sessions | HMAC signature header | Strong DX; we already have Stripe Connect code; KSA mada coverage to confirm |
| Checkout.com | UAE, KSA, Kuwait, Bahrain, Qatar, Oman | GCC + global | mada, KNET, Benefit, Apple Pay | Hosted Payments Page | HMAC signature header | Strongest multi-GCC coverage; enterprise onboarding and minimums |
| Telr | UAE, KSA and wider GCC | GCC currencies | Cards, mada, Apple Pay, STC Pay | Hosted payment page | Callback check with store auth key | SME-friendly, quick onboarding |
| PayTabs | KSA first; UAE, Egypt, Jordan, Oman | SAR, AED, EGP, others | mada, STC Pay, Apple Pay, SADAD | Hosted payment page | Signature header (server key) | Good KSA fit; SADAD useful for bill-style fees |
| Network International (N-Genius) | UAE first; wider Middle East and Africa | AED, USD, others | Cards, Apple Pay | Hosted payment page | Webhook with configured header | Bank-grade acquirer; slower onboarding |
| Tap Payments | Kuwait, KSA, UAE, Bahrain, Qatar, Oman | GCC currencies | KNET, mada, Benefit, Apple Pay, STC Pay | Hosted checkout / Charges API | `hashstring` header | Strong Kuwait and Bahrain local methods |

### Requirements every adapter must meet

1. Hosted checkout only: card data never touches our servers (keeps PCI scope at SAQ A).
2. Signed webhook verified on the raw body with a timing-safe compare, then the order re-read from the provider before marking an invoice paid.
3. Amounts in minor units with the currency's own exponent (3 for KWD, BHD, OMR).
4. Per-school merchant credentials, or platform-held keys with sub-merchant routing; decide before the first GCC pilot.
5. Refund and partial-payment support mapped to the existing fee ledger.
6. Arabic checkout page and RTL return pages.

## Recommendation

- First GCC pilot (Dubai, Riyadh): **Checkout.com** if the volume clears its minimums, otherwise **Telr** or **PayTabs** for faster SME onboarding. Keep **Tap** for a Kuwait or Bahrain school (KNET, Benefit).
- Migrate the SafePay routes to `resolvePaymentProvider()` in a follow-up, then implement one GCC adapter with sandbox keys held in the deployment's env only.
- Extend `ONLINE_PAYMENT_CURRENCIES` from the resolver instead of a hardcoded PKR list.

## Open questions

- Who is merchant of record: the school or Skoolee? This decides KYC, settlement and refund ownership.
- VAT invoices (UAE 5%, KSA 15%) on platform fees versus school fees.
- Whether wallets (STC Pay) and bill payment (SADAD) are needed in the first pilot.
