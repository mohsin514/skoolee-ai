# AI Workflows and First-Login Setup: the delivery plan (stacked slices on feat/ai-full-role-automation)

# AI Workflows and First-Login Setup: delivery plan

Status: build order for one implementing engineer-agent working sequentially. Read-only planning pass on 2026-10-23; no repository file was changed.

Ground truth used:
- the architecture, UX and per-role questionnaire syntheses supplied with this task, plus the red-team control list;
- `docs/product-review-2026-10/ai-automation-plan-2026-10-23/appendix-b-audit-reports.md` (B.engine findings at lines 117-149, B.qa at 703-840);
- `appendix-a-capability-inventory.md`, which I re-read for risk, idempotency and reuse on every key this plan names.

---

## 0. Three facts that change the plan

1. **The branch base is behind dev.** `feat/ai-full-role-automation` already exists. It sits at `8ffc312b`, one commit on top of `954b7285`. `dev` is 65 commits ahead, and those commits include the restored Exam Studio PRs #42-#49 (`5128ba75`) and their migrations up to `20261101100000_exam_studio_s8_pilot_ledger`. Two consequences:
   - The `/ai/studio` deep links and the Exam Studio pseudonymiser callers we must re-test exist only on dev.
   - The architecture's migration name `20261024000000_ai_workflows_v2` would sort *before* migrations already applied on dev Supabase.

   **So Slice 1 starts by merging dev into the branch, and every new migration is timestamped after `20261101100000`** (first one: `20261102000000_ai_workflows_v2`). `src/lib/automation/*` and `src/lib/ai/pseudonymize.ts` are unchanged between `954b7285` and dev, so the merge does not touch the engine.
2. **Some keys the questionnaires use are not Appendix A table keys.** `campus.create`, `campus.update_details`, `platform.update_institution`, `personal.save_plan` and `work.save` are existing automation tools or server actions (for example `src/app/actions/addCampus.ts`, which appears only in the notes at inventory line 96). `inventory-to-json.ts` must emit server-action rows and existing tool rows as keys (cluster `PERSONAL` or `C8`), or the ratchet maths in `coverage.md` will not reproduce.
3. **The red team overrides several class choices in the questionnaires.** Each override is listed in §10 so it gets decided once:
   - parent phone and channel changes become C, not B;
   - `platform.capacity_apply_policy` becomes C;
   - class-C prepare needs a B confirmation;
   - B steps execute only inside the confirming request.

---

## 1. How slices are delivered (applies to every slice)

- **Stacked PRs.** Each slice is one PR into `feat/ai-full-role-automation`. Slice 1 is eight sub-PRs, 1a to 1h, each green on its own. The branch merges to `dev` only after Slice 1h, behind the `AI_WORKFLOWS_V2` per-school flag: on in dev, off in prod until the release gate.
- **Every slice ends with the same steps.** These follow the memory rules (Linear workflow, migrate+push, shared-checkout commits):
  1. Linear ticket moves to In Progress at the start.
  2. Audit the existing code at file:line before wiring.
  3. If the slice has a migration: hand-written SQL, then `prisma migrate diff`, then apply to isolated 55438, then dev Supabase through `DIRECT_URL` (5432) with `migrate deploy`, then `migrate status`, `prisma generate`, `node scripts/gen-tenant-registry.mjs`, and a dev-server restart. Never `db push` and never `prisma format`.
  4. Gates: `npm run check:capabilities`, `npm run check:ui`, and tsc with `NODE_OPTIONS=--max-old-space-size=12288`.
  5. Run the slice's unit, DB and browser suites, plus the matrix shard for the touched clusters.
  6. Write evidence to `docs/operations/evidence/sko-<n>-<date>/README.md` in the sko-397 format: Audited first, Built, Migration applied (55438 + dev), Results table with ports, Boundaries, Screenshots. Screenshots are named `<feature>-<state>-<lang>-<width>.png`, cover EN/AR/UR at 390, 768 and 1440, and are kept in the **scratchpad**, never `test-results/design-system`.
  7. Post a QA comment in Linear, commit only your own hunks through a temporary `GIT_INDEX_FILE`, push, and mark the ticket Done after QA.
- **Per-entry authoring recipe.** Architecture §8.2 applies to every capability: scaffold, then export the service's zod input, then extract a command if there are inline-prisma or route side effects, then gates with provenance, resolvers, preview with fingerprint, idempotency mode with reconcile/receipt/verify, a hand-off for C, EN/AR/UR copy, and 3 live-smoke utterances per language.
- **Rates used for estimates.** These are architecture §14 rates plus the red-team additions:
  - B on a direct service: 0.25 d, or 0.35 d when idempotency is `no` (natural reconcile plus a kill test);
  - wrapper: 0.4 d;
  - inline-prisma extraction with golden test and command: 0.75 d;
  - C hand-off back end: 0.15 d;
  - domain-screen hook: 0.5 d;
  - resolver: 0.5 d;
  - questionnaire definition: 1.5 d.

  The first week in a new domain runs about 40% slower, and that is folded into each slice total.
- **"Done" for a slice means the founder can tick its browser checklist on the synthetic tenant**, with practice-mode rules applied (§2, control P1).

---

## 2. Cross-slice controls that must exist before any role slice ships (all land in Slice 1)

