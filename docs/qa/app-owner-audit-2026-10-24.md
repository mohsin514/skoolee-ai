# App owner audit — 24 October 2026

## Scope and meaning of the result

Audited the `APP_OWNER` console, its 11 registered views, provisioning, school lifecycle, pricing, sessions, password resets, support access, AI Workflows, and related platform APIs. Verification used a separate Next.js development server on `127.0.0.1:3094` and the synthetic PostgreSQL database `owner_audit_20261024`. No production rollout or live provider transaction was performed.

This is a verified improvement to platform administration, **not certification of every possible operation or unrestricted access to every tenant record**. School-domain routes still use tenant permissions. Audited support grants remain the access path for supported school-record domains. Family accounts remain tied to admissions/student relationships; the owner cannot create unrelated parent/student accounts through staff provisioning.

## Findings fixed

| Finding | Change | Evidence |
| --- | --- | --- |
| Clicking Ask could do nothing on a narrow viewport | Keep footer hints in a stable layout; blurring the textarea no longer moves the button between pointer down and click | Synthetic browser reproducer and full Ask conversation |
| School provisioning repeatedly asked for details already supplied | Normalize initial and legacy evidence consistently; provide required evidence pointers to the planner; recover exact literal text only for declared provisioning handoff fields | Reproduction using synthetic answers, missing citations, invented-value rejection and per-item evidence regressions |
| Missing school type was a vague question | Show explicit single-school/group options and human-readable field labels | Planner/database and browser tests |
| A failed answer submission erased the typed reply | Clear the answer only after a successful command | Injected browser HTTP 503 followed by retry |
| AI school handoffs opened an empty owner screen | Carry the handoff ID, claim the prepared request and populate the provisioning form | Browser form inspection |
| Provisioning did not settle its AI request | Bind and complete the handoff in the provisioning transaction, with an actual school receipt; reject reuse/foreign-owner submissions | HTTP/browser and database assertions |
| Expired AI handoffs could still be claimed | Include expiry in the atomic claim condition | Synthetic database test |
| AI Workflows appeared in the owner sidebar but redirected to `/owner` | Share an explicit owner AI workspace allow-list between the route guard and sign-in return validation | Real owner sign-in and sidebar navigation; four AI pages at desktop/mobile sizes; regression tests reject school-only AI pages |
| Loopback-IP sign-in failed during MFA deferral because NextURL normalizes the request hostname | Recover the matching original loopback Host only in development, preserving scheme/port and strict production checks | Real `127.0.0.1` login and MFA deferral; hostile origin and production regression tests |
| Owner AI workspace mounted school chat services | Disable the school chat dock for APP_OWNER | Browser asserts no school chat API requests |
| Password resets failed because unscoped password-history writes lacked the school foreign key | Write the target user's school ID | Real reset succeeds against PostgreSQL |
| Password resets left old sessions active and allowed the current password | Revoke active sessions in the password transaction; reject current/recent passwords; require temporary-password replacement | HTTP and database assertions |
| Existing school provisioning form was unreachable from the console | Add primary “Provision a school” action | Browser opens the actual institution-kind form |
| Suspension/restoration existed only in the API | Add school-detail controls with confirmation and refresh | API lifecycle assertions and browser suspension |
| Accountant, librarian and receptionist provisioning was missing; ADMIN was absent in the form | Add all eight supported staff roles to the relevant API/form lists | Provision each role through HTTP; inspect role controls |
| Staff provisioning used the school-contact email check rather than tenant-user uniqueness | Check case-insensitive account email within the selected school | Duplicate request returns 409 |
| Standalone institution owner omitted from school details | Include institution owners alongside group administrators | Provision standalone school, then read its owner |
| School selector stopped after 100 schools; exports silently stopped after 5,000 rows | Shared page collector reads through the reported final page and fails on interrupted/inconsistent lists | Unit test reaches page 51 and rejects partial failure |
| Invalid pagination/date arguments reached Prisma as NaN | Shared bounded integer parsing with safe skip limits | Unit edge cases and HTTP calls against all four list routes |
| Pagination ties could reorder equal-timestamp rows | Add ID as the secondary sort field | Code inspection and normal list execution |
| Active sessions included expired records | Require a future expiry in the active filter | Seed expired session and confirm exclusion |
| Pricing accepted malformed shapes, unknown plans and invalid numbers | Shared Zod validators for defaults and school overrides | Unit cases and HTTP save/reload/rejection checks |
| Bank details accepted non-string values and lacked a platform audit record | Validate trimmed strings; save configuration and redacted audit record together | Save/reload and audit database assertions |
| Tenant users lacked a school filter | Add school selector and apply it to list/export queries | API isolation assertion and browser filter |
| Mobile user table hid details/actions behind horizontal scrolling | Add mobile cards showing role, status, school, campus and accessible actions | 390px screenshot and browser overflow checks |
| Old list responses could replace a newer search/filter result | Request-version checks on schools, users, audit and sessions | Code review and browser/list regressions |
| School search promised addresses but did not search them | Include city/address in search | Code inspection |
| Staff totals excluded administrators without a campus and counted family accounts | Count staff roles at school level and filter campus staff counts | Synthetic school total includes its group administrator |
| Suspension was recorded as a plan change; several operation filters were missing | Record activation/suspension actions and expose provisioning/pricing/bank/archive audit filters | Code inspection; lifecycle API execution |

