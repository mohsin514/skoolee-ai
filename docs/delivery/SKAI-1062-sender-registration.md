# SKAI-1062 [D8-03]: SMS sender registration (KSA) and Pakistan aggregator comparison

Retrieved 29 October 2026. This feeds the SMS fallback in the phone OTP service (SKAI-1061/SKAI-954). Decision: [d8-phone-otp.md](../product-review-2026-10/d8-phone-otp.md). Anything marked **unverified** must be confirmed with the provider before it is used for budgeting or go-live.

## 1. Saudi Arabia: alphanumeric sender registration

What the sources say:

| Fact | Source |
| --- | --- |
| A registered alphanumeric sender ID is required. Numeric senders (long or short codes) are not supported, and networks block them. | [Twilio SA SMS guidelines](https://www.twilio.com/en-us/guidelines/sa/sms) |
| Registration is international pre-registration through the Twilio Console. Provisioning takes about 2 weeks. | same |
| If the sender name is not the company's name, you need documents showing you may use the brand. Twilio cannot register senders for Saudi domestic brands, because resale of domestic traffic is restricted. | same |
| No URLs that are not allow-listed, no short links, no WhatsApp links or phone numbers in the body, and no identical repeat messages. Promotional senders must end in `-AD`, and OTP traffic must not use one. | same |

Steps (owner: founder/ops; engineering only sets env vars):

1. Pick the sender name: `Skoolee` (≤11 characters, matches the company name, so no brand letter is needed).
2. Twilio Console → Messaging → Regulatory Compliance → Alphanumeric Sender ID registration → Saudi Arabia. Choose transactional/OTP, upload the company registration and a sample message (use the EN and AR text from `smsBody` in `src/lib/auth/otp/copy.ts`, which contains no URL).
3. Wait about 2 weeks. When it is approved, set `OTP_SMS_FROM_SA=Skoolee`. Until then the SA fallback has no sender, and the service records `twilio:no-sender` (WhatsApp-only in SA).
4. Send 10 test sign-ins on STC, Mobily and Zain. Check `otp_deliveries` for `delivered` within 30 s.
5. Also register for the UAE (`OTP_SMS_FROM_AE`). Its rules were not researched here (**unverified**).

## 2. Pakistan: local aggregator versus Twilio

| Option | Price per SMS | Sender / registration | Notes |
| --- | --- | --- | --- |
| Twilio (international route) | ~USD 0.47 per segment ([Twilio PK pricing](https://www.twilio.com/en-us/sms/pricing/pk)) | Sender rules: [Twilio PK guidelines](https://www.twilio.com/en-us/guidelines/pk/sms). Peer-to-peer traffic through local operators is prohibited. | Works today with no paperwork. It is the most expensive option: about 47× the WhatsApp auth estimate. |
| Plivo | USD 0.08 per segment, per a third-party summary ([sent.dm](https://www.sent.dm/resources/pakistan-sms-pricing)) **unverified** | Unknown | Get the official rate card. |
| Local aggregator via operators (Jazz, Telenor, Ufone, Zong) | Not published. A 2013 Zong bulk rate of PKR 0.10 ([ProPakistani](https://propakistani.pk/2013/01/29/zong-revamps-its-corporate-bulk-sms-service/)) is outdated. **unverified** | Branded (masked) sender needs per-operator documents plus NOC letters ([8x8 guide](https://support.cpaas.8x8.com/hc/en-us/articles/37807041050521-Step-by-Step-Guide-to-Register-Your-Alpha-Alpha-Numeric-Numeric-Sender-ID-in-Pakistan)). The letter of authorization needs the sender name, traffic type, and the signatory's CNIC and company NTN ([Infobip LOA](https://www.infobip.com/docs/essentials/mena-registration/pakistan-letter-of-authorization-loa-guidelines.md)). | Expected to be the cheapest. Needs a Twilio-compatible API, or a new adapter. |

Regulatory context: PTA has directed operators to block unapproved sender IDs and non-approved content, and to enforce the Do Not Call Register ([ProPakistani, 2021](https://propakistani.pk/2021/11/08/pta-orders-telcos-to-implement-dncr-in-letter-spirit/amp/)). OTPs are transactional and requested by the user, but the sender still has to be approved. We could not find the current text of the aggregator licence conditions (**unverified**; confirm with PTA or counsel).

Recommendation: launch the PK fallback on Twilio (`OTP_SMS_FROM_PK` set to a Twilio Messaging Service SID `MG…`) for the first 200 pilot OTPs, while getting written rate cards from at least two PTA-compliant aggregators. If an aggregator exposes a Twilio-compatible `Messages.json` API, point `OTP_SMS_API_BASE` at it. Otherwise add an adapter in `src/lib/auth/otp/senders.ts`. Switch when the V5 report (`scripts/otp/metrics-report.ts`) shows cost per verified sign-in.

## Human-only actions

- Twilio KSA sender registration (company documents, about 2 weeks).
- Aggregator quotes and the PTA/NOC paperwork (CNIC/NTN signatory).
- UAE sender rules research and registration.
