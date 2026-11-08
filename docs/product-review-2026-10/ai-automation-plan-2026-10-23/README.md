> **Archived tracker note (29 October 2026):** Linear (SKO-) is now a read-only archive; Jira SKAI is the tracker of record (decision D6, `docs/product-review-2026-10/d6-tracker-of-record.md`). SKO references and Linear statuses below are historical. See `docs/archive/linear/` for the export and open-item crosswalk.

# AI Workflows and Role Setup — flagship plan, version 1, 23 October 2026

Two flagship features, one engine. Written for the founder first and the implementing session second. Everything in §2 and §4 was verified at file:line by the audit in Appendix B; everything in §5–§9 is design and is marked as such. Plain words throughout; the glossary in §0 is binding for the implementation.

Branch: `feat/ai-full-role-automation` (cut from `dev` at `954b7285`). Linear parent: SKO-545. Design docs: `design-architecture.md`, `design-ux.md`, `design-slices.md`, `design-differentiators.md`. Appendices: **A** capability inventory (700 rows + 154-row C9 supplement), **B** audit reader reports, **C** design candidates and judge verdicts, **D** per-role questionnaires, **E** red-team findings.

---

## 0. Words used in this document

| Word | Meaning here |
|---|---|
| **Capability** | One thing a role can do in the app that changes data: one row of Appendix A (e.g. `library.issue_copy`, `attendance.save_register`). 700 exist. |
| **Adapter** | The typed code that lets the AI run one capability: input schema + the existing service function + the gate + the confirmation class + how it replays safely + the receipt shape. Never a generic HTTP or SQL call. |
| **Registry** | The catalogue of all adapters, per domain, that the engine reads to know what a role may do. Today this is a hand-written object of 12 tools (`src/lib/automation/catalog.ts:28-57`). |
| **Typed operation** | One of the 15 reviewed school operations that already exist under `school.execute` (`src/lib/school-ai/execution.ts:33-49`), e.g. `academics.setup_year`, `fees.generate_invoices`. They become registry entries too. |
| **Gate** | The authorization check carried from the existing route: a permission flag (`students.add`), a predicate (`canLeadAcademics`), a seat rule (no principal on campus), a scope rule (own campus / own children). The adapter re-runs it; the model cannot. |
| **Confirmation class** | A static label on every capability, never chosen by the model. **A** = auto-run (reads, own profile, low-blast-radius creates). **B** = confirm-in-chat (school-structure writes; the user confirms the exact preview). **C** = route-to-domain-approval (money, publication, family messages, access grants, destructive changes; the AI prepares and hands off to the existing approval screen). |
| **Plan** | The persisted list of steps the AI proposes for one request or one questionnaire, with dependencies, each step bound to one capability and one class. Replaces today's one-action-at-a-time loop. |
| **Receipt** | The proof a step ran: record ids, counts, the domain's own receipt. A read or a saved draft is never a receipt for a write. |
| **Questionnaire** | The per-role first-login question set. Today only the ADMIN/CAMPUS_ADMIN campus questionnaire exists (18 free-text keys); the other ten roles get a free-text "interview" sentence. |
| **Seat** | Whether a campus has an active PRINCIPAL or ACCOUNTANT. Operators (ADMIN/CAMPUS_ADMIN) hold academic or finance tools only while that seat is vacant (`src/lib/school-ai/access.ts:84-89`). |
| **Honest outcome** | The job ends as `executed`, `answered`, `plan_saved` or (new) `awaiting_approval`; a job may never claim `executed` without a write receipt (`src/lib/automation/validation.ts:12-17`). |

---

## 1. The two features in plain words

**Feature 1 — AI Workflows.** A librarian types "issue Atlas of the World to Ayesha in 7B until Friday". The AI finds the copy and the member, shows "Issue copy LB-0042 to Ayesha Khan (7B), due 30 Oct", the librarian taps Confirm, the loan exists, the receipt links to the lending desk. A teacher types in Urdu "7B کی آج کی حاضری: سب حاضر سوائے علی اور سارہ" and gets a pre-filled register to confirm. An accountant types "record Rs 12,000 cash from Bilal's father for October" and the AI prepares the payment with the exact invoice and hands it to the finance approval screen, because money is class C. If the role does not have the feature, the AI says so plainly and names who does.

