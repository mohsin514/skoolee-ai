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

For Hostinger mailbox SMTP (`mohsin@skooleeai.com`), add these values to `.env`:

```bash
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mohsin@skooleeai.com
SMTP_PASS=your_mailbox_password
SMTP_FROM_EMAIL=mohsin@skooleeai.com
SMTP_FROM_NAME="Skoolee AI"
```

`SMTP_PASS` is the password of the `mohsin@skooleeai.com` mailbox in hPanel. Confirm the host and port in hPanel → Emails → the mailbox's settings before relying on them.

## AI Provider

The AI routes use a provider switchboard in `src/lib/ai/openai.ts`.

The app defaults to the configured OpenAI provider. Keep credentials in the server environment:

```bash
AI_PROVIDER=auto
AI_PROVIDER_ORDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

An explicitly approved Pollinations deployment requires both its credentials and the public-provider policy flag:

```bash
AI_PROVIDER=pollinations
AI_ALLOW_PUBLIC_PROVIDER=true
POLLINATIONS_API_KEY=your_free_or_paid_pollinations_key
POLLINATIONS_API_URL=https://gen.pollinations.ai/v1/chat/completions
```

The app does not silently fall back to a public provider. To select OpenAI or a local Ollama instance:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY="sk-your-openai-api-key"
OPENAI_MODEL=gpt-4o-mini

# or local Ollama
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

AI prompts include the school-scoped context needed for the requested draft. Use `AI_PROVIDER=ollama` for local processing when prompts should stay on your own machine.

The School AI workspace and dashboard AI panels also offer an explicit **sample-data preview**. These fictional examples work without a provider, do not spend credits, and do not save or publish school records. Live requests remain separate and preserve useful retry/manual options when a provider fails.

Text drafting, document reading and voice transcription have separate readiness checks. An API key alone does not enable binary document or audio processing. See `.env.school-ai.example` for the media policy and model settings. UTF-8 text upload and manual source entry work without media AI. A configured provider label indicates configuration, not a completed health check.

Run `npm run test:school-ai` for the provider-free unit suite. Database and browser acceptance use the isolated fixtures under `tests/school-ai`; they require their explicitly configured local test database and app server.

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