## Coverage matrix

“Executed” means real local HTTP/database or browser execution, not mocked API responses. “Partial” is deliberately not a pass for the entire feature.

| Area | Verified | Remaining limits |
| --- | --- | --- |
| Schools | List/read, malformed pagination, standalone provisioning, staff counts, plan change, suspend, restore, archive confirmation, archive, restore tombstone | Concurrent lifecycle writes and exhaustive provisioning field combinations not covered |
| Tenant users | Read/filter; all eight staff roles; duplicate rejection; password history, revocation and replacement flag | Student/parent admission flows and simultaneous teacher-seat allocation not exercised |
| Statistics / plans & revenue | Owner statistics API and rendered overview/billing views | No real revenue/provider reconciliation performed |
| Pricing | Valid defaults/overrides persist; invalid shapes rejected; screen renders | Concurrent edits and all commercial combinations not covered |
| Payment gateways | Read, bank validation/save/read/audit; screen renders | Live Stripe onboarding, payout/settlement and webhook delivery not exercised |
| Subscription requests | List, grace approval applies, duplicate review rejected; screen renders | Refund execution and cancellation-provider outcomes not exercised |
| Support access | Request, pre-approval refusal, approval, start, scoped read, out-of-scope refusal, general-platform denial during support, queued profile write, execute and close | Emergency access, expiry races and every supported data domain not re-exercised |
| Audit log | Read, paging, date handling, full-page export helper; screen renders | Some existing mutations still use best-effort audit logging; audit failure injection not covered |
| Sessions | Read, active filter, termination, password-reset revocation; screen renders | Cross-device browser replay checked via session rows, not multiple physical devices |
| Pilot evidence | List/export endpoints, create, detail, charter update; screen renders; findings unit tests | Full observation/measure/claim approval lifecycle not re-exercised |
| Capacity | Report API and responsive screen | Apply/revert policies and load objectives not exercised; no capacity claim made |
| AI workspace and platform actions | Real password sign-in/MFA deferral; actual sidebar navigation; workspace/catalogue/waiting/setup render at 1440px and 390px; workflow/handoff/questionnaire APIs; all nine platform capabilities enforce owner scope; pilot draft idempotency; safe handoffs; worker excludes owner jobs; synthetic Ask conversation and provisioning handoff | External model execution and all conversational branches not exercised |
| AI live control | Reject missing acknowledgement; enable and disable | Live AI-generated record quality and external model execution not tested |
| Provider events / workflow recovery | Provider-event list and access denial; workflow-operation contract tests | Provider resolution mutations, replay and worker recovery not exercised end to end |
| Access control | School administrator denied on all 14 tested owner read endpoints; scoped support boundaries enforced | Not an exhaustive authorization proof for every school route |

