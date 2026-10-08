# Durable workflow operations — SKO-220

Report publication now commits its in-app notification intent in the same PostgreSQL transaction as the exam and report statuses. A Redis outage or process death cannot remove that intent. The HTTP result includes `workflowId` and `backgroundDelivery: pending`; publication itself is complete. School-facing workflow UI remains SKO-223.

## Deploy and run

Apply `20261008022000_durable_outbox` through the existing reviewed migration gate. Do not regenerate the frozen baseline. Run `pnpm worker:outbox` as a separately supervised, long-lived Node process with `DATABASE_URL` and `REDIS_URL`; a serverless request is not a worker supervisor. Restart on unexpected exit. No new provider credentials are required. Run at least one instance; multiple instances are safe. The dispatcher scans every second; expired leases and lost Redis jobs are redelivered within approximately 60 seconds plus bounded retry delay.

The dispatcher must use a reviewed service database role able to scan workflow metadata across schools. Domain callbacks still scope every raw query by the event's school and bind transaction-local RLS context. If optional RLS is enabled, provision the service role deliberately; the ordinary restricted request role cannot perform cross-school dispatch. Never share a worker connection's session-level tenant setting. Additive ledger tables are included in the generated application tenant registry; raw orchestration queries explicitly scope their mutations.

Existing `ai-remarks`, `pdf-generation`, and `notifications` queues have no application enqueue producers in the current baseline. They are not silently redirected. Direct PDF rendering, AI generation, and provider delivery remain synchronous/legacy paths; this release's registered durable consumer is `REPORT_PUBLISHED`. Future imports/scans/report-delivery producers must call `appendEvent` inside their domain transaction and register a consumer before activation. No exactly-once external delivery is claimed.

## Consumer contract

`appendEvent(tx, ...)` requires a stable school-scoped identity, actor ID, reference ID, kind, and version. Redis receives only event/school IDs. Names, marks, addresses, message bodies, attachments, and credentials stay in domain storage. Reusing an identity with different references is rejected. Event and initial job creation must use the **same transaction** as the domain write.

`consume` claims a fenced lease, binds fresh async tenant context, and limits a run to five attempts. Never write domain effects outside `ctx.effect(identity, transactionCallback)`: the job row lock, domain writes, unique receipt, and checkpoint commit atomically. A repeated effect skips its confirmed receipt. Resolve current access and source publication inside that callback. The report consumer checks active actor, current campus/role, current report-edit permissions, current school status, and current exam publication before resolving recipients. Queue input is not authorization.

Long operations receive heartbeats; an expired/replaced token cannot commit database effects. Crashes resume from committed effect receipts, not from an in-memory progress percentage. A handler's nontransactional computation may run again. External calls belong in `ctx.external(identity, authorize, send)`: intent becomes `uncertain` **before** the call, so loss of the response never permits automatic resend. This deliberately trades unattended recovery for avoiding unproven duplicate provider effects. A success receipt remains traceable even if cancellation arrived during the call.

Realtime inbox hints use the existing Redis pub/sub channel after the notification rows commit. They are best effort, like the existing implementation; inbox storage is authoritative and can be reloaded after reconnection. They are separate from durable queue payloads.

## Reconciliation and recovery

Use the existing authenticated APP_OWNER session with `GET /api/owner/workflows?schoolId=...`. The report returns up to 500 oldest event/job summaries, including creation/dispatch/start/finish times, attempts, checkpoint, cancellation request, safe reason, uncertain-effect count, and `orphaned`, `overdue`, `stuck`, `dead-letter`, or `tracked` classification. It excludes domain payloads and student references. An empty scope returns `workflows: []`; database failure returns 503 and pending work remains stored. Only a currently active APP_OWNER may inspect or mutate workflows, regardless of stale session role claims.

Use `POST /api/owner/workflows` with `{ "schoolId": "...", "eventId": "...", "action": "retry" }` for a failed job after correcting its cause. It grants five more attempts, preserves confirmed checkpoints, and writes an audit record. The execution-time policy still applies. Already running, completed, cancelled, or uncertain external work cannot be retried through this action. A success response means scheduled, not completed.

Use the same endpoint with `action: cancel` to request the next safe boundary. Queued/retrying jobs stop immediately; an active transaction finishes or rolls back before cancellation takes effect. Completed jobs are not relabelled. Confirmed and uncertain effects are never deleted or marked undone.

For `EXTERNAL_OUTCOME_UNCERTAIN`, stop and reconcile the provider's receipt or domain delivery identity with the responsible operator. Do not delete the receipt or press retry. This release has no registered external provider handler and no automatic uncertainty-clearing command. A future provider adapter must include a reviewed, audited reconciliation operation before being enabled.

Investigate `orphaned` records as ledger corruption (the normal atomic producer cannot create them). Investigate `stuck` leases beyond two scan cycles, old pending events, repeated `WORKER_FAILURE`, `ATTEMPTS_EXHAUSTED`, and failed authorization. Logs contain only static reason codes. Alert thresholds and continuous process supervision must be configured in the deployment environment; this PR does not provision production infrastructure.

## Local verification

Use disposable PostgreSQL on `127.0.0.1:55420` and Redis on `127.0.0.1:56420`. Never source the repository `.env`: it points at a remote database. `tests/outbox/prepare.mjs` refuses all destinations except `postgresql://postgres@127.0.0.1:55420/sko220_test`; it recreates that synthetic database and applies current migrations plus the existing recovery role fixtures.

Run `pnpm test:outbox` with that database and local Redis URL. Start Next on `127.0.0.1:3220` with `AUTH_SECRET=sko220-local-synthetic-test-secret` and the same scrubbed environment, then run `pnpm test:outbox:api`. Fixtures use only `example.invalid` identities. The suite kills child processes after a committed event and after a committed checkpoint, uses real Redis duplicate deliveries, races dispatchers/consumers, and tests all roles, revocation, failed publication transactions, cancellation and uncertain external outcomes using a fake provider callback. CI runs the same isolated service configuration without deployment secrets.

The existing recovery rehearsal includes a pending job and committed partial receipt before backup; restore verifies their full content hashes. This is synthetic release evidence, not a production restore certification. New school-facing screens, mobile/RTL layout, and visual accessibility states are N/A for this infrastructure release. Existing school inbox UI is retained; operational labels and reason codes are in the API/runbook.
