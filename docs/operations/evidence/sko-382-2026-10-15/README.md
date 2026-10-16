# SKO-382 — acceptance evidence, 15 October 2026

**Scope:** durable orchestration foundation and existing operator API. Synthetic engineering QA with real local PostgreSQL/Redis, the real webhook route, real application HTTP, and process crash injection. No production, paid resource, real pupil data, live provider call, or human operator approval is claimed. Root coordinates ticket completion after reviewing this record.

**Result:** 29/29 runtime/contract cases passed: [21 core + signed receipt cases](core.log), [3 real publication/operator HTTP cases](publication-http.log), and [5 operator cases on the final production build](operator-http.log). The actual localized operator report passed [48/48 responsive/keyboard combinations](report-ui.json); desktop English and mobile Arabic/Urdu screenshots were visually inspected. All 51 current migrations deployed successfully into a fresh dedicated synthetic database; [migration output](migrations.log). Full TypeScript and focused ESLint checks passed. The final combined production build, including the receipt fixes, passed in the coordinating task.

**Actual destinations:** dedicated loopback PostgreSQL 55439 / `sko382_test`, Redis 56439, Next dev 3220 for publication; final production build at loopback 3107 / synthetic shared test database 55438 for the separately coordinated 5-case operator suite. Shared data was never reset by this suite. Only the dedicated synthetic database was recreated. Provider callback tests invoke the real Next route in process and persist to real PostgreSQL; they are not a claim of a remote provider sandbox certification.

## Criterion matrix

| Ticket criterion | Expected → observed result | Evidence / source | Outcome |
| --- | --- | --- | --- |
| Domain and event atomicity | Inject rollback → neither mutation nor event; inject actual report event-identity collision → publication rolls back; remove collision → published + pending durable event | Core rollback; publication HTTP case3; `src/lib/academic/report-versions.ts`, `src/lib/queue/outbox.ts` | Passed |
| Crash between commit and dispatch | Kill producer after commit; reject publication to Redis; restore transport → same pending event consumed | Core SIGKILL/Redis case; real worker entry point | Passed |
| Duplicate delivery yields one logical effect | Two Redis deliveries / eight concurrent consumers → one committed receipt and one domain increment | Core duplicate/concurrent cases | Passed |
| Persisted states, times, checkpoints, safe reason | Queued → running → retrying/failed or completed; retry capped at5; explicit cancel → cancelled; no raw exception content persisted | Core retries/cancel/state assertions; operator API metadata includes times, next attempt, lease, budget, safe reason | Passed |
| Cancellation truthfully preserves external effects | Cancel during synthetic external call → committed effect remains, checkpoint1, job cancelled; uncertain receipt remains uncertain | Core uncertain/cancellation cases | Passed |
| Tenant context isolation | TenantB runs/fails before TenantA resumes; no context after callback; forged school cannot claim A; optional RLS non-bypass role denies unset/foreign tenant | Core tenant/RLS cases | Passed |
| Orphan/stuck/dead-letter reconciliation without pupil content | Delete fixture job; null/expire another lease; failed fixture → correctly classified, scoped, no pupil payload | Core reconciliation + policy cases; actual GET API tests | Passed |
| Stable identity per participating workflow | Event/effect identities and transaction adoption documented by registered kind | [Runbook adoption table](../../durable-workflows.md); publication is end-to-end tested; other adapters explicitly source-audited | Passed within foundation scope |
| Stale lease fencing | Resume stale worker after replacement completes → stale callback cannot commit | Core expired-token test | Passed |
| External uncertainty blocks replay | Simulate lost provider response after acceptance → one callback only; retry409 with no audit success; receipt stays uncertain | Core uncertainty and final operator HTTP case5 | Passed |
| 30-recipient partial batch | SIGKILL after12; another tenant runs first; retry → only18 callbacks; checkpoint30; replay creates0 new effects | Core batch30 case; [actual sanitized snapshot](reconciliation.json) | Passed |
| Signature / timestamp / replay validation | Mutated bytes, missing/incorrect signature →401 and no writes; malformed/pre-origin/future times ignored; duplicate state/time → one row | 7 signed route DB cases; UTC comparison explicitly normalizes session timezone | Passed |
| Out-of-order status and originating action | Read arrives before delivered; both immutable receipts link to same provider ID/communication/school; source intent untouched | Signed route cases2–5 | Passed |
| Receipt origin race and ambiguity | Valid signed callback before origin visibility →500/no write; origin appears → exact replay200 once; ambiguous cross-school ID →500/no tenant guessed | Signed route cases4–6 | Passed, bounded adapter |
| Manual retry authorization/actor/reason | Unauthorized403; stale role/deactivation401; cross-origin403; missing/incompatible reason400; wrong scoped workflow409; valid action audited with actor/reason/checkpoint | Final production operator HTTP5; operation-contract unit test; all school roles in publication/API suite | Passed |
| Provider/queue outage retains transaction | Dispatch failure leaves committed event; same event retried; uncertain external acceptance never auto-resends | Core SIGKILL/outage/uncertainty | Passed, synthetic external call |
| Safe operator recovery path | Failed work requires explicit reason; retry schedules only; terminal replay409; checkpoint and five-additional-attempt budget preserved | Final operator HTTP case5; [runbook](../../durable-workflows.md) | Passed |
| Responsive/localized operator evidence | Semantic text statuses, ordered timeline, isolated identifiers, keyboard-visible real links; EN/AR/UR at320/390/768/1440 with1×/2× layout scaling and both motion preferences | [Browser results](report-ui.json), [report](report.html), [Arabic](report-ar.html), [Urdu](report-ur.html) | Passed48/48 |