## Test commands and evidence

- `node --import tsx --test tests/owner/helpers.test.ts tests/owner/navigation.test.ts tests/commercial/owner-console.test.ts tests/commercial/contract.test.ts tests/navigation/*.test.ts tests/pilots/findings.test.ts tests/outbox/operation-contract.test.ts tests/authz/proxy-guard.test.ts tests/auth-journeys/return-path.test.ts`: **67 passed**.
- `npm run check:ui`: **8 passed**.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --project tsconfig.owner-audit.json --noEmit --pretty false`: source and owner-test type check. The focused config excludes accumulated development build directories; an ordinary full-project check also passed earlier after increasing Node heap.
- ESLint on the owner helpers/tests and changed authentication helpers: passed.
- `npm run test:ai-workflows`: **79 passed**.
- `tests/ai-workflows/platform.database.test.ts`: **6 passed**, covering the nine platform entries against the isolated `ai_workflows_test` database on port 55438. An initial run against the separate `postgres` database failed because its schema lacked `schools.ai_workflows_live_at`; the current-schema target passed.
- `tests/owner/acceptance.ts`: **45/45 checks passed**. HTTP/database checks plus all 11 views at **1440px and 390px**, mobile account roles, school provisioning entry, filter and suspension confirmation, plus real sign-in/MFA and four owner AI pages at both widths. Machine results and screenshots are in `test-results/owner-audit/` (ignored run artifacts).
- Screenshots were inspected directly for desktop users, mobile users and the mobile AI workspace; automated width checks cover all views. English was tested; Arabic/Urdu presentation has not been visually revalidated.

To rerun acceptance, initialize only the dedicated database with **both** `DATABASE_URL` and `DIRECT_URL` pointing to it. Start a separate app with:

```sh
DATABASE_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024?connection_limit=3' \
DIRECT_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024' \
AUTH_SECRET='synthetic-owner-audit-only-20261024' \
NEXT_PUBLIC_APP_URL='http://127.0.0.1:3094' NEXT_BUILD_DIR='.next-owner-audit' \
STRIPE_SECRET_KEY='' RESEND_API_KEY='' npm run dev -- --hostname 127.0.0.1 --port 3094
```

Then run:

```sh
DATABASE_URL='postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024' \
AUTH_SECRET='synthetic-owner-audit-only-20261024' \
node --import tsx tests/owner/acceptance.ts
```

The acceptance runner refuses any other database URL/secret. It creates synthetic fixtures and retains them for inspection; reruns create fresh UUID records. These test credentials are intentionally public test-only values and must never be used for a deployed environment.

## Existing failures found before edits

The baseline commercial/navigation/authorization run had **143 passed, 4 failed, 2 skipped**. The four failures were already present before changes:

1. `tests/authz/capabilities.test.ts`: “family keys: pickup, child switcher and canteen”.
2. Same file: “flagships … AI Workflows follows the School AI gate; Exam Studio the academic seat”.
3. `tests/authz/no-new-canManageOperations.test.ts`: baseline call-site ratchet.
4. `tests/authz/role-defaults.test.ts`: family permission defaults differ from expected values.

Resolved in the follow-up:

- The three capability/default assertions described the old AI access policy. They now check the current role-specific AI workspaces, retain the family permission boundaries, and verify that APP_OWNER has no school capability beyond its platform AI entry. No production permission grant was broadened to make these tests pass.
- The three new academic service call sites now use `canManageAcademics`, the purpose-specific predicate with the same behavior as the deprecated alias.
- `npm run test:authz`: **110 passed, 2 skipped, 0 failed**.

Follow-up validation also passed the combined planner/platform/command database suite (20 tests), followed by the platform suite with the new expiry regression (6 tests, one additional unique case). Tests use synthetic records and injected model replies. No live provider-quality claim is made.

## Ask browser regression

`tests/owner/ask.browser.ts` uses only the dedicated owner QA database and starts a mock Ollama endpoint on `127.0.0.1:11499`. Start the QA app with `AI_PROVIDER=ollama OLLAMA_BASE_URL=http://127.0.0.1:11499 OPENAI_API_KEY=''` in addition to the isolated-server variables above. Run the test with `OWNER_QA_MOCK_AI=1` and the same test database/secret. It checks a real button click, missing-field questions, a failed answer submission, successful retry, retained supplied details, school-type choice, and navigation into the populated form. The separate acceptance case submits the form and verifies the database receipt and replay protection. **Both browser cases passed**; the Ask conversation made exactly three loopback mock calls. The full updated owner acceptance suite passed **45/45**; source TypeScript, targeted lint and the eight UI checks passed again after the changes.

