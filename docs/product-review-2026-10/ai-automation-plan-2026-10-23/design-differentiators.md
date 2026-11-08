# AI Workflows and First-Login Setup: what is distinctive and what can be claimed at LEAP

# AI Workflows and First-Login Setup: what is distinctive and what can be claimed at LEAP

Read-only analysis, 2026-10-23. No repository files were changed. This is product positioning in plain words. It is **not legal advice**: "defensible" here means hard for a competitor to copy quickly and backed by evidence the product records. Whether any of it can be patented is a question for counsel and a professional prior-art search.

Claim-language rule 24 applies throughout (`appendix-b-audit-reports.md:895`): say "built", "bound", "estimate", "not measured". Never say "first", "only", "cheat-proof" or "autonomous".

---

## 0 What I checked before writing

- **Hash-bound execution already exists, for the 15 typed operations only.** `src/lib/school-ai/execution.ts:55` requires a 64-hex `previewHash`. The preview is recomputed and compared inside the transaction (`:265`, `:275`, `:286` → `STALE_EXECUTION_PREVIEW`). A reused key with a different preview is refused (`:248` → `EXECUTION_KEY_CONFLICT`). Each execution is written as a `SchoolAiExecution` row with record version, operation, hash and receipt (`:267`). This came from SKO-470. The new design **extends** it to about 700 capabilities. It does not invent it.
- **Today the automation engine bypasses all of that.**
  - It self-approves its own record (`src/lib/automation/service.ts:81`).
  - The "ask before sending, deleting or granting access" rule lives only inside the system-prompt text (`service.ts:132`).
  - The only evidence check is a substring test: `text.includes(decision.evidenceQuote)` (`service.ts:152`).

  So every safety property in this document is **designed, not built**, until its slice ships.
- **The release gate is closed** (`src/config/ai-release-evaluation.ts:3-7`, rule 12). Any LEAP sentence about real schools has to wait for an educator-reviewed evaluation to be recorded.

---

## 1 What is actually distinctive (honest version)

### 1.1 What is NOT distinctive (say this to yourself before saying anything on stage)

- **A chat box that calls tools.** Every major SIS/LMS vendor and every general-purpose copilot either has one or is building one.
- **"Human in the loop" confirmations.** Confirm cards, approval queues, maker-checker, four-eyes rules and Terraform-style plan/apply are long-established in banking, DevOps and ERP.
- **Idempotency keys, audit logs, role-based access, PII masking.** Standard engineering.
- **An onboarding questionnaire that sets things up.** Setup wizards that generate configuration are common, and the current Skoolee wizard already creates the academic year (`setup-service.ts:419-425`).
- **Multilingual UI with RTL.** Many products do this. It still matters in Pakistan and the Gulf, but it is not a moat.

### 1.2 What is distinctive: the combination, enforced in code, across a whole school product

Generic "AI copilot" school software usually works like this:
- the model picks a tool by name;
- safety rules are prompt text;
- the copilot covers a curated handful of actions;
- the UI says "Done" when the model says so;
- setup is a generic wizard, the same for everyone.

This design differs in six concrete ways.

1. **The approval class belongs to the capability, not to the conversation.** Each of about 700 inventory capabilities has a static A/B/C class, with a floor set by its risk type (architecture §6.2). It can only be escalated (A→B→C), never lowered by the model. Class C is a TypeScript type that has no `execute` member at all. "Ask before sending" moves from a prompt sentence (`service.ts:132`) into the type system and a build lint.
2. **Coverage is tied to the real write surface, with a ratchet.** An AST scanner lists every POST/PUT/PATCH/DELETE handler, sub-action and server action across the 489 route files. The build fails if a write path is neither registered nor excluded with a reason (architecture §8.3). The "AI is connected to n of m things you can do" number on `/ai/can-do` is produced by that same registry. It is not marketing copy. Competitors generally cannot say what share of their product's write surface their AI reaches. Skoolee will be able to, and the number is published per role.
3. **Most of the coverage is honest hand-off, not autonomy.** Of the roughly 700 capabilities, about 287 (provisional) are class C. The engine prepares a domain request, a prefilled screen or an approval record. The person with authority then presses that screen's own button, and the same 4-character preview code appears on both screens. The product treats "prepared, with Farah" as a first-class outcome, with its own state, receipt, timeline and approver inbox. Most copilots treat that as either a failure or a success.
4. **Receipts decide what the screen may claim.**
   - The UI may only show a tick, an inked ledger row or a pressed seal when a server receipt exists, and that receipt's ids have been read back under the tenant guard (`verify()`, architecture §7.2).
   - A dev-time assertion and a Playwright helper (`expectNoPrematureDone`) enforce this (UX §4.3).
   - Reads, drafts, queued messages and pending invitations each get their own word, and none of them counts as "Done".
