# School AI implementation ledger

This ledger tracks the comprehensive PRD agreed in the conversation. A planned capability is not an implemented capability. Provider configuration is not a successful live integration test. Source-level checks are not deployment acceptance.

## Ownership

| Workstream | Owner | Files |
| --- | --- | --- |
| Persistence, scope, versions, approvals, policies | Backend agent | School AI repository/API, Prisma migration and tenant registry |
| Shared multilingual workspace and guided setup | UX agent | School AI workspace, composer, onboarding and EN/AR/UR copy |
| Assessment, paper validation, attempts and marking | Assessment agent | Assessment/exam domain, feature panels and exam API |
| Intake, provider adapters, navigation, integration and verification | Root | Intake/transcription/generation, cross-role entry, integration tests and this ledger |

## Confirmed scope decisions

- The user selected **standard browser exams without device lockdown** on 12 October 2026. EXM-04 and EXM-05 are outside the selected delivery scope. The application must not claim to block operating-system apps, other browser tabs or screenshots.

## PRD coverage and release gates

BUILT means the stated subset exists and has local verification. PARTIAL identifies implemented work and the remaining boundary. OPEN means no new AI implementation for that requirement. The whole PRD is not complete or production accepted.

| ID | Requirement | Status |
| --- | --- | --- |
| SET-01 | New school, existing records and migration paths; first-priority selection | BUILT — three adaptive setup paths and first-outcome selection |
| SET-02 | Progressive school/campus/year/people/resource/finance/policy questions, saved drafts | PARTIAL — versioned answers and resume; reviewed academic-year/class execution and roster import; broader entity setup open |
| SET-03 | Skip, unknown, proposed defaults, assigned missing-information tasks and readiness | PARTIAL — skip, known defaults and missing-fact readiness; assigned follow-up tasks open |
| SET-04 | Import mapping, duplicate reconciliation, relationships, opening balances, cutover acceptance | PARTIAL — EN/AR/UR CSV column suggestions, explicit mapping, row correction/selection, identity conflicts, exact-preview roster creation and receipts; historical/financial migration and cutover acceptance open |
| UX-01 | Shared controls, consistent previews/editing/review/progress/empty/error states | BUILT for the new workspace — shared controls, modal, draft guards, skeletons and recovery |
| UX-02 | English, Arabic, Urdu, RTL, localized labels and accessible controls | BUILT for interface copy — EN/AR/UR and RTL; educational language calibration open |
| UX-03 | Immersive guided prompts, responsive layout, purposeful motion and reduced-motion alternative | BUILT — fullscreen guide, keyboard guard, reduced motion and mobile overflow verification |
| UX-04 | Context-aware text/audio/file/camera composer throughout relevant workflows | PARTIAL — shared composer in setup and overview; source upload/camera review; not every domain editor |
| UX-05 | Live voice, interrupt/resume, explicit understanding and ambiguous-entity confirmation | OPEN — voice is recorded transcription, not a live conversation |
| MEM-01 | Separate versioned facts, policies, preferences and workflow context | PARTIAL — typed versioned setup/source/curriculum/paper/workflow/policy records; bounded same-session chat follows prior answers, reset on campus/subject change; durable conversation history open |
| MEM-02 | Source/owner/effective-date/scope/confirmation/conflict/supersession history | PARTIAL — scoped ownership, paginated immutable history, named actor/time/action evidence, two-version comparison, approval of the saved current version and CAS restore as a new draft; effective-date/conflict resolution open |
| DOC-01 | Private scoped file intake, original preservation, validation and duplicate identity | BUILT — bounded validated intake, private originals, deduplication and scoped download; S3 live test open |
| DOC-02 | Multi-page capture, crop/rotation/reorder, quality checks and phone QR handoff | PARTIAL — fullscreen photo capture/import, local crop/rotation/reset/reorder, up to 10 pages, private PDF assembly, dimension checks and explicit clarity/order review; blur/perspective detection and phone QR handoff open |
| DOC-03 | Text/layout/table/math/figure extraction with page and region provenance | PARTIAL — native text and gated document adapter; layout/math/region extraction calibration open |
| DOC-04 | Source/extraction review, uncertainty, missing-page handling and corrections | PARTIAL — editable text, image original preview and explicit review; region/page reconciliation open |
| CUR-01 | Approved curriculum, school plan, section coverage and assessment scope separated | PARTIAL — approved curriculum with taught/included outcomes; separate section coverage model open |
| CUR-02 | Outcomes, editions, sources, exclusions and teacher confirmation | PARTIAL — source excerpts/page references, outcome scope and reviewed syllabus import; editions open |
| ASM-01 | Blueprint, question bank, provenance, solutions, rubric and fixed paper versions | PARTIAL — blueprint, provenance, key, rubric, immutable snapshots and reusable approved-question bank with tags/type/marks/language/difficulty-label filters, explicit outcome mapping and pinned copies; semantic and difficulty calibration open |
| ASM-02 | AI generation, selective regeneration, pinned items and independent validators | PARTIAL — provider adapter and locked regeneration; live provider and independent semantic solver open |
| ASM-03 | Marks/optional-group totals, scope, duplicates, answerability and diagram checks | PARTIAL — deterministic totals/options/scope/duplicate/evidence/rubric checks; semantic answerability and diagrams open |
| ASM-04 | Print and online paper parity; restricted answer key | BUILT for browser printing — authenticated print rechecks the exact current approved version, shares the key-free candidate projection, escapes all author text and isolates document security policy; long A4 EN/AR/UR exports visually verified, system/printer font matrix remains a deployment check |
| OPS-01 | Datesheet, room capacity, seating, invigilators and accommodations connected | OPEN — existing manual scheduling is not an AI execution tool |
| EXM-01 | Standard browser question types and approved resources | PARTIAL — single choice, short text and extended text; advanced editors/resources open |
| EXM-02 | Server timing, sequenced autosave, reconnect, submission receipt and version isolation | BUILT for standard browser — snapshot, deadline, autosave, replay, receipt and bounded database-clock deadline sweeps in the existing worker; corruption is reported without grading or losing saved responses |
| EXM-03 | Practice/device checks, extra time, recovery and accessible alternatives | PARTIAL — real connectivity/storage preflight, unsent typing practice, reconnect, approved per-student 0–240 extra minutes before start; fixed deadline capped by availability; breaks/reader/scribe/assistive-media alternatives and device matrix open |
| EXM-04 | Supported secure exam client integration and server configuration verification | OUT OF SCOPE — user selected standard browser exams; secure-browser mode explicitly rejected |
| EXM-05 | Managed-device deployment policies and tested device matrix | OUT OF SCOPE — user selected standard browser exams; no managed-device deployment claimed |
| EXM-06 | Explicit camera/screen permissions, recording service, proctor console and retention | OPEN — proctoring mode explicitly rejected; no surveillance starts |
| MRK-01 | Script/student/paper/page matching, QR scripts and response extraction | OPEN — answer-script intake does not identify students or grade handwriting |
| MRK-02 | Deterministic objective scoring; evidence-linked written mark proposals | PARTIAL — deterministic choice proposals, actual response evidence and manual written marks |
| MRK-03 | Moderation, approval, key changes, regrading, appeals and result versions | PARTIAL — moderated attempt review and exact-preview transfer to the existing gradebook, followed by existing exam locking/report controls; automated regrading, appeals and new result-version automation open |
| SCH-01 | Admissions, enrolment, transfer, withdrawal and guardian relationship workflows | PARTIAL — reviewed roster creates new students through existing admission rules; no new transfer/withdrawal/guardian-access automation |
| SCH-02 | Year rollover, promotion, calendars, teacher allocation and timetabling | PARTIAL — approved academic setup creates/reuses a draft year and missing classes, preserves people/teachers and enforces lifecycle conflicts; reviewed weekly timetable draft creation uses current teachers, subjects, rooms, periods, calendar policy and clash checks; activation, promotion and automatic timetable solving/publishing open |
| SCH-03 | Recorded attendance, leave and substitute coverage workflows | OPEN — no AI attendance or substitute execution tool |
| SCH-04 | Curriculum-based lessons, quizzes, remediation and contextual performance insights | PARTIAL — curriculum-linked papers can serve quizzes; lessons/remediation/insights open |
| SCH-05 | Fees, credits, refunds, reconciliation, expense and revenue scenarios | OPEN — finance briefs are drafts; no postings or revenue execution |
| SCH-06 | Authorized audience/language/channel announcements and delivery tracking | PARTIAL — reviewed exact EN/AR/UR operational email, verified guardian audience, deduplication, transactional queue and worker with fresh access checks and truthful delivery status; SMS/WhatsApp, channel preferences and live provider verification open |
| SCH-07 | Evidence-based operational risks, accountable owners and human decisions | OPEN — no automated risk judgments or enforcement |
| SCH-08 | Year closure, archive, retention; explicit payroll/transport/library/inventory scope | OPEN — archive/retention/domain automation not completed |
| RUN-01 | Persistent versioned runs, idempotency, cancellation, partial failure and audit | PARTIAL — durable versions, assistant leases/exact replies, atomic charges, typed syllabus/academic/timetable/announcement execution receipts, reviewed roster and gradebook receipts, fenced email delivery and exam expiry sweeps; scan stop-waiting/retry preserves prepared files; general autonomous run queue/cancellation open |
| RUN-02 | Approval tied to reviewed version; concurrent edit protection; pinned decisions | BUILT for implemented operations — version-bound approvals, CAS and fixed question preservation |
| RUN-03 | Action-level autonomy policies, expiry, budgets, pause and escalation | PARTIAL — draft/approval policy records and serialized credit cap; no unattended autonomy |
| SEC-01 | Tenant/campus/role/subject checks on reads, writes and execution | BUILT for new surfaces — tenant/campus/role/subject, fresh permission grants, current student assignments, guarded campus selection and discarded late old-scope replies |
| SEC-02 | Provider allowlisting, backend secrets, hostile-document isolation and bounded input | BUILT baseline — strict input, approved provider destination, backend secrets and generic provider errors |
| SEC-03 | Answer-key separation, source access, recordings, retention and deletion | PARTIAL — key-free candidate projections and private originals; retention/deletion jobs open |
| QA-01 | Representative EN/AR/UR document and assessment calibration | OPEN — synthetic language checks are not representative educational calibration |
| QA-02 | Browser/mobile/keyboard/RTL/reduced-motion verification | PARTIAL — Chromium desktop/mobile/RTL/reduced-motion and draft/microphone recovery; device matrix open |
| QA-03 | Tenant isolation, stale approvals, retries, exam reliability and load tests | PARTIAL — real PostgreSQL security/race/deadline tests and browser recovery; load tests open |
| QA-04 | Measured setup time, correction effort, teacher review burden and recovery success | OPEN — no measured pilot outcomes claimed |

