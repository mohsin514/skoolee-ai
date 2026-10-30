# Flagship audit and proposed interaction contract

Review date: 15 October 2026. Scope: source review and live Linear review; no application changes, migration, provider call, test execution or production validation was performed for this audit. Existing uncommitted Exam Studio implementation is user work and was left unchanged. Proposed behavior below is not a shipped capability.

## Decision

Keep **Skoolee Exam Studio** as the flagship and make its memorable outcome: **“From an assessment to the next useful lesson, with evidence at every step.”** A teacher should be able to answer “What can I improve in my next ten minutes with this class?” from actual reviewed work, approve a feasible action, give the learner/family one useful next step, and later inspect what changed. The ambitious contribution is the connected, trustworthy experience and demonstrated teacher value; there is no evidence here for a first-ever or unique-in-the-world claim.

The user chose **global international schools plus Pakistani, Saudi and UAE schools from launch**. Present Exam Studio as an assessment/improvement layer that can work alongside a school's current SIS/LMS. Preserve this commercial scope while publishing a truthful capability matrix by curriculum/version, subject, grade, instructional language, source rights, delivery profile and tested integration. Pakistani board/Urdu and Saudi/UAE national/Arabic cohorts require explicit validation alongside international curricula; do not imply interchangeable board objectives, grading scales or language difficulty. Do not substitute “global” for verified support for every curriculum, device, language, residency arrangement or connector.

The live identifiers matter:

