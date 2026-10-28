# Skoolee product strategy and launch contract

Decision date: 15 October 2026. Target customers are international schools globally and local schools in Pakistan, Saudi Arabia and the UAE. The commercial flagship is **Skoolee Exam Studio**, owned by SKO-408. Its promise is: **Turn assessed work into the next useful lesson, with evidence at every step.** The broader school platform supports adoption and expansion. The fundraising objective is at least USD 10 million; it is an ambition to substantiate through customer and operating evidence, not an outcome a feature list can guarantee.

## Market judgment

The product addresses real school jobs, but breadth and AI generation do not establish an unfilled market. Toddle advertises curriculum-aware assessment creation, grading, reports and AI insights. ManageBac presents curriculum workflows and AssessPrep integration. Classera advertises AI teaching, adaptive assessment and automatic exam creation. Gradescope supports paper and digital assessment. MagicSchool offers extensive educator AI with institutional controls. These are vendor descriptions, not an independent comparison of implementation quality. [Toddle AI](https://www.toddleapp.com/ai/), [ManageBac help](https://help.managebac.com/hc/en-us), [Classera LMS](https://www.classera.com/en/products/classera-lms/), [Gradescope assessment guide](https://guides.gradescope.com/hc/en-us/articles/22011014475405-What-are-my-options-for-having-students-submit-work-to-Gradescope), [MagicSchool FAQ](https://www.magicschool.ai/faq).

The gap to test is narrower: schools spend effort moving between evidence, marking, instruction and family communication; uncertain marks and weak questions can be mistaken for learner weaknesses; later improvement is often disconnected from the original decision. Skoolee can compete through a fast, explainable, multilingual workflow that preserves context across those handoffs and works beside an existing SIS/LMS. This is a product hypothesis, not a verified competitor absence or a claim that nobody has attempted it.

Conduct 24 structured discovery interviews across four cohorts: global international, Pakistani local, Saudi local and UAE local schools, including buyer, academic lead and classroom teacher perspectives. Observe an actual assessment cycle, count repeated entry, time review effort, identify incumbent systems, and ask for a paid pilot decision. Proceed by cohort only when at least three schools independently describe the same painful workflow and two accept a scoped pilot. These are proposed discovery gates, not current traction. The [SKAI-902 discovery packet](cohort-discovery.md) prepares consent, comparable interviews and a decision record; its Pakistan-first quota is proposed for founder review and does not approve D2 or replace these gates.

## One flagship with three memorable moments

1. **See what the evidence really says.** A teacher opens a reviewed class result and sees an item-level pattern, original response or scan, rubric and source. Missing, absent, unreadable and unmarked work remain separate. If the item is ambiguous or evidence is insufficient, propose a correction or a short clarifying check before recommending reteaching.
2. **Make the next ten minutes useful.** With available time, materials and learner context retained, AI proposes up to three practical options. It explains the evidence behind each and offers editable, temporary groups. The teacher approves one Learning Action, owned by SKO-425. Where two explanations fit, a small contrast check helps the teacher distinguish them. Do not infer a child's ability, disability or motivation from a score.
3. **Show what changed later.** A learner and family receive one released action; inability to help at home has an equivalent school-day path. A fresh, teacher-reviewed check later produces an observed improvement, no improvement or inconclusive result. Attendance at an activity and repeated-question success are not proof of transfer or causal learning gain. A portable receipt links evidence, teacher decision, delivery and follow-up.

The same assessment, learner mapping, objective and evidence versions survive every handoff. A correction makes dependent recommendations visibly stale. This continuity is more valuable than adding another disconnected AI tool. SKO-408 orchestrates; SKO-422 owns item interpretation, SKO-414 lesson activities, SKO-425 intervention ownership, SKO-419 family actions and SKO-426 practice. Keep one authoritative owner for each record.

## Launch markets and support boundaries

| Cohort | First use case | Required validation before a supported claim |
| --- | --- | --- |
| Global international schools | Assessment and learning recovery alongside the existing SIS/LMS | School-selected curriculum/version, rubrics and objective mapping; stable external identifiers; import/export reconciliation; supported language, timezone, devices and procurement requirements |
| Pakistani schools | Mixed paper/digital assessment, Urdu/English teacher review and family action | Named board/syllabus edition and grade/subject; local mark conventions; low-bandwidth capture; Urdu print; verified PKR tuition/provider flow |
| Saudi schools | Arabic/English assessment and academic oversight | Named national or international curriculum; Arabic mathematics and print; school calendar and working week; institution-approved processing arrangements; separately verified SAR finance package |
| UAE schools | Multilingual assessment across diverse school curricula | School and emirate-specific operating requirements validated by qualified owners; curriculum/rubric versions; Arabic/English print; AED finance/provider support; mixed-calendar families |

Country, curriculum, instructional language, family language, payment rail and hosting region are independent choices. The interface must show supported, pilot and unavailable combinations before purchase or exam release. A school can use the supported assessment module while unsupported finance or specialist modules remain disabled. Do not infer global payments from currency formatting or regulatory approval from a country dropdown.

Prioritize teacher-reviewed mathematics and science workflows with objective-level evidence in the first validation cohorts; add subjects only with educator calibration. This is a validation order, not a geographic exclusion. International school curricula and local curricula retain their own source rights, grading and standards; mapping is reviewed rather than silently equating them.

## Product architecture and AI use

Sell the flagship as an independent institutional module with transparent capacity and service terms. Permit a school to import a roster and source material, run a useful cycle and export results without adopting fees, payroll, admissions or the whole ERP. CSV with stable identifiers and reconciliation is a valid first integration; advertise named live connectors only after end-to-end verification. School identity and roster exchange remain SKO-446; versioned APIs remain SKO-445.

AI belongs inside the task: source extraction; missing-information questions; objective mapping; editable paper/rubric drafts; independent answerability review; marking proposals; evidence summaries; feasible lesson alternatives; translated family drafts; and later comparison summaries. Deterministic services enforce scope, marks totals, versions, permissions, approvals, deadlines, idempotency and money. Models never become record authorities.

Evaluate by curriculum, subject, grade and language, including ambiguous items, contradictory sources, unreadable scans, prompt injection, absent learners and out-of-distribution work. Keep a held-out educator-reviewed set, model/prompt/policy versions, correction reasons and a rollback path. Wrong keys, cross-tenant disclosure and unauthorized actions block release regardless of average scores. Model scores do not prove answer correctness. All provider attempts, including failed and abandoned ones, count toward unit cost.

Use a budget per approved paper and completed Learning Action; cache only appropriately scoped approved artifacts; use deterministic validation before expensive generation; keep manual workflows working during provider failure. Track teacher correction time alongside AI cost so a cheap but unreliable model is not mistaken for a better product.

## Attractive interaction with less work

Preserve the existing violet brand, warm neutral surfaces, typography, shared controls, module tones and modal stack. The Studio entrance uses the existing assistant/robot visual language in a brief, skippable motion sequence, once per account/session. Reduced motion gets an immediate static mark. The introduction never overlays an active exam, delays a deadline, traps focus or waits for a provider request.

Use a clear Studio overview with resume cards and a single next action. Authoring follows brief, source, blueprint, questions, review and release. Delivery shows preparation, active sittings and exceptions. Results show what needs teacher judgment first. Improvement follows the same learning evidence into one action and later check. Advanced options appear in context; a teacher should not navigate seventeen tool tabs to finish one assessment.

Pages hold sustained work; drawers show source evidence without losing context; bounded modals confirm one consequential action. Avoid nested editing modals. Every screen defines its actor/scope, primary action, return path, persistent save state, validation and recovery behavior. Long EN/AR/UR text, keyboard navigation, 200% text, phone layouts, mixed-direction formulas and shared-device privacy are part of acceptance. Animation explains progress and completion; it never implies a server action completed before a receipt.

## Exam integrity and the actual lock boundary

The implementation target is a server-enforced Skoolee exam session. After Start, unrelated Skoolee pages, APIs and server actions are denied or redirected to the active attempt. Refresh, navigation, another Skoolee tab and a new login resume the same deadline and attempt. Only authoritative submission or server expiry releases this boundary. Logout remains possible for account safety but does not erase the active attempt. Device clock changes and local storage cannot unlock it. Save/submission ambiguity keeps the attempt in recovery rather than showing success.

A standard browser cannot prevent other applications, tabs, screenshots, developer tools, a second device or operating-system access. Managed-device lockdown remains proposed SKO-449 work with real-device admission and exit tests; it must not be advertised as shipped by a web-only change.

Where school policy enables camera supervision, preflight explains purpose, permitted viewers, retention, camera status and the school's accommodation path. Capture must be visible and permissioned. Camera denial, loss, device faults and upload failure are distinct conditions, with teacher recovery and preserved answers. Continuous camera availability cannot be guaranteed by a browser.

Record only bounded, relevant observations such as exam page hidden, focus returned, capture interrupted or a server-rejected action. These client signals are incomplete and can be spoofed; they are review leads. AI may summarize this timeline with event references and neutral wording for authorized teachers, administrators and principals. It must not infer cheating, emotion, gaze, identity or intent, assign a cheating probability, or change marks automatically. Review records show the candidate explanation, reviewer, disposition and appeal/remedy, separate from academic grading. Do not transmit exam video to a model without a separately approved, evaluated processing feature.

## Additional flagship candidates

These are related extensions with discovery gates before major implementation. They are differentiated product hypotheses, not verified worldwide firsts.

| Candidate | Memorable experience and market problem | Existing owner and validation gate |
| --- | --- | --- |
| [Learning Transfer Bridge — SKO-471](https://linear.app/skoolee-ai-app/issue/SKO-471) | A learner moving between schools or curricula brings a permissioned evidence packet. Staff compare demonstrated work with destination prerequisites, resolve uncertain mappings and build a short arrival plan instead of repeating every assessment. | Reuse SKO-406 curriculum versions, SKO-394 learner identity, SKO-425 action ownership and SKO-446 exchange. A receiving educator approves every mapping; no automatic grade equivalence. Measure arrival-planning effort and unnecessary reassessment. |
| [Assessment Repair Map — SKO-472](https://linear.app/skoolee-ai-app/issue/SKO-472) | When a question, key or rubric is wrong, preview every affected mark, released report and proposed learning action. Correct the assessment and repair dependent recommendations through explicit review, with an intelligible family explanation. | Reuse SKO-424 correction authority, SKO-375 publication, SKO-384 audit and SKO-425 actions. Extend existing regrading rather than creating another grade store. Measure missed dependencies, review effort and recovery time using deliberate defects. |
| [Reasoning Replay — SKO-473](https://linear.app/skoolee-ai-app/issue/SKO-473) | A student explains a decision in submitted work through text, annotated steps or optional voice. A reviewed follow-up explores what changes under a new constraint, with permitted AI use visible. Teachers inspect understanding without an AI-authorship score. | Reuse SKO-409 submissions, SKO-410 checks and SKO-427/428 tutoring/voice. Keep teacher-led and text alternatives equivalent. Evaluate usefulness, burden and language/accessibility differences before expansion. |

Oral defence and submission-grounded AI follow-up already exist. Vocina, eViva and Viva advertise related assessment workflows; their claims were not independently validated here. Skoolee must earn differentiation through curriculum transitions, correction propagation, accessible mixed delivery and a reviewed learning-action history. [Vocina FAQ](https://viva.vocina.ai/faq), [eViva](https://www.eviva.tech/), [Viva oral exams](https://www.vivaproof.com/oral-exams).

Prioritize Assessment Repair Map after reliable delivery and marking, then validate Learning Transfer Bridge with the launch cohorts. Keep Reasoning Replay in advanced expansion until buyer interviews and educator trials justify its additional cost.

## Scope discipline

The 95 existing canonical features plus three proposed flagship extensions and two confirmed-defect tickets form a 100-card execution catalogue, with different launch priorities. Trust, identity, record correctness, recovery, accessibility and reliable delivery are release prerequisites. The flagship cycle plus source/roster onboarding, accommodation, reports, family actions, limited integration and measurement are commercial focus. Finance and operations can deepen adoption in supported markets but must not delay evidence for the flagship. Careers, alumni, cross-school question networks, complex staffing simulations and specialist packages remain expansion options with independent demand gates.

Current source has substantial administration, source handling, assessment, attempt, moderation and report foundations. Several older blockers are stale: current authentication rechecks principal/revocation; family AI uses shared scope and publication rules; report delivery uses approved versions; migrations and outbox infrastructure exist. Verify their current deployment rather than rebuild them. New code findings include tuition checkout readiness/return routing, manual receipt concurrency, template-only certificate administration and incomplete typed learning-action handoffs. Their owner cards carry the precise evidence and QA.

## Evidence and commercial milestones to LEAP

LEAP's official startup programme currently lists **12–15 April 2027**. The programme distinguishes participation and eligibility to apply for its pitch competition; it does not promise investment. Recheck official terms before applications or bookings. [LEAP Startup and Scaleup Program](https://onegiantleap.com/startup/become-a-start-up).

| Window | Proposed exit evidence |
| --- | --- |
| October–November 2026 | 24 discovery interviews; cohort pain and purchasing validation; runnable assessment slice; named support matrix; assessed privacy/security and recovery controls |
| December 2026 | 6–8 consented design-partner pilots spanning the target cohorts where onboarding gates pass; baseline timing and quality observations; at least two complete learning cycles per participating class |
| January–February 2027 | Paid conversion decisions, repeat teacher use, independent educator review, integration reconciliation, observed costs and support load; narrow or stop cohorts that do not demonstrate value |
| March 2027 | Permissioned case studies, reference buyers, defensible cohort metrics, security/recovery evidence and a reliable live/offline-recorded demo; investor data room and driver-based operating plan |
| April 2027 | Show shipped behavior, pilot evidence and a clear use of capital; distinguish real results from targets and demo fixtures |

Proposed pilot targets, to preregister with participating schools: at least 30% lower median active teacher work per comparable assessment cycle without worse reviewed accuracy; at least 80% of flagged evidence decisions resolved or explicitly marked insufficient; at least 70% of assigned Learning Actions reviewed by their due date; and repeat use by at least 60% of activated pilot teachers in week six. Report denominator, sample size, exclusions, cohort and uncertainty. These are goals, not measured results or universal investment thresholds.

Learning evidence compares the same participating learners on a teacher-reviewed fresh check, reports missing follow-ups, and distinguishes retrieval practice from transfer. A before/after change alone does not prove AI caused it. Capture family action completion separately from academic improvement. Time savings use observed active work with comparable tasks, not wall time from creation to approval.

For a USD 10 million raise, build a case for a repeatable, valuable business from this module: paid institutional demand, buyer references, retention, expansion, acquisition process, procurement cycle, support burden, security posture and credible unit economics. Use explicit pricing experiments; do not change existing contracts from a strategy document. Illustrative arithmetic only: 30 schools at USD 10,000 annual module revenue equals USD 300,000 ARR; 100 at USD 20,000 equals USD 2 million ARR. Neither scenario is a forecast or a valuation justification. Show separate hosting, AI, media, onboarding and support costs, and calculate contribution margin on realized revenue.

Use of capital should be tied to outcomes over an explicit runway: engineering/reliability, educator evaluation and curriculum packs, customer implementation, distribution and regional operations. Build the budget from named roles, hiring dates and vendor quotations. Do not use international-school fee income as software TAM; derive reachable schools by supported curriculum, integration, budget and sales capacity. ISC Research's 2026 overview explicitly describes uneven regional growth, supporting segmentation rather than one blanket global assumption. [ISC Research 2026 overview](https://iscresearch.com/product/global-market-overview-2026-report/).

## Acceptance and ownership

Every canonical card includes its market role, existing source baseline, specific changes, pages and overlays, acceptance criteria, QA journeys, dependencies and a success measure. Historical cards remain archived references; current work belongs to the 95 original milestone owners plus the five explicitly scoped additions. SKO-208 is historical design-system work; SKO-379 is its current owner; SKO-408 is the flagship. Feature status is not changed merely because documentation is enriched.

The route/overlay crosswalk is a source inventory, not proof of runtime acceptance. A card closes only with named environment, commit, role, locale, meaningful negative and recovery cases, and evidence of the real server outcome. School pilots, provider quality, camera/device tests, load, remote storage, migrations and recovery retain explicit external gates until demonstrated.
