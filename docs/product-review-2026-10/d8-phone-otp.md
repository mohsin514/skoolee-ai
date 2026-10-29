# SKAI-908 — D8 phone OTP channel recommendation

Research cut-off: 29 October 2026. Owner/decider: Mohsin Ali. **For founder approval; final confirmation from V5 (cost) and V6 (activation) data.**

## Options considered

| Option | Description |
| --- | --- |
| SMS | Twilio or a local aggregator. |
| WhatsApp authentication template | Copy-code (all devices) or one-tap/zero-tap (Android apps only) from a Skoolee-owned authentication number. |
| WhatsApp first, SMS fallback | Send WhatsApp; send SMS if not delivered within 30 seconds or the number is not on WhatsApp. |

## Evidence, interpretation and limits

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| [Twilio SMS pricing, Pakistan](https://www.twilio.com/en-us/sms/pricing/pk) (viewed 29 Oct 2026): ~USD 0.47 per outbound segment; [Twilio Saudi](https://www.twilio.com/en-us/sms/pricing/sa): ~USD 0.14–0.19 (pages conflict). | International SMS to Pakistan costs far more than WhatsApp auth. | Local PK aggregators are cheaper but need NOC/sender registration; UAE rate not found. |
| [YCloud, April 2026](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-april-1-2026): Pakistan authentication ~USD 0.01; [Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing): charged only on delivery. | WhatsApp auth is cheapest and billed only when delivered. | Confirm on Meta's rate card. |
| [Twilio Saudi guidelines](https://www.twilio.com/en-us/guidelines/sa/sms) (viewed 29 Oct 2026): alphanumeric sender pre-registration with NOC documents; numeric senders blocked. | KSA SMS fallback has registration lead time. | — |
| [Telesign on WhatsApp auth templates](https://telesign.com/blog/enhancing-security-and-user-experience-with-whatsapp-authentication-templates) (viewed 29 Oct 2026): one-tap/zero-tap Android only; copy-code everywhere. | A web app should use copy-code. | Vendor speed/conversion claims unverified. |

## Recommendation

**WhatsApp authentication template (copy-code) as primary OTP channel in PK, KSA and UAE, with SMS fallback after 30 seconds or when the number is not on WhatsApp.** Start KSA alphanumeric sender registration now for the fallback. Confirm with V5/V6 data from the first 200 pilot OTPs per market; switch that market's primary to SMS if WhatsApp delivered-within-30s is under 90%.

## Risks

- Meta outage or account restriction blocks sign-in → SMS fallback; email OTP for staff.
- The OTP number is Skoolee-owned, an explicit exception to D3 — authentication is a platform function.
- SIM-swap and phishing → rate limits, code expiry ≤5 minutes, never put OTPs or phone numbers in URLs.

## What it unblocks

Guardian phone sign-in, admin MFA by phone, V5/V6 measurement.

## Follow-up tickets

1. D8-01 Skoolee-owned authentication WABA and copy-code template in EN/UR/AR.
2. D8-02 OTP service with WhatsApp→SMS fallback, per-market configuration and delivery metrics.
3. D8-03 KSA alphanumeric sender registration; Pakistan local aggregator evaluation.
4. D8-04 V5/V6 report: cost per verified sign-in, delivered-within-30s, completion rate.