**Feature 2 — Per-role setup on first login.** A new standalone-school admin answers the school questions once (grades and sections, subjects per grade, working days, periods, rooms, staff list, fee heads) and watches the campus assemble: classes, subjects, periods, rooms, staff invitations, fee structure drafts, with a list of what still needs another person (accept invitations, approve fees). A new teacher answers teacher questions (my subjects, my sections, how I mark, when I am free) and lands in a workspace that already has their classes, a register, a marks book and a lesson-planning slot. A new parent confirms their children, preferred language, how they want to be told about fees and absences, and lands on a home page that already shows the right children. Each role's questionnaire asks only for facts the system does not already know and that drive a real record or preference.

Voice and document intake remain with SKO-460 and are not part of this plan. Exam papers, moderation and the Seal remain with Exam Studio (SKO-408); AI Workflows deep-links into `/ai/studio` and never duplicates it.

---

## 2. What Skoolee has today (verified)

### 2.1 Three AI layers already exist

1. **Gateway** — `src/lib/ai/openai.ts`: OpenAI as the default provider with a fail-closed policy, credits reserved and charged per action under a school lock, `Pseudonymizer` + PII egress scan on every prompt, a labelled no-key "prototype" fallback (`src/lib/ai/prototype.ts`), and a release gate that is currently closed because no educator-reviewed evaluation is recorded (`src/config/ai-release-evaluation.ts:3-7`, SKO-494).
2. **AI features** — 19 role-gated dashboard actions (`src/lib/ai/prompts.ts:6-28`: remarks, lesson plans, at-risk detection, fee recovery insights…) that produce reviewed drafts, never writes; the School AI workspace at `/ai` with 17 tabs (sources, curriculum, academic/timetable/announcement/exam/invoice plans, runs, policies, knowledge, history); the private assistant (chat + WORKFLOW drafts, never executes, `src/app/api/school-ai/assistant/route.ts:107-114`); Exam Studio.
3. **The automation engine** — `src/lib/automation/` (12 files, 476 lines, commit `954b7285`): durable jobs in `schoolAiRequest` rows, a two-call select→act loop per step, 12 role tools + the 15 typed operations, idempotent receipts, actor re-verification before and after every model call, a worker sweep every 5 s, and `AutomaticWorkspace` mounted on `/ai` for every role. Strengths worth keeping are listed in Appendix B.engine (last finding): layered idempotency, questionnaire version pinning, tool-switch guard, completion-class rules, tenant-context wrapping, audit rows for every write.

### 2.2 What each role can actually have the AI do today

| Role | Features in its navigation | Write capabilities it holds (App. A) | Reachable by AI today | What that means in practice |
|---|---|---|---|---|
| ADMIN / CAMPUS_ADMIN | ~45 leaves | ≈520–556 | 41 partial | Classes, students, rooms/periods, staff invitations, weekends/holidays, library titles, call log; finance/academic tools only while that seat is vacant |
| PRINCIPAL | ~25 | 249 | 15 partial | Timetable drafts/publication, substitutes, exam session plans, year transitions, curriculum topics, risk decisions |
| ACCOUNTANT | 9 | 110 | 8 partial | Invoices from existing fee groups; payments/credits/refunds/expenses/reconciliation proposals |
| TEACHER | 20 | 151 | 4 partial | Own profile, a private plan, a non-executable work plan. **No attendance, marks, homework, resources, leave.** |
| LIBRARIAN | 4 | 75 | 2 partial | Add catalogue titles only. No issue/return/renew/reserve/members. |
| RECEPTIONIST | 9 | 93 | 2 partial | Log a phone call only. No visitors, pickup, enquiries, complaints, post, certificates. |
| SUPER_ADMIN | 9 | 522 (as fixed role) | 38 partial | Create a campus. No delegation, approvals, standards, access. |
| APP_OWNER | 10 | 50 | 2 partial | Inspect institutions, edit name/city/website. |
| STUDENT | 13 | 37 | 1 partial | Own profile and a private study plan. |
| PARENT | 13 | 48 | 1 partial | Own profile and a private family checklist. No leave request, meeting booking, pickup, consent. |

Source: Appendix A totals and Appendix B.roles §(c). "Partial" means a typed path exists but does not cover the feature's normal use.

### 2.3 How the questionnaire flows today (Journey A)

Registration → institution wizard (`/onboarding`, writes School, Campus, an **ACTIVE AcademicCycle**, weekends, owner role; `src/lib/onboarding/setup-service.ts:369-425`) → standalone owners land on `/ai?setup=1`; **group owners go to `/setup/readiness` and never see a questionnaire** (`src/lib/school-ai/setup-role.ts:6-8`) → `GuidedSetup` asks 18 free-text keys (`src/lib/school-ai/onboarding.ts:17-36`) → on Finish, `AutomaticWorkspace` auto-starts one job with the confirmed answers appended as JSON (`src/lib/automation/service.ts:43-48`) → the select→act loop runs with no review screen.