The input manifest binds the current scoped sources and the three authoritative passing logs: [input-manifest.json](input-manifest.json). Workspace changes remain uncommitted; the Git commit alone does not describe this implementation. The generated reports show the manifest hash and actual sanitized batch ID. Snapshot failed/cancelled counts are intentional injected outcomes, not hidden failing tests.

## QA flows and recovery

1. **Source commit / transport outage:** commit publication, kill before dispatch, fail Redis publish, restore queue, run duplicate deliveries. Expected source persists and one effect completes. Observed queued source survives; worker commits once. Operator next step: inspect the same workflow ID, not create another publication.
2. **Partial recovery across schools:** kill at12/30, process schoolB first, expire schoolA lease, resume A and redeliver. Observed12 retained +18 new =30, two attempts, one unrelated B effect, no cross-tenant context leakage. [Snapshot](reconciliation.json).
3. **Uncertain provider outcome:** synthetic send callback throws after simulated acceptance. Observed one call, uncertain receipt, failed workflow, automatic and operator retries refuse duplicate send. Recovery requires external evidence and an authorized provider-specific resolution; no fictitious receipt is created.
4. **Receipt races and replay:** use signed exact bytes; reject invalid signatures, timestamps and foreign provider account; send status before origin exists; repair origin; replay twice. Observed generic500 before readiness and one durable receipt after readiness. Ambiguous origin never selects a tenant. No arbitrary caller school field changes ownership.
5. **Operator permission/state recovery:** GET scoped metadata; submit incompatible reason/cross-origin; revoke an existing operator role; retry uncertain/queued work; cancel then replay. Expected current authorization and state conflicts, no false-success audit. Observed401/403/400/409 as appropriate; authorized cancel/retry records actor and enum reason. Success means scheduled, not delivered.

## Honest UI applicability

The actual owned artifact is a read-only operator report/runbook with a real API behind operational commands. It has no editable draft, modal, filter form, live loading spinner or unsaved state. Modal focus return, form error association and offline draft recovery are **N/A here**, not checked off as tested application behavior. Keyboard links, text status, semantic timeline, responsive reflow, localized labels and identifier isolation are tested on the actual HTML. The 2× check is explicitly **CSS layout zoom**, not a claim of native browser zoom. School-facing activity ribbons/detail/retry dialogs belong to dependent **SKO-386**, which starts only after this issue is accepted. The report is not a mock application screen.

Language variants cover operator content for global international, Pakistani, Saudi and UAE launches. Durable IDs contain no curriculum, language or currency semantics; a synthetic tenant switch proves isolation, not validation of country-specific curricula or legal policy. Real provider/account availability and deployment configuration are separate operational concerns.

## Defects caught, fixed and limitations

- Initial receipt fixture setup reused a unique synthetic contact email; corrected to per-fixture addresses. No runtime defect was inferred from this setup error.
- Receipt negative tests then caught a real database timezone comparison bug: signed pre-origin timestamps could pass an implicit timestamp/timestamptz comparison in a non-UTC session. Explicit normalized UTC timestamp comparison fixed it; the complete clean suite subsequently passed.
- Source review found non-unique provider IDs could assign one receipt to multiple schools. Unique-origin matching now fails closed and is tested with an actual cross-school collision.
- A callback arriving before delivery identity persistence was previously acknowledged without storage. It now returns a retryable generic error and passes exact signed replay after recovery. This is not a durable inbound inbox: it relies on the configured provider redelivery/recovery policy. Monitor persistent origin errors and confirm the actual provider redelivery window before live activation; no guessed retry-duration promise is made.
- Production process supervision, live alerts/thresholds, real provider credentials, remote provider acceptance and remote deployment verification are not executed here. They are deployment/adapter activation gates, not fabricated development evidence.
- No automatic uncertainty-clearing endpoint or provider reconciliation is invented. Uncertainty blocks resend; manual database edits are not an endorsed recovery workflow.
- The pre-existing unaccepted **SKO-476 integrity-retention hook** in the worker is preserved and outside this issue's acceptance. This suite contains no integrity fixtures and does not activate/verify that feature.

## Reproduce

Follow [the guarded runbook](../../durable-workflows.md). `prepare.mjs` requires both a known disposable loopback target and `OUTBOX_ALLOW_RESET=synthetic-only`; it deploys current migrations without loading dotenv. Run the core test command, the isolated publication HTTP suite, then the coordinated operator suite. Re-render with `node tests/outbox/render-evidence.mjs`; verify the artifact using `node tests/outbox/report-browser.mjs`. No provider or production calls are needed.