5. **The first-login sheet is a typed program per role, compiled without a model.**
   - Each of the 11 roles has its own sheet: chips, steppers, grids and tables, not essays.
   - A deterministic compiler turns the answers into the same plan and executor that free-text requests use.
   - Facts already known are prefilled and confirmed, never asked again.
   - Work that needs a seat the user does not hold becomes a task for the person who holds it.
   - Readiness is computed from live records, not from "questionnaire finished".
6. **Evidence is bound to what the user wrote.**
   - Each consequential field must point to an offset in text the user wrote. That evidence is stored in `AiWorkflowSegment`; server-rendered text and school data never count as evidence.
   - Dates and amounts additionally need a server parse that agrees.
   - In the questionnaire, a pressed chip is its own evidence.
   - This replaces today's substring test (`service.ts:152`). It is also the main defence when injected record text asks for privileged work.

### 1.3 Where the design is weaker than it sounds (say internally, fix before LEAP)

- **"Any role can ask for anything" depends on adapter count.** At W1 the plan reaches about 65 entries, and TEACHER has 151 capabilities. The `/ai/can-do` number will be small at LEAP. Show it anyway: honesty is the differentiator. Never use the placeholder "38 of 151" from UX §1.2 unless the registry actually says so.
- **Free-text name masking stays heuristic** (architecture D9). The privacy claim must stay at UX §4.3 rule 14 wording ("names you pick with @ or from the page are hidden from the AI provider").
- **The two design documents disagree in places.** Align these before slicing, or the demo will show an inconsistency:
  - Confirm endpoint: UX §5.1 uses `POST /api/automation/{runId}/confirm`; architecture §6.3 uses `POST /api/ai-workflows/[jobId]/commands`.
  - State names: the UX `RunView.status` has 9 values; the architecture has 14 job states.
  - The accountant payment beat: UX §10.1 uses `finance.apply_operation` (RECORD_APPROVAL); architecture W1 and D2 default to `fees.collect_payment` as a Collect-desk DOMAIN_SCREEN.
  - Slice numbering: architecture S1 is the registry core; UX S1 is the honest shell.

---

## 2 Candidate defensible mechanisms

Each entry says what the mechanism is, why it is not obvious, what evidence the product records, and the prior-art risk. Ranked by how much they differentiate **and** how much proof they produce.

### M1 Static confirmation classes, bound to a preview hash, with a type-level "cannot execute"

**Mechanism.**
- Each capability's class (A auto-run, B confirm the exact preview, C hand off) is fixed in a code registry, with a floor derived from its risk category.
- `effectiveClass()` can only escalate, never lower. Triggers: a batch over `autoRunMax`, or the school's separation-of-duties policy.
- A class-B confirmation is a database row tied to step, preview version, preview hash and job version. The preview is recomputed inside the execution transaction. A different hash voids the confirmation and the step goes STALE.
- A typed or spoken "yes" is intercepted on the client and costs nothing. The server rejects `answer` while a step is waiting for confirmation.
- Class C has no `execute` member, checked by type, AST lint and runtime.

**Why it is non-obvious.**
- The usual agent design lets the model, or a per-conversation setting, decide when to ask.
- Here, no field the model writes is ever read as a class. A phrase is never an approval. The class only moves toward more caution, and the school's own policy can push it to C.
- It is unusual to make "the AI cannot do this" a compile-time fact rather than a runtime check.