What each answer produces today (Appendix B.ui §A6): `grades` → classes (yes); `workingDays` → weekends (duplicates the wizard); `resources` → rooms/periods (when explicit); `curriculum` → subjects (when named per class); `staff` → pending invitations (if the actor may manage memberships); `students` → students only if every row has name, roll, class, gender, guardian phone, address, city **and medical notes** (`src/lib/automation/role-actions.ts:6`), so prose answers become questions. `schoolName`, `country`, `timezone`, `campuses`, `academicYear/startDate/endDate`, `feePolicy`, `assessmentPolicy`, `communications`, `migrationSource`, `firstOutcome` produce nothing or only prompt context. Language, currency and enabled modules are not asked.

### 2.4 How free-form requests flow today (Journey B)

Only `AutomaticWorkspace` executes. The dashboard "AI assistant" views (`/teacher/ai`, admin and principal `?view=ai`) save insight drafts; the private assistant answers and may save a WORKFLOW draft; the chat dock is human messaging. Three "type to AI" surfaces with similar labels behave differently (Appendix B.ui §B1).

---

## 3. What to do right now

### 3.1 Decisions only the founder can make

Each has a default the implementation will take unless told otherwise. Trade-offs are in §13 (filled from the design synthesis).

1. **Confirmation classes are static per capability** (default: yes). The alternative — letting the model decide when to ask — contradicts the PRD rule that no chat phrase alone moves money or sends messages, and makes behaviour untestable.
2. **Class C stays with the existing approval screens** (default: yes; the AI prepares, previews and hands off with a deep link). The alternative — a second approval surface inside chat — duplicates SKO-470.
3. **The ADMIN questionnaire replaces today's 18 free-text keys with structured questions** and stops asking for the academic year the wizard already created (default: yes).
4. **Group schools**: campus admins get the campus questionnaire on their first login; the SUPER_ADMIN gets a group questionnaire (campuses, who leads each, standards) whose outputs are campus records plus invitations (default: yes).
5. **Curriculum intake has one owner**: Exam Studio for anything with a source document; AI Workflows keeps only typed topic lists (default: yes).
6. **Teacher attendance and marks from chat** are prepared per student with evidence and confirmed as a full register (class B), never "mark all present" (default: yes; PRD rule).
7. **Release gate**: schedule the educator-reviewed evaluation with automation cases before any live tenant; keep the gate closed until then (default: yes).

### 3.2 Placement map (what goes where)

| Surface | Owner | Role in this plan |
|---|---|---|
| `/ai` overview, `AutomaticWorkspace` | this plan | becomes the AI Workflows home (§5) |
| Role guide / showcase (`src/components/onboarding`) | SKO-397 | reused as the questionnaire companion (§5) |
| `GuidedSetup`, setup-generation, setup-actions, setup-journey | SKO-397 | replaced or reused per §6.9 |
| `SchoolAiRun` / `SchoolAiExecution` / preview hash / approvals | SKO-470 | reused as the execution and class-C hand-off substrate |
| Private assistant, voice, documents | SKO-460 | unchanged; later gets the same engine behind it |
| Exam Studio | SKO-408 | deep-linked, never duplicated |
| Permissions matrix, seats, scope predicates | existing | carried into every adapter gate unchanged |

### 3.3 The minimum that must ship for the demo

Filled from §9 after the design pass: Slice 1 (engine + classes + UX shell, nothing regresses) and the teacher slice.

---

## 4. Gaps and defects found (verified at file:line; details in Appendix B)

### 4.1 Coverage is structural, not incremental
- 658 of 700 capabilities have no typed path; six roles get **no** `school.execute` operation at all (`src/lib/school-ai/access.ts:70-77`).
- Each new tool today costs a schema entry, a catalogue gate, an adapter branch and a completion-class entry across four files (`schema.ts:10-23`, `catalog.ts:28-57`, `role-action-service.ts:13-51`, `validation.ts:13-14`). This does not scale to 700.
- ≈220 of the 700 capabilities live as inline Prisma in route handlers (Appendix A "inline-prisma"); they need extraction into `(user, input)` services before an adapter can call them.
- 34 nav features are gated by capability keys or nothing (messages, corrections, care, service desk, activities, approvals, people & access, billing, settings, the whole owner console); permission snapshots alone cannot authorise them — each adapter must carry its predicate (Appendix B.roles finding 2).