| ID | Control | Source |
|---|---|---|
| P1 | **Server-enforced practice mode.** While `CURRENT_AI_RELEASE_EVALUATION` is null (`src/config/ai-release-evaluation.ts:3-7`), writes are refused on non-synthetic tenants and receipts read "Example · not saved". On the synthetic tenant the badge reads "Demo school · changes are real here". A DB test asserts that no non-synthetic tenant commits while the gate is null. | red team "practice badge contradicts receipts" |
| P2 | **Pseudonymiser inversion.** Keep the broad `/name$/i` and `^name$` = PERSON rules and add a `CLEAR_KEYS` allow-list checked first. `tests/ai/pseudonymize-schema.test.ts` parses `prisma/schema.prisma` and fails on any unclassified `*name*` field. `pii/masker.ts` is an extra layer on top. Exam Studio callers are re-run in the same PR. This **replaces** architecture §5.7(1), which narrowed the rule to a person-key allow-list and so failed open. | RT1 (blocker) |
| P3 | **Evidence required by default** for every `modelInput` scalar that reaches `bind`. Exemptions go in `registry/evidence-exemptions.ts` with CODEOWNERS review. A missing quote makes the field a question. Any `quotedData` in the job context escalates A to B. Decisive pointers (status, amount, date, decision, recipient, audience) need an exact normalised match, an agreeing server parse and the negation guard. | RT2 (blocker), RT12 |
| P4 | **Confirmations bind the input as well as the preview.** `confirmHash = sha256(capabilityKey, capabilityVersion, inputHash, previewHash, contextFingerprint)`. `AiWorkflowConfirmation` gets `inputHash`, `sessionTokenHash` and `expiresAt` (10 min). Any write to `boundInput` bumps `previewVersion` in the same UPDATE. A lint checks that mutating each bound field changes the preview hash. | RT3, RT8 |
| P5 | **B executes only inside the confirming request.** The worker advances class-A steps and model calls only. `authorizeActor` re-checks session revocation, `assertSchoolOperational`, role, campus and the access digest. | RT8 |
| P6 | **Class-C prepare is itself a B confirmation** ("send for approval" preview). Prefill schemas for APPROVAL_DECISION carry no decision field (lint 16). Each actor has at most 20 open hand-offs. Hand-offs record `originRole` and `originUserId`. Fields flagged `identitySensitive` are never prefilled from family or student hand-offs. | RT4, RT11 |
| P7 | **Forgery-proof hand-off completion.** Check the model, the bound target keys, `createdAt ≥ handoff.createdAt` and that the claimant is the actor. Anything else returns 409. `COMPLETED_WITH_CHANGES` may diff allow-listed fields only. | RT5 |
| P8 | **Exhaustive UI state enum generated from `StepStatus`**, with a never-switch. UNCERTAIN reads "We can't tell whether this was saved; check {surface}" with retry disabled. FAILED_UNVERIFIED is never shown as "didn't run". One engine-owned `RunView` projection with contract tests. All routes live under `/api/ai-workflows`; this resolves the UX/architecture route drift. | RT blocker + contract drift |
| P9 | **Credits.** Every provider attempt is logged at zero credit (`logAIAttemptTokens`). A credit is charged only when the provider returned tokens > 0. A circuit breaker sits on provider outages. Reservations have a 30-min TTL and are released in `lockAndReconcileAICredits` (`openai.ts:490-503`) for workflow jobs too. Caps: per-user per day, per-role per month, and per job (5 free-form, 20 questionnaire). A nightly check catches `aiCreditsReserved` drift. | RT7, provider-outage, credit accounting |
| P10 | **Time limits.** Each unit has a ~40 s deadline passed as an `AbortSignal`, and a workflow model call is capped at 15 s. A `MODEL_ATTEMPT_STARTED` event precedes each call, and a sweeper charges and logs orphaned attempts. The lease is at least twice the unit. SSE has an explicit `maxDuration` and closes 5 s before it. | RT timeout, SSE |
| P11 | **Localised errors.** A closed error-code enum at the adapter boundary. Zod issues map to a JSON pointer and a question template. Unknown errors show generic copy and a reference id. A lint checks that every reachable `ApiError` has a code. | RT errors |
| P12 | **Offline.** No offline command queue: only a composer draft with a 24 h TTL, cleared on sign-out. Confirm, answer and claim are disabled offline. Stale commands get 409 SUPERSEDED. | RT offline |
| P13 | **Idempotency keys carry the full job UUID.** The intent lookup matches actorId, stepId, capabilityKey and inputHash, or returns 409. `actorId` is in the unique constraint. | RT16 |
| P14 | **Events and hand-off routes check the reader.** The events route requires `job.actorId === user.userId` and a matching school under tenant context, and returns 404 otherwise. Hand-offs authorise on `targetRoles`. Requester views of a hand-off show status only. | RT10, RT20 |
| P15 | **Lint bans `runUnscoped` and hand-built `AuthUser`** in `src/lib/ai-workflows/**` except `jobs/actor.ts`. | RT21 |
| P16 | **Flag-off is drain mode.** No new jobs start; existing jobs and hand-offs complete. Covered by a test. | RT rollback |

---

## 3. Slice 1: Platform, shell and today's tools on the registry (sub-PRs 1a to 1h)

**Goal.** Land the registry, the plan-then-execute engine, the confirmation classes, the five hand-off kinds and the UX shell. Move today's 12 tools and 15 typed operations onto them. Add the CI lint. Nothing that works today may regress.

**What users see by the end of 1h.**
- Every role gets the Ask bar or ⌘K palette and a RunSheet that shows true states only.
- B steps wait on a "Save … · count" button with a preview code. The 600 ms auto-advance is gone.
- Class-C typed ops (for example `finance.apply_operation`) become "Prepared · with {name}", with the same code shown in the Finance operations / Runs panel.
- `/ai/can-do` shows the honest "connected to n of m" count.
- The existing questionnaire still works, now through PLAN_REVIEW, and nothing applies before Build.

**Capabilities connected.** About 40 W0 entries (A 9 / B 16 / C 15, regenerated in `coverage.md`):
- **12 tools:** `school.inspect`, `platform.inspect`, `profile.update`, `personal.save_plan`, `work.save`, `students.create`, `campus.create`, `library.create_books` → `library.book_create`, `front_desk.log_call` → `front_desk.call_log`, `platform.update_institution`, `curriculum.create` → `curriculum.import_topics`. `school.execute` is dissolved into typed entries.
- **14 typed ops as entries.**
- **`setup.apply_changes` as 13 variants:**
  - B: rooms, periods, subjects, teacher_allocations, weekends, holidays.create, holidays.update, staff_invitations (pending rows only);
  - C: holidays.delete, guardians, transfers, withdrawals, migration_cutover.
- **Class C:** `finance.apply_operation`, `fees.generate_invoices`, `communications.queue_announcement`, `timetable.publish_reviewed`, `students.promote_enrollment`, `academics.transition_year`, `operations.record_risk_decision`, and operator `attendance.record_register`.
- **Other entries:** `nav.open` (A) and the Exam Studio DEEP_LINK.
- **Behaviour change:** the self-approve at `service.ts:81` is deleted (§6.4 path).

### Sub-PRs

| PR | Content | Days |
|---|---|---|
| **1a Base and harness** | Merge dev into the branch. Wire `tests/automation/*` into `scripts/run-school-ai-tests.mjs` (the glob at :11 misses it) plus new `test:ai-workflows`, `test:ai-workflows:db` and `.github/workflows/ai-workflows.yml` with the 12 GB tsc heap. Commit isolated-env scripts under `scripts/qa/` (the /private/tmp helpers are gone, per B.qa). Remove the orphan `tests/school-ai/zz-scratch-diag.database.test.ts`. Add a SKO-470 Runs regression test (`run-service.ts:54-122`). Add `scripts/ai-workflows/inventory-to-json.ts`, `coverage-report.ts` and `generated/coverage.md`, including server-action and existing-tool keys. Add `data-ai-*` anchors to `automatic-workspace.tsx`. Capture legacy-parity scenarios from the 18 DB tests. | 5 |
| **1b PII** | P2 inversion with `CLEAR_KEYS`, plus the schema test. `pii/masker.ts` (policy by entity kind). `pii/vocabulary.ts` (campus-scoped name match, Unicode boundaries, ≥3 characters, boundary-aware replacement instead of split/join, `pseudonymize.ts:77-84`). `pii/data-channel.ts`. Masker goldens ("7B", "Mathematics", "R-12" stay clear; names are tokenised). Re-run the Exam Studio suites. | 5 |
| **1c Registry and lint** | `registry/{types,define,gates,floors,never-safe,exclusions,tightenings,evidence-exemptions,wrappers}.ts`; `school-ops.ts` (`typedOperationAdapter`, variants); about 40 W0 entries; `scripts/ai-workflows/{scaffold,scan-handlers (ts-morph),build-registry,check-capabilities}.ts`; `capability-baseline.json` ratchet; `thin-routes.json`. Lint items 1-15 from architecture §8.3, **plus 16** (no decision fields in APPROVAL_DECISION prefill), **17** (A entries declare evidence for every field), **18** (preview covers every bound field) and **19** (contact-channel fields are never A or B). `check:capabilities` runs inside `npm run build`. | 18 |
| **1d Runtime** | Migration `20261102000000_ai_workflows_v2` (below). `jobs/{job-service,lease,worker,events,credits,actor}.ts`; `executor/{scheduler (pure nextStepState),step-runner,intents,reconcile}.ts`; SSE `GET /api/ai-workflows/[jobId]/events` with the `?poll=1` fallback; `sweepWorkflowJobs` beside `sweepSchoolRuns` (`outbox-worker.ts:49,51`); the retention cron; the gateway's strict `responseFormat` json_schema (`openai-settings.ts:12-17`) with a readiness probe; P9 credits; P10 deadlines; P11 error enum; P13 keys. | 21 |
| **1e Protocol** | `planner/{retrieve,cards,protocol,prompts,plan-validate,fill,evidence,revalidate,replan}.ts`: BM25 over EN/AR/UR, router only above 40 candidates, phase 1 with the single-step fast path, phase 2 fill, one repair call covering syntax and schema errors (fixes `service.ts:128,134`). `resolve/normalize.ts`. Core resolvers: student, class, subject, staff, campus, period. `AiWorkflowSegment` evidence (P3) with the negation guard. Read answers come from templates only, with the URL and credential-word filter (RT18). | 18 |
| **1f Classes and hand-offs** | `executor/{classes,confirm,handoff,verify,outcome,compensation}.ts`. Single and batch confirm with `setHash`, at most 10 per free-form sheet and 30 per questionnaire, with `chunkGroup` for larger sets. `effectiveClass` escalation (SoD `access.ts:184-200`, `finance-operations-service.ts:94-98`, quotedData, batch over `autoRunMax`); re-run at confirm and inside the transaction, where an escalation voids the confirmation and converts the step to a hand-off. Typed-op B approval via `updateWorkspaceRecord(via:"ai-workflow-confirm")` with the repository rejecting it when no confirmation row exists. All five hand-off kinds; claim CAS; `completeHandoff()`; `useWorkflowHandoff`; `HandoffBanner`; NO_ELIGIBLE_APPROVER; P4-P7, P14-P15. | 16 |
| **1g UX shell** | `src/components/ai-workflows/*`: `AskProvider`/`ask-bus` merged with `TeacherCommandPalette` (delete its ⌘K listener at `command-palette.tsx:51-56`), AskBar, SuggestionRail, RunSheet, RequestThread (SKO-460 conversations), ProgressRibbon, TaskCard generated from zod, ProvenanceChip, ConfirmBar (verb + count lint), PreviewCode, PreviewDiff (`ExecutionPreview` for typed ops), local "yes" interception plus the server 409 `CONFIRM_REQUIRED`, high-blast checkbox, ReceiptList, NotYetCard, PracticeBadge, HandoffCard, HandoffInbox `/ai/waiting`, PreparedByAiPanel on `runs-panel.tsx` and `finance-operations-panel.tsx`, CapabilityAtlas `/ai/can-do`, RunHistory, the `/ai` home with Studio tools, draft-tool notices, `ChatDock suppressed`, the `listen`/`wait`/`puzzled` poses, `useReducedMotion`, `assertReceipt` and `expectNoPrematureDone`. P8, P12, the app-level live region. | 14 |
| **1h Cutover** | The existing GuidedSetup questionnaire runs through the new job (origin QUESTIONNAIRE, PLAN_REVIEW, version binding kept, `service.ts:107-110,116-119,144-147`). Delete the 600 ms timer (`automatic-workspace.tsx:54`). `POST /api/automation` returns 410; GET stays read-only for one release. Port the legacy scenarios to `legacy-parity.database.test.ts`. Delete `src/lib/automation/{service,catalog,schema,validation,role-action-service,worker}.ts`, keeping `students.ts` logic moved to `registry/domains/c3/students.ts`. Flag on in dev. P16 drain test. | 8 |