The real local owner's existing request was inspected read-only to identify the repeated-question loop. Automatic approval review rejected a new real-owner AI submission because it could send school-derived data to an external provider; subsequent reproductions used the isolated mock provider. Live external-provider quality was not revalidated.

## Approved live-provider check

After explicit user approval, one real local-owner request, “List schools missing a city”, was submitted on 24 October 2026. Sign-in and MFA deferral returned 200; Ask returned 201, COMPLETED/ANSWERED, with a read-only `platform.inspect` receipt. Usage records confirm `openai:gpt-4o`, 3,755 planning tokens, one charged credit and a second-look planning entry. No school record was changed.

Inspection found a semantic defect: the planner used `search: "missing city"` because the lookup schema only offered name search. Its structured results also had no text projected into the Ask receipt. Added an explicit `missingCity` filter with planner guidance, excluded deleted schools, and rendered the actual lookup results (or an explicit empty result) without another model call. Seven platform database tests pass, including inclusion/exclusion fixtures, visible result text and the read-only assertion. A direct read-only check of the real local database found **0 non-deleted schools with an empty city**. The corrected path was verified locally; no second live request was sent under the single-request approval.

Final validation for this live-check follow-up: **79 AI unit tests and 7 platform database tests passed**; source TypeScript, targeted ESLint and `git diff --check` passed.

## Chatbot authorization and conversation hardening — follow-up

### Implemented boundaries

- The registry declares each action's roles, scope, custom permission/seat gates and confirmation class. A mandatory boundary now enforces declared roles and platform/campus scope before resolution, previews, execution and committed-receipt replay. Confirmation and preview amendments check access before reading the domain.
- Model output cannot create a verified `assistant.answer` receipt. Information must come from an authorized lookup adapter. The old prose capability cannot execute again, including a stored-plan replay. Unsupported questions fail closed; this intentionally removes unverified free-text answers, including benign questions without a connected read adapter.
- Unstructured model clarification uses trusted localized copy, so model text cannot ask the person for passwords or tokens. Structured missing-field questions continue to use registry schemas.
- No model-generated SQL, arbitrary HTTP or arbitrary code path was added. Student marks/attendance changes remain outside the student's capabilities; family and assigned-class scopes remain enforced by existing adapters.
- App-owner model usage records actual tokens without debiting school credits. A separate 90-attempt request budget and existing 30-answer bound remain. Repair/recheck tokens are now recorded without a second school-credit charge. Database errors are no longer universally mislabeled as exhausted credits.
- Answer retries persist the command ID and content hash on answered questions. Optimistic claiming prevents concurrent versions adding duplicate segments. A repeated committed answer resumes the existing job; a reused ID with changed text is refused.
- Active browser polling sends an authenticated, same-origin `advance` command to recover interrupted planning/execution. Leases still serialize work; this command cannot confirm class-B actions. Owner work remains excluded from unattended workers.
- Resume after an answer/provider failure detects cancelled plans and replans instead of falsely completing them. Confirmation replay lookup is now scoped to its own job.

### QA cases