### 4.2 The engine's loop will not carry a flagship
- Tool and operation **descriptions never reach the model**; it chooses from bare names plus two hint sentences (`service.ts:123,127`).
- One action per step, no persisted plan, no dependency model, **30-step cap**; a full campus setup must fit in 30 actions and ~60 model calls (`service.ts:102,114,132`).
- **No confirmation class and no preview shown**: `previewSchoolAiExecution` is called only for its hash; everything executes on the next 600 ms tick, including guardian announcements and invoices (`service.ts:82-83,149-153`; `automatic-workspace.tsx:54`).
- `evidenceQuote` is an exact substring test over text that includes server-appended interview prose and JSON-escaped answers — too weak (quotes of server text pass) and too brittle (paraphrase, Arabic/Urdu, newlines fail) (`service.ts:42,48,152`).
- **Over-masking**: any key named `name` is a PERSON, so class and subject names become `[PERSON_n]` everywhere in the prompt, including inside the user's request (`src/lib/ai/pseudonymize.ts:37,77-84`; `catalog.ts:50-51`).
- `school.inspect` receipts carry unmasked student/teacher names into every later prompt and bloat the job row (`service.ts:68-69`; `assistant-catalog-service.ts:38-58`).
- Non-JSON model output is not repaired; no JSON mode is requested (`service.ts:128,134`; `openai-settings.ts:12-17`).
- Provider timeouts (12 + 45 + 25 s) exceed the route's `maxDuration = 60`; a lost invocation leaves the browser spinning for up to the 120 s lease (`[id]/route.ts:5`; `service.ts:26,93`).
- Worker throughput is at most 4 jobs per 5 s platform-wide (`worker.ts:8`; `outbox-worker.ts:46-49`).
- No memory across jobs; `unsupported` is free text only, so there is no data on which features users ask for (`service.ts:52,155`).
- Self-approval fails under a Delivery Policy with separation of duties and for refunds with `correctionSeparateApprover` (`service.ts:81`; `repository.ts:366-368`; `finance-operations-service.ts:94-98`).
- No cancel, no retention; failed/paused/blocked jobs stay DB status `PENDING` forever (`service.ts:166`).

### 4.3 The questionnaire does not generate the system
- Only ~6 of 18 keys produce records; fee structure, policies, communications preferences, language, currency and modules have no adapter (Appendix B.ui §A6).
- The wizard already created an **ACTIVE** cycle; `academics.setup_year` can only KEEP it on an exact label/date match (`academic-setup-service.ts:20-26`).
- On a campus with a principal, the admin's run stalls after classes: activation, subjects, allocations and holidays need an ACTIVE cycle and the academic seat (`access.ts:56,60,73-75,88`; `school-setup-academics.ts:28,54`).
- The wizard promises "nothing applies until you approve it" (`src/app/onboarding/page.tsx:34`); the job executes immediately.
- The legacy nine-draft generation is dead on the client but `SetupRunPanel` and the Today card still depend on it (`guided-setup.tsx:127-143`; `src/app/actions/dashboard.ts:73-85`).
- Confirmed `students`/`staff` prose (names, phones, addresses) is sent to the model, which the legacy path deliberately withheld (`service.ts:46-47` vs `setup-generation-service.ts:102-107`).
- Group owners never see a questionnaire; the SUPER_ADMIN workspace runs with no campus and only `campus.create` (`setup-role.ts:6-8`; `catalog.ts:33`).

### 4.4 Quality gates are missing
- `tests/automation/*` runs in no npm script and no CI workflow (`scripts/run-school-ai-tests.mjs:11`; `package.json:5-52`).
- No browser or HTTP test touches `/ai` `AutomaticWorkspace` or `/api/automation`; the component has no `data-*` anchors.
- The isolated-QA helper scripts cited by every evidence README are missing from disk; the app environment must be reconstructed from `.claude/launch.json:28-47`.
- Idempotency conflict (409) paths and cross-school isolation are untested.
- Server error strings and client fetch errors are English-only inside an EN/AR/UR UI.

### 4.5 Decisions already made that constrain the design (Appendix B.decisions)
24 rules, of which the ones that shape this plan: typed operations only; one allow-list as the choke point ("typing a request changes nothing"); approval bound to version + preview hash + idempotency key; separation of duties per Delivery Policy; no chat phrase alone publishes marks, moves money, sends family messages or changes timetables; announcements queued never sent; conversation text never becomes approved memory; students never created silently, accounts never invited by automation; pseudonymise before every prompt; OpenAI stays; credits per action; release gate fail-closed; every step re-checks identity/role/campus/permissions/access version; honest outcomes; evidence-bound actions; Exam Studio owns the exam chain; tenant isolation on every write; claim language "built / bound / estimate", never "first / only".