**Evidence recorded.**
- `AiWorkflowConfirmation` (hash, version, confirmer, clientCommandId);
- audit rows on `ai_workflow_steps` (class, previewHash, confirmedById);
- STALE transitions;
- the metric "wrong-class attempts (effective = 0)";
- the red-team suite asserting zero effective writes.

**Prior-art risk:** high for the parts (plan/apply hashes, maker-checker, confirm cards). Moderate for the specific combination of static registry classes, escalate-only rules, type-level non-execution and phrase rejection.

### M2 Registry-derived coverage ratchet and authorization lint

**Mechanism.**
- A ts-morph scanner enumerates every write handler, sub-action and server action. Each must map to a registry entry or to a reasoned exclusion.
- A committed baseline can only shrink.
- Each entry's gate must list ⊇ the guard helpers found in both the source route and the service. Unknown helpers fail closed, and roles may not be wider than the inventory.
- The generated matrix tests each role × capability cell for denial (403, zero rows), revocation between preview and execute, `accessVersion` bump, foreign campus, cross-tenant pair, replay and kill-recovery.

**Why it is non-obvious.** AI tool catalogues are normally hand-curated and drift silently from the real permission model. Here the AI's permission surface is mechanically derived from, and checked against, the application's own route guards on every build, so the AI cannot quietly do more than the screen allows.

**Evidence recorded.**
- `generated/coverage.md` and `route-coverage.json` (hash-checked);
- `capability-baseline.json` history (a monotone ratchet in git);
- `registry/tightenings.ts` with tickets;
- the matrix test results per shard.

**Prior-art risk:** moderate. Route scanners and permission linters exist. Generating an AI capability surface and its authorization tests from them is less common.

### M3 Role questionnaires compiled into capability plans, with seat-aware routing and live readiness

**Mechanism.**
- Each role's sheet is a typed definition. Every question declares `produces: registry keys`, and a lint deletes any question that produces nothing the role can do or route.
- Known facts come from the wizard, invitation, allocations and verified guardian links, and are shown as confirmed chips.
- A deterministic compiler, with no model call, turns answers into a plan. The plan runs on the same executor and classes as free-text requests.
- Work needing a seat the user does not hold becomes a ROLE_TASK for the holder. Seats are never widened.
- Editing an answer recompiles and shows a step diff. Only changed steps are superseded; committed steps stay.
- Readiness is computed from live records.

**Why it is non-obvious.** Setup wizards usually either write configuration directly or call an LLM on prose answers. Making every question compile into the same authorization-checked capability plan as free-text requests, and routing cross-seat work to the right person, is a design choice most products do not make. Being able to prove each question's effect ("why I need this", ghost rows for skipped questions) follows from that choice.

**Evidence recorded.**
- `AiSetupResponse` (definition version, answer version, `confirmedKeys`);
- the job's `origin: QUESTIONNAIRE` + `setupResponseVersion`;
- plan diffs;
- ROLE_TASK hand-offs;
- the readiness board computed from live counts;
- "AI actions used vs. estimate".

**Prior-art risk:** moderate. Role-based onboarding is common. A deterministic answer → capability-plan compiler sharing an executor with free-text automation is less common.

### M4 Evidence binding to user-authored segments, with an agreeing server parse

**Mechanism.**
- User-authored text (the request, answers, questionnaire cells) is stored as segments.
- Each consequential field in a step (status, amount, date, reason) must cite offsets in a segment, matched after EN/AR/UR normalisation (Arabic/Urdu letter folding, digit conversion, tatweel and ZWNJ removal).
- Derived values also need a server-side parse that agrees, for example "کل" → tomorrow in the campus timezone.
- School data and server-rendered text can never be evidence.
- A failed match turns the field into a question, not a guess.
- Attendance needs an explicit "rest present" rule quote. Otherwise the user gets a count question and an explicit "Mark the other N present" button.

**Why it is non-obvious.** Grounding usually means citing sources for answers. Here grounding authorises writes: the evidence base is restricted to the user's own words, which also defeats injection through book titles or leave reasons. It works across three scripts.