## External dependencies

- AI document and audio processing require an explicitly enabled approved provider, credentials and selected compatible models. Missing configuration returns a clear unavailable response.
- Original source retention requires private object storage. Files must not be written under public/.
- Secure-client lockdown, managed-device controls and remote proctoring require specific deployed and tested integrations. A fullscreen webpage is not lockdown.
- Database migrations must be reviewed and deployed to the intended environment. Do not reset an existing database to install these features.
- No live school communications, financial postings, deployments or exam sessions are triggered by implementation tests.

## Verification

The isolated acceptance database is PostgreSQL on `127.0.0.1:55438/postgres`. Both `DATABASE_URL` and `DIRECT_URL` were overridden. Synthetic sessions use a test-only secret. The configured remote school database was not migrated or used for fixtures. Browser tests run on port 3106 with external AI calls disabled.

- `npm run check:ui`: 3 checks passed for shared controls, focus and toast ownership.
- `npm run test:school-ai`: 87 tests passed for provenance, question restrictions, server sequencing, permissions, documents, locale coverage, period changes and bounded rollback recovery.
- `npm run test:school-ai:db`: 131 tests passed with fixture files isolated and deliberate concurrent requests within scenarios. Coverage includes campus/tenant/teacher scope, immutable revisions, concurrent edits/approvals, idempotency, actual topic imports, atomic usage limits, timetable writer races, guardian delivery fences, gradebook transfers and exam retry deadlines.
- Chromium browser acceptance: 76 distinct cases passed across the completed suites. Coverage includes fullscreen setup/resume, private intake and scanning, EN/AR/UR mobile layout, print isolation, history, roster, school-owner campus selection, reviewed timetable edits, lost-response recovery, submitted answers, manual moderation, gradebook transfer, announcement access revocation and unsaved changes. The seven exam cases were rerun successfully after the final retry-clock change.
- Changed-file ESLint, the complete TypeScript check, Prisma schema validation and `git diff --check` passed. Build verification is recorded in the rollout notes.
- The all-fixtures-at-once database stress run passed 130/131; one independent timetable creation exhausted bounded serialization retries and safely returned 409. This is retained as an unresolved sustained-load gate, not presented as production load acceptance. The reproducible integration script separates fixture lifecycles while retaining its explicit concurrency tests.
- A broader pre-existing UI contract snapshot is stale for `RoleHeader.tsx`: it still expects an inline password-change request that was already absent in HEAD before this work. The new header change only alters responsive classes. This is recorded separately from the new feature acceptance.