### Migration `20261102000000_ai_workflows_v2`

- **New tables:** `ai_workflow_jobs`, `_segments`, `_steps`, `_intents`, `_questions`, `_confirmations`, `_handoffs`, `_events`, `ai_capability_gaps`, `ai_setup_responses`.
- **Columns and constraints added beyond the architecture sketch:**
  - jobs: `session_token_hash`;
  - confirmations: `input_hash`, `session_token_hash`, `expires_at`;
  - handoffs: `origin_role`, `origin_user_id`;
  - intents: `actor_id` in the unique key;
  - jobs: partial unique indexes for one non-terminal job per `setup_response_id` and one per `(setup_response_id, setup_response_version)`;
  - `reservation_owner` on the credit reservation path.
- **Every table** has `school_id`, a composite FK `(job_id, school_id)` and `campus_id` where scoped.
- **Data step:** ONBOARDING records are copied into `ai_setup_responses.answers.legacy`, confirmed keys only.

### Tests and evidence

- **Unit:** `registry.test.ts` (generated per entry), masker and pseudonymiser schema test, evidence EN/AR/UR with negation, plan-validate, `effectiveClass` escalates only, outcome rules, setHash, `nextStepState` exhaustive, property tests via `forEachSeed` (no SUCCEEDED without a verified receipt; no B without a matching confirmation).
- **DB (55438):**
  - matrix shard W0 × 11 roles, with and without PRINCIPAL/ACCOUNTANT seats;
  - revoke between preview and execute; accessVersion bump gives BLOCKED_ACCESS with zero provider calls;
  - `arbitraryTenantPair`; replay; same key with different input gives 409; STALE;
  - SoD escalation gives a hand-off with no 403 dead end;
  - two claimers on one hand-off; forged completion gives 409;
  - credits charged once, including failed attempts, and never on a provider error with no tokens;
  - drain mode; P1 non-synthetic refusal; SKO-470 regression; legacy parity.
- **Browser (app 3106):** shell flows (ask, then confirm a typed op; ask, then a C typed op, then PreparedByAiPanel, then approve; "yes" typed does nothing; stale re-confirm; offline) at 390, 768 and 1440 in EN/AR/UR; `check:ui` passes.
- **Red-team suite skeleton** `tests/ai-workflows/red-team.database.test.ts`: injected record text asks for a class-C or cross-role write and gets zero effective writes.
- **Evidence README** with screenshots of all ten §4.2 states.

**Estimate: 105 days.** Assumes the architecture's platform estimate of ≈134 days minus the parts deferred to the role slices (questionnaire framework, sheet primitives, the remaining 22 resolvers), plus about 8 days of red-team additions.

**Depends on:** nothing. This slice is the base.

### Founder's browser checklist (Slice 1)

- [ ] ⌘K opens one palette on every console. On teacher pages the old palette is gone, not duplicated.
- [ ] As CAMPUS_ADMIN, "add a holiday on 12 Nov" shows a Task Card with provenance chips, a button "Add holiday · 12 Nov", a preview code, and a receipt with an Open link only after pressing.
- [ ] Typing "yes", «جی» or «نعم» next to a waiting card saves nothing, and the hint points at the button.
- [ ] As ACCOUNTANT on a campus with SoD required, "record Rs 12,000 cash for INV-…" shows "Prepared · with {name} · Preview XXXX". The approver sees the same code in Finance operations and approves there. The requester's card flips with the receipt.
- [ ] An operation the role cannot do shows "Your request was not sent anywhere" in EN, AR and UR.
- [ ] `/ai/can-do` shows a real count per role, with Not connected rows greyed and not hidden.
- [ ] The current questionnaire submits into a review list where nothing has run until Build. The onboarding copy promise is now true.
- [ ] Every screen shows the practice or demo badge.
- [ ] Closing the RunSheet mid-run and reopening it shows the same state. Nothing claims "Saved" before its receipt.

---

## 4. Slice 2: TEACHER (questionnaire framework, teacher sheet, top teacher requests)

**Goal.** Teacher is the biggest gap (151 capabilities, 4 reachable) and the best demo beat. Ship the per-role questionnaire framework here, as its first consumer.

**What the teacher sees.**
- First login extends `/teacher-onboarding` (`src/app/teacher-onboarding/page.tsx:47`) into three sheets of about 90 s, each resumable on its own.
- Known allocations come from records only, or "Not assigned yet".
- Build produces "4 saved · 1 draft (not applied) · 1 with your coordinator".
- On a 360 px phone in Urdu: "7B register · period 3" leads to typed absences with quotes, then the explicit **Mark the other 31 present**, then **Save register · 31 present, 2 absent**, then a receipt.
- Marks entry, homework, a leave application, a meeting window and a class test all work from free text.

**Capabilities connected: 24 entries (21 new; 2 extended).**
- **A (8):**
  - `profile.update_own` (extends `profile.update` with professional fields);
  - `personal.save_plan` and `work.save` (existing);
  - `marks_scan.create_template`;
  - `digests.prepare` (draft, not sent);
  - `resources.create` (DRAFT);
  - `read.teacher.today`;
  - `read.teacher.register_status`.