- [SKO-208](https://linear.app/skoolee-ai-app/issue/SKO-208) is the archived F61 design-system card. Its current canonical owner is [SKO-379](https://linear.app/skoolee-ai-app/issue/SKO-379). Keep design-system work there; SKO-408 owns the flagship.
- [SKO-408](https://linear.app/skoolee-ai-app/issue/SKO-408) is **[034] AI Exam Studio: flagship assessment, secure delivery and learning recovery**, F18. Its current 15 October specification already covers evidence, rehearsal, multilingual forms, mixed delivery, exception marking, recovery, control room and evidence exports.
- [SKO-425](https://linear.app/skoolee-ai-app/issue/SKO-425) already owns **Intervention ownership and reassessment**. A “Learning Action” is the concise product-facing name for its structured, versioned intervention contract, not a second independent record owner or another feature ticket.

## What already exists, and what does not

“Source confirmed” below means the named code was inspected, not that this session re-ran its tests or certified deployment.

| Capability | Source evidence | Assessment and implication |
| --- | --- | --- |
| Shared School AI workspace | `src/components/school-ai/school-ai-workspace.tsx:39` and `:42` enumerate 17 possible task tabs; `:198` filters by permission; `:220` renders assessment in Curriculum | Source confirmed. Several useful workflows remain a catalogue the teacher must navigate. A flagship task should not require discovering several tabs to finish one action. |
| Source-grounded lesson/remediation drafts | `src/lib/school-ai/learning.ts:4` defines structured activities/checks/source references; `:11` validates exact source/outcome grounding and duration; `learning-service.ts:32` generates a draft | Source confirmed. This is more than generic prose generation. Preserve it. |
| Actual reviewed outcome and item observations | `src/lib/school-ai/learning.ts:28` aggregates marks by mapped outcome; `:35` separates item evidence by paper/version; `learning-service.ts:58` loads reviewed attempts and active class learners | Source confirmed, with bounded query scope. These are observations, not calibrated mastery probabilities or a diagnosed misconception. |
| Connection from observed evidence to generation | `src/components/school-ai/learning-plans.tsx:20` exposes LearningTools; its remediation button chooses an outcome; `learning-service.ts:34` sends selected curriculum outcomes and source excerpts to the generator | **Partial.** The generated remediation prompt does not consume the actual moderated response evidence, a teacher-confirmed hypothesis or a follow-up decision. Selecting the same low-scoring outcome is not yet a closed improvement loop. |
| Key-blind review | `learning-service.ts:36` solves without the key, then compares; `:47` explicitly flags figure review as text-only | Source confirmed. Strong foundation, with limits stated honestly. Do not market this as mathematical/educational correctness certification. |
| Proposal retry/credit protection | `learning-service.ts:26` uses idempotency metadata and rechecks permissions/version before persisting; `:29` invokes the provider before the final transaction | Source confirmed at the application-result level. Concurrent requests can incur provider effort before one canonical result wins. Accepted-credit idempotence alone does not establish zero duplicate provider cost. Include failed/abandoned calls in cost measurement. |
| Legacy intervention persistence | `prisma/schema.prisma:2360` stores `InterventionPlan`; `src/app/api/ai/insights/route.ts:542` creates draft recommendation text; `src/app/api/ai/review/[id]/route.ts:89` approves/rejects | Source confirmed but structurally thin: no typed outcome/evidence version, due-date/ownership handoff, intervention delivery or comparable reassessment fields on the model inspected. Evolve under SKO-425; do not introduce a competing truth source. |
| Exam result correction history | `src/lib/school-ai/exam-results.ts:35` contains version-checked regrade; `:60` appeals; `:93` key-correction preview | Source confirmed. Learning actions must reference these result versions and become stale when evidence changes; they must never directly alter formal marks. |
| Managed-device capability | `src/lib/school-ai/providers.ts:25` returns `secureBrowser: false`; `docs/school-ai/IMPLEMENTATION.md:16` documents prior standard-browser scope | Existing baseline is standard browser. Live SKO-408 adds managed mode as future gated scope. It remains separately dependent on SKO-449 and actual device/exit validation. |
| Expanded Exam Studio | `.kiro/specs/ai-exam-studio/tasks.md:55`, `:113`, `:165` check foundational work; `:123` Studio shell unchecked; `:828` learning recovery unchecked; `:859` evidence export unchecked | Specification is extensive; core integration remains planned. Newly added files in the working tree are not proof that the complete flagship journey ships. |
| Honest commercial evidence | `src/lib/school-ai/commercial-evidence.ts:244` defines claim states; `:299` defaults unsupported claims to not started; named external gates remain open | Useful in-progress work. Use it to qualify demonstrations and sales claims, not to imply passing external evidence merely from schema existence. |
| Pilot evidence | `src/lib/school-ai/insights.ts:4` measures elapsed approval time and save counts; `docs/school-ai/IMPLEMENTATION.md:69`–`:72` mark calibration, devices and pilot open | Elapsed time is not active teacher work saved. The synthetic calibration harness deliberately blocks live-quality certification. |

The current main PRD snapshot also has a scope contradiction: `prd-before.md:339` says a future managed client needs separate product approval, while the current live SKO-408 explicitly adds managed mode as proposed work. Reconcile to **existing standard-browser baseline + proposed managed mode with named gates**. Neither declare managed mode shipped nor silently remove the latest specification.

## Enhancement beyond the already-rich specification

Existing SKO-408 requirement 18 already says “feedback → practice → later check.” Existing SKO-422 already distinguishes questionable items from learner gaps, and SKO-425 already calls for owners and closure. Do not create duplicate tickets claiming those ideas are new. Add the missing **executable handoff and decision contract** across these owners:

1. **One continuing task.** The selected assessment version, class, outcome, evidence and next decision survive each handoff. Teacher clicks an observed pattern once, rather than reselecting curriculum/class/outcome in three tools. Each step displays its real persistence boundary.
2. **A visible evidence decision.** Before proposing instruction, show whether the record is ready to support a teaching decision, needs a question/mark correction, or needs another observation. The teacher sees missing/unreadable/unmarked/absent counts and can choose a small clarifying check. A single wrong answer is evidence of that answer, not proof of a misconception.
3. **An activity that fits the next lesson.** Teacher supplies available minutes, resources and delivery context. AI proposes at most three initial options with explicit reasons and editable membership. Include a “collect evidence first” option when warranted. Constraints are deterministic; a fluent plan that exceeds the time or requires unavailable resources fails validation.
4. **A contrast check before a label.** Where a reviewed response admits multiple explanations, propose two short, teacher-reviewed checks that distinguish those explanations. For example, a fraction error may reflect unit interpretation, procedure or an ambiguous item. Record only the observable response; the teacher confirms the actionable interpretation. This is a pedagogical hypothesis, never a diagnosis or inferred psychological profile.
5. **One family action, one observable next step.** Family receives a released, age-appropriate action in its preferred language with a time expectation and “Need help”/“Unable this week” alongside completion. It does not receive internal grouping, speculative diagnoses or all teacher analysis. Participation is separate from learning evidence. There is a school-day alternative if home support is unavailable.
6. **An honest closure.** The next teacher-approved check uses a fresh task tied to the same objective; direct repeats are labeled practice/retrieval evidence. Compare paired learners, item count, context and task differences. Result: observed improvement, no observed improvement, or inconclusive. The teacher chooses close, adapt, extend or escalate; the system does not declare mastery or causal gain.
7. **A useful cost denominator.** Track total provider cost and human correction effort per approved paper and per completed learning-action review, including failed/abandoned/retried work. More AI calls or longer generated plans are not product success.
8. **A portable receipt.** The school can export a scoped record of what evidence informed the action, who approved it, what actually happened and what was observed later. The receipt uses original SIS/LMS identifiers where supplied and distinct Skoolee IDs, with provenance and reconciliation status. It should not require replacing the school's system of record.

These are differentiation hypotheses to test with international-school buyers and teachers. The defensible asset is a repeatable, evaluated workflow and authorized educator-reviewed evidence—not a claim to own children's data, a generic chat interface or an animated introduction.

## Canonical Learning Action contract — SKO-425

Extend the existing intervention owner additively and document migration/adapters. An interface can call a small classroom action “Learning Action” while a student-support plan retains its established name. Do not create parallel approvals or a second store of final marks.

| Field/group | Required contract |
| --- | --- |
| Identity | Stable action ID; school, campus, class, subject; external system/key namespace when imported; current revision; created/updated actor and time |
| Evidence | Curriculum/outcome/source revisions; assessment/form/item versions; exact moderated result version and rubric/response reference; inclusion/exclusion reason; evidence snapshot digest |
| Interpretation | Teacher-reviewed hypothesis, competing explanations where relevant, confirmed/needs observation/item review state, confirming actor and time |
| Feasibility | Intended activity, teacher owner, available minutes, materials, accessibility/approved accommodations, planned date, review date; no demographic or fixed-ability grouping |
| Participation scope | Explicit learner membership revision, reason for inclusion, teacher-adjustable temporary groups; staff-only grouping visibility |
| Content/AI provenance | Referenced approved lesson/practice/check versions; proposal model/policy/eval version, source IDs, validation outcome, cost observation; edits and human approval recorded |
| Family projection | Exactly approved text/language and recipient scope; optional child action; consent/contact/access resolution; publication distinct from send, delivery, acknowledgement and completion |
| Execution evidence | Taught/not taught, actual activity date, adjustments, participation, learner feedback and private professional notes in separate projections |
| Follow-up | New released check reference; baseline/follow-up inclusion rules; comparability note; paired/missing counts; observed result and uncertainty |
| Closure | Close/adapt/extend/escalate/inconclusive with authorized actor, reason and next owner/date; superseded history retained |

Proposed lifecycle: `DRAFT → EVIDENCE_REVIEW → READY_FOR_APPROVAL → ACTIVE → FOLLOW_UP_DUE → OUTCOME_REVIEW → CLOSED / EXTENDED / ESCALATED`. `BLOCKED` and `STALE` are explicit task conditions with reasons, not an erasure of the last valid state. Family delivery remains a separate lifecycle. Existing workflow terminology may be mapped rather than replaced; record the mapping before implementation.

Regrade, item correction, revoked source, changed membership or expired reviewer authority invalidates affected downstream **uncommitted** decisions. Preserve historical released material and show the revision that was actually seen. Require an impact review before any renewed family publication. A stale learning action must not overwrite a new formal result.

## Page, screen, drawer and modal contract

Use the SKO-208 shared components, neutral work surfaces, restrained violet primary actions, durable labels and explicit status text. The first viewport should explain context, current stage and one next useful action. Preserve filters and drafts on return. Desktop uses evidence beside work; mobile presents evidence and work sequentially. Full editing belongs on a page; modals are for bounded decisions.

| Surface | Purpose, content and main action | Essential alternate/recovery state | Owner |
| --- | --- | --- | --- |
| Teacher Today card | Show a specific reviewed class observation, denominator, next lesson context and due action; **Review next step** | No trustworthy evidence: **Choose a short check**, with reason; never a fictional improvement score | SKO-408 presentation, SKO-425 record |
| Studio start / task chooser | Continue last task; start assessment; review returned work; teach next; scope stays visible | No assigned class, stale import or disabled AI offers authorized repair/manual route | SKO-408 + SKO-379 |
| Assessment brief page | One missing decision at a time plus editable summary; **Review brief** | Existing facts not re-asked; contradictions point to source; draft saves with exact status | SKO-408 |
| Source review page | Exact page/region beside extracted text; **Confirm source facts** | Missing page, illegible crop, rights/approval missing; preserve other confirmed facts | Existing source/intake owners + SKO-408 |
| Blueprint and generation page | Coverage, total marks, time, known constraints, cost estimate; **Generate draft** | Budget exhausted/outage → manual editing; partial generation remains visible and saved | SKO-408 + SKO-383 |
| Item workbench | Question/rubric, source/skill, reviewed status, one focused blocker; **Resolve item** | Stale dependent key/rubric/review; single-item compare retains accepted work | SKO-408 |
| Evidence drawer | Read-only exact source → objective → item → response/rubric chain | Missing/revoked evidence named; no cross-role key access; close restores trigger focus | SKO-408/422 |
| Rehearsal page | Candidate preview plus blocker queue; **Run rehearsal** | Failed save/asset/print check opens exact repair; revised content invalidates prior pass | SKO-408/411 |
| Release review modal | Exact form/version, audience, mode, window and policy; **Release this version** | Stale review refuses commit; intact editor offered; mode changes never silent | SKO-408/411/449 |
| Candidate attempt page | Task, aids, timer, acknowledged save and help; **Submit** at end | Reconnect retains last acknowledged revision; durable pending-submit state; receipt only on confirmed finalization | SKO-411 |
| Marking review page | Answer and rubric evidence, uncertain exception first; **Approve reviewed marks** | Illegible evidence/valid alternative method route to review; no auto-final AI score | SKO-424/412 |
| Evidence-to-action page | Three factual sections: observed work; possible explanation; missing evidence; **Choose next step** | Item flaw routes to correction, not learner remediation; uncertainty stays visible | SKO-422 + SKO-408 |
| Action planner page | Chosen action, editable minutes/materials/groups/owner/review date; **Review action** | Resource/time mismatch blocks approval with exact repair; no supported cohort → manual teacher plan | SKO-414/425 |
| Group drawer | Temporary learner membership with evidence/inclusion reason; **Apply group** | Withdrawn/transferred learner or lost assignment is excluded after fresh check | SKO-422/425 |
| Action approval modal | Exact revision, named owner, due date, what changes now, family projection status; **Activate action** | Show stale evidence/membership; do not imply publication or delivery | SKO-425 |
| Family preview/release modal | Child, approved wording/language, action, recipients and channel; **Publish family action** | Missing guardian link/consent gives repair; no sending by merely opening preview | SKO-419/425 + delivery owner |
| Student Today action card | One approved task and help route; **Try this activity** | “I need help” is a supportive state, not failure or reduced ability | SKO-418/426 |
| Family inbox action detail | One child/action, useful instructions, due date; **Record response** | Switch sibling with scope reset; “Unable this week”; no internal analysis/other child's data | SKO-419 |
| Teacher check-in drawer | What was taught, participation, brief note, changed conditions; **Save check-in** | Offline/failed save explicitly pending; no false receipt; desktop/full page available for long notes | SKO-425 |
| Follow-up review page | Baseline and new check, paired/missing counts, task/context differences; **Record outcome** | Insufficient/comparability gap shows inconclusive and proposed next check | SKO-425 |
| Closure/extend modal | Decision, reason, next owner/date if open, family notification preview; **Confirm decision** | Cannot close as success because a family clicked Complete; stale result requires re-review | SKO-425 |
| Principal evidence page | Review coverage, overdue actions, verified observations and workload/cost; **Inspect evidence** | Small cohorts suppressed appropriately; no teacher ranking or causal improvement graph | SKO-450 + SKO-425 |
| Import/reconciliation page | External IDs, source/version, mapping, conflicts and preview; **Apply reviewed import** | Duplicate, wrong academic year, deleted enrolment and stale result handled explicitly | Existing import/integration owners |

All surfaces need empty, loading, partial, denied, validation, recoverable error, unsaved/stale, success and reconnect behavior where applicable. Show exact server-confirmed persistence. Keyboard and screen-reader flows must reach each item and modal; focus returns safely; no toast-only save failure. Support 360px width, 200% text, Arabic/Urdu direction with isolated equations/IDs, and reduced motion. Content language, UI language and family preferred language are separate values; never silently translate an approved high-stakes item.

## Acceptance criteria for the SKO-408 supplement

1. Starting from one reviewed assessment, the assigned teacher reaches evidence review, a proposed feasible action, teacher approval and follow-up without re-entering class, curriculum or objective. Each handoff references the same canonical action ID and appropriate source revision.
2. The entry card states actual denominators and missing/excluded evidence. Invalid item/key, unmarked work, unreadable scans and untaught material offer the correct repair path before a learner-gap interpretation.
3. Every AI-proposed teaching reason points to authorized reviewed response/rubric evidence and approved curriculum sources. Unsupported rationale is omitted or shown for correction; a model-generated confidence value is never displayed as measured truth.
4. For ambiguous response evidence, the teacher may choose a short contrast check or record another explanation. Dismissing a hypothesis preserves the evidence and does not label the learner.
5. The action validates duration/resources/accessibility and shows at most three initial options with reasons. Teachers can edit or create manually. Selected learners, owner, date, goal and review date are explicit before activation.
6. Source/mark/item or learner-scope changes create a visible stale condition. No family release or closure relying on the old evidence proceeds without impact review; formal marks are changed only in their owning workflow.
7. Family/student output is an independently approved projection; private notes, other learners, grouping labels, keys and unreleased secured content are absent in both UI and API. Sharing acceptance, provider delivery, acknowledgement and task completion remain distinct.
8. A later check retains task/condition differences, paired and missing counts. A repeated question is labeled as repeated; the product does not claim calibrated equivalence, mastery or causal gain. Inconclusive is a valid outcome.
9. Duplicate requests, retry after timeout and simultaneous reviewers produce one canonical action transition/receipt. Lost authorization and class changes are enforced on the next read and before commit.
10. External SIS/LMS IDs remain namespaced; imports do not infer identity from a display name. The school can review conflicts and export its authorized action/evidence records without adopting the full ERP. A connector is named supported only after its specific contract is implemented and tested.
11. The completed journey works manually without a model and preserves edits on provider outage or budget exhaustion. It exposes estimated versus actual metering without allowing a budget failure to strand a timed student attempt.
12. Each commercial metric carries cohort, dates, method, denominator and exclusions. Human correction effort, repeat usage and total cost are measured; synthetic examples stay marked synthetic.

## Targeted QA flows

| Flow and fixture | Steps | Required result/evidence |
| --- | --- | --- |
| Happy path, paper and browser | Reviewed class work → inspect two response patterns → choose teacher-confirmed action → approve → publish family projection → record teaching → new check → closure | Same action ID and source/result revisions throughout; final receipt shows actual owner/date/evidence and decision |
| Same mark, different reasons | Two learners have identical totals but different item responses; one script has uncertain recognition | Distinct evidence; uncertainty routed to review; no average-based fixed grouping |
| Misleading item | Seed ambiguous question/key error plus genuine learner error elsewhere | Question defect routed to SKO-424; only valid evidence informs action; corrected result invalidates downstream proposal |
| Insufficient evidence | One response, absent learner, unmarked response, untaught outcome and missing page | Visible counts; no fabricated certainty; short evidence-collection/manual options; no false negative learner label |
| Feasibility | Request a ten-minute action with no printer; generated draft totals fifteen minutes and requires printed cards | Validator identifies both constraints; teacher can choose an accessible no-print alternative; no silent trimming |
| Regeneration and outage | Edit an action, lose network during generation, retry same request, then exhaust AI budget | Edits retained; canonical output not duplicated; actual attempted provider cost recorded; manual completion available |
| Concurrent change | Approver opens action v2; moderator regrades its evidence or teacher changes membership before approval | Commit rejected with stale reason, fields retained, comparison/impact review required |
| Scope and cross-tenant | Same external student ID exists at two schools; staff assignment revoked; parent link changed | Namespaced mapping; no cross-school evidence; next read/commit rechecked; removed guardian cannot receive queued update |
| Family comprehension | Arabic family, English content, two siblings, family cannot do activity at home | Exact approved language projection, correct child, no leaked staff notes, useful “Unable” response and school alternative |
| Follow-up honesty | Follow-up uses repeated item, changed accommodations, absent students and a smaller sample | Differences and paired/missing denominators visible; result can be inconclusive; no causal/psychometric claim |
| Closure/ownership | Assigned teacher leaves or misses review date; another authorized teacher takes ownership | Explicit handoff history; overdue action remains visible; unowned plan cannot silently disappear |
| Access and responsive UX | Keyboard, screen reader, mobile 360px/200%, AR/UR math, reduced motion; open and close each modal | Correct accessible names, focus return, no offscreen primary action, readable evidence and durable save states |
| Import/export | Import external results twice; conflict with corrected SIS result; export scoped closure receipt | Idempotent reconciliation; staff chooses correct revision; portable identifiers and provenance; no duplicate marks |
| Cost/evaluation | Rejected AI proposal, partial call failure, retry race, teacher-approved manual action | Cost denominator includes failures and abandonment; manual action distinct; no invented ROI or cached-result quality pass |

Pure tests should cover deterministic evidence eligibility, feasibility, lifecycle and projection rules. Database integration tests cover authorization/version/idempotence and dependent-record invalidation. Browser tests cover the connected task and recovery states. Qualified educators separately evaluate pedagogical usefulness and multilingual correctness. Physical devices, provider delivery and real-school outcomes remain external gates. This review did not run these proposed tests.

## AI quality and cost contract

- Use AI where it reduces real work: drafting/structuring the brief, uncertain source extraction, proposed explanations linked to reviewed responses, resource-constrained activity alternatives, translation for educator review and draft family wording. Deterministic code owns identity, arithmetic totals, permissions, timing, state transitions and publication.
- Evaluation cells are curriculum/version × grade/subject × instructional language × task type. Validate the launch cohorts the school will actually use; a successful English multiple-choice corpus does not qualify Arabic written mathematics.
- Maintain teacher-adjudicated holdout cases, including alternate valid solutions, bad questions, illegible handwriting, missing figures, mixed-direction math, contradictory sources, prompt injection and deliberately insufficient evidence. Separate extraction, item validity, marking agreement, useful-action agreement and family comprehension.
- Record model/policy/source/validator versions and qualified reviewer disagreements. Compare candidate releases against the approved baseline before rollout. Show unsupported cells as manual/preview, rather than silently borrowing an average from another language or subject.
- Report false actionable hypotheses, missed severe item defects, human correction effort and rejection reasons; answer fluency and generation count are not quality metrics. Numerical release thresholds should be defined with the educator cohort before the evaluation run and linked to its protocol.
- Provider reservations and jobs must prevent unbounded parallel spending, have bounded retries and expose unknown outcomes. Cancellation stops future calls when possible; do not promise to reverse provider work already incurred. Cache only within authorized tenant/source/version/policy boundaries.
- Measure input/output/processing usage and provider price version for actual cost, alongside product credits separately. Report median and tail latency, proposal acceptance, total cost per approved paper/action, and school support cost. Do not promise unlimited AI or margins without evidence.

## International-school launch and LEAP proof

The global launch offer is **try one assessment-and-improvement cycle alongside the tools you already use**. Guided import/export is acceptable for the first cohort when plainly described. Every real connector needs its own source-of-truth, permissions, identity, deletion, retry/conflict and supported-version contract. Curriculum content requires appropriate rights and educator validation; supporting teacher-uploaded authorized material is different from possessing an officially licensed curriculum library.

Keep the initial demonstration focused on a named, authorized curriculum/subject/language cohort with a visibly broader capability matrix. International customers can start from supported cells; unsupported ones have an explicit manual or evaluation path. English/Arabic/Urdu interface presence is not evidence of universal multilingual educational quality.

For LEAP, demonstrate one real task: bring a permitted source → review/repair a draft item → deliver or inspect a truthful recorded attempt → review actual answer evidence → approve a feasible next lesson → open the family projection → inspect a later observation and its limitations. Managed mode should be a separately demonstrated, supported device profile after its gate passes. A polished entry animation is optional; the operational proof should remain legible without it.

Investor evidence should include paid-pilot willingness and terms, onboarding effort, repeat assessment use, teacher correction/active-work measurement, action completion and follow-up coverage, quality error rates by cohort, total serving/support cost, and retention. Funding of USD 10 million is the founder's target; product tickets can deliver evidence and buyer value, not guarantee that financing outcome.

## Implementation ownership and priority correction

| Owner | Required enhancement | Pilot importance |
| --- | --- | --- |
| SKO-408 | Continuous task UX and cross-owner contract; evidence decision → action → family → follow-up integration acceptance | Core flagship |
| SKO-208 | Shared task cards, side-by-side evidence, consistent bounded decision modals, honest save/release/delivery vocabulary | Core foundation |
| SKO-422 | Evidence readiness/competing explanation and response provenance; published denominator rules | Promote into flagship pilot dependency, not optional late analytics |
| SKO-414 | Feasible activity constraints, teacher-edited groups, actual taught record | Core supporting path |
| SKO-425 | Canonical Learning Action/version/ownership/closure contract; adapt existing InterventionPlan | Promote into flagship pilot dependency |
| SKO-419/418/426 | Released family/student action, accessible practice, help and participation distinct from learning evidence | Core minimum projections; deeper features can follow |
| SKO-383 | Per-cohort quality/eval gates, provider reservation/cost/unknown-outcome policy | Core AI gate |
| SKO-407/412/424 | Existing objective/item/response/mark owners and correction invalidation | Reuse, do not reimplement |
| SKO-449 | Supported managed-client profiles with independent real-device/exit acceptance | Separate managed-mode release gate; do not block standard-browser authoring pilot unnecessarily |
| SKO-450/452 | Scoped evidence receipt and truthful launch demonstration/pilot packet | Commercial proof |

Do not put every adjacent feature on the critical path. Deliver the smallest complete evidence-to-action loop with explicit manual recovery, then expand breadth using measured school demand. The new global integration/onboarding contract belongs to the existing relevant import/integration owners unless the full backlog audit finds a genuinely unowned capability.