| Boundary | Evidence |
| --- | --- |
| Owner versus school roles | Platform gate tests; forged student stored-plan regression; no receipt or intent created |
| Campus and family isolation | Existing cross-campus, foreign-class, own-child and other-student adapter suites |
| Human approval | Confirmation hash/version tests; class B never executed by advance/worker; class C prepares a handoff |
| Credential output | Adversarial fake-provider answers refused; malicious clarification replaced with trusted text |
| Owner conversation credits | Seven planning turns with exhausted school balance, zero school debit, tokens recorded |
| Answer retry | Repeated command does not add a segment or call the provider again |
| Provider recovery | Deterministically injected outage; resume of a cancelled answered plan |
| Mobile browser | 390px submit → missing fields → injected 503 → preserved answer → retry → type choice → prefilled owner form; three loopback mock calls |

### Scope and remaining coverage

The inventory check reports **192 connected registry entries, 660 unconnected capabilities, and 29 handlers awaiting inventory**. This is not a claim that every app function is automated or every possible prompt is safe. New operational adapters need explicit role/scope policy, evidence, confirmation/idempotency behavior and negative tests before connection. The legacy School AI document assistant is a separate draft/approved-source workflow; this pass does not replace it with the operational Ask engine.

The browser pass uses synthetic data and a local mock model. It validates the UI and request execution flow, not unrestricted live-provider language quality. Prior live-provider evidence above remains separate. No production deployment was performed.

### Final follow-up verification

- Workflow database suite: **185 passed, 0 failed** against the isolated local database, with external AI disabled. This includes the owner-credit, duplicate-answer, credential-output, forged-role and resume regressions.
- Workflow unit suite: **80 passed, 0 failed**.
- Authorization suite: **110 passed, 2 skipped, 0 failed**.
- Source TypeScript check, targeted ESLint, capability inventory check and `git diff --check`: passed.
- Mobile mock-provider browser flow: passed; screenshot visually reviewed.
- Earlier diagnostic runs exposed an environment-dependent provider-outage fixture and synthetic calls exceeding the real eight-per-second limiter. The outage now injects a deterministic failing provider; planner tests pace calls without disabling the production limiter. The complete rerun above passed.
- Separate QA server on port 3094 stopped after testing. Main development app on port 3000 remains running.

## Live school-creation reproduction and fix

The earlier mock browser test was insufficient: its provider always returned empty evidence and all earlier fields. A real browser session on port 3000 with the app's configured provider reproduced the user's failure:

1. Asked `Create a new school`.
2. Supplied school name, Lahore, a synthetic owner name, and an `example.invalid` owner address.
3. The app correctly asked only for school type.
4. Clicking `Single school (STANDALONE)` made all four previously answered fields appear missing again.

The database showed the values were still present in plan 3; the new model citations failed validation. Plan 2 had already validated those exact values. Fix: opted-in class-C literal form fields retain their previously validated values/evidence across clarification rounds. Changed values still require fresh evidence; IDs, numeric writes, attendance, marks and nested records do not inherit evidence. The regression now includes omitted prior fields AND wrong follow-up citations rather than an unrealistically perfect mock.

Live verification after the fix:

- Recovered the stuck conversation without retyping its details.
- Opened the prefilled owner form and clicked `Provision school`.
- Created **QA Chat School 24 October**, Lahore, exactly once (school `b69a9cbf-81df-477a-8861-d30c41be599f`), with one campus and one owner account.
- Workflow `06c992da-0172-4a50-a9f3-3501d7402223` is `COMPLETED`, outcome `EXECUTED`, school credits charged `0`.
- Returned to Ask and verified `Finished`, `1 of 1 done`, and the saved result.
- Repeated the original sequence in a fresh conversation: four details → type choice → review, with no repeated questions. Stopped that extra QA request without creating a second school.
- Changed the provisioning handoff to say `Ready for your review` and `Review and create school`, explaining the final form submission.
- The single created QA school remains in the local app for inspection. No real recipient was contacted.