---

## 5. The product: "Ask, Check, Keep the Receipt" (design, full spec in `design-ux.md`)

**The idea.** People do not want to "use AI"; they want the register saved, the book issued, the campus standing. There is one way to ask: the **Ask bar** on Today and `/ai`, or **⌘K / Ctrl+K** from any page. It carries chips for what you are looking at, and one palette replaces the teacher palette's existing ⌘K (`teacher/command-palette.tsx:51-56`). The AI turns the request into a **Task Card**: a small form for one capability, already filled from your words and the school's records. Each field shows where its value came from (*from your words · from school records · default · needs you*), so you correct instead of type. What happens next is fixed per capability:
- **A** runs.
- **B** waits for a button that says exactly what it does ("Save register · 31 present, 2 absent"), bound to the preview and showing a short code (**Preview 7C1D**).
- **C** is prepared and handed to the named person on the screen where they already approve that kind of work, carrying the same code.

Nothing reads *Saved* or *Done* until the server returns a receipt. The role companions from SKO-397 (`AiGuide.tsx`) are the face of all this. They greet you, interview you on first login and sit beside every Run Sheet, but they never confirm anything.

**Four signature moments (the LEAP demo is built on them):**
1. **"It already knows me."** First login shows Known-fact cards prefilled from registration and the wizard; one press, *All correct*. The academic year is never asked twice.
2. **"The school assembles itself, only as fast as the database."** *Build my workspace* inks one ledger row per receipt ("12 classes · saved", "9 staff invitations · pending until accepted", "Fee structure · with Sana (Accountant)"). The Seal presses only when every A/B row has a receipt.
3. **"Twenty seconds between lessons."** An Urdu teacher on a 360 px phone types «علی اور سارہ غیر حاضر», taps *Mark the other 31 present*, then *Save register*, and gets a receipt. Typing «جی» ("yes") saves nothing.
4. **"Handed to the right person, same code on both screens."** An accountant's cash entry becomes *Prepared · with Farah (Admin) · Preview 4F2A*. Farah approves in Finance operations, and the requester's card flips with the receipt.

**Surfaces** (§2–§3 of `design-ux.md`):
- AskBar / AskPalette, RunSheet, TaskCard (generated from zod), ConfirmBar, PreviewCode / PreviewDiff, ReceiptList, NotYetCard, HandoffCard, HandoffInbox (`/ai/waiting`), PreparedByAiPanel on the Runs and Finance-operations panels.
- CapabilityAtlas `/ai/can-do`, which honestly says "connected to n of m"; RunHistory; the PracticeBadge.
- The per-role FirstLoginSheet with BuildBoard and receipts page.

**Ten engine states**, one word per state in EN/AR/UR: planning · needs you · ready to save · saving · saved · not sent anywhere · with {person} · paused · can't tell if saved · done. A bare "yes" in text or voice never confirms. UNCERTAIN reads "We can't tell whether this was saved; check {surface}".

## 6. Architecture (design, full spec in `design-architecture.md`)

The architecture judges split three ways (security → A2 planner, tech lead → A1 registry, founder → A3 breadth). The synthesis keeps **A3's spine**, takes **A1's type system and build lint**, and takes **A2's runtime**:

