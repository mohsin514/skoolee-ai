# SkooleeAI product review and global roadmap

Prepared for the founder on 7 October 2026. This is a product and engineering proposal for worldwide K–12 schools and school groups, with LEAP Riyadh 2027 as the next commercial milestone. The founder reports no current school users and wants customers, investors and a Saudi partner. The roadmap follows the latest instruction to plan for scale without using the present budget as a constraint.

SkooleeAI has a substantial school administration foundation. Its strongest opportunity is to connect assessment, teacher action and family follow-through, while making routine school operations reliable. More modules alone will not establish a compelling reason to switch. The recommended flagship is a complete journey from a paper assessment to verified marks, targeted practice, a parent action and a measured follow-up.

## Basis of the assessment

The review covered original requests and substantive outcome summaries across 38 imported project chats, the current repository, the live marketing site, the application's public sign-in page, GitHub repository and PR metadata, and all 206 issues returned by the connected Linear workspace. It also used current official competitor, hosting, examination and Saudi sources linked below.

This was not an authenticated live test of every role, a production database audit or a security certification. Code presence means implementation exists; it does not prove successful deployment or operational reliability. Historical chat claims are distinguished from current source findings. The technical findings below require remediation and verification before customer rollout. No application code, deployment, database or Linear issue was changed as part of this review.

Linear returned 172 Todo, 18 Backlog, 3 In Progress and 13 Done issues. Many Todo entries are verification tasks, so these counts are not a defect count or completion percentage. GitHub listed 11 PRs, including the open storage PR and merged authentication, tenancy, chat and environment work. The GitHub connector was not installed in this session; repository metadata was accessible through the authenticated CLI.

## Product judgment

| Dimension | Assessment | Practical consequence |
|---|---|---|
| Administrative breadth | Substantial implementation across academics, finance, staff and operations | Extend existing foundations instead of rebuilding modules |
| Teaching and learning | Records and AI drafts exist; assignment submission and learner assessment are major gaps | Build the teaching loop around meaningful student work |
| Differentiation | Useful capabilities, but no established global uniqueness | Compete on workflow quality, adoption, outcomes and local execution |
| Global readiness | Pakistan-oriented defaults and English/Urdu dominate | Introduce configurable country and curriculum packages |
| Production confidence | Several current code concerns and incomplete deployment evidence | Make release acceptance demonstrable and repeatable |
| Commercial proof | Founder reports zero schools | Recruit design partners and collect genuine usage and willingness-to-pay evidence |
| Scaling potential | A coherent shared data foundation is present | Strengthen tenancy, jobs, migrations, observability and integration contracts |

The source contains 199 API route files, 107 Prisma models and 69 page files. These counts indicate breadth, not a percentage of readiness.

The global vision is reasonable. The initial sales motion should still select a repeatable segment: for example, private K–12 schools or small school groups that rely heavily on paper assessments and spreadsheets. Use schools you can reach directly for workflow validation, and recruit a Saudi design partner for language, curriculum and procurement validation. Public school procurement, universities, preschool and international school groups can follow separate product tracks when their requirements are understood.

## What already exists

| Area | Implementation found | Next improvement |
|---|---|---|
| Platform and school groups | Schools, campuses, users, role permissions, billing, audit records and analytics | Consistent authorization, deployment isolation evidence and support operations |
| Academics | Years, classes, sections, subjects, syllabus topics, calendar, rooms and timetables | Outcome mapping, substitution workflow and local curriculum configuration |
| Examinations | Exam cycles, date sheets, seating, marks, locking, office review, publication and report cards | Reliable approval gates, question bank, learner attempts and scanning |
| Teachers | Classes, attendance, marks, timetable, leave and AI assistance | Planning, assignment distribution, submissions, rubrics and feedback |
| Students | Results, attendance, timetable, fees, messaging and study assistance | A daily learning workspace with tasks, practice and progress evidence |
| Parents | Linked children, sibling views, results, fees, attendance and communication | Multiple authorized guardians, actionable requests and consent records |
| Finance | Fee structures, discounts, invoices, collections, carry-forwards, reports, bank import, ledger and payroll | Reconciliation proof, corrections, local payment/tax rules and finance controls |
| Operations | Library, inventory, front desk, transport records and dorm rooms | Complete the selected daily operational workflows before expanding further |
| AI | Remarks, lesson/homework drafts, summaries, insights and review items | Source-grounded generation, quality evaluation, complete approval enforcement and costs |
| Communication | Chat, notifications, email and WhatsApp paths | Delivery/retry evidence, family preferences, action tracking and message governance |