Evidence: `test-results/owner-audit/live-school-created.png`, `live-school-workflow-completed.png`, and `live-school-fresh-review.png` (local ignored screenshots; no credentials shown).

Checks for this fix: 81 workflow unit tests, 11 planner database tests, 8 UI checks passed; source TypeScript, targeted ESLint and diff whitespace checks passed.

## Follow-up: deterministic form dialogue and actual email-stall reproduction

The next user report exposed failures the earlier fix did not cover: an initial request could omit the email field entirely, and `create test 3 school` could finish without asking anything. Retaining model evidence alone was insufficient.

### Implementation

- Added an opt-in, registry-schema-driven form dialogue. Explicit owner school-creation requests route directly to the registered provisioning action. Accepted answers, validation and the next missing field are resolved on the server without another model call. Registered roles and gates still apply before reading/preparing the action; final provisioning remains on the authorized owner screen.
- Short replies bind to the pending field; labelled replies can supply several fields. A single email is recognized independently and never becomes a name/city. Invalid and already-used emails ask for correction while retaining other answers. Replaying stored answers also supports older single-step provisioning conversations.
- Fixed a shared engine path that could leave a step in NEEDS_INPUT without an OPEN question. Invalid inputs now produce visible questions; authorization remains checked first.
- Added a visible accepted-details summary, opaque run-ID URL restoration, and clear instructions while review/confirmation is pending. The ordinary new-request composer is hidden during pending review to prevent an approval reply accidentally starting another request.
- RAG is not used for transactional state. Retrieval can later supply permission-filtered policy/document context, but must not decide authorization or replace domain validation, confirmation, or saved workflow state. The deterministic dialogue is currently registered for school provisioning; this is not a claim that all app capabilities have been migrated.

### Verification on the running app (port 3000)

Requested `create QA Reliable 24 school`, supplied Lahore and Sara QA as short replies, submitted an invalid email, then corrected it to `qa-reliable-24@example.invalid`. The flow retained the earlier values and reached review. Reloaded the page and verified that the same review resumed. Opened the prefilled form, clicked Provision school, and returned to the chat to verify Finished / 1 of 1 done.

Read-only database verification found exactly one school (`09694861-d759-42f8-9425-981914d01c71`), one campus and one matching owner account. Job `8a6f3f2f-511a-4dcc-b95e-128d211afd7f` is COMPLETED / EXECUTED, creditsCharged 0, usage empty (no model calls). The synthetic school remains available locally. Screenshot: `test-results/owner-audit/reliable-school-completed.png`.

### Checks

- Complete workflow database suite: **187 passed, 0 failed**, isolated test database; includes provider-unavailable deterministic school creation, short answers, invalid/duplicate email corrections, and missing-question regression.
- Workflow unit suite: **84 passed, 0 failed**.
- Source TypeScript check and targeted ESLint: passed.
- No production deployment. Main development server remains available on port 3000.
- Earlier sections describe earlier test runs; the deterministic implementation and results in this section supersede their school-planner behavior. The capability inventory limitations documented above still apply.

## Role action plans and in-chat package pricing