- **Capability Registry** `src/lib/ai-workflows/registry/domains/<cluster>/*.ts`: one entry per Appendix A key with zod input, existing service call, gate provenance copied from the route, scope, static class floor, idempotency mode, preview + fingerprint, receipt and EN/AR/UR copy. **Class C is a separate TypeScript type with no `execute`**; it hands off. An AST route scanner (`scan-handlers`, ts-morph) plus a ratchet inside `npm run build` fails CI when an API write handler has no entry or explicit exclusion.
- **Plan-then-execute.** A two-phase strict-JSON protocol (plan, then per-step fill) with a single-step fast path. Retrieval is code-first (role filter, then BM25 over EN/AR/UR; router only above 40 candidates). The model emits typed `EntityRef`s, never ids; scope-filtered resolvers bind them. Evidence is required by default for every model-filled field.
- **Runtime.** New tables `ai_workflow_jobs/_steps/_intents/_questions/_confirmations/_handoffs/_events`, `ai_capability_gaps` and `ai_setup_responses` (migration `20261102000000_ai_workflows_v2`). Step state machine with STALE and UNCERTAIN; write-ahead intent ledger; lease + heartbeat; SSE with polling fallback.
- **SKO-470 reuse** happens at the execution layer: typed ops still run through records, preview and `executeSchoolAiToolInTransaction`, and the self-approve at `service.ts:81` is deleted.
- **Five hand-off kinds** for class C (record approval, domain screen, role task, deep link, request object), each single-use, actor-bound and forgery-checked.
- **Questionnaire = deterministic compiler.** Typed per-role answers compile into the same plan with no model on the happy path. Readiness is computed from live records. GuidedSetup's 18 keys and the dead setup-generation path retire in Slice 3.
- **Breadth economics.** Class-B direct services take about 0.25 d each; inline-prisma rows are extracted only when they must run (B), and the about 106 class-C inline rows get a hand-off plus a two-line `completeHandoff()` hook instead.
- **Coverage.** About 700 automatable keys after exclusions (auth, webhooks, cron, candidate exam attempts are never-safe). About 195 entries in the planned slices; the long tail in post-LEAP waves.

## 7. Per-role questionnaires (Appendix D)

Every role gets its own sheet, prefilled from what Skoolee already knows, with chips, steppers, grids and pickers rather than essay boxes:

| Role | Sheet | What "Build" creates (receipts) | What stays with others |
|---|---|---|---|
| ADMIN / CAMPUS_ADMIN | grades & sections, subjects per grade, periods, rooms, working days, staff list, fee heads, modules | classes, subjects, periods, rooms, weekends/holidays, pending staff invitations, fee structure drafts | invitation acceptance; fee approval; year activation if a principal holds the seat |
| TEACHER | my subjects/sections (prefilled from assignments), marking style, homework rhythm, free periods | profile, gradebook columns, homework cadence, lesson-plan slots | allocation changes go to the academic lead |
| PRINCIPAL | academic priorities, grading rules, assessment calendar, cover rules | grading config, term calendar, exam session plan drafts | papers and seal stay in Exam Studio |
| ACCOUNTANT | currency, fee heads, due days, late fines, payment methods, books | fee types/structures, payment methods, chart setup | approvals per separation-of-duties policy |
| LIBRARIAN / RECEPTIONIST | loan rules, opening catalogue / visitor rules, enquiry stages | loan policy, catalogue entries / front-desk settings | fine waivers (C) |
| PARENT / STUDENT | confirm children or class, language, notification channels, goals | preferences, private plans, study schedule | phone/channel changes are C with step-up (red team) |
| SUPER_ADMIN | campuses, who leads each, group standards | campuses (with calendar seeding), leader invitations, the GroupLaunchBoard | campus sheets go to each campus admin |
| APP_OWNER | owner desk preferences | institution edits | provisioning and support access keep their console |

Full question tables, prefill sources, top-10 free-form requests per role (with Urdu and Arabic examples) and adapter lists are in Appendix D.

## 8. Red-team controls (Appendix E: 45 attacks, 6 blockers)

The six blockers, all resolved in Slice 1:
1. Narrowing the pseudonymiser would leak names. **Fix:** deny by default with a `CLEAR_KEYS` allow-list plus a schema test that fails on any unclassified `*name*` field.
2. Prompt injection could drive A/B writes. **Fix:** evidence required by default; quoted school data escalates A to B.
3. UNCERTAIN could be shown as "nothing changed". **Fix:** a state enum generated from `StepStatus` with an exhaustive switch.
4. Batch caps against the plan cap. **Fix:** questionnaire plans are exempt and chunked.
5. Duplicate questionnaire jobs from two tabs. **Fix:** partial unique indexes.
6. The practice badge could contradict real receipts. **Fix:** server-enforced practice mode while the release gate is closed.

Sixteen cross-slice controls P1–P16 (`design-slices.md` §2) include:
- confirmations bound to input hash + preview hash + session + 10-minute expiry;
- B executes only inside the confirming request, never in the worker;
- class-C prepare is itself a B confirmation;
- forgery-proof hand-off completion;
- credit attempts logged and capped, charged only when tokens > 0;
- 40 s unit deadlines;
- localised error codes;
- no offline command queue;
- a lint banning `runUnscoped` and hand-built `AuthUser`;
- drain-mode flag-off.

## 9. Build order (slices; full detail in `design-slices.md`)

