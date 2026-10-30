# Appendix C — Design candidates and judge verdicts


## Judge: Security reviewer. Five criteria, each scored 1-10. (1) Authorization re-check and tenant isolation: is role, campus, accessVersion and permission re-checked at every write, including worker and headless paths, with school_id fencing? (2) Confirmation-class enforcement and separation of duties: are classes enforced in code rather than in the prompt, can the requester self-approve, and are approval decisions handled safely? (3) Replay safety and receipt honesty: idempotency layers, crash windows, hand-off double-apply, and truthful outcomes. (4) Prompt-injection surface and PII egress: is school content treated as data, are names kept out of prompts, and does masking avoid corrupting class and subject labels? (5) Audit completeness and worker/headless execution risk: leases, worker confirmation rules, route-only side effects, synthesized requests. Verified in the repository: pseudonymize.ts:36-37 does classify any *name key and ^name$ as PERSON. service.ts:81 self-approves. desk.ts:95-121 has no key and opens its own transaction, with a 409 on replay at :112-113. leave.ts:44-45 returns 409 on overlap. The attendance route holds the future-day check and notify("ATTENDANCE_SUBMITTED") outside saveRegister (route.ts:51-52). Payment idempotency is unique on (schoolId, recordedBy, idempotencyKey) (schema.prisma Payment @@unique). saveRegister(user, body) has no tx option today. None of the proposed directories exist yet. → winner **A2-planner**

| candidate | total | fatal flaws |
|---|---|---|
| A1-registry | 35 | The attendance adapter executes saveRegister directly. That bypasses the future-day validation and the notification, which exist only in the route (route.ts:51-52), so the AI path is weaker than the screen path.; APPROVAL_DECISION is set to class B (chat-confirmable approvals). This conflicts with the stricter reading of 'no chat phrase grants or decides' and with the other two candidates' C floor |
| A2-planner | 41 |  |
| A3-breadth | 39 |  |

**Graft:**
- A1: Make class C a distinct TypeScript type with no execute member (HandoffCapability), backed by an AST lint. Replace A2's `execute: throw` pattern.
- A1: The check:capabilities lint scans every route.ts write handler, sub-action and server action. Gate provenance must be a superset of the guard calls the AST scan finds in the source route. Unknown guard helpers fail closed. Use a ratchet baseline that can only go down, so a new write route without an entry or exclusion fails the build.
- A1: A write-ahead SchoolAiActionIntent-style ledger row inserted before the service call, with 409 STEP_INPUT_CHANGED for the same key with a different input hash.
- A1: Explicit person-key allow-list fix for SENSITIVE_KEYS (verified at pseudonymize.ts:36-37), plus field-level PII annotations from the registry.
- A3: The model never emits ids. It emits EntityRefs, and scope-filtered server resolvers bind them, so rosters and lookup dumps never enter prompts. Prefer this over model-driven lookup rounds.
- A3: verify() reads every receipt id back under runWithTenantContext before a step counts as executed. A failed verification gives FAILED_UNVERIFIED and blocks the EXECUTED outcome.
- A3: An explicit 'never safe' list: never invoke route handlers from the worker (cookies() would authenticate the wrong principal), never forge Origin past assertSameOrigin, no header-, IP- or measured()-dependent wrappers, FormData deferred. Synthesized NextRequest is allowed only for allow-listed library callees.
- A3: The `mirrors` lint: an adapter gate may be stricter than its route gate but never narrower. Tightenings go in a tracked file with a ticket.
- A3: When the human edits the prefilled values, the hand-off ends as COMPLETED_WITH_CHANGES and the receipt shows the diff.
- A3: Rows marked idempotent: no must declare a reconcile or a native key, or go to deferred.ts (for example fees.record_payment_basic or staff_attendance.mark_staff).

**Must fix:**
- Close the class C type hole: remove execute from C adapters (separate HandoffAdapter type plus AST lint). The current `execute: async () => { throw }` in fees.collect_payment is only runtime enforcement.
- Make DOMAIN_SCREEN hand-offs single-use and actor-bound. Payment idempotency is unique on (schoolId, recordedBy, idempotencyKey) (verified), so two accountants opening the same ?handoff=<id> could each record a payment with the same key. The hand-off must be claimed atomically (OPEN to CLAIMED by a CAS on the hand-off row) before the domain write. The prefill must be re-authorized for the viewer's role and campus, and the prefill hash re-verified at submit.
- Re-check class B typed-op approval: confirming a B step must not call updateWorkspaceRecord(action: approve) as the requester (the service.ts:81 pattern). Either the approval is recorded with an explicit via/previewHash binding and assertApprovalSeparation, or the step escalates to RECORD_APPROVAL. State which, and test it.
- Move route-only checks and side effects into services before any adapter calls them (future-day check and ATTENDANCE_SUBMITTED notify at attendance/register/route.ts:51-52, plus the other 23 notify call sites). Add a parity test showing the AI path rejects whatever the screen path rejects.
- Prompt-injection: treat every read or lookup result and every piece of school-authored text (book titles, announcement bodies, reasons) as quoted data in a delimited, non-instruction channel. Add red-team cases where injected text in a record tries to trigger a class C or cross-role capability, and assert that zero effective writes occur. Do not rely on a 'guard sentence'.
- Adopt A3's EntityRef and resolver binding so planner prompts never carry rosters or ids. Phase-2 fill must not receive unmasked lookup output.
- Add a gate-drift lint comparing adapter gates with route guards (A1 provenance or A3 mirrors). The current registry.test only checks roles against the inventory.
- UNCERTAIN natural-key reconcile queries (bookIssue by copy, member, returnedAt null and issuedAt >= startedAt; learnerLeaveRequest by student, requester and dates) need DB tests that kill the process between commit and receipt flip. They must prove no double-apply and no false replay.
- Credits: B.decisions requires charging per AI action. Log and charge failed or invalid provider attempts (or at least log their tokens against the job), so repeated malformed calls cannot be used for free provider spend.
- Audit: record confirmer, previewHash, hand-off claimant and completing actor on every class C completion, and keep AiWorkflowEvent payloads free of PII, as the proposal states. Add a test that scans event payloads with scanForPII.

## Judge: Tech lead shipping 700 capabilities with a small team. I scored five criteria from 1 to 10: (1) authoring cost per capability and codegen/scaffold leverage; (2) coverage durability, meaning new routes stay covered through lint, ratchet and AST scan; (3) handling of inline-prisma routes and migration risk from the current engine; (4) TypeScript ergonomics, with invariants enforced by types rather than convention (class C has no execute, static class); (5) prompt-size scaling and test generation from the registry.

I verified these citations in the repo:
- pseudonymize.ts:36-37: the `...name$` and `^name$` PERSON patterns are real, so className and subjectName get masked.
- zod is 4.4.1, and z.toJSONSchema is used in output-schema.ts:11.
- There are 489 route.ts files under src/app/api.
- automatic-workspace.tsx:54 has the 600 ms advance.
- service.ts:123 sends bare `Object.keys(catalog.tools)`.
- desk.ts:95, register.ts:96 and leave.ts:34 have the stated signatures. Note that saveRegister and requestLeave take `Record<string, unknown>` and export no input schema.
- 24 API route files call notify(.
- src/components/ai-workflows exists, holding AiWorkflowsHome.tsx and ai-workflows-copy.ts. src/lib/capabilities, src/lib/workflows and src/lib/ai-workflows do not exist.

Appendix A row and risk tallies are not clean to parse, because extra tables and owner-tagged reuse values push my parse to 802 rows. The high-risk total (DESTRUCTIVE + APPROVAL + FINANCIAL + ACCESS + COMMS + PUBLISH ≈ 287-315) fits A3's figure of 287 C rows. A1's 207 C only works because A1 maps APPROVAL_DECISION to B. → winner **A1-registry**

| candidate | total | fatal flaws |
|---|---|---|
| A1-registry | 41 |  |
| A2-planner | 32 | Class C safety is a runtime throw inside an `execute` member instead of being absent from the type. It works, but under a convention-only invariant one copy-paste turns a money or publish capability into an executable one.; Coverage lint keys on the Appendix A inventory, not on routes, so write routes added later are not forced to be covered or excluded. |
| A3-breadth | 37 |  |

**Graft:**
- A3: 106 of the 223 inline-prisma rows are class C and need no service extraction. Cover them with a hand-off entry plus a two-line completeHandoff() hook in the route. Only the B and A inline rows (~117) go through extract-service. This cuts roughly half of A1's largest cost line.
- A3: move route-only side effects and checks into the extracted command, then remove them from the route. Examples: notify( is called in 24 route files (verified), and the attendance future-day check sits in the route, not in saveRegister. Without this, the adapters skip those effects silently.
- A3: an explicit 'never safe' list for adapters. Never call route handlers (cookies/requireAuthUser), forge Origin, call measured()/requestSchool() header readers, rely on IP rate limits, use FormData uploads (deferred to SKO-460) or read support-grant cookies. Synthesized NextRequest is allowed only for listed library callees during the transition.
- A3: the thin-routes.json lint, which asserts that no prisma.*.create|update|delete|upsert remains in an extracted route file. Also golden byte-equal response tests before and after extraction.
- A3: EntityRef {$ref, text, hint} plus deterministic scope-filtered resolvers as the default for id fields, so the model never emits raw ids. Ambiguity becomes chips. Rosters never enter prompts.
- A3: a verify() readback of receipt ids under the tenant guard (FAILED_UNVERIFIED blocks the 'executed' outcome). Also COMPLETED_WITH_CHANGES with a diff when a human edits a class-C prefill, and a 409 conflicts[] mapped to CONFLICT that becomes a question, never 'done'.
- A3: a per-domain implementer checklist and a coverage-report --domain command, so agent sessions or domain owners can work through the long tail in parallel. Long-tail order is driven by gap telemetry (nearestKey counts).
- A2: questions bound to {stepId, JSON-pointer field}, using localized per-field templates from the registry. Entity-chip and date answers apply in code with no model call. A free-text answer re-fills only that one step.
- A2: a fingerprint() drift detector per capability. Drift re-previews the step; a hash change marks it STALE, which invalidates the B confirmation and supersedes any C prefill. Committed steps stay pinned on replan, bounded by maxReplans.
- A2: an UNCERTAIN step state for natural-key reconcile that comes back inconclusive. It is never auto-retried and uses WorkflowEffect semantics.
- A2: compensation offered as a newly proposed step with its own class (undo a loan proposes return_copy B; undo a payment proposes request_adjustment C), never an automatic rollback.
- A2: effectiveClass with autoRunMax, where a large batch escalates A to B, plus escalation from Delivery Policy SoD. A state-machine property test using forEachSeed should check: no SUCCEEDED step without a receipt, and no B step executed without a matching previewVersion confirmation.
- A2: a single-step fast path that inlines the full schema when a plan has one capability with ≤12 fields, so common requests cost one model call. Also a seq-based event log with SSE plus a ?after=seq polling fallback, and confirmations that are never queued offline.
- A2: name new Prisma models so they do not collide with the existing WorkflowJob/WorkflowEvent/WorkflowEffect (schema.prisma:351-412). The wf- step key format must match the execution.ts idempotency regex.

**Must fix:**
- Reconcile the class counts and APPROVAL_DECISION mapping. A1 floors APPROVAL_DECISION to B, which gives 11/448/207. A2 and A3 put it in C, which gives ~287 C. Publish one recomputed table from Appendix A, with the parse script committed, and state per approval family which ones are C. All finance, access, publication and family-message approvals must be C to satisfy the non-negotiables.
- Budget schema extraction for 'direct' rows. Verified: saveRegister(user, body: Record<string, unknown>) and requestLeave(user, body: Record<string, unknown>) export no zod input, and issueCopy's schema is inline. 'Services export their input schemas' is therefore real work on most of the 418 direct rows. Revise the 1.5 h per entry and the 208-day coverage estimate.
- Adopt A3's rule that class-C inline-prisma rows skip extraction (hand-off plus completeHandoff hook), and re-cost W2-W4 accordingly.
- Add route-only side-effect migration to the extract recipe and the lint. notify( appears in 24 route files, and the register future-day check lives in the route. Direct-service adapters must call a command that includes them, or the effects are skipped silently.
- Add gate-provenance AST lint for the 'direct' rows as well, by comparing the service's guards with the route's guards. Keep a registered allow-list of guard helpers that fails closed. Document how a route-level guard that the service lacks gets moved into the service.
- Measure, before W1, the token size of 24 strict tool schemas plus the _step envelope plus anyOf id widening, and p95 latency for ≤4 rounds within 45 s. Fall back to A2-style capability cards plus per-step strict fill if the budget is exceeded. Also confirm that the configured OPENAI_MODEL supports strict tool schemas, and refuse to start jobs if it does not.
- Settle credit policy for failed or invalid provider calls. A1 charges them and A2 does not. Pick one and tie it to consumeAICreditAndLog semantics before the matrix tests assert credit counts.
- Coordinate the SchoolAiRun extension (origin, conversationId, new statuses, SchoolAiRunStep) with SKO-470 owners. Prove that scheduled record-based runs (run-service.ts steps JSON) keep working, with a regression test before M2.
- Replace the A1 attendance example's 'everyone present' evidence-over-the-roster rule with A3's explicit {rule, quote} input. Make a bare 'all present' a deterministic count question, so per-pupil evidence never comes from server-rendered roster text.
- Specify the tool-name mapping collision check: key with '.' replaced by '__' must be unique and ≤64 characters, and lint must enforce it. Also define what happens to the 2 rows with reuse 'none' and the Exam Studio-owned rows (deep-link entries), so the ratchet math (668) is reproducible.

## Judge: Founder/product owner bound by B.decisions. Five criteria, each scored 1-10: (1) Honest outcomes and receipts: a read, draft or hand-off is never reported as "done", and receipts are verifiable. (2) Fit with existing work: reuses the SKO-470 run lifecycle and SKO-460 conversation surfaces instead of forking them, and leaves the Exam Studio boundary intact. (3) Questionnaire pipeline realism: what each role's answers actually provision, how the work crosses to other roles' seats, and whether the wizard is duplicated. (4) "Any role, any feature" without pretending: demo breadth across all 11 roles, a path to all 700 capabilities, credits charged per AI action, and EN/AR/UR with RTL. (5) Rule compliance and safety: static A/B/C classes, approvals bound to version, preview hash and idempotency key, class C never applied from chat, pseudonymisation, and no model-chosen HTTP or SQL. I checked the code the candidates cite. Confirmed: pseudonymize.ts:36-37 (the `...name$` and `^name$` patterns also catch className and subjectName); the self-approve in service.ts at about line 81; the 600 ms timer in automatic-workspace.tsx; desk.ts:97 defines its zod schema inline and does not export it; attendance/register/route.ts:52 holds the future-day check and :54 calls notify outside saveRegister, which is A3's finding. A1's example calls saveRegister directly, so it would skip both. → winner **A3-breadth**

| candidate | total | fatal flaws |
|---|---|---|
| A1-registry | 34 | The class floor maps APPROVAL_DECISION to B, so chat can approve requests unless someone remembers to escalate; only D6 informally carves out finance, access and publication approvals.; Adapters on direct services (saveRegister) skip side effects and checks that live only in the route (notify, future-day check), so the receipt overstates what happened. |
| A2-planner | 39 |  |
| A3-breadth | 40 |  |

**Graft:**
- From A2: the full job and step state machines with a defined rendering for each state, including STALE, UNCERTAIN (retry disabled until checked), SUPERSEDED, DENIED with 'who does this', and WAITING_HANDOFF with 'you can close this'. Also take its property tests over random command sequences.
- From A2: questions attached to a specific step and JSON-pointer field, using localized adapter templates. Entity-chip answers cost no model call. A free-text answer re-fills only its own step. A bounded replan keeps committed steps pinned.
- From A2: questionnaire answers bound to {responseId, version}. Editing an answer recompiles and shows a step diff, superseding only the changed steps. Also take the SUPER_ADMIN group questionnaire and showing wizard facts read-only, using the exact existingCycleId.
- From A2: the five hand-off kinds. Add ROLE_TASK, for work that needs another role's seat, and DEEP_LINK, for Exam Studio and excluded rows, next to A3's record and screen hand-offs. Also add a 'Mark as done here' fallback for a step left HANDED_OFF when a screen drops the key.
- From A2: compensation offered as an 'Undo...' that proposes a new step with its own class, never an automatic rollback. Also the lease, heartbeat and seq-based SSE with a polling fallback, and confirmations that are never queued offline.
- From A2: the step runner mirrors processSchoolRun (row lock, re-check access, one step and its receipt per transaction). Typed ops run through executeSchoolAiToolInTransaction with wf- keys and store executionId.
- From A1: fix the shared pseudonymize.ts SENSITIVE_KEYS classifier with an explicit allow-list of person keys, as well as the per-field policy, and add a regression test that className, subjectName and campusName stay clear.
- From A1: extend SKO-470's SchoolAiRun with origin CHAT/ROLE_SETUP and conversationId (or document why a separate job table is unavoidable), so 'Saved work' and Runs show one lifecycle.
- From A1: a ratchet baseline in the build (check:capabilities inside npm run build). The AST scanner covers action-enum sub-actions, GETs that write, and 'use server' exports. Gate provenance must match the guards the route calls, and an unknown guard helper fails the lint.
- From A1: services export their zod input schemas (desk.ts:97 is inline today) and the registry imports them, so the AI path and the screen path share one validator.
- From A1: escalation is upward only and never chosen by the model. The Delivery Policy and correctionSeparateApprover turn B into C and name the second approver instead of failing with a silent 403. Also add the SchoolAiCapabilityGap 'not available because... whoCan' list to retrieval.

**Must fix:**
- The typed-op B path ('approval as the confirming user when assertApprovalSeparation passes') must record the approval with via='chat-confirm' and bind it to previewHash and record version. Any op on the B.decisions class C list must never take this path. Add a test that self-approval without a matching confirmation row is impossible.
- Credits: log tokens for every provider attempt and charge per AI action. State explicitly that a repair or router call never charges a second credit, and that the questionnaire's free-text cells reserve credits before the call. Show the estimate in the UI before the run starts.
- Group confirmation is capped at 30 B steps per sheet. A questionnaire that compiles to more must show several sheets in order with clear progress, and must never confirm more than the user actually saw.
- Natural-key reconcile for library issue and family leave must have an UNCERTAIN state with retry disabled (from A2). Library renew needs a reconcile on the renewal count, because replaying a renewal renews twice; add it to the DB matrix.
- The demo list must include the extracted commands that carry the route-only side effects (attendance future-day check and ATTENDANCE_SUBMITTED notify, fees collect notify). The thin-route lint must also flag notify( calls left in routes that have an adapter.
- Reconcile the class-floor counts against Appendix A in a generated coverage.md. The candidates disagree (11/400/287 vs 11/400/289 vs 11/448/207), and approval decisions must stay C.
- Unmatched Arabic/Urdu names in free text reach the provider unmasked. Add a generic [PERSON_n] heuristic for unmatched multi-token Arabic-script names (from A2) and an evaluation case, and record the remaining risk as a founder decision.
- Run the LEAP demo on a synthetic tenant only. The release gate (CURRENT_AI_RELEASE_EVALUATION = null) stays closed until a real educator-reviewed evaluation with automation cases is recorded. Say this in the demo plan.
- SUPER_ADMIN and APP_OWNER jobs with no campus need an explicit runUnscoped reason and audit, and the DB matrix must run before and after the 2026-10-26 permissions V2 cut-over.

## Judge: Founder preparing LEAP 2027. Criteria (1-10 each): (1) Memorability and distinctiveness on stage; (2) Five-minute visibility of "AI runs the school for every role"; (3) Honesty by construction (no fake progress, receipts gate claims); (4) Bold without being gimmicky; (5) Grounding and rule compliance (citations check out against the repo, NON-NEGOTIABLES respected, reuses SKO-460/470/Exam Studio). Spot-checks against the repo: automatic-workspace.tsx:54 has the 600 ms advance timer (confirmed). AiGuide.tsx:12 has the poses wave|think|ready (confirmed). RoleShell.tsx:95 says "no header search, SPEC §4.1 H2" (confirmed). chat-dock.tsx:87 has the fixed bottom-24 end-4 launcher (confirmed, though md:bottom-6/md:end-6 on desktop). onboarding/page.tsx:34 has the copy "nothing applies until you approve it" (confirmed). SealSlot has the states open|pending|pressed|failed (confirmed). teacher/command-palette.tsx:52 already binds Cmd/Ctrl+K (confirmed, so U3's proposed Ctrl+K collides with it). These all exist: ConfirmedChoice, StepDock, SheetRail, CharterLedger, CampusPlan, CapacityMeter, WaxSeal, ExecutionPreview, assistant-entity-picker, setup-answer-analysis, runs-panel, finance-operations-panel, multimodal-composer, ConfirmAction requireReason/minLength. → winner **U1-companion**

| candidate | total | fatal flaws |
|---|---|---|
| U1-companion | 41 | None fatal. Most serious: the demo's teacher beat prefills '7B Science, 8A Science' from an admin build that, as designed, creates classes, subjects and timetable drafts but no teacher allocations. As specified, the teacher prefill would be empty.; The demo relies on adapters that do not exist today (teacher register, fee structure, guardian channel preference). It acknowledges beat swaps but defi |
| U2-console | 36 | None fatal. On a stage, the graph-layout board with SVG dependency lines is the weakest LEAP visual and degrades to a plain list at 768 or below. |
| U3-outcome | 40 | None fatal. The attendance TaskCard pre-sets every learner to 'present · default' from a phrase. Unless defaults are visibly unconfirmed and each row needs evidence or an explicit roster acceptance, this risks violating B.decisions T3. |

**Graft:**
- U3: TaskCard provenance chips on every field ('from your words' with the quoted fragment, 'from school records', 'default', 'needs you'), making evidenceQuote visible. Use them inside U1's ConfirmCard and AskWidget.
- U3: a visible 4-character preview code derived from previewHash (e.g. 'Preview 4F2A') shown on the requester's card, the receipt and the approver's HandOffOriginStrip, so the two-device approval beat is verifiable on stage.
- U3: the 'Twenty seconds between lessons' teacher beat on a phone with a visible timer, and suggestion chips that carry prefill and skip the planning call (saving a credit and a round trip).
- U3: the expectNoPrematureDone Playwright helper, which asserts that no receipt tick or placed tile renders before the network response containing its receipt id. Apply it to every BuildStage tile.
- U3: time-honesty copy ('Still working… you can close this' after 8 s; 'Nothing new was saved. Retry' after 60 s) instead of silent lease spins.
- U3: the mandatory 'Your request was not sent anywhere' sentence on not-your-role blocks, plus the 'What approving does / does not do' block in the approver panel.
- U3: GroupLaunchBoard for SUPER_ADMIN, built on CampusPlan and CapacityMeter, with one tile per campus tracking campus record, admin invitation and that admin's questionnaire progress. Use it as the group owner's Build stage.
- U3: a Practice mode label on every card and receipt ('Example, not saved') while the release gate is closed.
- U2: extend the existing TeacherCommandPalette Cmd/Ctrl+K into an all-role ask entry with page-registered context chips (useAskContext, never scraped from the DOM) and @-mentions as a pseudonymisation path. This replaces U1's Alt+J.
- U2: the honest coverage header in the CapabilityMap ('AI is connected to 4 of 151 things you can do'), with counts that rise as adapters land. Use it as a LEAP closing beat.
- U2: the WillCreateDiff three-way split before Build (created when you press Build / prepared for someone else / not from this sheet, e.g. students via roster import), and Go binding per-step preview hashes with class C never covered.
- U2: the HandoffInbox '/ai/waiting' as a read index that deep-links to domain approval screens (not a second approval surface), with blast-radius chips and the existing NotificationCenter and nav approvals badge.
- U2: tie the existing Charter Desk ceremony (CharterLedger ink and SealSlot pressed) to receipts as the closing frame of U1's BuildStage. Use 'mostly set up: 3 with others' headings while anything is pending.
- U2: reuse the SKO-460 conversation model for thread persistence and the SKO-470 SchoolAiRun lifecycle for execution, pause and resume. Extend /teacher-onboarding rather than forking it.
- U2: privacy copy that claims masking only for chip and @-picked entities until the engine pseudonymises free text.

**Must fix:**
- Replace Alt+J with the existing Cmd/Ctrl+K binding in src/components/teacher/command-palette.tsx:52, generalised for all roles, and get the founder's sign-off on the header Ask button versus RoleShell.tsx:95 'no header search, SPEC §4.1 H2'.
- Fix the teacher prefill dependency: either the admin build must include a teacher-allocation step with its own receipt (class B), or the demo seed provides allocations. Otherwise the teacher's 'confirm my classes' card shows 'Not assigned yet' with a hand-off to the admin. Never fabricate known facts.
- Write a concrete demo-critical adapter list and a fallback arc that uses only adapters shipped by LEAP. The teacher register, fee structure and guardian channel preference adapters do not exist today. Every swapped beat must still end on a real receipt or an honest NotYet card.
- Attendance: the founder must pick B (own-class register with the high-blast checkbox) or C, set statically in the registry. In either case 'everyone except Ali and Sara' must carry per-learner evidence or an explicit full-roster acceptance (B.decisions T3), and default rows must be visibly unconfirmed.
- Lane batch confirms must carry an array of per-step bindings {runId, version, stepKey, pendingKey, previewHash}. Any drifted step drops back to its own ConfirmCard. Never accept a single plan-level hash.
- Make the BuildStage receipt-gating testable: add data-companion-* anchors and the expectNoPrematureDone helper, and specify a non-animated ledger rendering for low-end devices and for reduced motion.
- Parent demo beat: a parent home showing the absence comes from a read of the register. It must not imply that the school sent a family message. Family messages stay class C and 'queued, not delivered'.
- DockRail: coordinate with chat-dock ownership. Note that the launcher is md:bottom-6 md:end-6 on desktop (chat-dock.tsx:88), not bottom-24, and specify phone stacking with the mobile nav and the chat sheet.
- The credit estimate shown on the PlanCanvas footer must come from the server reservation (T9) and be reconciled on BuildReport. Never compute it on the client.
- Show the Practice mode or prototype label on every surface while ai-release-evaluation is closed, including the Build stage and receipts.
- State the engine contracts in §3.4 as a hard prerequisite slice: no BuildStage ships before persisted plan, WAITING_CONFIRM, awaiting_approval and receipt-carrying StepView exist. Give a demo-critical effort subset as well as the 72 person-day total.

## Judge: Usability researcher for Pakistani/Saudi/UAE/international schools. Criteria (1-10 each): (1) Phone-first task efficiency and cognitive load: the teacher on a 360px Android between lessons, the first-time admin, the parent. (2) Confirmation clarity and error recovery: whether the user always knows what will change and what was saved, and how they get back on track. (3) Accessibility and RTL: keyboard, screen reader, reduced motion, Urdu/Arabic, mixed-direction text, low-end devices. (4) Trust and honest progress, plus compliance with the NON-NEGOTIABLES (static classes, binding, class C never in chat, no premature "done"). (5) Grounding and feasibility: claims checked against the repo, reuse of SKO-470/460 and shared primitives, realistic scope. Repo checks: automatic-workspace.tsx:54 has the 600ms auto-advance timer (confirmed). AiGuide pose union is wave|think|ready (confirmed). RoleShell.tsx:95 says no header search (confirmed). chat-dock.tsx:87 places the launcher at fixed bottom-24 end-4 (confirmed). onboarding/page.tsx:34 carries the "nothing applies until you approve" copy (confirmed). SealSlot has the states open|pending|pressed|failed (confirmed). service.ts:80-84 auto-approves and executes (confirmed). service.ts:152 runs the evidenceQuote substring check (confirmed). STALE_EXECUTION_PREVIEW exists (confirmed). TeacherCommandPalette already binds Cmd/Ctrl+K (command-palette.tsx:52), which U3 says it has not verified. B.decisions T3 lets the teacher register be Class B/C, so U3's class B is allowed, though it collides with the line-903 class C list (U1 flags this tension). → winner **U3-outcome**

| candidate | total | fatal flaws |
|---|---|---|
| U3-outcome | 41 | The Build moment batch-confirms every class A/B write under one {questionnaireId, version, planHash}. This weakens the non-negotiable 'approval bound to version + preview hash + idempotency key' per step. A user could confirm more than they reviewed, and the proposal admits this risk itself. |
| U2-console | 41 |  |
| U1-companion | 40 |  |

**Graft:**
- U2: Bind Go/Build to per-step stepPreviewHashes[], not one planHash. A step whose preview drifts drops back to awaiting_confirm on its own. Class C is never covered by Go.
- U2: Several class B steps page through one sheet (1 of 3, 2 of 3), each with its own binding. There is no 'confirm all'.
- U2: Generalise the existing TeacherCommandPalette (command-palette.tsx:52, already Cmd/Ctrl+K) into the global entry, and get sign-off on the RoleShell 'no header search' rule (RoleShell.tsx:95), rather than adding a second Cmd+K binding.
- U2: @-mention and page-registered context chips (useAskContext, never scraped from the DOM) as a privacy mechanism. The privacy copy claims masking only for picked entities until the engine masks free text.
- U2: A throttled shared live region (at most one message per 3s, batched). No assertive announcement while focus is in the composer. Single-letter shortcuts can be turned off (WCAG 2.1.4). Reflow at 400% zoom.
- U2: A WillCreateDiff with a 'Not from this sheet' group, and a SetupReceipts page that separates Created / Queued-not-delivered / With others / Not connected / Later. The heading says 'mostly set up' while anything is waiting.
- U2: Credit exhaustion and the 30-step cap become a resumable PAUSED with 'continue in new request', seeded with the summary and receipt ids only.
- U2: The CapabilityAtlas header shows an honest coverage count ('AI is connected to 4 of 151 things you can do').
- U2: Every SchoolAiError gets a stable code mapped to EN/AR/UR, plus AR/UR grammar rules (nouns before a receipt, the perfect tense only after one).
- U1: A 'Preview changed: review again' state with the changed rows highlighted. For high-blast class B steps (more than 50 records or staff invitations), an 'I've checked the list' checkbox in place of a typed phrase.
- U1: Never move focus on background state changes. Signal through the launcher ring and a polite peek chip instead.
- U1: The class C hand-off timeline omits the 'Opened' stage when no server signal exists, rather than faking it. A vacant seat becomes 'you approve it in Finance'.
- U1: Known-fact card stack with an 'All correct' button on first login. The PlanCanvas ghost cards show what a skipped question would have added, without nagging.
- U1: Typed 'yes' in any language is intercepted locally with no model call and no credit charged, then focus moves to the bound button.
- U1: Registry-owned localized step titles with slot values ('Create {count} classes'), so EN/AR/UR does not depend on the model's language compliance.
- U1: Surface the attendance.record_register B-vs-C tension (B.decisions line 903 lists it as C; T3 allows B/C) for a static founder decision. Proposed: a teacher's own-class register is B with a high-blast check; a bulk operator register is C.
- U1: A capped, receipt-driven light build animation for the ADMIN ceremony only (at most 8 concurrent animations, paused when the page is hidden, a 120ms fade under reduced motion). Keep it off for teacher and parent flows.

**Must fix:**
- Replace the single {questionnaireId, version, planHash} batch confirm in BuildMoment with per-step preview-hash binding plus an idempotency key per step. A drifted step falls back to its own ConfirmBar, and class C is never included in the batch.
- Resolve the Ctrl/Cmd+K collision with the existing TeacherCommandPalette binding (src/components/teacher/command-palette.tsx:52) by merging the two into one palette. Get founder sign-off on RoleShell's 'no header search' rule (RoleShell.tsx:95).
- Fix the invitation wording: the ribbon's 'Staff invitations · 9 sent, 0 accepted' and BuildMoment's 'invitations sent' must read 'queued/pending until accepted'. Automation uses inviteAccounts:false and pending invitations (B.typedOps, execution.ts:36), so 'sent' is not true until a delivery event.
- Make the attendance.record_register class an explicit founder decision and record it statically in the registry. The line-903 class C list conflicts with U3's class B signature moment. Demo copy must follow whichever class is chosen.
- Remove 'Holds the mic' from the 20-second choreography. Voice is SKO-460 scope, and the demo must not imply it.
- State how the TaskCard uiSchema scales: generate field-kind defaults from the zod schema, and budget hand-written uiSchemas only for the demo-critical adapters.
- Chips that skip the planning call must still go through the server's gate/permission/accessVersion re-check and credit charge when the card opens. Stale chips must render NotYetCard instead of a card the user cannot submit.
- Add an explicit keyboard map and a throttled shared live region to the RunSheet: no assertive announcements while the user is typing, mirrored arrow keys in RTL, and the composer shortcut can be turned off.
- Show the AR/UR copy for the BuildMoment, the hand-off and the 'not sent anywhere' sentences, not only EN, and name the plural/grammar rules per language.
- Keep motion off the 360px teacher and parent paths. The ribbon must remain fully understandable as text under reduced motion and on low-end Android.

## Judge: Implementing front-end engineer: can it be built from src/components/ui plus the existing onboarding (Charter Desk) and guide parts, pass check:ui, reuse GuidedSetup, AutomaticWorkspace, RoleShell and the teacher palette, cover every engine state honestly, ship in slices, and avoid creating a second design language. Criteria (each 1-10): (1) Primitive reuse and check:ui feasibility; (2) Reuse of existing surfaces with no forks (GuidedSetup, AutomaticWorkspace, RoleShell, ChatDock, TeacherCommandPalette, SKO-460/470, Exam Studio); (3) Engine state coverage and honesty contract; (4) Effort and incremental shippability (can slice 1 ship on today's engine?); (5) Low risk of a second design language. Checked against the repo: automatic-workspace.tsx:54 has the 600 ms advance timer; AiGuide.tsx:12 has the poses wave|think|ready; RoleShell.tsx:95 says "no header search, SPEC §4.1 H2"; teacher/command-palette.tsx:52 already binds Cmd/Ctrl+K, and palette-bus.ts exists; chat-dock.tsx:87/149 uses fixed bottom-24 end-4; Card has a "featured" variant; Button has a "choice" variant; Progress has valueText; SealSlot has the states open|pending|pressed|failed; CharterLedger, StepDock, SheetRail, ConfirmedChoice, OptionCard and WeekStrip all exist; auth/WaxSeal exists; ExecutionPreview, assistant-entity-picker and setup-answer-analysis exist. There are no Stepper, TagList or grid/matrix primitives in src/components/ui today. → winner **U3-outcome**

| candidate | total | fatal flaws |
|---|---|---|
| U1-companion | 31 | The BuildStage tile set (9 bespoke illustrated components plus 66 pose variants across 11 personas) creates a second visual language, and the demo depends on it. |
| U2-console | 39 |  |
| U3-outcome | 40 |  |

**Graft:**
- U2: build the global ask entry by generalising the existing TeacherCommandPalette and palette-bus (command-palette.tsx:52 already binds Cmd/Ctrl+K) into an ask-bus with a Jump section, instead of adding a second Cmd+K listener; get founder sign-off for the header IconButton against RoleShell.tsx:95 "no header search".
- U2: page-registered context chips via useAskContext(chips), never scraped from the DOM, plus @-mentions that resolve to scoped entities as a pseudonymisation aid; privacy copy claims masking only for picked or chip entities until the engine masks free text.
- U2: RequestThread and run history persist through SKO-460's conversation model and SKO-470's run lifecycle; the private assistant is kept and linked, not replaced.
- U2: plan-level Go binds {questionnaireId, version, planVersion, stepPreviewHashes[]}; class C is never covered; any step whose preview drifts drops back to awaiting_confirm on its own.
- U2: extend /teacher-onboarding (its first section is the existing profile flow) rather than forking a teacher sheet; the SUPER_ADMIN sheet comes after the wizard instead of only /setup/readiness.
- U2: credit exhaustion becomes a resumable PAUSED, not FAILED; the step cap continues as a linked job seeded only with a summary and receipt ids.
- U2: the HandoffInbox (/ai/waiting) is a read index whose drawer deep-links to the exact record version using the existing #run- anchor pattern (runs-panel.tsx:36-37); it never has its own approve button.
- U2: CapabilityCatalogue has an honest header ("AI is connected to n of m things you can do") grouped by ROLE_NAV, with unconnected rows shown greyed, never hidden.
- U1: lane-level batching only when every step in that lane already has a preview; dependent steps confirm later. Use this as the fallback if per-step hash binding of the whole Build cannot be delivered.
- U1: the high-blast class B checkbox ("I've checked the list") instead of a typed phrase, because it is accessible and RTL-safe.
- U1: hand-off timeline stages appear only when true; omit "Opened" when the approval surface records no view signal.
- U1: page lists listen for a companion:receipt event carrying {capability, ids} and revalidate, so the new row appears behind the sheet.
- U1: a dev-time assertion that refuses to render a done or receipt state without step.receipt (pairs with U3's expectNoPrematureDone).
- U1: registry-owned localized step titles with slot values ("Create {count} classes") so EN/AR/UR do not depend on the model; Intl.PluralRules for Arabic's six plural forms.
- U1: the draft-only AI views (?view=ai, /teacher/ai) keep working with an info Alert pointing to the acting surface, rather than being deleted.
- U1: Skip (does not apply) vs Later (I'll do it myself) as two distinct choices; FollowUpList for deferred items in brand or berry tone, not warning.
- U1: a compact AiGuide companion with a small, bounded pose extension (listen, wait, puzzled) at most, reusing the existing persona CSS; no bespoke build-stage tiles.
- U1: an explicit founder decision on attendance.record_register (the README says class B, B.decisions says class C), set statically in the registry.

**Must fix:**
- The global shortcut collides with the existing TeacherCommandPalette Cmd/Ctrl+K binding (command-palette.tsx:52): merge into one palette via palette-bus rather than adding a second listener, and get sign-off against RoleShell's no-header-search rule.
- Do not let OutcomeBar "replace" the SKO-460 private assistant or fork its conversation store: reuse SKO-460 conversation persistence and SKO-470 run, approval and preview binding; the private assistant stays as a linked draft or read surface.
- The Build batch confirm must bind each class A/B step's own preview hash (or fall back to U1's per-lane cards), not a single opaque planHash; the ReviewSheet must list every record count; class C is never included.
- Signature moment 2 copy says "Staff invitations · 9 sent": change it to "9 queued · pending until accepted" so it matches its own rules 3 and 5.
- Hand-off status stepper: show "opened" only if the domain approval surface actually records a view event; otherwise omit the stage.
- The 7 new primitives (Stepper, TagList, GradeSectionGrid, SubjectMatrix, PeriodBuilder, AvailabilityGrid, RosterTable) must be composed of the existing Input, IconButton, Table, Button(choice) and FormField; tokens only, no title= tooltips, no font-black; run ui-token-codemod; add them to the adoption ratchet. RosterTable must route through the importBatch review token and never reach a prompt.
- Generate the TaskCard uiSchema defaults from the adapter's zod schema plus a field-kind library, so per-adapter UI cost stays near zero; the model fills values only, and the server re-validates and re-checks role, campus, permission and accessVersion on every write.
- Suggestion chips that skip the planning call must still get a server-built preview, hash and pendingKey and re-check gates when the card opens; a chip never carries a confirmation class chosen by the client.
- Pin the parent guardian-channel preference class to one static registry value (U3 says B, U1 says A) and resolve attendance.record_register A/B/C with the founder before slice 4.
- The 'yes' interception must be client-local with no model call and no credit charged, and the server must reject an answer on a WAITING_CONFIRM job (only a bound confirm is accepted).
- Slice 1 must delete the 600 ms client advance (automatic-workspace.tsx:54) and move to server- or worker-driven advancement with polling or backoff, without regressing today's GuidedSetup/ONBOARDING version binding.
- Replace the onboarding copy at src/app/onboarding/page.tsx:34 in the same slice that introduces the Build press, and in EN/AR/UR, so the promise is never untrue in between.


---

# A1-registry: a typed Capability Registry for AI Workflows and per-role first-login setup

# A1-registry: Capability Registry architecture for AI Workflows and per-role setup

Architect lens: **registry-first**. Read-only proposal, written 2026-10-23. It builds on Appendix A (700 capability rows) and Appendix B (B.engine, B.typedOps, B.roles, B.ui, B.qa, B.decisions) in `docs/product-review-2026-10/ai-automation-plan-2026-10-23/`. Statements about today's code cite file:line. Everything else is design.

---

## 1 Summary

Every write a role can make in Skoolee becomes **one typed, declarative registry entry**. The entry is the single source of truth for what the AI may do. The planner, the tool schemas the model sees, the gates, the confirmation class, idempotency, receipts, the lint that keeps coverage honest, and the generated tests all read from it. The two flagships share one engine:

- **AI Workflows**: free text → role-filtered and retrieved tool subset (≤24 tools, full descriptions) → OpenAI tool calling (strict JSON schemas) → a persisted **plan** (DAG of steps, each bound to one capability and one static class) → class A runs, class B waits for a hash-bound confirm, class C is prepared and handed to the existing approval surface → honest receipts.
- **First-login setup**: a per-role questionnaire whose questions declare which capabilities they feed → a **deterministic compiler** (no model on the happy path) turns confirmed answers into the same kind of plan → the same executor → readiness computed from live records.

What changes structurally compared with today:

| Today (verified) | Registry design |
|---|---|
| 12 tool names in a flat object (`src/lib/automation/catalog.ts:28-57`) plus 15 typed ops (`src/lib/school-ai/execution.ts:33-49`). A new tool means editing 4 files (`schema.ts:10-23`, `catalog.ts`, `role-action-service.ts:13-51`, `validation.ts:13-14`) | One `*.cap.ts` file per capability (or per small family) in a domain folder. Engine, schemas, tests and docs are derived from it |
| The model sees bare names (`service.ts:123`) | The model sees retrieved tools with descriptions, field descriptions, constraints and the confirmation note, as OpenAI function tools with `strict: true` |
| One action per step, two model calls, 30-step cap (`service.ts:114,127,132`) | One planning turn proposes many steps with dependencies. Lookups resolve inside the turn. Plan caps are per run and continuation is allowed |
| Everything auto-executes after 600 ms (`automatic-workspace.tsx:54`) | The class is static per capability. B requires `confirm(runVersion, stepKey, previewHash)`. A class C entry has no `execute` function at all, enforced by types |
| `[PERSON_n]` masks class and subject names (`pseudonymize.ts:37`, and any key ending in `name` via the `(…)?_?name$` pattern at `:36`) | Field-level PII annotations come from the registry and lookups return typed entities. Only people are tokenised. Class, subject and room labels stay in clear text |
| ≈223 inline-prisma capabilities with no callable service | A mechanical extract-to-service recipe with route parity tests. The route keeps its URL, auth, same-origin check and rate limits |

The audit's counts, recomputed from Appendix A: **700 rows = 418 direct + 57 wrapper + 223 inline-prisma + 2 none**. 32 rows are excluded by design (auth/signup/login, provider webhooks, payment simulators, system crons, MFA-bound subscription actions). That leaves **668 automatable**. Static class floors derived from the risk column give **≈11 A / 448 B / 207 C** before reviewed overrides. Overrides can only lower a floor to A for self-scoped writes such as own profile or own study plan, and that requires CODEOWNERS review.

---

## 2 Components and directory layout

```
src/lib/capabilities/                     # THE REGISTRY (no engine logic)
  core/
    types.ts                  # CapabilityDefinition, Gate, ScopeRule, Receipt, Lookup, ClassFloor
    define.ts                 # defineCapability(), defineVariants(), defineLookup(), defineExclusion()
    gates.ts                  # combinators wrapping EXISTING predicates (scope.ts, permissions.ts, institution.ts, seats.ts, capabilities.ts)
    scope.ts                  # scope rules: self | own-children | assigned-classes | own-campus | school | platform
    classes.ts                # risk → class floor table; runtime escalation by policy (upward only)
    idempotency.ts            # strategies: native | tx-receipt | natural-key | conflict-as-replay | unsafe
    receipts.ts               # base receipt schema (effect, refs, counts, link) + helpers
    pii.ts                    # field PII annotations (person|student|guardian|phone|email|address|id|free-text)
    i18n.ts                   # title/preview keys resolved from copy catalogs (en/ar/ur)
  domains/                    # one folder per Appendix A cluster, one file per capability or variant family
    c1-academic-structure/  { index.ts, periods.cap.ts, calendar.cap.ts, rooms.cap.ts, exam-schedule.cap.ts, rollover.cap.ts, typed-ops.cap.ts, lookups.ts }
    c2-people-access/       { leave.cap.ts, staff-invitations.cap.ts, teacher-attendance.cap.ts, ... }
    c3-students-family/     { family-leave.cap.ts, admissions.cap.ts, guardians.cap.ts, students.cap.ts, ... }
    c4-teaching-assessment/ { marks.cap.ts, homework.cap.ts, resources.cap.ts, lesson-plans.cap.ts, ... }
    c5-attendance-comms/    { attendance-register.cap.ts, meetings.cap.ts, announcements.cap.ts, ... }
    c6-finance/             { fees-collect.cap.ts, fee-setup.cap.ts, adjustments.cap.ts, payroll.cap.ts, ... }
    c7-campus-ops/          { library-desk.cap.ts, library-catalogue.cap.ts, front-desk.cap.ts, transport.cap.ts, ... }
    c8-platform-governance/ { campus.cap.ts, institution.cap.ts, delegation.cap.ts, ... }
    personal/               { profile.cap.ts, private-plan.cap.ts }      # today's profile.update / personal.save_plan
  exclusions.ts               # handlers deliberately not automatable, each with a category + reason
  registry.ts                 # assembles all domains into a frozen Map<CapabilityKey, CapabilityDefinition>
  generated/                  # build outputs, committed, verified by lint (hash check)
    manifest.json             # key → {version, class, roles, cluster, source route/action, reuse, risk}
    tool-schemas.json         # strict JSON Schema per capability (from zod via z.toJSONSchema; zod 4.4.1 already used in src/lib/ai/output-schema.ts:11)
    route-coverage.json       # every API write handler / server action → capability keys | exclusion
    search-index.json         # BM25 index over en/ar/ur titles, aliases, examples (no PII)

src/lib/automation/                        # THE ENGINE (rewritten in place; same folder, same API routes)
  run-store.ts                # SchoolAiRun + SchoolAiRunStep persistence, version CAS (replaces reply-JSON CAS, service.ts:94)
  planner.ts                  # one planning turn: retrieve → prompt → tool calls → validated Plan
  retrieval.ts                # role pre-filter → lexical/domain-router retrieval → live gate check
  prompt.ts                   # system prompt, tool rendering, language rules
  entities.ts                 # local name→id pre-resolution and PII tokenisation of the user's own text
  evidence.ts                 # normalized evidence-span matching (NFKC, digits, tatweel, whitespace)
  executor.ts                 # step state machine: A run / B confirm / C hand-off; ref resolution
  confirm.ts                  # preview rendering + previewHash, batch confirm (set hash)
  handoff.ts                  # class C: domain request objects or SchoolAiHandoff prefill + completion reconcile
  intents.ts                  # write-ahead intent ledger (school_ai_action_intents)
  outcomes.ts                 # executed | answered | plan_saved | awaiting_approval | partial | blocked
  credits.ts                  # reservation + per-model-call charging (wraps openai.ts:505,522)
  gaps.ts                     # structured "unsupported" demand records
  worker.ts                   # fair per-tenant sweep; runs A steps and planning only, never WAITING_CONFIRM
  legacy/                     # today's catalog/role-action-service/students/platform kept as adapters during migration

src/lib/role-setup/                        # FIRST-LOGIN QUESTIONNAIRE PIPELINE
  questionnaires/{admin,campus-admin,super-admin,principal,teacher,accountant,librarian,receptionist,parent,student,app-owner}.ts
  compiler.ts                 # answers + live state → Plan (deterministic mappers)
  prefill.ts                  # facts already known (wizard, invitation, allocations, guardian links)
  readiness.ts                # per-role readiness checks over live data (generalises setup-journey-service.ts:10-41)
  free-text.ts                # optional model parse of a free-text answer into the typed shape (reuses setup-analysis-service.ts:16-61)

src/lib/ai/openai.ts                       # + completeWithTools(): tools, tool_choice, strict schemas, same policy/PII/credit path
src/lib/ai/pseudonymize.ts                 # fix SENSITIVE_KEYS; accept explicit field annotations

scripts/capabilities/
  inventory-to-json.ts        # Appendix A markdown → capability-inventory.json (one-time + refresh)
  scaffold.ts                 # emits draft *.cap.ts from inventory rows (key, roles, risk floor, source, TODOs)
  scan-handlers.ts            # ts-morph AST scan of src/app/api/**/route.ts + "use server" files (11 under src/app/actions)
  extract-service.ts          # codemod helper for inline-prisma routes (see §7.4)
  build-registry.ts           # writes generated/*; fails on drift
  check-capabilities.ts       # the lint (npm run check:capabilities; also inside npm run build like check:ui)

src/app/api/automation/
  route.ts                    # GET list / POST start (kept, same rate limit route.ts:8)
  [id]/route.ts               # POST advance|answer|pause|resume|cancel (kept; adds cancel)
  [id]/steps/[stepKey]/confirm/route.ts     # NEW: B confirmation, hash-bound
  [id]/confirm-batch/route.ts               # NEW: confirm a set of B steps with a set hash
  [id]/events/route.ts                      # NEW: SSE status stream (replaces the 600 ms advance poll)
src/app/api/automation/handoffs/[id]/route.ts   # NEW: read prefill, mark complete/decline (called by domain screens)
src/app/api/role-setup/route.ts + [id]/route.ts # NEW: questionnaire draft/confirm/compile/run
```

### 2.1 Core TypeScript shapes

```ts
// src/lib/capabilities/core/types.ts
import type { z } from "zod";
import type { AuthUser } from "@/lib/api/scope";
import type { TxClient } from "@/lib/db/prisma";

export type Role = "APP_OWNER"|"SUPER_ADMIN"|"ADMIN"|"CAMPUS_ADMIN"|"PRINCIPAL"|"TEACHER"
  |"ACCOUNTANT"|"LIBRARIAN"|"RECEPTIONIST"|"STUDENT"|"PARENT";
export type Risk = "READ"|"CREATE"|"UPDATE"|"DESTRUCTIVE"|"APPROVAL_DECISION"|"FINANCIAL"
  |"ACCESS_GRANT"|"COMMUNICATION"|"PUBLISH";                         // Appendix A risk column
export type ConfirmationClass = "A" | "B" | "C";
export type Cluster = "C1"|"C2"|"C3"|"C4"|"C5"|"C6"|"C7"|"C8"|"PERSONAL";

export interface CapabilityContext {
  user: AuthUser;                 // re-resolved from DB for every evaluation (role, campus, accessVersion)
  campusId: string | null;
  permissions: PermissionSnapshot; // loaded once per request (permissions.ts:332-343), memoised
  seats: () => Promise<CampusSeats>; // lazy (seats.ts:12-27)
  locale: "en"|"ar"|"ur";
  now: Date;
}

export interface Gate {
  id: string;                                  // e.g. "perm:library.add", "pred:canManageLibrary", "seat:libraryDesk"
  provenance: string[];                        // predicates/assertions the source route calls, checked by lint against the AST
  check(ctx: CapabilityContext): Promise<GateResult> | GateResult;
}
export type GateResult = { ok: true } | { ok: false; code: "ROLE"|"PERMISSION"|"SEAT"|"SCOPE"|"PLAN"|"SUSPENDED"; whoCan?: Role[] };

export type ScopeRule =
  | { kind: "self" }
  | { kind: "own-children"; permission: "attendance"|"fees"|"communication"|"results" }  // guardianHasAccess
  | { kind: "assigned-classes" }                                                         // teacher record-relative
  | { kind: "own-campus" }                                                               // resolveCampusId (scope.ts:328-349)
  | { kind: "school" } | { kind: "platform"; reason: string };                            // runUnscoped with reason

export type Idempotency<I> =
  | { strategy: "native"; keyField: keyof I | "__option" }                 // service takes an idempotency key
  | { strategy: "tx-receipt" }                                              // service accepts { tx }; intent+receipt in same tx
  | { strategy: "natural-key"; reconcile(ctx: CapabilityContext, input: I, intent: IntentRow, tx: TxClient): Promise<unknown | null> }
  | { strategy: "conflict-as-replay"; conflictCodes: number[]; reconcile: (ctx: CapabilityContext, input: I, intent: IntentRow, tx: TxClient) => Promise<unknown | null> }
  | { strategy: "unsafe"; reason: string };                                 // lint: not allowed for A/B; entry stays disabled

export interface PreviewModel {                // rendered by the UI with shared primitives, never model prose
  titleKey: string; params: Record<string, string | number>;
  rows: Array<{ labelKey: string; value: PreviewValue; changed?: boolean }>;
  warnings: Array<{ key: string; params?: Record<string, string|number> }>;   // e.g. "guardians will be notified"
  counts?: Record<string, number>;
}

interface Base<I, R> {
  key: CapabilityKey;                          // "library.desk.issue_copy" (stable; tool name = key with "." → "__")
  version: number;                             // bump when schema/semantics change; part of idempotency + preview hash
  cluster: Cluster; domain: string;
  risk: Risk;                                  // from Appendix A; drives the class floor
  roles: readonly Role[];                      // static pre-filter, must be consistent with gates (matrix test)
  title: I18nKey; description: string;         // description is EN, sent to the model (≤ 600 chars, lint)
  aliases: { en: string[]; ar: string[]; ur: string[] };   // retrieval only
  input: z.ZodType<I>;                         // IMPORTED from the service module, never redefined here
  pii: Partial<Record<FieldPath<I>, PiiKind>>; // which input fields carry personal data
  gates: Gate[]; scope: ScopeRule;
  lookups: CapabilityKey[];                    // read companions for name→id resolution (class A reads)
  produces?: Record<string, ReceiptPath<R>>;   // named outputs later steps may reference ("@s1.loanId")
  receipt: z.ZodType<R & BaseReceipt>;
  examples: Array<{ request: { en: string; ar?: string; ur?: string }; input: I }>;  // parsed by lint; no PII
  source: { route?: `${"POST"|"PUT"|"PATCH"|"DELETE"|"GET"} /api/${string}`; action?: string; serverAction?: string; service: string };
  reuse: "direct"|"wrapper"|"extracted";       // "extracted" once an inline-prisma route was lifted
  evidence?: { perItem?: FieldPath<I> };       // e.g. attendance entries: each needs its own evidence span
  sod?: { makerCapability: CapabilityKey; rule: "different-actor" };
  testFixture?: (db: TestDb, t: TestTenant) => Promise<I>;  // required for A/B (lint)
}

export interface ExecutableCapability<I, R> extends Base<I, R> {
  class: "A" | "B";
  idempotency: Idempotency<I>;
  preview?(ctx: CapabilityContext, input: I): Promise<PreviewModel>;   // required for B (lint)
  execute(ctx: CapabilityContext, input: I, opts: { idempotencyKey: string; tx?: TxClient }): Promise<R>;
}
export interface HandoffCapability<I, R> extends Base<I, R> {
  class: "C";                                  // NO execute member: the engine cannot apply it
  preview(ctx: CapabilityContext, input: I): Promise<PreviewModel>;
  handoff: {
    mode: "domain-request" | "prefill";        // create the domain's own pending object, or prefill an existing screen
    prepare(ctx: CapabilityContext, input: I, opts: { idempotencyKey: string }): Promise<{ domainRef?: { model: string; id: string }; surface: SurfaceLink; approverRoles: Role[] }>;
    completedBy: { event?: string; reconcile?(ctx: CapabilityContext, ref: { model: string; id: string }): Promise<"OPEN"|"COMPLETED"|"DECLINED"> };
  };
}
export type CapabilityDefinition<I = any, R = any> = ExecutableCapability<I, R> | HandoffCapability<I, R>;

export interface BaseReceipt {
  effect: "created"|"updated"|"deleted"|"queued"|"handed_off"|"draft"|"read";
  refs: Array<{ model: string; id: string }>;
  counts?: Record<string, number>;
  link?: SurfaceLink;                           // deep link to the record in its own screen
}
```

`defineVariants()` splits a multi-action operation into separately classed capabilities. `setup.apply_changes` has 11 actions (`school-setup-service.ts:124-151`) and becomes `setup.rooms` (B), `setup.periods` (B), `setup.subjects` (B), `setup.teacher_allocations` (B), `setup.weekends` (B), `setup.holidays.create|update` (B), `setup.holidays.delete` (C), `setup.staff_invitations` (B, invitations stay pending), `setup.guardians` (C, access), `setup.transfers` / `setup.withdrawals` (C), and `setup.migration_cutover` (C). All of them still execute through `executeSchoolAiTool` with a fixed `action`.

### 2.2 Gate combinators (carried, never reinvented)

```ts
// src/lib/capabilities/core/gates.ts
export const perm = (module: PermissionModule, action: "view"|"add"|"edit"|"delete"): Gate;   // moduleFlags (permissions.ts:316-323)
export const pred = (name: keyof typeof SCOPE_PREDICATES): Gate;   // canManageLibrary, canMarkAttendance, canManageFinance, canLeadAcademics (scope.ts:219-318)
export const seat = (key: "academicLead"|"financeDesk"|"libraryDesk"|"frontDesk"): Gate;     // capabilities.ts:166-169
export const capKey = (key: CapabilityKey): Gate;                  // corrections, careMember, memberships, institutionAuthority ...
export const roleIn = (...roles: Role[]): Gate;
export const operational = (): Gate;                               // assertSchoolOperational
export const schoolAiOp = (op: SchoolAiOperation): Gate;           // allowedSchoolAiOperations ∩ hasMatrixToolPermission (access.ts:84-89; execution.ts:115-128)
```

Each combinator calls the existing function. `provenance` lists the function names, and the lint compares them with what the source route calls (§7.3). A permission snapshot alone is never enough for the 34 capability-key-gated features (B.roles finding 2). Those entries must include the matching `capKey()` or `pred()` gate.

### 2.3 Four example entries

**Teacher attendance (class B, per-pupil evidence).** This one is for TEACHER. It reuses `saveRegister` (`src/lib/attendance/register.ts:96`), which already enforces `canMarkAttendance` + `attendance.add`, knownStatus conflicts and correction reasons.

```ts
// src/lib/capabilities/domains/c5-attendance-comms/attendance-register.cap.ts
import { saveRegisterInput, saveRegister, registerView } from "@/lib/attendance/register"; // input schema exported by the service (extraction step)
export const saveClassRegister = defineCapability({
  key: "attendance.register.save", version: 1, cluster: "C5", domain: "attendance", risk: "CREATE",
  class: "B",
  roles: ["TEACHER", "ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"],
  title: "cap.attendance.register.save.title",
  description: "Save one class's attendance register for one school day from what the user says they observed. "
    + "Every pupil the user mentions needs their own evidence. Pupils not mentioned stay unmarked; never assume 'present'. "
    + "Use attendance.register.view first to get the roster and each pupil's knownStatus. Requires the user's confirmation.",
  aliases: { en: ["attendance", "register", "mark absent", "roll call"], ar: ["الحضور", "سجل الحضور", "غائب"], ur: ["حاضری", "رجسٹر", "غیر حاضر"] },
  input: saveRegisterInput,          // { classId, date, entries[{studentId, status, arrivalTime?, departureTime?, knownStatus}], submit: false, reason? }
  pii: { "entries[].studentId": "student" },
  gates: [pred("canMarkAttendance"), perm("attendance", "add"), operational()],
  scope: { kind: "assigned-classes" },             // TEACHER: class teacher or subject teacher of classId
  lookups: ["attendance.register.view", "classes.mine.list", "students.roster.search"],
  evidence: { perItem: "entries" },                // each entry carries its own span; "all present" is refused (B.decisions T3)
  idempotency: { strategy: "tx-receipt" },          // saveRegister gains { tx } option; converges anyway via knownStatus
  preview: async (ctx, input) => diffAgainst(await registerView(ctx.user, input.classId, input.date), input), // full register, changed rows flagged
  execute: (ctx, input, o) => saveRegister(ctx.user, { ...input, submit: false }, { tx: o.tx }),
  receipt: registerReceipt,           // { effect: "updated", refs: [{model:"attendance", id}...], counts: {marked, unchanged, conflicts}, link: /teacher/attendance?classId&date }
  examples: [{ request: { en: "7B today: everyone present except Ali and Sara", ur: "7B کی آج کی حاضری: سب حاضر سوائے علی اور سارہ" },
               input: /* produced after lookups; "everyone present" becomes per-pupil PRESENT rows, each citing the span "everyone present" scoped to the roster shown in the preview */ }],
  source: { route: "POST /api/attendance/register", service: "src/lib/attendance/register.ts#saveRegister" }, reuse: "direct",
  testFixture: registerFixture,
});
// attendance.register.submit is a separate capability: class B with a preview warning
// "guardians of absent pupils will be notified", because submission triggers family notices (Appendix A C5 notes).
```

On "everyone present except Ali and Sara": the roster preview lists every pupil, so the span covers the visible roster and the teacher confirms the full register (decision 6 in the README). If the teacher says only "Ali and Sara were absent", the others stay unmarked and the plan asks.

**Library issue (class B).** For LIBRARIAN or an operator holding the desk. It reuses `issueCopy` (`src/lib/library/desk.ts:95`).

```ts
export const issueCopy = defineCapability({
  key: "library.desk.issue_copy", version: 1, cluster: "C7", domain: "library", risk: "CREATE", class: "B",
  roles: ["LIBRARIAN", "ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN", "PRINCIPAL"],
  description: "Lend one physical copy (by barcode) to one library member. Due date follows the campus loan rules. "
    + "If the copy is held for another reader, an override reason of 8-300 characters is required and must come from the user.",
  input: issueCopyInput,              // exported from desk.ts: { memberId, barcode, overrideReason? }
  pii: { memberId: "person" },
  gates: [pred("canManageLibrary"), perm("library", "add"), seat("libraryDesk")],   // perm pairs with pred: B.roles finding re PRINCIPAL
  scope: { kind: "own-campus" },
  lookups: ["library.copies.find", "library.members.find"],   // "Atlas of the World" → available copies; "Ayesha 7B" → member
  produces: { loanId: "refs[0].id" },
  idempotency: { strategy: "natural-key",
    reconcile: (ctx, i, intent, tx) => tx.bookIssue.findFirst({ where: { schoolId: ctx.user.schoolId, memberId: i.memberId, copy: { barcode: i.barcode }, returnedAt: null, issuedAt: { gte: intent.createdAt } } }) },
  preview: (ctx, i) => issuePreview(ctx, i),      // copy, title, member + class, due date from currentRules (desk.ts:33)
  execute: (ctx, i) => issueCopyService(ctx.user, i),
  receipt: loanReceipt, source: { route: "POST /api/library/desk", action: "issue", service: "src/lib/library/desk.ts#issueCopy" }, reuse: "direct",
  examples: [{ request: { en: "issue Atlas of the World to Ayesha in 7B until Friday" }, input: { memberId: "@lookup", barcode: "@lookup" } }],
  testFixture: libraryFixture,
});
```

The service has no key, so this entry uses natural-key reconcile. A blind replay would fail 409 at the conditional update (`desk.ts:112-113`), which keeps it safe but not transparent. "Until Friday" conflicts with the rules-derived due date. The preview shows the rule date, and the plan raises an `ask` if the user's date differs, because the service does not accept a due date.

**Accountant payment (class C, prefill hand-off).** It reuses the existing Collect desk, `POST /api/fees/collect`. That route already requires `idempotencyKey` + request hash (Appendix A C6 row `fees.collect_payment`; `collect/route.ts:56-69`).

```ts
export const collectPayment = defineCapability({
  key: "fees.collect_payment", version: 1, cluster: "C6", domain: "fees", risk: "FINANCIAL", class: "C",
  roles: ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"],
  description: "Prepare a fee payment against one open invoice for the finance desk to record. Never records money itself. "
    + "Amount is in minor units of the campus currency. Method: CASH|BANK|CHEQUE|SAFEPAY|MOBILE_WALLET.",
  input: collectPaymentInput,         // extracted from collect/route.ts into src/lib/fees/collect-service.ts
  pii: { studentId: "student", referenceNumber: "id" },
  gates: [pred("canManageFinance"), perm("fees", "add"), seat("financeDesk"), operational()],
  scope: { kind: "own-campus" },
  lookups: ["fees.invoices.open_for_student", "students.roster.search", "guardians.find"],   // "Bilal's father" → guardian → children → open October invoice
  preview: collectPreview,            // invoice no., period, balance before/after, carry-forward effect (payment.ts:32-58)
  handoff: {
    mode: "prefill",
    prepare: async (ctx, i, o) => ({ surface: { path: "/accountant", query: { view: "payments", handoff: "<id>" } }, approverRoles: ["ACCOUNTANT"] }),
    completedBy: { event: "FEE_PAYMENT_RECORDED" },   // the Collect screen posts with the hand-off's idempotency key; reconcile by key
  },
  receipt: paymentReceipt, source: { route: "POST /api/fees/collect", service: "src/lib/fees/collect-service.ts#collectPayment" }, reuse: "extracted",
  examples: [{ request: { en: "record Rs 12,000 cash from Bilal's father for October" }, input: { /* resolved */ } as never }],
});
```

The accountant presses the existing Collect button. The AI never posts money. The hand-off row carries the idempotency key, so a double click or a retry still records one payment. Credits, waivers and refunds use `mode: "domain-request"` through `requestAdjustment` (`src/lib/fees/adjustments-service.ts:10-18`). That closes the governance bypass where AI CREDIT edits invoice totals directly (Appendix A C6 note; `finance-operations-service.ts:143-155`).

**Parent leave request (class B).** It reuses `requestLeave` (`src/lib/family/leave.ts:34`), which already checks `guardianHasAccess(..., "attendance")`, the max days, today-or-later and overlap under a row lock.

```ts
export const requestLearnerLeave = defineCapability({
  key: "family.leave.request", version: 1, cluster: "C3", domain: "family", risk: "CREATE", class: "B",
  roles: ["PARENT"],
  description: "Ask the school to excuse your child for one or more days from today onward (at most the school's maximum). "
    + "The school decides; this is a request, not approval. A reason of at least 3 words from the parent is required.",
  input: requestLeaveInput,           // exported from leave.ts: { studentId, fromDate, toDate?, reason }
  pii: { studentId: "student", reason: "free-text" },
  gates: [roleIn("PARENT"), operational()],
  scope: { kind: "own-children", permission: "attendance" },
  lookups: ["family.children.list"],  // a single-child parent needs no question
  idempotency: { strategy: "conflict-as-replay", conflictCodes: [409],
    reconcile: (ctx, i, intent, tx) => tx.learnerLeaveRequest.findFirst({ where: { schoolId: ctx.user.schoolId, studentId: i.studentId, requestedById: ctx.user.userId, createdAt: { gte: intent.createdAt } } }) },
  preview: leaveRequestPreview,       // child, dates in school timezone, "the school will decide"
  execute: (ctx, i, o) => requestLeave(ctx.user, i, { tx: o.tx }),
  receipt: leaveRequestReceipt,       // effect "created", link /parent/attendance?leave=<id>; outcome text "requested, awaiting the school"
  source: { route: "POST /api/family/leave", service: "src/lib/family/leave.ts#requestLeave" }, reuse: "direct",
  examples: [{ request: { en: "Zara will be away Thursday and Friday for a family wedding", ar: "زارا ستغيب يومي الخميس والجمعة لحضور زفاف عائلي" }, input: { /* … */ } as never }],
  testFixture: familyLeaveFixture,
});
```

---

## 3 Data model changes (Prisma) and migrations

The rule is to reuse SKO-470's run lifecycle and SKO-460's conversations, not fork them. Every new table carries `school_id` (+ `campus_id` where scoped), goes through `gen-tenant-registry.mjs`, and uses hand-written SQL per folder, applied to dev Supabase via `DIRECT_URL`.

**3.1 Extend `SchoolAiRun`** (`prisma/schema.prisma:6933-6964`). Today it holds approved-record steps as JSON (`runs.ts:4`). Add these columns:

```prisma
  origin        String  @default("SCHEDULED") // SCHEDULED | CHAT | ROLE_SETUP
  conversationId String? @map("conversation_id")   // SKO-460 SchoolAiConversation
  roleSetupId   String? @map("role_setup_id")
  language      String  @default("en")
  planHash      String? @map("plan_hash")
  outcome       String? // executed | answered | plan_saved | awaiting_approval | partial | blocked
  claimToken    String? @map("claim_token")
  leaseExpiresAt DateTime? @map("lease_expires_at")
  creditsReserved Int   @default(0) @map("credits_reserved")
  runSteps      SchoolAiRunStep[]
```

The existing `status` set (QUEUED/PAUSED/BLOCKED/COMPLETED/CANCELLED/EXPIRED, `runs.ts:10`) gains RUNNING, WAITING_INPUT and WAITING_CONFIRM. Scheduled record-based runs keep using `steps` JSON until run-service migrates (§9).

**3.2 New `SchoolAiRunStep`** (normalised steps; this removes the CAS-on-whole-JSON problem at `service.ts:94`):

```prisma
model SchoolAiRunStep {
  id String @id @default(uuid())
  schoolId String @map("school_id")
  campusId String? @map("campus_id")
  runId String @map("run_id")
  run SchoolAiRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  stepKey String @map("step_key")                 // "s1", "s2" (model) or "setup.classes.7" (compiler)
  ordinal Int
  capabilityKey String @map("capability_key")
  capabilityVersion Int @map("capability_version")
  class String                                    // A | B | C, copied from the registry at plan time; re-asserted at execute
  status String @default("PROPOSED")              // PROPOSED|READY|WAITING_INPUT|WAITING_CONFIRM|RUNNING|SUCCEEDED|HANDED_OFF|COMPLETED_ELSEWHERE|FAILED|SKIPPED|BLOCKED
  dependsOn Json @default("[]") @map("depends_on")
  input Json                                      // unmasked, server-side only; refs like "@s1.loanId" until resolved
  inputHash String @map("input_hash")
  preview Json?
  previewHash String? @map("preview_hash")
  evidence Json @default("[]")                    // [{source:"request"|"answer:<n>", start, end, normalized}]
  idempotencyKey String @map("idempotency_key")
  receipt Json?
  handoffId String? @map("handoff_id")
  errorCode String? @map("error_code")
  attempts Int @default(0)
  confirmedById String? @map("confirmed_by_id")
  confirmedAt DateTime? @map("confirmed_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@unique([runId, stepKey])
  @@unique([schoolId, idempotencyKey])
  @@index([schoolId, status])
  @@map("school_ai_run_steps")
}
```

**3.3 New `SchoolAiActionIntent`** (write-ahead ledger; replaces `AUTOMATIC_ACTION_V1` rows in `schoolAiRequest`, `role-action-service.ts:26,52`). Columns: `schoolId, campusId, actorId, idempotencyKey @unique per school, capabilityKey, capabilityVersion, inputHash, status INTENT|COMMITTED|RECONCILED|FAILED, receipt Json?, createdAt, committedAt`.

**3.4 New `SchoolAiHandoff`** (class C). Columns: `id, schoolId, campusId, runStepId, capabilityKey, mode prefill|domain-request, surface Json, payload Json (prefill, unmasked), previewHash, idempotencyKey, makerId, approverRoles Json, domainModel?, domainId?, status OPEN|COMPLETED|DECLINED|EXPIRED|SUPERSEDED, completedReceipt Json?, expiresAt`. Index `(schoolId, campusId, status)`. Domain screens read it with `?handoff=<id>` and the record is re-authorised for the viewer.

**3.5 New `SchoolAiCapabilityGap`** (structured "unsupported", fixing `service.ts:155`). Columns: `schoolId, role, locale, intentLabel (masked), nearestCapabilityKeys Json, reason ROLE_LACKS|NOT_AUTOMATED|EXCLUDED|AMBIGUOUS, count, lastSeenAt`. It is unique per `(schoolId, role, intentLabel)` and holds no raw text.

**3.6 New `SchoolAiRoleSetup`** (per-user, per-role questionnaire; families included, so it cannot be a staff-only `SchoolAiRecord` kind, `access.ts:35-40`). Columns: `schoolId, campusId?, userId, role, questionnaireKey, questionnaireVersion, answers Json (typed per role schema), confirmedKeys Json, status DRAFT|CONFIRMED|PLANNED|RUNNING|READY|PARTIAL|SKIPPED, runId?, version, completedAt`. It is unique on `(schoolId, userId, questionnaireKey)`. The admin campus questionnaire migrates from the ONBOARDING `SchoolAiRecord` (§8.5).

**3.7 Reused unchanged:** `SchoolAiExecution` (typed ops keep their execution receipts and uniques, `schema.prisma:6707-6729`), `SchoolAiSetupTask` (for "needs another person" items, with assignee and status, `:6798-6829`), `SchoolAiConversation`, `AIUsageLog`, `AuditLog`.

**Migration folders:** `2026xxxx_ai_registry_runs` (3.1, 3.2, 3.3), `…_ai_handoffs_gaps` (3.4, 3.5), `…_role_setups` (3.6). The last one includes a data step that copies ONBOARDING record answers into `SchoolAiRoleSetup` for ADMIN/CAMPUS_ADMIN, with the legacy keys preserved under `answers.legacy`. Every folder needs `migrate status`, a drift check, `prisma generate`, `gen-tenant-registry`, and a dev server restart.

---

## 4 How the model is prompted

### 4.1 Tool retrieval: a relevant subset, never a flat list

1. **Static role pre-filter** (free): `registry.byRole(user.role)`. For a TEACHER that is about 148 entries, for a PARENT about 41.
2. **Candidate retrieval** (no model call):
   - (a) BM25 over `search-index.json`, built from en/ar/ur titles, aliases and example requests, after normalising the query: NFKC, Arabic/Urdu diacritics and tatweel removed, Arabic-Indic and Extended Arabic-Indic digits mapped to ASCII. Take the top 16.
   - (b) **Domain router**: the role's domains (≤ 15 per role) are listed in the system prompt as one line each. The model may call a meta-tool `open_domain(domain)` once per turn to load that domain's tools if the lexical set missed.
   - (c) **Sticky set**: the capabilities already in the current plan plus their `lookups`.
3. **Live gate check** on the candidates only. Gates are memoised per request; seats and duty queries are lazy. Only tools whose gates pass are sent. Tools that are role-listed but gate-failing go into a short "not available to you because…" list with `whoCan`, so the model can answer honestly. This replaces free-text "unsupported".
4. **Cap**: ≤ 24 write tools + ≤ 12 lookup tools per turn. Measured target: ≤ 9k prompt tokens for tools.

Embeddings are an optional phase 2 (decision D3). Descriptions are PII-free, so vectors could be built offline. Query embedding is an extra provider call on (masked) user text with cost and latency, so lexical + domain router is the default.

### 4.2 What is actually sent

Each capability becomes an OpenAI function tool. `name` is the key with `.` → `__` (e.g. `library__desk__issue_copy`, within `[a-zA-Z0-9_-]{1,64}`). `description` is the registry description plus a generated suffix:

> "Confirmation: the user must confirm the preview." | "Hand-off: prepares this for {approverRoles} to approve in {surface}; it does not apply it." | "Runs immediately."

`parameters` is generated by `z.toJSONSchema(input)` (zod 4.4.1) and post-processed for `strict: true`:
- every property becomes required, with optional fields turned into `["type","null"]`
- `additionalProperties: false`
- field `.describe()` text is carried over
- every id-typed field is widened to `anyOf: [{id pattern}, {pattern: "^@[a-z0-9_]+\\.[A-Za-z0-9_.\\[\\]]+$"}, {pattern: "^\\[(STUDENT|PERSON)_\\d+\\]$"}]`. This lets a step reference a prior step's `produces` output or a pseudonym token.

Codegen also appends a standard `_step` envelope to every write tool:

```json
{"_step": {"type":"object","additionalProperties":false,"required":["key","dependsOn","evidence"],
  "properties":{"key":{"type":"string","pattern":"^s[0-9]{1,3}$"},
                "dependsOn":{"type":"array","items":{"type":"string"}},
                "evidence":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["source","quote"],
                  "properties":{"source":{"type":"string","enum":["request","answer"]},"answerIndex":{"type":["integer","null"]},"quote":{"type":"string","maxLength":300}}}}}}}
```

Meta-tools, always present: `ask_user({questions:[{field, capability, prompt}]})`, `answer({text})`, `report_unsupported({intent, nearest:[keys]})`, `open_domain({domain})`, `finish_plan({summary})`.

### 4.3 Protocol per planning turn (one invocation, ≤ 45 s total, under `maxDuration = 60`)

```
loop (≤ 4 rounds, each one provider call with tool_choice:"required", parallel_tool_calls:true):
  model → tool_calls
    lookups (class A reads)   → executed now, results MASKED (§4.5) and returned as tool messages
    open_domain               → tools added, next round
    write tools               → validated (zod), evidence-checked, stored as PROPOSED steps (not executed)
    ask_user / answer / report_unsupported / finish_plan → end turn
plan validation: DAG acyclic; every "@sN.x" resolves to a declared `produces`; classes copied from registry;
                 per-step gate + scope check; SoD; evidence spans valid → run status:
                 A-only ready steps run; B → WAITING_CONFIRM; C → hand-offs prepared
```

There is no prose JSON. Responses arrive as `tool_calls` with strict schemas, so the JSON-repair branch (`service.ts:135-141`) and the uncaught `SyntaxError` path (`service.ts:128,134`) disappear. If a strict schema still fails zod refinements (cross-field rules), the engine returns the zod issue to the model as the tool result once, then stops with a user-visible question. `src/lib/ai/openai.ts` gains `completeWithTools({messages, tools, toolChoice, signal})` next to `completeChat` (`openai.ts:229-233`). It goes through the same provider policy (`:88-129`), `assertNoPII` over the serialized messages **and** tool results, and the same timeout/abort handling.

### 4.4 Language (EN/AR/UR)

- The system prompt is English and fixed. It contains no school content (rule from §10 of the README).
- The user's text is passed as typed, in any script.
- The model is told: "Write ask_user prompts, answer text and finish_plan summary in `{language}`."
- Everything else the user sees is rendered by the server from the registry and copy catalogs, never from model prose: step titles, preview rows, warnings, outcomes, hand-off labels. Arabic and Urdu therefore do not depend on the model for anything consequential.
- Server error codes map to localized copy. Today errors are English-only (`automatic-workspace.tsx:13,39,48-50`; `service.ts` throughout).

Evidence matching (`evidence.ts`) replaces `String.includes` (`service.ts:152`):
- It runs against **user-authored text only**. The run stores `userRequest` and `answers[]` separately from the server-generated context, so quotes of the interview prompt or of canned UI text cannot match (the B.engine finding).
- Both sides are normalised: NFKC, case-fold, whitespace collapse, ZWNJ/tatweel/diacritics removal, digit unification, quote-character unification.
- The match is a token-level contiguous span with ≥ 0.9 overlap on the shorter side. A quote must be ≥ 2 tokens unless the whole user text is shorter.
- The engine stores the span offsets, not the quote.

### 4.5 Pseudonymisation that does not mask class or subject names

1. **Fix the key classifier** (`pseudonymize.ts:34-42`). Replace `/(full|guardian|…)?_?name$/i` and `/^name$/i`, which together match `name`, `className`, `subjectName`, `schoolName` and `campusName`, with an explicit allow-list: `fullName, studentName, guardianName, parentName, fatherName, motherName, teacherName, staffName, contactName, principalName, displayName`. Add the rule that `name` is PERSON only when the object carries `kind: "person"`.
2. **Registry annotations**: `pii` on inputs, plus every lookup's output schema, declare which fields are people. The masker uses annotations first and keys as a fallback.
3. **Typed lookup results**: lookups return `{kind:"student", token:"[STUDENT_3]", class:"7B", rollNo:"12"}` to the model. The real `{id, fullName}` stays in the server-side token map for the run. Class, subject, room, book title and period labels are sent as clear text. A lookup result is never stored as a step receipt that is replayed into later prompts (fixes `service.ts:68-69`).
4. **Masking the user's own text** (`entities.ts`, no model): before the prompt, candidate person names in the request are matched with trigram and transliteration-tolerant matching against the **actor-visible** directory (teacher: own classes' pupils; parent: own children and their teachers; librarian: members). Matched spans are replaced with tokens, and the token map holds 1..n candidate ids. Ambiguous tokens make the engine render a server-side chooser (names shown to the user only). `scanForPII` still runs (`pseudonymize.ts:162-175`). Unmatched names stay as typed, which is the same exposure as today. This is a known gap (R4).
5. **Unmasking**: tool arguments carrying `[STUDENT_n]` are resolved through the run token map, and only to ids the actor may see (scope rule). Model output is never trusted to name an id outside the map.
6. Confirmed `students`/`staff` setup prose is never sent (fixes `service.ts:46-47`). The questionnaire collects them as structured tables that compile deterministically (§8).

---

## 5 Authorization and confirmation classes

### 5.1 Where checks happen

| Moment | Check |
|---|---|
| Start / every advance / after each model call | `authorize()` re-resolves the actor from DB: role, campus, `accessVersion`, operational, `ai.add` (kept from `service.ts:29-34,143`) |
| Retrieval | registry `roles` ∩ live gates → tools sent |
| Plan validation | gates + scope rule against the concrete input (e.g. teacher assigned to `classId`, parent's child) |
| Preview render (B/C) | gates + scope again; preview built by a read-only function |
| Confirm (B) | `runVersion` CAS, `previewHash` recomputed equal, actor re-resolved, the confirmer is the run actor |
| Execute (A/B) | gates + scope inside the engine, **then** the domain service's own checks (e.g. `saveRegister` asserts `canMarkAttendance` + `attendance.add`, `register.ts:97-98`). The worker re-resolves the principal (`worker.ts:18-21`) |

### 5.2 Classes in code

- `classes.ts` holds `CLASS_FLOOR: Record<Risk, ConfirmationClass>`: READ→A; CREATE/UPDATE/APPROVAL_DECISION→B; DESTRUCTIVE/FINANCIAL/ACCESS_GRANT/COMMUNICATION/PUBLISH→C.
- The lint requires `entry.class ≥ floor`, except for entries listed in `class-overrides.ts`. That file is limited to lowering to A for scope `self` (own profile, own private plan, own study goals), and each override needs a justification and CODEOWNERS review.
- **Types**: `HandoffCapability` has no `execute`, so the executor cannot apply class C even by mistake. `executor.ts` switches on `def.class` and the type narrows.
- **Runtime escalation is upward only and never model-driven.** If the campus Delivery Policy requires separation (`access.ts:184-200`), or a service flag such as `correctionSeparateApprover` (`finance-operations-service.ts:94-98`) applies, a B entry declared `escalatesUnder: ["separationOfDuties"]` becomes C for that run, with a message naming the second approver. This replaces today's silent 403 at self-approval (`service.ts:81`).
- **B confirmation** is a POST to `/api/automation/{id}/steps/{key}/confirm` with `{runVersion, previewHash}`, or the batch route with `{runVersion, setHash = sha256(sorted stepKey:previewHash)}`. The worker never advances `WAITING_CONFIRM`. A chat message or voice "yes" is just an answer: it may update the plan but cannot confirm (`ROLLOUT.md:13`).
- **Typed ops via `school.execute`**: the user's B confirm of the exact preview is recorded as the approval: `updateWorkspaceRecord(action:"approve", via:"chat-confirm", previewHash)`, still through `assertApprovalRole` and `assertApprovalSeparation` (`repository.ts:366-368`). For class C typed ops (`finance.apply_operation`, `fees.generate_invoices`, `communications.queue_announcement`, `timetable.publish_reviewed`, `students.promote_enrollment`, `academics.transition_year`, `operations.record_risk_decision`) the engine saves the WORKFLOW record **unapproved** and hands off to the Work/approval tab. It never self-approves.

### 5.3 Class C hand-off to existing approval surfaces

| Mode | Used for | Mechanism |
|---|---|---|
| `domain-request` | adjustments/credits/refunds (`requestAdjustment`), payroll runs (SKO-434 prepare), leave applications, typed-op WORKFLOW records, announcement drafts, staff/guardian access invitations | `prepare()` calls the domain's own **maker** service. The domain's checker screen is unchanged. Completion is tracked by `domainRef` reconcile and outbox event |
| `prefill` | money the human records (Collect desk), publication (datesheet, results deep link to Exam Studio / report-cards), destructive deletes | A `SchoolAiHandoff` row holds the payload. The screen opens with `?handoff=<id>`, shows "Prepared by AI from your request", and the human's existing button calls the existing route carrying the hand-off's idempotency key |

The run finishes with outcome `awaiting_approval`. Its steps show "Waiting for Accountant in Fees › Collect" with the deep link. When the domain completes the item, the step becomes `COMPLETED_ELSEWHERE` and the receipt is the domain's own receipt.

### 5.4 Separation of duties

- `sod.makerCapability` on APPROVAL_DECISION entries (e.g. `leave.review` has maker `leave.apply`). The executor refuses when the decided object was created by the same actor or by a step of the same run.
- Delivery Policy and finance flags are enforced by the services (kept) and surfaced by escalation (§5.2).
- Exam Studio authority (`exam-authority.mayApprove`) is never routed through the registry. Exam entries are deep links only (§7.5).

---

## 6 Idempotency, receipts, audit, credits

**Keys.** `idempotencyKey = "cap_" + sha256(schoolId | runId | stepKey | capabilityKey | capabilityVersion)`. It is persisted on the step **before** execution, which keeps today's guarantee (`service.ts:153`). Questionnaire runs use run key `rolesetup-{setupId}-{version}`, as today's `questionnaire-{id}-{version}` (`automatic-workspace.tsx:37`).

**Execution protocol (`intents.ts`).**
```
BEGIN; INSERT intent(status INTENT) ON CONFLICT (school,key) → load existing; COMMIT
if existing.status COMMITTED → return stored receipt (replay)
if existing.status INTENT (crash window) → strategy.reconcile() → effect found? mark RECONCILED + receipt : re-execute
execute:
  native      → service(key)                        → mark COMMITTED
  tx-receipt  → service({tx}) + COMMITTED in same tx (atomic)
  natural-key / conflict-as-replay → service(); on 409 run reconcile(); found → RECONCILED else FAILED
  unsafe      → never reached (lint: entry disabled)
```
The same key with a different `inputHash` returns 409 `STEP_INPUT_CHANGED`. That branch is untested today and becomes a generated test (§10). The school-wide row lock on every role action (`role-action-service.ts:22-24`) is dropped in favour of per-key uniqueness plus the domain's own locks.

**Receipts.** Each entry's `receipt` schema extends `BaseReceipt.effect`. `outcomes.ts` rules:
- `executed` needs ≥ 1 `created|updated|deleted` step;
- `queued` counts as "queued, not delivered" (`prd-revised.md:194`);
- `handed_off` → `awaiting_approval`;
- `draft` or `read` → `plan_saved` or `answered`;
- if some steps succeeded and some failed or are waiting → `partial`.

This generalises `validateCompletion` (`validation.ts:12-17`). Receipts are checked against DB counts in the generated tests.

**Audit.** The engine writes an `auditLog` row (`tableName: "automation_step"`, `recordId: stepId`, capability key/version, class, actor, confirmer, previewHash) for every execute, confirm and hand-off. Domain audits stay as they are.

**Credits.** These charge per AI action (`openai.ts:505-560`):
- At run start `credits.ts` reserves an estimate: planning rounds ≤ 4 per turn × expected turns, with 3 for chat and a role-setup estimate from the compiler's free-text parses.
- Each provider call is charged through `consumeAICreditAndLog` with its real tokens, **including failed or invalid calls**. This fixes the unbilled-failure gap (`service.ts:121,148,168`).
- Executing a step makes no provider call and is not charged (decision D5).
- When credits run out the run pauses as `BLOCKED: CREDITS` with resume. It does not end as FAILED.
- Deterministic questionnaire compilation costs 0 credits.

---

## 7 Coverage plan: reaching all 700

### 7.1 Counts (recomputed from Appendix A)

| Cluster | Rows | direct | wrapper | inline-prisma | class floor A/B/C (excl. exclusions) |
|---|---|---|---|---|---|
| C1 Academic structure | 75 | 33 | 3 | 39 | 2/54/19 |
| C2 People, staff, access | 61 | 16 | 10 | 35 | 0/30/24 |
| C3 Students, admissions, family | 93 | 70 | 2 | 21 | 1/71/20 |
| C4 Teaching & assessment | 112 | 86 | 16 | 8 (+2 none) | 3/81/26 |
| C5 Attendance, comms | 66 | 55 | 5 | 6 | 1/43/21 |
| C6 Finance, payroll, purchasing | 120 | 48 | 7 | 65 | 1/58/52 |
| C7 Campus operations | 112 | 80 | 6 | 26 | 3/79/25 |
| C8 Platform, governance, onboarding | 61 | 30 | 8 | 23 | 0/32/20 |
| **Total** | **700** | **418** | **57** | **223 (+2)** | **11/448/207** |

There are 32 exclusions by design (category in `exclusions.ts`):
- `AUTH_FLOW`: signup, login, SSO callback, verify email, resend, portal token
- `PROVIDER_CALLBACK`: Stripe/Safepay/WhatsApp webhooks, Safepay simulate
- `SYSTEM_JOB`: 9 `system.*` sweeps
- `MFA_BILLING`: subscription checkout/cancel/legacy billing
- `LEGACY_DUPLICATE`: e.g. `fees.record_payment_basic`, which has no key (use `fees.collect_payment`), and `library.legacy_issue_book`, which bypasses desk rules

Exam Studio-owned capabilities (C4 paper, moderation, seal, release, marking) become **deep-link entries** (`kind: "link"`). They are class C with `mode: prefill` pointing into `/ai/studio`, with no prepare beyond navigation, so AI Workflows "knows" them without duplicating them.

### 7.2 Authoring pattern at scale

1. `inventory-to-json.ts` turns Appendix A into `capability-inventory.json` (key, route, roles, risk, reuse, notes).
2. `scaffold.ts --cluster C7 --domain library` emits draft `*.cap.ts` files with key, roles, risk, class floor, `source`, `reuse`, and TODOs for description, lookups, preview and receipt. It never guesses a schema.
3. **Services export their input schemas.** As part of touching a domain, the inline `z.object(...)` inside the service (e.g. `desk.ts:97`) is lifted to `export const issueCopyInput = …` and the service parses with it. The registry imports it, so validation lives in one place and the AI path cannot drift from the screen path.
4. Lookups are authored per domain (`lookups.ts`). Appendix A already lists them: 22 in C2, 33 in C3, 28 in C5, and so on. They are class A reads with output schemas and PII annotations.
5. i18n titles and preview strings go into the existing copy catalogs in en/ar/ur together. The lint checks all three exist.

### 7.3 Codegen and lint (`npm run check:capabilities`, run in CI and inside `npm run build`)

- `scan-handlers.ts` (ts-morph) enumerates exported POST/PUT/PATCH/DELETE in all 489 `route.ts` files. It also covers the GETs Appendix A flags as writes (⚑ rows such as `GET /api/library/desk` expiring holds and `auth.verify_email`), sub-actions dispatched by an `action` enum (e.g. `library/desk` POST `action: z.enum([...])`), and `"use server"` exports. Output: `route-coverage.json`.
- Checks:
  - every handler/action maps to ≥ 1 entry or exclusion;
  - class ≥ floor, or a reviewed override;
  - C has no execute;
  - A/B has `idempotency.strategy ≠ "unsafe"`, a `testFixture`, and (B) a `preview`;
  - every gate's `provenance` ⊇ the guard calls the scanner found in the route (`assertPermission`, `canX`, `requireX`, `assertFeesRead`, …);
  - roles ⊆ USER_ROLES;
  - every input field has `.describe()`;
  - the strict JSON schema converts;
  - examples parse, and `scanForPII(examples)` is empty;
  - description ≤ 600 chars;
  - lookups exist and are class A;
  - en/ar/ur copy exists;
  - `generated/*` hashes are current.
- **Ratchet**: `capability-baseline.json` starts at 668 uncovered handlers and may only go down. A new write route without an entry or exclusion fails the build from day one, so coverage cannot regress.

### 7.4 Inline-prisma routes (≈223): extract without rewriting the route

The recipe is mechanical, per route, and keeps the URL, `requireAuthUser`, `assertSameOrigin`, rate limits and response shape:

1. **Characterise first.** Add `tests/routes/<domain>.parity.database.test.ts` (isolated 55438). It covers the success and 409/403/404 cases with golden response bodies, run against the current route.
2. `extract-service.ts <route> <export>` lifts the body after auth into `src/lib/<domain>/<name>-service.ts` as `export async function createFeeType(user: AuthUser, input: CreateFeeTypeInput, opts?: { tx?: TxClient; idempotencyKey?: string })`. It also lifts the inline zod schema to `export const createFeeTypeInput`, and converts `NextResponse.json({error}, {status})` early returns into `throw new ApiError(msg, status)` (the existing `errorResponse` maps them back). The codemod produces the scaffold; a human finishes it.
3. The route becomes `const user = await requireAuthUser(); assertSameOrigin(req); return ok(await createFeeType(user, createFeeTypeInput.parse(await req.json())))`.
4. Parity tests must pass unchanged. Then add the registry entry.
5. Fix campus-fence gaps **in the service** where Appendix A notes them (e.g. `scopedCampusWhere(user)` without campusId in fees PATCH/DELETE, C6 notes). They are recorded as behaviour changes in the PR, not hidden.

Wrappers (57) get a `…Core(user, input)` beside the NextRequest/FormData wrapper. This also retires the synthetic `NextRequest` used for students (`students.ts:21-22`).

### 7.5 Order (role nav checklist first, then the long tail)

| Wave | Scope | Entries (est.) | Why |
|---|---|---|---|
| W0 | Re-express today's 12 tools + 15 ops (with `setup.apply_changes` split into 13 variants) + lookups they need | ~40 | engine migration with no behaviour change |
| W1 demo | TEACHER: register save/submit, marks entry draft, homework create, resource upload ref, lesson plan, my leave, meeting reschedule. LIBRARIAN: issue/return/renew/reserve/member create/copies. RECEPTIONIST: visitor in/out, pickup log, enquiry, complaint, post, certificate request. PARENT: leave request, explain absence, book meeting, pickup authorisation (C), preferences. STUDENT: study goals, portfolio entry, coursework submit link. ACCOUNTANT: collect (C), adjustment request (C), fee setup (fee types, groups, master lines, assignment: B), reminders (C), generate invoices (C) | ~90 | one primary write per nav leaf for the 6 under-served roles (B.roles §c) |
| W2 setup | Everything the questionnaires compile to: C1 periods/rooms/calendar/classes/subjects, C2 leave types/allocations/staff invitations, C6 fee structure, C3 guardian links (C), C8 campus/institution profile | ~70 | feature 2 end to end |
| W3 operators | PRINCIPAL and ADMIN nav leaves: timetable/cover, exam datesheet, promotion, approvals (B with SoD), transport, hostel, inventory/purchasing, canteen | ~180 | ADMIN 556 / PRINCIPAL 241 |
| W4 long tail | remaining C2/C6/C8 inline-prisma, platform owner console, group governance | ~290 | completes 668 |

Cluster sequencing inside waves follows readiness: C4, C5, C7 and C3 are mostly direct (cheap). C6 (65 inline), C1 (39) and C2 (35) carry most extraction work, so their parity tests start in W1, ahead of their entries.

---

## 8 The questionnaire pipeline

### 8.1 Definitions per role (`src/lib/role-setup/questionnaires/<role>.ts`)

```ts
export interface RoleQuestionnaire {
  key: `${Lowercase<Role>}.v${number}`; role: Role; version: number;
  appliesTo(ctx: CapabilityContext): boolean;              // e.g. campus questionnaire only for operators of a campus
  questions: Question[];
  compile(answers: Answers, live: LiveState, ctx: CapabilityContext): PlanStep[];  // deterministic
  readiness: ReadinessCheck[];
}
export interface Question {
  key: string; section: string;
  widget: "chips"|"grid"|"time-ranges"|"table"|"choice"|"toggle"|"free-text";     // rendered with shared ui primitives
  schema: z.ZodType;                                         // typed answer, not a 4000-char string (schemas.ts:23-34)
  prefill?(live: LiveState, ctx: CapabilityContext): unknown | null;               // ask only for unknown facts
  produces: CapabilityKey[];                                 // lint: every question produces ≥1 capability or a preference
  skipIf?(answers: Answers, live: LiveState): boolean;
}
```

The lint rules for questionnaires: every question must produce something, and every `produces` key must exist in the registry and be available to that role, or be compiled into a hand-off or a task for the role that holds it.

### 8.2 Examples (content is owned by Appendix D; these show the mapping)

| Role | Question (widget) | Produces |
|---|---|---|
| ADMIN / CAMPUS_ADMIN | grades × sections (grid) | `academics.setup_year` → classes (B) |
| | subjects per grade (grid) | `setup.subjects` (B; needs ACTIVE cycle, which the wizard already created, `setup-service.ts:419-423`) |
| | periods (time ranges), rooms (table) | `setup.periods`, `setup.rooms` (B) |
| | staff (table: name, email, role) | `setup.staff_invitations` (B, pending) + delivery hand-off (C) |
| | fee heads × grade amounts (grid) | `fees.create_fee_type`, `fees.create_group`, `fees.create_master_line`, `fees.assign_fee_group` (B) |
| | working days | **prefilled from the wizard, confirm only** (no duplicate WEEKENDS write) |
| | academic year | **not asked** (decision 3) |
| SUPER_ADMIN | campuses + who leads each (table) | `campus.create` (B), `memberships.invite_campus_admin` (C → People & access) |
| PRINCIPAL | activate year, grading scheme, calendar | `academics.transition_year` (C → Academic year), assessment rules (B) |
| TEACHER | confirm my classes/subjects (prefilled from allocations), register time, marks scheme, availability | `profile.update` (A), teacher preferences (A), marks book columns (B) |
| ACCOUNTANT | bank accounts, receipt numbering, reminder channel | `accounts.create_bank_account` (B), reminder policy (C if it sends) |
| LIBRARIAN | loan rules, categories | `library.desk.save_rules` (B), `library.category_create` (B) |
| RECEPTIONIST | visitor badge fields, pickup rules | front-desk settings (B) |
| PARENT | confirm children (prefilled from guardian links), language, channels | `announcement-preferences` (A, existing `announcement-preferences-service.ts`), `profile.update` (A) |
| STUDENT | language, study goals | `profile.update`, `study.goals.save` (A) |
| APP_OWNER | none beyond language | `profile.update` (A) |

### 8.3 Pipeline

```
first login → proxy routes to /setup/role (or /ai?setup=1 kept as alias) when SchoolAiRoleSetup missing/DRAFT
  → prefill.ts (wizard, invitation role, allocations, guardian links, locale policy)
  → answers saved per key (draft, version++), each key confirmed (confirmedKeys, as today)
  → "Confirm all" → compiler.ts → Plan (steps with stepKeys like "setup.classes.7B", dependsOn from capability `produces`)
       seat-crossing: a step whose gate needs another seat (e.g. principal activates year) becomes a
       SchoolAiSetupTask assigned to that role (reused table) instead of a failing step (fixes B.typedOps finding 2)
  → plan preview grouped: "Done now" (A) · "Confirm once" (B, one batch confirm with setHash) · "Waiting for others" (C + tasks)
  → executor (same engine, origin ROLE_SETUP, no model calls unless a free-text answer needs parsing)
  → readiness.ts: per-role checks over live records (generalised getSetupJourney, setup-journey-service.ts:10-41)
  → status READY | PARTIAL (with the remaining list), never "done" from questionnaire completion alone (rule 17)
```

Free-text fallback: any question may accept "describe it instead". `free-text.ts` parses it with the model into the question's schema (reusing `analyzeSetupAnswers`, `setup-analysis-service.ts:16-61`), then the parse is shown for confirmation before it counts as an answer. Students are never compiled from prose. They come from a roster table or from the reviewed `importBatch` path (rule 8).

### 8.4 Fixing the onboarding promise

The B batch confirm is the "approve" the wizard promises (`src/app/onboarding/page.tsx:34`). The copy becomes true: nothing class B or C applies until the user confirms or the owner approves. Class A items are limited to the user's own profile and preferences.

### 8.5 Reuse or retire

| Module | Fate |
|---|---|
| `setup-generation` (nine drafts, POST route `api/school-ai/setup/generate/route.ts:28`, service) | **Retire.** Keep GET restore read-only for one release, then delete it along with `SetupGenerationPanel`/`SetupRunPanel`. Move the Today card (`dashboard.ts:73-85`) to `SchoolAiRoleSetup.status` |
| `setup-actions` (ROOMS/PERIODS/SUBJECTS drafts, `setup-actions-service.ts:17-70`) | **Retire as a surface.** Its parsing helpers move into the admin compiler's mappers |
| `setup-journey` | **Reuse**, generalised into `readiness.ts` for all roles |
| `setup-analysis` | **Reuse** as the free-text parser |
| `GuidedSetup` 18 string keys (`onboarding.ts:17-36`) | Replaced by typed admin questions. A migration step maps legacy answers into `answers.legacy` for display |
| `ROLE_SETUP_INTERVIEW` (`role-setup.ts`) | Retired. The questionnaires replace the interview sentence |

---

## 9 Migration from the current `src/lib/automation` engine

**Kept (the strengths listed in B.engine's final finding):**
- layered idempotency: job key + request hash, per-step key persisted before execution, receipt replay in every adapter, `schoolAiExecution` uniques (`service.ts:49-58,153`; `execution.ts:247-252`);
- actor re-verification before and after each model call and in the worker (`service.ts:29-34,88,143`; `worker.ts:18-21`);
- questionnaire version pinning at three points (`:107-110,116-119,144-147`), which becomes role-setup version pinning;
- the tool-switch guard (`validation.ts:5-9`), generalised: a step's capability cannot change after proposal without a new step and a new preview;
- completion-class rules (`validation.ts:12-17`), generalised in `outcomes.ts`;
- typed adapters reusing existing services (roster commit, `logCall`, workspace record + preview + execute);
- serializable transactions with retry (`transaction.ts:13-39`);
- audit rows for every write;
- per-tool trimmed schemas (now per tool natively);
- rate-limited starts (`route.ts:8`);
- tenant-context wrapping (`runWithTenantContext`, `service.ts:28`).

**Replaced:**

| Today | Replacement |
|---|---|
| `catalog.ts` flat object + `ROLE_PURPOSE` | `registry.ts` + `retrieval.ts`. Role purpose lines move into the system prompt per role |
| `schema.ts` 12-literal union, `output-schema.ts` | generated strict tool schemas |
| select→act two calls, repair call | one tool-calling turn with ≤ 4 rounds |
| job JSON in `schoolAiRequest.reply` with CAS on whole JSON | `SchoolAiRun` + `SchoolAiRunStep` with `version` CAS |
| `pending` single action + 600 ms auto-advance | step DAG; SSE status; B waits for confirm |
| `evidenceQuote` substring | `evidence.ts` spans over user-authored text |
| `school.inspect` 500-entity dumps in receipts | typed, masked lookups, never replayed into prompts |
| 30-step cap | per-run caps (200 steps; batches of ≤ 30 rows remain service limits) + continuation run linked to the same conversation |
| worker 4 jobs / 5 s platform-wide (`worker.ts:8`) | per-tenant fair sweep (round-robin by school, configurable limit), A steps and planning only |
| `AUTOMATIC_ACTION_V1` receipts | `SchoolAiActionIntent` |
| self-approve at `service.ts:81` | B confirm = approval with hash; C = unapproved record + hand-off |
| free-text `unsupported` | `SchoolAiCapabilityGap` + "who can do this" answer |

**Steps:**
1. **M0**: wire `tests/automation/*` into `scripts/run-school-ai-tests.mjs` and CI (B.qa finding 1). Add `data-*` anchors to `automatic-workspace.tsx`.
2. **M1**: registry core + W0 entries wrapping `legacy/` adapters. The old engine reads descriptions from the registry (quick win: descriptions reach the model) and the pseudonymiser fix lands.
3. **M2**: new tables, planner and executor behind `AUTOMATION_ENGINE=v2` per school (pilot schools first). Old `AUTOMATIC_SETUP_V1` jobs stay readable in "Saved work" and are not converted.
4. **M3**: classes + confirm + hand-offs on. The 600 ms advance is removed.
5. **M4**: delete the select→act loop, `schema.ts` unions and `legacy/` wrappers as their entries move to direct services. Migrate `run-service.ts` scheduled runs onto `SchoolAiRunStep`, so record-based steps become registry entries `school.op.<operation>` with `source.recordId`.

---

## 10 Testing strategy

1. **Registry unit tests**, generated and provider-free (`tests/capabilities/registry.test.ts`, `node --test`). For every entry:
   - examples parse;
   - the strict JSON schema converts and round-trips;
   - class ≥ floor and C has no execute;
   - descriptions and aliases are PII-free;
   - `produces` paths exist in the receipt schema;
   - the tool name is unique and ≤ 64 chars;
   - copy exists in en/ar/ur.

   A new entry is covered automatically, extending today's pattern at `validation.test.ts:24-31`.
2. **Engine unit tests**: evidence normalisation (EN/AR/UR, digits, tatweel, ZWNJ; server-text quotes rejected), DAG/ref resolution, outcome rules, set-hash confirm, upward-only escalation, masking (class/subject names clear, people tokenised; regression for the `…name$` classifier).
3. **DB matrix** (`tests/capabilities/matrix.database.test.ts`, isolated 55438, both URLs identical). Rows are 668 capabilities × 11 roles, with ADMIN/CAMPUS_ADMIN run with and without PRINCIPAL/ACCOUNTANT seats. Per cell, using the entry's `testFixture`:
   - availability equals expectation;
   - denial → 403 and zero writes;
   - permission revoked between plan and execute → FAILED with no write;
   - `accessVersion` bump → 403;
   - suspended school → 403;
   - foreign campus → 403;
   - **two-tenant** (`arbitraryTenantPair`, `exam-studio-generators.ts:581`) → other school's counts unchanged;
   - replay same key → one effect and deep-equal receipt;
   - same key with different input → 409;
   - simulated crash between commit and step update → reconcile returns the receipt;
   - receipt counts equal DB counts;
   - class C → no domain effect beyond the maker object.

   The matrix is sharded by cluster for CI time.
4. **Parity tests** for every extracted inline-prisma route (§7.4) with golden responses before and after.
5. **Browser** (Playwright `*.browser.spec.ts`, screenshots to the scratchpad / `test-results/ai-review`):
   - teacher Urdu register → preview → confirm;
   - librarian issue;
   - accountant collect hand-off opening the Collect desk prefilled;
   - parent Arabic leave request;
   - admin questionnaire → batch confirm → readiness PARTIAL with principal task;
   - each at 1440/768/390, EN/AR/UR, RTL; `check:ui` passing.
6. **Live-model smoke** (opt-in, `AUTOMATION_LIVE=1`, synthetic tenant only). About 60 scripted requests (≈5 per role × 3 languages), asserting:
   - retrieval recall (the expected capability is in the sent subset);
   - the chosen tool;
   - asks instead of invention;
   - zero class C applications;
   - zero PII egress hits.

   Results feed the educator-reviewed release evaluation (`ai-release-evaluation.ts:3-7` stays null until a real review is recorded; add automation cases to `AI_EVALUATION_CASES`).
7. **Lint as test**: `check:capabilities` in CI and `npm run build`.

---

## 11 Risks and open decisions for the founder (each with a default)

| # | Decision | Default |
|---|---|---|
| D1 | Static class floors from the risk column, with only reviewed downward overrides to A for self-scoped writes | Yes |
| D2 | Teacher register is class B with per-pupil evidence. Submission is a separate B step that warns about family notices | Yes |
| D3 | Retrieval uses lexical (BM25, multilingual aliases) + domain router. Embeddings deferred | Lexical first; embeddings only if live smoke recall < 95% |
| D4 | Money that a human records (Collect) uses a prefill hand-off. Credits, refunds and waivers use `requestAdjustment` (maker/checker) | Yes. AI `finance.apply_operation` CREDIT/REFUND direct paths are disabled for chat |
| D5 | Credits charged per provider call, including failed calls. Executions and deterministic setup compilation are free | Yes |
| D6 | Approval decisions (leave review etc.) by chat are class B with SoD. Finance, access and publication approvals are C | Yes |
| D7 | Library due dates follow loan rules. A user-stated date different from the rule date triggers a question; no override | Yes |
| D8 | ADMIN questionnaire drops academic year and working days become confirm-only. Group SUPER_ADMIN gets a group questionnaire | Yes (README decisions 3, 4) |
| D9 | Unmatched free-text person names in requests are sent as typed (as today) | Accept for pilot; revisit after entity-resolution recall is measured |
| D10 | Plan cap of 200 steps per run, with continuation runs in the same conversation | Yes |

**Risks:**
- **Authoring volume.** ≈ 668 entries and 223 extractions is the bulk of the cost. The ratchet lint stops regressions but does not author entries, and quality depends on descriptions and lookups.
- **Gate drift.** A route guard added later without updating the entry is caught only if the AST scanner recognises the guard. Unknown guard helpers must be registered in the scanner allow-list, or the lint fails closed.
- **Strict tool schemas and big unions.** Some service schemas (e.g. `finance.apply_operation` discriminated actions, timetable 140 slots) are large. They are split into variants to stay under the token budget.
- **Entity resolution** across Arabic/Urdu/Latin scripts is unproven. Recall is unknown until measured.
- **Seat crossing in setup** depends on other people completing tasks. Readiness will often be PARTIAL for schools with a principal; that is honest, but it is a demo risk.
- **Service extraction changes behaviour** where campus-fence gaps are fixed. Parity tests make each change visible, but some screens may start returning 403s.
- **Release gate** stays closed until an educator-reviewed evaluation exists. The demo must run in a pilot or synthetic tenant.
- **SKO-470 coupling.** Extending `SchoolAiRun` touches scheduled-run code paths, so migration M4 must be coordinated.
- **Provider latency.** ≤ 4 rounds within 45 s is tight with large tool sets. Measure p95. Fallback: split into two invocations driven by SSE.


**Key decisions**
- One declarative CapabilityDefinition per capability in per-cluster domain folders (src/lib/capabilities/domains/c1..c8); engine, tool schemas, tests and coverage reports are derived from it
- Services export their zod input schemas and the registry imports them; validation is never redefined for the AI path
- Class C entries are a separate TypeScript type with no execute member; they only prepare a domain-request (maker service) or a prefill SchoolAiHandoff for the existing screen
- Static class floor per Appendix A risk (READ->A; CREATE/UPDATE/APPROVAL_DECISION->B; DESTRUCTIVE/FINANCIAL/ACCESS_GRANT/COMMUNICATION/PUBLISH->C); runtime escalation upward only by policy (Delivery Policy SoD, correctionSeparateApprover), never by the model
- B confirmation is a POST bound to runVersion + previewHash (or a set hash for batch); chat or voice 'yes' never confirms; worker never advances WAITING_CONFIRM
- OpenAI tool calling with strict generated JSON schemas, a _step envelope (key, dependsOn, evidence) and meta-tools (ask_user, answer, report_unsupported, open_domain, finish_plan); one planning turn of up to 4 rounds proposes a DAG plan
- Tool retrieval = role pre-filter -> BM25 over en/ar/ur aliases + domain router -> live gate check -> at most 24 write + 12 lookup tools per turn; embeddings deferred
- Pseudonymiser classifier fixed (explicit person-key allow-list; the current ...name$ pattern masks className/subjectName); field PII annotations from the registry; typed masked lookups; local entity pre-resolution of names in the user's own text
- Extend SKO-470's SchoolAiRun (origin CHAT/ROLE_SETUP, conversationId) plus new SchoolAiRunStep, SchoolAiActionIntent (write-ahead ledger), SchoolAiHandoff, SchoolAiCapabilityGap, SchoolAiRoleSetup
- check:capabilities lint scans all route.ts write handlers, sub-actions and server actions by AST; every handler must map to an entry or an exclusion; ratchet baseline starts at 668 and may only fall; gate provenance must match route guards
- Inline-prisma routes are extracted via characterise-first parity tests + extract-service codemod; the route keeps URL/auth/same-origin/rate limits and becomes a thin caller
- Questionnaires are typed per role with prefill and a deterministic compiler to the same plan/executor; seat-crossing steps become SchoolAiSetupTask items for the right role; setup-generation and setup-actions retired, setup-journey and setup-analysis reused
- Exam Studio capabilities appear only as deep-link entries into /ai/studio; nothing in the exam chain is executable from the registry

**Risks**
- Authoring volume: about 668 entries plus about 223 inline-prisma extractions dominate cost; tool-selection quality depends on description and lookup quality
- Gate drift: a route guard added later without updating the entry is caught only if the AST scanner recognises the helper; unknown helpers must fail the lint closed
- Large service schemas (finance discriminated actions, 140-slot timetables) strain strict tool schemas and token budgets; they must be split into variants
- Entity resolution of person names across Arabic/Urdu/Latin scripts is unproven; unmatched names in free text still reach the provider as typed
- Seat crossing during setup (for example, the principal must activate the year) makes readiness PARTIAL for many schools, which is a demo risk even though it is honest
- Service extraction fixes campus-fence gaps noted in Appendix A, which changes behaviour for existing screens; parity tests surface it but some screens may begin returning 403s
- Extending SKO-470's SchoolAiRun touches scheduled-run code and needs coordination
- Up to 4 planning rounds in 45 s under maxDuration 60 is tight; p95 latency needs measuring, with a fallback that splits a turn across two invocations driven by SSE
- The AI release gate stays closed until a real educator-reviewed evaluation (with automation cases) is recorded, so the LEAP demo must run on a pilot or synthetic tenant
- Natural-key reconcile for services without idempotency keys (library issue, leave request) depends on correct reconcile queries; a wrong query could double-apply or falsely report replay

**Effort**: These are person-days for one experienced implementer per stream, assuming the isolated 55438 QA cluster is available and the service code is as described in Appendix A/B. Registry core (types, gates, classes, idempotency strategies, i18n hooks, registry assembly): 8. Codegen and lint (inventory-to-json, scaffold, ts-morph handler scanner incl. sub-actions and server actions, strict schema generation, ratchet, CI/build wiring): 10. Gateway tool calling (completeWithTools in openai.ts with policy, PII and credits): 3. Planner, retrieval (BM25 + domain router) and prompt: 8. Pseudonymiser fix, typed masked lookups and entity pre-resolution: 6. Evidence normaliser: 2. Executor, run store, intents ledger, outcomes, SSE, fair worker: 10. Confirm (single and batch) and hand-off (tables, API, domain screen prefill hook, reconcile sweep): 8. Prisma migrations (5 tables/extensions, data step for ONBOARDING answers, tenant registry): 3. Engine migration M0–M4 including W0 (about 40 entries wrapping today's 12 tools and 15 ops split into variants): 8. Questionnaire pipeline, engine side (definitions framework, prefill, compiler, readiness, free-text parse, seat-crossing tasks): 10, plus per-role question content and mappers for 11 roles: 8 (UI is excluded and owned by the UX design). Test infrastructure (generated registry tests, DB matrix harness with seats and tenant pairs, parity-test harness, live smoke harness): 9. Subtotal for the platform: about 101 person-days. Capability coverage, at about 1.5 h per direct entry, 3 h per wrapper and 5 h per inline-prisma extraction with parity test: W1 demo (about 90 entries, mostly direct): about 18; W2 setup (about 70, extraction-heavy C1/C2/C6): about 30; W3 operators (about 180): about 50; W4 long tail (about 290, most C6/C2/C8 extractions): about 110. Coverage total is about 208 person-days and parallelises well across domain owners or agent sessions once the registry core and lint exist. Minimum demo path (platform + W0 + W1 + the admin and teacher questionnaires) is about 135 person-days.


---

# AI Workflows Planner-First Orchestration Layer (Architect A2): persisted plan DAG, two-phase model protocol, per-step receipts, reuse of SKO-470 runs

# AI Workflows: planner-first orchestration layer (Architect A2)

Status: design proposal, 23 October 2026. I changed no files in the repository. Ground truth comes from Appendix B (B.engine, B.typedOps, B.roles, B.ui, B.qa, B.decisions) and Appendix A in `docs/product-review-2026-10/ai-automation-plan-2026-10-23/`. Where I rely on code I cite file:line. I spot-read `prisma/schema.prisma:351-412,6707-6797,6798-6829,6933-6964`, `src/lib/school-ai/run-service.ts`, `src/lib/school-ai/runs.ts`, `src/lib/school-ai/execution.ts:30-57`, `src/lib/ai/openai.ts:488-560`, `src/lib/ai/pseudonymize.ts:30-45`, `src/lib/library/desk.ts:95-121`, `src/lib/attendance/register.ts:96-110`, `src/lib/family/leave.ts:34-48` and `src/app/api/fees/collect/route.ts:22-70` to confirm the shapes the design depends on.

---

## 1. Summary

Today's engine runs a **one-action select→act loop** inside a JSON blob (`schoolAiRequest.reply`, `src/lib/automation/service.ts:52-53`). It is capped at 30 steps (`service.ts:114`). It shows the model only bare tool names (`service.ts:123`). It self-approves (`service.ts:81`) and auto-executes every 600 ms (`automatic-workspace.tsx:54`). This proposal replaces that loop with a **planner-first orchestration layer**:

1. **Intent → Plan.** The model gets one call to propose a **Plan**: a DAG of steps. Each step is bound to exactly one registry **capability**, its dependencies, its known inputs (each with provenance and user evidence) and its missing fields. Code then checks the plan against the role's registry, the DAG rules and the budgets, and persists it. That code, not the model, assigns every step its **static confirmation class** (A/B/C) and its title in EN/AR/UR.
2. **Per-step argument filling.** A second, narrow call per step fills only the inputs code could not resolve. It uses that capability's strict JSON schema, sent with OpenAI structured outputs. Name→id resolution, defaults, dataflow bindings (`$ref` to an earlier step's output) and fan-out are deterministic code. Missing details become **questions attached to a specific step and field**. Questions are usually answered by tapping entity chips, which costs no model call.
3. **Preview → confirmation class → execution.** Every write step computes a deterministic **preview** and a `previewHash` with the existing canonical digest (`src/lib/school-ai/canonical.ts:53-60`). Class A runs. Class B waits for a confirmation bound to `{stepId, previewVersion, previewHash, jobVersion}`. Class C creates a **hand-off** into the existing approval or domain surface. For the 15 typed operations that hand-off is the SchoolAiRecord approval plus SKO-470 Runs (`run-service.ts`). Steps run one at a time under a row lock. Each one commits a **receipt** in the same transaction where the service allows it, following the pattern of `processSchoolRun` (`run-service.ts:102-120`).
4. **A durable job model** (`AiWorkflowJob` + normalized `AiWorkflowStep`, `AiWorkflowQuestion`, `AiWorkflowConfirmation`, `AiWorkflowHandoff`, `AiWorkflowEvent`, `AiWorkflowReceipt`) replaces the JSON blob and the 30-step cap with:
   - explicit budgets (steps, model calls, questions, replans, wall clock);
   - credit **reservation** through `reserveAICredits` (`openai.ts:505-511`);
   - a short **lease** shared by browser commands and a fair worker sweep;
   - an append-only **event log** streamed over SSE, with polling as the fallback.
5. **Two plan origins, one engine.** A **free-form** plan is proposed by the model from a typed request. A **questionnaire** plan is compiled deterministically from the role's typed answers (no model needed). It is reviewed as a whole, grouped, and then executed by the same step runner. Readiness is computed from live records, never from questionnaire completion (rule 17).

The layer **reuses rather than forks**: SKO-470's `SchoolAiRecord` + `previewSchoolAiExecution` + `executeSchoolAiToolInTransaction` + `SchoolAiExecution` + `SchoolAiRun`; SKO-460's `SchoolAiConversation`; the AI gateway's credits, pseudonymiser and PII scan; and the `WorkflowEffect` "committed vs uncertain" idea (`prisma/schema.prisma:400-412`). OpenAI stays. Voice and document intake stay with SKO-460. Exam Studio stays the owner of syllabus→paper→seal; AI Workflows only deep-links into `/ai/studio`.

---

## 2. Components and directory layout

These paths were checked to be free: `src/lib/ai-workflows`, `src/app/api/ai-workflows` and `tests/ai-workflows` do not exist. `src/components/ai-workflows/` exists and holds the draft-only `AiWorkflowsHome.tsx`, which is folded into the new home. Prisma already has `WorkflowJob/WorkflowEvent/WorkflowEffect` (`schema.prisma:351-412`, the outbox orchestration ledger), so every new model uses the `AiWorkflow*` prefix.

```
src/lib/ai-workflows/
  registry/
    types.ts                 CapabilityAdapter, Gate, HandoffSpec, Receipt, L10n types
    define.ts                defineCapability() — validates static metadata at import time
    gates.ts                 composable predicates (role, module flag, seat, scope, guardian, capability-key)
    typed-operation.ts       typedOperationAdapter(op) — wraps the 15 SCHOOL_AI_TOOLS (execution.ts:33-49)
    domains/
      c1-academic/*.ts  c2-people/*.ts  c3-students-family/*.ts  c4-teaching/*.ts
      c5-attendance-comms/*.ts  c6-finance/*.ts  c7-campus-ops/*.ts  c8-platform/*.ts
    exclusions.ts            Appendix A keys deliberately not exposed, each with reason + deep link
    generated/
      manifest.ts            codegen: key, roles, class, risk, copy, keywords (no functions) — used by retrieval & UI
      model-schemas.ts       codegen: OpenAI-strict JSON schema per capability input
  planner/
    retrieve.ts              role-filtered capability retrieval (lexical BM25 over EN/AR/UR cards, optional embeddings)
    cards.ts                 capability → compact card for the prompt
    protocol.ts              zod: PlanProposal, StepFill, Repair; JSON-schema export
    prompts.ts               system prompts (English), language rules, role purpose
    plan-validate.ts         DAG checks, registry membership, budgets, fan-out bounds
    fill.ts                  phase-2 per-step filling + deterministic resolvers + bindings
    evidence.ts              normalized evidence matching over user-authored text only (EN/AR/UR)
    revalidate.ts            context-drift detection, stale previews, replan decision
    replan.ts                new planVersion; carries committed facts, supersedes pending steps
  pii/
    workflow-masker.ts       typed-entity masking: persons tokenized, classes/subjects/rooms/books not
    vocabulary.ts            per-job person-name vocabulary + Arabic-script normalization
  executor/
    scheduler.ts             ready-set computation, fan-out expansion, branch independence
    step-runner.ts           preview → class gate → execute → receipt, under job lock
    confirm.ts               class B binding records
    handoff.ts               class C hand-off creation + observation (record approval, domain request, screen prefill, role task, deep link)
    classes.ts               effectiveClass() — escalation only
    reconcile.ts             natural-key replay for services without native keys; UNCERTAIN handling
    compensation.ts          proposes undo steps (never automatic)
    outcome.ts               honest outcome from receipts (replaces validation.ts:12-17)
  jobs/
    job-service.ts           start / command / list / get; optimistic version; idempotency
    lease.ts                 claim/heartbeat/release (CAS on leaseToken, not on JSON)
    worker.ts                fair sweep (per-school cap), wake times
    events.ts                append AiWorkflowEvent (seq), payload = ids + template keys only
    credits.ts               estimate, reserve, consume per accepted model response, release
    actor.ts                 authorizeActor() lifted from automation/service.ts:29-34
  questionnaire/
    types.ts                 RoleQuestionnaire, Question, compile() contract
    roles/{owner,super-admin,admin,campus-admin,principal,teacher,accountant,librarian,receptionist,student,parent}.ts
    compile.ts               answers → deterministic PlanDraft
    readiness.ts             per-role readiness from live records (generalizes setup-journey-service.ts:10-41)
  copy/                      EN/AR/UR server copy for errors, states, questions (no English-only SchoolAiError text)

src/app/api/ai-workflows/
  route.ts                                  GET list, POST start (rate-limited like automation/route.ts:8)
  [jobId]/route.ts                          GET job snapshot (steps, questions, handoffs)
  [jobId]/events/route.ts                   GET SSE (text/event-stream, pattern of api/notifications/sse/route.ts:91); ?after=seq polling
  [jobId]/commands/route.ts                 POST {type: answer|confirm|confirm_batch|decline|pause|resume|cancel|edit_request|retry_step|propose_undo}
  handoffs/[handoffId]/route.ts             GET prefill for a domain screen (server-side, never in URL)
  questionnaire/[key]/route.ts              GET definition+prefill, PUT answers (versioned), POST submit → job
  capabilities/route.ts                     GET "what AI can do here" for the signed-in role (from manifest + gates)
src/app/api/cron/ai-workflows-retention/route.ts

src/components/ai-workflows/
  workflows-home.tsx         replaces AutomaticWorkspace + AiWorkflowsHome on /ai
  composer.tsx               text composer (voice/doc slots reserved for SKO-460)
  plan-board.tsx             DAG as grouped, ordered step list (phone: vertical; desktop: lanes)
  step-card.tsx              renders every step state (§3.4)
  preview-view.tsx           table / single / diff preview renderers from adapter.previewView
  confirm-sheet.tsx          class B confirm (single and batch) on shared ModalSurface
  question-tray.tsx          "Needs you": questions grouped by step, entity chips
  handoff-card.tsx           class C: who must act, deep link, live status
  receipt-drawer.tsx         per-step receipts with links into domain screens
  budget-meter.tsx           steps / credits / time remaining
  role-questionnaire.tsx     first-login questionnaire shell (per-role definition-driven)
  use-workflow-job.ts        SSE + polling + command queue hook
  use-workflow-handoff.ts    hook domain screens use to load a prefill and pass the hand-off idempotency key
```

Runtime topology:

```
Browser ──commands──▶ /api/ai-workflows/[id]/commands ──▶ job-service (lock job row, write event, maybe run ≤1 bounded unit)
   ▲                                                                    │
   └──SSE/poll── /events?after=seq ◀── AiWorkflowEvent ◀── step-runner / planner (worker or inline)
Worker (src/workers/outbox-worker.ts loop, next to sweepSchoolRuns at :49) ──▶ sweepWorkflowJobs(db) fair, per-school cap
Domain screens ──(handoff param)──▶ /api/ai-workflows/handoffs/[id] prefill ──▶ domain route with handoff.idempotencyKey
Approver ──▶ existing SchoolAiRecord approve + execute / SKO-470 Runs ──▶ SchoolAiExecution ──observed by──▶ handoff.ts
```

---

## 3. Data model changes (Prisma) and migrations

### 3.1 New models

Every model has `schoolId` (fail-closed tenant guard; re-run `scripts/gen-tenant-registry.mjs`). `campusId` is optional only where APP_OWNER or SUPER_ADMIN jobs legitimately have none (B.ui §B1; `service.ts:39`).

```prisma
// One request or one questionnaire submission. Replaces schoolAiRequest feature AUTOMATIC_SETUP_V1.
model AiWorkflowJob {
  id                   String    @id @default(uuid())
  schoolId             String    @default("") @map("school_id")
  school               School    @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  campusId             String?   @map("campus_id")
  campus               Campus?   @relation(fields: [campusId], references: [id], onDelete: Cascade)
  actorId              String    @map("actor_id")
  actorRole            String    @map("actor_role")
  accessVersion        Int       @map("access_version")
  origin               String    // FREEFORM | QUESTIONNAIRE | FOLLOW_UP | UNDO
  conversationId       String?   @map("conversation_id")     // SKO-460 SchoolAiConversation
  setupResponseId      String?   @map("setup_response_id")
  setupResponseVersion Int?      @map("setup_response_version")
  parentJobId          String?   @map("parent_job_id")       // follow-up / undo lineage
  language             String    // en | ar | ur (UI locale at start)
  requestText          String?   @map("request_text")        // user-authored only; never server-appended text
  requestHash          String    @map("request_hash")
  idempotencyKey       String    @map("idempotency_key")
  status               String    @default("PLANNING")        // §3.4
  outcome              String?   // EXECUTED | AWAITING_APPROVAL | PARTIAL | ANSWERED | PLAN_SAVED | NOTHING_DONE
  planVersion          Int       @default(0) @map("plan_version")
  planMode             String    @default("STEPWISE") @map("plan_mode") // STEPWISE | PLAN_REVIEW (questionnaire)
  version              Int       @default(1)                 // optimistic concurrency for every command
  eventSeq             Int       @default(0) @map("event_seq")
  leaseToken           String?   @map("lease_token")
  leaseOwner           String?   @map("lease_owner")         // REQUEST | WORKER
  leaseExpiresAt       DateTime? @map("lease_expires_at")
  nextWakeAt           DateTime? @map("next_wake_at")
  budget               Json      // {maxSteps, maxLeafExecutions, maxModelCalls, maxQuestions, maxReplans}
  usage                Json      @default("{}")              // counters mirrored from events
  reservedCredits      Int       @default(0) @map("reserved_credits")
  creditsCharged       Int       @default(0) @map("credits_charged")
  reservationExpiresAt DateTime? @map("reservation_expires_at")
  errorCode            String?   @map("error_code")
  expiresAt            DateTime  @map("expires_at")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")
  completedAt          DateTime? @map("completed_at")
  steps                AiWorkflowStep[]
  questions            AiWorkflowQuestion[]
  handoffs             AiWorkflowHandoff[]
  events               AiWorkflowEvent[]
  @@unique([id, schoolId])
  @@unique([schoolId, actorId, idempotencyKey])
  @@index([status, nextWakeAt])
  @@index([schoolId, actorId, updatedAt])
  @@map("ai_workflow_jobs")
}

model AiWorkflowStep {
  id                    String    @id @default(uuid())
  schoolId              String    @default("") @map("school_id")
  campusId              String?   @map("campus_id")
  jobId                 String    @map("job_id")
  job                   AiWorkflowJob @relation(fields: [jobId, schoolId], references: [id, schoolId], onDelete: Cascade)
  planVersion           Int       @map("plan_version")
  stepKey               String    @map("step_key")          // "s1", "s3", fan-out children "s3.1"
  parentStepId          String?   @map("parent_step_id")    // fan-out parent
  capability            String                              // registry key, e.g. library.desk_issue_copy
  capabilityVersion     Int       @map("capability_version")
  staticClass           String    @map("static_class")      // A | B | C (snapshot of registry)
  effectiveClass        String    @map("effective_class")   // after escalation; never lower than static
  status                String    @default("PROPOSED")      // §3.4
  dependsOn             String[]  @map("depends_on")        // stepKeys within the same planVersion
  inputs                Json      @default("{}")            // server-side, unmasked ids; never sent raw to a model
  inputProvenance       Json      @default("{}") @map("input_provenance") // field → user|resolved|binding|default|context + evidence span
  missingFields         String[]  @map("missing_fields")
  preview               Json?
  previewHash           String?   @map("preview_hash")
  previewVersion        Int       @default(0) @map("preview_version")
  contextFingerprint    String?   @map("context_fingerprint")
  idempotencyKey        String    @map("idempotency_key")   // wf-{jobId8}-{stepKey}-{attempt}
  attempt               Int       @default(1)
  executionId           String?   @map("execution_id")      // SchoolAiExecution (typed ops)
  receiptId             String?   @map("receipt_id")        // AiWorkflowReceipt (other adapters)
  handoffId             String?   @map("handoff_id")
  receipt               Json?                               // StepReceipt (ids, counts, link) — no names
  errorCode             String?   @map("error_code")
  errorParams           Json?     @map("error_params")
  compensation          Json?
  version               Int       @default(1)
  startedAt             DateTime? @map("started_at")
  finishedAt            DateTime? @map("finished_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  @@unique([id, schoolId])
  @@unique([jobId, planVersion, stepKey])
  @@unique([schoolId, idempotencyKey])
  @@index([schoolId, jobId, status])
  @@map("ai_workflow_steps")
}

model AiWorkflowQuestion {
  id           String    @id @default(uuid())
  schoolId     String    @default("") @map("school_id")
  jobId        String    @map("job_id")
  job          AiWorkflowJob @relation(fields: [jobId, schoolId], references: [id, schoolId], onDelete: Cascade)
  stepId       String?   @map("step_id")       // null = plan-level ("which class?")
  field        String?                         // JSON pointer into step inputs, e.g. /entries/3/status
  kind         String                          // ENTITY_CHOICE | CHOICE | TEXT | DATE | NUMBER | CONFIRM_DEFAULT | ROWS
  promptKey    String    @map("prompt_key")    // localized template from adapter copy
  promptParams Json      @default("{}") @map("prompt_params")
  options      Json      @default("[]")        // entity refs {kind, ref, label?} — labels resolved client-side by locale
  status       String    @default("OPEN")      // OPEN | ANSWERED | DISMISSED | SUPERSEDED
  answer       Json?
  answeredById String?   @map("answered_by_id")
  answeredAt   DateTime? @map("answered_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  @@index([schoolId, jobId, status])
  @@map("ai_workflow_questions")
}

model AiWorkflowConfirmation {
  id              String   @id @default(uuid())
  schoolId        String   @default("") @map("school_id")
  jobId           String   @map("job_id")
  stepId          String   @map("step_id")
  previewVersion  Int      @map("preview_version")
  previewHash     String   @map("preview_hash")
  jobVersion      Int      @map("job_version")
  batchId         String?  @map("batch_id")
  confirmedById   String   @map("confirmed_by_id")
  clientCommandId String   @map("client_command_id")
  createdAt       DateTime @default(now()) @map("created_at")
  @@unique([stepId, previewVersion])
  @@unique([schoolId, confirmedById, clientCommandId])
  @@map("ai_workflow_confirmations")
}

model AiWorkflowHandoff {
  id               String    @id @default(uuid())
  schoolId         String    @default("") @map("school_id")
  campusId         String?   @map("campus_id")
  jobId            String    @map("job_id")
  job              AiWorkflowJob @relation(fields: [jobId, schoolId], references: [id, schoolId], onDelete: Cascade)
  stepId           String    @map("step_id")
  kind             String    // RECORD_APPROVAL | DOMAIN_REQUEST | DOMAIN_SCREEN | ROLE_TASK | DEEP_LINK
  targetRoute      String    @map("target_route")          // e.g. /accountant?view=payments (no PII, no ids of people)
  targetRoles      String[]  @map("target_roles")
  recordId         String?   @map("record_id")             // SchoolAiRecord for typed ops
  recordVersion    Int?      @map("record_version")
  domainRef        Json?     @map("domain_ref")            // {table, id} of the created request (DOMAIN_REQUEST)
  setupTaskId      String?   @map("setup_task_id")         // SchoolAiSetupTask (ROLE_TASK)
  prefill          Json?                                   // DOMAIN_SCREEN form values (server-side only)
  prefillHash      String?   @map("prefill_hash")
  idempotencyKey   String    @map("idempotency_key")       // handed to the domain write so we can observe it
  status           String    @default("OPEN")              // OPEN | COMPLETED | DECLINED | EXPIRED | SUPERSEDED
  completedReceipt Json?     @map("completed_receipt")
  expiresAt        DateTime  @map("expires_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  @@unique([schoolId, idempotencyKey])
  @@index([schoolId, status, kind])
  @@map("ai_workflow_handoffs")
}

// Receipt ledger for adapters that are not one of the 15 typed operations (typed ops keep SchoolAiExecution).
model AiWorkflowReceipt {
  id             String   @id @default(uuid())
  schoolId       String   @default("") @map("school_id")
  campusId       String?  @map("campus_id")
  actorId        String   @map("actor_id")
  capability     String
  idempotencyKey String   @map("idempotency_key")
  requestHash    String   @map("request_hash")
  state          String   // COMMITTED | UNCERTAIN (mirrors WorkflowEffect semantics, schema.prisma:400-412)
  receipt        Json
  createdAt      DateTime @default(now()) @map("created_at")
  @@unique([schoolId, actorId, idempotencyKey])
  @@index([schoolId, capability, createdAt])
  @@map("ai_workflow_receipts")
}

// Append-only progress log; payload carries ids + template keys only (no names, no free text).
model AiWorkflowEvent {
  id        String   @id @default(uuid())
  schoolId  String   @default("") @map("school_id")
  jobId     String   @map("job_id")
  job       AiWorkflowJob @relation(fields: [jobId, schoolId], references: [id, schoolId], onDelete: Cascade)
  seq       Int
  type      String   // JOB_STATE | STEP_STATE | QUESTION | PREVIEW | RECEIPT | HANDOFF | BUDGET | REPLAN
  stepId    String?  @map("step_id")
  payload   Json
  createdAt DateTime @default(now()) @map("created_at")
  @@unique([jobId, seq])
  @@map("ai_workflow_events")
}

// Structured "what users asked for that we cannot do" (fixes B.engine finding: unsupported only free text).
model AiCapabilityGap {
  id             String   @id @default(uuid())
  schoolId       String   @default("") @map("school_id")
  actorRole      String   @map("actor_role")
  language       String
  reason         String   // UNSUPPORTED | ROLE_DENIED | EXCLUDED | SEAT_HELD_BY_OTHER
  nearestKey     String?  @map("nearest_key")
  maskedSummary  String   @map("masked_summary") // ≤200 chars, pseudonymised
  createdAt      DateTime @default(now()) @map("created_at")
  @@index([schoolId, reason, createdAt])
  @@map("ai_capability_gaps")
}

// Per-user role questionnaire answers (typed, versioned). Replaces the 18 free-text strings for new users.
model AiSetupResponse {
  id                   String    @id @default(uuid())
  schoolId             String    @default("") @map("school_id")
  campusId             String?   @map("campus_id")
  userId               String    @map("user_id")
  role                 String
  questionnaireKey     String    @map("questionnaire_key")      // e.g. "teacher"
  definitionVersion    Int       @map("definition_version")     // code version of the question set
  version              Int       @default(1)                    // answer version; job binds to it
  answers              Json      @default("{}")
  confirmedKeys        String[]  @map("confirmed_keys")
  status               String    @default("DRAFT")              // DRAFT | SUBMITTED | APPLYING | APPLIED | PARTIAL | DEFERRED
  deferrals            Int       @default(0)
  jobId                String?   @map("job_id")
  submittedAt          DateTime? @map("submitted_at")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")
  @@unique([schoolId, userId, questionnaireKey])
  @@map("ai_setup_responses")
}
```

### 3.2 Changes to existing code and schema

- **`SchoolAiExecution`, `SchoolAiRun`, `SchoolAiRecord`: no schema change.** Typed-operation steps keep writing `SchoolAiExecution` through `executeSchoolAiToolInTransaction`, with idempotency key `wf-…` (it matches the regex at `execution.ts:52-57`). The step stores `executionId`. Class C typed ops hand off to the record approval surface and SKO-470 Runs unchanged.
- **`src/lib/ai/openai.ts`:**
  - `generateAIDraft` (`:587`) gains an optional `responseFormat: {name, schema, strict: true}`. The OpenAI request body then carries `response_format: {type: "json_schema", json_schema: …}`. This closes B.engine's "no JSON mode" finding (`openai-settings.ts:12-17`).
  - `lockAndReconcileAICredits` (`:490-503`) also releases `ai_workflow_jobs.reserved_credits` where `reservation_expires_at <= now` and the job is non-terminal. This uses the same school lock, so it does not open a second credit path.
- **`src/lib/ai/pseudonymize.ts`: no behaviour change** for existing callers. The new `workflow-masker.ts` builds prompts from typed entities, so the `^name$` → PERSON rule (`:37`) never sees class or subject names (§4.6).
- **`src/workers/outbox-worker.ts:49`:** add `sweepWorkflowJobs(db)` beside `sweepSchoolRuns`. Remove `sweepAutomaticJobs` once the legacy jobs have drained.
- **Legacy rows** (`school_ai_requests` with feature `AUTOMATIC_SETUP_V1` / `AUTOMATIC_ACTION_V1`): no data migration. They stay readable through `GET /api/automation` in a "Earlier automatic work" section for 30 days, then the retention cron archives them.

### 3.3 Migration procedure (per §10 engineering rules)

1. Hand-write `prisma/migrations/20261024000000_ai_workflows_v2/migration.sql`. It holds the new tables, uniques, indexes and FK constraints to `schools(id)`, `campuses(id)` and the composite `(id, school_id)` pairs.
2. Run `prisma migrate diff --from-schema-datamodel …` to check for drift.
3. Apply to the isolated 55438 cluster with `migrate deploy`, then to dev Supabase through `DIRECT_URL` (port 5432). Then run `migrate status`, `prisma generate` and `node scripts/gen-tenant-registry.mjs`, and restart the dev server.
4. Never run `prisma format` or `db push`. Commit only our own hunks of `schema.prisma` and `tenant-models.ts` through a temporary `GIT_INDEX_FILE`.

### 3.4 State machines (every state the UI must render)

**Job states.** "UI renders" names the component and the copy key.

| Job status | Meaning | Entered from | UI renders |
|---|---|---|---|
| `PLANNING` | phase-1 call (or questionnaire compile) in flight | start, edit_request, replan | plan-board skeleton with "Working out the steps" + cancel |
| `NEEDS_INPUT` | at least one OPEN question blocks every runnable step | PLANNING, RUNNING | question-tray expanded; blocked steps dimmed with their question inline |
| `REVIEW` | plan-review mode (questionnaire, or free-form plan with ≥ 3 B/C steps): whole plan shown before anything runs | PLANNING | grouped plan with per-group "Confirm these" and "Run everything I confirmed" |
| `RUNNING` | at least one step queued or running, nothing waiting on the user | REVIEW, confirm, answer, resume | live step progress; budget meter |
| `WAITING_CONFIRM` | the only runnable steps are class B awaiting confirmation | RUNNING | confirm-sheet affordance on each card; tray badge |
| `WAITING_HANDOFF` | everything that can run here has run; open class C hand-offs remain | RUNNING | hand-off cards with who must act + live status; "You can close this; we will update it" |
| `PAUSED` | user paused | any active | resume / cancel |
| `PAUSED_CREDITS` | reservation or charge refused (`AICreditError`, `openai.ts:441-452`) | any | neutral billing copy (G51), resume after top-up; completed steps intact |
| `BLOCKED_ACCESS` | actor's role, campus or accessVersion changed (re-checked in `authorizeActor`) | any | "Your access changed"; the job is read-only until re-run by a current user |
| `REPLANNING` | context drift or an answer changed the plan's structure | RUNNING, NEEDS_INPUT | diff of superseded vs new steps; committed steps pinned |
| `COMPLETED` | terminal, with outcome | — | outcome banner (below) + receipts |
| `FAILED` | system failure after bounded retries (provider down, invariant) | any | error with retry; committed receipts listed |
| `CANCELLED` | user cancelled | any non-terminal | receipts of what ran before cancel |
| `EXPIRED` | `expiresAt` passed (24 h free-form, 14 days questionnaire) with no activity | any non-terminal | "Start again from here" (new job seeded with remaining steps) |

**Outcomes** are computed by `executor/outcome.ts` from receipts, never from model text. This generalizes `validation.ts:12-17`:

- `EXECUTED`: at least one write receipt, no open hand-offs, no blocked steps.
- `AWAITING_APPROVAL`: at least one open hand-off.
- `PARTIAL`: some writes were committed and some steps were blocked or declined.
- `ANSWERED`: only reads.
- `PLAN_SAVED`: only drafts.
- `NOTHING_DONE`: everything was declined, unsupported or denied.

A read or a draft is never `EXECUTED`.

**Step states.**

| Step status | Meaning | UI renders on `step-card` |
|---|---|---|
| `PROPOSED` | in plan, deps not met | muted card, dependency chips ("after: Create classes") |
| `NEEDS_INPUT` | missing fields; questions attached | inline question(s) with entity chips |
| `FILLING` | phase-2 call or resolver running | shimmer on fields |
| `READY` | inputs complete, preview computed | preview (table/single/diff) |
| `WAITING_CONFIRM` | class B, preview shown, awaiting binding confirm | primary "Confirm" + "Change" + "Skip" |
| `QUEUED` | A, or B confirmed; waiting for the runner | "Queued" |
| `RUNNING` | inside the execution transaction | progress |
| `SUCCEEDED` | write receipt committed | receipt summary + link ("Open in Lending desk") + "Undo…" if compensation exists |
| `HANDED_OFF` | class C prepared; waiting in the domain | hand-off card: target role, deep link, status (open/approved/declined) |
| `DENIED` | gate refuses for this role or seat | "Only the principal does this here" + optional role-task hand-off |
| `UNSUPPORTED` | no registry capability | "Not connected to AI yet" + nearest feature link; logged to `AiCapabilityGap` |
| `STALE` | preview hash changed (context drift) | old vs new diff; re-confirm (B) or re-prepare (C) |
| `BLOCKED` | domain refused (4xx with code) | localized reason from `copy/`, "Fix and retry" |
| `UNCERTAIN` | the service may have committed but no receipt (lost response, no native key, reconcile inconclusive) | "Check this in Lending desk before retrying"; retry disabled until checked |
| `SKIPPED` | dependency declined, blocked or denied | reason chip linking to the dependency |
| `DECLINED` | user skipped it | "Skipped by you" + restore |
| `SUPERSEDED` | replaced by a newer plan version | collapsed under "Earlier plan" |
| `FAILED` | system error, retryable | retry |
| `CANCELLED` | job cancelled before it ran | muted |

Transitions are a pure function `nextStepState(step, event)` in `executor/scheduler.ts`. Property tests drive it with random command sequences (§10).

---

## 4. How the model is prompted

### 4.1 Tool retrieval

- **Filter first, in code.** `manifest.ts` is filtered by role, by the adapter gate's *static* parts (role set, module flag from the permission snapshot, capability keys from `navigation/capabilities.ts`) and by seats (`seats.ts:12-27`). TEACHER drops to about 150 cards, LIBRARIAN to 75 (Appendix A headlines). The model never sees a capability the role cannot hold, which keeps the "typing a request changes nothing" rule (B.decisions rule 2).
- **Rank.** BM25 runs over each card's EN/AR/UR `title`, `description`, `keywords` and `examples` (authored per adapter). It uses the normalized, masked request (Arabic-script normalization: ي/ی, ك/ک, ه/ہ/ة, tatweel and diacritics stripped). The top 20 cards go to the planner, plus the always-present pseudo-capabilities `ask`, `answer_from_reads` and `unsupported`. Optional embeddings re-rank (founder decision §11). Card text is static and the request is masked first, so embeddings carry no PII.
- **Escape hatch.** The plan may return `needCapabilities: ["query"]` once. Code runs a second retrieval and repeats phase 1. This counts as one more model call against the budget.

### 4.2 Capability cards (what the model sees)

These are compact cards with real descriptions (fixes `service.ts:123`):

```json
{ "id": "library.desk_issue_copy", "title": "Lend a library copy to a member",
  "when": "A librarian lends a specific book to a student or staff member now.",
  "inputs": ["member (person)", "book title or copy barcode", "override reason (only if the copy is held for someone else)"],
  "class": "B", "batch": "one loan per step; use forEach for several members", "produces": ["loanId", "dueDate"] }
```

The model is told the class so it can phrase expectations. Code ignores any class the model writes.

### 4.3 Two-phase protocol

**Phase 1: plan proposal** (one call, `temperature 0`, `response_format` strict, max 1,500 output tokens, 20 s).

```ts
// planner/protocol.ts
export const planProposalSchema = z.strictObject({
  kind: z.enum(["plan", "answer", "ask", "unsupported"]),
  summary: z.string().max(240),                 // masked; shown only after unmask, optional in UI
  steps: z.array(z.strictObject({
    key: z.string().regex(/^s\d{1,2}$/),
    capability: z.string(),                     // must be in the retrieved card set
    purpose: z.string().max(160),               // internal; UI titles come from adapter copy
    dependsOn: z.array(z.string()).max(6),
    forEach: z.strictObject({ ref: z.string() }).nullable(),          // "$s1.output.classIds"
    mentions: z.array(z.strictObject({ field: z.string(), text: z.string().max(200), token: z.string().nullable() })).max(40),
    knownInputs: z.record(z.string(), z.unknown()),                  // only scalar facts stated by the user
    evidence: z.array(z.strictObject({ field: z.string(), quote: z.string().max(300) })).max(60),
    missing: z.array(z.string()).max(20),
  })).max(25),
  questions: z.array(z.strictObject({ about: z.string(), stepKey: z.string().nullable() })).max(5),
  unsupported: z.array(z.strictObject({ request: z.string().max(200), nearest: z.string().nullable() })).max(5),
  needCapabilities: z.array(z.string().max(80)).max(3),
});
```

`plan-validate.ts` rejects the proposal (one repair call at most, then FAILED with a localized message) when:

- a capability is not in the role's filtered registry;
- the graph has a cycle or an unknown `dependsOn`;
- there are more than 25 steps;
- a `forEach` ref does not point to an array in the dependency's `output` schema;
- an evidence quote fails the normalized match (§4.5).

SyntaxError and schema failure both go to the repair path (fixes `service.ts:128,134`).

**Fast path.** When the plan has exactly one step and that capability's model schema is at most 12 fields, the phase-1 call includes that capability's full input schema (`inlineFill: true`), so most single requests cost one model call ("issue Atlas to Ayesha").

**Phase 2: per-step argument filling** (one call per step that still has `missingFields` after deterministic resolution; strict schema; 1,000 tokens; 20 s).

1. Deterministic first:
   - `resolvers` map mentions to ids. A student by name, roll number and class; a library member by student or staff; a copy by title → first AVAILABLE barcode; an invoice by student, month and status.
   - `bindings` resolve `$sN.output.x` from committed receipts.
   - Adapter `defaults` apply, for example the due date from loan rules (`desk.ts:33`) or today in the campus timezone.
   - Ambiguity (two Ayeshas in 7B) becomes an `ENTITY_CHOICE` question with chips. No model call.
2. The model fills only fields that need language understanding: free-text reason, a per-pupil status from a sentence, an amount stated in words.

   ```ts
   export const stepFillSchema = z.strictObject({
     inputs: z.record(z.string(), z.unknown()),        // validated by adapter.input after merge
     evidence: z.array(z.strictObject({ field: z.string(), quote: z.string().max(300) })),
     missing: z.array(z.strictObject({ field: z.string(), reason: z.enum(["not_stated", "ambiguous", "conflict"]) })),
   });
   ```

3. Code merges the result, validates it with `adapter.input` (zod, strict) and enforces `evidence.required`. It then runs `adapter.preview`, computes `previewHash = canonicalDigest({capability, capabilityVersion, inputs, previewFacts})` and sets `READY`. A fill **cannot change the capability**; this carries over the tool-switch guard at `validation.ts:5-9`.

### 4.4 How missing-detail questions attach to steps

- A missing field becomes an `AiWorkflowQuestion {stepId, field, kind, promptKey}`. `promptKey` comes from the adapter's `copy.questions[field]` in EN/AR/UR, so questions are deterministic and localized rather than model prose.
- The step goes to `NEEDS_INPUT`. Independent branches keep running, and the job reports `NEEDS_INPUT` only when nothing else can run.
- An answer is a typed command `{type: "answer", questionId, value}`:
  - An entity chip or date answer is applied by code with no model call.
  - A free-text answer triggers one phase-2 re-fill of **that step only**.
  - If the answer contradicts the plan's structure (a different class, a different intent), `revalidate.ts` raises `REPLAN`.
- Questions are capped by `budget.maxQuestions` (default 20 free-form, 60 questionnaire). This replaces the 30-answers cap at `service.ts:102`.

### 4.5 Evidence (replaces the substring `evidenceQuote`)

- Evidence is matched only against **user-authored text**: `job.requestText` plus answers. Server-appended role interviews and canned sentences are never searched; they move to the system prompt (fixes `service.ts:42,48,152` and `automatic-workspace.tsx:33`).
- Normalization: NFKC, case-fold, whitespace collapse; Eastern-Arabic and Urdu digits mapped to ASCII; Arabic-script letter unification; diacritics and tatweel removed; JSON escaping never applied, because the stored text is the original. A quote matches when its normalized form is a substring, or reaches token-set similarity ≥ 0.85 within one sentence window.
- Each adapter declares `evidence.required` field paths. Examples: per-entry attendance status, payment amount and method, leave dates. Fields from `resolved`, `binding` or `default` provenance need none, and the preview shows their provenance ("due date from library rules").

### 4.6 Pseudonymisation that does not mask class or subject names

`pii/workflow-masker.ts` wraps the shared `Pseudonymizer` (`pseudonymize.ts:56`) without changing it. A per-job typed context is built from `ContextEntity {kind, ref, label}`:

| kind | sent to the model as |
|---|---|
| `CLASS`, `SECTION`, `SUBJECT`, `ROOM`, `PERIOD`, `FEE_HEAD`, `BOOK_TITLE`, `CYCLE` | label verbatim; these are school vocabulary, not PII |
| `STUDENT`, `STAFF`, `GUARDIAN`, `MEMBER` | `[STUDENT_3]` plus non-identifying hints allowed by policy (class label), never the name |
| phones, emails, IDs, addresses | removed; `scanForPII` (`:162`) plus `assertNoPII` (`:175`) still run on the final prompt |

- **Free-text person names.** `vocabulary.ts` loads the person names in scope: the actor's campus, capped and campus-filtered. It matches them in the request with Unicode word boundaries, after the same Arabic-script normalization, and replaces them with their tokens before any model call. This closes the gap noted in B.engine §7, where free-text names were not masked. Unmatched capitalised names (Latin) and unmatched multi-token Arabic-script names get a generic `[PERSON_n]` token and an `ENTITY_CHOICE` question if a resolver needs them.
- **No unsafe replacement.** Only values of at least 3 characters are registered for replacement. Replacement is boundary-aware, not raw `split/join` (`:77-84`), so short labels can never corrupt numbers or JSON.
- **Read results are masked.** Read adapters return entities through `maskAssistantCatalog`-style projection (`assistant-catalog-service.ts:92-96`). Receipts store ids, counts and links only, never labels with names (fixes `service.ts:68-69`).
- **Confidential paper text.** Any capability touching unreleased paper text is excluded unless `providerConfidentiality` allows it (B.decisions T11).
- **Questionnaire rows.** Staff and students are never sent to the model as prose. Pasted tables are parsed by deterministic column mapping first, and the model sees only masked headers and samples (keeps the legacy withholding at `setup-generation-service.ts:102-107`).

### 4.7 JSON mode, language, and what the model never writes

- **Structured output.** Every call uses `response_format: json_schema` (strict) through the extended `generateAIDraft`. `model-schemas.ts` is code-generated from zod with OpenAI-strict constraints (all properties required, nullable instead of optional, `additionalProperties: false`). A readiness check refuses to start jobs if the configured `OPENAI_MODEL` rejects `json_schema`.
- **Language.**
  - The system prompts are English. The user text stays in its original language (EN/AR/UR).
  - `job.language` comes from the UI locale. The request's script is detected (Urdu-specific letters ٹ ڈ ڑ ں ے ھ) and stored as `requestLanguage`.
  - All **user-visible** strings (step titles, questions, errors, outcomes) come from adapter or engine copy in `job.language`. The model writes only internal `purpose`, the optional masked `summary` and `answer` text for read-only questions, and it is told to write those in `job.language`.
- **Prompt hygiene.** School content is never placed in the system prompt. The user turn has three delimited sections: request, context entities and capability cards. A content-injection guard sentence plus the code gates are the real defence (B.decisions rule 23 becomes code in §5).

---

## 5. Authorization and confirmation classes

### 5.1 Gates, re-checked everywhere

```ts
// registry/gates.ts
export type GateCheck = (ctx: GateContext, input?: unknown) => Promise<GateResult>;
export interface GateContext { user: AuthUser; db: TxClient; permissions: PermissionSnapshot; seats: CampusSeats; campusId: string | null }
export type GateResult = { ok: true } | { ok: false; code: "ROLE" | "MODULE" | "SEAT" | "SCOPE" | "GUARDIAN" | "CAPABILITY_KEY" | "BILLING"; heldBy?: UserRole[] };
export const gate = {
  roles: (...r: UserRole[]): GateCheck => …,
  module: (m: PermissionModule, a: "view" | "add" | "edit" | "delete"): GateCheck => …,   // loadWorkspacePermissionSnapshot / moduleFlags
  predicate: (name: string, fn: (u: AuthUser) => boolean | Promise<boolean>): GateCheck => …, // canManageLibrary, canMarkAttendance, canLeadAcademics …
  seat: (s: "academicLead" | "financeDesk" | "libraryDesk" | "frontDesk"): GateCheck => …,
  ownCampus: (pick: (input: any) => string | null): GateCheck => …,
  guardianOf: (pick: (input: any) => string, permission: GuardianPermission): GateCheck => …, // guardianHasAccess
  capabilityKey: (k: CapabilityKey): GateCheck => …,   // navigation/capabilities.ts keys (34 nav features outside the matrix)
  all: (...g: GateCheck[]): GateCheck => …,
};
```

The gate runs at six points:

1. retrieval (the static part);
2. plan validation;
3. preview;
4. confirmation;
5. inside the execution transaction, after `authorizeActor()` (role, campus, accessVersion and school operational: today's `service.ts:29-34`, plus `assertSchoolOperational`);
6. in the worker, after `resolveWorkerPrincipal` (`access.ts:97-103`; the pattern in `run-service.ts:125-128`).

The wrapped service keeps its own checks as defence in depth. One example: `issueCopy` calls `assertDesk` (`desk.ts:29`), and the adapter adds `gate.module("library","add")` because `canManageLibrary` admits PRINCIPAL (B.roles finding on `scope.ts:260-262`).

### 5.2 Confirmation classes in code

```ts
// executor/classes.ts
export type ConfirmationClass = "A" | "B" | "C";
const RANK = { A: 0, B: 1, C: 2 } as const;
export async function effectiveClass(adapter: AnyCapability, ctx: GateContext, input: unknown): Promise<ConfirmationClass> {
  let c: ConfirmationClass = adapter.confirmation;                          // static, from registry
  if (c === "A" && adapter.limits?.autoRunMax && sizeOf(input) > adapter.limits.autoRunMax) c = "B";
  if (adapter.typedOperation && c === "B" && await separationRequired(ctx, adapter.typedOperation)) c = "C"; // Delivery Policy (access.ts:184-200)
  if (adapter.key === "finance.apply_operation" && isRefund(input) && await correctionSeparateApprover(ctx)) c = "C";
  return RANK[c] >= RANK[adapter.confirmation] ? c : adapter.confirmation;   // escalate only, never lower
}
```

- **The class is static per adapter**, checked by `registry.test.ts` against a floor table derived from Appendix A risk:
  - READ → A.
  - CREATE/UPDATE → B, with an explicit A allow-list in `registry/class-a-allowlist.ts`. Each entry needs a justification (own profile, private plan, appends protected by domain validators, as in B.decisions T1).
  - FINANCIAL, PUBLISH, COMMUNICATION, ACCESS_GRANT, DESTRUCTIVE and APPROVAL_DECISION → C. No exceptions.
- **The model never sends a class.** Protocol schemas have no class field the engine reads.
- **Class A** runs as soon as the step is `READY` and its deps are met. The worker may run it.
- **Class B** needs an `AiWorkflowConfirmation` row:
  - It is created only by `POST /commands {type:"confirm", stepId, previewVersion, previewHash, jobVersion, clientCommandId}`.
  - The runner recomputes the preview inside the transaction. A mismatch sets `STALE` with a diff and invalidates the confirmation.
  - The worker never creates confirmations. A typed or spoken "yes" in the composer is not a command (ROLLOUT.md:13).
  - **Batch confirm** carries an explicit list of `{stepId, previewVersion, previewHash}` (≤ 10), each of which was rendered on screen. This is how plan-review mode confirms a group.
- **Class C** never executes in the engine with the requester as approver. `service.ts:81` self-approval is removed. The step runner calls `handoff.create(kind)` and the step becomes `HANDED_OFF`.

### 5.3 Class C hand-off kinds (all reuse existing approval surfaces)

| Kind | Used for | What the engine writes | Who completes it | How the engine observes completion |
|---|---|---|---|---|
| `RECORD_APPROVAL` | the class-C typed ops (`fees.generate_invoices`, `finance.apply_operation`, `communications.queue_announcement`, `timetable.publish_reviewed`, `students.promote_enrollment`, `academics.transition_year`, `attendance.record_register` for operators, `operations.record_risk_decision`) | `createWorkspaceRecord(WORKFLOW, proposal, idempotencyKey)` left unapproved, plus the preview | an approver on the existing workspace review UI; executes now or schedules a SKO-470 `SchoolAiRun` (`run-service.ts:57-80`) | `SchoolAiExecution` by `(recordId, recordVersion, operation)` (unique `schema.prisma:6726`) |
| `DOMAIN_REQUEST` | domains with a maker-checker queue: `fees.request_adjustment` (`adjustments-service.ts`), `corrections.request_*`, rollover plan prepare→approve | the *request* through its own service (itself class B on the requester's screen) | the checker on the domain screen | poll or notify on the request row's decision |
| `DOMAIN_SCREEN` | consequential writes with no separate approver: `fees.collect_payment`, datesheet publish, marks/result publication links, access grants | `AiWorkflowHandoff.prefill` (server-side) and a deep link `?handoff=<id>` (an id only, no PII in the URL) | the human presses the domain's own commit button; the screen loads the prefill via `use-workflow-handoff.ts` and sends `idempotencyKey = handoff.idempotencyKey` | domain row by that key (for example `payment.idempotencyKey`, `fees/collect/route.ts:62-67`) |
| `ROLE_TASK` | the step needs another seat (operator setup needing the principal to activate the year, B.typedOps §5) | WORKFLOW draft plus `SchoolAiSetupTask` assigned to the seat holder (`schema.prisma:6798-6829`) | the assignee | task accepted plus the domain receipt |
| `DEEP_LINK` | APPROVAL_DECISION capabilities (55), Exam Studio chain, anything excluded | nothing | the human on that screen | none; the step closes as `HANDED_OFF` and does not count toward EXECUTED |

**Separation of duties** stays enforced where it lives today: `repository.ts:366-368` (`assertApprovalSeparation`), `finance-operations-service.ts:94-98` and the adjustments maker-checker. The engine's job is to **predict and name** it. `whoCanApprove(capability, campusId)` evaluates the gate against active users' roles and seats, and the hand-off card says "Another campus admin or the principal must approve this", instead of failing with 403 (fixes B.engine's minor finding on `service.ts:81`).

**Rule.** No chat phrase alone publishes marks, posts or moves money, sends family messages or grants access. Every such capability is class C by the floor table, and the test suite fails if one is not.

---

## 6. Idempotency, receipts, audit, credits

### 6.1 Idempotency layers (keeps every layer of B.engine's strengths)

1. **Job start:** unique `(schoolId, actorId, idempotencyKey)` + `requestHash`. Same key with a different hash → 409. The P2002 race reloads, like `run-service.ts:70-78`.
2. **Command:** `clientCommandId` unique per actor. A duplicate returns the same result, so offline retries are safe.
3. **Step:** `idempotencyKey = wf-{jobId[0..8]}-{stepKey}-{attempt}`. It is persisted **before** execution. `attempt` increments only when inputs or the preview change, so a replay of the same preview reuses the key and a changed preview never hits `EXECUTION_KEY_CONFLICT` (`execution.ts:248`).
4. **Adapter replay mode** (declared per adapter):
   - `native-key`: the service accepts a key (`executeSchoolAiTool`, `logCall`, `fees/collect`, the roster `importBatch`).
   - `same-tx`: the adapter calls a `…Tx(tx, user, input)` service variant and writes `AiWorkflowReceipt` in the same serializable transaction (`schoolAiTransaction`, `transaction.ts:13-39`). This is the target for every new adapter.
   - `natural-key`: the service has no key and opens its own transaction. The adapter first writes the receipt `UNCERTAIN`, calls the service, then flips it to `COMMITTED`. On restart `reconcile()` looks up the domain row by natural key. Examples: `bookIssue {copyId, memberId, returnedAt: null, createdAt ≥ startedAt}`; `learnerLeaveRequest {studentId, requestedById, fromDate, toDate}`. If that is inconclusive the step becomes `UNCERTAIN` and is never auto-retried (the `WorkflowEffect` semantics).

### 6.2 Receipts

```ts
export interface StepReceipt {
  kind: "write" | "handoff" | "read" | "draft";
  capability: string;
  entities: Array<{ type: string; id: string }>;      // ids only; labels resolved at render time under the viewer's access
  counts: Record<string, number>;                      // created/kept/updated/skipped — must equal DB counts (tested)
  domain?: { type: "SchoolAiExecution" | "Payment" | "BookIssue" | "LearnerLeaveRequest" | string; id: string; number?: string };
  link: string;                                        // deep link into the domain screen
  replayed: boolean;
  committedAt: string;
}
```

### 6.3 Audit

- Every transition appends an `AiWorkflowEvent`. Every write also produces the domain's own audit, plus `auditLog {tableName: "ai_workflow_steps", recordId: stepId, newValue: {capability, idempotencyKey, receiptRef, class}}`.
- Confirmations and hand-off creation and completion are audited the same way.
- Event payloads never carry names or free text, which keeps `pseudonymize.ts:1-18` policy for stored data.

### 6.4 Credits (reservation, per AI action)

- **Estimate at plan time:** `1 (plan) + Σ steps needing model fill + 1 replan buffer`. A questionnaire plan reserves `ceil(freeTextAnswers/2)`, because compile needs no model.
- **Reserve** with `reserveAICredits(schoolId, n, tx)` in the job-create transaction (`openai.ts:505-511`). The reservation expires with the job and is released by the extended `lockAndReconcileAICredits`.
- **Charge** one credit per **accepted** model response (an AI action) with `consumeAICreditAndLog` (`openai.ts:522`), in the same transaction as the event that records it. A repair attempt is folded into the action it repairs. Adapter executions cost no credits. Replays cost nothing.
- **Exhaustion** → `PAUSED_CREDITS` (not FAILED), resumable. Committed steps stay (B.decisions T9). Plan limits in `src/config/plans.ts` are never edited.

---

## 7. Coverage plan: reaching all 700 capabilities

### 7.1 Authoring pattern

```ts
// registry/types.ts
export interface CapabilityAdapter<I, O, P> {
  key: string; version: number; cluster: "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";
  inventoryKeys: string[];                 // Appendix A rows covered (1..n)
  roles: readonly UserRole[];              // upper bound; DB matrix asserts gate ⊆ roles
  risk: "READ" | "CREATE" | "UPDATE" | "DESTRUCTIVE" | "FINANCIAL" | "PUBLISH" | "COMMUNICATION" | "ACCESS_GRANT" | "APPROVAL_DECISION";
  confirmation: ConfirmationClass;         // static
  handoff?: HandoffSpec;                   // required iff confirmation === "C"
  typedOperation?: SchoolAiOperation;      // set by typedOperationAdapter
  copy: { title: L10n; description: L10n; keywords: L10nList; examples: L10nList;
          stepTitle: L10nTemplate; questions: Record<string, L10nTemplate>; errors?: Record<string, L10nTemplate> };
  input: z.ZodType<I>;                     // strict; ids, never names
  mentions?: Record<string, MentionKind>;  // fields the planner may fill with a mention instead of an id
  resolvers?: Record<string, Resolver>;    // deterministic name→id, defaults
  evidence: { required: string[] };        // JSON pointers
  gate: GateCheck;
  limits?: { maxItems?: number; autoRunMax?: number };
  preview(ctx: AdapterContext, input: I): Promise<P>;          // read-only, deterministic, inside tenant context
  previewView: PreviewView<P>;             // table | single | diff columns for preview-view.tsx
  fingerprint?(ctx: AdapterContext, input: I): Promise<string>; // live-context drift detector
  execute(ctx: AdapterContext, input: I, key: string, tx?: TxClient): Promise<O>;
  replay: "native-key" | "same-tx" | "natural-key";
  reconcile?(ctx: AdapterContext, input: I, key: string, since: Date): Promise<O | null>;
  output: z.ZodType<O>;                    // for $ref bindings and fan-out
  receipt(out: O): StepReceipt;
  compensation: { kind: "capability"; capability: string; map: (out: O) => unknown } | { kind: "manual"; note: L10n } | { kind: "none" };
}
```

**Example 1: teacher attendance** (C5 `attendance.save_register`, direct; Appendix A line 512).

```ts
export default defineCapability({
  key: "attendance.save_register", version: 1, cluster: "C5",
  inventoryKeys: ["attendance.save_register", "attendance.mark_class"],
  roles: ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "TEACHER"], risk: "CREATE",
  confirmation: "B",   // founder decision 6: full register, confirmed as a whole; never a bare "all present"
  copy: { title: { en: "Take a class register", ar: "تسجيل حضور الصف", ur: "کلاس کی حاضری لگائیں" }, /* … */
          stepTitle: { en: "Register for {class} on {date}", ar: "سجل {class} بتاريخ {date}", ur: "{class} کی حاضری، {date}" },
          questions: { "/entries/*/status": { en: "Was {student} present?", ar: "هل حضر {student}؟", ur: "کیا {student} حاضر تھے؟" } } },
  input: z.strictObject({ classId: z.string(), date: z.iso.date(),
    entries: z.array(z.strictObject({ studentId: z.string(), status: z.enum(["PRESENT","LATE","PARTIAL","ABSENT","EXCUSED","LEAVE"]),
      arrivalTime: z.string().nullable(), departureTime: z.string().nullable() })).min(1).max(300),
    submit: z.boolean() }),
  mentions: { classId: "CLASS", "entries/*/studentId": "STUDENT" },
  resolvers: { classId: resolveTeacherClass /* own assigned classes only */, date: todayInCampusTz,
               entries: expandRosterWithStatements /* roster from registerView(); "everyone else present" only if the user said so */ },
  evidence: { required: ["/entries/*/status"] },  // per row: its own quote, or the explicit "rest" statement quote
  gate: gate.all(gate.predicate("canMarkAttendance", canMarkAttendance), gate.module("attendance", "add"), gate.ownCampus(i => null), teacherOwnsClass),
  limits: { maxItems: 300 },
  preview: (ctx, i) => registerPreview(ctx.user, i),          // registerView (register.ts:73) + knownStatus diff
  previewView: { kind: "table", columns: ["student", "status", "source"], highlight: "changed" },
  fingerprint: (ctx, i) => rosterAndKnownStatusHash(ctx, i),   // enrolment or another teacher's save → STALE
  execute: (ctx, i) => saveRegisterWithNotify(ctx.user, i),    // service extraction: future-date check + ATTENDANCE_SUBMITTED notify move out of the route
  replay: "same-tx",                                           // after extraction to saveRegisterTx
  output: z.strictObject({ registerId: z.string(), saved: z.number(), conflicts: z.number() }),
  receipt: o => ({ kind: "write", capability: "attendance.save_register", entities: [{ type: "AttendanceRegister", id: o.registerId }],
                   counts: { saved: o.saved, conflicts: o.conflicts }, link: "/teacher/attendance", replayed: false, committedAt: "" }),
  compensation: { kind: "capability", capability: "attendance.save_register", map: o => ({ reopen: o.registerId }) },
});
```

The Urdu request "7B کی آج کی حاضری: سب حاضر سوائے علی اور سارہ" works like this:

- The planner returns one step with mentions Ali and Sara (masked as `[STUDENT_n]` after vocabulary match) and evidence quotes for "سوائے علی اور سارہ" (absent) and "سب حاضر" (rest present).
- The resolver expands the full roster. Each row shows its source.
- Two pupils named Ali raise an `ENTITY_CHOICE` question.
- The teacher confirms the whole register (class B).

**Example 2: library issue** (C7 `library.desk_issue_copy`, direct; `desk.ts:95-121`).

```ts
export default defineCapability({
  key: "library.desk_issue_copy", version: 1, cluster: "C7", inventoryKeys: ["library.desk_issue_copy"],
  roles: ["LIBRARIAN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "SUPER_ADMIN"], risk: "CREATE", confirmation: "B",
  input: z.strictObject({ memberId: z.string(), barcode: z.string().regex(/^[A-Za-z0-9-]{3,40}$/), overrideReason: z.string().min(8).max(300).nullable() }),
  mentions: { memberId: "MEMBER", barcode: "BOOK_TITLE" },
  resolvers: { memberId: resolveLibraryMember /* student or staff by name+class; ambiguous → chips */,
               barcode: firstAvailableCopyOfTitle /* AVAILABLE first; held copy → question for overrideReason */ },
  evidence: { required: [] },              // member and title come from mentions with their own quotes; no free facts
  gate: gate.all(gate.predicate("canManageLibrary", canManageLibrary), gate.module("library", "add"), gate.seat("libraryDesk")),
  preview: (ctx, i) => issuePreview(ctx, i), // member, copy, current loans vs maxLoans, due date from currentRules (desk.ts:33)
  previewView: { kind: "single", fields: ["member", "title", "barcode", "dueDate", "loansAfter"] },
  fingerprint: (ctx, i) => copyStatusAndUpdatedAt(ctx, i.barcode),
  execute: (ctx, i) => issueCopy(ctx.user, { memberId: i.memberId, barcode: i.barcode, ...(i.overrideReason ? { overrideReason: i.overrideReason } : {}) }),
  replay: "natural-key",                   // issueCopy opens prisma.$transaction itself (desk.ts:98); target: extract issueCopyTx → same-tx
  reconcile: (ctx, i, _k, since) => findOpenIssue(ctx, { barcode: i.barcode, memberId: i.memberId, since }),
  output: z.strictObject({ issueId: z.string(), dueAt: z.string() }),
  receipt: o => ({ kind: "write", capability: "library.desk_issue_copy", entities: [{ type: "BookIssue", id: o.issueId }],
                   counts: { issued: 1 }, link: "/librarian?view=lending", replayed: false, committedAt: "" }),
  compensation: { kind: "capability", capability: "library.desk_return_copy", map: o => ({ issueId: o.issueId }) },
  copy: { /* EN/AR/UR */ } as never,
});
```

**Example 3: accountant payment** (C6 `fees.collect_payment`, wrapper, FINANCIAL → class C; `fees/collect/route.ts:22-70`).

```ts
export default defineCapability({
  key: "fees.collect_payment", version: 1, cluster: "C6", inventoryKeys: ["fees.collect_payment"],
  roles: ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"], risk: "FINANCIAL", confirmation: "C",
  handoff: { kind: "DOMAIN_SCREEN", route: "/accountant?view=payments", targetRoles: ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"],
             observe: { model: "payment", by: "idempotencyKey" } },
  input: z.strictObject({ studentId: z.string(), invoiceId: z.string(), amount: z.number().int().positive(), /* minor units */
    paymentMethod: z.enum(["CASH", "BANK", "CHEQUE", "SAFEPAY", "MOBILE_WALLET"]), paymentDate: z.iso.date(), referenceNumber: z.string().nullable(), note: z.string().nullable() }),
  mentions: { studentId: "STUDENT", invoiceId: "INVOICE" },
  resolvers: { studentId: resolveStudentViaGuardianMention /* "Bilal's father" → guardian → children; >1 child → chips */,
               invoiceId: openInvoiceForMonth /* stated month; none or several → question */, paymentDate: todayInCampusTz },
  evidence: { required: ["/amount", "/paymentMethod"] },  // "Rs 12,000 cash" — amount normalization handles ١٢٬٠٠٠ / ۱۲,۰۰۰
  gate: gate.all(gate.predicate("assertStaffRole", isStaff), gate.module("fees", "add"), gate.seat("financeDesk")),
  preview: (ctx, i) => collectionPreview(ctx, i),   // invoice balance before/after, allocation, receipt number not yet assigned
  previewView: { kind: "single", fields: ["student", "invoice", "amount", "method", "balanceAfter"] },
  execute: async () => { throw new Error("class C: never executed by the engine"); },
  replay: "native-key", output: z.strictObject({ paymentId: z.string(), receiptNo: z.string().nullable() }),
  receipt: o => ({ kind: "write", capability: "fees.collect_payment", entities: [{ type: "Payment", id: o.paymentId }], counts: { recorded: 1 },
                   domain: { type: "Payment", id: o.paymentId, number: o.receiptNo ?? undefined }, link: "/accountant?view=payments", replayed: false, committedAt: "" }),
  compensation: { kind: "capability", capability: "fees.request_adjustment", map: o => ({ kind: "REFUND", paymentId: o.paymentId }) },
  copy: { /* EN/AR/UR */ } as never,
});
```

The Collect screen opens with the prefill. The accountant presses its own **Record payment** button, which posts `idempotencyKey = handoff.idempotencyKey`. The engine sees the `payment` row and marks the step SUCCEEDED with the domain receipt number. Any refund is a new class-C request; the decision stays with the campus admin.

**Example 4: parent leave request** (C3/C5 `family.request_leave`, direct; `family/leave.ts:34-48`).

```ts
export default defineCapability({
  key: "family.request_leave", version: 1, cluster: "C3", inventoryKeys: ["family.request_leave", "attendance.request_learner_leave"],
  roles: ["PARENT"], risk: "CREATE", confirmation: "B",
  input: z.strictObject({ studentId: z.string(), fromDate: z.iso.date(), toDate: z.iso.date(), reason: z.string().min(3).max(1000) }),
  mentions: { studentId: "STUDENT" },
  resolvers: { studentId: ownChildren /* only verified guardian links with attendance permission; one child → auto */ },
  evidence: { required: ["/fromDate", "/toDate", "/reason"] },   // relative dates ("next Mon–Wed") resolved in campus tz, quote kept
  gate: gate.all(gate.roles("PARENT"), gate.guardianOf(i => i.studentId, "attendance")),
  preview: (ctx, i) => leavePreview(ctx, i),        // days count vs MAX_DAYS, overlap check, who decides (school leaders)
  previewView: { kind: "single", fields: ["child", "from", "to", "days", "reason", "decidedBy"] },
  execute: (ctx, i) => requestLeave(ctx.user, i),
  replay: "natural-key",                            // no key; replay is a 409 overlap (leave.ts:44-45)
  reconcile: (ctx, i, _k, since) => findLeave(ctx, { studentId: i.studentId, requestedById: ctx.user.userId, fromDate: i.fromDate, toDate: i.toDate, since }),
  output: z.strictObject({ requestId: z.string() }),
  receipt: o => ({ kind: "write", capability: "family.request_leave", entities: [{ type: "LearnerLeaveRequest", id: o.requestId }], counts: { requested: 1 },
                   link: "/parent/attendance", replayed: false, committedAt: "" }),
  compensation: { kind: "capability", capability: "family.update_leave", map: o => ({ id: o.requestId, action: "cancel" }) },
  copy: { /* EN/AR/UR; outcome note: "Sent. The school decides; you will be notified." */ } as never,
});
```

The step's receipt is a real write (the request exists). The honest outcome copy says the decision is pending with the school. It does not say the leave is approved.

### 7.2 Codegen and lint

- `scripts/ai-workflows/export-inventory.ts` parses Appendix A tables into `docs/…/capabilities.json` (700 rows: key, route, roles, risk, idempotent, reuse, cluster).
- `scripts/ai-workflows/scaffold-capability.ts <key>` writes a stub adapter with:
  - roles, risk, the class floor and the replay mode guessed from `idempotent`;
  - the route path in a comment;
  - EN/AR/UR copy placeholders, which fail the lint until filled.
- `scripts/ai-workflows/gen-manifest.ts` produces `generated/manifest.ts` and `generated/model-schemas.ts`. Run it after any adapter change; CI checks it is up to date.
- `tests/ai-workflows/registry.test.ts` asserts:
  - every Appendix A key is covered by exactly one adapter **or** listed in `exclusions.ts` with reason and deep link;
  - the class floor per risk is met;
  - C adapters have a `handoff` and A adapters are on the allow-list;
  - copy is complete in EN/AR/UR and descriptions are ≤ 300 characters;
  - the input schema is strict and its OpenAI-strict JSON schema compiles;
  - `roles` ⊆ inventory roles;
  - no adapter targets an Exam Studio-owned key (prefix list from the Exam Studio placement map), and `curriculum.*` source-document intake is excluded with a deep link to `/ai/studio`.
- `check:ui` covers the new components; `scripts/ui-token-codemod.ts` fixes violations.

### 7.3 Counts and order

Appendix A totals: **700 capabilities**. By reuse: 418 direct, 57 wrapper, 223 inline-prisma, 2 none. Class floor by risk: A 11 (READ), B 400 (CREATE/UPDATE), C 289. Within C, APPROVAL_DECISION accounts for 55 (always `DEEP_LINK`) and FINANCIAL for 54. After the A allow-list I estimate roughly A 60 / B 351 / C 289.

| Cluster | Total | direct | wrapper | inline | Floor B | Floor C | Wave |
|---|---|---|---|---|---|---|---|
| C5 Attendance, communication, engagement | 66 | 55 | 5 | 6 | 38 | 27 | 1 (teacher core, parent/student requests) |
| C4 Teaching and assessment | 112 | 86 | 16 | 8 | 65 | 44 | 1 (marks entry B; publication C/deep link; Exam Studio excluded) |
| C7 Campus operations (library, front desk, transport, hostel, canteen, inventory ops) | 112 | 80 | 6 | 26 | 74 | 35 | 2 |
| C3 Students, admissions, family | 93 | 70 | 2 | 21 | 61 | 31 | 2 |
| C6 Finance, payroll, purchasing, inventory | 120 | 48 | 7 | 65 | 54 | 65 | 3 (mostly C hand-offs) |
| C1 Academic structure | 75 | 33 | 3 | 39 | 52 | 21 | 4 (principal/academic lead; feeds questionnaire) |
| C2 People, staff, access | 61 | 16 | 10 | 35 | 30 | 31 | 5 (access grants all C) |
| C8 Platform, group governance, onboarding | 61 | 30 | 8 | 23 | 26 | 35 | 6 (SUPER_ADMIN, APP_OWNER; `runUnscoped` only with stated reason) |

- **Wave 0** (before any of the above) migrates the 27 existing tools and operations: 12 automation tools plus the 15 typed ops through `typedOperationAdapter`.
- **Wave 1 is chosen for the demo:** teacher, parent and student coverage, where today's reach is 4/151, 1/48 and 1/37.

### 7.4 Inline-prisma routes (223)

Mechanical extraction recipe, one PR per route family:

1. Write a **characterization test** at HTTP level against the 55438 DB (status, body shape, row deltas) before moving anything.
2. Move the handler body to `src/lib/<domain>/<name>-service.ts` with the signature `export async function <name>Tx(tx: TxClient, user: AuthUser, input: <Name>Input)` and an exported `<name>InputSchema` (zod). Add `export const <name> = (user, input) => schoolAiTransaction(user, tx => <name>Tx(tx, user, input))`.
3. Keep the route as a thin caller: `requireAuthUser` → parse → service → respond. Gates move **into** the service (`assertPermission` plus predicate), so the adapter and the route share one gate.
4. Fix known non-idempotent replays while extracting, where Appendix A notes them. Examples: holiday create has no unique (C1 `academic.calendar.add_holiday`); `fees.record_payment_basic` has no key, so the adapter targets `fees.collect_payment` instead. A natural key or a client key is added only if it needs no shared schema change. Otherwise the adapter uses `natural-key` replay.
5. The adapter then uses `replay: "same-tx"`.

Effort per inline route is about 0.75 person-days (test + extraction + adapter). Wrapper routes (57) compose the route prelude exactly once in a helper, for example `allocateExamRooms` needs `resolveExamSchedulingCampus` + `withExamSchedulingWrite` (Appendix A C1).

---

## 8. The questionnaire pipeline

### 8.1 Flow

```
first login (requiredOnboardingPath / proxy.ts:245 extended) ─▶ /welcome/setup (role-questionnaire.tsx)
  ─▶ GET /api/ai-workflows/questionnaire/<roleKey>    definition + prefill from live data (never ask what is known)
  ─▶ PUT answers (versioned, per-question confirm)    AiSetupResponse.version++
  ─▶ POST submit                                      compile(answers, ctx) → PlanDraft (deterministic, no model)
  ─▶ AiWorkflowJob {origin: QUESTIONNAIRE, planMode: PLAN_REVIEW, setupResponse{id,version}}  status REVIEW
  ─▶ grouped review: "Your classes", "Your timetable slots", "Invitations (they must accept)", "Needs your principal"
  ─▶ batch confirms (bound hashes) ─▶ RUNNING ─▶ WAITING_HANDOFF (role tasks, class C) ─▶ COMPLETED + readiness
```

- **Version binding.** The job is bound to `{setupResponseId, version}`. Before planning, before each execution and after each model call the binding is re-checked (keeps the three-point pinning of `service.ts:107-110,116-119,144-147`). Editing an answer bumps the version. `compile` produces a new plan version with a **diff**: only steps whose inputs changed are superseded, and committed steps are pinned.
- **Group institutions** (founder decision 4). The SUPER_ADMIN gets a group questionnaire (campuses, who leads each, standards). Its outputs are `campus.create` steps plus `ROLE_TASK` invitations to campus admins; the wizard no longer dead-ends at `/setup/readiness` (`setup-role.ts:6-8`). Campus admins get the campus questionnaire at first login.
- **The admin questionnaire stops asking** for school name, country, timezone and academic year, which the wizard already wrote (`setup-service.ts:369-425`). They show as read-only facts with an "edit in School settings" link. The admin's step for the year is the KEEP path of `academics.setup_year` with the exact `existingCycleId`, compiled by code, so no label-matching failures (`academic-setup-service.ts:20-26`).
- **Seat crossing.** If the campus has a principal, academic steps (activate year, subjects, allocations, timetable) compile as `ROLE_TASK` hand-offs to the principal instead of stalling (B.typedOps finding on `access.ts:56,60,73-75,88`).

### 8.2 Definition contract

```ts
export interface RoleQuestionnaire<A> {
  key: "owner" | "group" | "campus" | "principal" | "teacher" | "accountant" | "librarian" | "receptionist" | "student" | "parent" | "platform";
  roles: UserRole[]; definitionVersion: number;
  questions: Array<Question<A>>;            // typed inputs: choice, multi-entity, rows-table, time-ranges, toggle, short text
  prefill(ctx: SetupContext): Promise<Partial<A>>;
  compile(answers: A, ctx: SetupContext): Promise<PlanDraft>;   // steps referencing registry capabilities + bindings
  readiness(ctx: SetupContext): Promise<ReadinessItem[]>;        // from live records only (rule 17)
}
export interface Question<A> { key: keyof A & string; section: string; input: QuestionInput; produces: string[] /* capability keys */;
  showIf?(a: Partial<A>, ctx: SetupContext): boolean; skippable: boolean; copy: { label: L10n; help: L10n } }
```

Examples (content is owned by Appendix D; this shows the pipeline shape):

- **teacher:**
  - confirm my classes and subjects (prefilled from `subject.teacherId` / `class.classTeacherId`): produces nothing, or a ROLE_TASK if wrong;
  - how I mark (register per lesson or per day): produces a profile preference;
  - weekly free periods: produces `profile.update`;
  - the first quiz I want: deep-link to Exam Studio or create a class test (C4);
  - lesson-plan slot cadence: produces a private planner record;
  - readiness: assigned classes, today's register reachable, marks book exists, lesson-plan slot exists.
- **parent:**
  - confirm children (verified links only; an unknown child produces a request to the school, never a self-link, B.decisions rule 8);
  - preferred language: `profile.update` `preferredLanguage`;
  - how to be told about fees and absences: the announcement-preferences service (`announcement-preferences-service.ts`), class B;
  - pickup people: DOMAIN_REQUEST to the school;
  - readiness: children visible, preferences saved.
- **campus admin:**
  - grades and sections as a structured table: `academics.setup_year` (B);
  - subjects per grade as a table: `setup.apply_changes SUBJECTS` (B, or ROLE_TASK if the seat is held);
  - periods and rooms as tables: ROOMS/PERIODS (B);
  - staff list as rows: `STAFF` pending invitations (B, reported as "they must accept");
  - fee heads: fee-structure adapter (C6 `fees.structure.*`, B for draft structures, C for activation);
  - students via the reviewed roster import (`importBatch` review token path, `students.ts:20-22`), never prose.

### 8.3 What happens to the existing setup modules

| Module | Fate |
|---|---|
| `setup-generation` (`setup-generation.ts:121-180`, POST route `api/school-ai/setup/generate/route.ts:28`, `SetupGenerationPanel`, `SetupRunPanel`) | **Retire.** POST returns 410 behind the flag. GET restore stays read-only for one release so pre-existing generations remain visible. `dashboard.ts:73-85` (`aiSetupPendingFor`) switches to `AiSetupResponse.status` plus readiness. |
| `setup-actions` (`setup-actions-service.ts:17-70`) | **Reuse its parsing** (quote-bound ROOMS/PERIODS/SUBJECTS rows) inside `questionnaire/roles/campus.ts` compile helpers. Retire `SetupActionsPanel`, which duplicated the job's work (B.ui A7). |
| `setup-journey` (`setup-journey-service.ts:10-41`, `setup-journey.ts:10-27`) | **Keep and generalize** into `questionnaire/readiness.ts` for all roles; it already counts live records. |
| `GuidedSetup` 18 keys (`onboarding.ts:17-36`) | Replaced for new campuses by the structured campus questionnaire. Existing ONBOARDING records are read through a one-way mapper that pre-fills `AiSetupResponse` (confirmed keys only). |
| `role-setup.ts` interview strings | Removed from requests; role purpose moves to the planner system prompt (fixes evidence pollution, `service.ts:42`). |
| `/onboarding/page.tsx:34` copy "nothing applies until you approve" | Becomes true. PLAN_REVIEW mode runs nothing before confirmation, except class A steps the user explicitly includes ("Apply confirmed"). |

**Questionnaire plan vs free-form plan:**

| Aspect | Questionnaire | Free-form |
|---|---|---|
| Who proposes | deterministic `compile()` | model phase 1 |
| Model use | only free-text "anything else?" or table header mapping | plan + fills |
| Mode | `PLAN_REVIEW` (whole plan first) | `STEPWISE` (or REVIEW if ≥ 3 B/C steps) |
| Binding | `{setupResponseId, version}` | `requestHash` |
| Budget | 120 steps / 400 leaf executions / 14 days | 25 steps / 200 leaves / 24 h |
| Cross-role work | ROLE_TASK hand-offs expected | DENIED with "who does this" + optional ROLE_TASK |
| End state | readiness checklist | outcome + receipts |

---

## 9. Migration from the current `src/lib/automation` engine

**Kept.** These are B.engine's last finding (`service.ts:29-34,49-58,88,143,153`; `role-action-service.ts:24-27,52-53`; `students.ts:13-26`; `execution.ts:247-252`; `validation.ts:5-17`):

- **Layered idempotency:** job key + hash, step key persisted before execution, receipt replay, `SchoolAiExecution` uniques. These carry into §6.1.
- **Actor re-verification** before and after each model call and in the worker: lifted to `jobs/actor.ts` and used at every gate point.
- **Questionnaire version pinning at three points:** kept, against `AiSetupResponse.version`.
- **The tool-switch guard:** becomes "a fill cannot change the capability".
- **Completion-class rules:** become `outcome.ts`, extended with AWAITING_APPROVAL, PARTIAL and NOTHING_DONE.
- **Typed adapters reusing existing services:** these become registry entries. `students.create` keeps the roster commit with `inviteAccounts:false`; `front_desk.log_call` → `logCall`; `library.create_books`; `profile.update`; `campus.create`; `platform.*`; `school.execute`'s 15 ops via `typedOperationAdapter`; `school.inspect` as masked read adapters.
- **Serializable transactions with retry** (`transaction.ts:13-39`).
- **Audit rows for every write.**
- **Per-tool trimmed output schemas** (`output-schema.ts:4-19`): become per-capability strict schemas.
- **Rate-limited starts** (`automation/route.ts:8`): kept, and extended per school.
- **Tenant-context wrapping** of every service call (`runWithTenantContext`).

**Replaced.**

| Today | Replacement |
|---|---|
| two-call select→act loop, one action per step (`service.ts:120-157`) | plan proposal + per-step fill, DAG scheduler |
| flat 12-tool catalog (`catalog.ts:28-57`), 4-file wiring per tool | registry + codegen manifest, one file per capability |
| bare names to the model (`service.ts:123`) | retrieved cards with descriptions |
| `evidenceQuote` substring (`service.ts:152`) | normalized per-field evidence over user text only |
| job JSON in `schoolAiRequest.reply`, CAS on full JSON (`service.ts:94-95`) | normalized tables, CAS on `version` + `leaseToken` |
| 600 ms auto-advance (`automatic-workspace.tsx:54`) | commands + SSE/poll; runner advances server-side |
| self-approval (`service.ts:81`) | classes B/C; hand-offs; SoD named in advance |
| 30 steps / 30 answers caps | budgets with visible meter, replans, continuation |
| worker limit 4 / 5 s, no fairness (`worker.ts:8`) | `sweepWorkflowJobs(limit 24, perSchool 2)` ordered by `nextWakeAt`, each unit bounded |
| 12 + 45 + 25 s provider timeouts vs `maxDuration = 60` | one model call per inline unit (≤ 20 s); route units ≤ 25 s; the rest by worker; lease 45 s with heartbeat |
| `unsupported` free text | `UNSUPPORTED` step + `AiCapabilityGap` row |
| prompt-only destructive/communication guard (`service.ts:132`) | class floor table enforced in tests |
| English-only server errors | `copy/` EN/AR/UR codes; the client maps `errorCode` |

**Lease and browser/worker sharing.**

- A command handler locks the job row (`SELECT … FOR UPDATE`, like `run-service.ts:91`). It applies the command, appends events, and, if the lease is free, claims it (`leaseOwner=REQUEST`, 45 s) to run **one bounded unit**: one model call, or up to 5 class-A executions, or one B or C transition. It then releases the lease and returns the new snapshot plus `eventSeq`. Long work is left with `nextWakeAt = now` for the worker.
- The worker claims with `updateMany where id, version, (leaseExpiresAt null or < now)` → `leaseToken`. It heartbeats every 15 s during a model call, and every persist checks `leaseToken`.
- **SSE:** `GET /events?after=seq` streams new `AiWorkflowEvent` rows (DB poll every 1 s inside the stream, or Redis pub/sub when `REDIS_URL` is available). It closes before `maxDuration`, and the client reconnects with the last seq.
- **Polling fallback:** `GET /events?after=seq&poll=1` every 2 s (phones, proxies). The client renders from the snapshot plus events, so a lost stream never leaves a spinner (fixes the 2-minute stale-lease stall).
- **Offline:** commands are queued in memory with `clientCommandId` and sent on reconnect. Confirmations are **not** queued: a confirm made offline is re-shown after reconnect against the fresh preview hash. Closing the tab is safe; class A work continues in the worker, and B/C work waits.

**Re-validation when live context changes** (`planner/revalidate.ts`), at each scheduler tick for affected steps:

1. accessVersion, role or campus changed → `BLOCKED_ACCESS`.
2. Permission snapshot or seats changed → re-gate pending steps. They become `DENIED`, with a ROLE_TASK offer when the seat moved.
3. `fingerprint` changed → re-preview. A hash change → `STALE`, which invalidates the confirmation and the hand-off prefill (the hand-off is `SUPERSEDED` and a new one is created).
4. An entity referenced by inputs disappeared or was archived → re-fill. If the structure breaks → `REPLAN` (new `planVersion`, committed steps pinned, pending steps `SUPERSEDED`).
5. Questionnaire version bump → recompile diff.

Replans are bounded by `budget.maxReplans` (default 3).

**Partial failure and compensation.**

- A `BLOCKED` or `UNCERTAIN` step skips only its dependents (`SKIPPED` with a reason). Independent branches continue, and the outcome becomes `PARTIAL`.
- No automatic rollback: domain writes are business records, and reversing them is itself a consequential action. Each receipt shows "Undo…", which proposes a new step through the adapter's `compensation` capability, with its own class. For example, undoing a loan proposes `library.desk_return_copy` (B), and undoing a payment proposes `fees.request_adjustment` (C). `manual` compensations show the note and a deep link.

**Cutover.**

1. A feature flag `AI_WORKFLOWS_V2` per school routes `/ai` to `workflows-home.tsx`.
2. `/api/automation` POST returns 410 after cutover. GET lists legacy jobs read-only.
3. `tests/automation/*` scenarios are ported to `tests/ai-workflows/legacy-parity.database.test.ts` before the old module is deleted.
4. The draft-only surfaces (`/teacher/ai`, admin and principal `?view=ai` `AiWorkflowsHome`, B.ui B1) get a "Do it" action that starts a job with the draft as context. This collapses three similar surfaces into one engine.
5. The private assistant (SKO-460) gets the same "Do it", linking `conversationId`.

---

## 10. Testing strategy

1. **Unit tests from the registry** (`tests/ai-workflows/*.test.ts`, `node --import tsx --test`, no DB, no provider):
   - `registry.test.ts` (§7.2).
   - `protocol.test.ts`: plan validation (cycles, unknown capability, role mismatch, `forEach` typing, budgets).
   - `classes.test.ts`: effectiveClass escalates only; SoD → C; batch limits.
   - `evidence.test.ts`: EN/AR/UR normalization fixtures, digits, paraphrase threshold, server text excluded.
   - `masker.test.ts`: golden prompts show class "7B", subject "Mathematics" and room "R-12" unmasked; student and guardian names tokenized in EN/AR/UR; 1–2 character labels never registered; `assertNoPII` passes.
   - `state-machine.property.test.ts`: random command sequences via `forEachSeed` (`tests/school-ai/exam-studio-generators.ts:184-200`). Invariants: no step SUCCEEDED without a receipt; no B executed without a confirmation of the same previewVersion; outcome consistent with receipts.
   - `outcome.test.ts`: replaces `validation.test.ts`.
2. **DB matrix: role × capability** (`tests/ai-workflows/matrix.database.test.ts`, isolated 55438, `DATABASE_URL === DIRECT_URL`, migrations only). It is generated from the manifest, sharded by cluster (`--shard C1..C8`), and per role uses a lifted, exported fixture (from `execution.database.test.ts:17-31`) plus seat variants: with and without PRINCIPAL/ACCOUNTANT on the campus. Each cell checks:
   - exposure equals the gate's expected roles;
   - denial (direct adapter call → 403, no row delta);
   - revocation between preview and execute;
   - accessVersion bump → worker `BLOCKED_ACCESS` with no provider call;
   - replay (same key → one row, receipt deep-equal);
   - key conflict (different preview → new attempt key, never 409 leakage);
   - stale preview → STALE;
   - cross-tenant via `arbitraryTenantPair` (`exam-studio-generators.ts:581`): the other school's counts are unchanged and reads never return it;
   - class C: the engine never writes the domain row; the hand-off observes the domain write;
   - receipt counts equal DB counts.

   Wired into `scripts/run-school-ai-tests.mjs` (glob extended to `tests/ai-workflows`), new npm scripts `test:ai-workflows` / `test:ai-workflows:db`, and `.github/workflows/ai-workflows.yml`. This also fixes the orphaned `tests/automation` (B.qa finding).
3. **Engine DB scenarios:** lease contention (two claimers), worker fairness across schools, credits (reservation, exhaustion → PAUSED_CREDITS, release on cancel and expiry, no charge on replay), questionnaire version drift, replan pinning, UNCERTAIN reconcile for `natural-key` adapters (kill between service commit and receipt flip).
4. **Browser** (Playwright `tests/ai-workflows/*.browser.spec.ts`, app 3106 against 55438, tokens via `browser-fixture.ts`):
   - `data-wf-job-state`, `data-wf-step-state`, `data-wf-step-key`, `data-wf-confirm` and `data-wf-question` anchors on every interactive element;
   - the four example flows plus campus-admin, teacher and parent questionnaires in EN/AR/UR at 390/768/1440, including RTL;
   - offline (route abort, then reconnect with `after=seq`);
   - stale-preview re-confirm;
   - a hand-off round trip through the Collect screen.

   Screenshots go to the scratchpad, never `test-results/design-system` (memory: Playwright wipes evidence).
5. **Live-model smoke** (`tests/ai-workflows/live/*.live.test.ts`, gated by `AI_WORKFLOWS_LIVE=1` and a real `OPENAI_API_KEY`, synthetic tenant):
   - 60 cases: 11 roles × EN/AR/UR, covering single steps, multi-step DAGs, ambiguous names, unsupported requests, wrong-role requests and injection in school content;
   - metrics: capability precision, wrong-class attempts (must be 0 effective), questions per job, model calls per job, p95 latency;
   - results feed new `AI_EVALUATION_CASES` for the educator-reviewed release evaluation (`src/config/ai-release-evaluation.ts:3-7` stays null until a real reviewed run is recorded).

`tsc` runs with `NODE_OPTIONS=--max-old-space-size=12288`; `npm run check:ui` runs on all new components.

---

## 11. Risks and open decisions for the founder (each with a default)

| # | Decision | Default |
|---|---|---|
| D1 | Charge failed or repaired model attempts? | No. One credit per accepted response; repair folded in; failed attempts token-logged in `usage` only. |
| D2 | Batch confirm of several class-B steps | Allowed, up to 10 per batch, every preview rendered, each hash bound. |
| D3 | Embeddings for retrieval | Off for v1 (lexical BM25 over EN/AR/UR cards). Turn on if live smoke capability precision is below 90%. |
| D4 | Domain screens accepting `?handoff=` prefill (≈40 screens) | Built per wave as their class-C adapters land. Until then the hand-off is `DEEP_LINK` with a copyable summary. |
| D5 | Refactor services to `…Tx` vs natural-key reconcile | Refactor every service touched by a Wave 1–2 adapter. `natural-key` only for the rest, never auto-retried when UNCERTAIN. |
| D6 | Plan review threshold for free-form | REVIEW mode when ≥ 3 class B/C steps; otherwise stepwise. |
| D7 | Class A allow-list scope | Narrow: own profile and preferences, private plans and drafts, appends with domain duplicate checks (library catalogue add, call log). Everything else B. |
| D8 | Questionnaire at first login: mandatory? | Shown at first login; per-question skip; "Set up later" allowed twice, then it stays as a Today card. Never blocks the console. |
| D9 | Retention | Events 90 days; jobs, steps and questions 1 year; receipts as long as the domain record; legacy AUTOMATIC_* rows archived after 30 days. |
| D10 | Worker capacity | 24 jobs per sweep, 2 per school, ordered by `nextWakeAt`. Revisit with measured load. |
| D11 | Cross-seat setup steps | ROLE_TASK hand-off to the seat holder (never widen seats). |
| D12 | Live model for the LEAP demo | Synthetic demo tenant with a real key; the release gate stays closed for real tenants until the educator-reviewed evaluation is recorded. |

**Risks**

- **Planner quality across about 150 capabilities per role.** Mitigations: role filter, retrieval, deterministic resolvers, fast path; measured by live smoke.
- **Latency.** Two model calls for multi-step plans. Mitigations: fast path for single steps; questions answered with chips need no model.
- **PII in free text that matches no known entity.** A guardian name not in the DB reaches the prompt as plain text. Mitigations: generic `[PERSON_n]` heuristics, `scanForPII`, and an evaluation case for it.
- **Inventory accuracy.** Appendix A is static reading, and 20 rows were added by the verifier. Every adapter re-audits its route at file:line before wiring (engineering rule).
- **Effort concentration in the 223 inline-prisma routes**, and merge conflicts in shared files (`schema.prisma`, `tenant-models.ts`, copy catalogs) in a shared checkout.
- **Hand-off observation** depends on domain screens passing the key through. A screen that drops it leaves the step `HANDED_OFF` forever. Mitigation: hand-off expiry plus a "Mark as done here" path that links an existing receipt by id.
- **SSE on a serverless host.** Streams are time-boxed by `maxDuration`. Mitigation: seq-based reconnect plus the polling fallback.
- **The OpenAI model must support strict `json_schema`.** Mitigation: a readiness check refuses to start jobs otherwise.
- **The release gate is blocked today.** Neither flagship reaches live tenants until the reviewed evaluation exists.
- **Exam Studio overlap.** The registry lint forbids Exam Studio-owned keys; `curriculum.import_topics` stays limited to typed topic lists.


**Key decisions**
- Persist the plan as a DAG in new normalized tables (AiWorkflowJob, AiWorkflowStep, AiWorkflowQuestion, AiWorkflowConfirmation, AiWorkflowHandoff, AiWorkflowReceipt, AiWorkflowEvent, AiCapabilityGap, AiSetupResponse). This replaces the JSON blob in schoolAiRequest.reply and the 30-step cap with explicit budgets. The AiWorkflow* prefix avoids the existing WorkflowJob/WorkflowEvent/WorkflowEffect models (schema.prisma:351-412).
- Two-phase model protocol with OpenAI strict json_schema. Phase 1 is one plan-proposal call over role-filtered, retrieved capability cards. Phase 2 fills only the fields code cannot resolve, one step at a time. Name-to-id resolution, defaults, $ref bindings and fan-out are deterministic code. A single-step plan with a small schema uses a one-call fast path.
- Confirmation class is static per adapter and checked against a floor table derived from Appendix A risk (READ=A; CREATE/UPDATE=B unless on an A allow-list; FINANCIAL/PUBLISH/COMMUNICATION/ACCESS_GRANT/DESTRUCTIVE/APPROVAL_DECISION=C). effectiveClass() only escalates, for example B to C when the Delivery Policy requires separation of duties.
- Class B executes only with an AiWorkflowConfirmation bound to stepId + previewVersion + previewHash + jobVersion, sent as a command. A chat 'yes' or a worker can never confirm. Previews are recomputed inside the execution transaction, and drift sets the step to STALE.
- Class C is never executed by the engine. It hands off through five kinds: RECORD_APPROVAL (SchoolAiRecord approval + SKO-470 Runs, observed via SchoolAiExecution), DOMAIN_REQUEST (maker-checker queues), DOMAIN_SCREEN (a server-side prefill plus an idempotency key the domain write carries), ROLE_TASK (SchoolAiSetupTask for the seat holder) and DEEP_LINK. The self-approval at service.ts:81 is removed.
- Reuse SKO-470 rather than fork it. Typed-operation steps call previewSchoolAiExecution and executeSchoolAiToolInTransaction with wf- keys and store executionId, with no schema change to SchoolAiExecution, SchoolAiRun or SchoolAiRecord. The step runner mirrors processSchoolRun: row lock, re-check access, one step and its receipt per transaction, BLOCKED on domain refusal.
- Questions attach to a specific step and JSON-pointer field. Their text comes from localized adapter templates, so the model never writes user-visible questions. Entity-chip answers are applied by code with no model call; free-text answers re-fill only that step; structural contradictions trigger a bounded replan that pins committed steps.
- The new WorkflowMasker builds prompts from typed context entities. Class, subject, room, period, fee-head and book-title labels go to the model verbatim; persons are tokenized, including names found in the user's free text by a campus-scoped vocabulary match with Arabic-script normalization. Replacement is boundary-aware, and labels shorter than 3 characters are never registered.
- Evidence is matched only against user-authored text (request + answers), never server-appended interview text, with EN/AR/UR normalization and per-field evidence requirements declared by each adapter. This replaces the substring evidenceQuote.
- The browser and the worker share each job through commands plus a 45 s lease with heartbeat and a CAS on version/leaseToken. A command runs at most one bounded unit inline; progress streams over SSE from the AiWorkflowEvent sequence, with seq-based polling as the fallback; confirmations are never queued offline.
- Credits are reserved at plan time with reserveAICredits and charged one per accepted model response with consumeAICreditAndLog. Running out pauses the job (PAUSED_CREDITS) instead of failing it. lockAndReconcileAICredits is extended to release expired workflow reservations.
- The questionnaire is a deterministic compile from typed per-role answers into a PLAN_REVIEW plan bound to {setupResponseId, version}; readiness is computed from live records. setup-generation is retired, setup-actions parsing is reused inside the campus compile, setup-journey is generalized into per-role readiness, and the wizard's 'nothing applies until you approve' becomes true.
- Coverage of all 700 capabilities comes from one defineCapability file per capability, with scaffold and manifest codegen and a registry lint that forces every Appendix A key to be covered or explicitly excluded. Inline-prisma routes (223) are extracted into (tx, user, input) services first, behind HTTP characterization tests. Delivery runs in waves: teacher, family and student first, finance mostly as class-C hand-offs, governance last.
- Honest outcomes are computed from receipts (EXECUTED, AWAITING_APPROVAL, PARTIAL, ANSWERED, PLAN_SAVED, NOTHING_DONE). There is no automatic rollback; an undo is offered as a newly proposed step with its own class.

**Risks**
- Planner precision across about 150 capabilities per role (TEACHER) is unmeasured. Retrieval and fast-path assumptions need the live-smoke suite before the demo.
- Free-text person names that match no school entity (for example a guardian name not in the DB) may still reach the prompt. The vocabulary match plus scanForPII reduces but does not remove this risk.
- 223 inline-prisma routes need service extraction before an adapter can call them. This is the bulk of the effort and it touches shared files in a shared checkout.
- Services that open their own transaction (issueCopy, requestLeave) cannot share the receipt transaction. They rely on natural-key reconcile, which can leave steps UNCERTAIN, until they are refactored to a Tx variant.
- Class-C DOMAIN_SCREEN hand-offs depend on about 40 domain screens accepting a handoff prefill and passing its idempotency key. Until that is built, the hand-off degrades to a deep link and completion is not observed automatically.
- SSE time-boxed by the serverless maxDuration and the worker's per-sweep capacity could make progress feel slow under load. This is mitigated by seq-based reconnect and polling, but the capacity is unmeasured.
- The configured OpenAI model must support strict json_schema structured outputs. If it does not, the engine must refuse to start.
- Appendix A comes from static reading (20 rows added by the verifier). Gates and replay modes must be re-audited at file:line per adapter.
- The release gate (CURRENT_AI_RELEASE_EVALUATION = null) blocks live tenants until an educator-reviewed evaluation that includes automation cases is recorded.
- The questionnaire's cross-seat steps depend on other people acting (principal, invitees). Setup can sit in WAITING_HANDOFF for days, and the UX must keep that honest.
- Overlap with Exam Studio (curriculum intake) and SKO-460 (conversation surfaces). The registry lint and shared conversationId mitigate this, but the boundaries need owner sign-off.

**Effort**: Total about 330 person-days for all 700 capabilities; the LEAP demo slice is about 75 person-days. Assumptions: one engineer familiar with the codebase; adapters follow the scaffold; Appendix A gates hold on re-audit.

Components:
- Data model, migration and tenant registry: 3 d.
- Job service, state machine, scheduler, lease, worker, events/SSE and polling: 12 d.
- Planner (retrieval, cards, two-phase protocol, plan validation, fills, resolvers framework, revalidate/replan): 10 d.
- WorkflowMasker, person vocabulary and Arabic-script normalization: 4 d.
- JSON mode in generateAIDraft and the credit reservation extension: 2 d.
- Classes, confirmations and the hand-off framework (5 kinds), including use-workflow-handoff: 6 d.
- Outcome, receipts, audit and compensation proposals: 3 d.
- UI shell (home, composer, plan board, step card for all 19 step states and 14 job states, preview views, confirm sheet, question tray, hand-off cards, receipts, budget meter), EN/AR/UR, RTL, 390/768/1440: 14 d.
- Questionnaire framework, compile/readiness and 11 role definitions (content from Appendix D): 14 d.
- Retiring setup-generation, reusing setup-actions parsing, Today card switch: 2 d.
- Migrating the 12 existing tools and 15 typed ops: 4 d.
- Registry codegen, scaffold and lint: 3 d.
- Test infrastructure (runner/CI wiring, matrix generator, fixtures, property tests, browser anchors and specs, live smoke): 8 d.

Adapters:
- 418 direct × 0.15 d ≈ 63 d.
- 57 wrapper × 0.3 d ≈ 17 d.
- 223 inline-prisma × 0.75 d (characterization test + extraction + adapter) ≈ 167 d.
- Domain-screen prefill wiring for about 40 class-C screens × 0.5 d ≈ 20 d.

Demo slice (≈75 d): the engine and UI items above, the 27 migrated tools, about 35 Wave 1 teacher, parent and student adapters, library issue/return/renew, accountant collect-payment hand-off, and the campus-admin, teacher and parent questionnaires.


---

# A3-breadth: one uniform adapter layer over existing services, generated from the 700-row inventory, with static A/B/C policy and a plan-then-execute engine

# A3-breadth — "Every role can do everything" by a uniform adapter layer

Architect lens: breadth-first, pragmatic. Ground truth: `appendix-b-audit-reports.md` (B.engine, B.typedOps, B.roles, B.ui, B.qa, B.decisions) and `appendix-a-capability-inventory.md` (700 rows). I re-read the code at the points this design relies on; citations are file:line. This is a design document. Nothing in the repository was changed.

---

## 1. Summary

**The bet.** Skoolee already has the business logic for almost every feature. 418 of 700 write capabilities are clean `(AuthUser, input)` service functions (`direct`), 57 are services that need a `NextRequest` (`wrapper`), and 223 live as inline Prisma in route handlers (counts computed from Appendix A). The fastest safe way to "every role can do everything" is therefore not a smarter model. It is **one thin, uniform adapter per capability**, declared as data in a **registry**, with one **policy layer** applied identically to all of them:

```
user text ─► Router (1 small call) ─► Planner (1 JSON-schema call) ─► Plan (persisted DAG)
                                                                  │
          deterministic resolvers (names → ids, never the model) ◄┘
                                                                  ▼
             Policy layer: gate ▸ confirmation class ▸ idempotency ▸ receipt ▸ audit ▸ credits
                                                                  ▼
      A: run now     B: ConfirmSheet bound to {stepKey, previewHash, planVersion}     C: Handoff to the existing approval / domain screen
                                                                  ▼
                       existing service function (unchanged behaviour, same checks)
```

**What changes against today's engine** (`src/lib/automation`, B.engine):
- The model no longer picks one bare tool name at a time (`service.ts:123,127`). It sees **retrieved capability cards** with descriptions and strict JSON schemas, and it emits a **whole plan** in one call. Execution needs no model, so the 30-step cap goes away (`service.ts:114`).
- The model **never sees or chooses ids**. It emits typed references (`{"$ref":"student","text":"Ayesha","hint":"7B"}`) and server-side resolvers bind them under the actor's scope. Rosters therefore never enter the prompt, which fixes the `school.inspect` leak (`service.ts:68-69`). Names the user typed are masked by the resolver before the prompt is built. Class and subject names stay readable because masking is decided by entity kind, not by key name (`pseudonymize.ts:37-38`).
- **Confirmation class is a static field** on every registry entry, with a floor computed from the inventory's risk column. Class C entries have **no `execute` member in the type**, so the engine cannot run them even by mistake.
- **Receipts are truthful by construction.** A step is `executed` only when the adapter returns ids that `verify()` reads back under the tenant guard. Class C steps finish when an observer sees the domain record that the human created on the existing screen, matched by the step's idempotency key or handoff id.

**Throughput (estimate, one implementer, after the platform exists):**

| Kind | Per day |
|---|---|
| Class A/B on a `direct` service | ≈6 |
| `wrapper` | ≈3 |
| `inline-prisma`, including extraction | ≈2.5 |
| Class C hand-off (back end) | ≈8 |
| Domain-screen prefill hook | ≈2 screens |

All 700 capabilities: ≈175 adapter-days plus ≈75 platform/UI/questionnaire/test days, about 250 person-days. Three implementers working by cluster can reach full coverage in about 17 calendar weeks.

**Demo subset:** ≈64 capabilities across all 11 roles plus the questionnaire for ADMIN, TEACHER and PARENT. That is ≈48 person-days, about 5 weeks with 2–3 people (§7.6).

---

## 2. Components and directory layout

### 2.1 New library: `src/lib/workflows/`

```
src/lib/workflows/
  registry/
    types.ts                 CapabilityEntry, Gate, ConfirmationClass, Receipt, Handoff, EntityRef (§2.3)
    index.ts                 assembles domain files; freezes; exports byKey, forRole()
    floors.ts                risk → minimum class; the allow-listed A exceptions
    domains/
      attendance.ts  library.ts  fees.ts  family.ts  front-desk.ts  assignments.ts
      marks.ts  leave.ts  meetings.ts  admissions.ts  students.ts  staff.ts
      academic.ts  timetable.ts  exams-logistics.ts  payroll.ts  purchasing.ts
      inventory.ts  transport.ts  dormitory.ts  canteen.ts  pickup.ts  portfolio.ts
      resources.ts  study.ts  care.ts  service-desk.ts  activities.ts  messages.ts
      corrections.ts  governance.ts (SUPER_ADMIN)  platform.ts (APP_OWNER)  profile.ts
      school-ops.ts          wraps the 15 typed school.execute operations (execution.ts:33-49)
      navigate.ts            nav.open — "here is where" answers for features without an adapter
  inventory.generated.ts     700 rows parsed from Appendix A (key, route, roles, risk, reuse, idem, cluster)
  deferred.ts                inventory keys deliberately not exposed, each with a reason and an owner
  policy/
    gate.ts                  checkGate(user, entry, input, phase: "catalog" | "execute")
    predicates.ts            name → function map over scope.ts / institution.ts / capabilities.ts / seats.ts
    classes.ts               enforceClass(); group confirmation hashing
    approvers.ts             eligibleApprovers(entry, campus) for class C messages
  resolve/
    index.ts                 resolveRefs(user, plan) → bound input | Question[]
    student.ts class.ts subject.ts staff.ts guardian-child.ts library-member.ts library-copy.ts
    invoice.ts fee-group.ts visitor.ts enquiry.ts complaint.ts leave-request.ts meeting-window.ts
    room.ts period.ts exam.ts assignment.ts timetable-slot.ts book-title.ts bank-account.ts ...  (~28 kinds)
    normalize.ts             NFKC, Arabic/Urdu letter folding, digit folding, diacritics, transliteration table
  prompt/
    router.ts                domain routing call
    planner.ts               plan call (JSON schema), repair
    cards.ts                 registry → capability cards (description, when-to-use, examples, schema)
    json-schema.ts           zod → strict OpenAI JSON schema (z.toJSONSchema, refs as typed objects)
    masking.ts               entity-kind field policy; pre-mask of resolved names in user text
    evidence.ts              normalized span verification over user-authored segments only
    language.ts              EN/AR/UR instructions; locale-bound question/summary copy
  engine/
    jobs.ts                  start/answer/cancel; idempotent start; lease
    plan.ts                  plan validation, DAG, dependency ordering, step keys
    executor.ts              runs ready steps; class switch; re-auth before every write
    confirm.ts               B confirmations (single and group)
    handoff.ts               C hand-off creation, observation, expiry
    receipts.ts              extract + verify; outcome computation
    credits.ts               reservation per planning turn; pause-on-exhaustion
    worker.ts                fair per-tenant sweep (replaces src/lib/automation/worker.ts)
    outcomes.ts              executed | partially_executed | awaiting_confirmation | awaiting_approval | answered | plan_saved | unsupported | failed
  questionnaires/
    types.ts  admin.ts campus-admin.ts super-admin.ts principal.ts teacher.ts accountant.ts
    librarian.ts receptionist.ts parent.ts student.ts app-owner.ts
    compile.ts               answers → Plan, deterministic; model only for free-text cells
    readiness.ts             role readiness checks (extends setup-journey)
  copy/ (en.ts, ar.ts, ur.ts)  titles, summaries, field questions, outcome strings, server errors
```

### 2.2 Other locations

- **API:**
  - `src/app/api/workflows/route.ts` — GET list, POST start
  - `src/app/api/workflows/[id]/route.ts` — GET, POST answer/cancel
  - `src/app/api/workflows/[id]/confirm/route.ts`
  - `src/app/api/workflows/handoffs/[id]/route.ts` — GET for prefill, POST decline
  - `src/app/api/workflows/questionnaire/route.ts`
  - `src/app/api/workflows/capabilities/route.ts` — "what AI can do for me", from the registry
- **Extracted services** (§7.4): `src/lib/<domain>/<name>-command.ts`, for example `src/lib/fees/collect-command.ts`, `src/lib/leave/apply-command.ts`, `src/lib/marks/enter-bulk-command.ts`, `src/lib/admissions/enquiry-command.ts`.
- **UI:** `src/components/workflows/`
  - `WorkflowConsole.tsx` replaces `AutomaticWorkspace`
  - `PlanTimeline.tsx`, `StepCard.tsx`, `ConfirmSheet.tsx`, `HandoffCard.tsx`, `ReceiptChip.tsx`, `MissingDetailChips.tsx`, `CapabilityBrowser.tsx`, `RoleQuestionnaire.tsx`, `ReadinessBoard.tsx`
  - `src/lib/workflows/handoff-client.ts` exports `useWorkflowHandoff(kind)` for domain screens.
  - The composer is the SKO-460 `MultimodalComposer` and conversation shell, reused. Voice and document input stay disabled until SKO-460 enables them.
- **Scripts:** `scripts/workflows/import-inventory.ts`, `scaffold-adapter.ts`, `coverage-report.ts`, `check-workflows.ts` (lint), `live-smoke.ts`.
- **Tests:** `tests/workflows/` (§10).

### 2.3 Core types (`src/lib/workflows/registry/types.ts`)

```ts
import type { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { UserRole } from "@/lib/roles";
import type { PermissionModule } from "@/lib/permissions";

export type ConfirmationClass = "A" | "B" | "C";
export type InventoryRisk = "READ" | "CREATE" | "UPDATE" | "DESTRUCTIVE" | "APPROVAL_DECISION"
  | "FINANCIAL" | "ACCESS_GRANT" | "COMMUNICATION" | "PUBLISH";
export type EntityKind = "student" | "class" | "subject" | "staff" | "guardianChild" | "libraryMember"
  | "libraryCopy" | "bookTitle" | "invoice" | "visitor" | "leaveRequest" | "meetingWindow" | "room" | "period" /* … */;

/** Model-facing reference. The model never emits an id. */
export type EntityRef<K extends EntityKind = EntityKind> = { $ref: K; text: string; hint?: string };

export type PredicateKey = "canMarkAttendance" | "canManageLibrary" | "canManageFinance" | "canLeadAcademics"
  | "canManageCampusOps" | "canManageFrontDesk" | "isInstitutionAuthority" | "isFamilyRole" | "libraryDesk"
  | "financeDesk" | "frontDesk" | "academicLead" | "careMember" | "serviceAgent" /* capabilities.ts keys */;

export type ScopeRule =
  | { kind: "self" } | { kind: "own-campus" } | { kind: "any-campus-of-school" }       // SUPER_ADMIN
  | { kind: "assigned-class"; ref: string } | { kind: "own-child"; ref: string; guardianPermission: "attendance" | "communication" | "pickup" | "learningRecords" }
  | { kind: "platform" };                                                                // APP_OWNER, audited runUnscoped

export interface Gate {
  roles: readonly UserRole[];
  permissions?: readonly (readonly [PermissionModule, "view" | "add" | "edit" | "delete"])[];
  predicates?: readonly PredicateKey[];                 // ALL must pass
  scope: ScopeRule;
  /** Inventory route gate this mirrors, e.g. "assertStaffRole + fees.add (collect/route.ts:30-31)". Lint requires it. */
  mirrors: string;
}

export interface FieldEvidence { field: string; quote: string }        // verified in prompt/evidence.ts

export interface Preview {
  /** Rows rendered by ConfirmSheet / HandoffCard; labels are resolved, never ids. */
  lines: Array<{ label: string; value: string; tone?: "warning" | "neutral" }>;
  table?: { columns: string[]; rows: string[][] };       // e.g. the full register
  warnings: string[];                                     // e.g. "Due date follows the library rule: 30 Oct"
  /** Hash input: canonical bound input + versions (updatedAt) of every entity read for the preview. */
  basis: unknown;
}

export interface Receipt {
  model: string;                // Prisma model of the primary effect
  ids: string[];
  counts?: Record<string, number>;
  replayed: boolean;
  link: string;                 // deep link to the record in its domain screen
  facts: Record<string, string | number | boolean>;   // receipt number, status, due date...
}

export type Idempotency<I, R> =
  | { mode: "native"; keyField: string }                                   // the service stores our key (fees collect, logCall, importBatch, executeSchoolAiTool)
  | { mode: "natural"; reconcile: (ctx: Ctx, input: I, since: Date) => Promise<R | null> }   // find the effect we already caused
  | { mode: "convergent" };                                                // absolute set; replay gives the same state (register marks)

export interface Ctx { user: AuthUser; campusId: string | null; stepKey: string; locale: "en" | "ar" | "ur"; now: Date }

interface Base<I> {
  key: string;                  // equals the inventory key
  version: number;              // bump on schema or semantic change; plans pin it
  domain: string;
  inventoryKey: string;
  risk: InventoryRisk;
  copy: { title: string; whenToUse: string; examples: { en: string[]; ar: string[]; ur: string[] } };  // copy keys
  input: z.ZodType<I>;          // model-facing; EntityRef where an id is needed
  bind: z.ZodType<unknown>;     // the bound (resolved) input the service receives
  gate: Gate;
  evidence: readonly string[];  // input paths that must carry user evidence (status, amount, dates, reason)
  summary: (bound: unknown, labels: Record<string, string>, locale: Ctx["locale"]) => string;  // deterministic, localized
  nav: (bound: unknown) => string;
}

export interface ExecEntry<I, R> extends Base<I> {
  class: "A" | "B";
  preview: (ctx: Ctx, bound: unknown) => Promise<Preview>;
  execute: (ctx: Ctx, bound: unknown) => Promise<R>;
  idempotency: Idempotency<I, R>;
  receipt: (result: R, bound: unknown) => Receipt;
  verify: (ctx: Ctx, receipt: Receipt) => Promise<boolean>;     // read back under the tenant guard
}

export type HandoffTarget =
  | { kind: "school-ai-record"; operation: string; recordKind: "WORKFLOW" | "CURRICULUM"; buildProposal: (bound: unknown) => unknown }   // SKO-470 approval
  | { kind: "domain-screen"; href: (bound: unknown, handoffId: string) => string; prefill: (bound: unknown) => Record<string, unknown> };

export interface HandoffEntry<I> extends Base<I> {
  class: "C";
  preview: (ctx: Ctx, bound: unknown) => Promise<Preview>;
  handoff: HandoffTarget;
  /** How the observer recognises the human-completed effect. */
  observe: { model: string; by: "idempotencyKey" | "handoffId" | "schoolAiExecution"; receipt: (row: unknown) => Receipt };
  // No execute. Enforced by the type, by check-workflows lint, and at runtime in executor.ts.
}

export type CapabilityEntry = ExecEntry<any, any> | HandoffEntry<any>;
```

---

## 3. Data model changes (Prisma) and migrations

New tables replace the job-as-JSON-blob in `SchoolAiRequest.reply`. The blob is bloated, and the lease claim compares the whole JSON as its compare-and-set value (`service.ts:94-95`, B.engine). Every table has `school_id` (plus `campus_id` where scoped) and is registered in the fail-closed tenant guard (`gen-tenant-registry`).

```prisma
model AiWorkflowJob {
  id               String   @id @default(uuid())
  schoolId         String   @map("school_id")
  campusId         String?  @map("campus_id")
  actorId          String   @map("actor_id")
  actorRole        String   @map("actor_role")
  accessVersion    Int      @map("access_version")         // pinned; re-checked before every write
  conversationId   String?  @map("conversation_id")        // SKO-460 SchoolAiConversation (purpose WORKFLOW)
  source           String                                  // CHAT | QUESTIONNAIRE | DEEP_LINK
  questionnaireId  String?  @map("questionnaire_id")
  questionnaireVer Int?     @map("questionnaire_version")
  language         String                                  // en | ar | ur
  status           String                                  // PLANNING | WAITING_INPUT | WAITING_CONFIRM | RUNNING | AWAITING_APPROVAL | PAUSED_CREDITS | COMPLETED | FAILED | CANCELLED
  outcome          String?                                 // see engine/outcomes.ts
  planVersion      Int      @default(0) @map("plan_version")
  version          Int      @default(1)
  claimToken       String?  @map("claim_token")
  leaseExpiresAt   DateTime? @map("lease_expires_at")
  creditsReserved  Int      @default(0) @map("credits_reserved")
  idempotencyKey   String   @map("idempotency_key")
  requestHash      String   @map("request_hash")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  completedAt      DateTime? @map("completed_at")
  expiresAt        DateTime  @map("expires_at")             // retention; B.engine found none today
  segments         AiWorkflowSegment[]
  steps            AiWorkflowStep[]
  @@unique([schoolId, actorId, idempotencyKey])
  @@index([status, leaseExpiresAt])
  @@index([schoolId, actorId, updatedAt])
  @@map("ai_workflow_jobs")
}

/** User-authored text only (request and answers): the evidence base. Server text is never stored here. */
model AiWorkflowSegment {
  id        String @id @default(uuid())
  schoolId  String @map("school_id")
  jobId     String @map("job_id")
  ordinal   Int
  kind      String                     // REQUEST | ANSWER | QUESTIONNAIRE_ANSWER
  fieldKey  String? @map("field_key")
  text      String                     // raw, server-only; never returned to other users
  normalized String                    // evidence.ts normalization
  createdAt DateTime @default(now()) @map("created_at")
  @@unique([jobId, ordinal])
  @@map("ai_workflow_segments")
}

model AiWorkflowStep {
  id               String   @id @default(uuid())
  schoolId         String   @map("school_id")
  campusId         String?  @map("campus_id")
  jobId            String   @map("job_id")
  ordinal          Int
  capabilityKey    String   @map("capability_key")
  capabilityVer    Int      @map("capability_version")
  class            String                                    // A | B | C copied from registry at plan time; re-asserted at execute
  dependsOn        Json     @default("[]") @map("depends_on")
  modelInput       Json     @map("model_input")              // masked refs, as the model sent them
  boundInput       Json?    @map("bound_input")              // resolved ids; server-only
  evidence         Json     @default("[]")
  inputHash        String?  @map("input_hash")
  previewHash      String?  @map("preview_hash")
  preview          Json?
  status           String                                    // DRAFT | NEEDS_INPUT | READY | WAITING_CONFIRM | CONFIRMED | EXECUTING | EXECUTED | CONFLICT | HANDED_OFF | COMPLETED_BY_HUMAN | DECLINED | FAILED | SKIPPED
  idempotencyKey   String   @map("idempotency_key")          // wf-<jobId>-<ordinal>-<capabilityVer>; persisted before execute
  confirmedById    String?  @map("confirmed_by_id")
  confirmedAt      DateTime? @map("confirmed_at")
  confirmationHash String?  @map("confirmation_hash")        // group or single, see §5.3
  executedAt       DateTime? @map("executed_at")
  receipt          Json?
  errorCode        String?  @map("error_code")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  @@unique([schoolId, idempotencyKey])
  @@unique([jobId, ordinal])
  @@index([schoolId, status])
  @@map("ai_workflow_steps")
}

model AiWorkflowHandoff {
  id               String   @id @default(uuid())
  schoolId         String   @map("school_id")
  campusId         String?  @map("campus_id")
  stepId           String   @unique @map("step_id")
  targetKind       String   @map("target_kind")              // SCHOOL_AI_RECORD | DOMAIN_SCREEN
  recordId         String?  @map("record_id")                // SchoolAiRecord (DRAFT, never self-approved)
  href             String
  prefill          Json
  idempotencyKey   String   @map("idempotency_key")          // handed to the domain form
  eligibleRoles    Json     @map("eligible_roles")
  status           String                                    // OPEN | COMPLETED | COMPLETED_WITH_CHANGES | DECLINED | EXPIRED
  completedModel   String?  @map("completed_model")
  completedId      String?  @map("completed_id")
  completedById    String?  @map("completed_by_id")
  diff             Json?                                     // prefill vs. what the human actually saved
  expiresAt        DateTime @map("expires_at")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  @@index([schoolId, status])
  @@map("ai_workflow_handoffs")
}

/** Structured gap telemetry, replacing the free-text unsupported reason (service.ts:155). Masked text only. */
model AiWorkflowGap {
  id          String @id @default(uuid())
  schoolId    String @map("school_id")
  actorRole   String @map("actor_role")
  domainGuess String? @map("domain_guess")
  nearestKey  String? @map("nearest_key")      // inventory key the router judged closest
  reason      String                           // NOT_IN_ROLE | NOT_CONNECTED | DEFERRED | AMBIGUOUS
  maskedText  String @map("masked_text")
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([schoolId, nearestKey])
  @@map("ai_workflow_gaps")
}

model RoleQuestionnaireResponse {
  id            String @id @default(uuid())
  schoolId      String @map("school_id")
  campusId      String? @map("campus_id")
  userId        String @map("user_id")
  role          String
  questionnaire String                          // e.g. "teacher.v1"
  version       Int    @default(1)
  answers       Json                            // typed per questionnaire, not free strings
  confirmedKeys Json   @default("[]") @map("confirmed_keys")
  status        String                          // DRAFT | CONFIRMED | APPLIED | SKIPPED
  jobId         String? @map("job_id")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@unique([schoolId, userId, questionnaire])
  @@map("role_questionnaire_responses")
}
```

**Not added:**
- No new approval table. Class C reuses `SchoolAiRecord`/`SchoolAiExecution` (SKO-470) or the domain's own approval rows.
- No vector store. Retrieval is registry metadata (§4.1).

**Small additive changes:**
- `User.firstLoginQuestionnaireAt DateTime?` gates first-login routing.
- Domain rows touched by class C observation that cannot store our key get no column. The thin route calls `completeHandoff()` instead (§6.2).

**Migration procedure** (follows the README §10 rules):
1. Hand-written SQL in `prisma/migrations/2026102x_ai_workflows/migration.sql`.
2. Check with `prisma migrate diff --from-schema-datamodel`.
3. Apply to the isolated 55438 cluster, then to dev Supabase through `DIRECT_URL` (port 5432) with `migrate deploy`.
4. Run `migrate status`, `prisma generate` and `gen-tenant-registry`, then restart the dev server.
5. Never run `prisma format`. Commit own hunks only, through a temporary `GIT_INDEX_FILE`.

**Coexistence:** old `AUTOMATIC_SETUP_V1` rows stay readable for one release (§9).

---

## 4. How the model is prompted

### 4.1 Tool retrieval (two calls, bounded)

1. **Role filter (no model).** `registry.forRole(user)` runs the cheap half of every gate: role, module flags from `loadWorkspacePermissionSnapshot`, capability keys from `capabilitiesFor`, seats from `getCampusSeats`. Typical sizes after the gate: TEACHER ≈150, LIBRARIAN ≈75, PARENT ≈48, operators ≈520.
2. **Router call** (skipped when ≤40 capabilities remain).
   - Input: the masked request plus ≤35 **domain cards**. A card holds a domain key, a one-line description and EN/AR/UR synonyms authored in `copy/`.
   - Output (strict JSON): `{ domains: string[≤3], intent: "do" | "ask_info" | "navigate" | "none", nearestCapability?: string }`.
   - Settings: max 300 tokens, temperature 0, 8 s timeout.
3. **Planner call.**
   - Input: **capability cards** for the chosen domains (≤40), each with key, title, `whenToUse`, two examples in the request language, and the strict input JSON schema, in which `EntityRef` replaces ids.
   - Also included: `nav.open` and `answer` pseudo-capabilities, so "I can't do this here, open X" is always available and honest.
4. **Repair.** One repair call on JSON *or* schema failure. Today a syntax error skips repair (`service.ts:128,134`).

### 4.2 Protocol

The system prompt is static and holds no school content. It sets these rules:
- Use only the listed capabilities.
- Emit refs, never ids.
- Every field listed in a capability's `evidence` needs a quote from `USER_TEXT`.
- Never invent attendance, marks, amounts, dates or names.
- Ask through `missing[]` instead of guessing.
- Never say something is done. The server reports outcomes.

User message (JSON):

```json
{ "language": "ur", "role": "TEACHER", "today": "2026-10-23", "weekday": "Friday",
  "userText": [{ "id": "s1", "text": "7B کی آج کی حاضری: سب حاضر سوائے [STUDENT_1] اور [STUDENT_2]" }],
  "context": { "myClasses": ["7B", "8A"], "mySubjects": ["Mathematics 7B"] },
  "capabilities": [ /* cards */ ] }
```

Output schema (`response_format: { type: "json_schema", strict: true }`):

```ts
type PlannerOutput =
  | { type: "plan"; steps: Array<{ id: string; capability: string; input: unknown /* per-capability schema via anyOf */;
       evidence: FieldEvidence[]; dependsOn: string[] }>; missing: Array<{ stepId: string; field: string }> }
  | { type: "answer"; text: string; navigate?: string }
  | { type: "unsupported"; nearestCapability?: string };
```

**Gateway change.** `generateAIDraft` gains an optional `responseFormat` passed through `completeChat` to OpenAI (`openai-settings.ts:12-17` sends none today). The fail-closed provider policy, PII egress scan, `providerConfidentiality` and the prototype fallback stay unchanged. In no-key prototype mode the planner returns `unsupported`, labelled as prototype, never fake plans.

**Missing details are deterministic.** Questions come from the field copy in `copy/`, in the job's language. Choice chips come from resolver candidates, for example two pupils named Ali in 7B. The model never writes the question text.

**Step titles and summaries are deterministic.** `entry.summary(bound, labels, locale)` renders them in EN/AR/UR. Model prose never reaches a preview, which removes today's "only as localized as the model honours `language`" gap (B.ui B3).

### 4.3 Language

- Requests can be in EN, AR, UR or mixed.
- The planner gets `language` and examples in that language.
- Canonical enum values stay English.
- `normalize.ts` folds:
  - Arabic/Urdu letter variants (ي/ى/ی, ك/ک, ه/ہ/ة, أ/إ/آ→ا);
  - tatweel and diacritics;
  - Arabic-Indic and Persian digits to ASCII;
  - punctuation and whitespace.
- Date words (آج/today/اليوم, کل, Friday/جمعہ/الجمعة) are parsed server-side from the evidence quote by a small parser. If the model's ISO date disagrees with the parsed date, the field becomes a question.
- Server error strings move to `copy/` with stable codes. Today they are English-only (B.ui B3).

### 4.4 Pseudonymisation that does not mask class or subject names

- **Pre-mask by resolution.** Before the prompt is built, `masking.ts` scans the user's segments for names of entities the actor can see: students, staff, guardians and members in scope. The scan uses normalized and transliterated matching. Each hit becomes a token (`[STUDENT_1]`, `[STAFF_2]`) and is recorded in the shared `Pseudonymizer`. The planner's refs contain the token, and `resolve/` unmasks and binds it server-side. Rosters are never sent.
- **Field policy by entity kind, not key name.** Today `^name$` and `…_?name$` classify `name`, `className`, `subjectName` and `roomName` as PERSON (`pseudonymize.ts:37-38`). The new `maskWithPolicy(obj, policy)` takes `{ path → "PERSON" | "STUDENT" | "CLEAR" }` derived from the card and context builders: class, subject, room, period, book title → CLEAR. The existing `maskObject` stays as-is for other callers (Exam Studio etc.), so nothing else regresses.
- `scanForPII` still runs on the final prompt (`pseudonymize.ts:162`). The provider boundary scan (`openai.ts:357-361`) is untouched.
- Questionnaire free-text cells for people (staff or students tables) are never sent whole. Rows are parsed deterministically (CSV, table or line patterns) and only unparseable cells go to the planner, masked. This restores the legacy guarantee (`setup-generation-service.ts:102-107`, B.ui finding).

### 4.5 Evidence

- Evidence quotes are verified against **user-authored segments only** (`AiWorkflowSegment`). Server-appended text cannot satisfy them, which fixes the `service.ts:42,48,152` weakness.
- Matching is normalized substring (§4.3). There is no paraphrase tolerance, but transliteration folding means AR/UR quotes pass.
- Derived values (a date from "until Friday", an amount from "12 ہزار") need the quote plus a server parse that agrees.
- A failed quote turns that field into a question. It does not fail the job.

---

## 5. Authorization and confirmation classes

### 5.1 Gate enforcement (every write re-checks)

`checkGate(user, entry, bound, "execute")` runs inside `executor.ts`, immediately before `execute`, after a fresh principal resolution. That resolution is the same as `authorize()` today: DB role, campus and `accessVersion` must equal the job's pinned values, and the school must be operational (`service.ts:29-34`; worker `resolveWorkerPrincipal`, `access.ts:97-103`). The gate then evaluates in order:

1. Role is in `gate.roles`.
2. Permission flags pass, through `assertPermission` (`scope.ts:324`) or `assertWorkspacePermission` for School AI ops.
3. Named predicates pass (`predicates.ts` maps names to `canMarkAttendance`, `canLeadAcademics` with campus, `libraryDesk`, etc.).
4. Scope rules pass on the **bound** ids: `assigned-class` re-queries the assignment, and `own-child` calls the same `guardianChild` check used by the family services.

The service's own checks then run as usual. Defence in depth: the adapter gate is **never narrower** than the route gate (the `mirrors` field plus a lint check). It may be **stricter** where Appendix A flags a hole. Example: `canManageLibrary` admits PRINCIPAL while the V2 default has no library flags (`scope.ts:260-262`, B.roles). Library adapters therefore also require `library.add`. Each such tightening is listed in `policy/tightenings.md` with a ticket.

Seats are never widened. Operators get finance or academic adapters only while the seat is vacant, through the same `financeDesk`/`academicLead` predicates (`capabilities.ts:166-169`).

### 5.2 Static classes and floors (`registry/floors.ts`)

| Inventory risk | Floor | Count | How it ends |
|---|---|---|---|
| READ | A | 11 | runs; never counts as "executed" |
| CREATE, UPDATE | **B** | 400 | ConfirmSheet; A only by allow-list |
| DESTRUCTIVE, APPROVAL_DECISION, FINANCIAL, ACCESS_GRANT, COMMUNICATION, PUBLISH | **C** | 287 | hand-off |

The 287 class C rows break down as 73 destructive, 55 approval decisions, 54 financial, 49 access grants, 33 communications and 23 publications.

**Class A allow-list** (each entry needs a written justification):
- own `profile.update`;
- `personal.save_plan`;
- `nav.open`;
- reads;
- `front_desk.call_log`;
- `library.create_books`;
- `curriculum.import_topics` (append-only), per B.decisions T1.

**Lint** (`check-workflows.ts`): `class >= floor(risk)` unless the entry sits in `floors.ts#riskOverrides` with a reason. Two overrides are proposed, both founder decisions (§11):
- library return, a policy-computed fine, B;
- teacher register, B.

The model can never change a class. The class is copied to the step at plan time, re-read from the registry at execute, and a mismatch between the two → `FAILED`.

### 5.3 Class B — confirm in chat, bound

- When a B step's inputs are bound, `executor` computes `preview` and `previewHash = sha256(canonical(bound) ‖ basis ‖ capabilityKey ‖ capabilityVer)` and sets the step to `WAITING_CONFIRM`.
- `POST /api/workflows/[id]/confirm` takes `{ jobVersion, steps: [{ stepId, previewHash }] }` and requires `assertSameOrigin` and a live actor.
- A **group confirmation** (questionnaire, multi-step requests) binds `confirmationHash = sha256(sorted stepId:previewHash pairs)`. Every included step is listed in full on one sheet.
- Before execute, the preview is recomputed inside the executor. Hash drift (someone changed the record) → step back to `WAITING_CONFIRM` with a "changed since you confirmed" banner.
- The worker never moves a step out of `WAITING_CONFIRM`.
- A typed or spoken "yes" in the chat does nothing (ROLLOUT.md:13). Only the bound confirm call counts.

### 5.4 Class C — hand-off to existing approval surfaces

Class C entries have no `execute`. `handoff.ts` creates one of two hand-off types:

- **`school-ai-record`**, for the typed operations that already have SKO-470 machinery: `finance.apply_operation`, `fees.generate_invoices`, `communications.queue_announcement`, `timetable.publish_reviewed`, `students.promote_enrollment`, `academics.transition_year`, `attendance.record_register`, `operations.record_risk_decision`. The engine calls `createWorkspaceRecord` with the proposal and **does not approve it**. The `service.ts:79-81` self-approval is deleted. The hand-off links to the record's existing review and execute surface (`/api/school-ai/workspace/{id}/execute` UI, or `RunsPanel` for scheduled runs). Approval there still runs `assertApprovalRole` and `assertApprovalSeparation` (`repository.ts:366-368`) and `FINANCE_SEPARATE_APPROVER`. A Delivery Policy with `separationOfDuties: REQUIRED` is therefore honoured, and the card names the eligible approvers (`approvers.ts`) instead of failing with a 403 (B.typedOps finding 1). The observer watches `SchoolAiExecution` by `(recordId, recordVersion, operation)`.
- **`domain-screen`**, for everything else, including money desks, publication, messages, access grants and deletes. The card shows the deterministic preview and an **Open in <screen>** link: `?handoff=<id>`. The domain screen calls `useWorkflowHandoff(kind)` and prefills its own form. Where the route supports one, the form's idempotency key is set to the hand-off key. The human presses the screen's own submit, so the domain's own maker-checker rules apply unchanged. Examples:
  - payment plans: approver must differ from proposer (`payment-plans/route.ts:78`);
  - rollover: approval by the academic lead.

**Separation of duties is never re-implemented.** In-chat self-approval cannot happen, because no code path approves on the requester's behalf.

Approval decisions themselves (55 rows), such as leave approvals, are class C hand-offs. "Approve Sara's leave" opens the leave approval queue focused on that request with the decision prefilled. The approver presses Approve.

---

## 6. Idempotency, receipts, audit, credits

### 6.1 Idempotency (layered; keeps today's strengths)

1. **Job start:** `(schoolId, actorId, idempotencyKey)` plus `requestHash`. A different body under the same key → 409. This is today's `service.ts:49-58`.
2. **Step key** `wf-<jobId>-<ordinal>-v<capabilityVer>`, persisted with status `EXECUTING` and a 60 s step lease **before** calling the service.
3. **Per-adapter mode** from the registry:
   - `native`: the key goes into the service's own key field. Examples: fees collect `idempotencyKey`/`requestHash` (`collect/route.ts:58-66`), `logCall` (sha256 of key), `importBatch` fingerprint (`students.ts:18-20`), `executeSchoolAiTool` (`execution.ts:236-254`).
   - `natural`: before executing, and on any crash-recovery retry, `reconcile(ctx, bound, step.createdAt)` searches for the effect this actor already caused. Example: an open `bookIssue` for (member, copy) created after the step. Needed because many services refuse a replay with 409 rather than returning the original: library issue claims the copy (`library/desk.ts:112-113`), family leave rejects the overlap (`family/leave.ts:44-45`).
   - `convergent`: absolute-set writes such as register marks. These replay safely, with `knownStatus` concurrency.
4. Inventory rows marked `idempotent: no` (198) must declare `natural` with a reconcile function, or get a key during extraction. Lint enforces this. If neither is possible, the row goes to `deferred.ts`. Example: `fees.record_payment_basic` posts twice on retry, so it is deferred in favour of `fees.collect_payment`.

### 6.2 Receipts that are truthful

- **Direct services** return rows or objects. `entry.receipt(result)` picks ids by declared paths.
- **Wrapper services** return a `Response`. Example: `createStudentRecords` (`students.ts:22-24`). `receipts.ts#fromResponse` requires `ok`, `success: true` and a non-empty id path. Status codes map as follows:
  - 409 with `conflicts[]` (attendance returns 409 when conflicts were not written, `attendance/register/route.ts:54-55`) → step `CONFLICT`, which becomes a question, not "done";
  - `replayed: true` (fees collect) → `receipt.replayed`;
  - 2xx alone is never enough.
- **`verify(ctx, receipt)`** reads each id back under `runWithTenantContext`. Default: `findFirst({ where: { id, schoolId } })` on `receipt.model`. A failed verification → `FAILED_UNVERIFIED`, an alert, and the job outcome cannot be `executed`.
- **Class C:** the observer finds the completed effect, either by hand-off key (`payment.idempotencyKey`), by `SchoolAiExecution`, or because the thin route called `completeHandoff(user, handoffId, { model, id })` (two lines per hand-off-capable route, §7.5). If the human changed the prefilled values, the status is `COMPLETED_WITH_CHANGES` and the diff is shown ("amount changed from Rs 12,000 to Rs 10,000"). That is honest.
- **Job outcome** (`outcomes.ts`, extending `validateCompletion` from `validation.ts:12-17`):

| Outcome | When |
|---|---|
| `executed` | every write step EXECUTED and verified |
| `partially_executed` | some writes verified, others not |
| `awaiting_confirmation` | B steps still waiting |
| `awaiting_approval` | only open hand-offs remain |
| `answered` | no writes |
| `plan_saved` | only a plan was saved |
| `unsupported` | nothing matched |
| `failed` | the job failed |

  A read, a draft or an open hand-off is never `executed`.

### 6.3 Audit

- Each EXECUTED step writes `auditLog { tableName: "ai_workflow_step", recordId: stepId, newValue: { capability, class, receipt.ids, confirmedById, previewHash } }` in addition to the domain's own audit.
- Hand-off creation and completion are audited too.
- `AiWorkflowGap` rows feed a coverage dashboard. Demand, not guesswork, orders the long tail (§7.3).

### 6.4 Credits

- One **AI action = one planning turn** (router + planner + optional repair). It is charged through `consumeAICreditAndLog` with the summed tokens of every provider attempt, including failed parses. This fixes the under-logging found in B.engine.
- Execution of adapters uses no model and is not charged.
- The turn reserves `reserveAICredits(schoolId, 1)` before the provider call and settles in the same transaction as the plan write.
- Questionnaire compilation is deterministic and costs 0 credits, plus 1 per free-text cell batch. The estimate is shown before start.
- Credit exhaustion → `PAUSED_CREDITS`, resumable with neutral copy, never `FAILED`.
- Plan limits (`src/config/plans.ts`) are untouched.

### 6.5 Throughput and timeouts

- Planning runs inside the start/answer request: router 8 s + planner 30 s + repair 15 s, under `maxDuration = 60`.
- Execution runs in `engine/worker.ts`, a per-tenant round-robin sweep (limit 16, configurable) called from `outbox-worker.ts`. It can also run inline after a confirm for steps under 2 s.
- The UI polls `GET /api/workflows/[id]` (durable state) every 1.5 s while RUNNING. The 600 ms advance loop is gone.
- The school-wide `FOR UPDATE` lock (`role-action-service.ts:22-24`) is replaced by the per-step ledger row lock. Domain services keep their own locks.

---

## 7. Coverage plan — reaching all 700

### 7.1 Counts by class floor and reuse readiness (computed from Appendix A)

| Floor | direct | wrapper | inline-prisma | total |
|---|---|---|---|---|
| A (READ) | 8 | 1 | 2 | 11 |
| B (CREATE 180 / UPDATE 220) | 265 | 20 | 115 | 400 |
| C (high-risk six) | 145 | 36 | 106 | 287 |
| unclassified rows | — | — | — | 2 (reuse "none"; triage) |

The key breadth insight: **106 of the 223 inline-prisma rows are class C.** A human executes them on the existing screen through the existing route, so they need **no extraction** to be covered, only a hand-off entry and the two-line route hook. Extraction is required for **117 rows** (115 B + 2 A).

Per role (all capabilities / inline-prisma):

| Role | Total | inline-prisma |
|---|---|---|
| TEACHER | 152 | 12 |
| STUDENT | 37 | 4 |
| PARENT | 48 | 5 |
| RECEPTIONIST | 93 | 7 |
| LIBRARIAN | 75 | 15 |
| ACCOUNTANT | 110 | 33 |
| PRINCIPAL | 249 | 41 |
| APP_OWNER | 51 | 30 |
| ADMIN | 566 | 179 |

The non-operator roles are mostly direct, which is why breadth for them is cheap.

### 7.2 Authoring pattern (one file per domain, one entry per inventory row)

`scaffold-adapter.ts <inventoryKey>` writes a stub with:
- key, route, risk;
- the class floor;
- `mirrors` copied from the inventory "gate" note;
- an idempotency mode suggested from the `idem.` column;
- a test stub.

The implementer fills in the schema, gate, bind, preview, execute, receipt and copy.

**Example 1 — teacher attendance** (`domains/attendance.ts`; `direct`, `saveRegister` at `src/lib/attendance/register.ts:96`)

```ts
export const saveRegister: ExecEntry<RegisterIn, RegisterResult> = {
  key: "attendance.save_register", inventoryKey: "attendance.save_register", version: 1, domain: "attendance",
  risk: "CREATE", class: "B",                          // README decision 6; full register shown before saving
  copy: { title: "wf.attendance.saveRegister.title", whenToUse: "wf.attendance.saveRegister.when",
          examples: { en: ["7B attendance today: all present except Ali and Sara"], ar: ["حضور 7ب اليوم: الجميع حاضر ما عدا علي وسارة"],
                      ur: ["7B کی آج کی حاضری: سب حاضر سوائے علی اور سارہ"] } },
  input: z.strictObject({
    class: ref("class"), date: isoDay,                                   // ≤ today; parsed from the quote
    rule: z.strictObject({ default: z.enum(["PRESENT"]), quote: z.string() }).nullable(),   // only from an explicit "all … except" statement
    entries: z.array(z.strictObject({ student: ref("student"), status: z.enum(["PRESENT","LATE","PARTIAL","ABSENT","EXCUSED","LEAVE"]),
                                     arrivalTime: hhmm.nullable(), note: z.string().max(500).nullable() })).max(300),
    submit: z.boolean(),
  }),
  bind: registerBoundSchema,                                             // { classId, date, entries[{studentId,status,knownStatus,…}], submit }
  gate: { roles: ["TEACHER","ADMIN","CAMPUS_ADMIN","SUPER_ADMIN"], permissions: [["attendance","add"]],
          predicates: ["canMarkAttendance"], scope: { kind: "assigned-class", ref: "class" },
          mirrors: "canMarkAttendance + attendance.add (register.ts:97-98) + assignedClass (register.ts:112) + no future day (route.ts:50)" },
  evidence: ["entries[].status", "rule", "date"],
  preview: async (ctx, b) => {                                           // registerView = the screen's own read
    const view = await registerView(ctx.user, b.classId, b.date);
    return registerPreview(view, b, ctx.locale);                        // every pupil listed; "from rule" rows flagged; knownStatus captured into basis
  },
  execute: (ctx, b) => saveRegisterCommand(ctx.user, b),                 // extracted: adds the route-only future-day check and ATTENDANCE_SUBMITTED notify
  idempotency: { mode: "convergent" },                                   // absolute set; knownStatus makes a concurrent hand edit a CONFLICT
  receipt: (r, b) => ({ model: "attendanceRegister", ids: [r.registerId], counts: { written: r.written, conflicts: r.conflicts.length },
                        replayed: false, link: `/teacher/attendance?classId=${b.classId}&date=${b.date}`, facts: { submitted: r.submitted } }),
  verify: verifyById("attendanceRegister"),
  summary: (b, l, loc) => t(loc, "wf.attendance.saveRegister.summary", { cls: l.class, date: b.date, absent: countStatus(b, "ABSENT") }),
  nav: b => `/teacher/attendance?classId=${b.classId}`,
};
```

A bare "mark all present" with no exceptions becomes a deterministic question: "Is everyone in 7B (32 pupils) present today?" It stays class B with the full list (founder decision 2). A conflict result never reports done.

**Example 2 — library issue** (`domains/library.ts`; `direct`, `issueCopy` at `src/lib/library/desk.ts:95`)

```ts
export const issueCopy: ExecEntry<IssueIn, BookIssue> = {
  key: "library.desk_issue_copy", inventoryKey: "library.desk_issue_copy", version: 1, domain: "library",
  risk: "CREATE", class: "B",
  input: z.strictObject({ member: ref("libraryMember"), copy: ref("libraryCopy"),   // a title ref resolves to an AVAILABLE copy deterministically
                          requestedDue: isoDay.nullable(), overrideReason: z.string().min(8).max(300).nullable() }),
  bind: z.strictObject({ memberId: id, barcode: z.string(), overrideReason: z.string().optional() }),
  gate: { roles: ["LIBRARIAN","ADMIN","CAMPUS_ADMIN","SUPER_ADMIN"], permissions: [["library","add"]],
          predicates: ["canManageLibrary","libraryDesk"], scope: { kind: "own-campus" },
          mirrors: "canManageLibrary (desk.ts:29); tightened: library.add, PRINCIPAL excluded (B.roles finding)" },
  evidence: ["member", "copy"],
  preview: async (ctx, b) => issuePreview(await lookup(ctx.user, b.barcode), b, ctx.locale),
    // shows the loan count against maxLoans and the due date from the library rules; if requestedDue ≠ rule:
    // warning "Due date follows the library rule: 30 Oct" (issueCopy has no due-date input; honest)
  execute: (ctx, b) => issueCopyService(ctx.user, b),                    // unchanged service
  idempotency: { mode: "natural", reconcile: (ctx, b, since) => prisma.bookIssue.findFirst({ where: {
      schoolId: ctx.user.schoolId, memberId: b.memberId, copy: { barcode: b.barcode }, returnedAt: null, createdAt: { gte: since } } }) },
  receipt: (r) => ({ model: "bookIssue", ids: [r.id], replayed: false, link: `/librarian?view=lending&loan=${r.id}`,
                     facts: { dueAt: r.dueAt.toISOString().slice(0, 10) } }),
  verify: verifyById("bookIssue"),
  summary: (b, l, loc) => t(loc, "wf.library.issue.summary", { copy: l.copy, member: l.member }),
  nav: () => "/librarian?view=lending",
};
```

**Example 3 — accountant payment** (`domains/fees.ts`; class C; `wrapper` route `POST /api/fees/collect`)

```ts
export const collectPayment: HandoffEntry<CollectIn> = {
  key: "fees.collect_payment", inventoryKey: "fees.collect_payment", version: 1, domain: "fees",
  risk: "FINANCIAL", class: "C",
  input: z.strictObject({ payer: ref("guardianChild").or(ref("student")), invoice: ref("invoice"),   // "October" → billingMonth hint
                          amount: money, method: z.enum(["CASH","BANK","CHEQUE","MOBILE_WALLET"]), paymentDate: isoDay,
                          reference: z.string().max(80).nullable() }),
  bind: z.strictObject({ studentId: id, invoiceId: id, amount: z.number().int().positive() /* minor units */, paymentMethod: z.string(),
                         paymentDate: isoDay, referenceNumber: z.string().nullable() }),
  gate: { roles: ["ACCOUNTANT","ADMIN","CAMPUS_ADMIN","SUPER_ADMIN"], permissions: [["fees","add"]], predicates: ["financeDesk"],
          scope: { kind: "own-campus" }, mirrors: "assertStaffRole + fees.add (collect/route.ts:30-31) + resolveCampusId (:52)" },
  evidence: ["amount", "method", "payer"],
  preview: async (ctx, b) => invoicePreview(ctx, b),                    // invoice number, balance due, currency, any overpayment credit
  handoff: { kind: "domain-screen",
             href: (_b, h) => `/accountant?view=payments&handoff=${h}`,
             prefill: b => ({ ...b }) },                                // the Collect form sends idempotencyKey = handoff.idempotencyKey
  observe: { model: "payment", by: "idempotencyKey",
             receipt: (p: any) => ({ model: "payment", ids: [p.id], replayed: false, link: `/accountant?view=payments&payment=${p.id}`,
                                     facts: { receiptNo: p.receiptNo ?? "", amount: p.amount } }) },
  summary: (b, l, loc) => t(loc, "wf.fees.collect.summary", { amount: fmtMoney(b.amount, l.currency, loc), payer: l.payer, invoice: l.invoice }),
  nav: () => "/accountant?view=payments",
};
```

Alternative target: `school-ai-record` through `finance.apply_operation` PAYMENT. The default is the Collect desk (founder decision 3), because the Collect desk supports fine and discount, which `finance.apply_operation` lacks (Appendix A note).

**Example 4 — parent leave request** (`domains/family.ts`; `direct`, `requestLeave` at `src/lib/family/leave.ts:34`)

```ts
export const requestLearnerLeave: ExecEntry<LeaveIn, LearnerLeaveRequest> = {
  key: "attendance.request_learner_leave", inventoryKey: "attendance.request_learner_leave", version: 1, domain: "family",
  risk: "CREATE", class: "B",
  input: z.strictObject({ child: ref("guardianChild"), fromDate: isoDay, toDate: isoDay, reason: z.string().min(3).max(1000) }),
  bind: z.strictObject({ studentId: id, fromDate: isoDay, toDate: isoDay, reason: z.string() }),
  gate: { roles: ["PARENT"], scope: { kind: "own-child", ref: "child", guardianPermission: "attendance" },
          mirrors: "guardianChild (leave.ts:35); today-or-later and ≤30 days (leave.ts:38-40)" },
  evidence: ["fromDate", "toDate", "reason"],
  preview: async (ctx, b) => leavePreview(ctx, b),                       // child, dates in the campus timezone, "the school decides; you will be told"
  execute: (ctx, b) => requestLeave(ctx.user, b),
  idempotency: { mode: "natural", reconcile: (ctx, b, since) => prisma.learnerLeaveRequest.findFirst({ where: {
      schoolId: ctx.user.schoolId, studentId: b.studentId, requestedById: ctx.user.userId,
      fromDate: new Date(`${b.fromDate}T00:00:00Z`), toDate: new Date(`${b.toDate}T00:00:00Z`), createdAt: { gte: since } } }) },
  receipt: r => ({ model: "learnerLeaveRequest", ids: [r.id], replayed: false, link: `/parent/attendance?leave=${r.id}`,
                   facts: { status: r.status } }),                       // copy says "Request sent — awaiting the school", never "leave granted"
  verify: verifyById("learnerLeaveRequest"),
  summary: (b, l, loc) => t(loc, "wf.family.leave.summary", { child: l.child, from: b.fromDate, to: b.toDate }),
  nav: () => "/parent/attendance",
};
```

**Wrapping the 15 typed operations** (`domains/school-ops.ts`). Each operation becomes an entry whose class follows B.decisions T1:
- **B:** `academics.setup_year`, `setup.apply_changes`, `timetable.create_draft`, `timetable.create_school_drafts`, `exams.create_session_plan`. Execute = `createWorkspaceRecord` → `previewSchoolAiExecution` (the preview is now **shown**, not discarded, `service.ts:82`) → confirm → approval as the confirming user. That approval is allowed only when `assertApprovalSeparation` passes. Otherwise the step converts to a C hand-off automatically and says why → `executeSchoolAiTool`.
- **C:** the rest, via `school-ai-record` hand-off.
- `students.create` (B) keeps `createAutomaticStudents` (`students.ts:13-26`) and its `inviteAccounts: false`, but takes rows only from structured confirmed answers or a reviewed roster import (T7). The `medicalNotes` requirement becomes optional with "none recorded" chosen explicitly by the user (B.engine minor finding), so the model is never pushed to fabricate.

### 7.3 Codegen and lint (`npm run check:workflows`, wired into `check:ui`'s neighbour in `build`)

1. `import-inventory.ts` → `inventory.generated.ts`. It is regenerated when Appendix A changes, with the row count asserted at 700.
2. Every registry key ∈ inventory. Every inventory key ∈ registry ∪ `deferred.ts`, so **all 700 are accounted for at every commit**. The coverage report gives per-role counts of connected (A/B), hand-off (C), deferred and not-started, written to `docs/…/coverage.md`.
3. `class >= floor(risk)` unless an override with a reason exists. C entries have no `execute` (AST check plus type).
4. `gate.mirrors` is non-empty. Every predicate name resolves. Roles ⊆ inventory roles; widening is refused.
5. Input schema converts to strict OpenAI JSON schema. Card size ≤ 1,200 tokens.
6. Copy keys exist in EN/AR/UR. No hard-coded strings.
7. Idempotency is declared. Inventory `idem = no` ⇒ `natural` with a reconcile function, or `native`.
8. Every ref kind has a resolver. Resolvers declare their PII kind.
9. Wrapper adapters are listed in `policy/wrappers.ts` (transitional allow-list, §7.4).
10. The router's domain cards cover every domain that has entries.

**Long-tail order.** After the demo set, the order is demand first (`AiWorkflowGap.nearestKey` counts), then per cluster C7 → C5 → C3 → C4 → C6 → C1 → C2 → C8. That puts the mostly-direct desk and family clusters first and the inline-heavy finance and people clusters later.

### 7.4 Where reuse is safe, and the inline-prisma extraction recipe

**Safe: `direct` services** (418) taking `(AuthUser, raw)` and parsing themselves. Examples: `library/desk.ts`, `family/leave.ts`, `attendance/register.ts#saveRegister`. Call them as they are, plus the gate. Watch for **route-only side effects and checks** (verified examples):
- the future-day check and `notify("ATTENDANCE_SUBMITTED")` live in the register route, not the service (`attendance/register/route.ts:50-52`);
- 24 route files call `notify(`.

These must move into a `*Command` (step 4 below) or the adapter silently skips them.

**Conditionally safe: `wrapper`** (57). This is a synthesized `NextRequest` passed to a **library function** that reads only body or query and takes `AuthUser` explicitly. `students.ts:21-22` → `createStudentRecords` is the pattern. It is allowed only for callees listed in `policy/wrappers.ts`, and each is converted to direct during its domain pass.

**Never safe:**
1. Invoking a **route handler** (`POST(req)`). It calls `requireAuthUser()` → `cookies()`, which is absent in the worker and would authenticate the wrong principal or fail.
2. Routes with `assertSameOrigin`, where forging `Origin` defeats CSRF semantics (`library/desk/route.ts:21`).
3. `measured()`/`requestSchool()` capacity wrappers that read headers (`attendance/register/route.ts:39-43`).
4. IP-keyed rate limits.
5. **FormData uploads** (`admissions/documents`, `public/admissions/documents`, resource/assignment file ops). These are deferred to SKO-460 intake.
6. Routes whose effect is a synchronous external send or redirect (`fees.start_online_payment` settles by webhook; reminders/emails). These are class C anyway.
7. Webhooks, public routes, and anything reading the support-grant cookie.

**Extraction recipe for inline-prisma** (117 B/A rows; mechanical, 2–3 per day):

1. **Create** `src/lib/<domain>/<verb>-command.ts` exporting `export const <verb>InputSchema` (zod) and `export async function <verb>Command(user: AuthUser, input: In, opts?: { idempotencyKey?: string }): Promise<Out>`.
2. **Move the body parse 1:1** into the schema. Keep every message and status, using `ApiError` with the same text so UI copy and tests do not change.
3. **Move all authorization into the command**: role predicates, `assertPermission`, `resolveCampusId`, ownership queries. Only `requireAuthUser`, `assertSameOrigin`, rate limits and `measured()` stay in the route. The command must be safe to call with any `AuthUser`.
4. **Make request-derived values explicit inputs**: query params become fields, and the school day is computed inside. **Move post-commit effects** (`notify`, outbox enqueue) into the command, after the transaction, in the same order. The route stops calling them, so there is no double fire.
5. **Return a typed result.** The route maps it to the *same* JSON and status (`toLegacyResponse`). Add a golden test that snapshots the route response for a fixture before and after.
6. **Add replay safety** if the inventory says `idempotent: no`. Prefer a `natural` reconcile. Add an optional `idempotencyKey` column only when cheap and asked for.
7. **Register the route in `scripts/workflows/thin-routes.json`.** Lint asserts no `prisma.*.create|update|delete|upsert` remains in that route file.
8. **Run** the domain's existing suites, the golden test and the adapter DB test.

Worked target: `POST /api/fees/collect` (153 lines) becomes `collectFeePaymentCommand` with the replay, `recordPayment`, audit and `notify`. The route keeps 10 lines. Worked target: `POST /api/leave` (teacher's own leave, inline) becomes `applyLeaveCommand`. Both are on the demo path.

### 7.5 Class C hand-off integration per domain screen

- **Back end per C entry:** schema, bind, preview, observe (≈8/day).
- **Per route:** `completeHandoff()` when the form posts `_workflowHandoff`, two lines. Routes already keyed by our key (fees collect) need nothing.
- **Per screen:** `useWorkflowHandoff("fees.collect_payment")` returns prefill plus key, and shows a shared `HandoffBanner` ("Prepared by AI Workflows from your request — check and record"). About 50 screens hold the 287 C rows, at ≈0.5 day per screen with shared primitives, `check:ui`, data-* anchors and RTL.
- **Fallback while a screen has no hook:** the card shows a deep link plus a copyable values panel, and the step stays `HANDED_OFF` (honest).

### 7.6 Throughput and the demo critical path

**Per-domain implementer checklist** (copy into each slice ticket):
1. List the domain's inventory rows (`coverage-report --domain X`), mark the demo ones, and confirm each finding at file:line (audit before fixing).
2. Scaffold entries and set class from the floor. Justify any override.
3. Copy the route gate into `gate` (`mirrors`). Add tightenings for flagged holes with a ticket. Never widen seats or the matrix.
4. Write the model-facing input with refs and the bind schema. Reuse the service's own zod where exported.
5. Resolvers: reuse or add (scope-filtered, PII kind declared, AR/UR normalization).
6. `preview`: use the screen's own read (`registerView`, `lookup`, `previewReturn`, `mode=check`, `preview=true`). Basis includes `updatedAt`.
7. `execute`: call the service. Extract a `*Command` first if inline-prisma or if the route holds side effects or checks.
8. Idempotency mode; reconcile function; receipt id paths; `verify`.
9. Class C: target, prefill, observe, `completeHandoff` in the route, `useWorkflowHandoff` in the screen.
10. EN/AR/UR copy: title, when-to-use, two examples per language, summary, field questions, outcome strings.
11. Tests: the generated matrix picks the entry up. Add the domain fixture factory, replay, conflict and cross-tenant cases.
12. Live-smoke utterances (3 per language) added to the eval set.
13. `check:workflows`, `check:ui`, `tsc` (12 GB heap), domain suites. Evidence with EN/AR/UR screenshots at 1440 and 390.

**Per-implementer throughput** (steady state; the first week of a domain runs about 40% slower):

| Work | Per day | Count | Days |
|---|---|---|---|
| B on direct | 6 | 265 | 44 |
| B on wrapper | 3 | 20 | 7 |
| B/A needing extraction | 2.5 | 117 | 47 |
| A on direct/wrapper | 8 | 9 | 1 |
| C back end | 8 | 287 | 36 |
| Screen prefill hooks | 2 | ≈50 | 25 |
| Resolvers | 2 | ≈28 | 14 |
| **Total** | | | **≈174** |

Blended, that is ≈4 capabilities per day.

**Demo subset.** Each role gets the features in its navigation that a LEAP demo shows. Counts are capabilities; reuse readiness is in brackets.

| Role | Demo capabilities | Prereqs on the path |
|---|---|---|
| TEACHER (9) | `attendance.save_register` B [direct + command], `assignments.create` B, `assignments.release` C, `assignments.grant_extension` B, `marks.enter_bulk` B [**inline**], `leave.apply` B [**inline**], `meetings.open_window` B, `portfolio.create_entry` B, `nav.open` → Exam Studio | resolvers class, student, subject, assignment; 2 extractions |
| LIBRARIAN (6) | issue B, return B (override), renew B (natural reconcile on the renewal count, because a replay renews twice), reserve B, `library.create_books` A (existing), add copies B | member, copy, title resolvers |
| RECEPTIONIST (7) | visitor check-in B / check-out B, complaint intake B, postal log B, call log A (existing), `enquiries.create` B [**inline**], `pickup.gate_release` C | visitor, enquiry resolvers; 1 extraction |
| ACCOUNTANT (6) | `fees.collect_payment` C (screen hook), `fees.generate_invoices` C (record), `finance.apply_operation` EXPENSE C, `fees.send_due_reminder` C, `fees.propose_payment_plan` C, reports `nav.open` | invoice and guardian resolvers; Collect screen hook; `collect-command` extraction optional |
| PARENT (6) | leave request B, update own leave B, `meetings.family_book` B, absence explanation B, `pickup.issue_authorization` C, `fees.start_online_payment` C | guardian-child resolver |
| STUDENT (5) | `assignments.save_learner_draft` B, `assignments.submit` B, `study.ask` B, `portfolio.edit_reflection` B, `personal.save_plan` A | assignment resolver |
| PRINCIPAL (7) | `timetable.create_draft` B, `timetable.assign_substitutes` (C per T1), `exams.create_session_plan` B, leave approval C (queue hand-off), report-card publish C (deep link), `academic.calendar.add_holiday` B [inline], `nav.open` → Exam Studio | school-ops wrapping |
| ADMIN / CAMPUS_ADMIN (8) | the existing setup ops re-classed (`academics.setup_year`, `setup.apply_changes` ROOMS/PERIODS/SUBJECTS/STAFF), `students.create` B, staff invitation delivery C, guardian link C | questionnaire compiler |
| SUPER_ADMIN (3) | `campus.create` B, invite campus admin C (access), `nav.open` → approvals | — |
| APP_OWNER (2) | `platform.update_institution` B, `platform.inspect` A (existing) | — |

That is ≈59 capabilities, of which 5 need extraction. Add the questionnaires for ADMIN, TEACHER and PARENT.

**Critical path** (2–3 implementers):

| Weeks | Work |
|---|---|
| W1–2 (platform) | tables and migration; registry types, floors, lint; gate/predicates; planner with JSON mode and gateway `responseFormat`; masking policy; evidence; resolvers student/class/staff/guardian-child/subject; executor A/B; confirm; hand-off and observer; `WorkflowConsole`, ConfirmSheet, HandoffCard; generated matrix harness |
| W3 | TEACHER and LIBRARIAN slices; `leave.apply` and `marks.enter_bulk` extractions |
| W4 | PARENT, STUDENT, RECEPTIONIST; Collect screen hook; ACCOUNTANT |
| W5 | PRINCIPAL/ADMIN school-ops re-class; questionnaire compiler for ADMIN/TEACHER/PARENT; SUPER_ADMIN/OWNER; live smoke; EN/AR/UR QA |

Estimate: ≈48 person-days in total, of which ≈30 are platform and UI.

---

## 8. The questionnaire pipeline

### 8.1 Flow

```
first login (User.firstLoginQuestionnaireAt null)
  └─► /welcome/setup → RoleQuestionnaire(role)        typed questions, prefilled from what the system already knows
        └─► RoleQuestionnaireResponse (DRAFT → CONFIRMED per key, versioned)
              └─► compile(role, answers, liveContext) → Plan   deterministic; planner only for free-text cells
                    └─► AiWorkflowJob(source=QUESTIONNAIRE, questionnaireId+version pinned)
                          ├─ A steps run
                          ├─ B steps → ONE grouped "Review your setup" ConfirmSheet (itemized, group hash)
                          └─ C steps → hand-offs and SchoolAiSetupTask rows assigned to the right person
                                └─► ReadinessBoard (live records, never questionnaire completion)
```

### 8.2 Questionnaire definitions (`questionnaires/<role>.ts`)

```ts
interface Question<T> {
  key: string; section: "you" | "work" | "people" | "policies";
  input: "chips" | "multi-entity" | "grid" | "time-ranges" | "table" | "text" | "toggle" | "date";
  schema: z.ZodType<T>;                         // typed, unlike the 18 free strings today (schemas.ts:23-34)
  known?: (ctx) => Promise<T | null>;           // already known → shown as a confirmed chip with "change"
  skipIf?: (ctx) => Promise<boolean>;           // e.g. the wizard already created the ACTIVE cycle (setup-service.ts:419-423)
  produces: readonly string[];                  // registry capability keys this answer drives (lint: each must exist and be in the role's gate)
  compile: (answer: T, ctx) => PlanStepDraft[];
}
```

Rule enforced by lint: **every question must produce a record or a stored preference**, or it is removed. This is the reverse of today, where about 12 of 18 keys produce nothing (B.ui A6).

**Per-role outline.** Appendix D owns the wording. This table is what the pipeline must support.

| Role | Asks (only what is unknown) | Produces |
|---|---|---|
| ADMIN / CAMPUS_ADMIN | grades and sections grid; subjects per grade (chips table with total marks); periods (time-range builder); rooms (count + pattern); staff table (name, email, role); fee heads per grade. Skipped: school name, country, timezone, year, dates, weekends (wizard) | `academics.setup_year` (classes into the **existing** cycle via `existingCycleId`), `setup.apply_changes` SUBJECTS/PERIODS/ROOMS/STAFF (B); fee structure drafts (C → accountant, or fee setup while no accountant); invitation delivery (C); principal-seat items → setup tasks for the principal |
| SUPER_ADMIN | campuses and who leads each | `campus.create` (B), campus-admin invitations (C), group standards (C → standards screen) |
| PRINCIPAL | grading model; calendar holidays; timetable preferences; curriculum → deep link to Exam Studio | academic model draft (B), holidays (B), timetable drafts (B), Exam Studio link |
| TEACHER | confirm my classes and subjects (from assignments; if none → task to admin); marking scale preference; meeting availability windows; homework defaults | `meetings.open_window` (B), preferences (A), lesson-plan slot (A, private plan), missing-assignment task (C → admin) |
| ACCOUNTANT | fee heads and amounts; receipt numbering; reminder cadence; bank accounts | fee structures (C: own desk), reminder policy (C), bank account (C) |
| LIBRARIAN | loan rules (max loans, days, fine); member import from roster | `saveRules` (B), members (B) |
| RECEPTIONIST | visitor badge policy; call categories; pickup desk hours | front-desk settings (B), preferences (A) |
| PARENT | confirm children (only ACTIVE guardian links; never inferred, `enrollment.ts:60`); language; channel preferences per topic | preferences (A, `announcement-preferences-service`), pickup persons (C) |
| STUDENT | language; study goals; reminder preference | private plan (A), portfolio goals (B) |
| APP_OWNER | none (operator console); optional notification preferences | preferences (A) |

### 8.3 Reuse and retirement

- **Kept:**
  - `setup-journey` (`setup-journey-service.ts:10-41`) becomes the ADMIN readiness source, wrapped by `questionnaires/readiness.ts`, which adds per-role checks (teacher: has assigned subjects and a register; parent: at least one child visible).
  - `SchoolAiSetupTask` (assignee, question, answer) carries C items and "needs another person" items.
  - Questionnaire **version pinning** (three re-check points, `service.ts:107-110,116-119,144-147`): `compile` and every execute re-check `RoleQuestionnaireResponse.version`.
- **Replaced:** `GuidedSetup` by `RoleQuestionnaire` (shared primitives; the `MultimodalComposer` text input is reused for free-text cells). `setup-actions-service` (ROOMS/PERIODS/SUBJECTS drafts) is superseded by `compile` and deleted after migration.
- **Retired:**
  - `setup-generation` (the legacy nine drafts; POST route uncalled, `generate/route.ts:28`);
  - `SetupGenerationPanel` and `SetupRunPanel` reachability;
  - `dashboard.ts:73-85`'s `SETUP_GENERATION_V1` key, replaced by readiness.
  - Pre-existing generations stay readable until 2027-01.
- **Copy fix:** `onboarding/page.tsx:34` ("nothing applies until you approve") becomes true, because B items apply only after the grouped confirmation.
- **Group schools:** campus admins get the campus questionnaire on first login. The SUPER_ADMIN gets the group one. This ends the "group owners never see a questionnaire" gap (`setup-role.ts:6-8`).

---

## 9. Migration from `src/lib/automation`

**Kept** (B.engine's strengths finding, line 137), mapped to the new homes:

| Strength | New home |
|---|---|
| Layered idempotency: job key + request hash, per-step key persisted before execution, receipt replay, `SchoolAiExecution` uniques | `engine/jobs.ts`, `AiWorkflowStep.idempotencyKey`, `Idempotency` modes; `execution.ts:236-254` untouched |
| Actor re-verification before/after model calls and in the worker (role, campus, accessVersion) | `executor.ts` before every write; planner after the call; worker re-resolve |
| Questionnaire version pinning at three points | `compile` + executor re-checks |
| Selection/act tool-switch guard | Plan pinning: the executor refuses any capability or version not in the confirmed plan; a replan needs a new plan version and new confirmations |
| Completion-class rules | `outcomes.ts` (adds awaiting_* and partial) |
| Typed adapters reusing services (roster commit, `logCall`, workspace record + preview + execute) | registry entries in `students.ts`, `front-desk.ts`, `school-ops.ts` |
| Serializable transactions with retry | `schoolAiTransaction` stays inside the services |
| Audit rows for every write | §6.3 |
| Per-tool trimmed output schemas | per-domain strict JSON schema |
| Rate-limited starts | 10 per 5 min per user on `/api/workflows` |
| Tenant-context wrapping | `runWithTenantContext` around executor and observer |

**Replaced:**
- the select→act loop (`service.ts:120-157`) → router + planner;
- bare names → cards;
- the 30-step cap → plan ≤100 steps per job, with ≤30 B steps per group confirmation;
- the 600 ms auto-advance → durable polling;
- the `evidenceQuote` substring over mixed text → segment evidence;
- `name`-key masking → field policy;
- `school.inspect` dumps → resolvers;
- self-approval → classes;
- the JSON blob → tables;
- the 4-job worker → fair sweep;
- the school-wide lock → step lock;
- `Object` + `in` membership (`service.ts:63,129`) → a frozen `Map`.

**Steps:**
1. Land the new tables and engine behind `WORKFLOWS_V2` (per school, default on in dev, off in prod until the release gate).
2. Port the 12 tools and 15 operations as registry entries with classes. **Behaviour change:** typed ops lose self-approval.
3. Swap `AutomaticWorkspace` mounts (`/ai`, `school-ai-workspace.tsx:380`, `guided-setup.tsx:194`) for `WorkflowConsole`. `/teacher/ai` and the admin/principal `?view=ai` gain a "Do it" entry point into the same console, so the three "type to AI" surfaces stop diverging (B.ui finding).
4. `/api/automation` stays as a read-only shim for old jobs for one release, then is removed with `src/lib/automation/*`. `tests/automation/*` are ported into `tests/workflows`, and the 18 scenarios keep passing in their new form.
5. Retention: a cron removes jobs, segments and hand-offs after 180 days, keeping audit rows.

---

## 10. Testing strategy

1. **Unit, generated from the registry** (`tests/workflows/registry.test.ts`, `node --test`). For every entry:
   - class ≥ floor; C has no execute;
   - schema converts to strict JSON schema;
   - fuzzed valid inputs bind deterministically, and the preview hash is stable across runs and key order;
   - copy exists in 3 locales;
   - the gate is not wider than the inventory roles.

   Also tested:
   - `evidence.ts`: AR/UR normalization, digits, server-text rejection;
   - `masking.ts`: class and subject names CLEAR; the student name in the request is tokenized; a one-character class name never corrupts the prompt;
   - planner parse and repair, including a non-JSON reply.
2. **DB matrix, role × capability** (`tests/workflows/matrix.database.test.ts`, isolated 55438, both URLs identical). Iterate the registry × 11 roles × seat variants (ADMIN/CAMPUS_ADMIN with and without PRINCIPAL/ACCOUNTANT) using per-domain fixture factories (`tests/workflows/fixtures/<domain>.ts`, lifted from `execution.database.test.ts:17-31` and `arbitraryTenantPair`). Assert:
   - catalog exposure equals the gate;
   - direct execute as a non-permitted role → 403 with zero writes;
   - permitted: execute twice → one effect and a deep-equal receipt; `verify` true;
   - same key with a different input → 409;
   - permission revoked or accessVersion bumped between confirm and execute → refused;
   - B without confirmation → the worker never executes it;
   - preview drift → back to WAITING_CONFIRM;
   - C → no domain row until the observer sees one;
   - cross-tenant pair unchanged;
   - credits charged once per planning turn and never on replay.

   This covers B.qa's recommended matrix, including the untested 409 and cross-school paths.
3. **Extraction golden tests:** each extracted route returns a byte-equal JSON shape and status for fixtures before and after.
4. **Browser** (`tests/workflows/*.browser.spec.ts`, Playwright, app on 3106). Planner stubbed at the gateway with `WORKFLOWS_PLANNER=fixture` (scripted plans). Each demo role: type → plan → missing-detail chips → ConfirmSheet → receipt chip → deep link. Class C: hand-off → prefilled domain screen → submit → card flips to completed. Questionnaire for ADMIN/TEACHER/PARENT end to end. EN/AR/UR at 1440 and 390; RTL; data-* anchors (`data-wf-step`, `data-wf-confirm`, `data-wf-handoff`). Screenshots go to the scratchpad, because Playwright wipes design-system results.
5. **Live-model smoke** (`scripts/workflows/live-smoke.ts`, manual or nightly, synthetic tenant only, real key). 3 utterances per demo capability per language (≈530). Asserts chosen capability, refs and evidence fields, plus 40 negative cases: wrong role, injection inside school content, "mark everyone present", "approve and send". Results are recorded as automation cases in `AI_EVALUATION_CASES`. The release gate (`ai-release-evaluation.ts:3-7`) stays closed until an educator-reviewed run is recorded.
6. **Runner wiring (slice 1):** `scripts/run-school-ai-tests.mjs` globs `tests/workflows` (and `tests/automation` until removed), `npm run test:workflows[:db]`, plus a CI job. B.qa found these suites orphaned.

---

## 11. Risks and open decisions for the founder (each with a default)

**Decisions:**

1. **Library return (fine computed by policy): B or C?** *Default B*, with the fine shown in the preview. The fine is not user-chosen and the desk applies the identical rule. It is recorded as a floor override.
2. **"All present except …" registers.** *Default:* allowed only from an explicit rule quote, with every pupil listed in the ConfirmSheet. A bare "all present" becomes a count question, still B. No silent "mark all".
3. **Payment target.** *Default:* the Collect desk hand-off, which has fine and discount and is keyed. The alternative is a `finance.apply_operation` record for schools that want a second approver on every payment.
4. **Destructive actions from chat.** *Default:* class C hand-off with the record preselected on its screen. Never B.
5. **Grouped confirmation for setup.** *Default:* yes, one itemized sheet with a group hash, ≤30 B steps per sheet.
6. **Credits.** *Default:* 1 credit per planning turn, execution free, questionnaire compile free except for free-text cells.
7. **Transitional synthesized-request wrappers.** *Default:* allowed only for listed library callees, converted per domain pass. Never route handlers.
8. **Stricter-than-route gates where the inventory flags holes** (PRINCIPAL on library and front desk; `staff_attendance` without campus checks). *Default:* stricter in the adapter, plus a ticket to fix the route. Rows without a safe service (for example `staff_attendance.mark_staff`) go to `deferred.ts`.
9. **New tables vs. extending `SchoolAiRequest`.** *Default:* new tables, with the old rows readable for one release.
10. **Long-tail ordering.** *Default:* demand (gap telemetry) after the demo set, then the cluster order of §7.3.
11. **Curriculum intake owner.** *Default:* Exam Studio. AI Workflows keeps typed topic lists only and deep-links `/ai/studio`.

**Risks:**
- **Extraction regressions** in 117 inline routes. Mitigation: golden tests and the thin-route lint.
- **Router accuracy** at ~150 to 520 capabilities. Mitigation: two-stage retrieval, domain synonyms in three languages, live-smoke gates, and `nav.open` as a safe fallback.
- **AR/UR name matching** against Latin-stored names. An unmatched name reaches the prompt unmasked. Mitigation: transliteration table, a residual `scanForPII`, and an eval case.
- **Inventory accuracy.** Appendix A came from static reading, and verifier corrections exist. Every adapter audits its row at file:line first.
- **Screen-hook UI load** (≈50 screens). Mitigation: a shared HandoffBanner and fallback values panel, so coverage does not wait on hooks.
- **Seat and permission edge cases:** the V2 cut-over on 2026-10-26 (`permissions.ts:283`). The DB matrix runs both before and after.
- **Release gate** stays closed until an educator-reviewed evaluation exists. The LEAP demo runs on synthetic tenants only.
- **Prompt cost and latency** at 2 calls per turn with strict schemas. Mitigation: router skip at ≤40 capabilities and card token caps.


**Key decisions**
- One registry entry per Appendix A capability (key = inventory key), authored per domain file; lint requires every one of the 700 inventory rows to be in the registry or in deferred.ts with a reason, so coverage is accounted for at every commit.
- Confirmation class is a static registry field with a floor derived from the inventory risk column: READ→A, CREATE/UPDATE→B, DESTRUCTIVE/APPROVAL_DECISION/FINANCIAL/ACCESS_GRANT/COMMUNICATION/PUBLISH→C (11/400/287 rows). A is allow-listed; overrides need a written reason; class C entries have no execute member in the type.
- Class C never executes in the engine: it hands off either to a SchoolAiRecord draft (SKO-470 approval; self-approval at service.ts:79-81 removed) or to the existing domain screen through ?handoff=<id> prefill. The human presses the domain's own submit, so separation of duties is never re-implemented.
- 106 of the 223 inline-prisma rows are class C, so they need no extraction to be covered. Only 117 B/A inline rows go through the mechanical (user, input) *Command extraction recipe, with golden tests and a thin-route lint.
- Never invoke route handlers or forge requests: adapters call service functions only. Synthesized NextRequest is allowed only for listed library callees such as createStudentRecords, and only transitionally. Route-only side effects and checks (notify, future-day check) move into the extracted command.
- Plan-then-execute: one router call plus one strict JSON-schema planner call per turn produce a whole DAG; execution uses no model, which removes the 30-step cap and the per-step credit drain.
- The model emits typed EntityRefs, never ids. Deterministic scope-filtered resolvers bind them, and pre-masking replaces names the user typed. Rosters never enter prompts, and masking is by entity kind, so class and subject names stay clear.
- Evidence is verified against stored user-authored segments only (AiWorkflowSegment), with AR/UR/digit normalization. Missing or failed evidence becomes a deterministic, localized question, not a job failure.
- Receipts are truthful by construction: declared id paths, 409 conflicts become CONFLICT, verify() reads ids back under the tenant guard, and class C completes only when an observer finds the domain row by hand-off key. Changed values are shown as a diff.
- New tenant-guarded tables (ai_workflow_jobs/segments/steps/handoffs/gaps, role_questionnaire_responses) replace the JSON blob in SchoolAiRequest.reply.
- 1 AI credit per planning turn, reserved before the call, with all provider attempts logged; adapter execution is free; credit exhaustion pauses the job rather than failing it.
- Typed per-role questionnaires: every question must produce a record or preference. A deterministic compiler builds the plan, B items apply after one grouped confirmation, C items become hand-offs and SchoolAiSetupTasks. setup-journey becomes the readiness source; setup-generation and setup-actions retire.
- Keep the B.engine strengths (layered idempotency, re-auth before and after model calls and in the worker, questionnaire version pinning, tool-switch guard as plan pinning, completion rules, tenant wrapping, audit). Port the 12 tools and 15 operations as registry entries behind WORKFLOWS_V2.

**Risks**
- Extraction regressions in the 117 inline-prisma routes that need (user, input) commands; mitigated by golden response tests and a thin-route lint, but the work is manual.
- Router/planner accuracy degrades with large capability sets (TEACHER ~150, operators ~520); needs two-stage retrieval, three-language domain synonyms, live-smoke gating and nav.open fallback.
- Arabic/Urdu names that do not match Latin-stored roster names reach the prompt unmasked; transliteration table plus scanForPII reduce but do not eliminate this.
- Appendix A was produced by static reading with verifier corrections; adapter authors must re-audit each row, and some rows (e.g. staff_attendance.mark_staff, fees.record_payment_basic) must be deferred as unsafe.
- Class C coverage depends on prefill hooks in about 50 domain screens; without them hand-offs fall back to a deep link and values panel, which is honest but weaker in a demo.
- Route-only side effects (notify in 24 route files, future-day checks, measured() capacity) are silently skipped if an adapter calls a direct service without the extracted command.
- Permission V2 cut-over on 2026-10-26 and per-school role_permissions overrides can change effective gates; the DB matrix must run before and after.
- The AI release gate is closed (no educator-reviewed evaluation); live tenants cannot be enabled until a real evaluation with automation cases is recorded, so LEAP runs on synthetic tenants.
- Removing self-approval changes behaviour of existing typed operations: admins used to auto-execute setup ops and will now see confirmations or hand-offs; questionnaire runs must be retested end to end.
- Two model calls per turn with strict JSON schemas add latency and cost; card token caps and router skip at ≤40 capabilities are needed to stay under maxDuration 60.

**Effort**: Assumptions: one implementer at steady state; the first week in a new domain runs about 40% slower; counts are from Appendix A (700 rows: 418 direct, 57 wrapper, 223 inline-prisma; floors A 11, B 400, C 287); the per-day rates are estimates, not measurements.

PLATFORM (≈30 person-days): Prisma tables, migration and tenant registry 2; registry types, floors, inventory import, lint and coverage report 4; gate/predicates/approvers 2; gateway responseFormat plus router and planner prompts, cards and repair 4; masking policy and evidence normalization (EN/AR/UR) 3; core resolvers (student, class, subject, staff, guardian-child) 3; executor A/B, confirm (single and group), hand-off and observer, receipts/verify/outcomes, credits, fair worker 6; WorkflowConsole, PlanTimeline, StepCard, ConfirmSheet, HandoffCard, ReceiptChip, MissingDetailChips, CapabilityBrowser with EN/AR/UR and RTL 6.

QUESTIONNAIRES (≈18 person-days): types and compile framework 3; ADMIN/CAMPUS_ADMIN 4; TEACHER 2; PARENT 2; other 7 roles 1 each (7); readiness extension and retiring setup-generation/setup-actions included.

ADAPTERS, full coverage (≈174 person-days): B on direct 265 at 6/day = 44; B on wrapper 20 at 3/day = 7; B/A needing inline extraction 117 at 2.5/day = 47; A on direct/wrapper 9 at 8/day = 1; C back end 287 at 8/day = 36; domain-screen prefill hooks ≈50 screens at 0.5 day = 25; remaining resolvers ≈23 at 0.5 day = 12 (≈2 days absorbed in the platform core).

TESTS AND QA (≈20 person-days): generated unit and DB matrix harness plus fixture factories 6; extraction golden tests (included per adapter above); browser suites per demo role in EN/AR/UR at 1440 and 390 6; live-smoke set and evaluation cases 4; runner/CI wiring and evidence 4.

TOTAL ≈ 240–250 person-days. With 3 implementers working by cluster, ≈17 calendar weeks to full coverage.

DEMO SUBSET (≈59 capabilities across all 11 roles plus questionnaires for ADMIN, TEACHER and PARENT): platform 30 + about 13 adapter days (5 inline extractions: marks.enter_bulk, leave.apply, enquiries.create, academic.calendar.add_holiday, optional fees collect-command) + questionnaires 8 (framework plus three roles; ≈11 with full ADMIN depth) + browser/live QA 5 ≈ 48–56 person-days, ≈5 weeks with 2–3 implementers (W1–2 platform, W3 teacher and librarian, W4 parent, student, receptionist, accountant, W5 principal/admin re-class, questionnaires, QA).


---

# The Companion Builds It In Front Of You: UX/UI/interaction proposal for AI Workflows and the per-role first-login questionnaire (U1-companion)

# The Companion Builds It In Front Of You

UX designer U1-companion · 23 October 2026 · read-only proposal for `feat/ai-full-role-automation`

This proposal builds on Appendix B (B.engine, B.ui, B.roles, B.decisions) and on the surfaces already in the repo. Every claim about today's code cites file:line. Everything else is design and is marked as design. Scope: the UX, UI and interaction layer for both flagships. The engine, adapter and registry changes it needs are listed as **UI contracts** (§3.4) and are not designed here. Voice and document intake stay with SKO-460. Exam papers, moderation and the Seal stay in Exam Studio (SKO-408), which this proposal only deep-links to.

---

## 1. The idea in one paragraph, and the three signature moments

**The idea.** Skoolee already has a cast: eleven animated role companions with outfits, props and a three-scene stage (`src/components/onboarding/AiGuide.tsx:12`, `RoleGuideProps.tsx:46-149`, `GuideStage.tsx:178`, `role-guide-copy.ts:26`). Today the companion only decorates the tour and sits in the questionnaire's sidebar (`guided-setup.tsx:178-189`). This proposal gives the companion a job. On first login your role's companion interviews you one question at a time, and you answer mostly with chips. On a side canvas your answers visibly turn into a plan, with each step labelled by who acts: it runs on its own, you confirm, or someone else approves. Then the canvas becomes a stage and you watch your workspace being built. Class tiles drop onto shelves, timetable cells fill, roster rows land, and each piece arrives only when the server returns a receipt for it. Afterwards the same companion stays in a dock on every page as the place to ask for anything. It knows the page you are on, shows what it can do there, asks only for the missing detail, puts a card in front of you to confirm, and hands money, publication, family messages and access to the person who must approve them. **The animation never runs ahead of the database.** A tile appears when its receipt exists, and an envelope reads "waiting for Sana" until Sana acts.

**Signature moment 1: "It already knows me."** The first login opens on the companion in your role's outfit, holding your role's tool, greeting you in your language. Before asking anything it lays out a short stack of **Known-fact cards**: "Your school: Al-Noor Grammar · Lahore · Asia/Karachi · Session 2026–27, 1 Sep – 30 Jun · Weekend: Sunday". The wizard already wrote all of this (`setup-service.ts:369-425`). You tick each card or edit it. Nothing the system already knows is asked again, which removes today's double collection of the academic year (B.ui finding 2).

**Signature moment 2: "The school assembles itself."** You press **Build my campus**. The Plan canvas widens into the **Build stage** and the companion switches to its build pose. Lanes fill in dependency order, each item stamped with its receipt as it lands: 12 classes on the shelf, 48 subjects slotted under them, 8 periods on the ladder, 14 rooms on the map, the timetable grid filling cell by cell. Staff invitations land in a tray marked "Pending until accepted". The fee structure lands in a sealed envelope marked "With Sana Malik (Accountant) for approval". The build pauses at each step you must confirm, with the exact preview in front of you.

**Signature moment 3: "Ask anything, right here."** On the Lending desk a librarian opens the dock and types "issue Atlas of the World to Ayesha 7B till Friday". The companion shows two Ayeshas in 7B as picker chips, then a **Confirm card**: "Issue copy LB-0042 to Ayesha Khan (7B), due Fri 30 Oct". The librarian presses **Issue 1 copy**. A receipt slip drops into the dock and the new loan row appears in the page's table behind it, because the page's list revalidates on the receipt event. A teacher does the same for a register in Urdu. An accountant gets a prepared payment handed to the finance approval screen.

---

## 2. Screens and surfaces

All new components live under `src/components/companion/` and are built only from shared primitives in `src/components/ui`: `Button`, `IconButton`, `Badge`, `Card`, `Alert`, `Progress`, `ModalSurface`, `Modal`, `ConfirmAction`, `ViewTabs`, `Tooltip`/`InfoTip`, `Skeleton*`, `FollowUpList`, `TaskStatus`/`TaskFeedback`, `Textarea`, `Input`, `DatePicker`, `Select`, `Checkbox`, `Switch`, `InkHeading`, `FlagshipChip`, `EmptyState`, `ErrorState`. They also reuse `AiGuide`, `WaxSeal` (`src/components/auth/WaxSeal`) and `ExecutionPreview` (`src/components/school-ai/execution-preview.tsx:12`). Breakpoints follow the brief (360 / 768 / 1440). 320 px is the hard minimum and is handled in §2.8.

### 2.0 Shared layout rule for every surface
- **Conversation column**: the companion and the one current question.
- **Canvas column**: the plan, then the build.
- LTR: conversation on the start side, canvas on the end side. RTL: the grid mirrors through logical placement (`grid-template-areas` read in document direction, `ps-*`/`pe-*`, `start`/`end`). There are no `left`/`right` values anywhere.
- The companion SVG mirrors in RTL with `scale: -1 1` on its wrapper so it faces the content. Its props carry no text, so mirroring is safe.
- Numbers, times and IDs inside RTL text are wrapped in `<bdi>` or given `dir="ltr"`, the way `GuideStage.tsx:199` already does for the folio.

### 2.1 `CompanionInterview`: first-login questionnaire (full-screen)
- **Purpose.** The per-role first-login conversation that ends in the build. It replaces `GuidedSetup`'s question loop (`guided-setup.tsx:176-224`) and keeps its persistence model: one ONBOARDING record, `confirmedKeys`, and version binding (`schemas.ts:23-34`).
- **Mount.** `/welcome/setup` (new route) or `/ai?setup=1` as today (`src/app/ai/page.tsx:14-30`). In both cases it renders inside `ModalSurface fullscreen`, the same as `GuidedSetup`, with `disableBackdropClose` and a dirty guard.
- **Props.**
  ```ts
  type CompanionInterviewProps = {
    role: UserRole; language: Language; campusId: string | null;
    questionnaire: InterviewDefinition;            // §5, static per role, versioned
    record: { id: string; version: number } | null; // ONBOARDING (staff) or ROLE_PROFILE (families) record
    knownFacts: KnownFact[];                         // server-built prefill, §5.3
    onExit(reason: "saved" | "built" | "later"): void;
  };
  ```
- **Layout.**
  - **1440**: three zones. Narrow companion rail (240 px, the existing `.interviewAside` look, `launch-guide.module.css:207-211`), conversation (max 640 px), Plan canvas (minmax 420 px, 1fr).
  - **768**: two zones. The companion shrinks into the conversation header as a 72 px compact avatar (`AiGuide compact`), and the canvas becomes a bottom drawer peeking 96 px ("Plan · 9 steps"), drag- or tap-expandable to 70 dvh.
  - **360**: one zone. A `ViewTabs` header switches **Talk · Plan · Built** with counts. The companion sits at 56 px beside the question heading. Chips wrap, with 44 px minimum targets.
- **Primitives.** `ModalSurface`, `ViewTabs`, `Button variant="choice"` (already used for chips at `guided-setup.tsx:211`), `Progress`, `InkHeading`, `Alert`, `DatePicker`, `Badge`.
- **RTL.** The step arrows already use `rtl:rotate-180` (`guided-setup.tsx:215`). Keep that and apply it to every directional icon. The canvas drawer handle is centred, so it needs no mirroring.

### 2.2 `PlanCanvas`: answers becoming a plan
- **Purpose.** Shows, live, what the answers will produce, before anything is written. It is a projection of the server's persisted plan (§3.4), never a client guess, plus the "still to answer" ghosts.
- **Props.** `{ plan: PlanView | null; pendingQuestions: string[]; language; density: "rail" | "drawer" | "tab"; onFocusStep(key) }`
- **Anatomy.**
  - **Lanes** in dependency order: Structure (year, classes, sections), Teaching (subjects, periods, rooms, timetable), People (staff invitations, roster), Money (fee structure), Messages (communication preferences), Your workspace (role-only items such as a teacher's planner).
  - Each lane holds `PlanStepCard`s: title, count ("12 classes"), source answer chip (tap to jump back to that question), and a **class tag** in human words:
    - Class A: "Runs on its own" (neutral `Badge`).
    - Class B: "You'll confirm" (brand `Badge`).
    - Class C: "Goes to Sana Malik · Accountant" (berry `Badge` with an envelope icon). When the seat is empty: "Needs an accountant: you'll approve it in Finance".
  - **Ghost cards** (dashed `Skeleton` outline) show what an unanswered question would add. For example "Fee structure: answer *Fee heads* to add this". This makes skipping visibly costly without nagging.
  - **Footer**: "Estimate: 23 steps · about 9 AI credits · 4 confirmations from you · 2 approvals by others". The credit figure comes from the server's reservation estimate (T9 in B.decisions) and is labelled "estimate".
- **Motion.** A card fades and rises 6 px when the plan version that contains it arrives. No card ever animates into a "done" look on the plan; done belongs only to the Build stage.

### 2.3 `BuildStage`: the workspace assembling itself
- **Purpose.** Signature moment 2. A receipt-driven visualisation of the run.
- **Props.** `{ run: CompanionRunView; language; reducedMotion: boolean; onOpenReceipt(stepKey); onConfirm(stepKey); onOpenHandOff(stepKey) }`
- **Tiles** (each is its own component and renders only from receipts). They can be "placed" only when `step.status === "receipt"`; before that they show as outline placeholders labelled with the step status.

| Tile | Shows | Source of truth |
|---|---|---|
| `ClassShelf` | One spine per class/section, grouped by grade; spines slide onto the shelf in receipt order | `academics.setup_year` receipt `willCreate`/created ids |
| `SubjectRack` | Chips under each class spine | `setup.apply_changes` SUBJECTS receipt |
| `PeriodLadder` | Vertical time ladder; rungs light up per period | PERIODS receipt |
| `RoomMap` | Simple grid of room plates with capacity | ROOMS receipt |
| `TimetableGrid` | Days × periods; cells fill from the draft's slots. Labelled **Draft** with a dashed border; publication is class C (`timetable.publish_reviewed`) | `timetable.create_draft` receipt |
| `RosterLedger` | Rows land into a ledger with name, roll and class. Desktop shows the first 8 and "+ 112 more"; the full list opens in the receipt | `students.create` receipt (`students.ts:13-26`) |
| `InviteTray` | Envelopes stacked "Pending until accepted" (never "staff added") | STAFF receipt; pending invitations (`execution.ts:36`) |
| `HandOffTray` | Sealed envelopes, each labelled with the approver and the live status (§4.2) | class C steps |
| `WorkspaceDesk` | Role-only items: a teacher's register shortcut, planner slots, preferences | role adapters |

- **Layout.**
  - **1440**: the tiles flow in a 12-column masonry; the active lane is spotlit with the existing `Spotlight` dimming style kept subtle, and the companion is pinned at the start-bottom corner of the stage.
  - **768**: two columns, with the active lane scrolled into view (`scrollIntoView` with `behavior` set from reduced motion, as `use-validated-form.ts:90` does).
  - **360**: one tile at a time, as a vertical list of collapsed lanes. Only the active lane expands; earlier lanes collapse to a one-line receipt summary ("12 classes · created · View").
- **RTL.** Shelves fill from the start side. `TimetableGrid` columns run in reading order, so the first weekday sits at the start side. Time labels use `dir="ltr"` with the locale's digits from `Intl.NumberFormat(language)`.

### 2.4 `CompanionDock`: the "ask anything" surface on every page
- **Mount.** Inside `RoleShell` next to `ChatDock` (`RoleShell.tsx:392`), through a new `CompanionProvider` wrapped inside the existing `LocaleProvider`/`NavigationAccessProvider` stack (`RoleShell.tsx:112`). Visible only when the leaf `aiWorkflows` is visible for the role (`role-nav.ts`, gate `ai + schoolAi`).
- **Props.**
  ```ts
  type CompanionDockProps = {
    role: UserRole; consoleId: ConsoleId; activeLeafId?: string;   // from RoleShell's activeLeafFor
    campusId: string | null; language: Language;
  };
  ```
- **Coexistence with the chat dock.** `ChatDock` puts a 56 px launcher at `fixed bottom-24 end-4` (`chat-dock.tsx:87`) and a 420 px panel at `md:end-6 md:bottom-24` (`:149-153`). Design: a shared `DockRail` (fixed, `end-4`, `bottom-24`, vertical stack, gap `--space-3`) owns both launchers. The companion launcher sits lowest because it is the primary action, and chat sits above it. Only one panel is open at a time; opening one closes the other and returns focus to its launcher. `ChatDock` needs a small refactor to render into the rail instead of positioning itself.
- **Launcher states.** The 56 px avatar head crop of the role companion, plus a ring:

| Ring | Meaning | Accessible name |
|---|---|---|
| none | idle | "Ask Skoolee AI" |
| brand progress arc | a run is preparing or running (arc = receipts / planned steps) | "Skoolee AI · building, 7 of 12" |
| amber dot | needs you (detail or confirmation) | "Skoolee AI · needs your answer" |
| berry envelope | something of yours is waiting on another approver | "Skoolee AI · 1 waiting for Sana" |
| berry count badge | approvals waiting **for you** (you are the approver) | "Skoolee AI · 2 approvals for you" |

- **Peek chip.** On a state change while the dock is closed, a one-line chip slides out from the launcher for 6 s, or stays until dismissed when the run needs you: "Needs you: which Ayesha?". It is a `role="status"` live region and never steals focus.
- **Panel layout.**
  - **1440**: a 440 px side sheet anchored to the end edge, full height minus the header, with no backdrop, so the page stays usable and the revalidated list behind it shows the new row.
  - **768**: the same sheet at 400 px with a scrim.
  - **360**: a bottom sheet at 92 dvh with a drag handle, docked above the mobile nav.
- **Panel anatomy, top to bottom.**
  1. `DockHeader`: companion (40 px), title "Skoolee AI", the page context chip ("On: Lending desk"), and **What I can do here**.
  2. `RunThread`: the current run's turns and cards (§6).
  3. `SuggestionRow`: 3 page-aware chips.
  4. `Composer`.
  5. Footer link: "All AI work →" goes to `/ai`.
- **Primitives.** `IconButton`, `Badge`, `Tooltip`, `ModalSurface` (phone sheet), `Textarea`, `Button`, `Card`.

### 2.5 `/ai`: AI Workflows home
- **Purpose.** The full-page version of the dock plus history and the capability map. It replaces the overview-tab `AutomaticWorkspace` for all roles (`school-ai-workspace.tsx:380`; `src/app/ai/page.tsx:30` for families/owner). The other 16 tabs remain for staff (`school-ai-workspace.tsx:62-64`).
- **Layout.**
  - **1440**: start column (composer and current run, max 720 px) and end column (`RunHistory` grouped "Needs me · Waiting on others · Done · Saved drafts", then a `CapabilityMap` card).
  - **768**: a single column with history under a `ViewTabs` ("Now · History · What I can do").
  - **360**: the same as 768, with the composer pinned to the bottom above the mobile nav.
- **Copy rule.** The page explains in one sentence that this is the only surface that acts. The admin/principal "AI assistant" views and `/teacher/ai` stay as draft tools (B.ui finding 6). They get a one-line `Alert tone="info"`: "This tool writes drafts. To have AI do the work, ask Skoolee AI →", which opens the dock prefilled. That ends the "three type-to-AI surfaces" confusion without deleting anything.

### 2.6 `ConfirmCard` and `HandOffCard` (inline in dock, `/ai` and build)
Specified in §4. Both are `Card variant="featured"` with `ExecutionPreview` embedded.

### 2.7 `BuildReport`: receipts and remaining tasks after the questionnaire
Specified in §5.7. It is a full-page route, `/welcome/report/{jobId}`, linked from Today forever, and it is printable.

### 2.8 Degradation at 320 px
- All three column systems collapse to one column with `ViewTabs`, and the tab labels shorten ("Talk / Plan / Built").
- `TimetableGrid` becomes a day carousel (one day column, swipe or prev/next buttons, with the current day selected), so cell text is never truncated below 12 px.
- `RosterLedger` rows become stacked two-line cards.
- Chips wrap and never scroll horizontally. Long chip labels wrap to two lines rather than truncate.
- The companion drops to the 40 px head crop. The full body appears only in the greeting and the final "built" moment.
- Confirm buttons go full width and are sticky at the bottom of the card while the preview scrolls. The preview counts stay visible in the sticky bar ("Create 12 classes"), so the button never confirms something off screen.
- `ExecutionPreview` lists show 3 items and "Show all 12" (the operation-specific detail components at `execution-preview.tsx:15-25`).

---

## 3. Interaction model and state choreography

### 3.1 Principles
1. **The client never drives execution.** Today the browser posts `advance` every 600 ms while RUNNING (`automatic-workspace.tsx:54`), and that is what makes the job execute. In the new model the client only **observes** (a poll every 1.5 s while the run is visible, or SSE) and **acts** with explicit commands: `answer`, `confirm`, `pause`, `resume`, `cancel`. The worker advances class A steps. Class B steps never advance without a bound confirm. Class C steps finish by handing off.
2. **One current ask.** At most one question or one confirmation is in front of the user at a time. Other runs that need attention queue in the dock's "Needs me" group.
3. **Narration is text first.** The companion's speech bubble is the polite live region, the same pattern as `GuideStage.tsx:253` (`role="status" aria-live="polite" aria-atomic`). Poses are decoration (`AiGuide` is `aria-hidden`, `AiGuide.tsx:13`).
4. **Receipts gate celebration.** The `celebrate` pose, confetti (`GuideStage.tsx:169-174`) and the green "Done" stamp may play only when the run outcome is `executed` and every receipt has been fetched.

### 3.2 Poses (extends `AiGuide`'s `pose` union, `AiGuide.tsx:12`)
Today: `wave | think | ready`. Add `listen` (head tilt with an open notebook prop: needs a detail), `present` (holds a card forward: confirm), `build` (role tool in motion: running), `wait` (holds a sealed envelope, looks toward the end edge: awaiting another approver), `puzzled` (hand on chin: blocked or unsupported), `celebrate` (receipt-gated). Each pose is one CSS state like the existing `.guide[data-pose=…]` rules (`guide-stage.module.css:11-20`), with props per role from `RoleGuideProp`. In reduced motion every pose is a static frame, and the entrance and continuous motions are off, matching `guide-stage.module.css:83`.

### 3.3 Every state the UI renders

The engine today has `RUNNING | WAITING_INPUT | PAUSED | COMPLETED | FAILED | BLOCKED` (`schema.ts:32`) and outcomes `executed | answered | plan_saved` (`schema.ts:28`). B.decisions T1 adds `WAITING_CONFIRM` and outcome `awaiting_approval`. The UI derives one `CompanionPhase` from run state plus step state:

| `CompanionPhase` | Derived from | Pose | Launcher ring | EN copy (tone: calm, specific, first person, no exclamation marks) | AR / UR note |
|---|---|---|---|---|---|
| `composing` | no run | wave | none | "What would you like done? I can work on anything on this page." | AR: "ماذا تريد أن أنجز؟". UR: "کیا کام کر دوں؟". Use the polite verb forms; avoid machine-like passive voice. |
| `planning` | RUNNING, no plan yet, or re-planning | think | arc (indeterminate) | "Working out the steps…" + the user's request quoted once | Never translate "steps" as "actions taken". AR "أرتب الخطوات…", UR "مراحل ترتیب دے رہا ہوں…" |
| `plan_ready` (questionnaire, or ≥3 steps) | plan persisted, no step started | present | amber | "Here's my plan: 9 steps. 4 run on their own, 3 need your OK, 2 go to Sana." | Counts through `Intl.PluralRules` (Arabic has six plural forms; Urdu two) |
| `needs_detail` | WAITING_INPUT | listen | amber | "One thing first: which Ayesha in 7B?" (the question is always one line, and the reason sits under it in muted text: "Two students match.") | Keep names in their original script; never transliterate |
| `confirm_step` | WAITING_CONFIRM | present | amber | Card title: "Create 12 classes for 2026–27?" Button: "Create 12 classes" | The button label is the verb plus count plus object, in the user's language. AR verb first; UR verb last ("12 کلاسیں بنائیں") |
| `running_step` | RUNNING with `pending` executing | build | arc (step n/N) | "Creating 12 classes…" then on receipt "12 classes created." | Use the progressive aspect; never the perfect tense before the receipt |
| `paused` | PAUSED (user or 30-step cap) | ready | none | "Paused after 18 steps. Nothing is half-done: each finished step has its receipt." + **Continue** | |
| `blocked_unsupported` | BLOCKED + reason `UNSUPPORTED` | puzzled | none | "I can't do *issuing certificates* for you yet. You can do it on Documents →" | Never "forbidden". Name the page in the local nav label |
| `blocked_not_your_role` | BLOCKED + `ROLE_CEILING` | puzzled | none | "Fee posting belongs to the accountant. I can prepare it and send it to Sana." | "who does this" answers (T13) |
| `blocked_access_changed` | FAILED via worker "access changed" (`worker.ts:18-21`) | puzzled | none | "Your access changed while I was working. I stopped. Ask your admin, then continue." | |
| `blocked_credits` | `AICreditError` 402 | ready | none | "Your school's AI credits ran out. What's already done is saved; I'll pick up here when credits are added." (neutral, per G51, `openai.ts:441-452`) | Never mention a price |
| `blocked_policy` | APPROVAL_SEPARATION_REQUIRED | wait | envelope | "Your school requires a second person for this. I've sent it to Bilal (Principal)." (turns the dead end at `service.ts:81` into a hand-off) | |
| `failed_retryable` | FAILED other | puzzled | amber | "That step didn't go through: the server said *rooms must have a number*. Nothing was saved for this step." + **Try again** / **Change details** | Server `SchoolAiError` text must be localized (B.ui finding 9); until it is, show the localized generic sentence and put the raw message under "Details" |
| `awaiting_approver` | outcome `awaiting_approval` or step `handed_off` | wait | envelope | "Ready for Sana's approval. I'll tell you when she decides." | Use "approval" (AR "اعتماد", UR "منظوری"); never "done" |
| `returned` | approver returned the item | listen | amber | "Sana sent this back: 'Use the October fee group.' Want me to fix it?" | Quote the approver's note verbatim in their language |
| `done_executed` | COMPLETED + `executed` + all receipts | celebrate (once) → ready | none | "Done. 3 things changed: 12 classes, 48 subjects, 8 periods. Receipts below." | |
| `done_partial` | COMPLETED with some steps C or skipped | ready | envelope if C pending | "Done what I could: 5 of 7. 2 are with Sana." | Never "Completed" alone |
| `done_answered` | COMPLETED + `answered` | ready | none | "Here's what I found." (no stamp, no "done") | |
| `done_plan_saved` | COMPLETED + `plan_saved` | ready | none | "I saved this as a plan; nothing in the school changed." | Spell out the "nothing changed" sentence in every language |
| `cancelled` | new `cancel` action | ready | none | "Stopped. Steps already finished stay, with receipts; nothing else will run." | |

### 3.4 UI contracts the engine must honour (needed for this design; owned by the architecture track)
```ts
type CompanionRunView = {
  id: string; version: number; status: "PLANNING"|"RUNNING"|"WAITING_INPUT"|"WAITING_CONFIRM"|"PAUSED"|"COMPLETED"|"FAILED"|"BLOCKED"|"CANCELLED";
  outcome?: "executed"|"answered"|"plan_saved"|"awaiting_approval"|"partial";
  request: { text: string; source: "composer"|"questionnaire"|"suggestion"; page?: string };
  plan?: { version: number; steps: StepView[]; estimate: { steps: number; credits: number; confirms: number; handOffs: number } };
  ask?: { stepKey?: string; field: string; prompt: string; reason?: string; widget: AskWidget };   // §6.3
  blocked?: { code: "UNSUPPORTED"|"ROLE_CEILING"|"ACCESS_CHANGED"|"CREDITS"|"POLICY"|"SUBSCRIPTION"; capabilityLabel?: string; owner?: ApproverRef; href?: string };
  creditsUsed: number;
};
type StepView = {
  key: string; capability: string; title: string; lane: Lane; class: "A"|"B"|"C";
  status: "planned"|"preparing"|"awaiting_confirm"|"running"|"receipt"|"handed_off"|"approved_elsewhere"|"returned"|"skipped"|"failed";
  dependsOn: string[]; preview?: SchoolAiExecutionPreview | CapabilityPreview; previewHash?: string; pendingKey?: string;
  receipt?: { ids: string[]; counts: Record<string, number>; href: string; at: string; domainReceiptId?: string };
  handOff?: { approver: ApproverRef; queueHref: string; notifiedAt?: string; openedAt?: string; decidedAt?: string; note?: string };
  evidence: { field: string; quote: string; source: "request"|"answer"|"chip" }[];
};
type ApproverRef = { role: UserRole; displayName?: string; seat: "filled"|"vacant"; isRequester: boolean };
```
The class is static, read from the registry and never from model output (B.decisions T1). `receipt` is present only when a write committed. The UI refuses to render the "receipt" status without it, as a dev-time assertion. When the user is looking, page lists listen for a `companion:receipt` DOM event carrying `{ capability, ids }` and revalidate (`router.refresh()` or their SWR key). That is how the row "lands" behind the dock.

### 3.5 Choreography timings (normal motion)
- Turn bubble: fade and 4 px rise, 180 ms.
- Plan card arrival: 240 ms, staggered 60 ms, at most 8 animated at a time (the rest appear at once).
- Tile placement on receipt: 320 ms ease-out, with the receipt stamp at +120 ms.
- Envelope into the tray: 400 ms along a short arc. Reduced motion: a 120 ms opacity fade for all of these.
- No looping animation runs longer than 9 s (the showcase pattern at `GuideShowcase.tsx:71-77`). Everything pauses when `document.visibilityState !== "visible"`.

---

## 4. Confirmation (class B) and hand-off (class C)

### 4.1 Class B: `ConfirmCard`
```ts
type ConfirmCardProps = {
  step: StepView;               // status "awaiting_confirm", with preview, previewHash, pendingKey
  runVersion: number; language: Language;
  onConfirm(binding: { runId: string; version: number; stepKey: string; pendingKey: string; previewHash: string }): Promise<void>;
  onChange(): void;             // back to needs_detail with this step's fields as chips
  onSkip(): void;               // marks the step skipped; dependants are re-planned or marked skipped
};
```
**Anatomy.**
- Heading: a question naming the effect: "Create 12 classes for 2026–27?"
- The **effect line**: what changes, where and for whom, as a sentence with counts: "Adds 12 classes (Grade 1–6, sections A and B) to Main Campus. No students or teachers are changed."
- `ExecutionPreview` (the existing component), collapsed to 3 rows with "Show all".
- **Warnings** from the preview, shown above the button and never hidden.
- **Evidence chips**: "From your answer: *Grades 1 to 6, two sections each*". Tapping a chip jumps to that answer.
- Actions: primary **Create 12 classes** · secondary **Change** · tertiary **Skip this**.

**Why a bare "yes" is not enough, and what the user experiences.**
1. Confirmation is a press of the bound button only. Text typed in the composer while a `ConfirmCard` is open, in any language ("yes", "ہاں", "نعم", "ok go"), is **not** sent as a confirm. The companion answers locally, with no model call and no credit: "To go ahead, press *Create 12 classes* on the card. That way you approve exactly what you see." Focus then moves to the card's primary button, which pulses once (reduced motion: a 2 px focus ring only).
2. The button is **disabled until the preview has rendered** for this `previewHash`. When the run version changes underneath (another tab, the worker, permission drift), the button becomes **Preview changed: review again**. The changed rows are highlighted using the preview's create/keep dispositions, and a new press binds the new hash. This mirrors `STALE_WORKSPACE_VERSION` / `STALE_EXECUTION_PREVIEW` (`execution.ts:157`; `run-service.ts:59`).
3. For **high-blast B steps** (static flag on the capability: more than 50 records, or staff invitations), the card adds one `Checkbox`: "I've checked the list". Confirm stays disabled until it is ticked. This is not a typed phrase, which would hurt accessibility and RTL typing; it is a deliberate second act.
4. **Questionnaire batching**: a lane may present its steps as one card ("Teaching: 48 subjects, 8 periods, 14 rooms") only when all of them already have previews. The confirm then carries an array of bindings, each still exact. Dependent steps whose previews need earlier receipts get their own card later. The admin run therefore has **4–6 confirm moments**, not 23. That cost is real and intentional.
5. After the press: the card collapses into a one-line `running_step` row ("Creating 12 classes…") and then into a `ReceiptSlip`.

### 4.2 Class C: `HandOffCard` (requester side)
```ts
type HandOffCardProps = {
  step: StepView;   // status handed_off | approved_elsewhere | returned
  language: Language;
  onOpenQueue(): void;    // deep link to the domain approval surface (finance ops, approvals, publication, pickup)
  onWithdraw(): void;     // archives the draft; only before the approver opens it
  onFix(): void;          // when returned: opens needs_detail seeded with the approver's note
};
```
**Anatomy.**
- Heading: "Ready for Sana's approval".
- A sealed-envelope illustration (`WaxSeal` with finish `"foil"` is reserved for executed receipts; a hand-off uses an unsealed outline seal, so the two never look alike).
- The same effect line and `ExecutionPreview`.
- **Who** (`ApproverRef`): "Sana Malik · Accountant · Main Campus". Rules:
  - Seat vacant: "No accountant on this campus yet. You approve this in Finance operations". The button goes to the requester's own approval screen, and the AI never self-approves (T1).
  - Separation required: "Your school needs a second person. Bilal (Principal) will approve."
- A **status timeline** with four honest stages, each shown only when it is true:
  1. **Prepared**: the draft and preview are saved, with the record id.
  2. **In Sana's queue**: a notification row exists for Sana. This is not "sent" or "delivered".
  3. **Opened by Sana**: shown only when her approval surface recorded a view. If that signal does not exist, this stage is omitted rather than faked.
  4. **Approved** (receipt from the domain) or **Returned** (with the verbatim note).
- Actions: **Open in Finance** (or the relevant surface) · **Withdraw** (until opened).

**Class C capabilities** (from B.decisions T1/T4/T5/T6): `finance.apply_operation`, `fees.generate_invoices`, `communications.queue_announcement`, `timetable.publish_reviewed`, `students.promote_enrollment`, `academics.transition_year`, `attendance.record_register`, `operations.record_risk_decision`, and every future publish, access-grant, delete or archive adapter. Results publication and report sending are never registry operations; the hand-off is a deep link to that exact version's publication page (T4). Exam papers deep-link to `/ai/studio` (rule 21).

One classification point needs a decision. B.decisions puts `attendance.record_register` in class C, while README §3.1 decision 6 calls a teacher's prepared register class B. My design supports both. Default: a teacher's own-class register is **B with the high-blast checkbox**, and the operator/principal bulk register is **C**. Whichever the founder picks, it is set statically in the registry.

### 4.3 Class C: what the approver sees (`HandOffReview`, inside the existing approval surfaces)
- **Notification.** One in-app notification on the existing channel ("Ayesha asked Skoolee AI to prepare a payment of Rs 12,000 for Bilal Ahmed's October fee. Review →"). The approver's companion launcher also gets the berry count badge, and their dock's "Needs me" group lists it first. No outbound email or WhatsApp is introduced by this design.
- **In the domain screen**, a `HandOffOriginStrip` is added above the existing approval UI (finance operations panel, approvals view, publication page). It shows:
  - "Prepared by Skoolee AI for **Ayesha Raza (Admin)** · 23 Oct, 10:42".
  - Her request quoted verbatim, in its original language, with an "as typed" label.
  - **Evidence chips** linking each value to the quote ("Rs 12,000 ← '12,000 cash'"; "October ← 'for October'").
  - "AI credits used: 2".
  - The approve and return controls of **that domain**, unchanged. Money and self-approval keep `ConfirmAction` with `requireReason` (`confirm-action.tsx:16-41`, reason ≥ 10 chars).
- **Return with note**: a `Textarea`. The note goes back to the requester's run as `returned` with the text verbatim.
- The approver may also open their own dock on that page and ask "what's different from last month?". That is a read (class A) and does not touch the approval.

### 4.4 Class A
No card. The step shows as a running row and then a `ReceiptSlip`. Class A writes (own profile, private plan, catalogue append, call log) still get receipts, and get an **Undo** link only where an inverse capability exists in the registry. The UI never invents an undo.

---

## 5. The per-role questionnaire framework

### 5.1 Definition format (static, versioned, per role)
```ts
type InterviewDefinition = { role: UserRole; version: number; sections: InterviewSection[] };
type InterviewQuestion = {
  key: string;                       // typed answer key (replaces the 18 free strings, schemas.ts:23-34)
  type: QuestionType;
  prompt: Localized; why: Localized; // "why" is one line explaining what the answer produces
  produces: string[];                // capability keys it feeds (shown as the ghost card on PlanCanvas)
  required: boolean; skippable: boolean; deferLabel?: Localized;
  prefill?: PrefillRule; showIf?: Condition;
  answerSchema: ZodSchema;           // structured, so evidence is the chip value, not a substring match
};
type QuestionType =
  | "confirm-known"   // Known-fact card stack: tick or edit
  | "chips-single" | "chips-multi"   // Button variant="choice", aria-pressed
  | "count-stepper"   // e.g. sections per grade, with +/- IconButtons and an Input
  | "grade-matrix"    // grades × sections builder: rows are grades, chips are section letters
  | "subject-matrix"  // per grade, multi-select subject chips from a locale/board seed list + "add"
  | "time-ladder"     // period builder: start time, period length, breaks; preview of the ladder
  | "week-toggle"     // 7 day toggles, prefilled from weekends
  | "roster-table"    // structured rows (paste from spreadsheet into a grid; columns typed); never prose
  | "record-picker"   // existing records (my classes, my children) with search
  | "money-lines"     // fee heads × grade with amounts in the school currency (formatMoney)
  | "free-note";      // optional context; never produces a record; labelled "for your notes only"
```
The answers are structured values, so each record's evidence is the chip value the user pressed. That fixes the brittle `evidenceQuote` substring test for setup (B.engine finding 5) and keeps students and staff out of prose. `roster-table` rows go through the `importBatch` review path (`students.ts:20-22`), never into a prompt as prose (B.ui finding 5).

### 5.2 Interaction rules
- **One question at a time.** The companion asks; the widget sits directly under the bubble. The answer collapses into a user-side "answer bubble" that reads as plain language ("Grades 1–6 · 2 sections each"), with **Edit** beside it.
- **Progress**: a section ribbon (for ADMIN: Your school · Classes · Teaching · People · Money · Messages) plus `Progress` with `valueText` "6 of 11". The count covers only questions that will be asked, so it never jumps backwards when a `showIf` hides some.
- **Skip vs. Later.**
  - **Skip** means "doesn't apply to us" (the step is removed from the plan).
  - **Later** means "I'll do it myself after" (it becomes a remaining task on the report, with a deep link).
  - Both are always visible on skippable questions. Required questions show neither, only **Why I need this**.
- **Return.** Save and exit at any point (as today, `guided-setup.tsx:177`). On return the companion says "Welcome back. We were on *Periods*." and the canvas shows the plan as it stands. The record version increments on every confirmed answer. A run already built against version *n* is not touched; re-building shows only the delta ("2 new subjects").
- **Free text escape hatch**: every chip question has "Something else…", which opens an `Input`. The AI may *propose* chip values from it, the way `SetupAnswerAnalysis` does today (`guided-setup.tsx:219`), but the user must press the proposed chips. Proposals are never auto-applied.
- **Confirm per key**: pressing **Next** on an answer is the confirm (it adds the key to `confirmedKeys`). Known-fact cards each need a tick, and an "all correct" button ticks all visible cards in one press.

### 5.3 Prefill rules (never ask what the system knows)
| Fact | Source | Shown as |
|---|---|---|
| School name, city, timezone, session label/dates, weekends | wizard `completeSetup` (`setup-service.ts:369-425`) | `confirm-known` |
| Country, currency | registration `LocalePolicy` (`register.ts:164-171`) | `confirm-known` (currency read-only; a change goes through settings) |
| Language | `user.preferredLanguage` | language chips at the top of the greeting (switches the UI live) |
| Campus | the invitation or seat | read-only header chip |
| Teacher's classes and subjects | allocations the admin's build created | `confirm-known` with "Something's wrong" → class C hand-off to the admin: "Ask Ayesha to change my allocation" |
| Parent's children | **verified** guardian links only (never unverified, rule 8) | `confirm-known`. A missing child → "Ask the school office" hand-off, never a self-link |
| Student's class | enrolment | `confirm-known` |
| Existing records on re-entry | live counts (`setup-journey-service.ts:10-41`) | "You already have 12 classes. Keep them?" |

### 5.4 The "build" moment
1. The last answer is pressed. The companion says "That's everything I need. Here's the plan." The canvas widens to `plan_ready`, showing the estimate footer and the three counts by class.
2. Primary **Build my campus** (role variants: "Set up my classes", "Set up my family home"). Secondary **Review answers**.
3. Pressing Build starts the run bound to `{record.id, version}` (the existing binding, `service.ts:43-48`) and reserves the estimated credits (T9). The stage transition is a 600 ms cross-fade from canvas to stage. The companion walks from the rail to the stage corner (reduced motion: it simply appears in the corner).
4. Class A steps play through. At each B gate the stage dims the other lanes and the `ConfirmCard` rises in the conversation column (phone: it overlays the stage as a sheet). C steps become envelopes flying into the `HandOffTray`.
5. Copy honesty: the wizard's promise "nothing applies until you approve it" (`src/app/onboarding/page.tsx:34`) is replaced with "Some things run on their own, like creating your classes. Anything about money, messages or access waits for the right person to approve it." The plan screen shows which is which before anything runs.

### 5.5 How it differs per role (question count, what it builds, what it hands off)
| Role | Questions (after known facts) | Builds (receipts) | Hands off / remaining |
|---|---|---|---|
| **ADMIN / CAMPUS_ADMIN** | 9–11: grade-matrix, subject-matrix, time-ladder, rooms (count-stepper + optional names), staff roster-table (or Later), students (roster-table / import / Later), fee heads (money-lines), first priority (chips), communications defaults (chips). `migrationSource` only on the import path | classes, subjects, periods, rooms, timetable drafts (when the academic seat allows), staff invitations (pending), students (via review), communications preferences | fee structure → accountant (or self in Finance when the seat is vacant); timetable publication → principal; invitations "pending until accepted"; anything unsupported → deep links. This is the longest build (4–6 confirms) |
| **SUPER_ADMIN** | 5: campuses (repeatable card: name, city), who leads each (email per campus), group standards (grading-scale chips, fee policy note), shared calendar (chips), brand (logo confirm-known) | campuses (`campus.create`, B) | campus admin invitations → People & access (class C, access grant); standards become POLICY drafts for review; then: "Each campus admin gets their own questionnaire when they first sign in." No campus writes beyond creation (rule 19) |
| **PRINCIPAL** | 6: grading policy (chips plus a scale editor), assessment calendar (chips: termly/monthly), period structure confirm (known from admin), cover rules (chips), report-card cadence, Exam Studio intro | assessment policy draft, exam session plan draft (`exams.create_session_plan`, B) | timetable publication (C, own approval surface); papers → "Open Exam Studio" deep link only |
| **TEACHER** | 4–5: confirm my classes and subjects (known), when do you take attendance (chips: first period / each period), how do you mark (chips: marks / grades / rubric), homework rhythm (chips), my free periods (from the timetable, confirm-known) | own preferences, register shortcuts per class on Today, private lesson-plan slots (`personal.save_plan`, A), homework defaults (when the adapter exists) | wrong allocation → admin hand-off; nothing publishes. Short: about 90 seconds |
| **ACCOUNTANT** | 5: fee heads per grade (money-lines, prefilled from the admin's draft if present), due day (chips), late-fee rule, receipt numbering prefix, reminder rhythm | fee structure (as approver of the admin's draft, or their own draft) | invoice generation (C, Finance); reminders to families (C, communications) |
| **LIBRARIAN** | 4: loan period (chips 7/14/21), max loans per member (stepper), fine rule (chips / none), catalogue start (import CSV / add as I go) | library settings, catalogue titles (`library.create_books`, A) | members come from the roster (no creation) |
| **RECEPTIONIST** | 4: desk hours (time-ladder lite), visitor badge (chips), pickup gate times, enquiry sources (multi-chips) | front-desk preferences | certificates and admissions stay manual until the adapters exist (the report says so) |
| **PARENT** | 3–4: confirm my children (known, verified only), language and channel per child (chips: app / SMS / WhatsApp, where the school supports them), what to tell me about (multi-chips: absence, fees due, results, events), who may pick up (Later → Pickup page) | guardian channel preferences (`communications.set_guardian_channel_preference`, A), a home layout ordered by children | pickup authorisation is an access grant, so it is a hand-off to `/parent/pickup`'s own issue flow, prefilled. About 60 seconds |
| **STUDENT** | 3: subjects I want help with (chips from my class), when I study (week-toggle plus time chips), a goal (chips plus optional note) | private study plan (A), portfolio goal (`pathways.save_goal`, A) | nothing handed off |
| **APP_OWNER** | none (orientation only) | none | a dock with platform reads; tenant work needs a support grant (rule 19) |

Tone differs too. The admin companion is brisk and administrative ("Let's get your campus standing"). The teacher's is collegial ("Let's make your Monday easier"). The parent's is warm and short ("Two minutes, and your home page will show what matters for Ali and Sara"). The student's is encouraging but never infantilising. All the copy lives in a new `companion-copy.ts` per role, in the same `Localized` triple pattern as `role-guide-copy.ts:5-23`.

### 5.6 Remaining-tasks list inside the interview
At any time the canvas footer shows "Later (3)", the questions deferred so far, rendered with `FollowUpList` (`follow-up-list.tsx:15`; tone brand or berry, never warning, because these are choices, not errors).

### 5.7 `BuildReport`: receipts and remaining tasks
- **Route** `/welcome/report/{runId}`, also reachable from the Today card. Heading through `InkHeading`: "Your campus, as built".
- **Three columns** (360: three `ViewTabs`):
  1. **Built**: one `ReceiptSlip` per executed step (counts, timestamp, foil `WaxSeal`, an **Open** link to the real page, such as Classes & subjects).
  2. **Waiting on others**: `HandOffCard`s with live status.
  3. **Still to do**: deferred questions, unsupported items ("Not connected to AI yet: Fee reminders. Do it on *Reports & reminders* →"), invitation acceptances ("3 of 5 teachers haven't accepted yet").
- **Footer**: "AI credits used: 9 (estimate was 9)" · **Print / save PDF** (print stylesheet) · **Ask about this** (opens the dock with the report as context).
- The Today card ("AI setup pending", `dashboard.ts:73-85`) keys off this run's outcome, not off the dead `SETUP_GENERATION_V1` (B.ui finding 4).

---

## 6. Free-form AI Workflows surface

### 6.1 `Composer`
```ts
type ComposerProps = { language: Language; disabled?: boolean; context?: PageContext; onSubmit(text: string): void; maxLength?: number /* 4000 */ };
```
- A `Textarea` that grows to 6 lines, with a send `IconButton`. Enter sends; Shift+Enter adds a new line (IME-safe: no send during composition, which matters for Urdu and Arabic keyboards).
- The placeholder is role- and page-aware: "Ask me to issue, return or renew a book…".
- While a `ConfirmCard` is open, the composer stays enabled for questions, but affirmative-only text is intercepted locally (§4.1).
- There is no microphone or attachment button (SKO-460). A `Tooltip` slot is reserved for later.

### 6.2 Suggestions per role (static, from the registry, never generated)
`SuggestionRow` shows 3 chips chosen by: (a) the current page's capabilities for this role, (b) recent successful runs, (c) "Needs me" items. Examples:

| Role · page | Chips |
|---|---|
| TEACHER · `/teacher/attendance` | "Take 7B's register" · "Mark late arrivals" · "Who was absent twice this week?" |
| TEACHER · `/teacher/assignments` | "Set homework for 8A Science" · "Extend Ali's deadline to Friday" |
| LIBRARIAN · Lending desk | "Issue a book" · "Return a book" · "What's overdue?" |
| RECEPTIONIST · Visitors | "Sign in a visitor" · "Log a call" · "Today's pickups" |
| ACCOUNTANT · Collect | "Record a payment" · "Who owes October fees?" |
| PARENT · Home | "Tell school Sara is sick today" · "Book a meeting with Ali's teacher" · "Text me about fees" |
| STUDENT · Work | "Plan my week" · "What's due Friday?" |
| ADMIN · Today | "Add a section to Grade 4" · "Invite a teacher" · "Show what's unfinished from setup" |
| SUPER_ADMIN · Campuses | "Add a campus" · "Who leads each campus?" |

Several of these depend on adapters that do not exist yet (teacher register, parent leave request, visitor sign-in; B.roles §c). **Rule:** a chip appears only when its capability is in the registry for this role. Until then the "What I can do here" drawer lists it under "Not yet" (§6.6). The demo set is therefore whatever has shipped.

### 6.3 Missing-detail questions (`AskWidget`)
The engine's `ask` carries a field and a widget type derived from the adapter's input schema, never free text alone:
- `entity-pick`: real records as chips with disambiguators ("Ayesha Khan · 7B · Roll 14" / "Ayesha Noor · 7B · Roll 22"), plus "Neither". These are labels for display on the client. The model sees pseudonymised tokens only (rule 9, T11).
- `date-pick`: chips "Today · Tomorrow · Fri 30 Oct · Pick a date…" (`DatePicker`).
- `amount`: an `Input` with currency adornment, formatted through `formatMoney`.
- `choice`: enumerated chips.
- `text`: last resort, one line.
A chip answer is recorded as structured evidence (`source: "chip"`), which removes the substring brittleness for that field.

### 6.4 Progress
- Short runs (1–2 steps) render inline in the thread: request bubble → (ask) → `ConfirmCard`/running row → `ReceiptSlip`.
- Runs of 3 or more steps get a compact `StepList` with a status icon and verb per step: planned (hollow circle), preparing (spinner, "Preparing preview…"), awaiting you (amber dot), running (spinner, "Saving…"), receipt (filled tick plus count), handed off (envelope), skipped (dash), failed (alert).
- On `/ai` the same run can expand into a mini `BuildStage` with the generic tiles.

### 6.5 Receipts (`ReceiptSlip`)
`{ title, counts, at, href, domainReceiptId?, undo?: { capability, label } }`. A slip is a small `Card` with a foil `WaxSeal` (22 px, the way it appears on stage cards, `GuideStage.tsx:246`), the counted effect ("1 loan created · due 30 Oct"), **Open** (deep link) and a **Details** disclosure (ids in `dir="ltr"`, timestamp in the locale, credits). A slip renders only from `step.receipt`. Drafts get a **Draft slip**: dashed edge, no seal, "Saved as draft · nothing in the school changed".

### 6.6 History and "What I can do here"
- **`RunHistory`** replaces the 20-item `details` list (`automatic-workspace.tsx:56`; `service.ts:36`). It has groups and filters, each row shows the first request line, a phase badge, counts, and time, and the list is cursor-paginated. Reopening a run shows its thread and, when it is open, the current ask.
- **`CapabilityMap`** (drawer from the dock header, card on `/ai`) is generated from the registry for this role and campus:
  - **Here** (this page): grouped verbs with their class tag ("Issue a book · You confirm").
  - **Elsewhere**: other pages.
  - **With approval**: class C items naming the approver role.
  - **Not yet**: the role's nav features with no adapter, with a link to the page ("Certificates: do it on Documents").
  - **Not for your role**: a short list with who does it.

  This is the "publish a per-role what-AI-can-do list" called for in B.decisions T2. Every `UNSUPPORTED` block also records a structured "asked for" event, so product learns what to build next (B.engine finding 12).

---

## 7. Accessibility and the design-system gate

**Keyboard.**
- The dock opens with **Alt+J** (Option+J on macOS). Shortcut conflicts with existing app shortcuts and screen readers must be checked before this binding is final; `/` is not used because it would collide with typing. The launcher is always in tab order after the main content, so the shortcut is optional.
- **Esc** closes the dock or sheet and returns focus to the launcher. `ModalSurface` already does this (`modal.tsx:392` `useDialogBehaviour`). The desktop side sheet, which has no modal, gets the same return-focus helper.
- Chips are `Button`s with `aria-pressed` in a `role="group"` labelled by the question. Arrow keys move within the group (roving tabindex), and Space/Enter toggles.
- The matrix widgets (grade-matrix, subject-matrix, time-ladder) are grids of native inputs with row and column headers, never canvas.

**Focus choreography.**
- When the user starts an action (press Build, send a request), focus follows the run: `needs_detail` and `confirm_step` move focus to the question heading or the card heading (`tabIndex={-1}`, the same pattern as `GuideShowcase.tsx:65` / `guided-setup.tsx:176`).
- When a background run changes state, focus is **never** moved. Only the launcher ring changes and the peek chip announces politely.
- After a confirm, focus goes to the resulting row's status text. After the dock closes, focus returns to the launcher. After a deep link to an approval surface, that surface's heading takes focus.

**Screen readers.**
- One polite live region for narration per surface, with assertive used only for `failed_retryable` and `blocked_*`, through `Alert live="assertive"` as already used (`guided-setup.tsx:221`).
- Tiles are lists (`ul` / `li`) with text such as "Class 4B, created", not decorative divs.
- The `TimetableGrid` is a real `table` with `th scope`.
- The companion and all stage art stay `aria-hidden`.
- Progress uses `Progress` with `valueText` (`progress.tsx:14-28`).
- The class tag is spoken through the badge text, not by colour.

**Reduced motion.** One `useReducedMotion()` hook, extracted from `GuideShowcase.tsx:32-54`. With it on: no walking, no flying envelopes, no confetti, poses are static frames, and tiles appear through 120 ms opacity. The build is fully understandable from text.

**Contrast and size.** Text ≥ 14 px for body (≥ 12 px only for metadata), 44 px targets, focus rings on the brand token. Never colour alone for class or status: every state has a word and an icon.

**Design-system gate (`npm run check:ui`, `tests/design-system/adoption.test.ts`).**
- Tokens only: no mapped hex. New SVG props use `var(--brand-*)` / `var(--berry)` like `GuideStage.tsx:170-173`, even though the existing guide keeps two skin-tone hexes.
- No tiny px font sizes, no `font-black`, no `sonner` imports (use `toast` from `ui/toast.ts:128`), no `title=` tooltips (use `Tooltip`/`InfoTip`).
- Logical properties only. Run `scripts/ui-token-codemod.ts` on violations.
- Every interactive element carries a `data-companion-*` anchor (`data-companion-launcher`, `data-companion-confirm`, `data-companion-step="<key>"`, `data-companion-phase`) for Playwright, because the current component has none (README §4.4).
- New CSS lives in `companion.module.css` and reuses `.sk-ink-cover`, `.sk-panel`, `.sk-follow-up`.

**Languages.** EN/AR/UR ship together. Server error messages need localisation keys (B.ui finding 9). Model-produced text (step titles, questions) is replaced wherever possible by **registry-owned localized titles** with slot values ("Create {count} classes"), so the UI is not at the mercy of the model's language compliance.

---

## 8. Honest-progress rules (binding for the UI)

1. **No receipt, no done.** The "receipt" status, the foil seal, the "Done" heading and the celebrate pose all require `step.receipt` / outcome `executed` (rule 15, `validation.ts:12-17`). A dev assertion throws if a tile renders as placed without one.
2. **Present progressive until committed.** "Creating…" and "Saving…" stay until the receipt arrives; the past tense appears only after it.
3. **Queued is not delivered.** Announcements: "Queued for 214 families · 9 skipped (no consent or contact)" (`announcements-service.ts:65-84`). Never "sent". Delivery counts appear only from delivery receipts, and the slip says "Delivery report updates as messages go out".
4. **Pending is not done.** Invitations read "Invited · waiting for acceptance". Guardian links read "unverified". A hand-off is "In Sana's queue", never "Sent to Sana" unless a notification row exists.
5. **A plan is not an action.** `plan_saved` and draft slips say "nothing in the school changed" in every language.
6. **A read is not a write.** `answered` runs show no stamp and no count of changes.
7. **Partial is named.** "5 of 7 done · 2 with Sana" instead of "Completed".
8. **Estimates are labelled** "estimate" (credits, steps) and are reconciled on the report.
9. **Failure says what was saved.** Every failed or blocked state includes the sentence "Steps already finished keep their receipts" or "Nothing was saved for this step", whichever is true.
10. **No implied speed.** No fake progress bars. The progress arc counts receipts out of planned steps, and the indeterminate state is used while planning.
11. **No claim words.** The copy avoids "first", "only", "autonomous", "instant" (rule 24). "Built", "prepared", "waiting", "estimate" are fine.
12. **Demo honesty.** In the demo tenant, a persistent `Badge` reads "Demo school · synthetic data". If the AI release gate is closed (`ai-release-evaluation.ts:3-7`), the prototype/no-key mode label stays visible.

---

## 9. The LEAP five-minute demo arc

Setup: a seeded synthetic school ("Al-Noor Grammar, Lahore"); three devices (laptop at 1440 as admin, tablet at 768 as accountant, phone at 390 as teacher, then parent); EN with one switch to Urdu. The script uses only capabilities that have shipped adapters by then. Swap the beats if, for example, the teacher register adapter is not ready.

| Time | Screen | Beat |
|---|---|---|
| 0:00–0:30 | Laptop · `CompanionInterview` greeting | The admin's companion waves in its admin outfit. Known-fact cards: school, city, timezone, session, weekend. Tap "All correct". *"It never asks what it already knows."* |
| 0:30–1:30 | Interview questions | Grade-matrix (1–6 × A/B) in two taps; subject-matrix from a Pakistan board seed list; time-ladder (8:00, 40 min, break after 4th); staff roster-table pasted from a sheet; fee heads (money-lines). The Plan canvas grows lanes as each answer lands, with ghost cards for skipped items. |
| 1:30–2:00 | `plan_ready` | "23 steps · 9 credits (estimate) · 4 need your OK · 2 go to others". Press **Build my campus**. |
| 2:00–2:50 | `BuildStage` | Class spines drop onto the shelf after one `ConfirmCard` (**Create 12 classes**). The presenter types "yes" into the composer to show it does nothing; the companion points to the button. Subjects, periods and rooms land with receipts. The timetable grid fills, marked Draft. Invitations stack as "pending". The fee structure flies into the envelope "With Sana Malik · Accountant". |
| 2:50–3:30 | Tablet · accountant | The launcher shows a berry badge "1 for you". Open: the Finance screen with `HandOffOriginStrip` (Ayesha's answers, evidence chips, credits). Approve through the existing `ConfirmAction`. Back on the laptop, the envelope turns into a sealed receipt. |
| 3:30–4:20 | Phone · teacher first login | The teacher companion (teacher outfit) confirms "7B Science, 8A Science" (known from the build), with three chip questions in 60 s. Lands on Today with register shortcuts. Opens the dock and types in Urdu "7B کی آج کی حاضری: سب حاضر سوائے علی اور سارہ". An entity-pick disambiguates Ali, then a prefilled register `ConfirmCard` (high-blast checkbox), confirm, receipt. The register list behind the dock shows the saved register. |
| 4:20–4:50 | Phone · parent | The parent companion: "Two minutes". Confirm children Ali and Sara, choose WhatsApp for absence and SMS for fees. Lands on a home that shows Ali's absence note from the teacher's register. |
| 4:50–5:00 | Laptop · `BuildReport` | "Your campus, as built": Built 18 · Waiting 1 (timetable publication with the principal) · Still to do 3 (invitations not accepted, fee reminders not connected yet). *"Everything you saw has a receipt."* |

Fallbacks: every beat has a pre-recorded run in the demo tenant, reopenable from `RunHistory`. If the network drops, the presenter reopens the completed run rather than faking one. `OfflineBanner` stays honest.

---

## 10. What is bold about this, and what it costs

**Bold.**
- **The receipt drives the animation.** The flagship spectacle (a school assembling) is honest by construction, because the animation is a view of receipts. It turns the PRD rule "animation never implies a server action completed before a receipt" (`prd-revised.md:82`) into the visual language itself.
- **One companion from the first second to every later page.** The same character greets you, interviews you, builds with you, waits with you for approvers and sits in the dock. The SKO-397 cast becomes the product's interface instead of a tour.
- **Confirmation is a physical act on the exact preview.** It is not a phrase. "Yes" demonstrably does nothing, which makes the safety model visible and demo-able.
- **Hand-offs read as characters waiting.** The envelope with a name and an honest four-stage timeline makes separation of duties feel like teamwork rather than a 403 (fixing the dead end at `service.ts:81`).
- **The per-role interview is mostly chips and matrices.** Typed answers become structured evidence, fixing two engine defects (brittle `evidenceQuote`, PII prose in prompts) from the UX side.

**Costs and constraints.**
- It depends on engine work that does not exist yet: a persisted plan with dependencies, `WAITING_CONFIRM`, outcome `awaiting_approval`, receipt-carrying step views, a poll/SSE read model, structured `ask` widgets, registry-owned localized titles, a cancel action, and a structured unsupported log. Without these the UI can only fake the build, and this design forbids that.
- Breadth is gated by adapters. For TEACHER, PARENT, RECEPTIONIST and LIBRARIAN the dock will mostly answer "not yet, do it on X" until their adapters ship (B.roles §c). The `CapabilityMap` makes that visible rather than hiding it.
- The admin build has 4–6 confirm moments. That is slower than "watch it all happen", but it is the only design consistent with rules 3 and 5.
- `ChatDock` must be refactored into a shared `DockRail`, which touches a surface owned by the chat work.
- Motion and RTL QA multiply the screenshot matrix: 3 languages × 3 widths × about 20 phases × reduced-motion on/off.

**Effort** (UI layer only; see the structured estimate): about 72 person-days for one experienced front-end engineer, paired with a designer for poses and illustration.


**Key decisions**
- The client never drives execution: replace the 600 ms auto-advance in automatic-workspace.tsx:54 with an observe-only read model (poll 1.5 s or SSE) plus explicit commands (answer, confirm, pause, resume, cancel).
- Build animation is receipt-driven: a tile is placed, stamped with the foil WaxSeal or celebrated only when step.receipt exists; drafts get a dashed, unsealed 'nothing changed' slip; a dev assertion enforces it.
- Class B confirmation is a press of a button bound to {runId, version, stepKey, pendingKey, previewHash} and labelled verb + count + object; affirmative text typed in any language is intercepted locally (no model call, no credit) and points to the button; a stale preview turns the button into 'Preview changed: review again'.
- High-blast class B steps (more than 50 records, or staff invitations) add one 'I've checked the list' checkbox instead of a typed phrase, to stay accessible and RTL-friendly.
- Questionnaire confirms are batched per lane only when every step in that lane already has a preview; dependent steps confirm later, so an admin build has 4-6 confirm moments by design.
- Class C hand-offs show a four-stage honest timeline (Prepared, In <approver>'s queue, Opened if that signal exists, Approved/Returned) and name the approver role and person; a vacant seat or separation-of-duties policy becomes a named hand-off instead of a failed job.
- Approvers act in the existing domain approval screens, which get a HandOffOriginStrip (verbatim request, evidence chips, credits used); no second approval surface is created inside chat.
- One companion across journeys: AiGuide gains poses listen/present/build/wait/puzzled/celebrate; the same character runs the first-login interview, the build stage and a CompanionDock in RoleShell that shares a DockRail with ChatDock.
- The per-role questionnaire is a typed InterviewDefinition (versioned, static) with structured question types (confirm-known, chips, grade/subject matrices, time-ladder, roster-table, money-lines, record-picker); answers are structured evidence and roster rows go through importBatch review, never prose to the model.
- Never ask what the system knows: wizard facts, locale, verified guardian links, teacher allocations and enrolment are shown as confirm-known cards; the academic year is no longer re-asked.
- Suggestion chips and the 'What I can do here' map are generated from the registry per role and page (never by the model); missing adapters appear under 'Not yet' with a deep link, and unsupported requests are logged as structured events.
- The draft-only AI views (admin/principal ?view=ai, /teacher/ai) stay and get one info line pointing to Skoolee AI as the only surface that acts.
- Registry-owned localized step titles with slot values replace model-written titles where possible, so EN/AR/UR does not depend on the model honouring the language.
- BuildReport (/welcome/report/{runId}) is the permanent receipts and remaining-tasks page (Built / Waiting on others / Still to do, plus estimate vs actual credits); the Today card keys off it instead of the dead SETUP_GENERATION_V1.
- attendance.record_register classification needs a founder decision: B.decisions puts it in class C, README decision 6 says class B; default proposed is a teacher's own-class register as B with the high-blast checkbox and the operator/principal bulk register as C, set statically in the registry either way.

**Risks**
- Engine dependency: the design needs a persisted plan with dependencies, WAITING_CONFIRM, the awaiting_approval outcome, receipt-carrying step views, structured ask widgets, cancel and an observe-only read model; if these slip, the Build stage cannot be honest and must not be shipped as a client-side simulation.
- Adapter coverage: for TEACHER, PARENT, RECEPTIONIST and LIBRARIAN most suggestions depend on adapters that do not exist (B.roles section c); the dock may mostly say 'not yet', weakening the demo unless slices land in time.
- The LEAP demo script assumes the teacher register adapter, fee structure adapter and guardian channel preference adapter; any missing one forces a beat swap.
- AI release gate is closed (ai-release-evaluation.ts:3-7); a live demo needs either a recorded educator evaluation or a visibly labelled prototype mode, otherwise it breaks the honesty rules.
- DockRail requires refactoring ChatDock positioning (chat-dock.tsx:87,149-153), which is owned by chat work; collisions on the phone with the mobile nav and chat sheet are likely without that refactor.
- The confirm-friction trade-off: 4-6 confirm moments in the admin build may feel slower than the founder's 'watch it happen' vision; batching is limited by preview dependencies.
- The 'Opened by approver' signal may not exist in the domain approval surfaces; the design omits that stage rather than faking it, so the timeline may look thin.
- Localization gaps: server SchoolAiError strings and client fetch errors are English only today (B.ui finding 9); without localization keys the AR/UR failure states fall back to generic text.
- The Alt+J shortcut may collide with screen reader or browser shortcuts; it needs verification before it is fixed.
- Motion budget on low-end Android phones (the target market): many simultaneous tile animations could jank; the cap of 8 concurrent animations and the reduced-motion path must be tested on real devices.
- QA matrix explosion: about 20 phases x 3 languages x 3 widths x reduced-motion on/off; it needs fixture-driven Playwright states (data-companion-* anchors) rather than live model runs.
- Questionnaire version drift: re-building after edits must show only the delta; if the engine re-plans from scratch, users may see duplicate-looking plans even though services KEEP existing rows.

**Effort**: UI layer only, one senior front-end engineer, with design support for poses and illustrations. Assumes the engine and registry contracts in section 3.4 are delivered by the architecture track and that the adapters exist for whatever the demo uses. Total about 72 person-days (about 14-15 weeks for one engineer, about 7-8 weeks for two working in parallel).

- CompanionProvider, CompanionDock, DockRail (including the ChatDock refactor), launcher rings and peek chip: 6 d
- AiGuide pose extension (listen/present/build/wait/puzzled/celebrate) across 11 role outfits and props, plus the RTL mirror and reduced-motion frames: 5 d (plus about 4 d of illustration design)
- Conversation thread, turn bubbles, Composer (IME-safe, local yes-interception) and SuggestionRow: 5 d
- AskWidget set (entity-pick, date-pick, amount, choice, text): 3 d
- ConfirmCard (binding, stale-preview state, high-blast checkbox, lane batching), embedding ExecutionPreview: 4 d
- HandOffCard (requester side) plus HandOffOriginStrip in 3-4 existing approval surfaces (finance operations, approvals, publication, pickup): 5 d
- ReceiptSlip, Draft slip and StepList: 2 d
- PlanCanvas (lanes, class tags, ghost cards, estimate footer; rail/drawer/tab densities): 4 d
- BuildStage with 9 tiles (ClassShelf, SubjectRack, PeriodLadder, RoomMap, TimetableGrid with the phone day carousel, RosterLedger, InviteTray, HandOffTray, WorkspaceDesk): 9 d
- CompanionInterview shell (persistence, progress, skip/later/return, delta rebuild) and InterviewDefinition typing: 4 d
- Question widgets (confirm-known, chips, count-stepper, grade-matrix, subject-matrix, time-ladder, week-toggle, roster-table with paste, record-picker, money-lines, free-note): 7 d
- Eleven role interview definitions plus companion-copy.ts in EN/AR/UR (content with a translator review loop): 5 d
- BuildReport page, print stylesheet, Today-card hook: 3 d
- /ai home: RunHistory with groups and pagination, CapabilityMap drawer, info lines on draft-only AI views: 4 d
- Accessibility, RTL and 320/360/768/1440 hardening pass (focus choreography, live regions, keyboard grids), check:ui compliance and the token codemod: 4 d
- Playwright state suites with fixtures and data-companion anchors, plus screenshot evidence in 3 languages at 2-3 widths: 5 d
- LEAP demo seed and run fixtures, plus rehearsal adjustments: 2 d

Not included: engine/registry work (plan persistence, WAITING_CONFIRM, read model or SSE, structured asks, localized registry titles), the adapters themselves, server error localization, the AI release evaluation, and the approval-surface 'opened' signal.


---

# U2-console: Calm Operator Console + ⌘K Ask Anywhere (UX/UI/interaction proposal for AI Workflows and the per-role first-login Setup Sheet)

# U2-console: Calm Operator Console + ⌘K "Ask Skoolee" anywhere

Design proposal, 23 October 2026. Read-only: no repository file was changed. It builds on Appendix B (B.engine, B.typedOps, B.roles, B.ui, B.qa, B.decisions) and Appendix A in `docs/product-review-2026-10/ai-automation-plan-2026-10-23/`, and on the surfaces that already exist: `src/components/automation/automatic-workspace.tsx`, `src/components/school-ai/guided-setup.tsx`, `src/components/onboarding/*`, `src/components/ui/*`, `src/components/role-dashboard/RoleShell.tsx`, `src/lib/navigation/role-nav.ts`, and the teacher palette in `src/components/teacher/command-palette.tsx`.

Labels used throughout: **A** = runs on its own, **B** = you confirm here, **C** = sent to the domain's own approval screen (B.decisions T1). Each capability has one fixed class in the registry. The model never chooses it.

---

## 1. The idea in one paragraph, and the three signature moments

Skoolee's AI should feel like a quiet control room, not a chatbot. You say what you want in your own words, from any page. Skoolee then lays out **a plan you can see before anything happens**: steps as cards, joined by lines that show what has to happen first. Every card says which feature it uses, what it will change (the exact records, with before and after counts) and who has to agree. Cards that can safely run on their own do so. Cards that change school structure wait for you to press a button that says exactly what it does ("Create 24 classes"). Cards that involve money, publishing, messages to families or access are prepared and handed to the person who approves them, on the screen they already use for that. Every finished card turns into a receipt that links to the real record. The same console builds a new user's workspace on first login. That user's role questionnaire becomes a structured **Setup Sheet** with a "what will be created" list, then one Go, then a board that fills in with receipts. Nothing on screen ever claims more than the server has proven.

**Signature moment 1: "Ask anywhere, with what you're looking at."** On any page, ⌘K (Ctrl+K), or the header's "Ask Skoolee" button, opens one palette. The page's subject comes along as chips, for example `7B` `Attendance` `Thu 23 Oct`. A teacher on the 7B register types "all present except Ali and Sara" and presses Enter. A docked console slides in from the end edge without leaving the page.

**Signature moment 2: "The Plan Board assembles, and the button says the count."** The board shows the plan before anything runs. Class A cards run and flip to receipts. A class B card shows a before/after table, and its button reads *"Mark 28 present · 2 absent"*. Typing "yes" never confirms anything. A class C card says *"Sent to Sana Malik (Accountant) for approval. Not applied yet"*. When she approves on the Finance screen, the card turns into a receipt and the requester's thread updates.

**Signature moment 3: "Setup Sheet → Go → the seal."** On first login, each role gets a different short sheet. Answers already known appear as settled rows marked "from your setup on 12 Oct" (`ConfirmedChoice`), so nothing is asked twice. Before Go, the sheet shows *What will be created*: "24 classes · 9 subjects per grade · 8 periods · 14 rooms → created now. 12 staff invitations → queued, someone must accept. 3 fee structures → sent to the Accountant. Students → import a roster (not from text)." After Go, the build board fills in. The Charter Desk wax seal (`SealSlot`, `src/components/onboarding/SealSlot.tsx:7-18`) is pressed only once every class A/B step has a receipt. If anything is still waiting, the seal slot stays open and the "Still with others" list says exactly what.

---

## 2. Screens and surfaces

All surfaces sit inside `RoleShell` (`src/components/role-dashboard/RoleShell.tsx:111`) and use its one page card. New components live in `src/components/console/`. Strings go through `useUiText()` (`src/components/locale/LocaleProvider.tsx:25`) with EN keys and AR/UR catalogues.

### 2.1 `AskPalette`: the global command palette (every page, every role)

**Purpose.** One way in for both "jump to" and "ask AI", with the page's context attached.

**Origin and reuse.** It generalises `TeacherCommandPalette` (`src/components/teacher/command-palette.tsx:41`, ⌘K at `:51-56`, built on `useDialogBehaviour` and `ROLE_NAV` leaves). That palette's results become the palette's **Jump** section for every console. Record results appear only for roles with `recordSearch` (`src/app/search/page.tsx:9-19`). `palette-bus.ts` becomes `src/components/console/ask-bus.ts` with `openAsk({ text?, chips? })`.

**Header search spec.** RoleShell deliberately has no header search field (`RoleShell.tsx:95`, "no header search, SPEC §4.1 H2"). The palette respects that: it is an `IconButton` in `RoleHeader` (sparkle icon, accessible name "Ask Skoolee (Ctrl K)"), not a text field. The founder still needs to sign this off (§10).

**Structure (one combobox):**
- Input placeholder: "Ask Skoolee or jump to…". Chips sit above the input (`ContextChipRow`).
- The result list has three groups:
  1. **Ask**: always first when the text has a verb or more than 3 words. Reads "Ask Skoolee: "<text>"" with its class hint, e.g. "Usually you confirm" when the best-matching capabilities are class B. This hint comes from a lexical match on the registry, not from the model.
  2. **Jump**: nav leaves the caller is allowed to open (`isVisible`, `leaves`).
  3. **Records**: recordSearch roles only.
- Typing `?` lists "What AI can do on this page" (§6.6), filtered to capabilities whose `domainHref` matches the current route.
- `@` starts an entity mention ("@Ayesha" becomes a `student` chip resolved against scoped data). This is also a PII measure (§6.2).

**Props.**
```ts
interface AskPaletteProps { role: UserRole; campusId: string | null; language: Language }
// Context is registered by pages, never scraped from the DOM:
function useAskContext(chips: AskContextChip[]): void   // page-level hook, cleared on unmount
type AskContextChip = { kind: "class"|"section"|"student"|"staff"|"invoice"|"feeGroup"|"book"|"copy"|"visitor"|"exam"|"date"|"page";
  id: string; label: string; source: "page"|"mention"|"user"; removable: boolean }
```

**States:** `closed | open-empty | open-typing | submitting | error`. Submitting creates the job and closes the palette. Focus moves to the docked console's thread heading.

**Layout.**
- **1440:** centred `Modal` size `md` (≈ 40rem), top-offset 12vh, 8 visible rows.
- **768:** same layout at 90vw.
- **360:** full-screen `ModalSurface fullscreen`. Input sits at the top and the chips scroll horizontally. The send button is sticky at the bottom, above the keyboard (StepDock rule, `StepDock.tsx:7-16`).

**RTL.** Chips flow from the start edge. The ↵ hint mirrors. ⌘K text stays `dir="ltr"` inside `<kbd>`.

**Primitives:** `Modal`/`ModalSurface`, `useDialogBehaviour`, `InputGroup` + `Input`, `Badge` (chips), `EmptyState`, `IconButton`, `Tooltip`.

### 2.2 `ConsoleDock`: the docked console on any page

**Purpose.** You can ask on the attendance page and confirm there without losing your place.

**Layout.**
- **≥1024:** an end-edge sheet 28rem wide (inline-end, so it sits on the left in RTL), non-modal. The page stays usable, with `aria-label="Skoolee console"` and `role="complementary"`. It holds a compact thread on top and a list-layout board below, plus "Open full console ↗" (`/ai/console/<jobId>`).
- **768:** a bottom sheet at 60% height, draggable to full height.
- **360:** a full-screen `ModalSurface`. Back closes it and returns focus to the invoker.

Only one dock can be open. A second ask while a job is active opens a "Start another request?" `ConfirmAction` and does not silently replace the current job.

### 2.3 `ConsoleWorkspace`: the full two-pane console (`/ai`, `/ai/console/[jobId]`)

**Purpose.** This replaces the `AutomaticWorkspace` panel and modal (`automatic-workspace.tsx:56-57`) and becomes the AI Workflows home for all 11 roles. Today `/ai` branches: families and owner get `AutomaticWorkspace`, staff get the 17-tab `SchoolAIWorkspace` (`src/app/ai/page.tsx:14-30`). Proposal: the console is the overview tab for everyone, and the existing tabs (`school-ai-workspace.tsx:62-64`) stay reachable under a "Tools" `ViewTabs` for staff.

```ts
interface ConsoleWorkspaceProps {
  jobId?: string; role: UserRole; campusId: string | null; language: Language;
  mode: "full" | "dock"; initialChips?: AskContextChip[];
  questionnaire?: { id: string; version: number };   // setup mode (§5)
}
```

**Layout at 1440:**
```
┌ RoleShell sidebar (rail) ┬─────────────── page card ────────────────────────────────┐
│                          │ TaskHeader: "AI Workflows" · campus scope · credits chip  │
│                          ├──────────── Thread (26rem) ─┬────── Plan Board ───────────┤
│                          │ request bubble (you)         │ [1 Find 7B] ──▶ [3 Mark …]  │
│                          │ AI: "Which date?" [DateCard] │ [2 Check leave] ─┘           │
│                          │ you: Thu 23 Oct              │                              │
│                          │ ✓ You confirmed step 3       │ Step detail drawer (30rem,   │
│                          │ composer + chips (sticky)    │ overlays board, Esc closes)  │
└──────────────────────────┴──────────────────────────────┴──────────────────────────────┘
```
- The thread is on the inline-start side. The board fills the rest.
- The board uses **graph layout**: columns by dependency depth, cards 18rem wide, lines drawn in SVG behind the cards.
- The shell sidebar collapses to its rail on this route (RoleShell already supports a compact frame).
- The header carries `TaskHeader` (`task-patterns.tsx:12`), the scope badge and a credits chip ("≈6 AI actions · 994 left").

**Layout at 768:** `ViewTabs` with "Conversation" and "Plan · 2 need you", and badge counts. The board switches to **list layout**: an ordered list where each card says "After step 1" in text instead of drawing lines. In landscape (≥1024) it returns to two panes.

**Layout at 360:** a single column. The thread is primary. When a plan exists, a sticky **PlanStrip** sits under the header ("Plan · 3 of 7 done · 1 needs you ▸"). Tapping it opens the board full-screen in list layout. Step detail and confirm sheets are full-screen with a sticky action bar.

**RTL.** The thread is on the right and the board on the left. Graph columns run right to left, so dependency arrows point toward the inline end (`rtl:rotate-180` on arrowheads, as in `guided-setup.tsx:215`). ←/→ between columns is mirrored. Names inside Urdu or Arabic sentences are wrapped in `<bdi>`. Record ids, ISBNs, phone numbers and amounts in Latin script use `dir="ltr"`. Money goes through `formatMoney` with the locale snapshot, as `execution-preview.tsx` already does.

**Primitives:** `TaskHeader`, `TaskStatus`, `TaskFeedback`, `ViewTabs`, `Badge`, `Button`, `IconButton`, `CollapsiblePanel`, `Progress` (counts only, never fake percentages), `Skeleton*`, `ModalSurface`, `Tooltip`/`InfoTip`, `FollowUpList`, `EmptyState`, `ErrorState`, `OfflineBanner`.

### 2.4 `RequestThread`, and `DetailCard` for the AI's questions

```ts
type ThreadEntry =
 | { kind: "request"; text: string; chips: AskContextChip[]; at: string }
 | { kind: "question"; stepId?: string; prompt: string; slot: AskSlot; answered?: SlotAnswer }
 | { kind: "answer"; text: string; slotAnswer?: SlotAnswer }
 | { kind: "note"; tone: "info"|"caution"; text: string }              // AI prose, never a status claim
 | { kind: "confirmation"; stepId: string; label: string; by: string; at: string; planVersion: number }
 | { kind: "handoff"; stepId: string; toRole: UserRole; toName?: string; href: string }
 | { kind: "outcome"; outcome: Outcome; counts: OutcomeCounts }
 | { kind: "system"; code: SystemNoticeCode };                         // credits, access changed, stale…
type AskSlot = { type: "class"|"section"|"student"|"students"|"staff"|"date"|"dateRange"|"time"|"enum"|"number"|"money"|"text"|"book"|"copy";
  required: boolean; options?: { id: string; label: string }[]; min?: number; max?: number; why?: string }
```
- The thread is a `role="log"` list. The engine's `ask` should carry a typed slot (an engine change, owned by the architecture design). The UI then renders a `DetailCard` with the right control: `DatePicker`, `Select` filled from scoped data, a student multi-picker, an amount field with currency. Free text is only the fallback.
- Answers made through a control are sent as `{slot, value, display}`. The evidence quote is the user's display text, which also removes the brittle exact-substring dependency noted in B.engine finding 5.
- Each question shows a quiet "Why this?" line (`slot.why`), e.g. "The register needs a date; today is a school day."

### 2.5 `PlanBoard` and `PlanStepCard`

```ts
interface PlanView { jobId: string; version: number; status: JobStatus; outcome?: Outcome;
  steps: PlanStepView[]; credits: { estimated: number; used: number; available: number }; language: Language }
interface PlanStepView { id: string; index: number; title: string; dependsOn: string[];
  capability: { key: string; label: string; domainLabel: string; domainHref: string };
  confirmationClass: "A"|"B"|"C"; state: StepState;
  inputs: { label: string; value: string; source: "you"|"page"|"school"|"asked" }[];
  preview?: PreviewDiff; previewHash?: string; receipt?: StepReceipt; handoff?: HandoffView; error?: StepError }
type StepState = "planned"|"needs_detail"|"ready"|"running"|"awaiting_confirm"|"confirmed"|"done"|"handed_off"
  |"approved_elsewhere"|"returned"|"queued"|"delivered"|"stale"|"not_allowed"|"not_connected"|"failed"|"partial"|"skipped"|"cancelled"
```

**Card anatomy, top to bottom:**
1. Folio "Step 3 of 7" plus the class badge:
   - A: neutral "Runs on its own"
   - B: brand "You confirm"
   - C: warning-tint "Goes to Accountant"
2. Title, e.g. "Mark the 7B register for Thu 23 Oct".
3. Capability line, e.g. "Attendance · Register" with a link icon to `domainHref`.
4. Inputs as `LedgerRow`s (reused from `ReviewSheet.tsx:52`). Each value carries a source tag ("from this page", "you said", "asked").
5. A preview summary chip ("+28 present · +2 absent · 0 changed").
6. The status line (`TaskStatus`). This is the only element announced to screen readers.
7. One action: `Review & confirm` (B), `Open approval` (C, approver side), `See receipt`, `Retry`, or `Answer`.

`data-*` anchors (B.qa asks for them): `data-console-step={id}`, `data-step-class`, `data-step-state`, `data-confirm-key={pendingKey}`.

`PreviewDiff` reuses `ExecutionPreview` (`src/components/school-ai/execution-preview.tsx:13`) for the 15 typed operations. New adapters return a generic diff:
```ts
interface PreviewDiff { groups: { entity: string; create: number; update: number; keep: number; remove: number;
  rows: { label: string; before?: string; after?: string }[] }[]; warnings: string[]; blockers: string[] }
```

### 2.6 `ConfirmSheet` (class B) and `HandoffCard` / `HandoffProvenanceBanner` (class C)
Specified in §4.

### 2.7 `HandoffInbox`: "Waiting for you" (`/ai/waiting`, and a section on each approver's Today)
Specified in §4.3.

### 2.8 `CapabilityCatalogue`: "What AI can do here" (`/ai/can-do`)
Specified in §6.6.

### 2.9 `SetupSheet`, `WillCreateDiff`, build mode and `SetupReceipts` (first login)
Specified in §5. These reuse the Charter Desk family: `StepCard`, `SheetRail`, `StepDock`, `ReviewArticle`/`LedgerRow`, `ConfirmedChoice`, `OptionCard`, `MoreDetails`, `SealSlot`, `WeekStrip`, `AiGuide`/`GuideCompanion` (decorative, `AiGuide.tsx:11`).

### 2.10 `WorkLog`: history (`/ai/log`)
Specified in §6.5.

---

## 3. Interaction model and state choreography

### 3.1 Principles
1. **Plan first, then act.** No write happens while the plan is being drafted. The first thing that can change data is a class A step on a plan the user has seen. This retires the 600 ms auto-advance (`automatic-workspace.tsx:54`, B.engine finding 4).
2. **Class A auto-run is opt-out per request.** The plan header has a `Switch`, "Run safe steps automatically", default on, remembered per user in localStorage (convenience only). Off means class A steps also wait for "Run".
3. **One live region, calm cadence.** Status text updates in place. Nothing is announced more than once per 3 s. Summaries are batched ("2 more steps done").
4. **The server is the source of truth.** The UI shows what the last server response says. Any optimistic state carries a visibly different ending: "…sending" vs "Done".

### 3.2 Job-level states: what the UI shows, and EN copy

| Engine state (proposed; maps from `schema.ts:32` plus the new ones) | Where shown | EN copy | Notes |
|---|---|---|---|
| `PLANNING` (new) | Thread note plus a board skeleton (`SkeletonCards`, 3 cards, no shimmer under reduced motion) | "Reading your request… Nothing has changed yet." | No percentage, no step count until the plan exists |
| `WAITING_INPUT` | `DetailCard` in thread; board card in `needs_detail` | "One detail needed: {question}" | The composer placeholder becomes "Answer, or ask something else" |
| `PLAN_READY` (new) | Board fully drawn; header CTA | "Here's the plan: {n} steps. Nothing has run yet." Primary: "Start" (if any A step is ready) | When every step is B/C, the CTA is "Review step 1" |
| `RUNNING` | Header `TaskStatus`; the running card pulses its status dot (static under reduced motion) | "Working through the plan · {done} of {total} done" | When the lease is held elsewhere (`service.ts:93`): "Still working on the server. You can leave this page; it carries on." (A steps only) |
| `WAITING_CONFIRM` (new, B.decisions T1) | Card shows "Needs your confirmation"; header pill "1 needs you" | "Step {i} is ready for you to check." | The worker never advances it. Focus is not stolen (§7) |
| `AWAITING_APPROVAL` (new outcome) | C card with `HandoffCard` | "Prepared and sent to {role}. Not applied until they approve." | Shows the approver name when exactly one holder exists, else "any {role}" |
| `PAUSED` (user) | Header | "Paused. Finished steps stay finished." Action: "Continue" | |
| `PAUSED` (credits) | `Alert tone="warning"` | "Paused: your school's AI credits have run out. {n} finished steps are saved. An administrator can add credits; then press Continue." | Replaces FAILED on `AICreditError` (B.decisions T9) |
| `PAUSED` (step cap) | `Alert` | "This plan reached its limit of {cap} steps. Continue in a new request; it will start from where this one stopped." Action: "Continue in new request" | Seeds the new job with a summary and receipts, never with raw entities (B.engine findings 7 and 10) |
| `BLOCKED` (not connected) | Card in `not_connected` | "Skoolee can't do this one for you yet. You can do it yourself in {domainLabel}." Link | The block is recorded as structured data (B.engine finding 10) |
| `BLOCKED` (not allowed) | Card in `not_allowed` | "This isn't part of your role. {role} can do it." Secondary: "Copy request" | Never offers to send a message on the user's behalf (sending is a separate, explicit act) |
| `BLOCKED` (policy/separation) | Card | "Your school requires a second person to approve this. It has been sent to {role}." | Turns today's silent 403 (B.engine finding 12) into a hand-off |
| `FAILED` (step) | Card in `failed`, thread note | "Step {i} didn't run. Nothing was changed by this step." Action: "Try again" (same key) | If the adapter reports partial: "{a} of {b} saved. {c} were not saved: {reason}." |
| `STALE` (preview/version drift) | Card in `stale` | "Something changed since you checked this. Review it again before it runs." | Opens a fresh preview; old confirm is void |
| Access changed (worker, `worker.ts:18-21`) | `Alert tone="danger"` | "Your access changed, so this request stopped. Finished steps stay finished." | |
| `COMPLETED · executed` | Outcome entry plus header | "Done. {n} changes saved." followed by the receipt list | Only when at least one write receipt exists (`validation.ts:12-17`) |
| `COMPLETED · answered` | | "Answered. Nothing was changed." | |
| `COMPLETED · plan_saved` | | "Saved as a plan. Nothing was changed. Find it in Work log." | |
| `COMPLETED · partial` (new) | | "Partly done: {a} saved · {b} waiting for {role} · {c} not connected." | Never rendered as "Done" |
| Offline | `OfflineBanner` plus disabled actions | "You're offline. Nothing new will run until you're back." | |
| 409 conflict (`automatic-workspace.tsx:47-49`) | Toast via shared `toast` | "This request was updated in another tab. Showing the latest." | |

### 3.3 Step-level choreography

`planned → (needs_detail ↔ answer) → ready →`
- **A:** `running → done | failed | partial`
- **B:** `awaiting_confirm → confirmed → running → done | failed | stale`
- **C:** `handed_off → approved_elsewhere (receipt) | returned (reason) | stale`
- **Messaging adapters:** `queued → delivered (counts) | partially delivered`

A card changes only on a server response. Motion is a 150 ms crossfade of the status line and a single tick drawing in on `done`. Under `prefers-reduced-motion` there is no movement, only a colour change and the text.

### 3.4 Tone and AR/UR notes
- **EN tone:** short, factual, second person, no exclamation marks, no "Great!", no claims about the future ("will be applied") without saying who decides.
- **AR:** Modern Standard Arabic, respectful, gender-neutral wording. Prefer nouns over gendered imperatives ("مطلوب تأكيدك" rather than an imperative verb). "AI" keeps the existing rendering "الذكاء الاصطناعي". Status verbs in the perfect tense only after a receipt ("تم إنشاء ٢٤ صفًا"). Before that use nouns ("إنشاء ٢٤ صفًا بانتظار تأكيدك"). Digits follow the locale formatter in use; never hard-code digit shapes.
- **UR:** the formal "آپ" register. Reuse "اے آئی" as already used (`automatic-workspace.tsx:20`). Use "مکمل" only after a receipt and "تیار" for prepared. Do not use English loanwords for status ("approved" is "منظور", "queued" is "قطار میں"). Role names come from the existing role label catalogue.
- **Server messages.** Every server `SchoolAiError` gets a stable `code`. The UI maps the code to EN/AR/UR text and never shows raw English server text (B.ui finding 9).

---

## 4. Confirmation (class B) and hand-off (class C)

### 4.1 Class B: `ConfirmSheet`

```ts
interface ConfirmSheetProps {
  step: PlanStepView;                                  // must be awaiting_confirm with preview + previewHash
  binding: { jobId: string; jobVersion: number; pendingKey: string; previewHash: string };
  counts: { entity: string; before: number; after: number }[];
  requireReason?: ConfirmReason;                       // from confirm-action.tsx:16, e.g. replacing existing rows
  onConfirm(binding: ConfirmSheetProps["binding"], reason?: string): Promise<void>;
  onChangeDetails(): void;                             // returns to inputs; produces a NEW preview + hash
  onCancel(): void;
}
```
- Built on `Modal` (size `lg`) at ≥768 and `ModalSurface fullscreen` at 360, with a sticky action row.
- **Content:**
  - Title, e.g. "Create 24 classes for 2026–2027".
  - A **Before → After table** per affected entity ("Classes 0 → 24", "Sections 0 → 48", "Existing classes kept 3").
  - The first 10 rows of the diff with "Show all 24".
  - Warnings (`Alert tone="warning"`), and blockers that disable the action.
  - A binding line in small muted text: "You're confirming what is shown here (plan version 3, prepared 10:41). If anything changes before it runs, you'll be asked again."
- **The action button is the verb plus the count:** "Create 24 classes", "Mark 28 present · 2 absent", "Issue LB-0042 to Ayesha Khan". There is never a generic "Yes" or "Confirm". Secondary actions: "Change details" and "Not now".
- **When the step replaces or removes existing records** (UPDATE/DESTRUCTIVE in Appendix A risk), the sheet adds `requireReason` (minimum 10 characters, `confirm-action.tsx:43`) and the reason goes into the audit row.

**Why a bare "yes" is not enough (rule B.decisions 5, `ROLLOUT.md:13`):**
- The confirm call sends `{pendingKey, previewHash, jobVersion}`, which only the sheet holds. Composer text is never treated as a confirmation by the server.
- While any step is `awaiting_confirm`, the client checks for an affirmative-only message (small per-language lexicon: en "yes / ok / go ahead / do it", ar "نعم / موافق / تمام", ur "جی / ہاں / ٹھیک ہے"). Instead of sending it, the thread replies locally: "To confirm, use **Create 24 classes** on step 3, so you see exactly what changes." Focus moves to that button. Nothing is sent and no credit is charged.
- Voice yes (SKO-460) is handled the same way.

**Several class B steps.** "Review 3 confirmations" opens one sheet that pages through them (1 of 3, 2 of 3). Each page has its own button and its own binding. There is no "confirm all".

### 4.2 Class C: hand-off from the requester's side

- The card shows a `HandoffCard`:
  ```ts
  interface HandoffView { toRole: UserRole; toName?: string; surfaceLabel: string; surfaceHref: string;
    state: "sent"|"seen"|"approved"|"returned"|"stale"|"expired"; separation: "required"|"optional"|"self_on_surface";
    returnedReason?: string; receipt?: StepReceipt }
  ```
- Requester copy:
  - **sent:** "Prepared and sent to **Sana Malik (Accountant)** for approval. Not applied yet."
  - **self_on_surface** (the requester is allowed to approve, e.g. an admin on a campus with no separation policy): "Ready for your approval in **Fees → Finance operations**. Approval happens there, not in chat." Button: "Open approval".
  - **approved:** "Approved by Sana Malik at 3:42 pm. Applied." plus the receipt.
  - **returned:** "Returned by Sana Malik: "wrong month"." Actions: "Change details and resend" (new preview, new hand-off) and "Drop this step".
  - **stale:** "The record changed after this was prepared. Prepare it again."
- A class C step is never approved from the console. Self-approval also happens only on the domain surface, so separation-of-duties enforcement stays at `repository.ts:366-368`.
- **Domain surfaces used (deep links):**
  - SKO-470 run and approval surfaces (`runs-panel.tsx`)
  - Finance operations (`finance-operations-panel.tsx`)
  - Fee invoices
  - Announcements (queue)
  - Timetable publish
  - Promotion and year transition
  - Leave approvals (`?view=leave`)
  - People & access
  - Pickup
  - Exam Studio (`/ai/studio`) for anything in the exam chain. This is shown as "Opens in Exam Studio", a route rather than an approval (B.decisions rule 21).

### 4.3 The approver's side

**Notification.** Use the existing `NotificationCenter` (`RoleHeader.tsx` imports `useNotifications`) and the nav `badge: "approvals"` counts (`role-nav.ts:54`). Example text: "Prepared with AI by Ahmed Raza (Accountant): cash payment Rs 12,000 · Bilal Ahmed's family · October. Needs your approval." It is one item per hand-off, never batched across requesters.

**`HandoffInbox`: "Waiting for you" (`/ai/waiting`; also a card on the approver's Today).** This is a read index, not a second approval screen (founder decision §3.1-2 in the README).
- Rows are grouped by domain. Each row shows: what, who asked, when, an age chip, a blast-radius chip ("Rs 12,000", "46 families", "24 classes") and the state.
- Selecting a row opens a side drawer. It shows the request text, the evidence quotes and the read-only domain preview (`ExecutionPreview`). The drawer's one primary action is "Review and decide in Finance operations ↗", which deep-links to the exact record version (`#run-<id>` pattern already supported, `runs-panel.tsx:36-37`).
- Filters: Waiting · Returned · Decided (7 days).
- Keyboard: ↑/↓ moves through rows, Enter opens the drawer, ⌘Enter opens the surface.

**`HandoffProvenanceBanner` on each domain approval surface:**
```ts
interface HandoffProvenanceBannerProps { requestedBy: { name: string; role: UserRole }; preparedAt: string;
  requestText: string; evidence: string[]; jobHref: string; planVersion: number; previewHash: string }
```
It is a quiet `Alert tone="info"` above the domain's own preview and decision controls: "Prepared with Skoolee AI for Ahmed Raza from his request: "record Rs 12,000 cash from Bilal's father for October" · 10:41 · Plan v3." Under it: "AI prepared this; it has not been applied. Check it as you would any request." Reject keeps the domain's own reason rule (`ConfirmAction requireReason`), and the reason flows back to the requester's thread as `returned`.

**Expiry.** If the record version or preview hash drifts before decision, the domain surface already refuses (`STALE_EXECUTION_PREVIEW`, `run-service.ts:59`). The banner then shows "Changed since prepared; the requester must prepare it again", and the requester's card goes `stale`.

---

## 5. The per-role questionnaire framework: from first login to Setup Sheet to Go

### 5.1 Model
```ts
interface QuestionnaireView { id: string; version: number; role: UserRole; sections: SheetSection[] }
interface SheetSection { id: string; title: string; questions: SheetQuestion[] }
interface SheetQuestion { key: string; type: QuestionType; label: string; help?: string; required: boolean;
  prefill?: { value: unknown; source: "registration"|"wizard"|"school_records"|"allocations"|"guardian_links"|"enrolment"; at: string; editable: boolean };
  produces: { capability: string; confirmationClass: "A"|"B"|"C"; entity: string }[];   // drives WillCreateDiff
  dependsOn?: string[]; skippable: boolean }
type QuestionType = "confirmed"|"choice"|"multiChoice"|"grid"|"listBuilder"|"periodBand"|"peopleRows"
  |"moneyLines"|"preferenceMatrix"|"pickFromRecords"|"date"|"dateRange"|"freeTextToStructure"
```

Each question type and its renderer (all on shared primitives):
- **`confirmed`** uses `ConfirmedChoice` (`ConfirmedChoice.tsx:23`) with a tag ("From your setup on 12 Oct") and "Change".
- **`choice`** uses `OptionCard` (native radios, `OptionCard.tsx:5-11`).
- **`multiChoice`** uses a `Checkbox` chip group.
- **`grid`** is grades × sections, a `Table` of `Input`s with "Add grade" and "Same sections for all". It replaces the free-text `grades` answer (B.ui A6).
- **`listBuilder`** is subjects per grade: rows with a copy-to-grades action.
- **`periodBand`** is the working week and periods: `WeekStrip` (onboarding) plus time-band rows.
- **`peopleRows`** is staff invitations: name, role and email per row. A CSV paste drops into a preview table. Rows are never sent to the model raw (B.ui finding 5).
- **`moneyLines`** is fee heads per class with an amount.
- **`preferenceMatrix`** is topic × channel switches (parent).
- **`pickFromRecords`** is chosen from existing scoped data (teacher's allocations, parent's verified children).
- **`freeTextToStructure`** is the escape hatch. You type prose and the existing analysis (`setup-answer-analysis.tsx`, `/api/school-ai/setup/analyze`) proposes structured rows that you accept row by row. The prose itself never becomes records (rule B.decisions 16).

All answers are stored typed, not as `string(max 4000)` (`schemas.ts:23-34`). That is an engine/schema change; the UI contract is above.

### 5.2 Prefill rules (never ask what Skoolee already knows)
1. **Registration and the wizard are settled facts.** School name, country, timezone, campuses, the ACTIVE academic cycle, weekends and currency come from `setup-service.ts:369-425` and `register.ts:133-171`. They show as `confirmed` rows and are never asked again. This removes the duplicate year collection (B.ui finding 2).
2. **Records beat answers.** Teacher classes and subjects come from allocations. A parent's children come from verified guardian links only. A student's subjects come from enrolment. If a record is missing, the row says so and offers "Ask your admin" (a request, class C), never self-assignment (`role-setup.ts:7,13`).
3. **Earlier answers fill later defaults.** For example, a grid's sections feed the subject list builder.
4. **A prefilled value carries its source tag and date.** Editing a `confirmed` value that came from another person's record turns it into a request to that person.

### 5.3 Progress, skip and return
- `SheetRail` (`SheetRail.tsx:6-14`) shows sections with ticks and "!". The progress text counts real outcomes, not questions: "6 of 9 answered · 4 will create records now · 2 go to others".
- **Skip** marks a question "Later". Skipped items become rows in "Remaining", with a link back. A Today card shows "Finish your setup · 2 left" (replacing the `SETUP_GENERATION_V1` heuristic, B.ui finding 4).
- **Autosave** happens on every Next (existing `persist`, `guided-setup.tsx:120-126`), versioned. `SetupBar`'s live region reads "Saved to your account".
- **Return** reopens at the first unanswered required question. `DraftRecovery` covers an interrupted session.
- The **required core** is minimal per role (below). Everything else is skippable.

### 5.4 The "build" moment
1. **Review = `WillCreateDiff`.** Built from each question's `produces[]` plus a server dry-run per step:
   ```ts
   interface WillCreateDiffProps { groups: { label: string; count: number; confirmationClass: "A"|"B"|"C";
     examples: string[]; destination: { label: string; href: string }; note?: string }[]; credits: { estimated: number; available: number } }
   ```
   The groups are shown as three `ReviewArticle`s:
   - **"Created when you press Go"**: A and B groups, with counts and examples.
   - **"Prepared for someone else to approve"**: C groups, each naming the approver.
   - **"Not from this sheet"**: e.g. "Students: import a roster (Student list → Import)", "Guardian access: sent after students exist", plus anything with no adapter yet, listed honestly.
2. **Go.** One button: "Set up my campus: create 24 classes, 9 subject lists, 8 periods, 14 rooms". It confirms a plan approval `{questionnaireId, version, planVersion, stepPreviewHashes[]}`. That covers class A and B groups only, each bound by its own hash (an engine requirement). Any step whose preview drifts at run time drops back to `awaiting_confirm` individually. Class C groups are never covered by Go.
3. **Build mode.** The board opens full width in graph layout. The ink cover (`.sk-ink-cover`, `GuideStage`) carries the `CharterLedger` (`CharterLedger.tsx:6-13`), which inks in a row only when that step's receipt arrives. `SealSlot` goes `open → pending` while running, `pressed` only when every A/B step has a receipt, and `failed` (warning ring) on failure.
4. **`SetupReceipts`**, the screen after build:
   ```ts
   interface SetupReceiptsProps { created: ReceiptGroup[]; withOthers: HandoffView[]; queued: QueuedGroup[];
     notConnected: { label: string; href: string }[]; later: { key: string; label: string; href: string }[] }
   ```
   Five ledgers:
   - **Created**: counts with links ("24 classes · Open Classes & subjects").
   - **Queued, not yet delivered**: "12 staff invitations queued · 0 accepted yet". This updates live from invitation status.
   - **With others**: "3 fee structures · waiting for the Accountant".
   - **Not connected yet**: a manual link for each item.
   - **Later**: skipped questions.
   The page heading is honest. "Your campus is set up" appears only when nothing is waiting. Otherwise: "Your campus is mostly set up: 3 things are with other people".

### 5.5 How it differs by role (the four reference roles)

| | ADMIN / CAMPUS_ADMIN (campus build) | TEACHER (my teaching week) | PARENT (my family) | SUPER_ADMIN (my group) |
|---|---|---|---|---|
| Length / time | 7 sections, ≈ 12 minutes, 6 required | 1 section, ≤ 8 questions, ≈ 3 minutes, 2 required | 1 section, ≤ 6 questions, ≈ 2 minutes, 1 required | 4 sections, ≈ 8 minutes |
| Settled (`confirmed`) rows | school, country, timezone, campus, active year, weekends, currency | name, campus, the classes and subjects you teach (allocations) | your children (verified links), school, language | institution, plan, existing campuses |
| Questions | grid (grades × sections); listBuilder (subjects per grade); periodBand; rooms list; peopleRows (staff); moneyLines (fee heads); preferenceMatrix (school communications policy draft); choice: how students arrive (roster import / migrate / later) | choice: language; multiChoice: what you want ready (lesson-plan slots, homework templates, marks book layout); periodBand: free periods (cover availability); choice: how you take register (per period / per day, where the school allows) | choice: language; preferenceMatrix: fees / absence / results / events × app / SMS / email; pickFromRecords: "Is this everyone?" (missing child becomes a request to the school, C); optional: pickup people (prepared, finished on Pickup, C-self) | listBuilder: campuses (name, city); peopleRows: who leads each campus (invitations, C to People & access); choice: group standards to start from (drafts) |
| Produces now (A/B) | classes and sections (`academics.setup_year`, B), subjects / periods / rooms / weekends (`setup.apply_changes`, B), staff invitations (B, **queued**, not accepted) | profile and preferences (A), private plan or lesson-plan drafts (labelled **draft**, `plan_saved`) | language and channel preferences (A once the adapter exists; until then "not connected") | campuses (`campus.create`, B) |
| Prepared for others (C) | fee structures → Accountant (or self on Fees when the seat is vacant); communications policy → review | requests to admin for a missing allocation | missing-child request → campus admin | campus-admin invitations (People & access); standards drafts |
| Never from the sheet | students from prose, guardian access, timetable publication | attendance, marks, assigning yourself classes | guardian links, consent decisions | campus records inside a campus (delegated) |
| Build-moment tone | ceremony: ink cover, ledger, seal | light: no cover, a single "Your week is ready" board | lightest: a home preview showing the right children | ledger of campuses with "waiting for its admin" rows |

**Other roles, briefly.**
- **PRINCIPAL:** academic priorities, timetable constraints, assessment calendar. Produces timetable *drafts* (B) and an exam session plan (B). Anything with a syllabus or paper deep-links to Exam Studio.
- **ACCOUNTANT:** currency confirmed, billing day, reminder cadence. Invoice generation is always C.
- **LIBRARIAN:** loan rules and opening hours (B when the adapter exists), first titles (A, `library.create_books`).
- **RECEPTIONIST:** desk hours, visitor policy, call categories (A/B).
- **STUDENT:** language, study goals, study times. Produces a private plan (`plan_saved`, never "done") and pathways goals (A).
- **APP_OWNER:** language and platform priorities, and a checklist only (`role-setup.ts:3`).

Where a role's adapters do not exist yet, its sheet shows those questions with a "Not connected yet: saved for later" tag rather than hiding them, so coverage gaps stay visible.

**Where it starts.**
- ADMIN/CAMPUS_ADMIN: `/ai?setup=1` (existing).
- GROUP owner (SUPER_ADMIN): the group sheet after the wizard, instead of only `/setup/readiness` (`setup-role.ts:6-8`).
- Every other role: the existing `requiredOnboardingPath`-style redirect after first login. For teachers, this extends `/teacher-onboarding` (profile steps at `src/app/teacher-onboarding/page.tsx:47`); it does not fork it. The sheet's first section is the existing profile flow.

**Onboarding copy fix.** `src/app/onboarding/page.tsx:34` ("nothing applies until you approve") becomes: "Answer a short sheet. You'll see exactly what will be created, and nothing is created until you press Go. Money and messages always go to the person who approves them."

---

## 6. The free-form AI Workflows surface

### 6.1 Composer (`ThreadComposer`)
- It wraps `MultimodalComposer` (`multimodal-composer.tsx:14-31`) with `voiceAvailable={false}` and uploads hidden until SKO-460 enables them (voice/document intake stays deferred).
- It adds a `ContextChipRow` and `@` mentions, and ⌘Enter sends.
- The empty state shows role starter cards (§6.2) and the line "Skoolee shows a plan before anything changes."
- A character counter appears only near the 24,000 limit (`schema.ts:7`).

### 6.2 Suggestions per role (starter cards, from the registry, filtered by live gates and page context)
Each card is phrased as the user would say it, carries a class badge, and is shown only when the adapter exists for that caller:
- **TEACHER:** "Take 7B's register for today" (B), "Set homework for 8A Science due Friday" (B, release is a separate step), "Enter marks for Monday's quiz" (B), "Apply for leave on 30 Oct" (A, then decided by the school), "Make a quiz paper → Exam Studio" (route).
- **PARENT:** "Tell school Ayesha will be absent Thursday" (B, sent as a request), "Book a meeting with the class teacher" (B), "Show what's unpaid" (read), "Change how I hear about fees" (A).
- **STUDENT:** "Plan my study week" (`plan_saved`), "Submit my English assignment" (B), "Ask for help in maths" (C-style: message to teacher).
- **ACCOUNTANT:** "Record a cash payment" (C), "Generate October invoices for Grade 5" (C), "Remind families with overdue fees" (C, queued).
- **LIBRARIAN:** "Issue a book" (B), "Return LB-0042" (A), "Add 20 copies of …" (A).
- **RECEPTIONIST:** "Check in a visitor" (B), "Log a call" (A), "Start an admission enquiry" (A).
- **PRINCIPAL:** "Cover Mr Khan's periods tomorrow" (B), "Draft the mid-term datesheet" (B), "Publish the timetable" (C).
- **ADMIN:** "Add Grade 9 with three sections" (B), "Invite the new maths teacher" (B, queued), "Promote Grade 8 to 9" (C).
- **SUPER_ADMIN:** "Add a campus in Lahore" (B), "Invite a campus admin" (C).
- **APP_OWNER:** "Show schools in trial" (read), "Update a school's city" (B).

Time and page context reorder the cards. Examples: the register card comes first for teachers before 10:00; on an invoice page the invoice actions come first.

### 6.3 Missing-detail questions
- Asked one at a time, as slot-typed `DetailCard`s (§2.4), with a maximum of 3 questions shown before the plan appears.
- Questions the plan does not need right now are deferred to their step, so the board appears early and the user can see why each question matters ("Step 3 needs a due date").

### 6.4 Progress and receipts
`StepReceipt` = `{ at, by: "you"|"approver name", counts, recordIds (collapsed, dir="ltr"), domainHref, domainReceiptLabel }`. The receipt view is a `LedgerList` with "Open in {domain}". Read steps show a "Looked up" receipt that is visually different (no tick, "Read") and never counts toward "Done" (rule B.decisions 15).

### 6.5 History: `WorkLog`
- Rows: request · outcome badge (Done / Partly done / Waiting for {role} / Answered / Plan saved / Stopped) · age · receipts count.
- Filters by outcome and by "waiting on someone". The list is paged on the server, replacing the 20-job cap (`service.ts:36`).
- "Continue from this" starts a linked job that carries a summary plus receipt ids only.
- Archive is soft (no delete in the UI; retention policy is engine-owned).

### 6.6 `CapabilityCatalogue`: "What AI can do here" (`/ai/can-do`; also `?` in the palette)
- **Built from the registry,** filtered by the caller's live gates (matrix flags, predicates, seats, capability keys, B.roles §b). It is grouped by the role's own navigation list (`ROLE_NAV`), so it doubles as the coverage checklist (B.roles §c).
- **Per nav feature:** whether AI is connected, example phrasings in the reader's language, the class ("Runs on its own" / "You confirm" / "Goes to {role}"), and "Do it yourself →" (the leaf's href).
- **Honest header:** "AI is connected to {n} of {m} things you can do in Skoolee." It shows the real number, e.g. a teacher sees "4 of 151" today, and the count rises as adapters land. Rows not connected are listed, greyed, never hidden.
- **Layout.** At 1440: a two-column list of `CollapsiblePanel`s per nav group. At 360: one column, collapsed groups.

### 6.7 What happens to the other "type to AI" surfaces
B.ui finding 6 found three such surfaces that behave differently. Proposal:
- **`AiActionPanel` / `AiWorkflowsHome`** (insight drafts) become "Drafts" entries the console can produce, as `answered`/draft outcomes.
- **The private assistant** (SKO-460) keeps its conversation persistence and retention (`/api/school-ai/conversations`, `src/app/api/cron/conversation-retention`). `RequestThread` stores its entries through that conversation model instead of a second store.
- **Execution, approval binding and pause/resume** reuse SKO-470's run lifecycle (`SchoolAiRun`/`SchoolAiExecution`). Nothing is forked.

---

## 7. Accessibility and the design-system gate

**Keyboard map:**
- **Global:** ⌘K / Ctrl+K opens or closes the palette.
- **In the palette:** ↑/↓ moves, Enter runs the highlighted row, ⌘Enter always asks, Esc closes and returns focus to the invoker.
- **In the composer:** ⌘Enter sends, and Alt+↑ jumps to the latest open question.
- **Board:** a roving tabindex over cards. ↑/↓ moves in list layout. ←/→ moves between dependency columns in graph layout, mirrored in RTL. Enter opens the step drawer. Single-letter keys (`C` review & confirm, `R` receipt) work only while focus is inside the board, and a setting can turn them off (WCAG 2.1.4).
- "Skip to plan" and "Skip to conversation" links sit at the top of the console.

**Screen reader:**
- The palette uses the combobox pattern (`aria-activedescendant`, listbox, group labels).
- The thread is `role="log"` with `aria-live="polite"`.
- The board is an `<ol aria-label="Plan, 7 steps">`. Each card is an `<article aria-labelledby>`. Dependencies are given in text ("After steps 1 and 2"); SVG lines are `aria-hidden`.
- **One shared polite live region (`ConsoleAnnouncer`):** "Step 3 of 7 done: 28 present, 2 absent saved." It is throttled to one message per 3 s, with batching.
- **"Needs you" states** use the same polite region plus a header pill. They never use `assertive` and never steal focus while the user is typing. When the user is idle (no focus in the composer), focus moves to the card's status line and the button reads its verb and count.
- Class badges carry full text ("You confirm"), not only colour.

**Focus return:**
- ConfirmSheet → the card's action (now the status line).
- Palette → invoker.
- Dock close → the header "Ask" button.
- Step drawer → its card.
- After a navigation deep-link and back, focus goes to the hand-off card via `#step-<id>` (same pattern as `runs-panel.tsx:36-37`).

**Reduced motion:** no line drawing, no card entrance, no seal drop (`SealSlot` shows the final state statically), and no pulsing dot (a static dot plus text instead).

**Targets and zoom:** 44 px minimum touch targets. The layout reflows at 320 CSS px and 400% zoom without horizontal scroll, except inside the diff table, which scrolls on its own with sticky first column headers.

**Design-system gate (`npm run check:ui`, `tests/design-system/adoption.test.ts`):**
- Shared fields through `FormField` (test at `:11`) and the shared focus token (`:59`).
- Toasts only via `@/components/ui/toast` (`:104`); no direct `sonner` import.
- Tokens only (no mapped hex, the type scale only, `text-2xs` is the floor, no `font-black`) (`:96`).
- `Modal`/`ModalSurface` only, with no new `ModalFrame`/`DialogContent` forks (`:148`), and the ratchet baseline (`:181`).
- Run `scripts/ui-token-codemod.ts` before commit.
- New CSS goes in a `console.module.css` using tokens only. The dependency-line SVG uses `currentColor` with token classes.
- No `title=` tooltips (use `Tooltip`).
- `dir` set on the root as in existing surfaces, and logical utilities only (`ps-`, `pe-`, `start-`, `end-`).

---

## 8. Honest-progress rules (binding for UI and copy)

1. A step reads "Done" only after a write receipt arrives from the server. Reads say "Looked up" and drafts say "Draft saved". Neither counts toward "Done" (`validation.ts:12-17`).
2. Queued is not delivered. Messages and invitations show "Queued · 0 of 46 delivered yet" and then "Delivered to 41 · 5 skipped (no consent or contact)", from `announcements-service.ts:65-84` and invitation status. "Sent" is never used for queued.
3. Prepared is not applied. A class C card can never show a tick until the domain receipt exists.
4. No percentages and no progress bars for model thinking. `Progress` is used only for counts of finished steps ("3 of 7").
5. No future tense without the decider: "Not applied until the Accountant approves", never "Will be applied".
6. The job heading summarises the worst true state: Partly done > Waiting > Done.
7. Animation never runs ahead of the server. The tick, the ledger ink and the seal fire on receipt arrival only (`prd-revised.md:82`).
8. On a failure, say what did and did not change: "Nothing was changed by this step" / "7 of 10 saved".
9. Credits are shown as an estimate before Go ("≈ 6 AI actions") and as used after. The word "free" is never used.
10. Claim language follows rule 24: "built", "prepared", "estimate", never "fully automatic school".
11. Privacy copy states only what is true. Until free-text names are masked by the engine (B.engine finding 7 and B.ui finding 5), the line is: "Names you pick with @ or from the page are hidden from the AI provider." It does not claim that all names are hidden.

---

## 9. The LEAP five-minute demo arc

Prerequisites: a demo tenant with seeded data (B.qa fixtures), the release gate status shown honestly (B.decisions rule 12), and live OpenAI or the labelled prototype mode. That choice is the founder's.

| Time | Who / device | What the audience sees |
|---|---|---|
| 0:00–1:30 | New standalone ADMIN, laptop 1440, EN | First login lands on the Setup Sheet. Wizard facts show as settled rows ("from your setup"). They fill the grades × sections grid in 20 s, paste a staff list and add fee heads. **WillCreateDiff**: "Created when you press Go: 24 classes, 48 sections, 9 subject lists, 8 periods, 14 rooms · Queued: 12 invitations · With the Accountant: 3 fee structures · Not from this sheet: students (import a roster)". They press **Go**. The board builds, the ledger inks in, the seal presses, and SetupReceipts says "mostly set up: 3 with others". |
| 1:30–2:45 | TEACHER, tablet 768, **Urdu, RTL** | On the 7B register page, ⌘K. Chips `7B` `حاضری` `جمعرات`. They type "سب حاضر سوائے علی اور سارہ". The plan has one B card. The ConfirmSheet shows "حاضر 28 · غیر حاضر 2". They type "جی" and the thread gently points to the button. They press it and get a receipt with "Open register". |
| 2:45–3:45 | ACCOUNTANT, laptop, EN | "record Rs 12,000 cash from Bilal's father for October." A slot question asks which invoice, with real invoice options. Then the C card: "Prepared and sent to Sana Malik (Admin) for approval. Not applied yet." |
| 3:45–4:20 | ADMIN as approver | Notification, then Waiting for you, then the drawer with the read-only preview, then "Review and decide in Finance operations". The provenance banner shows; they approve on the existing screen. Cut back to the accountant: the card flips to "Approved by Sana Malik · receipt". |
| 4:20–4:50 | PARENT, phone 360, Arabic | `?` in the palette shows "What AI can do for you" with honest counts. They say Ayesha will be absent Thursday (dentist). The B card reads "Send absence request to class teacher", then: "Sent to the class teacher for a decision." |
| 4:50–5:00 | Close on Work log | Done · Partly done · Waiting badges: "Skoolee shows the plan, asks the right person, and only says done when it's done." |

---

## 10. What is bold about this, and what it costs

**Bold:**
- The plan is visible before anything changes, with the dependency graph and preview diff on every card. Most "AI agents" stream prose. This one shows a reviewable board.
- The verb and count on the button make consent impossible to fake. "Yes" is gently refused in all three languages.
- Ask anywhere with the page as context: one palette for all 11 roles, merging the teacher quick switcher. Entity chips double as a privacy mechanism.
- The questionnaire becomes a typed Setup Sheet with a "what will be created" diff, and the Charter Desk seal is pressed only on receipts. That ties the onboarding ceremony to truth.
- The catalogue publishes the coverage gap ("4 of 151") instead of hiding it, which turns adapter progress into visible product progress.
- Hand-offs to existing approval screens, with a provenance banner, mean no second approval system.

**Costs and dependencies (UI cannot ship these alone):**
- **Engine:** a persisted plan with dependencies and new states (`PLANNING`, `PLAN_READY`, `WAITING_CONFIRM`, `AWAITING_APPROVAL`, `partial`). Also a preview for every adapter (today only the 15 ops have previews, and the content is discarded at `service.ts:82-83`), slot-typed asks, a plan-level approval of step hashes for Go, structured `unsupported`/`not_allowed` codes, error codes for i18n, and hand-off state fed back from domain approvals.
- **Adapters:** most starter cards depend on adapters that do not exist yet (B.roles: teacher 0 of 20 nav features). The catalogue and starter cards degrade honestly, but the demo arc needs at least: attendance register (teacher), finance payment proposal with hand-off, parent absence request, and the campus build ops.
- **Page context registry:** `useAskContext` must be added page by page. Start with about 12 high-traffic pages (register, marks, class, student, invoice, lending desk, visitors, leave approvals, fees, timetable, Today ×2).
- **Domain surfaces** need the provenance banner and `#step` deep-link handling (about 8 screens).
- **Copy:** ≈ 320 new UI keys × 3 languages, with native review for AR/UR.
- **Founder decisions needed:**
  1. A ⌘K button in the header despite "no header search" (SPEC §4.1 H2).
  2. Whether `/ai` becomes the console for staff too, with the 17 tabs under "Tools".
  3. Whether class A auto-run defaults to on.
  4. Whether Go may confirm several B steps under one plan approval bound to their individual hashes.


**Key decisions**
- One engine, two entry points: a global AskPalette (⌘K/Ctrl+K plus a header 'Ask Skoolee' IconButton, built from the existing TeacherCommandPalette) and the full two-pane ConsoleWorkspace at /ai; both send page context as typed chips registered by pages through useAskContext, never scraped from the DOM.
- Plan first, act second: the board shows every step (capability, inputs, class, preview diff) before any write. The 600 ms auto-advance in automatic-workspace.tsx:54 is retired. Class A auto-run is a visible per-request switch, default on.
- Class B confirmation happens only through a ConfirmSheet whose button names the verb and count ('Create 24 classes') and sends {pendingKey, previewHash, jobVersion}. Affirmative-only messages ('yes', 'جی', 'نعم') are caught on the client and pointed to the button. There is no 'confirm all'; several B steps page through one sheet, each with its own binding.
- Class C never approves in chat, not even self-approval: the console prepares the step and deep-links to the existing domain approval surface (SKO-470 runs, Finance operations, Leave approvals, People & access, Exam Studio as a route). That surface carries a HandoffProvenanceBanner, and the /ai/waiting HandoffInbox is a read index, not a second approval screen.
- Failures that are dead ends today become hand-offs or honest blocks: separation-of-duties 403s become hand-offs, credit exhaustion becomes a resumable PAUSED (not FAILED), and missing adapters become 'not connected, do it yourself' with a link.
- Missing details are asked as slot-typed DetailCards (date, class, student, money, enum), so answers are structured and evidence is the user's display text, not an exact-substring match.
- The questionnaire becomes a typed, per-role Setup Sheet built from shared Charter Desk primitives (StepCard, SheetRail, ConfirmedChoice, OptionCard, ReviewArticle/LedgerRow, SealSlot). Facts already known from registration, the wizard, allocations or guardian links show as settled rows and are never asked again.
- Before Go, WillCreateDiff splits outcomes into three groups: created at Go (A/B), prepared for others (C), and not from this sheet (roster import, guardian access, unconnected items). Go binds the questionnaire version plus each step's preview hash; class C is never covered.
- The seal and ledger ink fire only when receipts arrive. SetupReceipts separates Created, Queued-not-delivered, With others, Not connected and Later, and the heading says 'mostly set up' while anything is still waiting.
- The 'What AI can do here' catalogue is generated from the registry, filtered by live gates and grouped by the role's own ROLE_NAV, and publishes honest coverage counts (e.g. 4 of 151).
- Reuse, not fork: RequestThread persists through SKO-460's conversation model; execution, approval binding and pause/resume reuse SKO-470's run lifecycle; ExecutionPreview renders diffs for the 15 typed operations; teacher onboarding is extended, not duplicated.
- Privacy copy claims only what the engine guarantees: '@'-picked and page-chip entities are pseudonymised by construction; free-text names are not claimed as masked until the engine masks them.

**Risks**
- The UX depends on engine work owned elsewhere: a persisted plan with dependencies, new states (PLANNING, PLAN_READY, WAITING_CONFIRM, AWAITING_APPROVAL, partial), per-adapter previews (today previews exist only for the 15 ops, and their content is discarded at service.ts:82-83), slot-typed asks, structured block codes and hand-off feedback. Without them the board degrades to today's one-step loop.
- Adapter coverage is very low (teacher 0 of 20 nav features executable, B.roles), so starter cards and the catalogue will mostly show 'not connected' at first. The LEAP arc needs at least the attendance-register, finance-payment-proposal, parent-absence-request and campus-build adapters.
- The ⌘K header button may conflict with RoleShell's 'no header search' rule (SPEC §4.1 H2, RoleShell.tsx:95) and needs founder sign-off. Merging the teacher palette changes an existing shortcut's behaviour.
- Plan-level Go over several class B steps is a new approval shape. If the architecture cannot bind it to individual preview hashes, setup must fall back to paging through confirmations, which weakens the ceremony.
- Free-text names are not masked today (B.engine finding 7; B.ui finding 5). Relying on @-mentions and chips reduces exposure but does not remove it; the engine must mask free text before the privacy claim can widen.
- The release gate is closed (ai-release-evaluation.ts:3-7). The demo either uses the labelled prototype mode or waits for a recorded educator-reviewed evaluation; nothing may be implied otherwise.
- Hand-off provenance banners and #step deep-links touch about 8 domain screens owned by other tickets (SKO-470, finance, leave, access, pickup, Exam Studio), which creates coordination and merge risk in the shared checkout.
- About 320 new UI keys in EN/AR/UR need native review. Mixed-direction strings (names, ids, amounts) inside RTL sentences are a known source of layout bugs.
- The page-context registry (useAskContext) must be added page by page. Pages without it give context-free asks, which may confuse users who expect the palette to 'see' the page.
- Graph layout with SVG dependency lines is hard to keep legible and accessible at 768 and below, so list layout must stay first-class, not an afterthought.
- Live counts for queued-versus-delivered need status read-back from announcements and invitations. If that read path is missing, the receipts screen can only say 'queued', which is honest but less satisfying.

**Effort**: UI/UX implementation only, assuming the engine contracts in §2.5 and §3.2 (plan with dependencies, new states, previews, slot-typed asks, error codes, hand-off state) are delivered by the architecture track. Adapters are excluded. Person-days: AskPalette + ask-bus + useAskContext + merging the teacher palette: 6 · ConsoleWorkspace shell + ConsoleDock + 360/768/1440 layouts + RTL: 7 · RequestThread + DetailCard slot renderers (date, class, student, money, enum, text): 6 · PlanBoard (graph + list layouts, SVG lines, roving focus) + PlanStepCard + PlanStrip: 9 · PreviewDiff generic renderer + ExecutionPreview integration: 4 · ConfirmSheet + binding + affirmative interception (EN/AR/UR lexicon) + multi-step paging: 4 · HandoffCard + HandoffProvenanceBanner on ~8 domain screens + #step deep links + notifications: 8 · HandoffInbox (/ai/waiting) + Today card: 4 · Receipts + WorkLog (/ai/log) + 'continue from this': 4 · CapabilityCatalogue (/ai/can-do) + palette '?' mode: 4 · SetupSheet framework + 12 question renderers (grid, listBuilder, periodBand, peopleRows, moneyLines, preferenceMatrix, pickFromRecords, freeTextToStructure, …): 11 · Role questionnaire configs (ADMIN, TEACHER via teacher-onboarding extension, PARENT, SUPER_ADMIN first; then the other 7): 7 · WillCreateDiff + build mode (ink cover, ledger, seal tied to receipts) + SetupReceipts + Today 'finish setup' card: 6 · Copy (~320 keys × EN/AR/UR) + native review: 5 · Accessibility pass (screen reader, keyboard map, reduced motion, zoom/reflow) + check:ui/codemod: 5 · Playwright specs with data-* anchors, screenshots at 360/768/1440 × 3 languages, evidence: 7 · LEAP demo seed + rehearsal script: 3. Total ≈ 100 person-days (≈ 5 engineer-months, or about 7 calendar weeks with 3 engineers in parallel on the palette/console, board/confirm/hand-off and setup-sheet tracks). Not included: engine changes (estimated separately by architecture), new typed adapters, and SKO-460 voice/document intake.


---

# U3-outcome: "Say the outcome, correct the card, keep the receipt" — outcome-first, mobile-first UX for AI Workflows and the per-role first-login sheet

# U3-outcome — Say the outcome, correct the card, keep the receipt

UX/UI/interaction proposal for the two LEAP 2027 flagships: **AI Workflows** (free-text requests for any of the 11 roles) and the **per-role first-login sheet** ("Build my workspace").
Lens: outcome-first, mobile-first, RTL-first. Read-only design work, 2026-10-23. It builds on Appendix B (B.engine, B.typedOps, B.roles, B.ui, B.qa, B.decisions) and Appendix A. File:line citations point at existing code I read or that the audit verified.

> Scope guard. Voice and document intake stay with SKO-460. Paper → moderation → Seal stays in Exam Studio (SKO-408), and this design only deep-links to `/ai/studio`. Run lifecycle, preview hash and approvals reuse SKO-470. Nothing here widens a seat or a permission (B.decisions rules 2 and 19). Every "the AI does X" below assumes the typed adapter for X exists. Where it does not exist yet, the UI shows an honest "Not connected yet" state (§3, §6.7).

---

## 1. The idea in one paragraph, and the three signature moments

**The idea.** People do not want to "use AI". They want the register saved, the book issued, the campus ready. So every surface opens on the **outcome** ("Mark 7B attendance for today"), never on a tool or a chat. One bar takes the request. The AI turns it into a **Task Card**: a tiny structured form for exactly one capability, already filled from the user's words and the school's records. Each field shows where its value came from (*from your words*, *from school records*, *needs you*). The user **corrects instead of types**. What happens next depends on a class that is fixed per capability and never chosen by the model:
- **A** runs.
- **B** waits for a Confirm press bound to the exact preview.
- **C** is handed to the person and screen that already approve that kind of thing.

Nothing is called "done" until a **receipt** exists: record ids, counts and a link. The first-login sheet uses the same grammar. It is a short adaptive sheet per role, made of pickers, steppers, tags and grids (no essay boxes), prefilled from what the wizard, registration and records already know. It ends in one press, **Build my workspace**. Each item on the progress ribbon fills only when its receipt arrives, and the sheet ends on a receipts list plus an honest "still to do, and who does it" list. It works at 360 px first, in Urdu or Arabic RTL first, with one thumb, between two lessons.

**The three signature moments (the demo is built around these):**

1. **"Twenty seconds between lessons"** (TEACHER, phone, Urdu). Tap the suggestion chip *"7B register — today, period 3"*. A Task Card opens with 33 learners present and two marked absent from the teacher's own words ("سب حاضر سوائے علی اور سارہ", i.e. "everyone present except Ali and Sara"). Each absent row carries its evidence chip. Press **Save register · 31 present, 2 absent**. A receipt line appears with a link to the register. Bound by B.decisions T3: per-learner evidence, a full register, class B, never "mark all present" from a phrase.
2. **"Build my workspace"** (campus ADMIN). Four short sheets, one press. The ribbon reads *"Classes · 12 created ✓ / Subjects · 48 created ✓ / Periods · 8 created ✓ / Rooms · creating… / Staff invitations · 9 sent, 0 accepted / Fee structures · prepared, waiting for the accountant"*. The ribbon never jumps ahead of the server.
3. **"Handed to the right person"** (ACCOUNTANT → approver). "Record Rs 12,000 cash from Bilal's father for October" becomes a prepared payment against the exact invoice. The card says *"Prepared. Waiting for Farah Siddiqui to approve in Finance operations"* and never says "done". On her phone Farah sees the same preview code (`Preview 4F2A`), the requester's words, and the approve control of the existing finance screen.

---

## 2. Screens and surfaces

All new components live under `src/components/ai-workflows/`. `AiWorkflowsHome.tsx` already lives in that folder. It currently saves drafts only (B.ui B1.2) and will be reworked onto these parts. Every part is built from `src/components/ui/*` primitives and existing onboarding parts. Each surface below gives its purpose, its layout at 360/768/1440, RTL notes and the primitives it uses.

### 2.1 S1 — `OutcomeBar` (the one composer, on every console)

**Purpose.** It is the single "type to AI" entry. It replaces the three look-alike surfaces (B.ui finding: `AutomaticWorkspace` executes, while `AiActionPanel`/`/api/ai/insights` and the private assistant only draft). The dashboard "AI assistant" views (`/teacher/ai`, `?view=ai`) host the same `OutcomeBar`. Insight drafts survive as one capability family ("Draft remarks for 7B"), with class A and outcome `plan_saved`.

**Placement.**
- On the role's **Today** page (the first leaf of every console in `ROLE_NAV`, `src/lib/navigation/role-nav.ts:116,136,211,265,306,331,353`).
- On `/ai`.
- As a summonable overlay elsewhere (shortcut below).

| Width | Layout |
|---|---|
| 360 | Docked to the bottom of the page card, directly above the mobile tab bar (offset by `--mobile-nav-height`, which `RoleShell.tsx:354` already uses). One line with a 48 px height: leading "What can AI do here?" icon button, input, send icon button. On focus it lifts above the keyboard, the suggestion rail appears above it, and the mobile tab bar hides (the pattern `StepDock` already uses: it "never rides the keyboard"). |
| 768 | Inline at the top of Today's page card, full width, suggestion rail always visible (one scrolling row). |
| 1440 | Inline in Today's header band, max width 46rem, rail below it. A shortcut opens it as a centred overlay from any page. Proposed: `Ctrl/⌘+K`. Verify there is no existing binding first. |

**RTL.** The input uses `dir="auto"` so mixed Urdu and English names render correctly. The send arrow mirrors (`rtl:rotate-180`, the convention in `guided-setup.tsx:215`). The leading and trailing buttons swap through logical properties (`ps-*`/`pe-*`) only.

**Primitives.** `Input` inside `InputGroup`, `IconButton`, `Button`, `Badge`, `Tooltip` (never `title=`), `OfflineBanner` state.

```ts
type OutcomeBarProps = {
  role: UserRole; campusId: string | null;
  suggestions: Suggestion[];            // from S3 rail, role-aware
  state: "idle" | "typing" | "submitting" | "offline" | "no_credits" | "paused_subscription" | "gate_closed" | "waiting_confirm_elsewhere";
  creditHint?: { remaining: number };   // shown only when < 20
  onSubmit(text: string, from?: Suggestion): void;
  onOpenAtlas(): void;
};
type Suggestion = { id: string; label: string; capabilityKey: string; cls: "A" | "B" | "C"; prefill: Record<string, unknown>; reason: "schedule" | "pending" | "frequent" | "starter" };
```

### 2.2 S2 — `SuggestionRail`

**Purpose.** Role-aware outcome chips, computed server-side from three sources:
- Today's context. For a teacher this is the next period in the timetable, an unmarked register or homework due. For a librarian it is overdue loans.
- The user's pending work.
- The role's registry entries that have adapters.

A chip carries its prefill. Tapping a chip skips the planning call: it opens the Task Card directly, which saves a credit and a round trip. The chip text uses the user's own vocabulary ("7B", "Atlas"), and the `Badge` shows the class only when the class is C ("Needs approval").

| Width | Layout |
|---|---|
| 360 | One horizontally scrolling row with a maximum of 6 chips, scroll-snap, and edge fades. On RTL the row scrolls from the right. |
| 768+ | Wraps to two rows, maximum 8 chips. |

**Primitives.** `Button variant="choice" size="sm"`, `Badge`.

### 2.3 S3 — `RunSheet` (where a request lives: Task Card, confirm, progress, receipts)

**Purpose.** This is the single place one request is worked. It replaces today's fullscreen modal that auto-advances every 600 ms (`automatic-workspace.tsx:54,57`).

| Width | Layout |
|---|---|
| 360 | `ModalSurface fullscreen` sheet. Header: request in one line, plus a close control that does not cancel the run (it says so). Body: `ProgressRibbon` → active `TaskCard` or `HandoffCard` → `ReceiptList`. Footer: `ConfirmBar` sticky, styled like `StepDock`. |
| 768 | Right-side (logical end) panel, 26rem wide, over the page. The page underneath stays visible so a teacher can glance at the register screen. |
| 1440 | Docked panel inside `/ai` (two columns: run list on the start side, `RunSheet` on the end side). On other pages it is a 30rem end-side panel. |

**RTL.** The panel docks to the logical end (`inset-inline-end`), so it appears on the left in RTL. Ribbon segments run in reading direction.

**Primitives.** `ModalSurface` (its `dirty`/`dismissible` semantics are reused), `Progress`, `Alert`, `Button`, `TaskStatus`, `FollowUpList`, `CollapsiblePanel`, `Skeleton`.

```ts
type RunSheetProps = { run: RunView; onAction(a: RunAction): Promise<void>; onClose(): void; returnFocusTo: RefObject<HTMLElement> };
type RunAction =
  | { kind: "answer"; stepKey: string; values: Record<string, unknown> }        // field-level answers, not free text
  | { kind: "confirm"; stepKey: string; pendingKey: string; previewHash: string; version: number }
  | { kind: "edit"; stepKey: string; values: Record<string, unknown> }          // invalidates preview → new hash
  | { kind: "skip"; stepKey: string } | { kind: "pause" } | { kind: "resume" } | { kind: "cancel" };
```

### 2.4 S4 — `TaskCard` (the tiny structured form the AI pre-fills)

**Purpose.** One capability, one card. The registry entry for each capability declares a `uiSchema` next to its zod input schema. The model fills values, the server validates them, and the card renders them. The model never decides which fields exist.

**Field kinds** (all built on `FormField` and the shared inputs):

| Kind | Used for | Built from |
|---|---|---|
| `entity` | learner, class, book copy, invoice, visitor | `assistant-entity-picker.tsx` pattern; shows label + secondary line (roll no., class) |
| `date` / `time` / `period` | due dates, register period | `DatePicker`, `Select` of periods |
| `stepper` | copies, minutes, amounts in setup | `Input type=number` + two `IconButton`s |
| `choice` | in/out call, gender, channel | `OptionCard` (native radio) |
| `roster-exceptions` | attendance, homework submission | a list of the class with only exceptions expanded; "everyone else: present" row with count |
| `money` | class C money | read-only amount + currency from `LocalePolicy`; editing returns the step to *prepared* |
| `text` | note, purpose | `Textarea`, max lengths from the zod schema |

**Provenance chip on every field.** The value of `Badge` is one of:
- `from your words`. It carries the quoted fragment, which replaces the hidden `evidenceQuote` (`service.ts:152`) with something the user can actually see.
- `from school records`.
- `default`.
- `needs you`.

A `needs you` field is focused first.

| Width | Layout |
|---|---|
| 360 | Single column. Exceptions-first lists. The roster virtualises above 40 rows. |
| 768 | Two-column field grid for short fields. |
| 1440 | Same as 768 inside the 30rem panel. Inside `/ai` the card can widen to 40rem. |

**RTL.** Ids, roll numbers, phone numbers, ISBNs, amounts and times sit in `<bdi dir="ltr">` (the `LedgerRow ltr` prop in `ReviewSheet.tsx:50` already does this). Digits format through `Intl.NumberFormat(locale)`: the platform decides Latin or Arabic-Indic digits per locale, and one convention is kept per locale.

```ts
type TaskCardProps = {
  step: StepView; fields: FieldSpec[]; values: Record<string, unknown>;
  provenance: Record<string, { source: "words" | "records" | "default" | "missing"; quote?: string }>;
  issues: Record<string, string>;          // server validation, localized
  mode: "editing" | "previewing" | "confirming" | "locked";
  onChange(key: string, v: unknown): void;
};
```

### 2.5 S5 — `AiWorkflowsHome` at `/ai`

**Purpose.** This is the home of everything the user has asked for. Sections, in order:
1. `OutcomeBar` + rail.
2. **Needs you**: runs in WAITING_INPUT or WAITING_CONFIRM.
3. **With others**: class C hand-offs and their live status.
4. **Done recently**: receipts.
5. **What AI can do here** (`CapabilityAtlas`).
6. **History** (`RunHistory`, filterable).

| Width | Layout |
|---|---|
| 360 | Stacked, sections collapse to their counts using `CollapsiblePanel`. |
| 768 | Two columns: Needs you / With others on the start side, Done on the end side. |
| 1440 | Three zones: run list (start), `RunSheet` (centre), Atlas (end, collapsible). |

**Primitives.** `PageHeader` (with `FlagshipChip`), `ViewTabs` for history filters, `EmptyState`, `TaskFeedback`, `Skeleton`.

The existing 17-tab School-AI workspace (`school-ai-workspace.tsx:62-64`) moves under a "Studio tools" disclosure for managers. It is not removed.

### 2.6 S6 — `WorkspaceSheet` (first-login questionnaire, per role)

Specified in §5. It reuses the Charter Desk grammar so first login feels like one product:
- `SheetRail` (numbered steps)
- `StepDock` (sticky single action)
- `ConfirmedChoice` ("already known" answers)
- `OptionCard`
- `WeekStrip`
- `MoreDetails` (optional fields on phones)
- `ReviewSheet`/`LedgerList` (the build preview)
- `AiGuide` (Oolee, compact on phones)
- `SetupBar` (save state)

| Width | Layout |
|---|---|
| 360 | One question block per screen, `SheetRail` shows only the current title (its own rule, `SheetRail.tsx` header comment), `StepDock` sticky. |
| 768 | One sheet per screen (2–4 questions per sheet). |
| 1440 | Sheet in the centre, `AiGuide` + "What this will create" live preview on the end side. |

### 2.7 S7 — `BuildMoment` and `WorkspaceReady`

Specified in §5.5–5.6. `SealSlot` (`open | pending | pressed | failed`) is the one ceremony, and it presses only when every class A and B item has a receipt or an explicit outcome.

### 2.8 S8 — `HandoffCard` (requester side) and `PreparedByAiPanel` (approver side)

Specified in §4. `PreparedByAiPanel` is a block that existing approval screens (SKO-470 runs/approvals, Finance operations, Approvals views) embed above their own approve controls. It never replaces those controls.

### 2.9 S9 — `GroupLaunchBoard` (SUPER_ADMIN)

**Purpose.** The group owner's equivalent of "my workspace". It shows one tile per campus with: campus record ✓, campus admin invitation (sent / accepted), that admin's sheet progress, and that campus's receipts count.

| Width | Layout |
|---|---|
| 360 | List of tiles. |
| 768 | 2-column grid. |
| 1440 | `CampusPlan` arc (`CampusPlan.tsx`, states `active | draft | slot`) above a table. |

**Primitives.** `CampusPlan`, `CapacityMeter` (package places), `Table`, `TaskStatus`.

### 2.10 S10 — `CapabilityAtlas` ("What AI can do here")

A grouped list mirroring the role's own navigation (the B.roles §(c) checklist), so the user recognises the groups. For a teacher the groups are Register, Assessments, Homework, My classes and so on. Each row shows:
- the capability in plain words ("Save a class register"),
- its class badge (`Runs` / `You confirm` / `Goes to approver`),
- an example phrase (tapping it fills the bar),
- **or** `Not connected yet · Open Homework` with a deep link.

The atlas is derived from the registry plus nav at runtime, so it cannot drift. It answers the founder's "if that role has that feature" honestly.

---

## 3. Interaction model and state choreography

### 3.1 The view model the UI renders

Today the UI reads a raw `AutomaticJob` (`schema.ts:31-38`). The architecture track adds a persisted plan. The UI renders a `RunView` that the server derives and that works with or without a plan:

```ts
type RunView = {
  id: string; version: number; language: "en" | "ar" | "ur";
  status: "PLANNING" | "RUNNING" | "WAITING_INPUT" | "WAITING_CONFIRM" | "PAUSED" | "COMPLETED" | "FAILED" | "BLOCKED" | "CANCELLED";
  outcome?: "executed" | "answered" | "plan_saved" | "awaiting_approval" | "partial";
  pauseReason?: "user" | "credits" | "step_cap" | "subscription" | "access_changed";
  blockReason?: { kind: "not_connected" | "not_your_role" | "policy_separation" | "seat_held" | "gate_closed"; owner?: { role: UserRole; name?: string }; href?: string };
  steps: StepView[];            // planned + executed, in dependency order
  receipts: Receipt[]; handoffs: Handoff[];
  credits: { estimated?: number; used: number };
  lastServerAt: string;         // drives the "still working" honesty timer
};
type StepView = {
  key: string; title: string; capabilityKey: string; cls: "A" | "B" | "C";
  state: "planned" | "running" | "needs_input" | "awaiting_confirm" | "done" | "handed_off" | "skipped" | "blocked" | "failed";
  dependsOn: string[]; preview?: { hash: string; short: string; summary: string; counts?: Record<string, number> };
  pendingKey?: string; receiptId?: string;
};
type Receipt = { stepKey: string; title: string; counts: Record<string, number>; links: { label: string; href: string }[]; at: string; kind: "write" | "read" | "draft" | "queued" };
type Handoff = { stepKey: string; approver: { role: UserRole; name?: string }; surfaceHref: string; status: "prepared" | "notified" | "opened" | "approved" | "returned" | "expired"; previewShort: string };
```

**Advancing.** The client stops driving execution with a 600 ms timer. It subscribes, through polling with backoff of 1 s → 2 s → 4 s (maximum 8 s) or through server-sent events if SKO-470 provides them, while the server and worker advance steps. A class A step runs without a client tick. A class B step *stops* at WAITING_CONFIRM, and the worker never advances it (B.decisions T1).

### 3.2 Every state the UI renders, with copy

Tone: short and declarative. Say what is true now, then what happens next. No exclamation marks, no "Oops", no "AI magic". Name people and screens.

| State (server → UI) | What the user sees | EN copy (exact) | AR/UR note |
|---|---|---|---|
| Submitting (client) | Bar shows a spinner in the send button; text stays visible | "Sending…" | Short verbal noun form; keep the ellipsis. |
| PLANNING | Ribbon with one indeterminate segment; `Skeleton` card | "Working out the steps for: *{request}*" | Quote the user's request verbatim, isolated with `<bdi>` (it may be mixed script). |
| PLANNING > 8 s with no server change | Same, plus quiet line | "Still working. You can close this; it keeps going and you'll find it under Needs you." | Use the polite imperative (Urdu آپ form). |
| PLANNING > 60 s (lease stall, B.engine finding on 60 s/120 s) | `Alert tone="warning"` + Retry | "This is taking longer than it should. Nothing new was saved. Retry" | "Nothing new was saved" must be literal, never a softer paraphrase. |
| RUNNING step class A | Segment fills **only** on receipt | "Adding 3 copies of *Atlas of the World*…" → receipt: "Added 3 copies · LB-0042–44" | Counts via `Intl.NumberFormat`; Arabic plural forms need ICU plural rules (zero/one/two/few/many/other). |
| WAITING_INPUT | Task Card with `needs you` fields focused | Heading: "One detail needed" · field hint: "Which section — 7B or 7C?" | Questions are field-level, so they get translated once in the catalog instead of on every model call. |
| WAITING_CONFIRM (class B) | Card in *previewing* mode + `ConfirmBar` | Button: "Save register · 31 present, 2 absent". Sub-line: "Nothing is saved until you press this." | The button label states the effect and the counts; in RTL the counts follow the verb in reading order. |
| Preview drifted (STALE_EXECUTION_PREVIEW / hash mismatch) | `Alert tone="warning"`, diff rows highlighted | "Something changed since you looked: Hamza moved to 7C. Check the card again." | Name the change; never a generic "conflict". |
| 409 version conflict (another tab) | Card refreshes in place | "Updated from your other window." | — |
| COMPLETED · executed | Ribbon full; `ReceiptList`; `SealSlot pressed` only in Build | "Done · 1 register saved" + links | "Done" is shown only with ≥1 write receipt (`validation.ts:12-17`). |
| COMPLETED · answered | Answer card, no ribbon | "Here's what I found." (no "Done") | — |
| COMPLETED · plan_saved | Draft card with "Open draft" | "Saved as a draft. Nothing in the school changed." | — |
| COMPLETED · awaiting_approval (new) | `HandoffCard` | "Prepared. Waiting for {name} to approve in {screen}." | Never translate as "completed". Use "prepared" (AR: past participle "مُعَدّ"; UR: "تیار کر دیا گیا"). Translators confirm. |
| COMPLETED · partial (new) | Receipts plus a list of steps that did not run | "3 of 5 done. 2 need attention: …" | — |
| PAUSED · user | Grey ribbon | "Paused. Nothing more will run until you continue." | — |
| PAUSED · credits | `Alert tone="warning"` + owner link | "Out of AI credits. 4 steps are done and saved; 2 are waiting. {Owner} can add credits." | Neutral copy per G51 (`openai.ts:441-452`). |
| PAUSED · step_cap | Continue button starts a linked continuation run | "This request is large. 30 steps are done; continue to do the rest." | — |
| PAUSED · subscription | Neutral `Alert` | "AI actions are paused for your school's plan. Everything saved so far is kept." | — |
| BLOCKED · not_connected | `NotYetCard` | "AI can't issue certificates yet. You can do it yourself in Documents." [Open Documents] | Name the screen exactly as the nav label reads in that locale. |
| BLOCKED · not_your_role | `NotYetCard` with owner | "Publishing results is done by the principal. Your request was not sent anywhere." | The "not sent anywhere" sentence is mandatory, so nobody assumes the request was forwarded. |
| BLOCKED · policy_separation | `HandoffCard`, not failure | "Your school requires a second person to approve this. Prepared for {role}." | — |
| BLOCKED · seat_held | `NotYetCard` | "Timetables on this campus are run by the principal, {name}." | — |
| BLOCKED · gate_closed / prototype | `Alert tone="neutral"` + badge "Practice mode" | "Practice mode: AI suggestions are examples and nothing is saved to your school." | Matches the labelled prototype fallback (`src/lib/ai/prototype.ts`). |
| FAILED | `Alert tone="danger"` + Retry (same key) | "This step didn't run. Earlier steps are saved. Retry" | Server `SchoolAiError` strings must move to catalogued codes (B.ui finding: English-only). |
| Access changed (worker re-resolve fails, `worker.ts:18-21`) | `TaskFeedback kind="permission"` | "Your access changed, so this stopped. Nothing after step 2 ran." | — |
| CANCELLED (new) | Struck ribbon, receipts kept | "Stopped. 2 steps had already run; they are kept." | Cancelling never undoes receipts, and the copy says so. |
| Offline (client) | `OfflineBanner` + bar disabled with draft kept | "You're offline. Your text is kept on this device and not sent." | — |

### 3.3 The 20-second teacher (choreography, phone, between two lessons)

| t | Teacher | System |
|---|---|---|
| 0 s | Unlocks the phone on Today. | Rail is already computed: "7B register · period 3" (next timetable slot, unmarked). |
| 2 s | Taps the chip. | No planning call (chip has prefill). The `attendance.save_register` card opens with 33 learners, all `present · default`. |
| 4 s | Holds the mic is out of scope (SKO-460). Types in the bar under the card: "علی اور سارہ غیر حاضر" ("Ali and Sara absent"). | One parameter call maps the names to roster entities. The two rows flip to absent with the chip `from your words: "علی اور سارہ غیر حاضر"`. One possible ambiguity: "Two Alis in 7B: Ali Raza (12), Ali Khan (19)" is shown as a two-option `OptionCard`. |
| 9 s | Taps "Ali Raza". | Preview recomputed; hash shown as `Preview 7C1D`. |
| 12 s | Presses "Save register · 31 present, 2 absent". | Confirm carries `{pendingKey, previewHash, version}`. Executes through the existing register service. |
| 14 s | — | Receipt: "Register saved · 7B · period 3 · 31/2 · Open register". Focus moves to the receipt heading. Polite live region announces it once. |
| 15–20 s | Pockets the phone. | If the network drops after the press, the card shows "Saving… we'll keep trying" and never "Saved" until the receipt arrives. |

### 3.4 Missing-detail questions

- At most **one question per screen**. It is asked **as a field**, never as a chat bubble. When three fields are missing they are all highlighted on one card, which still counts as one screen.
- The question offers what the records allow: `OptionCard` for 2–5 candidates, the `entity` picker for more. Free text is the last fallback.
- The answer goes back as structured `values`, not prose. This removes most of the fragile substring evidence check (B.engine finding 5), because a picked entity is its own evidence.
- "I don't know" is always offered. It skips the step and leaves it in Still to do, without failing the run.

---

## 4. Confirmation (class B) and hand-off (class C)

### 4.1 Class B — why a bare "yes" is never enough, as an interaction

1. **The confirm control is the card, not the conversation.** While a step is WAITING_CONFIRM, typing "yes", "ok", "haan" or "نعم" in the bar does nothing to the step. The bar shows an inline hint under itself: *"To save, press **Save register** on the card. Typing 'yes' doesn't save anything."* Server side, `answer` on a WAITING_CONFIRM job is rejected, and only `confirm` with the binding is accepted (B.decisions T1).
2. **The button restates the effect and the count.** "Save register · 31 present, 2 absent". "Create 12 classes". "Invite 9 staff (invitations stay pending until they accept)". A generic "Confirm" label is not allowed. Lint rule: `ConfirmBar` requires `effectLabel` and `counts`.
3. **The binding is visible.** A four-character preview code (`Preview 7C1D`, the first characters of `previewHash`) appears on the card and in the receipt. Support, approvers and demo viewers can then say "the one with 7C1D".
4. **Edits invalidate.** Changing any field moves the card from *previewing* back to *editing*, recomputes the preview and replaces the code. The button stays disabled for about 300 ms while the new preview loads, so nobody confirms a stale preview.
5. **Higher blast radius gets a second look, not a second click.** Above a per-capability threshold the `ConfirmBar` expands a `LedgerList` of what will change before the button enables. Thresholds are declared in the registry, e.g. more than 50 rows, or any `DESTRUCTIVE` risk in Appendix A. The reason pattern from `ConfirmAction` (`confirm-action.tsx:16-55`, `minLength`) is used only where the domain already demands a reason.
6. **Batch confirm is allowed only inside the Build moment** (§5.5), where the preview is the whole plan and the binding is `{questionnaireId, version, planHash}`.

```ts
type ConfirmBarProps = {
  effectLabel: string; counts: Record<string, number>; previewShort: string;
  expandedChanges?: LedgerRowProps[]; reason?: ConfirmReason;
  state: "ready" | "recomputing" | "submitting" | "stale";
  onConfirm(): void; onEdit(): void;
};
```

### 4.2 Class C — hand-off

**Requester side: `HandoffCard`.**
- Header: "Prepared for approval".
- Body: the same preview card, read-only, with its preview code.
- Who row: avatar + name if one person holds the approver seat, otherwise the role ("Any campus admin").
- Where row: the destination screen's nav label and a deep link to the exact record version.
- Status stepper: `prepared → notified → opened → approved | returned`. Each step shows a timestamp **only from a server event**. "Notified" means a notification row was created. It does **not** mean the approver read it.
- When the requester holds the approval role and policy allows self-approval, the card says "You can approve this yourself in Finance operations" and links there. Approval still happens only on that screen. The AI never self-approves class C, which removes `service.ts:80-81` for class C.
- When separation is required (`repository.ts:366-368`): "Your school requires someone other than you to approve this."

**Approver side.**
- **Notification.** It goes through the existing notification and `/messages` channels. Text: *"Payment prepared by Ahmed (Accountant) with AI — Rs 12,000 · Invoice INV-2026-0412 · Preview 4F2A"*, with an "Open in Finance operations" link. The approver gets one notification per hand-off, never one per step.
- **`PreparedByAiPanel`**, embedded above the domain's own controls:
  - **Asked for**: the requester's words, quoted, in the language they were written in, with a "Show translation" toggle where available.
  - **What AI filled vs what the requester confirmed**: the provenance chips again.
  - **Preview code**, which must match the requester's.
  - **What approving does**: the domain's own effect text (`execution.ts:33-49` effect strings, finally shown to someone).
  - **What it does not do**: e.g. "Approving records the payment. It does not send a receipt to the family."
- The approve and return controls are the screen's existing ones. Returning asks for a reason, which flows back to the requester's `HandoffCard` as "Returned by Farah: wrong month".
- An approver can never approve from the notification itself: no inline Approve button in toasts, push or chat.

**Hand-off to yourself (C-self).** Some actions grant access, e.g. a parent's `pickup.issue_authorization`, or are a legal decision, e.g. `family.trip_consent` (Appendix A risk `ACCESS_GRANT` / `APPROVAL_DECISION`). For these the user *is* the authority, but rule 5 says a chat phrase alone never grants access. The AI pre-fills the domain screen, and the user completes it there with that screen's own flow. Card copy: "Ready on the Pickup screen. Finish it there to give Uncle Imran a pickup code."

### 4.3 Queued is not delivered

Every communication capability is class C (B.decisions rule 6). When it is executed, its receipt kind is `queued`, with copy "Queued for 212 families · 9 skipped (no consent or no verified contact) · delivery not confirmed yet". The skip reasons come from `announcements-service.ts:65-84`. Only a delivery event may flip a line to "Delivered to 198".

---

## 5. The per-role first-login questionnaire framework

### 5.1 Entry and routing

| Role | First login lands on | Today |
|---|---|---|
| STANDALONE owner (ADMIN) | Wizard (unchanged) → `WorkspaceSheet` campus variant | `/ai?setup=1` GuidedSetup |
| GROUP owner (SUPER_ADMIN) | Wizard → `WorkspaceSheet` group variant → `GroupLaunchBoard` | `/setup/readiness`, no questionnaire (`setup-role.ts:6-8`) |
| CAMPUS_ADMIN (invited) | Invitation accept → `WorkspaceSheet` campus variant | GuidedSetup if reached |
| Everyone else | First authenticated page → `WorkspaceSheet` role variant (dismissible, resumable from Today) | Role-interview free-text job (`role-setup.ts`) |

The sheet is a route-level page, not a modal, so it survives refresh and back navigation. Proposed URL: keep `/ai?setup=1` as the entry and render `WorkspaceSheet`. Its state persists as the existing ONBOARDING record kind for campus roles. Other roles use a new per-user setup record. The architecture track decides, and the UI only needs `{id, version}`.

### 5.2 Question types (the only allowed inputs)

| Type | Component | Example |
|---|---|---|
| `known` | `ConfirmedChoice` (tag: "From your registration" / "From the setup wizard" / "From the school") | Academic year 2026–2027, Mon–Fri |
| `pick` / `multiPick` | `OptionCard` / checkbox cards | First thing to get working |
| `stepper` | `Stepper` (new, on `Input` + `IconButton`) | Periods per day: 8 |
| `tags` | `TagList` (new): chips + add field, paste splits on commas/new lines | Subjects: English, Urdu, Maths… |
| `grid` | `GradeSectionGrid` (new): grades as rows, section counts as steppers | Grade 7 × 3 sections |
| `matrix` | `SubjectMatrix` (new): subjects × grades toggles, "same as previous grade" row action | Maths in 1–10 |
| `week` | `WeekStrip variant="paper"` | Working days |
| `dayShape` | `PeriodBuilder` (new): start time, length stepper, break slots, live preview strip | 08:00, 40 min, break after 4 |
| `table` | `RosterTable` (new): spreadsheet paste/CSV into a reviewable grid, routed through the existing `importBatch` review token (`students.ts:20-22`), never prose | Staff list, student roster |
| `people` | `PeoplePicker` over existing records | Who is your class teacher for 7B |
| `availability` | `AvailabilityGrid` (new): days × periods, tap to toggle; prefilled from timetable when it exists | Teacher free periods |

**Free-text boxes are not allowed as answers.** The only optional free text is a single "Anything else we should know?" note. It is never executed. It is saved as a draft note and labelled as such.

### 5.3 Prefill rules ("never ask what the system already knows")

The sheet's server loader builds a `prefill` map. A question with a confident prefill renders as `known`, and the user confirms with one tap or reopens it.

| Fact | Source | Rule |
|---|---|---|
| School name, country, city, timezone, currency, language | Registration + wizard (`register.ts:133-171`, `setup-service.ts:369-384`) | Never asked. Shown once as a `known` summary on the first sheet. |
| Academic year label/dates, weekends | Wizard (`setup-service.ts:419-425`) | `known`. Editing deep-links to Academic year; the sheet never creates a second cycle (B.ui finding on CYCLE_DETAILS_CONFLICT). |
| Campuses | Wizard campus drafts | `known` for campus admins; editable for SUPER_ADMIN. |
| Teacher's classes and subjects | Allocations / timetable | `known` if present. If absent: "Not assigned yet. Your coordinator assigns these." → a C hand-off request (if an adapter exists) or a Still-to-do row. A teacher never assigns themselves (`role-setup.ts` TEACHER line). |
| Parent's children | Verified guardian links only | `known`. Missing child → "Ask the school to link {name}" with the school's front desk named. Never inferred (rule 8). |
| Student's class/subjects | Enrolment | `known`, read-only. |
| Librarian's existing catalogue size, loan rules | Library settings | `known` + counts. |
| Receptionist's desk hours | Campus profile if present | `known` or a `dayShape` question. |
| Accountant's fee heads | Fee structures | `known` if present; otherwise a `tags` question that produces **prepared** fee structures (class C). |

### 5.4 Progress, skip, return

- `SheetRail` with 2–5 sheets per role. The rail shows estimated time per sheet ("about 1 min"). Saving happens on every change (`SetupBar` save states `saving | saved | dirty | failed`).
- **Skip** is always "Decide later". The skipped item moves to the Still-to-do list with a deep link. It is never silently defaulted.
- **Return.** A Today card ("Finish setting up · 2 sheets left") and the account menu entry "My setup" reopen the sheet at the first unconfirmed question. After Build, reopening shows `WorkspaceReady` with a "Change answers" action that starts a new version. This reuses version pinning (`service.ts:107-110,116-119,144-147`).
- **Dismiss on first login** is allowed for non-campus roles. For campus admins the sheet stays as the Today hero until Build has run once.

### 5.5 The Build moment

`BuildMoment` is the last sheet, a `ReviewSheet` document with three numbered articles:

1. **"Pressing Build creates"**: every class A/B item, with counts. Example: "12 classes · 48 subject slots · 8 periods · 14 rooms · 9 staff invitations (pending until accepted)".
2. **"Prepared for someone else to approve"**: class C items, each with who approves. Example: "Fee structures for 12 classes → Accountant (none yet: you)".
3. **"You'll still need to"**: things no adapter can do yet, or that only other people can do. Example: "Import students (use Student list → Import)", "Staff accept their invitations".

The **wizard copy changes** from "nothing applies until you approve it" (`src/app/onboarding/page.tsx:34`) to: *"After your answers, you'll see exactly what will be created. Nothing is created until you press Build."* That sentence is true under this design.

The one action is "Build my workspace" with the credit estimate beside it ("about 9 AI actions · you have 480"). This uses the reservation pattern in B.decisions T9. Pressing it confirms article 1 as a batch, bound to `{id, version, planHash}`.

### 5.6 The progress ribbon and `WorkspaceReady`

During Build, `ProgressRibbon` shows one row per article-1 line, in dependency order. Each row has these states:
- `queued`: hollow dot, "Waiting".
- `running`: animated dot. With reduced motion it is a static half dot. Text: "Creating…".
- `done`: tick + count + link, set **only from the receipt**.
- `skipped`: dash, with the reason.
- `failed`: "!", Retry.

Rows from article 2 show "Prepared → waiting for {role}". Rows never show a percentage, because a percentage over unequal steps is dishonest. They say "5 of 7 created". `SealSlot` goes `open → pending → pressed`; it is `failed` if any A/B row failed, with copy "Built with 1 problem. Fix it below."

`WorkspaceReady` has three blocks:
- **Receipts**: `ReceiptList`, links into the real screens.
- **Waiting for others**: `HandoffCard` mini list.
- **Still to do**: `FollowUpList` with tones and deep links. Example: "Import students · 0 of ~600".

Below them sits "Try your first request" with three starter chips for the role. That chip is the bridge into AI Workflows.

### 5.7 How it differs per role

| Role | Sheets (≈ time) | Asks | Produces (A/B) | Hands off (C) / still to do |
|---|---|---|---|---|
| **ADMIN / CAMPUS_ADMIN** | 4 (≈6 min): *Your school (known)* · *Classes* (`grid`) · *Subjects* (`matrix`) · *School day* (`dayShape`, rooms `stepper`+`tags`) · *People* (`table` staff, students via import link) | Grades/sections, subjects per grade, period shape, rooms, staff rows | classes, subjects, periods, rooms (`academics.setup_year`, `setup.apply_changes`); staff invitations pending | fee structures → accountant; timetable draft → principal if the seat is held (`access.ts:84-89`); students → Import screen |
| **TEACHER** | 3 (≈90 s): *Your classes (known)* · *How you work* (`pick` register mode: "exceptions only" vs "full list"; marking scale shown as known from Curriculum & grading) · *Your week* (`availability`, prefilled) | Language, register default, notification times, preparation slots | profile/preferences; pinned classes; private lesson-prep plan per section (plan_saved, labelled as a draft) | missing allocations → coordinator; nothing school-wide |
| **PARENT** | 2 (≈60 s): *Your children (known)* · *How we reach you* (`pick` channel per topic: fees, absence, results; language; quiet hours) | Channel preferences, language | profile; channel preferences (class B: own consent record) | pickup authorizations → C-self on Pickup screen; missing child link → front desk |
| **SUPER_ADMIN** | 3 (≈4 min): *Your campuses* (`tags` + city picker per campus; package places `CapacityMeter`) · *Who runs each* (`people`/email rows per campus) · *Group standards* (`pick`: shared grading scale yes/no, shared fee calendar yes/no) | Campuses, a campus admin per campus, standards | campus records (`campus.create`, B) | campus admin invitations → C-self on People & access (access grant); standards → draft policy for review; lands on `GroupLaunchBoard` |
| PRINCIPAL | 3: *Year shape (known)* · *Assessment calendar* (term `date` ranges) · *Cover rules* (`pick`) | Term windows, cover preferences | exam session plan drafts (`exams.create_session_plan`, B) | timetable publish → own Timetable screen (C); papers → Exam Studio deep link |
| ACCOUNTANT | 2: *Fee heads* (`tags`, amounts per class in `matrix`) · *Collection* (`pick` channels, receipt numbering known) | Fee heads/amounts | — | fee structures and invoices prepared (C) → Fees approval |
| LIBRARIAN | 2: *Lending rules* (`stepper` days, max loans) · *Catalogue start* (`table` import, or skip) | Loan rules, initial titles | titles (`library.create_books`, A) | members come from roster (known) |
| RECEPTIONIST | 2: *Desk hours* (`dayShape`) · *What you log* (`multiPick`: visitors, calls, post) | Hours, enabled logs | preferences; suggestion rail tuned | certificates templates → admin approval |
| STUDENT | 2: *Your subjects (known)* · *Study rhythm* (`availability`) | Study times, language | private study plan (plan_saved) | — |
| APP_OWNER | 1: *Priorities* (`multiPick`) | Console priorities | preferences | tenant work needs a support grant (rule 19) |

---

## 6. Free-form AI Workflows surface

### 6.1 Composer behaviour

- **Submit.** It creates a run (`POST /api/automation`, existing route and rate limit, `route.ts:8`). The key is a per-submission UUID kept in the bar until the text changes. This keeps today's pattern (`automatic-workspace.tsx:36-37`).
- **One request can become several cards.** Example: "Issue Atlas to Ayesha and renew Bilal's loan". The ribbon shows both. Each confirms separately unless both are class A.
- **Mixed classes in one request.** Class A steps run, class B steps wait, class C steps are prepared. The run's outcome is `partial` or `awaiting_approval`, never `executed`, while anything is still waiting.
- **Language.** The run language follows the locale (`schema.ts:7`). The request is shown back verbatim.

### 6.2 Suggestions per role (starter set; the server personalises)

| Role | Chips (EN source; localised) |
|---|---|
| TEACHER | "7B register · period 3" · "Set homework for 8A Maths, due Thursday" · "Draft remarks for 7B English" (plan_saved) · "Apply for leave on Monday" (C → leave approver) |
| LIBRARIAN | "Issue *Atlas* to Ayesha" · "Return LB-0042" · "Renew Bilal's loan by a week" · "Add 3 copies of *Atlas*" |
| RECEPTIONIST | "Check in a visitor for the principal" · "Log a call from Mrs Khan" · "Log post for the accounts office" · "New admission enquiry" |
| ACCOUNTANT | "Record a cash payment" (C) · "Invoices for Grade 5, November" (C) · "Who owes more than 2 months?" (A, answered) |
| PRINCIPAL | "Cover for Ms Noor, periods 2–4 today" · "Mid-term session plan" · "Open Exam Studio for Grade 9 Physics" (deep link) |
| ADMIN / CAMPUS_ADMIN | "Add Grade 11 with 2 sections" · "Invite 3 teachers" · "Add a holiday on 12 Nov" · "Message Grade 6 families about the trip" (C) |
| SUPER_ADMIN | "Add a campus in Lahore" · "Who runs each campus?" (answered) · "Invite a campus admin for Gulberg" (C-self) |
| PARENT | "Tell the school Hamza is absent tomorrow" (`parent.explain_absence`/`family.request_leave`) · "Book a meeting with Hamza's class teacher" · "What's due this week?" (answered) |
| STUDENT | "Save my study plan for the Physics test" · "Ask a study question" · "What's due this week?" |
| APP_OWNER | "Which schools are on trial?" (answered) · "Update the city for school X" |

Every chip resolves to a registry key. A chip is shown only if that key's adapter exists **and** the user's gate passes right now. The chip list is the visible proof of "if that role has that feature".

### 6.3 Missing details

See §3.4. Each card states its own completeness, for example "2 of 3 details filled". Nothing runs while a required field is `missing`.

### 6.4 Progress

`ProgressRibbon` (§5.6 rules) appears at the top of every `RunSheet`.

### 6.5 Receipts

`ReceiptRow` shows:
- the title,
- the counts,
- the kind badge (`Saved` / `Read` / `Draft` / `Queued`),
- the timestamp,
- one primary link to the real record,
- a "Copy receipt id" item in an overflow `Menu`.

A **read** receipt never uses a tick icon. It uses an eye icon with "Looked up". A **draft** uses a document icon with "Draft, not applied".

### 6.6 History

`RunHistory` uses `ViewTabs`: *Needs you · With others · Done · Stopped*. Rows show the request, the outcome badge, receipt count and when. History is server-side (the last 20 is too few, `service.ts:36`), so it paginates. Retention follows the architecture decision.

### 6.7 "What AI can do here" and honest gaps

`CapabilityAtlas` (§2.10). In addition, every `NotYetCard` records a structured "asked but not connected" event, so the founder gets a ranked list of the next adapters to build. This closes the B.engine finding that unsupported requests are free text only.

---

## 7. Accessibility and design-system gate constraints

### 7.1 Keyboard

- The `OutcomeBar` is a labelled `form` landmark ("Ask AI"). Enter sends; Shift+Enter adds a new line. The global open shortcut is verified against existing bindings and can be turned off in settings.
- Suggestion chips are a roving-tabindex toolbar: arrow keys move, and arrow direction mirrors in RTL.
- In the `TaskCard`, Tab order is: first `needs you` field → other fields → `ConfirmBar`. `Esc` closes the sheet (not the run) and returns focus to the trigger (chip or bar) through `returnFocusTo`.
- The `ConfirmBar` button is never auto-focused. This prevents an accidental Enter-to-confirm right after typing.

### 7.2 Screen reader

- One `role="status"` live region per `RunSheet`. It announces **receipts and state changes only**, never every poll tick. Examples: "Register saved. 31 present, 2 absent."
- `role="alert"` (assertive) only for FAILED, access changed and stale preview. `Alert`'s politeness default already does this (`alert.tsx:54`).
- Provenance chips are part of each field's accessible description. Example: "Status, absent, from your words: Ali and Sara absent".
- The ribbon is an ordered list with `aria-current="step"` on the running row. It is not a `progressbar` with a percentage.

### 7.3 Reduced motion

- Ribbon rows change state without animation.
- `AiGuide` runs with `paused` (`AiGuide.tsx:12`).
- `SealSlot` switches without the press animation.
- `Progress` already has `motion-reduce:transition-none` (`progress.tsx:52`).

### 7.4 Focus return

| Event | Focus moves to |
|---|---|
| Sheet close | The trigger |
| Confirm success | The new receipt's heading |
| A question appears | Its first `needs you` field |
| Build finishes | The `WorkspaceReady` h1 (`InkHeading`) |
| A stale preview refreshes | The first changed row |

### 7.5 Targets, type and RTL

- Touch targets are at least 44 px (`min-h-12` as in `confirm-action.tsx:157`).
- Urdu uses the Nastaliq line-height handling from `urdu-input.tsx`.
- Logical properties only. Directional icons use `rtl:rotate-180`.
- Each time/money/id value is wrapped in `<bdi>`.

### 7.6 Gate (`npm run check:ui`, `tests/design-system/adoption.test.ts`)

- Tokens only. No mapped hex, no tiny px font sizes, no `font-black`.
- Toasts only through `@/components/ui/toast`, never `sonner` directly.
- Shared `FormField`/inputs and the shared focus ring. No new `ModalFrame`/`DialogContent` forks: use `ModalSurface`.
- No `title=` tooltips.
- `data-*` anchors on every interactive automation element: `data-ai-bar`, `data-ai-chip`, `data-ai-card`, `data-ai-confirm`, `data-ai-receipt`, `data-ai-handoff`, `data-build`. B.qa notes that the current component has none.
- Run `scripts/ui-token-codemod.ts` on new files.
- New primitives (`Stepper`, `TagList`, `GradeSectionGrid`, `SubjectMatrix`, `PeriodBuilder`, `AvailabilityGrid`, `RosterTable`) are generic, so they go to `src/components/ui/` (or `onboarding/` if Charter-Desk specific), with stories at 360/768/1440 in EN/AR/UR.

---

## 8. Honest-progress rules (enforced in code, not just copy)

1. **No receipt, no tick.** `StepView.state = "done"` is set only by the server when a write receipt exists. The client may never set it optimistically.
2. **Reads and drafts are not done.** Read → "Looked up". Draft → "Saved as a draft. Nothing in the school changed." The run outcome follows `validation.ts:12-17` plus the new `awaiting_approval` / `partial` outcomes.
3. **Queued ≠ delivered.** Communications show "Queued" until a delivery event, and skips are always counted and explained.
4. **Prepared ≠ approved.** Class C shows the status stepper with server timestamps only. "Notified" ≠ "seen".
5. **Pending invitations are not people.** "9 invitations sent · 0 accepted", never "9 staff added".
6. **No percentages over unequal work.** Use counts ("5 of 7 created").
7. **Time honesty.** After 8 s with no server change, say so. After 60 s, say nothing new was saved and offer Retry. Never spin silently through a 120 s lease (B.engine timeout finding).
8. **Animation never leads the server.** Motion starts on a server event (step running) and ends on a server event (receipt). It never runs on a timer. This applies `prd-revised.md:82` as cited in rule 15.
9. **Cancel and pause tell you what already ran.** "2 steps had already run; they are kept."
10. **Practice mode is labelled on every card** while the release gate is closed or the prototype fallback is active, and its receipts say "Example, not saved".
11. **The wizard and the sheet promise only what is true** (§5.5 copy).

A Playwright helper `expectNoPrematureDone(page)` asserts that no `[data-ai-receipt]` tick appears before the network response containing its receipt id. It runs in every browser spec of these surfaces.

---

## 9. The LEAP five-minute demo arc

Run it on a seeded demo tenant (an extension of `scripts/demo/seed-*`) with two devices on stage: a laptop at 1440 and a phone at 390, mirrored. If the release gate is still closed, every screen carries the Practice mode label; no evaluation is invented (rule 12). All claims use "built", "bound" and "not measured".

| Time | Who / device | Screen | What the audience sees |
|---|---|---|---|
| 0:00–0:40 | SUPER_ADMIN, laptop, EN | `WorkspaceSheet` group → `GroupLaunchBoard` | Three campuses typed as tags. "Build" creates 3 campus records (receipts) and puts 3 admin invitations on People & access. The board shows "Invitation sent · not accepted". |
| 0:40–1:50 | CAMPUS_ADMIN (Gulberg), laptop, AR (RTL) | `WorkspaceSheet` campus → `BuildMoment` → ribbon | Year and weekends arrive as `known`. Grades are filled in the grid and subjects with "same as previous grade". Build shows the ribbon filling row by row with receipts. Fees show "Prepared → Accountant". `SealSlot` presses. |
| 1:50–2:50 | TEACHER, phone, UR | Today → chip → `TaskCard` → confirm | Signature moment 1 against a visible 20-second timer: the Ali ambiguity, then the receipt. Then she types "yes" in the bar on a second card, and the hint shows that typing yes saves nothing. |
| 2:50–3:30 | LIBRARIAN, phone, EN | Bar: "Issue Atlas to Ayesha till Friday" | Copy + member resolved with `from school records` chips. Class A runs (or B per registry). Receipt with the loan link. |
| 3:30–4:20 | ACCOUNTANT → approver, phone + laptop | `HandoffCard` → notification → `PreparedByAiPanel` | Signature moment 3: matching preview code `4F2A` on both screens. Approve happens on the existing Finance screen, and the requester's card flips to "Approved by Farah · 14:02". |
| 4:20–4:45 | PARENT, phone, UR | `WorkspaceSheet` parent (2 sheets) → first chip | Children `known`. Channel preferences. "Hamza is absent tomorrow" → request sent to the school, with the receipt labelled "Sent to school · decision pending". |
| 4:45–5:00 | Any role | `NotYetCard` + `CapabilityAtlas` | "Publishing results is done by the principal. Your request was not sent anywhere." The atlas shows what is connected and what is not. The close: "It says what it did, and what it didn't." |

---

## 10. What is bold, and what it costs

### Bold

- **The card is the approval, so the chat is not.** Making confirmation a property of a bound, effect-labelled control turns B.decisions rules 3 and 5 into something a user can feel, instead of a hidden server check.
- **Provenance chips on every field** show the user the evidence the engine already requires (`evidenceQuote`). This turns a brittle substring gate into a visible, structured trust signal.
- **No essays in onboarding.** Eighteen free-text keys become typed inputs that map one to one onto registry inputs. "The system is generated" then becomes true for every item the sheet asks about, and the items it cannot build are listed honestly.
- **One composer everywhere**, which retires three look-alike AI surfaces.
- **The group owner finally gets a first-login experience** (`GroupLaunchBoard`).
- **"Not connected yet" is a feature.** It is visible, it deep-links, and it is counted.

### Costs and trade-offs

- **Every capability needs a `uiSchema` next to its adapter**, not just a zod input. That is roughly 15–25 lines per adapter, multiplied by the 700-row inventory as coverage grows. It is mitigated by a field-kind library and by generating defaults from zod.
- **Suggestion computation is per role and per request**, which means server work and needs caching (per user, about 60 s).
- **New engine states and outcomes**: `WAITING_CONFIRM`, `CANCELLED`, `awaiting_approval`, `partial`, structured `pauseReason`/`blockReason`. These need the architecture track and SKO-470 alignment.
- **Approver embedding** touches every existing approval screen that receives class C. Start with Finance operations, Fees, Leave, Announcements and People & access.
- **Copy volume**: about 120 new catalogued strings × 3 languages, plus server error codes. Arabic plural rules are mandatory.
- **Risk of over-scoping the demo.** Slices must ship in order: shell and states → teacher register → Build for ADMIN → hand-off → parent → group.

### Build order this design implies

1. `RunView` + `RunSheet` + `ProgressRibbon` + `ReceiptList` on today's engine, with no timer-driven execution and honest states. Nothing regresses.
2. `TaskCard` + `ConfirmBar` + `WAITING_CONFIRM`, plus the field library.
3. `OutcomeBar` + `SuggestionRail` + `CapabilityAtlas`, replacing the `/teacher/ai` and `?view=ai` composers.
4. Teacher register adapter + chip (LEAP moment 1).
5. `WorkspaceSheet` framework + new primitives + ADMIN campus variant + `BuildMoment`/`WorkspaceReady` + wizard copy fix.
6. `HandoffCard` + `PreparedByAiPanel` on Finance/Fees/Leave.
7. TEACHER, PARENT, SUPER_ADMIN (`GroupLaunchBoard`) sheets, then the remaining roles.
8. Demo seed + browser specs at 360/768/1440 × EN/AR/UR + `expectNoPrematureDone`.


**Key decisions**
- One OutcomeBar composer on every console's Today page and /ai replaces the three look-alike AI surfaces (AutomaticWorkspace, AiActionPanel insights, private assistant); insight drafts survive as a class-A plan_saved capability family.
- Requests resolve into a TaskCard: a per-capability structured mini-form. The registry declares its uiSchema; the model only fills values; every field carries a provenance chip (from your words / from school records / default / needs you) that makes evidence visible.
- Suggestion chips carry prefill and skip the planning call; a chip appears only if the adapter exists and the user's gate passes now, so the rail is the visible list of what that role can do.
- Class B confirmation lives on the card, not in chat: an effect-and-count button label ("Save register · 31 present, 2 absent"), a visible 4-character preview code from previewHash, edits invalidate the preview, typed or spoken 'yes' is ignored with an inline hint, and the server accepts only confirm{pendingKey, previewHash, version}.
- Class C is a HandoffCard with a server-timestamped status stepper (prepared → notified → opened → approved/returned); approvers see a PreparedByAiPanel embedded above the existing domain approve controls (never an inline approve in notifications); the AI never self-approves class C; a 'C-self' variant handles access grants and consent the user owns, by pre-filling the domain screen.
- Client stops driving execution with a 600 ms timer; the server/worker advances class A, class B stops at WAITING_CONFIRM; the UI subscribes with backoff and shows explicit 8 s / 60 s honesty messages instead of silent lease spins.
- New UI-facing engine states/outcomes requested from architecture: WAITING_CONFIRM, CANCELLED, outcomes awaiting_approval and partial, structured pauseReason (user/credits/step_cap/subscription/access_changed) and blockReason (not_connected/not_your_role/policy_separation/seat_held/gate_closed).
- First-login questionnaire becomes a per-role WorkspaceSheet of typed inputs only (known, pick, stepper, tags, grid, matrix, week, dayShape, table via importBatch review, people, availability); no free-text answers; every fact the wizard, registration or records already hold renders as a ConfirmedChoice 'known' item.
- Build my workspace is a single batch confirm bound to {questionnaireId, version, planHash} over a three-article ReviewSheet: what Build creates (A/B), what is prepared for others (C), what you still need to do. The wizard copy changes to 'Nothing is created until you press Build'.
- Progress ribbon uses counts, never percentages, and ticks a row only from a server write receipt; reads show 'Looked up', drafts 'Draft, not applied', communications 'Queued' until delivery, invitations 'sent · 0 accepted'.
- SUPER_ADMIN gets a group WorkspaceSheet (campuses, who runs each, standards) that creates campus records (B), hands campus-admin invitations to People & access (C-self), and lands on a GroupLaunchBoard tracking each campus admin's sheet.
- Teacher never assigns own classes; missing allocations become a coordinator hand-off or Still-to-do row. Parents never infer child links; a missing child becomes a front-desk request.
- Every interactive automation element gets data-ai-* anchors; a Playwright helper expectNoPrematureDone asserts no receipt tick renders before the network response with its receipt id.
- Unsupported requests render a NotYetCard that names the screen or role and records a structured 'asked but not connected' event to rank the next adapters.

**Risks**
- Every capability now needs a uiSchema beside its zod schema; without generating defaults from zod and a shared field-kind library, adapter cost per capability rises and coverage of the 700-row inventory slows.
- The design depends on engine changes not yet built (WAITING_CONFIRM, CANCELLED, awaiting_approval/partial outcomes, structured block/pause reasons, persisted plan with dependsOn, server-derived RunView); if the architecture track or SKO-470 diverges, the UI states must be remapped.
- Embedding PreparedByAiPanel in existing approval screens (Finance operations, Fees, Leave, Announcements, People & access) touches surfaces owned by other tickets and may conflict with SKO-470's approval UI.
- Suggestion rail personalization is per-user server work (timetable, pending registers, overdue loans); without caching it can slow Today pages; stale chips could offer a capability whose gate just changed (mitigated by re-checking at card open).
- Roster-exceptions attendance from free text depends on reliable name-to-entity resolution in Urdu/Arabic transliteration; ambiguous matches must always surface as a choice, never a silent pick, or the teacher's 20-second flow becomes untrustworthy.
- The release gate is closed (no educator-reviewed evaluation); a LEAP demo must run in labelled Practice mode on a seeded tenant unless a real evaluation is recorded in time. The demo must not imply live autonomy.
- Copy volume (~120 new strings × EN/AR/UR, Arabic plural rules, server error codes replacing English-only SchoolAiError messages) is easy to underestimate and blocks RTL QA.
- A global composer shortcut (proposed Ctrl/Cmd+K) may collide with existing bindings; this has not been verified.
- Batch confirm at Build covers many class B writes with one press; if planHash binding or the plan preview is incomplete, users could confirm more than they reviewed. The preview must be exhaustive, with counts.
- Teacher and parent sheets produce few school records by design (preferences, private plans, hand-offs); stakeholders expecting 'the system generated for every role' may read this as thin unless WorkspaceReady and the demo frame it honestly.

**Effort**: Rough person-days for UI/interaction work only. Assumptions: one senior front-end engineer working with the architecture track (which owns the engine state, registry and adapters), shared primitives reused where they exist, EN/AR/UR copy drafted by engineering and reviewed by translators (translator time not counted), and estimates not measured against past velocity.
- RunView mapping + RunSheet + ProgressRibbon + ReceiptList + all §3 states and copy, with timer-driven execution removed: 6
- TaskCard + field-kind library (entity, date/time/period, stepper, choice, roster-exceptions, money, text) + provenance chips + uiSchema renderer: 8
- ConfirmBar + stale-preview diff + "yes is not enough" bar hint + focus handling: 3
- OutcomeBar + SuggestionRail (client) + global shortcut + mounting on 10 Today pages and replacing the /teacher/ai and ?view=ai composers: 5
- CapabilityAtlas + NotYetCard: 3
- AiWorkflowsHome rework (Needs you / With others / Done / History with ViewTabs, pagination): 4
- HandoffCard + PreparedByAiPanel + embedding in Finance operations, Fees, Leave, Announcements, People & access: 6
- WorkspaceSheet framework (routing, prefill-to-known, skip/return, Today card, versioning UI): 5
- New primitives (Stepper, TagList, GradeSectionGrid, SubjectMatrix, PeriodBuilder, AvailabilityGrid, RosterTable on importBatch review), each with RTL and 360/768/1440 checks: 10
- BuildMoment + WorkspaceReady + wizard copy fix: 4
- Role variants: ADMIN/CAMPUS_ADMIN 3, TEACHER 2, PARENT 1.5, SUPER_ADMIN + GroupLaunchBoard 4, PRINCIPAL/ACCOUNTANT/LIBRARIAN/RECEPTIONIST/STUDENT/APP_OWNER 5 (total 15.5)
- Accessibility pass (live regions, roving toolbar, focus return, reduced motion) + check:ui compliance + data-ai-* anchors: 4
- Copy catalog (~120 strings × 3 languages) + server error-code mapping, engineering side: 4
- Playwright specs (360/768/1440 × EN/AR/UR, expectNoPrematureDone, confirm binding, hand-off flow) with screenshots in the scratchpad: 7
- LEAP demo seed + rehearsal polish: 3
Total about 87.5 person-days of UI/interaction work. Server-side suggestion computation, new engine states, adapters and the approval-surface back end are excluded; they belong to the architecture and adapter estimates. Demo-critical subset (moments 1–3 for teacher, ADMIN Build and accountant hand-off, without the remaining role variants): about 50 person-days.