- Added a live `buildRolePlan` for all 11 role IDs, derived from registry actions and mandatory access checks. Each action records scope, availability, blocking gate and execution mode. The model receives this plan every planning turn, but can call only supplied capability schemas; backend gates remain authoritative. Retrieval now uses the full mandatory access check too.
- Full per-role connected-action catalogue: `docs/qa/ai-role-action-plan.md`. This exposes remaining class-C handoffs rather than claiming all screens are automated. Inventory still reports 192 registry entries, 660 unconnected capabilities and 29 handlers awaiting inventory.
- Converted only `platform.set_default_plan_pricing` to a versioned class-B operation: explicit in-chat price confirmation, atomic audit and durable idempotency receipt. Its narrowly documented floor exception covers catalogue defaults, not charging money or changing existing subscriptions. Other sensitive actions retain their original approval requirements.
- The manual Pricing route and chat share `saveDefaultPlanPrices`. Concurrent updates serialize; stale snapshots refuse the write. Reconfirming a refreshed preview also refreshes server-owned snapshot fields so the user is not trapped in a stale-state loop.
- Deterministic pricing dialogue handles the reported “needs to update the package price”, asks for package and monthly PKR amount, preserves short replies, and previews the exact before/after. Visible package names map to the correct legacy IDs: Basic=FREE, Pro=BASIC, Enterprise=PRO, Custom=ENTERPRISE. Negative, ambiguous, oversized and incompatible-period/currency amounts are rejected.
- Live browser reproduced the original request, selected Pro, entered a synthetic 4500, and displayed **Save package prices** in chat with **PKR 4000 → PKR 4500 / month**. The QA proposal was stopped without changing the live configuration. Evidence: `test-results/owner-audit/pricing-in-chat-preview.png`.
- Isolated database tests execute the real save path, verify one audit/write across repeated confirmation, reject school-role execution, and require a fresh confirmation if another actor changes the price. Tests exercise role plans for every role ID.

Final checks for role plans / pricing: **190 workflow database tests passed**, **86 workflow unit tests passed** (plus the final pricing-parser rerun), **110 authorization tests passed / 2 skipped**. Source TypeScript, targeted lint, capability inventory and diff whitespace checks passed. A real save was exercised in the isolated test database and restored; the live UI test stopped at the preview and cancelled its synthetic proposal. No live default prices were changed.


## Shared conversation state and app knowledge follow-up

Research: [Building effective agents](https://www.anthropic.com/research/building-effective-agents) and [Writing effective tools](https://www.anthropic.com/research/writing-tools-for-agents). Applied the separation between retrieval, tools, persisted state and verification rather than replacing application authorization with a prompt.

Implemented:
- Planner answers carry their question pointers and capability context; previous plan inputs, dependencies, missing fields and statuses accompany each replan. Scoped IDs become handles; execution snapshots and credential-shaped fields are omitted.
- Existing capabilities stay in the retrieval slate during clarification, subject to fresh role/gate checks.
- Compound requests bypass single-action form shortcuts. Questions about how to perform an action bypass those shortcuts too.
- New `assistant.app_knowledge` read tool retrieves reviewed capability descriptions, examples, approval modes and source versions after current permission checks. Results are rendered from source copy, not invented model prose. Shared by all roles.

Live browser QA: “How do I update package prices in Skoolee?” returned sourced guidance without changing prices. “Create a new school and update the Pro package price to 4500” retained two actions; supplying explicit synthetic school details advanced school preparation without losing pricing. Cancelled that QA run before provisioning or confirming prices. An optional school plan was inferred from the initial package mention before explicit clarification: this remains a limitation of model interpretation; explicit school-plan clarification corrected it before any execution.

Remaining scope: this is catalogue-backed retrieval, not a full school-document RAG index. Document ingestion needs tenant/role visibility, approved versions, source citations, deletion propagation, and injection evaluation. No raw database access should be added. Registry inventory still reports 660 unconnected capabilities and 29 handlers awaiting inventory; neither prompt changes nor RAG connect missing actions. General observation-driven replanning and exhaustive multi-action interpretation remain further work. Do not describe this pass as complete app-wide automation.


Repeated live QA exposed nondeterministic how-to routing: the model sometimes proposed pricing changes for a guidance question. Explicit how-to requests now route server-side to the read-only knowledge tool, and a regression supplies a deliberately wrong model response to prove it cannot run. Final live result: job `62843661-720e-440d-92f9-072886739ee1` returned only sourced pricing guidance. Screenshot: `test-results/owner-audit/app-knowledge-answer.png`.

Validation: full database suite 193 passed before the final routing guard; final planner suite 17 passed after it; baseline unit suite 88 passed plus final conversation tests 3 passed; capability check and lint passed. TypeScript validation also run. Browser test mutations were never confirmed.