Stacked PRs into `feat/ai-full-role-automation`, behind a per-school `AI_WORKFLOWS_V2` flag (on in dev, off in prod until the release gate). Done means the founder ticks that slice's browser checklist on the synthetic tenant.

| Slice | Linear | Content | Entries | Days | Depends |
|---|---|---|---|---|---|
| 1 | SKO-550 | Platform: registry + lint, runtime + migration, protocol, classes + hand-offs, UX shell, cutover of today's 12 tools + 15 ops (sub-PRs 1a–1h) | ≈40 | 105 | — |
| 2 | SKO-551 | TEACHER + questionnaire framework | 21 | 33 | 1 |
| 3 | SKO-552 | ADMIN / CAMPUS_ADMIN sheet replaces GuidedSetup; fee setup entries | 18 | 27 | 2 |
| 4 | SKO-553 | PARENT / STUDENT | 26 | 18 | 2, 3 |
| 5 | SKO-554 | ACCOUNTANT (Collect hand-off) | 16 | 15 | 3 |
| 6 | SKO-555 | LIBRARIAN / RECEPTIONIST | 32 | 19 | 1, 2 |
| 7 | SKO-556 | PRINCIPAL | 17 | 14 | 2, 3 |
| 8 | SKO-557 | SUPER_ADMIN group path / APP_OWNER desk | 25 | 19 | 3 |
| 9 | SKO-558 | LEAP demo arc, release-gate evaluation cases, BullMQ throughput, load test | — | 22 | 2–5 |
| | | **Planned total** | **≈195** | **272** | |
| post-LEAP | — | W3/W4 long tail (mostly C hand-offs) | ≈485 | ≈125 | |

**Calendar warning.** 272 person-days for one sequential agent is about 55 weeks. The **LEAP-critical cut is about 158 days**:
- lean Slice 1 (92 d, polling instead of SSE, router polish deferred);
- Slice 2;
- most of Slice 3;
- the parent half of Slice 4;
- the demo part of Slice 9.

Running parallel sessions after Slice 1c, once the registry makes domain entries independent, is the other lever (decision D17 below).

## 10. Engineering rules for the implementation session

- **Audit before fixing.** Open every Appendix A/B finding at its file:line and confirm it before changing code; the inventory was produced by static reading, not execution.
- **Branch.** Work on `feat/ai-full-role-automation`; check `git branch --show-current` before every commit; never commit `.claude/launch.json` or another session's files (`docs/leap/exam-studio-preview.md`, `scripts/demo/seed-exam-studio-preview.ts` are not ours).
- **Shared checkout.** Commit only your own hunks through a temporary `GIT_INDEX_FILE`; never `git add` shared files wholesale (`prisma/schema.prisma`, `tenant-models.ts`, copy catalogs); never run `npx prisma format`.
- **Migrations.** Hand-written SQL per folder; `prisma migrate diff --from-schema-datamodel`; applied to dev Supabase through `DIRECT_URL` (port 5432) with `migrate deploy`; `migrate status` and a drift check; `prisma generate`; `gen-tenant-registry`; restart the dev server.
- **Tenant isolation.** Every new table has `school_id` (and `campus_id` where scoped) and the fail-closed guard; `runUnscoped` only for APP_OWNER paths with a stated reason.
- **Adapters.** Typed adapters that call existing `(user, input)` services; carry the route's gate verbatim; declare the confirmation class; derive the idempotency key from the step key; return a truthful receipt; never extend seats or the permission matrix to widen reach. Inline-prisma routes are extracted into services first (mechanical recipe in §6), with the route kept as a thin caller.
- **Prompts.** Pseudonymise through the shared `Pseudonymizer`; fix the `name`-key over-masking before sending class/subject names; send tool descriptions; request JSON mode / tool calling; EN/AR/UR instructions; never put school content in the system prompt.
- **Design system.** Shared primitives only; tokens only; `npm run check:ui`; `scripts/ui-token-codemod.ts` for violations; EN/AR/UR together; 360/768/1440 and RTL checked; `data-*` anchors on every interactive automation element; no `title=` tooltips.
- **Tests.** Registry-driven unit tests under `node --test`; the role × capability DB matrix on the isolated 55438 cluster (both URLs identical; migrations, never `db push`); Playwright `*.browser.spec.ts` with screenshots in the scratchpad; wire `tests/automation` into `scripts/run-school-ai-tests.mjs` and CI in Slice 1.
- **`tsc`** with `NODE_OPTIONS=--max-old-space-size=12288`.
- **AI provider.** OpenAI stays; pseudonymise; never pollinations.ai; honour `providerConfidentiality`; credits per action; the release gate stays closed until a real evaluation is recorded.
- **Linear.** Slice sub-issue In Progress when it starts; QA comment with suites, results, migration status and EN/AR/UR screenshots at 1440 and 390; Done only after QA; the parent stays In Progress until all slices are Done; continue to the next slice without asking.
- **Claims.** "built", "bound", "estimate", "not measured"; never "first", "only", "autonomous school", "learning gains". A read or a saved draft is never "done".