**Evidence recorded.** `AiWorkflowSegment` rows and the step's `evidence` offsets and `inputProvenance` (user/resolved/default/context). Provenance chips in the UI ("from your words: …"). Red-team results.

**Prior-art risk:** moderate for "quote-to-act". Lower for the multi-script normalisation plus agreeing-parse rule.

### M5 Honest outcomes: receipts read back under the tenant guard, plus a write-ahead intent ledger

**Mechanism.**
- Before a service call, an intent row is written. After the call, ids are read back under `runWithTenantContext`.
- If the process crashes mid-call:
  - a found effect is RECONCILED;
  - an unfound effect becomes UNCERTAIN, and retry is disabled until a human checks. It is never blindly re-run.
- The job outcome is computed from receipts only (EXECUTED / AWAITING_APPROVAL / PARTIAL / ANSWERED / PLAN_SAVED / NOTHING_DONE).
- The UI may not render a tick, an inked row or a seal without a receipt.
- "Queued", "pending until accepted" and "requested; the school decides" are distinct states.

**Why it is non-obvious.** Copilots usually treat a successful tool call, or the model's own statement, as completion. Refusing to say "done" without a verified write, and adding a human-checked UNCERTAIN state, puts reliability ahead of how smooth the experience looks. Most demo-driven products choose the opposite.

**Evidence recorded.** `AiWorkflowIntent` states; `SchoolAiExecution` for typed ops; `verified: true/false` on receipts; FAILED_UNVERIFIED alerts; the UNCERTAIN count metric; Playwright `expectNoPrematureDone` results.

**Prior-art risk:** high for the ledger pattern itself (the outbox and saga patterns). Low-to-moderate for using it as a UI honesty contract.

### M6 Single-use, actor-bound hand-offs with the same code on both screens

**Mechanism.**
- A class-C step prepares a hand-off of one of five kinds.
- For screen hand-offs:
  - the approver must **claim** it (compare-and-set, 15-minute expiry);
  - the domain route calls `completeHandoff()` in the same transaction as its own write, checking claimant, expiry, prefill hash and that the domain row exists;
  - keyed routes use the hand-off's idempotency key, so two claimers cannot double-post a payment.
- Human edits are recorded as COMPLETED_WITH_CHANGES with a field diff.
- The requester sees a timeline whose stages appear only when true. "Opened" appears only if the screen records a view.

**Why it is non-obvious.** Most AI approval flows either approve inside the chat or drop the user on a generic screen. Binding the AI's prepared values to the domain's own approve control, recording what the human changed, and naming the eligible approver instead of a silent 403, is a specific integration.

**Evidence recorded.** `AiWorkflowHandoff` (claim, completion model/id, diff, prefillHash); `PreparedByAiPanel` showing the matching code; the approver inbox; audit rows for create, claim and complete.

**Prior-art risk:** moderate. Approval routing is common. The claim/hash/diff binding to existing screens is less common.

### M7 Policy masking by entity kind, with a delimited school-data channel

**Mechanism.**
- School vocabulary (class, section, subject, room, period, fee head, book title) passes through to the model in clear.
- People (student, staff, guardian, member) become tokens.
- Contact details and ids are removed.
- Free-text names are matched against the campus names the actor is allowed to see, with Unicode word boundaries and transliteration.
- School-authored text travels only inside `context.quotedData` and can never become evidence or select a capability.
- Rosters and lookup dumps never enter prompts.

**Why it is non-obvious.** Generic masking either masks too much, as today: `className` and `subjectName` become `[PERSON_n]` because of `pseudonymize.ts:36-37`, which breaks planning. Or it masks too little. Kind-aware masking keeps the model useful while people stay tokenised.

**Evidence recorded.** `scanForPII`/`assertNoPII` results on every final prompt; masker golden tests; the live-smoke metric "PII egress hits = 0"; `AiWorkflowEvent` payloads scanned for PII.

**Prior-art risk:** high. PII redaction is a crowded field. Keep this as a trust story rather than a moat.

### M8 Capability-gap telemetry that drives the roadmap

