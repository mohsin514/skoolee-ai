# AI provider policy and release review

## Destination policy

`AI_PROVIDER` selects one provider. `auto` uses `AI_PROVIDER_ORDER` exactly as configured; an unknown name, duplicate, empty order, or unapproved public provider stops generation. Pollinations is public and is blocked unless `AI_ALLOW_PUBLIC_PROVIDER=true` is explicitly set. Do not approve it for child or school data without a reviewed processing agreement and policy decision.

Ollama is accepted over HTTP only at loopback (`localhost`, `127.0.0.1`, or `::1`). Remote Ollama requires HTTPS and an exact host entry in `AI_APPROVED_OLLAMA_HOSTS`. A provider name or URL alone does not establish where inference runs. Outbound requests time out after `AI_TIMEOUT_MS` (1–120 seconds, default 20 seconds); failures do not trigger a different provider unless that provider is explicitly in the validated order.

## Privacy and degraded behavior

The gateway scans the full system and user messages immediately before dispatch. Email, Pakistani and broad international phone patterns, CNIC and long numeric identifiers are blocked for every provider, including Ollama. Add school reviewed cases when formats or languages change. Keep attachment extraction behind the same boundary; never pass raw files directly to a provider. Errors returned to school users are neutral, and provider response bodies are discarded. Operational records retain model, prompt version, policy version, source version, feature and usage metadata; do not store raw prompt text or secrets in logs.

Provider outage, policy denial, or exhausted credits must leave manual authoring and saved drafts available. Retry only on an explicit user action; automatic retries can duplicate cost or send data to a second destination.

## Evaluation and promotion

Run the synthetic cases in `src/lib/ai/evaluation.ts` against a fake provider in CI. The deterministic helper checks privacy denials and high-risk expected outcomes without contacting a model. For each proposed model or prompt version, an educator reviews generated questions, answer keys, remarks and English, Arabic and Urdu translations. Record dataset version, reviewer, model, prompt, source and policy versions, pass counts, privacy denials and latency. Promotion requires 100% pass on privacy and tenant-isolation cases, 100% reviewed answer-key correctness, and at least 95% educator acceptance on other quality cases. Any privacy leak, cross-school result, or wrong answer key blocks release regardless of aggregate score. These thresholds are a starting operational policy and require school owner approval before production use.

The seed matrix is synthetic and is not a safety certification. Prompt injection is treated as untrusted content; tenant isolation must come from authorized server context and query scopes, never from model instructions. Publication and other consequential approval remain in the authoritative review service.