## 11. Linear

Parent [SKO-545](https://linear.app/skoolee-ai-app/issue/SKO-545) (flagship). Slice sub-issues SKO-550 … SKO-558 as in §9, chained with native blocked-by relations. Related: SKO-460 (assistant/voice), SKO-397 (setup), SKO-470 (run lifecycle), SKO-383/SKO-494 (release gate), SKO-408 (Exam Studio).

## 12. Hand-off prompt for the implementation session

> Continue the AI Workflows flagship from `docs/product-review-2026-10/ai-automation-plan-2026-10-23/README.md` in the worktree `.claude/worktrees/ai-workflows` on branch `feat/ai-full-role-automation`, which already has the latest dev merged. Start with Slice 1 (SKO-550) and follow `design-slices.md` §3 sub-PR by sub-PR (1a → 1h). Controls P1–P16 (§2 there) are mandatory. Wherever the slices doc records a reconciliation (§13 there), it wins over `design-architecture.md` and `design-ux.md`. Before changing code, open every Appendix A/B finding you rely on at its file:line and confirm it. Follow §10 of this README exactly:
> - temp-index commits of your own hunks only;
> - hand-written migrations applied to the isolated 55438 DB and then dev Supabase;
> - `check:capabilities`, `check:ui`, and `tsc` with the large heap;
> - EN/AR/UR together, with 360 px and RTL checks.
>
> In Linear, move SKO-550 to In Progress, then post a QA comment with suites and screenshots, then mark it Done. Take every default in §13 and name it in the commit message. Verify each finished sub-PR in the browser on the synthetic tenant, report what you could not verify, and stop after each slice for the founder's checklist.

## 13. Founder decisions with defaults (bold = what the implementation takes unless told otherwise)

| # | Decision | Default and trade-off |
|---|---|---|
| D1 | New `AiWorkflow*` tables vs extending `SchoolAiRun` | **New tables linked by `schoolAiRunId`**. More tables, but SKO-470 stays untouched and campus-less owner/group jobs work. |
| D2 | Payments from chat | **Collect-desk hand-off (C)**; `finance.apply_operation` record approval for schools wanting a second approver. |
| D3 | Batch confirm size | **10 per free-form sheet, 30 per questionnaire sheet, ordered sheets beyond.** |
| D4 | Credits on failure | **Charge one credit per AI action only when the provider returned tokens; log every attempt; outages pause** (red team overrides the architecture's "charge failures"). |
| D5 | Approval decisions from chat | **Always C**: prefilled on the existing queue screen, never decided in chat. |
| D6 | Library return with fine | **B with the fine shown; waivers C.** |
| D7 | Embeddings for retrieval | **Off**; switch on if live recall < 95%. |
| D8 | Is the questionnaire mandatory | **Shown at first login, per-question skip, "later" twice then a Today card; never blocks.** |
| D9 | Unmatched free-text names | **Generic `[PERSON_n]` + scanForPII; residual risk accepted on the synthetic demo tenant; revisit after measured recall.** |
| D10 | Worker capacity | **24 per sweep, 2 per school** until BullMQ in Slice 9. |
| D11 | When to show the whole plan first | **When there are 3 or more B/C steps; otherwise stepwise.** |
| D12 | Teacher says "all present" | **Count question, still B over the full roster** (never inferred). |
| D13 | Setup that crosses seats | **Role task to the seat holder; seats never widened.** |
| D14 | Routes with weak gates (e.g. `/api/teacher-attendance`, `invite.ts` actions) | **Adapter is stricter + a ticket to fix the route; unsafe rows deferred.** |
| D15 | Demo tenant | **Synthetic tenant with a real key; release gate stays closed for real tenants (practice mode).** |
| D16 | Desk preferences with no store today | **Out of scope; shown as readiness checklist notes.** |
| D17 | Calendar | **LEAP-critical cut (≈158 d) first; decide on parallel sessions after Slice 1c.** |
| D18 | Parent phone/channel changes | **C with step-up** (red team); founder may lower opt-out-only to B by reviewed override. |

