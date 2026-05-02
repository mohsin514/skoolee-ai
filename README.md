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

## AI Provider

The AI routes use a provider switchboard in `src/lib/ai/openai.ts`.

By default, the app tries free providers first:

```bash
AI_PROVIDER=auto
AI_PROVIDER_ORDER=pollinations,ollama
POLLINATIONS_MODEL=openai
OLLAMA_MODEL=llama3.2
```

For production reliability, add a Pollinations key:

```bash
POLLINATIONS_API_KEY=your_free_or_paid_pollinations_key
POLLINATIONS_API_URL=https://gen.pollinations.ai/v1/chat/completions
```

Without a key, the app also tries Pollinations' public text fallback for quick demos. To use your own provider instead:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini

# or local Ollama
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

AI prompts include the school-scoped context needed for the requested draft. Use `AI_PROVIDER=ollama` for local processing when prompts should stay on your own machine.

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
- **AI**: Provider-backed drafts for Urdu/English remarks and school insights, credit-metered per school.
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
