# School AI go-live checklist

This checklist separates implemented code from integrations and acceptance work that need your deployment, providers or school. The selected exam target is a standard web browser; it does not block switching tabs/apps or screenshots.

## Current status

- School AI workflows in the implementation ledger are implemented and passed the local pure, database, browser, locale, shared UI, type and build checks listed in [IMPLEMENTATION.md](IMPLEMENTATION.md#verification).
- The reported database is repaired: a repeated `prisma migrate deploy` found no pending migrations, and Prisma reported no schema difference. Do not reset this database.
- Feature activation still depends on the configuration below. Without an AI key, the reviewed/manual paths remain available, but model-backed generation will not run. Without private storage, file intake and recording capabilities are unavailable. Without the background worker, queued work will not finish on its own.
- Important school changes remain reviewable and permission-bound. An AI proposal does not autonomously publish marks, spend/post money, send a message or change records. Scheduled runs can execute only previously reviewed, exact steps under their saved policy.

## Configure the application first

Use the existing deployment secret manager and `.env.production.example` for the application's base settings. At minimum, verify the target deployment has:

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Runtime database connection; use the intended production pooler URL |
| `DIRECT_URL` | Prisma migrations and direct database operations |
| `AUTH_SECRET` | Session/token signing and MFA secret encryption; preserve the existing production value across deployments |
| `NEXT_PUBLIC_APP_URL` | Correct production links in invitations, verification and notifications; set to the canonical HTTPS URL |
| `REDIS_URL` | Durable queue transport used by the outbox/worker |

Use TLS database URLs and production secrets. Never copy the browser test credentials in the rollout guide into production.

Before exposing real student data, confirm which database role the application uses and how tenant RLS policies are enforced. The application performs tenant/campus/permission checks, but the broader production RLS/non-owner service-role setup is still a deployment acceptance item. The migration-recovery database role had `BYPASSRLS`; that fact does not certify a production RLS configuration.

## Turn on model features

Start with text generation. Keep model traffic on the approved provider and choose a model available to your account that the school has evaluated for its supported subjects and languages.

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=<server-side secret>
OPENAI_MODEL=<evaluated model available to the account>
```

The text adapter has a code fallback, but setting the intended model explicitly makes the deployment reviewable. Keep the key on the server; do not use a `NEXT_PUBLIC_` variable.

Document extraction and speech transcription are separate media capabilities. The adapter leaves them off unless all three settings below are provided. Approve the privacy/data-processing policy for uploaded school documents and raw audio before enabling egress.

```dotenv
SCHOOL_AI_MEDIA_EGRESS_APPROVED=true
SCHOOL_AI_DOCUMENT_MODEL=<evaluated document-capable model>
SCHOOL_AI_TRANSCRIPTION_MODEL=<evaluated transcription-capable model>
```

You can enable only document extraction or only transcription by setting its model and leaving the other model empty. With media egress disabled, staff can still review and enter text manually. Generated output remains unreviewed until a human checks it.

## Configure private files and the worker

Choose one private storage option for uploaded sources and optional exam recordings:

- **S3-compatible storage:** `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_REGION`; `S3_ENDPOINT` is optional for compatible services. Block public access, scope the credentials to this application, and verify read/write/delete, retention and backup restore.
- **Private filesystem:** set `SCHOOL_AI_STORAGE_DIR` to an absolute, durable, private path. Use this only where the application and worker share persistent storage. Do not use `public/` or an ephemeral/serverless filesystem.

Run the long-lived worker alongside the web application:

```sh
npm run worker:outbox
```

The worker requires the same production database, `REDIS_URL`, and storage configuration. It dispatches communications and processes scheduled reviewed runs, document extraction/deletion, exam expiry and recording retention. A web route or serverless function does not replace this worker. Configure health monitoring, restart-on-failure, logs and alerts for queue/storage errors.

## Enable communication channels separately

Keep delivery disabled while validating previews and recipient consent. In production, set `EMAIL_DEV_MODE=false`; leave `DISABLE_OUTBOUND_MESSAGES=true` until you explicitly authorize real sends.

- **Email:** configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` and `SMTP_FROM_NAME` in the existing email setup.
- **SMS:** configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` for an approved Twilio account.
- **WhatsApp:** configure `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION` and `WHATSAPP_ANNOUNCEMENT_TEMPLATES_JSON`. Each configured template must be an approved static BODY template. Verify the account's approved templates and language codes before use.

If enabling the existing inbound WhatsApp webhook too, also configure its `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` and register/verify the HTTPS callback with Meta. Outbound announcements do not by themselves set up webhook verification.

Only enable channels you have tested with authorized recipients. The application additionally requires verified guardian contacts and current consent/preferences. Test opt-outs, revoked access, provider errors and delivery receipts. A provider accepting a message does not prove delivery or that it was read.

## Optional online payments

The School AI finance workflow can prepare reviewed invoices and account for payments/credits/refunds; payment collection still uses the application's existing gateway configuration. If you want families to pay online, configure one supported gateway and its webhook before enabling that payment path:

- **SafePay:** `SAFEPAY_MERCHANT_ID`, `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY` and `SAFEPAY_PRODUCTION`.
- **Stripe:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` and the existing plan/product settings needed by the selected checkout flow. Configure `STRIPE_CONNECT_WEBHOOK_SECRET` if Connect webhooks are used.

Keep sandbox/test mode on through checkout, duplicate-webhook and reconciliation checks. The School AI implementation tests did not create live payments.

## Validate the school workflow before launch

1. Apply versioned migrations to the intended environment with `npx prisma migrate deploy`, then generate the Prisma client and deploy the matching web app and worker versions. Never use `db push` or a reset as a migration substitute. This step is still needed in any other environment; the reported database has already been completed.
2. In a staging school, complete the first-school setup with realistic but authorized records. Review subject/teacher assignments, calendar closures, guardian contacts, financial opening/carry-forward balances and roster duplicate decisions before applying them.
3. Test one approved curriculum, a paper in each supported language, OCR correction, question review, printed candidate copy, an assigned exam, a submitted attempt, human marking, and controlled result publication. Use representative school material with permission; record model versions and human corrections.
4. Verify private upload, download, expiration/deletion, backup/restore and access revocation. Test camera/screen consent and retention in the actual supported browsers. Refusing camera/screen access must leave the standard exam usable.
5. Send one explicitly approved test email/SMS/WhatsApp message per enabled provider to authorized recipients. Confirm opt-out and that revoked access prevents later queued sends.
6. Confirm the worker resumes after restart, drains a queued job, expires a test exam, deletes expired test media and reports failures without losing retry/review state.
7. Test the supported browser, phone, printer, keyboard, zoom and assistive technology matrix. Measure setup time, correction effort and teacher review effort in a real school pilot before claiming time savings or educational accuracy.

The calibration tooling is ready, but its included synthetic sample intentionally returns `BLOCKED`. It cannot certify educational quality. The deployment acceptance gates and bounded browser coverage are tracked in [ROLLOUT.md](ROLLOUT.md#deployment-acceptance-still-requiring-external-evidence).