**Mechanism.** Every request the registry cannot serve is classified as one of:
- not in your role, with who can do it;
- not connected;
- excluded;
- seat held by someone else;
- ambiguous.

It is stored as a masked, counted `AiCapabilityGap` with the nearest capability key. Wave W4 is ordered by that demand.

**Why it is non-obvious.** Most products hide unsupported requests behind a generic refusal. Recording them as structured demand turns honesty into a ranked list of what to build next.

**Evidence recorded.** `AiCapabilityGap` counts per role and language; the trend in coverage against demand.

**Prior-art risk:** high. This is product analytics. Its value is speed of iteration, not protection.

**Recommendation.**
- **M1, M2 and M3 are the core story.** They are the hardest to copy because each one depends on the registry and on a full inventory of about 700 capabilities, and that inventory took audit work to produce.
- **M4 and M6 are strong supporting mechanisms.**
- **M5, M7 and M8 are trust features.** Present them as engineering quality, not as inventions.
- If the founder wants to pursue IP protection, capture invention disclosures (date, author, design doc, commit) for M1, M2, M3, M4 and M6 **before** LEAP. Public demonstration can affect what is protectable in some jurisdictions. Counsel decides.

---

## 3 The three LEAP sentences

Each sentence is true only once the named milestone has shipped and been verified on the synthetic demo tenant. Before the release gate is closed, every claim runs in labelled Practice mode on a synthetic tenant.

### 3.1 After Slice 1

"Slice 1" means two different things in the two documents. The safe sentence relies only on what **both** Slice 1s deliver together: architecture S0–S1 (inventory, registry core, lint, pseudonymiser fix) and UX S1 (honest shell, 600 ms timer deleted, receipt gating).

> **"We mapped every change a person can make in Skoolee, about seven hundred of them, into one registry, and the build now fails if a new one appears without a declared role and approval class; and on screen, nothing is shown as saved until the database returns a receipt."**

Do not say yet:
- "the AI asks you to confirm". The `service.ts:81` self-approve is only removed in architecture S4.
- "class and subject names reach the AI". True only if the pseudonymiser fix has merged.
- any per-role coverage number. Not computed until the registry is populated.

### 3.2 After the teacher slice

This assumes architecture S2–S4 plus S6's teacher and librarian slice, and UX S2 + S4: `attendance.save_register` as class B with per-pupil evidence.

> **"A teacher can type 'Ali and Sara are absent' in Urdu on her phone, check the exact register the AI prepared, and save it with one button that says what it does; typing 'yes' saves nothing, and every saved register has a receipt you can open."**

Rules:
- Quote a time ("about 20 seconds") only if it was measured on the stage device. Call it "measured on our demo phone", never "instant".
- Say the teacher coverage number only as the registry reports it ("AI is connected to n of 151 things a teacher can do"). It will be small, and that is fine.

### 3.3 After all slices (W0–W4)

> **"In Skoolee, anyone, in any of eleven roles, can ask in English, Arabic or Urdu for something their role allows; the AI does what is safe, asks you to check what matters, hands money, messages and access to the person who approves them with the same preview code on both screens, and shows a receipt for everything it did and an honest list of what it didn't."**

Rules:
- Add "on a real school" only after `CURRENT_AI_RELEASE_EVALUATION` records an educator-reviewed run (rule 12).
- Do not say "everything", "fully automatic" or "the whole school sets itself up". Roster import, guardian access, invitations (pending until accepted) and class-C items stay human by design.
- A safe closing line for any milestone, from UX §1.2: *"It shows what it did, what it didn't, and who decides."*

### 3.4 Phrases to keep off the stage

"first", "only", "autonomous", "fully automatic", "instant", "AI runs your school", "no human needed", "secure by design" (unmeasured), "all names are hidden" (free-text masking is heuristic), and "sent" for queued messages or invitations.

---

## 4 Evidence pack to prepare for LEAP

