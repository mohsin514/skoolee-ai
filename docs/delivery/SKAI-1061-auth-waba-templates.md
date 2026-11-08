# SKAI-1061 [D8-01]: Skoolee-owned authentication WABA and copy-code templates

- Definitions: `src/lib/auth/otp/templates.ts`. Template `skoolee_signin_code` in `en`, `ur` and `ar`, category AUTHENTICATION, with the security recommendation on, a 5-minute expiry footer, and a COPY_CODE button. One-tap and zero-tap are not used: they need an Android app ([d8-phone-otp.md](../product-review-2026-10/d8-phone-otp.md)).
- Sender adapters: `src/lib/auth/otp/senders.ts` (Meta Cloud API, Twilio-compatible SMS, in-memory mock). Each is behind an env flag and off by default.

## Setup (human: founder/ops)

1. In Meta Business Manager, create a **separate** WhatsApp Business Account owned by Skoolee. Add a dedicated phone number for authentication (this is the D3 exception) and complete business verification.
2. Create a system-user token with `whatsapp_business_messaging` and `whatsapp_business_management`.
3. Dry-run the templates: `npx tsx scripts/otp/submit-auth-templates.ts`
4. Submit them: `OTP_WABA_ID=… OTP_WHATSAPP_ACCESS_TOKEN=… npx tsx scripts/otp/submit-auth-templates.ts --submit`
5. When all three languages show APPROVED in WhatsApp Manager, subscribe the app webhook (`messages` field) to `/api/auth/otp/whatsapp-status`. Set the env vars below and `OTP_WHATSAPP_PROVIDER=meta`.

## Environment

| Variable | Purpose |
| --- | --- |
| `OTP_WHATSAPP_PROVIDER` | `meta`, `mock` or `disabled` (the default) |
| `OTP_WHATSAPP_PHONE_NUMBER_ID`, `OTP_WHATSAPP_ACCESS_TOKEN` | Skoolee auth number and token. These are not the school `WHATSAPP_*` values. |
| `OTP_WHATSAPP_APP_SECRET` | Verifies delivery-status webhooks |
| `OTP_WABA_ID` | Template submission only |
| `OTP_WHATSAPP_TEMPLATE_NAME`, `OTP_WHATSAPP_API_URL` | Optional overrides |
| `OTP_SMS_PROVIDER` | `twilio`, `mock` or `disabled` (the default) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `OTP_SMS_API_BASE` | Twilio, or a Twilio-compatible aggregator |
| `OTP_SMS_FROM_PK`, `OTP_SMS_FROM_SA`, `OTP_SMS_FROM_AE` | Sender per market (alphanumeric ID, number, or `MG…` messaging service) |
| `OTP_PRIMARY_CHANNEL_<PK\|SA\|AE>` | `sms` switches that market's primary channel (D8's under-90%-delivered-within-30-s rule) |
| `OTP_MOCK_NOT_ON_WHATSAPP` | Mock only: comma-separated E.164 numbers to treat as not on WhatsApp |
| `OTP_ALLOW_MOCK_IN_PRODUCTION` | `true` only on QA/staging builds that run with `NODE_ENV=production` |
| `DISABLE_OUTBOUND_MESSAGES=true` | Global kill switch, honoured by every OTP sender |