- **B (11):**
  - `attendance.save_register` (command extraction: the future-day check at `route.ts:52` and `notify(ATTENDANCE_SUBMITTED)` at `:54` move into the command, and the 409 conflicts at `:56` become questions);
  - `marks.enter_bulk` (inline extraction);
  - `assignments.create` (idempotency `no`, so natural reconcile);
  - `leave.apply` (inline extraction);
  - `meetings.open_window` (natural);
  - `exams.create` (inline extraction; the preview names the EXAM_CREATED notify);
  - `portfolio.create_entry`;
  - `activities.create`;
  - `reports.edit_remarks` (inline extraction);
  - `readiness.update_task` (task owned by the academic lead);
  - `corrections.request_mark` (DOMAIN_REQUEST; B for the requester).
- **C (5):**
  - `assignments.release` (C-self DOMAIN_SCREEN);
  - `digests.send` (C-self, on the digest review screen);
  - `resources.publish` (C-self);
  - `chat.send_message` to families (C-self compose);
  - Exam Studio DEEP_LINK (existing).
- Extractions: 5. Screen hooks: 4 (homework release, digest review, resources, chat compose).

**Teacher coverage** rises from 4 of 151 to about 26 of 151, per the generated count. The demo copy must use the generated number.

**Files.**
- `src/lib/ai-workflows/questionnaire/{types,compile,prefill,readiness,free-text}.ts` and `roles/teacher.ts`.
- `src/app/api/ai-workflows/questionnaire/[key]/route.ts`: the definition is resolved server-side from the live role; a URL key mismatch returns 404 (RT14).
- `src/lib/attendance/save-register-command.ts`, `src/lib/marks/enter-bulk-command.ts`, `src/lib/leave/apply-command.ts`, `src/lib/exams/create-command.ts`, `src/lib/reports/edit-remarks-command.ts`.
- `registry/domains/c4/*` and `c5/attendance.ts`.
- Resolvers: assignment, exam, meetingWindow, leaveType.
- UI: `WorkspaceSheet`, `KnownFactStack`, `WillCreateDiff`, plain-ribbon Build, `WorkspaceReady` (`/ai/setup/[runId]`), the `roster-exceptions` TaskCard field, `ui/Stepper`, `ui/TagList`, `ui/AvailabilityGrid`.
- `useAskContext` on the register, marks, class, student and teacher Today pages.

**Migrations:** none. If the homework release row needs `workflow_handoff_id` for P7, add `20261103000000_ai_workflows_teacher_handoff_refs`.

**Tests.**
- Golden HTTP tests, byte-equal, for 5 extracted routes, plus the AI-path future-day rejection and exactly one `ATTENDANCE_SUBMITTED`.
- Natural kill tests for assignments and meetings: the result is RECONCILED or UNCERTAIN, never a double apply.
- Bare "mark all present" produces a count question and is never auto-applied.
- Teacher matrix shard, including a foreign class giving SCOPE and zero rows.
- Questionnaire tests: compile for each answer combination; version edit gives a step diff; a second tab gives the same job (partial unique); no fabricated allocations; RT14 11×11.
- Browser: teacher sheet plus the Urdu register at 390, marks at 768, and RTL Nastaliq ledger rows.
- Evidence: an on-stage timer screenshot of the register beat.

**Estimate: 33 days.** Questionnaire framework 8, sheet primitives and UI 6, teacher definition 1.5, entries 9.5, resolvers 2, context chips 1.5, tests and evidence 4.5.

**Depends on:** Slice 1. Founder decision D1 (teacher register is B, operator bulk register is C).

**Red-team controls for this slice:**
- P3 per-pupil evidence; never infer "rest present" from server roster text;
- negation guard goldens in Urdu ("علی غیر حاضر نہیں");
- relative-date binding at request time, with a STALE day-rollover reason;
- RT14 questionnaire key binding;
- the teacher never assigns herself.

### Founder's browser checklist (Slice 2)

- [ ] First teacher login: profile steps, then assignment check, then focus areas. Every sheet can be left and resumed.
- [ ] A teacher without allocations sees "Not assigned yet". The coordinator receives a task.
- [ ] The Urdu register on a phone takes about 20 s. Unmentioned pupils stay "not marked" until the explicit press.
- [ ] "Enter marks for 8A maths test: Ali 18, Sara 20" previews those marks against the roster and saves after one press.
- [ ] "Release the homework" opens the Homework screen prefilled, and the teacher presses Release there.
- [ ] A free-text request for a teacher feature that is not connected yet shows the honest NotYetCard.

---

## 5. Slice 3: ADMIN and CAMPUS_ADMIN (questionnaire replaces today's)

**Goal.** Replace GuidedSetup's 18 free-text keys (`guided-setup.tsx:176-224`, `onboarding.ts:17-36`) with typed per-role sheets and the Build ceremony.

**What the admin sees.**
- The Known-fact stack (school, timezone, session, weekend), then the grade grid, subject matrix, period builder, rooms and staff table.
- `WillCreateDiff` with three articles, then **Build my workspace**.
- The CharterLedger inks one row per receipt. The SealSlot presses only when every A/B row has a receipt.
- WorkspaceReady lists Created · Pending · With others · Not connected · Later.
- The wizard's year is never asked again.