## Implementation map

- `src/app/ai`: authorized authoring workspace and student/staff exam routes.
- `src/components/school-ai`: feature composition using shared `src/components/ui` controls; full-screen setup uses the shared `ModalSurface` rather than a second dialog implementation.
- `src/lib/school-ai`: strict schemas, scope, versioned repository, intake/provider adapters, assessment/exam rules and typed execution.
- `src/app/api/school-ai`: authenticated, bounded API entry points. Model output cannot invoke arbitrary routes or SQL.
- `prisma/migrations/20261012090000_school_ai_workspace` and later School AI migrations: additive tables and constraints. Existing academic and financial records are preserved.
- `tests/school-ai`: reusable synthetic fixtures, pure/domain/database/browser verification. Tokens, screenshots and browser output remain under ignored `test-results/`.

## Route and interaction coverage

The complete page-path inventory is reconciled in [the shared route checklist](../ui-plan/route-checklist.md): 87 pages and all discovered route boundaries. Existing route statuses are not promoted by reuse of a shared component. New School AI routes remain IN PROGRESS for the complete device/role/state matrix even where individual cases pass.

| Surface | Verified scope | Evidence | Remaining UI acceptance |
| --- | --- | --- | --- |
| `/ai`: overview and fullscreen setup | Synthetic manager/owner/teacher scope; 1440×1000 desktop and selected 360×800 EN/AR/UR flows; resumable answers, missing facts, bounded chat context, denied microphone, dirty navigation, reduced motion | `workspace`, `ux`, `assistant-scope` browser suites | Tablet, screen-reader/zoom matrix and live microphone capture UNVERIFIED |
| `/ai`: sources and roster | Private source save/review, multipage crop/rotation/order, failed/slow scan recovery, mapped CSV correction, duplicate/stale imports; desktop and selected RTL phone cases | `scan`, `roster-import`, `workspace` browser suites | Representative OCR/math/handwriting quality, QR handoff and full device matrix UNVERIFIED |
| `/ai`: curriculum, papers and question bank | Reviewed evidence, pinned reuse, exact-version printing, key isolation and EN/AR/UR long-paper PDF pagination; selected phone layouts | `question-bank`, `paper-print`, `workspace` browser suites; rendered candidate PDFs inspected | Live generation and educational calibration UNVERIFIED |
| `/ai`: academic/timetable/announcement plans | Save/review/approve/exact-preview/apply, stale state, lost response, access denial and EN/AR/UR phone forms | `academic-setup`, `timetable-setup`, `announcements` browser suites | Live email delivery UNVERIFIED; preview/send UI uses controlled transport, while queue/delivery fencing has real database tests |
| `/ai`: history | Paginated versions, compare, saved-version approval, restore, scope and AR/UR phone comparison | `history` browser suite | Complete keyboard and assistive-technology matrix UNVERIFIED |
| `/ai`: work and policies | Typed records, domain permissions, approvals and execution restrictions verified in pure/database tests; cross-panel opening exercised | `workspace` domain/database and `academic-setup` browser suites | Every policy/work editor visual/action state UNVERIFIED |
| `/ai/exams` and `/ai/exams/[id]` | Desktop student lifecycle, real saved answers, deterministic choice proposals, staff moderation/accommodation, explicit gradebook transfer; selected AR/UR phone gradebook review | `exam`, `exam-gradebook` browser suites | Student exam in all locales, tablet and supported browser/device matrix UNVERIFIED |
| `/admin?view=timetable` and shared timetable editors | Exact year/term selection, teacher/room scope, sparse periods, reviewed lesson clearing, cancel/failure/retry, AR/UR phone dialogs | `timetable-scope` and `timetable-setup` browser suites; owner HTTP scope suite | Every role's full editor matrix UNVERIFIED; owner HTTP checks do not certify owner visual layout |
| `/principal` and existing communications history | Actual server-action/API responses hide announcement rows, contents and counts after permission revocation | Two real read-path cases in `announcements` browser suite | Complete dashboard/history visual states UNVERIFIED; this batch changes their access filtering |
| Existing global header/sidebar and student import dialog | New navigation, selected responsive/RTL shell checks, shared control contract; existing admission review tokens preserved | Shared adoption checks and the above route flows | Every other application route using these components was not visually rechecked in this batch |