The distinction between vendor APP_OWNER, school/group SUPER_ADMIN and campus administrators should remain clear. Previous chats also establish that office staff manage formal examination sessions while teachers manage classroom tests, academic history survives promotion, student identity is permanent even when roll numbers change, and staff rank is separate from management appointments.

## Fixes required before expanding customer use

**Unify student ownership and published-result access.** The main student dashboard uses explicit identity links and restricts published data. The AI context still permits matching by full name, alongside a parent link, and fetches marks and report cards without the same publication filters. This is a current source concern about incorrect identity resolution and inappropriate disclosure, not a demonstrated production exploit. Use the same tested ownership resolver and publication scope across APIs, AI context, exports, notifications and reports. Evidence: [AI context](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/api/ai/insights/route.ts:128), [dashboard identity rules](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/actions/dashboard.ts:1322).

**Enforce individual report approval on every publication and delivery path.** The bulk report workflow checks approval, but the single report send path passes an approval override after checking only the exam publication state. The exam publication path does not establish each remark's approval. Move the invariant into a shared service that checks the actual stored report version and approval immediately before publication/delivery. Evidence: [single report delivery](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/api/reports/[id]/send/route.ts:43), [notification approval logic](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/notifications/service.ts:402), [exam publication](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/api/exams/route.ts:288).

**Make account revocation consistent.** Some routes use a helper that checks current user activity/role; others use token/session checks directly. Staff deactivation changes the active flag without necessarily revoking existing sessions. Re-test access with an already-issued session after deactivation, role changes, campus reassignment and password reset. Evidence: [shared authorization](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/api/scope.ts:66), [token authentication](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/auth.ts:24), [staff deactivation](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/actions/invite.ts:324).

**Repair the database migration baseline.** The baseline migration contains CLI output rather than executable SQL. The deployment workflow explicitly works around this using schema push. Establish reproducible migrations, staged upgrade tests, safe rollback/forward recovery and tested restoration before supporting many schools. Evidence: [baseline](/Users/angular_dev_15/Downloads/skoolee-ai/prisma/migrations/20260730000000_baseline/migration.sql:1), [deployment workflow](/Users/angular_dev_15/Downloads/skoolee-ai/.github/workflows/deploy.yml:67).

**Verify deployed isolation and background work.** Application tenant guards are useful, but historical chat and QA evidence do not establish current database RLS enforcement. Test a production-like environment with two schools, two campuses and seeded nonzero financial/academic data. Verify queues, PDF generation, realtime reconnection, webhook retries, duplicate prevention, failed-job handling and backup restoration. A job accepted by an endpoint is not proof of completion.

**Strengthen AI data handling.** Pseudonymization exists, but free-text names and local identifiers can survive a field-based masking approach. The current scanner is Pakistan-oriented. Validate the complete outbound prompt, enforce an approved provider list and prevent configuration errors from falling back to a public service. Treat pseudonymized pupil information as sensitive. Evidence: [provider selection](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/ai/openai.ts:78), [masking](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/ai/pseudonymize.ts:123).

