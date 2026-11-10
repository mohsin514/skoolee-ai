# Provider alerts and recovery runbook — SKAI-866

Scope: quota, credential and rate-limit alerts for external providers, with a named responder role and a
resolution procedure for each alert. This runbook builds on the existing durable outbox
(`docs/operations/durable-workflows.md`); it does not add a second queue or any automatic replay.

## Responders

| Role | Owns | Escalates to |
| --- | --- | --- |
| **Primary on-call platform operator** (APP_OWNER rota) | Every alert below; first response within 30 minutes in school hours | Engineering lead |
| **Provider account owner** (billing contact for the provider account) | Quota top-up, balance, plan limits, key rotation | Founder |
| **School communications lead** (per school) | School-facing explanation and choosing a manual alternative | Primary on-call |

The names behind each role are kept in the private on-call roster, not in this repository. Until a person
is named in that roster for every role, the alerts below are not considered live (see "Open human actions").

## Signals

The AI gateway (`src/lib/ai/openai.ts`, `classifyProviderFailure`) writes one structured, secret-free
stderr line per actionable provider failure:

```json
{"component":"ai-provider","reason":"QUOTA_EXHAUSTED","provider":"openai"}
```

The line never contains the prompt, the response, the provider message or any key. Alert rules match on
`component` and `reason` only.

## Alert rules

Configure these in the log/alerting backend of the hosting environment. Thresholds are starting points;
tune them after two weeks of pilot data.

| Reason | Rule (5-minute window) | Severity | Owner |
| --- | --- | --- | --- |
| `QUOTA_EXHAUSTED` | 1 or more lines | P1 page | Provider account owner + on-call |
| `CREDENTIAL_REJECTED` | 1 or more lines | P1 page | On-call |
| `RATE_LIMITED` | 20 or more lines, or any for 15 minutes in a row | P2 notify | On-call |
| Outbox `dead-letter` or `stuck` workflow | any, from `GET /api/owner/workflows` | P2 notify | On-call |
| Outbox `EXTERNAL_OUTCOME_UNCERTAIN` older than 1 hour | any | P2 notify | On-call |

Every alert must carry the correlation reference (deployment, time window, and the workflow `eventId`
when one exists) and link to the matching section below.

## Resolution procedures

### QUOTA_EXHAUSTED

1. Confirm in the provider console that the quota or credit balance is exhausted.
2. Provider account owner tops up or raises the limit. Record the headroom left after the change.
3. Users already see a clear "AI quota exhausted" error (`AIProviderQuotaError`); there is no silent
   fallback to another provider. Do not switch `AI_PROVIDER` to a public or cross-region fallback.
4. Close the alert once a new request succeeds. Note cost and minutes spent in the incident log.

### CREDENTIAL_REJECTED

1. Check whether the key was rotated, revoked or expired (401) or lacks permission (403).
2. Rotate the key in the provider console and update the environment secret. Never paste the key in
   chat, tickets or logs.
3. Redeploy or restart so the new secret loads; confirm one successful request.

### RATE_LIMITED

1. Check whether a single school or job is producing a burst (workflow report, oldest first).
2. If it is a burst, let the existing retry budget absorb it. If it lasts more than 15 minutes, ask the
   provider account owner for a higher tier.
3. Never re-run completed or uncertain external work to "catch up".

### Dead-letter, stuck and uncertain outbox work

Follow "Reconciliation and recovery" in `docs/operations/durable-workflows.md`. Retry only failed work
after its cause is fixed. Uncertain external effects are reconciled against the provider receipt; they
are never retried blindly.

## School-facing explanation

Staff see the product's existing short error text, not raw provider errors. The communications lead
tells the school: what failed, that no duplicate will be sent, the expected recovery time, and the manual
alternative (for example a printed notice). Any manual or fallback channel needs an approved
data-processing path.

## Per-provider acceptance checklist

Complete one copy per provider enabled for launch (AI/OpenAI, email/SMTP, WhatsApp, SMS, SafePay,
object storage), in the intended environment, and attach the evidence to the Jira card.

- [ ] Real credentials configured as environment secrets; owner of the account recorded
- [ ] Sender or merchant identity verified and owned by Skoolee
- [ ] Data-processing policy approved for this provider and region
- [ ] Success case: authorized test to a named synthetic recipient or sandbox record, receipt recorded
- [ ] Failure case: invalid credential produces the expected alert and owner notification
- [ ] Delayed-receipt case: timeout after acceptance stays uncertain until reconciled; no duplicate
- [ ] Quota/balance headroom visible to the provider account owner
- [ ] Worker restart resumes eligible jobs with one confirmed effect

## Open human actions

These cannot be delivered by code in this repository:

- Name a person for each responder role in the private on-call roster.
- Create the alert rules above in the production and dev log/alerting backends.
- Run the per-provider acceptance checklist with real credentials for each enabled provider.
- Set up quota and balance dashboards in each provider console.