Evidence screenshots and synthetic PDFs remain ignored and reproducible; no customer records or live sends were used. PASS applies to the named cases, not to an entire route or to the full school-autopilot PRD.

## Next implementation sequence

1. Finish provider evaluation using representative EN/AR/UR scans, mathematics, diagrams and handwriting; implement bounded asynchronous processing and retention.
2. Extend the implemented roster mapping and academic setup to historical migrations, staff/guardian relationship reconciliation, opening balances and measured cutover acceptance.
3. Extend the reviewed timetable draft tool to automatic constraint solving and datesheet/seating; extend reviewed email to additional authorized channels, with concrete previews, permissions, approval versions and failure recovery for each operation.
4. Extend the approved-question bank with educational calibration; add advanced answer editors, accommodations beyond extra time, teacher-marking calibration, regrading and appeals. The reviewed gradebook bridge already hands off to existing report publication controls.
5. Connect finance workflows only after ledger/reconciliation/approval invariants are exercised with real domain tests.
6. Keep native lockdown and managed-device deployment outside the user-selected standard-browser scope. Any future recording/proctor console remains a separate, explicitly configured product; ordinary browser fullscreen never becomes a lockdown claim.
7. Add scoped autonomy policies, scheduler pause/cancellation, delegated missing-information tasks, metrics and school pilots. Keep consequential actions reviewed until their individual release gates pass.