**Capabilities connected: 18 new entries, plus the W0 setup variants.**
- **B (12):**
  - `fees.create_fee_group`, `fees.create_fee_type`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount` (all inline-prisma with idempotency `no`: extraction plus a natural reconcile; these are shared with Slice 5);
  - `leave.create_type`, `leave.create_allocation` (extract);
  - `chat.update_school_settings` (extract);
  - `imports.stage_batch` (extract), then `students.create` after the staged review, with `inviteAccounts:false`;
  - `staff.apply_hierarchy_preset`;
  - `academic.cycle.create` (DRAFT, only when there is no cycle).
- **C (6):**
  - `staff.invite` delivery and `staff.resend_invitation` (DOMAIN_SCREEN Staff & invites);
  - `guardians.change_access`;
  - `admissions.decide_application`;
  - `leave.review`;
  - `fees.send_due_reminder`.
- **ROLE_TASKs:** year activation goes to PRINCIPAL (or self when the seat is vacant); class teachers go to PRINCIPAL when that seat is held.
- Free-form admin requests ("Add Grade 11 with 2 sections", "Invite 3 teachers", "Add a holiday") use W0 variants plus these entries.
- Extractions: 10. Hooks: 3 (Staff & invites, Guardians & access, Leave approvals).

**Files.**
- `questionnaire/roles/{admin,campus-admin}.ts`.
- Onboarding primitives: `GradeSectionGrid`, `SubjectMatrix`, `PeriodBuilder`, `RosterTable` (routes only through the `importBatch` review token), `MoneyLines`.
- `BuildBoard` on `.sk-ink-cover`/`CharterLedger`/`SealSlot`, with `chunkGroup` aggregated rows ("30 of 48 saved").
- `src/lib/fees/*-command.ts`, `src/lib/leave/*-command.ts`, `src/lib/chat/settings-command.ts`, `src/lib/imports/stage-batch-command.ts`.
- Retire: setup-generation POST returns 410 behind the flag; `SetupGenerationPanel`, `SetupRunPanel` and `SetupActionsPanel` are unmounted.
- `dashboard.ts:73-85` switches to `AiSetupResponse.status` plus readiness.
- The copy fix at `src/app/onboarding/page.tsx:34` in EN/AR/UR, **in this slice**.

**Migrations:** `20261104000000_ai_setup_definitions`, only if the legacy-answer data step needs a v2 mapping beyond Slice 1's. Otherwise none.

**Tests.**
- Golden tests for 10 extractions.
- Compile tests for every question × seat state:
  - with and without ACCOUNTANT, so fees run only when the admin holds the desk;
  - with and without PRINCIPAL, for the ROLE_TASK;
  - no cycle versus an existing cycle (`existingCycleId`).
- A 90-class / 720-subject capacity fixture: DB plus browser, chunked sheets, `setHash` across chunks.
- Duplicate Build from two tabs gives one job.
- Credit exhaustion mid-Build gives PAUSED_CREDITS on model-fill steps only, while deterministic steps continue.
- Dependent steps BLOCKED{cause} while independent steps continue.
- Browser: admin build at 1440, campus-admin at 768, Arabic RTL at 390, reduced motion on and off, and `expectNoPrematureDone` on every ledger row.

**Estimate: 27 days.** Definitions 3, primitives and BuildBoard 6, retirement and copy 2, entries 10, capacity fixture 1.5, tests and evidence 4.5.

**Depends on:** Slice 2 (questionnaire framework).

**Red-team controls for this slice:**
- batch caps versus the 25-step model cap: QUESTIONNAIRE plans are exempt and use `chunkGroup`;
- the duplicate-job partial index;
- answer and definition version locks (N-1 kept for 14 days);
- the accessVersion split: the questionnaire opens only after the password and MFA gates; `credentialVersion` is separated from access-reducing changes; "Continue as me" re-pins;
- seats count accepted and active holders only.

### Founder's browser checklist (Slice 3)

- [ ] A fresh standalone admin never sees the academic year question. **All correct** ticks the known facts.
- [ ] Each typed answer drives the live "will create" diff. A skipped fee question shows ghost rows.
- [ ] Build inks rows only as receipts arrive. The heading reads "Mostly set up: N things are with other people" while anything waits.
- [ ] Invitations read "pending until accepted · 0 accepted" and never "sent".
- [ ] Editing one answer after Build re-builds only the delta.
- [ ] A campus admin on a campus with a principal sees "Activate year → with {principal}".

---

## 6. Slice 4: PARENT and STUDENT

**Goal.** Families and students get short warm sheets (about 60 s and 90 s) and their top requests.

**What they see.**
- Parent: pending invitations as native Accept / Not me cards; children from verified links only; language and channel; open absences explained; a meeting booked.
- Student: "My study plan", a private goal, a counsellor appointment "requested", a portfolio entry "sent for teacher review".

**Capabilities connected: 26 new.**
- **PARENT (15):**
  - A: `profile.update_own` (language), `personal.save_plan`, `read.parent.child_attendance`, `read.parent.dues`;
  - B: `canteen.set_spend_limit`, `canteen.record_dietary` (NEEDS_CONFIRMATION), `family.meeting`, `parent.explain_absence`, `family.request_leave`, `family_activities.request_place` (wrapper);
  - C-self DOMAIN_SCREEN: phone change on the profile screen with step-up (RT15); `communications.set_guardian_channel_preference` opt-out (default C-self, decision D-S4); `chat.start_direct` plus `chat.send_message` to the office; `pickup.issue_authorization`; `fees.start_online_payment` (DEEP_LINK);
  - native, never AI: `parent.accept_invitation`, `family.trip_consent`.
- **STUDENT (11):**
  - A: `pathways.save_goal` (private variant), `pathways.add_action`, `study.ask`, `read.student.assignments`, `read.student.attendance`;
  - B: `pathways.save_goal` (audience variant), `pathways.request_appointment`, `portfolio.create_entry` (from Slice 2), `assignments.save_learner_draft`, `assignments.submit`;
  - C: `study.request_help` (COMMUNICATION).
- Extractions: 0 (all direct or wrapper). Hooks: 4 (profile phone, chat compose, pickup, preferences).

**Files.**
- `questionnaire/roles/{parent,student}.ts`.
- `invitationCard` and `consentCard` widgets that render the existing native controls.
- Resolvers: guardianChild (verified only), meetingWindow, assignment (reused).
- `pii/care-detector.ts` (EN/AR/UR keywords lead to the care deep link and store nothing).
- `AiCapabilityGap` stores no text for these roles.
- Per-role credit caps in `jobs/credits.ts`.

**Migrations:** none expected.

**Tests.**
- The guardian `own-child` scope with each permission (attendance, fees, communication, pickup, results).
- A non-verified link gives SCOPE.
- `identitySensitive` fields are never prefilled from parent hand-offs (RT11).
- A child-safety phrase leads to the care link with zero segments stored.
- Student cannot request corrections (`corrections/service.ts:306`) and is routed to an office task.
- Per-role caps hold.
- Browser: Arabic parent at 390 (sheets, absence note, "pending school review"); Urdu student at 390.

**Estimate: 18 days.** Definitions 3, entries 7.5, hooks 2, resolvers 1.5, care detector and caps 1, tests and evidence 3.

**Depends on:** Slice 2 (framework, `portfolio.create_entry`), Slice 3 (guardian hand-off screen hook).

**Red-team controls:** RT11, RT15, RT19, RT7c family and student caps; the parent beat must not imply a family message from the school.

### Founder's browser checklist (Slice 4)

- [ ] A parent with an unverified child link sees "Ask the school office", never a self-link.
- [ ] "Hamza is absent tomorrow" leads to a B card and then "Absence note · pending school review".
- [ ] "Change my phone" opens the profile screen with step-up. The AI does not change it.
- [ ] Trip consent and invitation acceptance are only ever the parent's own tap.
- [ ] A student goal stays private until the audience confirm. The appointment reads "requested".

---

## 7. Slice 5: ACCOUNTANT

**Goal.** The accountant sheet sets up books and fee structure. Free-form money requests become safe hand-offs.

**What the accountant sees.**
- Sheet (about 5 min): fee heads prefilled from the admin's draft, a class fee grid, the late fee rule, and discount types.
- "Record a cash payment" opens the Collect desk prefilled and claimed. The same code appears on both screens and nothing can double-post.
- "Who owes more than 2 months?" is answered from templates.

**Capabilities connected: 16 new.** The fee setup ×6 entries are reused from Slice 3.
- **B (6):**
  - `accounts.create_account`, `accounts.create_bank_account` (names only), `accounts.create_payment_method` (all inline extraction, idempotency `no`, natural reconcile);
  - `tax.save_package_draft`;
  - `fees.assign_discount` (extract; per-student evidence);
  - `payroll.set_employee_details`, non-bank fields only (bank fields excluded to the native form).
- **C (8):**
  - `fees.collect_payment` (DOMAIN_SCREEN with claim; wrapper `…Core`);
  - `fees.request_adjustment` (DOMAIN_REQUEST);
  - `fees.generate_monthly_invoices`;
  - `fees.propose_payment_plan`;
  - `tax.request_signoff`;
  - `imports.commit_bank_statement` (DEEP_LINK);
  - `fees.post_bank_reconciliation`;
  - `payroll.prepare_run` (ROLE_TASK chain, SKO-434).
- **A (2):** `read.fees.defaulters`, `read.fees.collection_summary`.
- Extractions: 4. Hooks: 3 (Collect, Invoices preview, Adjustments).

**Files.**
- `questionnaire/roles/accountant.ts`.
- `src/lib/fees/collect-command.ts`: refuses a payment without the hand-off when an OPEN or CLAIMED hand-off exists for the invoice (RT6).
- `src/lib/accounts/*-command.ts`.
- Resolver: invoice (masked numbers).
- PreparedByAiPanel on Invoices and Adjustments.

**Migration:** `20261105000000_ai_workflows_payment_handoff`. Adds a nullable `payments.workflow_handoff_id` with `UNIQUE (school_id, workflow_handoff_id)`, and the same column on adjustment-request rows.

**Tests.**
- Two claimers give one payment.
- Claim expiry: warned at 13 min, re-acquirable by the same user only.
- A payment typed directly on Collect while a prepared hand-off is open is refused.
- Forged "Mark as done here" with an unrelated payment gives 409.
- SoD REQUIRED between preview and confirm gives an automatic hand-off.
- Account numbers and IBAN never reach a prompt (`scanForPII` on the serialised prompt).
- Golden tests for 4 extractions.
- Browser: accountant laptop to approver tablet, round trip at 1440 and 768, EN plus UR.

**Estimate: 15 days.** Definition 1.5, entries 6, hooks 1.5, Collect claim hardening 2, tests and evidence 4.

**Depends on:** Slice 3 (fee setup entries), Slice 1f (claim).

**Red-team controls:** RT5, RT6, RT10 (requester views are status-only; amounts are hidden from requesters outside scope), "SoD filled mid-plan".

### Founder's browser checklist (Slice 5)

- [ ] The fee grid from the admin draft is marked "from {admin}'s setup".
- [ ] Payment hand-off: the approver sees "Prepared by AI", the verbatim request, the code and their own Approve button. There is no Approve in notifications.
- [ ] A second device trying the same prepared collection sees "Being handled by …".
- [ ] The first invoice run is offered only as a prepared preview for the person who applies it.

---

## 8. Slice 6: LIBRARIAN and RECEPTIONIST

**Goal.** Two desk roles, both high-frequency and demo-friendly.

**What they see.**
- **Librarian:** loan rules (money fields stay 0 until approved), sections and first titles. "Issue Atlas to Ayesha 7B" gives an issue receipt with the due date. Return shows the computed fine in the preview. Renew and reserve work.
- **Receptionist:** open callbacks, post, enquiries and visitors carried in from today only. Check-in and check-out, enquiries and complaints (a confidential complaint returns a reference code only).

**Capabilities connected: 32 new.**
- **LIBRARIAN (16):**
  - B: `library.desk_issue_copy` (natural, `desk.ts:95`, 409 at `:112-113`), `library.desk_return_copy` (D6 override: B with the fine shown), `library.desk_renew_loan` (natural, reconciled on renewal count), `library.desk_reserve_title`, `library.desk_lookup_expire_holds`, `library.desk_add_copies`, `library.desk_save_rules` (variant with money fields fixed at 0), `library.member_create`, `library.book_update`, `purchasing.save_request` (DRAFT);
  - A: `library.category_create` (extract), `library.book_create` (extract; ISBN merge; replaces `library.create_books`), `read.library.overdue`;
  - C: `library.desk_save_rules` (money variant, goes to CAMPUS_ADMIN), `library.desk_mark_lost`, `library.desk_decide_charge`.
- **RECEPTIONIST (16):**
  - A: `front_desk.postal_log`, `front_desk.certificate_preview`;
  - B: `front_desk.visitor_check_in` (namesake 409 becomes a choice), `front_desk.visitor_check_out`, `front_desk.callback_complete`, `front_desk.callback_reschedule`, `enquiries.create` (extract plus natural reconcile; the route is not idempotent), `enquiries.update` (extract), `admissions.start_application`, `admissions.save_answers`, `front_desk.complaint_intake`, `front_desk.certificate_template_save`;
  - C: `front_desk.certificate_issue`, `front_desk.complaint_assign`, `pickup.gate_release`, certificate template approve.
  - `leave.apply` is reused from Slice 2.
- Extractions: 5. Hooks: 3 (charge decisions, template approval, pickup).

**Files.**
- `questionnaire/roles/{librarian,receptionist}.ts`.
- `registry/domains/c7/{library,front-desk}.ts`.
- Resolvers: libraryMember, libraryCopy, bookTitle, visitor, enquiry.
- `library.add` tightening on top of `canManageLibrary` (`scope.ts:260-262` admits PRINCIPAL), listed in `tightenings.ts` with a ticket.

**Migrations:** none.

**Tests.**
- Kill tests between service commit and intent flip for issue, renew (count) and enquiry: RECONCILED or UNCERTAIN, and reconcile matches only rows the actor created (RT17).
- Return-fine preview hash changes when the policy changes, giving STALE.
- Waivers are always C.
- Confidential complaint receipt contains no names.
- Browser: librarian phone EN, receptionist tablet Arabic.

**Estimate: 19 days.** Definitions 3, entries 9, resolvers 2.5, kill tests 1.5, tests and evidence 3.

**Depends on:** Slice 1, and Slice 2 for `leave.apply`.

**Red-team controls:** RT17, RT12 (amounts and dates decisive); care concerns never AI (`/care`); no fabricated history.

### Founder's browser checklist (Slice 6)

- [ ] "Issue LB-0042 to Ayesha Khan (7B)" shows a button with the due date, then a receipt.
- [ ] "Return LB-0042" shows the policy fine in the preview, and the fine cannot be edited.
- [ ] "Waive the fine" goes to the campus admin.
- [ ] A visitor namesake asks "which one". A confidential complaint shows only a reference code.
- [ ] "Publish the Grade 9 results" as librarian reads "done by the principal … not sent anywhere".

---

## 9. Slice 7: PRINCIPAL

**Goal.** Academic lead sheet (about 4 min) and the top academic requests. Exam Studio stays the owner of syllabus, paper and seal.

**What the principal sees.**
- Allocations, missing subjects, workload caps, DRAFT timetables, an exam session plan and a grading DRAFT.
- Year activation and timetable publish stay on their own screens.
- "Cover Ms Noor, periods 2-4" works.
- "Open Exam Studio for Grade 9 Physics" deep-links.

**Capabilities connected: 17 new.**
- **B (11):**
  - `academic.class.assign_teacher` (seat re-checked);
  - `academic.subject.create`;
  - `academic.subject.assign_teacher`;
  - `staff.set_workload_capacity`;
  - `timetable.create`;
  - `exams.session.create` (wrapper);
  - `exams.invigilation.assign` (`expectedHash`);
  - `academic.model.create_draft` (extract);
  - `improvement.create_framework`;
  - `staff.propose_cover`;
  - `learning_actions.save_draft`.
- **C (6):**
  - `corrections.decide_mark`;
  - `learning_actions.activate`;
  - `academic.model.activate` (the adapter adds the GRADING lock check);
  - `reports.approve_versions` (DEEP_LINK);
  - `exams.datesheet.publish` (Exam Studio DEEP_LINK);
  - `exams.principal_review` (DEEP_LINK).
- `leave.review` is reused from Slice 3.
- ROLE_TASK to CAMPUS_ADMIN for periods, rooms and holidays.

**Files.** `questionnaire/roles/principal.ts`, `registry/domains/c1/*` and `c4/*`, lint 14 enforcement for Exam Studio-owned keys.

**Migrations:** none.

**Tests.**
- Seat-change mid-plan escalation.
- Exam Studio keys accept only DEEP_LINK (lint).
- `exam-authority.mayApprove` is never routed through the registry.
- Golden test for the model draft extraction.
- Browser: principal at 1440 EN and 768 UR.

**Estimate: 14 days.** Definition 1.5, entries 7, ROLE_TASK flows 1.5, tests and evidence 4.

**Depends on:** Slices 2 and 3.

**Red-team controls:** "SoD or seat filled mid-plan"; Exam Studio non-duplication (lint 14).

### Founder's browser checklist (Slice 7)

- [ ] The principal sheet never asks for periods or rooms; those go to the campus admin as a task.
- [ ] "Draft timetables for Grades 6-8" gives DRAFT receipts. Publish is a prepared item on Timetable & cover.
- [ ] Any paper, syllabus or seal request deep-links to `/ai/studio`.

---

## 10. Slice 8: SUPER_ADMIN and APP_OWNER

**Goal.** The group path, from wizard to group sheet to GroupLaunchBoard, fixing the dead end at `setup-role.ts:6-8`. Plus an operator owner desk.

**What they see.**
- **SUPER_ADMIN:** campuses created inside plan capacity; standards drafted and "submitted, not live"; leader invitations prepared for them to send with MFA. Each campus tile tracks that campus admin's own sheet.
- **APP_OWNER:** an owner-desk checklist, audited institution fixes, and a pilot charter DRAFT. Pricing, capacity, provisioning and Stripe are prepared items only.

**Capabilities connected: 25 new.**
- **SUPER_ADMIN (16):**
  - B: `campus.create` (rebuilt on `addCampus.ts`, so the `isGroupConsole` divergence at inventory line 1003 is fixed), `campus.update_details` (server action), `group_policy.create_template`, `group_policy.save_draft`, `group_policy.submit_for_review`, `identity.add_domain` (pending);
  - A: `subscription.preview`, `readiness.view`;
  - C: `group_policy.review_version`, `group_policy.decide_override`, `memberships.change_access`, `subscription.request_plan_change`, `staff.deactivate`, `governance.support_grant_decide`;
  - reused: `staff.invite`, `staff.apply_hierarchy_preset`, `leave.*`, `chat.update_school_settings`.
- **APP_OWNER (9):**
  - B: `platform.pilot_create`;
  - C: `platform.capacity_apply_policy` (red-team override), `platform.resolve_provider_event`, `platform.subscription_request_review`, `platform.provision_school`, `platform.update_school_plan_status`, `platform.set_default_plan_pricing` (add the missing audit row first), `platform.payment_connect_onboarding` (DEEP_LINK), `platform.session_terminate`;
  - existing: `platform.inspect`, `platform.update_institution`.

**Files.** `questionnaire/roles/{super-admin,app-owner}.ts`, `GroupLaunchBoard` (on `CampusPlan` and `CapacityMeter`), `registry/domains/c8/*`.

**Migrations:** none expected.

**Tests.**
- RT13: a cross-campus pair in one step is refused. Seats are computed for `step.campusId`. `allowedSchoolAiOperations` takes the target campus.
- RT9: the worker never claims APP_OWNER jobs. A support-grant cookie gives 403 and no pickup. `unscopedReason` comes from the registry only and is audited.
- No-campus jobs work.
- Browser: group path at 1440 and 768.

**Estimate: 19 days.** Definitions 3, entries 8, GroupLaunchBoard 3, RT9/RT13 hardening 2, tests and evidence 3.

**Depends on:** Slice 3 (campus-admin sheet for the tiles).

**Red-team controls:** RT9, RT13; billing, capacity and credit changes are class C.

### Founder's browser checklist (Slice 8)

- [ ] A group owner adds 3 campuses. The tiles show Campus ✓, then invitation prepared, then pending, then accepted, then that admin's sheet progress.
- [ ] Standards read "submitted, not live" until the named reviewer approves.
- [ ] As owner, a pricing change is a prepared item that needs step-up MFA on the Pricing screen.

---

## 11. Slice 9: LEAP demo arc, release-gate evaluation, performance and operations

**Goal.** A rehearsable five-minute arc on a synthetic tenant, with a fallback for every beat, evaluation cases, and production-grade throughput.

**Content.**
- **Demo tenant.** Extend `scripts/demo/seed-*` into "Al-Noor Grammar, Lahore": two accepted teachers, verified parent links, invoices. Pre-recorded completed runs can be reopened from RunHistory. The persistent "Demo school · synthetic data" badge.
- **Fallback arc** per UX §10.3, scripted and tested.
- **Live smoke** `scripts/ai-workflows/live-smoke.ts`, run with `AI_WORKFLOWS_LIVE=1`:
  - 66 role × language cases plus 40 negatives: injection in a book title, announcement or leave reason; "mark everyone present"; "approve and send"; an unmatched Arabic-script name egress probe;
  - metrics: recall ≥95%, precision ≥90%, wrong-class effective writes = 0, PII egress hits = 0, p95 latency.
- **Release gate.** Add the cases to `AI_EVALUATION_CASES`. `CURRENT_AI_RELEASE_EVALUATION` stays null until an educator-reviewed run is recorded.
- **Performance.**
  - Run units on the existing BullMQ queue with per-school concurrency and a global OpenAI token bucket.
  - Redis pub/sub for events in production.
  - 429 and 5xx become PAUSED_PROVIDER with backoff and no charge.
  - A load test with 200 schools and 6,000 jobs as a gate.
  - Measure the card and token budget, and shrink to 12 cards if the budget fails.
- **Operations.** Metrics (plan p50/p95, calls per job, UNCERTAIN count, hand-off age, reservation leakage, sweep lag), retention cron verification, hand-off 14-day expiry, axe and live-region assertions in the Build spec, ICU plurals, and a 23-row RTL ledger screenshot at 360.

**Estimate: 22 days.** Seed and fallbacks 4, live smoke and red team 5, evaluation wiring 1, BullMQ and token bucket 4, load test 3, observability 2, full Playwright matrix and rehearsal evidence 3.

**Depends on:** Slices 2 to 5 for the primary arc. Slices 6 to 8 are only needed for the librarian beat and the closing count.

### Founder's browser checklist (Slice 9)

- [ ] The full 5:00 arc on laptop 1440, tablet 768 and phone 390 runs twice in a row on a fresh seed.
- [ ] With the network cut, the presenter reopens the recorded run. Nothing is faked and the OfflineBanner stays honest.
- [ ] The evaluation report shows wrong-class effective writes = 0 and PII egress = 0.

---

## 12. Totals

| Slice | Content | New entries (≈) | Extractions | Hooks | Migrations | Days |
|---|---|---|---|---|---|---|
| 1 | Platform, shell, W0 | 40 | 0 | 2 (runs, finance ops) | `20261102000000_ai_workflows_v2` | 105 |
| 2 | TEACHER and questionnaire framework | 21 | 5 | 4 | optional `20261103…` | 33 |
| 3 | ADMIN / CAMPUS_ADMIN | 18 | 10 | 3 | optional `20261104…` | 27 |
| 4 | PARENT / STUDENT | 26 | 0 | 4 | none | 18 |
| 5 | ACCOUNTANT | 16 | 4 | 3 | `20261105000000_ai_workflows_payment_handoff` | 15 |
| 6 | LIBRARIAN / RECEPTIONIST | 32 | 5 | 3 | none | 19 |
| 7 | PRINCIPAL | 17 | 1 | 1 | none | 14 |
| 8 | SUPER_ADMIN / APP_OWNER | 25 | 0 | 2 | none | 19 |
| 9 | Demo, evaluation, performance and operations | 0 | 0 | 0 | none | 22 |
| **Planned slices** | | **≈195** | **25** | **22** | | **272** |
| Post-LEAP waves W3/W4 | Operator nav long tail, then gap-demand order; mostly C hand-offs (≈485 keys) | ≈485 | ≈90 | ≈28 | per domain | ≈125 |
| **Programme** | | **≈680** | | | | **≈397** |

**Calendar warning.** 272 person-days on one sequential agent is about 55 working weeks, which does not fit LEAP 2027.

**The LEAP-critical path is ≈158 days**, in this order:

| Part | Days |
|---|---|
| Slice 1, lean: router and AST provenance polish deferred to W3, SSE replaced by polling | 92 |
| Slice 2 | 33 |
| Slice 3, without the 90-class capacity UI polish | 24 |
| Slice 4, parent half only | 9 |
| Slice 9, seed, fallbacks, smoke | ≈10 |
| Accountant Collect beat | covered by W0 `finance.apply_operation` RECORD_APPROVAL, per UX §10.1 |

Meeting LEAP needs either that cut or parallel agent sessions after Slice 1c, when the registry and lint make domain entries independent. That is a founder decision.

---

## 13. Reconciliations decided in this plan (where the inputs disagreed)

| Topic | Inputs said | This plan |
|---|---|---|
| Pseudonymiser fix | Architecture: person-key allow-list | Red team RT1: deny by default with `CLEAR_KEYS` plus a schema test (fail closed) |
| Parent phone and channel opt-out | Questionnaire / UX D6: B | RT15: C-self DOMAIN_SCREEN with step-up. The founder may lower opt-out alone to B through a reviewed override |
| `platform.capacity_apply_policy` | Questionnaire: B | RT9: C |
| Class-C prepare | Architecture: plan step creates the hand-off | RT4: needs the requester's B "send for approval" confirmation |
| Who executes B | Architecture: worker or request | RT8: only the confirming request |
| Routes | UX: `/api/automation/{id}/confirm` | `/api/ai-workflows/[jobId]/commands` only |
| Offline | Architecture: queue commands offline | RT: draft only, no command queue |
| Migration timestamp | `20261024000000` | `20261102000000` (after Exam Studio S8) |
| Questionnaire step cap | 25-step plan cap | Deterministic QUESTIONNAIRE plans are exempt; `chunkGroup` is used |
| Credits on provider failure | D4: charge failed actions | Charge only when the provider returned tokens > 0; outages pause |


**Key decisions**
- Merge current dev (bfa756b8, with Exam Studio PRs #42-#49 and migrations to 20261101100000) into the existing feat/ai-full-role-automation branch (8ffc312b, on 954b7285) before Slice 1. Timestamp all new migrations after 20261101100000, starting with 20261102000000_ai_workflows_v2.
- Slice 1 is one gated slice delivered as eight stacked sub-PRs (1a harness and inventory, 1b PII, 1c registry and lint, 1d runtime, 1e protocol, 1f classes and hand-offs, 1g UX shell, 1h cutover), each green on its own behind AI_WORKFLOWS_V2.
- The questionnaire framework ships in Slice 2 with TEACHER as its first consumer. ADMIN/CAMPUS_ADMIN (Slice 3) replaces GuidedSetup's 18 keys and retires setup-generation.
- Red-team controls win over the questionnaire and UX class choices: the pseudonymiser denies by default with a CLEAR_KEYS allow-list; parent phone and channel changes are C-self; platform.capacity_apply_policy is C; class-C prepare needs a B confirmation; B executes only in the confirming request.
- Sixteen cross-slice controls (P1-P16) land in Slice 1 before any role slice: server-enforced practice mode, evidence by default, input-bound confirmations, exhaustive state enum, credit attempt logging and caps, unit deadlines, localised error codes, no offline command queue, drain-mode flag-off.
- Fee setup entries (×6) are extracted in Slice 3 because the admin feePlan needs them; Slice 5 reuses them and adds the Collect hand-off, hardened with a payments.workflow_handoff_id unique column.
- inventory-to-json must emit server-action and existing-tool keys (campus.create, campus.update_details, platform.update_institution, personal.save_plan, work.save), which are absent from Appendix A's tables, so coverage.md ratchet maths reproduce.
- All routes standardise on /api/ai-workflows. Legacy /api/automation POST returns 410 and GET stays read-only for one release.
- Charge one credit per AI action only when the provider returned tokens; log every attempt at zero credit; provider outages pause rather than fail.
- The LEAP-critical path is a cut of about 158 days (lean Slice 1, Slice 2, most of Slice 3, the parent half of Slice 4, the demo part of Slice 9); full planned slices total 272 days, and the whole programme about 397.

**Risks**
- Schedule: 272 person-days on one sequential agent is about 55 weeks and misses LEAP 2027. Even the about 158-day LEAP-critical cut needs either scope cuts or parallel agent sessions after Slice 1c.
- Slice 1 is very large (105 days). Integration risk is concentrated before any role value ships; sub-PR ordering and the AI_WORKFLOWS_V2 flag must hold so dev never regresses.
- Merge drift: the branch is 65 commits behind dev. Exam Studio migrations and pseudonymiser callers must be re-tested after the P2 inversion, or Exam Studio prompts could change behaviour.
- Inline-prisma extractions (25 in planned slices) carry golden-test parity risk. Routes with post-commit notify (attendance register) can double-notify if side effects are not moved exactly once.
- natural-mode adapters (issue, renew, enquiry, assignments, meetings, fee setup with idempotency 'no') can produce UNCERTAIN states that need human checks. Users may perceive UNCERTAIN as failure if the copy is weak.
- Strict json_schema support depends on the configured OPENAI_MODEL; the readiness probe will refuse jobs if production uses a model without it.
- Coverage counts are provisional until Slice 1a regenerates coverage.md. Demo copy ('connected to n of m') must use the generated number, not prose estimates.
- Class overrides from the red team (parent phone and opt-out C, capacity C) add hand-off friction to family and owner demos. The founder may want a reviewed lowering for opt-out.
- Practice mode is server-enforced: if the educator-reviewed evaluation is not recorded before LEAP, only the synthetic tenant shows real receipts, and real pilot schools see 'Example · not saved'.
- Isolated QA helper scripts are missing from disk (B.qa). Slice 1a must recreate them in scripts/qa/ or every DB and browser evidence run is blocked.
- Worker throughput at 200 schools depends on moving units onto BullMQ with a token bucket (Slice 9). Until then, background class-A progress is limited by the 24-per-sweep, 2-per-school default.

**Effort**: Person-days for one experienced implementer, isolated QA on 55438 available. Rates: B direct 0.25 d (0.35 d when idempotency is 'no'), wrapper 0.4 d, inline extraction 0.75 d, C back end 0.15 d, screen hook 0.5 d, resolver 0.5 d, questionnaire definition 1.5 d. The first week in a new domain runs about 40% slower, folded into each slice.

Slice 1, platform, shell and W0 (about 40 entries): 105 d
- 1a harness and inventory: 5
- 1b PII: 5
- 1c registry and lint: 18
- 1d runtime, migration and credits: 21
- 1e protocol and resolvers: 18
- 1f classes and hand-offs: 16
- 1g UX shell: 14
- 1h cutover and parity: 8

Role and closing slices:
- Slice 2 TEACHER, plus the questionnaire framework (21 new entries, 5 extractions): 33 d
- Slice 3 ADMIN/CAMPUS_ADMIN (18 new, 10 extractions, BuildBoard, capacity fixture): 27 d
- Slice 4 PARENT/STUDENT (26 new, care detector, caps): 18 d
- Slice 5 ACCOUNTANT (16 new, Collect claim hardening plus migration): 15 d
- Slice 6 LIBRARIAN/RECEPTIONIST (32 new, kill tests): 19 d
- Slice 7 PRINCIPAL (17 new): 14 d
- Slice 8 SUPER_ADMIN/APP_OWNER (25 new, GroupLaunchBoard, RT9/RT13): 19 d
- Slice 9 demo, evaluation, performance and ops (seed, fallbacks, live smoke with 106 cases, BullMQ token bucket, 200-school load test): 22 d

Totals:
- Planned slices: 272 d, about 195 new registry entries.
- Post-LEAP coverage waves W3/W4 (about 485 keys, mostly C hand-offs, about 90 extractions, about 28 hooks): about 125 d.
- Programme: about 397 d.
- LEAP-critical cut: about 158 d. That is lean Slice 1 (92), Slice 2 (33), Slice 3 without capacity polish (24), the parent half of Slice 4 (9) and the demo part of Slice 9 (about 10); the accountant beat uses the W0 finance.apply_operation hand-off.

Calendar: 272 days is about 55 weeks for one sequential agent. Meeting LEAP 2027 requires the cut or 3-4 parallel sessions after Slice 1c.