| Claim | Proof to have ready |
|---|---|
| ~700 capabilities registered or excluded | `generated/coverage.md` hash + the commit; ratchet baseline history |
| Phrase never approves | Red-team run: "approve and send", «جی», injected leave reason → 0 effective writes |
| Receipts gate the UI | Playwright `expectNoPrematureDone` report at 390/768/1440 × EN/AR/UR |
| Same code on both screens | Recorded run showing `PreviewCode` on HandoffCard and PreparedByAiPanel, plus the `AiWorkflowHandoff` row |
| Coverage number | Live `/ai/can-do` per role, screenshot dated the day before the show |
| Privacy | `scanForPII` egress metric from the live-smoke run (synthetic tenant) |
| Practice mode | Badge visible on every screen; release-gate status stated plainly if asked |


**Key decisions**
- Hash-bound execution is not new in this design: SKO-470 already binds the 15 typed operations to a preview hash (execution.ts:55,248,265-288). Present it as extended to about 700 capabilities, not invented.
- The core differentiation story is three mechanisms: static escalate-only confirmation classes where class C cannot execute at the type level (M1), a coverage and authorization ratchet derived from the registry (M2), and role questionnaires compiled into capability plans without a model (M3).
- Evidence binding to user-written segments (M4) and single-use, actor-bound hand-offs (M6) are strong supporting mechanisms. Receipts plus the intent ledger (M5), kind-aware masking (M7) and gap telemetry (M8) should be presented as trust and engineering quality, not as inventions.
- The 'n of m connected' number must come from the registry at runtime and be shown even when it is small. The '38 of 151' placeholder in UX §1.2 must not be used on stage unless it is the real figure.
- Each LEAP sentence is tied to the slice that makes it true. The after-Slice-1 sentence relies only on what both Slice 1 definitions deliver together, because the architecture and UX documents number their slices differently.
- Every stage claim runs in labelled Practice mode on the synthetic tenant until an educator-reviewed release evaluation is recorded (rule 12).
- If the founder wants IP protection, capture dated invention disclosures for M1/M2/M3/M4/M6 before the public LEAP demo; the protectability decision belongs to counsel.

**Risks**
- The architecture and UX documents disagree in four places: the confirm endpoint (/api/automation/{runId}/confirm vs /api/ai-workflows/[jobId]/commands), the state lists (9 statuses in RunView vs 14 job states), the accountant payment beat (finance.apply_operation RECORD_APPROVAL vs fees.collect_payment DOMAIN_SCREEN), and slice numbering. Unresolved, these can surface as visible inconsistencies in the demo.
- Prior-art exposure is high for the individual parts: plan/apply hashes, maker-checker, idempotency ledgers and PII redaction. Any defensibility lies in the combination and in the 700-capability registry, not in any one part.
- Coverage at LEAP will be modest (about 65 W1 entries against 151 teacher capabilities). If the honest number is presented badly, it reads as weakness rather than candour.
- Until architecture S4 ships, the self-approve at service.ts:81 and the prompt-only guard at service.ts:132 remain, so no 'the AI asks you to confirm' claim is true after Slice 1 alone.
- Free-text name masking is heuristic (D9). Any broad privacy claim on stage would be false; the wording must stay at 'names you pick with @ or from the page are hidden'.
- The release gate is closed (ai-release-evaluation.ts:3-7). Implying live use at real schools would contradict a fail-closed rule.
- Public demonstration at LEAP before disclosures are filed may affect patentability in some jurisdictions (needs counsel).

**Effort**: This analysis adds no new build scope; the mechanisms are already budgeted in the architecture (about 375 person-days in total, about 150 for the demo path). Extra work this analysis implies: (1) reconcile the four architecture/UX inconsistencies (endpoint, state lists, payment beat, slice numbering) in about 1.5 person-days. (2) Build the LEAP evidence pack (coverage.md snapshot, red-team report, Playwright receipt-gating report, a recorded hand-off run, per-role /ai/can-do screenshots, PII egress metric) in about 3 person-days, once S8 has shipped. (3) Write invention disclosures for M1/M2/M3/M4/M6 in about 2 person-days of engineering time; counsel's prior-art search is external and not estimated. (4) Review stage copy against claim rule 24 and the three milestone sentences in about 0.5 person-day. Total about 7 person-days, assuming the slices ship as planned and the demo tenant from S8 exists.
