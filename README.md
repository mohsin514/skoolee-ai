# SkooleeAI — AI-Powered School Management

Multi-tenant SaaS: marks entry, AI report cards (Urdu/English), WhatsApp delivery.

## Setup

```bash
npm install
cp .env.local.example .env   # fill in values
npx prisma migrate dev --name init
npx prisma generate
npm run dev
```

## Email Delivery

Email now uses SMTP instead of Resend, so Gmail plus-addresses like `mohsin.ali14993+test@gmail.com` are sent as normal recipients.

For Gmail SMTP, add these values to `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mohsin.ali14993@gmail.com
SMTP_PASS=your_google_app_password
SMTP_FROM_EMAIL=mohsin.ali14993@gmail.com
SMTP_FROM_NAME="Skoolee AI"
```

Use a Google app password for `SMTP_PASS`; the normal Gmail password will not work.

## Workers (separate terminal)

```bash
npx tsx src/workers/pdf-worker.ts &
npx tsx src/workers/remark-worker.ts &
npx tsx src/workers/notification-worker.ts &
```

## Architecture

- **Multi-tenant**: Each school = separate PostgreSQL schema (`school_{slug}`).
- **Auth**: Clerk middleware handles authentication and redirects to onboarding if needed.
- **Tenant Resolution**: Middleware extracts the school slug and passes it via headers.
- **AI**: OpenAI GPT-4o-mini for Urdu/English remarks, credit-metered per school.
- **Payments**: Stripe subscriptions (Free/Basic/Pro) integrated with credit limits.
- **Queue**: BullMQ for bulk PDFs, batch AI remarks, WhatsApp notifications.

## Key Features

- **Marks Entry**: Fast tabbing interface with debounced AI remark generation.
- **Bilingual Support**: AI generates remarks in both English and Urdu.
- **WhatsApp Integration**: Send PDF report cards directly to parents.
- **Automated Grading**: Auto-calculation of grades and percentages.
- **Scalable Multi-tenancy**: Schema-per-tenant isolation for high security and performance.

## License

Private — All rights reserved.
