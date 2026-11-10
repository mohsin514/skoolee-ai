# Scheduled jobs (SKAI-747, PM-30.15)

All cron routes live in `src/app/api/cron/<job>/route.ts`. Every route requires
`Authorization: Bearer $CRON_SECRET` and fails closed (401/503) without it.

## Schedulers

| Job | Route method | Scheduler | Cadence (UTC) | Gate | Owner area |
|---|---|---|---|---|---|
| notification-automation | GET+POST | `vercel.json` | daily 04:00 | on | Notifications |
| conversation-retention | POST | `.github/workflows/conversation-retention.yml` | daily 02:40 | on | School AI |
| integrations | POST | `.github/workflows/scheduled-jobs.yml` | every 15 min | on | Integrations |
| service-desk | POST | `scheduled-jobs.yml` | hourly :10 | on | Service desk |
| group-policy | POST | `scheduled-jobs.yml` | hourly :10 | on | Group policy |
| subscription-expiry | POST | `scheduled-jobs.yml` | daily 01:20 | sensitive (billing) | Billing |
| ai-credits-reset | POST | `scheduled-jobs.yml` | 1st of month 00:05 | sensitive (billing) | Billing |
| meeting-reminders | POST | `scheduled-jobs.yml` | daily 06:00 | sensitive (messaging) | Messaging |
| family-digests | POST | `scheduled-jobs.yml` | Mondays 07:00 | sensitive (messaging) | Messaging |
| risk-digest | POST | `scheduled-jobs.yml` | Mondays 07:00 | sensitive (AI) | School AI |

Sensitive jobs only run on schedule when the repository variable `SCHEDULED_SENSITIVE_JOBS=true`.
Set it only after code-owner sign-off (AGENTS.md rule 10). Any job can be run once by hand with
"Run workflow" and the `job` input.

## Runtime contract

- Configuration: repository secrets `CRON_APP_URL` (e.g. `https://dev.skooleeai.com`) and `CRON_SECRET`
  (must equal the app's `CRON_SECRET`). Missing either: the workflow logs a skip and exits 0.
- Identity and idempotency: each route claims its own work (service-desk claims per due time,
  integrations leases deliveries, group-policy locks per template, ai-credits-reset uses the
  `ai_credits_reset_month` marker), so overlapping or repeated runs do not duplicate effects.
- Retry: up to 3 attempts per job with back-off; a job that still fails marks the run failed
  (GitHub emails the workflow owner). Per-school failures are logged by the route and do not stop other schools.
- Dead letter: integrations deliveries keep their own retry/failed state in `IntegrationDelivery`.
- Concurrency: one run per schedule at a time (`concurrency` group, no cancellation).

## Health checks

- Actions tab, "Scheduled jobs" workflow: the last run per schedule must be green.
- Manual check: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/service-desk`
  returns `{"success":true,...}`; without the header it returns 401.