**Complete recurring usability defects.** Prioritize school/campus creation, validation, search/filter correctness, editing, draft recovery, safe deletion, parent invitation and attachments. Linear contains both older Done tickets and later reports on similar topics. Reconcile those against current behavior instead of assuming either that everything remains broken or that a Done status proves it works. Relevant items: [school creation SKO-192](https://linear.app/skoolee-ai-app/issue/SKO-192/new-school-adding-problem), [validation SKO-194](https://linear.app/skoolee-ai-app/issue/SKO-194/no-validiation), [form data loss SKO-196](https://linear.app/skoolee-ai-app/issue/SKO-196/form-refresh-problem), [learning documents SKO-204](https://linear.app/skoolee-ai-app/issue/SKO-204/documents).

## Marketing corrections

The [live marketing site](https://www.skooleeai.com/) has strong visual breadth and role tours. Its claims need to match the product and the founder's stated zero-school stage.

1. Verify the origin and permission for testimonials presented as coming from real campuses. Remove invented or unverified customer quotations. Demonstration personas belong in clearly labeled demo screens, not customer endorsement sections.
2. Present the 70% time-saving calculator as an adjustable assumption, not a measured customer result. Actual staff time value is not automatically a cash saving.
3. Replace blanket claims that competitors cannot provide multilingual AI, human review, messaging or multi-campus capabilities. Make specific, supportable comparisons.
4. Reconcile plan entitlements across marketing, application, billing and onboarding. The live site advertises 100 free students while current source config allows 50. Pro advertises 400 versus source 500; Enterprise advertises 1,200 students/3 campuses versus source 2,500/5. AI-credit allowances also differ. Evidence: [plan definitions](/Users/angular_dev_15/Downloads/skoolee-ai/src/config/plans.ts:26).
5. Resolve the rollover promise. The website says unused plan credits roll forward; the inspected reset path resets usage without accumulating unused allowance. Verify deployed behavior and make one consistent policy. Evidence: [monthly reset](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/api/cron/ai-credits-reset/route.ts:35).
6. Replace unconditional same-day onboarding promises with a scoped promise, such as a guided first-class setup using clean sample data. Historical data migration, guardian deduplication, finance opening balances and staff training need an agreed process.
7. Distinguish shipped, pilot and planned capabilities. Mobile/desktop wrappers do not establish five finished native or offline products. Evidence: [platform roadmap](/Users/angular_dev_15/Downloads/skoolee-ai/ROADMAP.md:1).
8. Explain that the customer-facing school owner role differs from SkooleeAI's internal vendor owner. School leaders care about learning, staff and collections; vendor billing and AI credits should not dominate their product tour.

## The recommended flagship workflows

### Paper assessment to targeted teaching

This is the best match for the current product. Begin with a structured paper marks register: the teacher has already graded the work, and SkooleeAI reads the recorded numbers. Expand to bubble answer sheets and then more complex response processing.

The workflow should be: generate template → identify exam and roster → capture image → check image quality → extract values → validate against roster and mark limits → review uncertain cells → approve import → use the existing exam review/publish process.

QR identifies the student, assessment and paper version. Optical mark recognition reads filled bubbles. Optical character recognition reads text or handwritten numbers. Evaluating an essay or handwritten mathematical reasoning is a separate assessment task and needs a rubric and teacher review.

The first release should include original-image crops beside extracted values, duplicate detection, absent-student handling, total/range checks, roster mismatches, a before/after import preview and batch rollback. A second scan must not silently create a second grade. Identifiers in the QR should be opaque, not a public bundle of pupil details.

For learning-gap analysis, collect question-level marks mapped to learning objectives. A total score of 54% alone cannot reliably tell you whether the problem is fractions, language comprehension or missing work. Draft a reteaching group and short follow-up quiz from the actual item evidence, then let the teacher approve it.

Measure minutes per class, uncorrected transcription errors, percentage needing review and time to feedback. [Gradescope already offers paper/bubble scanning and uncertain-mark review](https://guides.gradescope.com/hc/en-us/articles/22065675043341-Grading-a-Bubble-Sheet-Assignment); the proposed advantage is integration into the entire school and family workflow.

### Curriculum grounded quiz and test studio

A teacher selects curriculum, grade, subject, topics, learning objectives, language, duration, total marks, question types and desired difficulty distribution. The system drafts questions with answer keys, explanations and rubrics, linked to the approved source material. It should generate printable and online versions from the same assessment definition.

Include editable question banks, version history, duplication checks, mathematical validation where possible, teacher approval, accessible layouts, exam blueprint checks and item-level reporting. Label generated difficulty as an estimate until student responses support calibration. Two generated variants are not automatically equivalent in difficulty.

Support ordinary homework, low-stakes quizzes and formal exams as different modes. Build timed attempts, autosave/resume, accommodations, attachments, manual marking and regrade appeals before claiming a complete online examination product.

Curriculum materials must be school-owned or licensed for the use. Preserve source references and avoid exposing teacher-only answer keys to the student tutor. AI should suggest assessment and feedback; formal grades and progression remain under authorized school control.

[Toddle](https://www.toddleapp.com/) and [Classera](https://classera.com/en/company/new_release/) already advertise AI teaching and assessment capabilities. SkooleeAI's proposed differentiation is a single reviewed chain from curriculum to paper/digital evidence to follow-up action.

### Family action inbox

Give families one view across their children with clear actions: acknowledge a report, explain an absence, approve a trip, book a meeting, pay an installment or support a ten-minute practice task. Each action has a due date, completion status and a responsible staff contact.

A short weekly digest should say what changed, what requires action and what is going well. Teachers should control academic recommendations. Families choose language, communication channel and quiet hours. Sensitive details remain behind authenticated access; a message can point to a secure action.

Measure completed actions, parent activation, repeated office calls and resolution time. A translated notification is less valuable than a parent successfully completing a useful next step.

### School operations action queue

Provide a principal with unresolved situations rather than only charts: uncovered lessons, missing attendance, pending report approvals, failed parent deliveries, unmatched payments and overdue consent. Each item should show the source record, owner, deadline and next action.

Start with explicit rules and recorded events. AI can summarize and explain; it should not invent urgency or autonomously change grades, fees or staffing. Let the principal approve a proposed substitute-teacher change and notify the affected people through the normal workflow.

Measure time to resolution and avoided duplicate work. Add an improvement evidence workspace linking a concern, intervention, follow-up assessment and outcome. Do not present a correlation-based risk score as a diagnosis or proof of a child's potential.

### Verified pickup and handover

For primary schools, authorize guardians and temporary delegates, issue expiring pickup codes, confirm identity at the gate, record who released the student and who received them, and handle custody restrictions and emergency exceptions.

A code or screenshot by itself is insufficient proof of identity. Include revocation, replay prevention, staff verification and a documented fallback when phones or networks fail. This is a promising later differentiator whose operational safety must be tested with school staff.

## Secure examinations

Integrate an established locked examination client such as [Safe Exam Browser](https://safeexambrowser.org/about_overview_en.html) after the assessment engine is reliable. Its [integration guidance](https://safeexambrowser.org/developer/seb-integration.html) covers checking client settings/version and controlling examination access; detecting a user-agent string alone is not sufficient.

Offer school-configured modes: ordinary practice, supervised classroom quiz, restricted-resource exam and permitted-AI assessment. For formal exams include a device readiness check, rehearsal, accommodations, controlled resume, server-side timing, answer recovery, invigilator actions and an audit trail. Validate the selected devices and operating systems before committing to support.

Browser restrictions do not establish what happens on another device or elsewhere in the room. Avoid a cheat-proof claim. Tab-switch events or automated anomaly signals should trigger review, not automatic allegations or grade penalties. Webcam emotion analysis and biometric surveillance should not be selling features.

## Feature catalogue for the global product

P0 means required trust/reliability work; P1 means the first complete pilot product; P2 means expansion after validation; P3 means advanced or segment-specific development. Priorities express dependencies and customer value, not a rejection of the global ambition. Extend means a foundation exists; New means a substantive workflow still needs implementation. Each item describes a target capability, not a claim of current completeness.

| ID | Capability | User value | Scope | Priority |
|---|---|---|---|---|
| 01 | Shared authorization and tenant/campus/child ownership rules | Every surface enforces the same access rights | Extend | P0 |
| 02 | Reliable account lifecycle and administrator MFA | Invitations, recovery, role changes and revocation work predictably | Extend | P0 |
| 03 | Approved report versions and publication gates | Families see the intended, approved result | Extend | P0 |
| 04 | Reversible imports and clear validation | Staff can catch and correct bulk mistakes | Extend | P0 |
| 05 | Backups, restore rehearsals and migration checks | Schools can recover from mistakes and deployment failures | Extend | P0 |
| 06 | Auditable grade and finance corrections | Explain who changed what and why without destroying history | Extend | P0 |
| 07 | Job status, retries and delivery receipts | Staff know whether reports and messages actually completed | Extend | P0 |
| 08 | Draft recovery, consistent navigation and accessibility | Work survives interruptions and is usable by more people | Extend | P0 |
| 09 | Guided school setup and import reconciliation | Reduce the effort and uncertainty of switching systems | Extend | P1 |
| 10 | Configurable admission forms and enquiry pipeline | Track interest through enrollment without duplicate entry | Extend | P1 |
| 11 | Permanent student identity and enrollment history | Preserve records through class, campus and year changes | Extend | P1 |
| 12 | Principal action queue | Put unresolved work in front of the responsible person | Extend | P1 |
| 13 | Exam scheduling, room capacity and invigilation | Coordinate people and physical space accurately | Extend | P1 |
| 14 | Substitute teacher and missed-lesson recovery | Respond to absence and preserve learning continuity | New | P2 |
| 15 | Intervention ownership and reassessment | Turn concern into action with an outcome record | Extend | P1 |
| 16 | School-group policy templates with controlled local overrides | Standardize campuses without ignoring local needs | New | P2 |
| 17 | Curriculum and learning objective map | Tie lessons, questions and feedback to what is being taught | Extend | P1 |
| 18 | AI quiz/test generation with source references | Produce editable drafts aligned to the chosen content | New | P1 |
| 19 | Reviewed question bank and assessment blueprints | Reuse quality questions and check syllabus coverage | New | P1 |
| 20 | Paper marks scan with teacher-approved import | Reduce repetitive entry and transcription errors | New | P1 |
| 21 | Assignments, submissions and rubrics | Complete the basic teaching and feedback workflow | New | P1 |
| 22 | Question-level misconception and item review | Identify what needs reteaching and which questions were poor | New | P2 |
| 23 | Lesson plans and differentiated activity groups | Help teachers prepare appropriate follow-up work | Extend | P1 |
| 24 | Marking moderation and regrade workflow | Improve consistency and resolve disputed results | New | P2 |
| 25 | Student Today page | Show lessons, tasks, due dates and the next useful action | Extend | P1 |
| 26 | Practice with hints and spaced review | Build understanding with short revisits of weak skills | New | P2 |
| 27 | Feedback and improvement portfolio | Show progress through work and revisions, not only averages | New | P2 |
| 28 | Source-grounded student study assistant | Explain approved material without revealing restricted answers | Extend | P2 |
| 29 | Assessment accommodations and accessible materials | Support authorized extra time and different access needs | New | P1 |
| 30 | Exam attempts with autosave and recovery | Prevent lost answers and support reliable submission | New | P1 |
| 31 | Family action inbox across siblings | Complete school requests from one place | Extend | P1 |
| 32 | Multiple guardians and granular access/consent | Reflect real families, custody and communication permissions | Extend | P1 |
| 33 | Weekly family digest and short home practice | Make academic updates understandable and actionable | Extend | P1 |
| 34 | Parent-teacher meeting booking and follow-up | Connect a conversation to agreed actions | New | P2 |
| 35 | Absence explanation, leave and trip consent | Replace repeated calls and paper permission slips | Extend | P1 |
| 36 | Secure fee statements, installments and receipts | Make family obligations and payments clear | Extend | P1 |
| 37 | Payment reconciliation and duplicate prevention | Match funds to the correct invoices reliably | Extend | P1 |
| 38 | Refunds, credit notes, waivers and approval separation | Handle financial exceptions without erasing history | Extend | P1 |
| 39 | Country-specific tax and invoice packages | Apply the school's verified local requirements | New | P2 |
| 40 | Staff hierarchy, workload and absence cover | Support real reporting lines and staffing decisions | Extend | P1 |
| 41 | Payroll provider interfaces and local rules | Avoid forcing one country's payroll model onto every school | Extend | P2 |
| 42 | Purchasing, budgets and asset maintenance | Connect requests, approval, receipt and expenditure | Extend | P2 |
| 43 | Library reservations, barcode issue/return and fine policy | Complete lending operations | Extend | P2 |
| 44 | Bus boarding, arrival and handover records | Know which students are on a route and where handover occurred | Extend | P2 |
| 45 | Authorized QR pickup | Support a verified release process at the school gate | New | P2 |
| 46 | Restricted clinic and safeguarding workflows | Give designated staff access to appropriate confidential records | New | P2 |
| 47 | Facilities requests and internal service desk | Turn an RFI or maintenance request into assigned, trackable work | Extend | P2 |
| 48 | Clubs, sports, trips and participation | Coordinate activities, capacity, payments and consent | New | P2 |
| 49 | Language, RTL, timezone, calendar and currency packages | Make the whole workflow fit the institution's location | Extend | P1 |
| 50 | Configurable curriculum, grading and term structures | Support national, Cambridge, IB and other school models | Extend | P1 |
| 51 | School identity integration and roster exchange | Reduce duplicate accounts and data entry | New | P2 |
| 52 | Regional hosting and data lifecycle controls | Support procurement requirements and accountable processing | Extend | P2 |
| 53 | Versioned APIs, webhooks and integration monitoring | Let schools retain other useful systems | Extend | P2 |
| 54 | Low-bandwidth operation and conflict-aware offline capture | Keep essential work usable when connectivity is poor | New | P2 |
| 55 | Safe Exam Browser integration | Offer a controlled exam environment on supported devices | New | P2 |
| 56 | Improvement and accreditation evidence workspace | Assemble traceable records of actions and outcomes | New | P2 |
| 57 | Capacity and staffing scenario planning | Explore enrollment, rooms and timetable constraints | New | P3 |
| 58 | Teacher question-quality review network | Share reviewed resources under clear licensing and access rules | New | P3 |
| 59 | Careers, counseling and alumni pathways | Serve secondary-school progression needs | New | P3 |
| 60 | Optional canteen, boarding and specialist school packages | Extend only where the school segment needs them | Extend | P3 |

The daily home screen should remain simple for every role. Show today's actions first, detailed workspaces second, reports third. Hide modules the school has not enabled. A 60-capability platform should not require a teacher or parent to navigate 60 capabilities.

## Additional creative ideas worth testing

**Assessment quality check:** before publication, identify missing objectives, repeated questions, answer-key inconsistencies and unrealistic timing. After the test, flag items that merit teacher review. Avoid treating tiny samples as reliable psychometric results.

**Lost learning recovery:** after an absence, assemble the missed topics, approved materials and a small catch-up task; let the teacher check it and give the parent a manageable next step.

**Parent meeting preparation:** create a concise evidence-linked timeline of progress, strengths and agreed follow-ups. The teacher edits it before sharing. This could save more time than another general-purpose chatbot.

**Switching preview:** import a school's sample spreadsheet into a staging area, show duplicate guardians, missing fields and balance mismatches, then produce a reconciliation report before committing records. Migration confidence is a valuable sales feature.

**School workflow templates:** package repeatable processes such as a new admission, report-card week, staff leave coverage and year-end rollover with visible status and accountable owners. Allow local changes without custom code for each school.

**Policy assistant with evidence:** answer school-specific questions using approved policies, always linking the policy version. Route uncertain or personal cases to a staff member. Keep it separate from confidential counseling or safeguarding records.

**Inspection evidence export:** connect objectives, student work, feedback, interventions and reassessments in one traceable package. [ETEC's NAFS school guide](https://media.etec.gov.sa/media/fpxas0kr/school-guide.pdf) connects assessment with school improvement; alignment must be validated and should not be advertised as certification.

## Global architecture and scale plan

Scale means institutional complexity, concurrent demand, data safety, operational support and reliable change. Buying a larger database alone will not resolve these.

**Keep one coherent application while separating domains.** A modular application with clear boundaries for identity, enrollment, academics, assessment, finance, messaging and operations is a reasonable next step. Define stable services and events before considering independently deployed services. Extract a component only when measured load, isolation or team ownership justifies it.

**Make membership explicit.** Model platform → school group → institution → campus, with permanent users and scoped memberships. A teacher may work across campuses; a guardian may have children in different schools. Cross-school access must be explicitly authorized. Identity similarity never establishes a relationship.

**Separate the school record from the enrollment record.** Maintain permanent student identity, guardianship, academic-year enrollment, classes, curriculum and transfers separately. Historical reports and invoices should retain the rules and versions that produced them.

**Build one assessment domain.** Questions, objective tags, paper versions, answer keys, rubrics, attempts, scans, reviews and gradebook entries should connect. A scanned or online assessment should ultimately use the same approval and publication rules. This prevents separate features from disagreeing about the student's result.

**Use durable asynchronous work.** OCR, large imports, report batches, parent messaging and heavy analysis need recorded jobs with progress, retries, cancellation, idempotency and failure handling. Use an outbox or equivalent durable event handoff so a saved grade and its notification cannot silently diverge. Apply quotas fairly per tenant.

**Protect transactional records.** Use database transactions, constraints and idempotency keys for grade imports, invoice generation, payment webhooks, refunds, stock movement and student promotion. Store money with explicit currency and appropriate precision. Store source evidence and approved corrections instead of overwriting financial history.

**Design for noisy school-day peaks.** Benchmark attendance at morning registration, simultaneous quiz starts, result publication, termly invoicing and large report downloads. Track query latency, database connections, failed jobs, queue age, delivery rates and per-school resource use. Protect the main transactional database from expensive reporting queries as volume grows.

**Create an AI gateway with policy and evaluation.** Centralize provider selection, prompt versions, outbound data rules, source references, request budgets, audit metadata and human approval. Cache reusable curriculum content and batch suitable work. A model outage should leave manual school workflows usable. Evaluate question validity, feedback quality, Arabic output and failure cases using educator-reviewed sets.

**Make localization foundational.** Country packages should configure identity fields, addresses, phone formats, language/RTL, academic calendars, weekend rules, grading, currency, taxation, payments and retention policy. Curriculum is a separate configuration from country: several curricula can operate in one country.

**Offer integration contracts.** Start with validated CSV import/export and documented APIs. Add identity, roster, LMS and accounting integrations in response to customers. Evaluate established interoperability standards such as OneRoster, LTI and QTI when choosing the actual integration design. Do not advertise certification or compatibility until tested against the relevant standard and partner.

**Make production support part of the platform.** Include incident ownership, audited time-limited support access, customer-visible service status, restore runbooks, migration tooling and operational handover. School groups will ask who can recover the service during report-card week.

Suggested scale gates are successive validation stages, not current capacity claims:

| Stage | Evidence required before expansion |
|---|---|
| First pilot | A complete academic and family workflow; isolation tests; approved report delivery; recoverable data |
| First 10 schools | Repeatable onboarding; weekly active teachers; controlled job/retry behavior; reliable support process |
| Around 100 schools | Representative peak-load tests; tenant resource limits; optimized reporting; safe releases and restore drills |
| Larger networks and regions | Regional placement/processing policy; network administration; SSO; integration operations; contracted support commitments |

Choose numeric performance targets from the actual workload and buyer requirements. Do not claim support for a million students from code structure or synthetic account counts alone.

## Saudi readiness

The inspected source explicitly includes Pakistani-school prompt wording, Urdu/English generation, PKR pricing, Pakistan nationality defaults and Pakistan-oriented identity masking. Arabic report text alone would not make the product ready for a Saudi school. Evidence: [AI prompts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/ai/prompts.ts:202), [board configuration](/Users/angular_dev_15/Downloads/skoolee-ai/src/config/boards.ts:9).

Complete Arabic and English across the interface, mixed-direction names/numerals, PDFs, notifications, help material and support. Add configurable SAR finance, local contact/identity formats, calendars, grading and curricula. Validate payment provider support for the actual school entity and the payment methods its parents use.

Map storage, backups, AI processing, support access and subprocessors. Saudi hosting can support procurement, but PDPL is not a blanket rule that all personal data must remain in Saudi Arabia: cross-border transfers have conditions and safeguards. Validate the intended deployment and contracts with qualified local review. [SDAIA regulations](https://sdaia.gov.sa/en/SDAIA/about/Pages/RegulationsAndPolicies.aspx), [PDPL including Article 29](https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf).

Do not assume all tuition is VAT-exempt. ZATCA describes qualifying education cases in which the state bears VAT for citizens; the school, service and eligibility matter. Implement the buyer's validated invoicing and tax treatment, including applicable e-invoicing requirements. [ZATCA education notice](https://zatca.gov.sa/en/MediaCenter/News/Pages/news-600.aspx), [e-invoicing](https://www.zatca.gov.sa/en/E-Invoicing/Pages/default.aspx).

Noor already has an established role in Saudi school administration. Treat government interchange as an integration discovery workstream. Confirm access, authorization and supported mechanisms before promising an API connection. [Official Noor portal](https://noor.moe.gov.sa/Noor/EduWaveLanding/Home.aspx).

## Operating costs and product economics

Budget is not the product scope constraint in this proposal. Operating costs should still be measured before offering unlimited AI or committing to prices.

Vercel's Hobby policy restricts commercial use and explicitly includes advertising a product/service in its commercial examples. Review the existing commercial deployment against that policy. The listed Pro starting price is USD 20/month. Supabase Pro is listed at USD 25/month for the base configuration with one Micro instance covered by compute credits. Those two starting amounts total USD 45/month before taxes, additional projects, overages and other services; this is not a total production budget or a Saudi-hosting solution. [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing).

Supabase Free does not include automatic backups and may pause inactive projects. School data needs a defined and tested recovery process regardless of the chosen plan. A paid tier does not substitute for testing restoration. [Supabase pricing and plan limits](https://supabase.com/pricing).

The current application's OpenAI path uses an API key. A personal ChatGPT/Codex subscription does not automatically fund those API requests; budget and meter them separately. [Official OpenAI pricing documentation](https://learn.chatgpt.com/docs/pricing).

Track hosting, database, storage/egress, AI, OCR, messaging, email, monitoring and support time per school and active student. Calculate margin after onboarding and support, not only API token costs. Use a school/platform subscription with an understandable enrollment band and metered allowances for genuinely variable-cost services. Set regional prices through buyer discovery and measured costs rather than copying current PKR tiers worldwide.

## Roadmap to LEAP 2027

The official event currently lists 12–15 April 2027 at RECC Malham, Saudi Arabia. This leaves roughly six months from the review date. Confirm startup program deadlines separately; older subpages can still refer to prior editions. [LEAP official event page](https://onegiantleap.com/).

| Period | Product and engineering work | Commercial evidence |
|---|---|---|
| October 2026 | Fix trust and release concerns; reconcile marketing; establish a canonical feature/evidence backlog; define assessment data model | Observe real school workflows and recruit design partners |
| November 2026 | Complete onboarding, one academic workflow and family access; implement the first question-bank/assignment slice | Start a tightly scoped school pilot; record baseline time and errors |
| December 2026 | Structured marks-sheet scanning and teacher review; quiz drafts with approved sources; track jobs and costs | Complete repeated report/assessment cycles with pilot teachers |
| January 2027 | Student submissions/feedback and parent actions; first Arabic/RTL workflow with local review | Recruit a Saudi design partner; validate curriculum and buyer objections |
| February 2027 | Targeted practice/reassessment; strengthen finance/operations required by pilots; benchmark representative peaks | Measure adoption, support load, correction rates and willingness to pay |
| March 2027 | Reliable demonstration, localization QA, security/restore evidence, integration plan and supporting materials | Seek paid conversions; gather permissioned case studies; schedule LEAP meetings |
| Early April 2027 | Freeze demonstration scope; rehearse with synthetic data; prepare a recorded fallback | Tailor customer, investor and partner asks using actual evidence |

These are planning milestones, not an estimate that one developer can complete every catalogue item by April. The LEAP product should demonstrate three complete workflows. The global catalogue can extend beyond the event. If capacity becomes constrained, preserve trust, the assessment journey and pilot learning before adding more modules.

## Pilot scorecard

Aim for 3–5 referenceable pilots, including a Saudi design partner if feasible. These are targets, not existing traction. Define the exact classes, teachers and workflows before starting.

| Measure | How to collect it | What it establishes |
|---|---|---|
| Teacher task time | Time the same marks/report workflow before and after adoption, including review and corrections | Actual workflow savings |
| Scan correctness | Compare extracted and approved cells against a manually verified set | Extraction quality and review burden |
| Assessment quality | Teacher acceptance, revisions and invalid/ambiguous questions | Usefulness of generated drafts |
| Teacher adoption | Weekly active teachers and completed target workflows | Repeated value beyond a demo |
| Family action completion | Requests delivered, opened and completed within the agreed window | Follow-through, not notification volume |
| Reliability | Failed requests, missing jobs, duplicates, restore drill and peak-load behavior | Operational fitness for the tested workload |
| Learning follow-up | Intervention completion and comparable reassessment evidence | Progress signals; not automatic causal proof |
| Commercial value | Paid conversion, renewal intent and documented reasons | Willingness to buy |
| Economics | Recurring cost, onboarding effort and support time per school | Sustainable delivery |

## LEAP pitch

Recommended positioning: **SkooleeAI connects school operations with teaching and family action, turning everyday assessment evidence into verified records and a clear next step for every child.**

An honest pre-pilot pitch is: “We have built the core school management platform. We are developing a connected assessment workflow that lets a teacher scan a paper mark sheet, verify the marks, identify learning gaps from question-level evidence and send an approved next step to the family. We are seeking pilot schools and a Saudi implementation partner to validate the impact.”

As pilots finish, replace intentions with measured results. Do not invent school counts, revenue, learning gains or time savings.

The three-minute demonstration should follow one class and one fictional pupil:

1. The teacher selects a learning objective and reviews a generated assessment.
2. The teacher scans a prepared paper marks sheet; one ambiguous cell is deliberately caught and corrected.
3. Verified question-level results show a specific learning gap and draft a short follow-up activity.
4. The teacher approves feedback; the parent receives a concise Arabic or English action.
5. A clearly labeled later reassessment shows progress; the principal sees whether follow-up was completed.

Do not imply the child's later progress occurred instantly during the demo. Use synthetic data and a labeled timeline. Keep a recorded fallback for venue connectivity.

For **schools**, ask for a scoped pilot with a named school champion, agreed measures and a conversion discussion. For **partners**, ask for introductions, local implementation and support capability with clear responsibilities. For **investors**, show the repeatable buyer segment, actual adoption, costs, retention signals, expansion path and milestone-based funding use. One product story can support all three audiences, but each needs a different ask.

Use a concise pitch deck: problem, initial buyer, workflow demo, evidence, market-entry strategy, competition, business model, scale plan, team and ask. The historical 39-slide PowerPoint at [SkooleeAI-Pitch.pptx](/Users/angular_dev_15/Downloads/SkooleeAI-Pitch.pptx) can serve as supporting material; its contents were not audited in this review.

## Recommended execution backlog

The next work packages should be: shared identity/authorization and report approval; migration/release recovery; a truthful and synchronized product catalogue; assessment and curriculum data model; assignments and learner attempts; structured paper import; family actions and measurable interventions; Arabic/country configuration; representative scale testing; and pilot evidence.

Maintain one record per capability with a user problem, owner, current state, source evidence, acceptance criteria, dependencies and pilot measure. Link it to Linear rather than scattering completion claims across chats. Use states such as proposed, implemented, verified in staging, verified in pilot and generally available. Preserve existing architecture decisions and historical fixes, but require fresh evidence for each release.

The strongest long-term selling asset will be schools successfully completing important work with SkooleeAI: reliable data, useful learning feedback, engaged families, local fit and an implementation process that schools trust.
