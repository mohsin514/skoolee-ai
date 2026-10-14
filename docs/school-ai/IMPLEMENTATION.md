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

BUILT means the described code path exists with local verification. External gates are tracked separately: configured providers, representative school materials, supported devices, operational monitoring and a school pilot cannot be certified by synthetic tests. The final integration checks are recorded below; this ledger must not be used as a blanket production acceptance certificate.

| ID | Requirement | Status |
| --- | --- | --- |
| SET-01 | New school, existing records and migration paths; first-priority selection | BUILT — three adaptive setup paths and first-outcome selection |
| SET-02 | Progressive school/campus/year/people/resource/finance/policy questions, saved drafts | BUILT — resumable confirmed facts; reviewed year/classes, rooms/periods, staff invitations, guardian relationships, transfer/withdrawal and finance opening balances; subjects, exact teacher allocations, reviewed holidays and weekly closures |
| SET-03 | Skip, unknown, proposed defaults, assigned missing-information tasks and readiness | BUILT for setup questions — skip/defaults/readiness plus scoped delegation, staff answers, manager comparison, versioned audit and acceptance into a new unconfirmed setup draft; external reminders are not sent |
| SET-04 | Import mapping, duplicate reconciliation, relationships, opening balances, cutover acceptance | BUILT — mapped and corrected roster imports, identity reconciliation, reviewed opening balances, explicit carry-forward reconciliation and cutover manifests checked against six people/resource datasets and every existing financial currency/year |
| UX-01 | Shared controls, consistent previews/editing/review/progress/empty/error states | BUILT for the new workspace — shared controls, modal, draft guards, skeletons and recovery |
| UX-02 | English, Arabic, Urdu, RTL, localized labels and accessible controls | BUILT for interface copy — EN/AR/UR and RTL; educational language calibration open |
| UX-03 | Immersive guided prompts, responsive layout, purposeful motion and reduced-motion alternative | BUILT — fullscreen guide, keyboard guard, reduced motion and mobile overflow verification |
| UX-04 | Context-aware text/audio/file/camera composer throughout relevant workflows | BUILT for School AI workflows — shared text/audio/file/camera composer on relevant domain tabs, approved evidence focus and private conversation recovery; existing legacy CRUD editors retain their own shared forms |
| UX-05 | Live voice, interrupt/resume, explicit understanding and ambiguous-entity confirmation | BUILT — consented turn-based voice conversation, silence detection, editable understanding, speech playback, interrupt/pause/resume and bounded session cleanup; focused named-entity selection, masked current facts and versioned private retry recovery |
| MEM-01 | Separate versioned facts, policies, preferences and workflow context | BUILT — versioned facts/preferences/policies, private conversations and durable reviewed runs; conversation text never becomes approved school memory |
| MEM-02 | Source/owner/effective-date/scope/confirmation/conflict/supersession history | BUILT — actor/source/quoted evidence, effective windows, current and historical access, conflict rejection, explicit supersession lineage, immutable comparison and restore as a new draft |
| DOC-01 | Private scoped file intake, original preservation, validation and duplicate identity | BUILT — bounded validated intake, private originals, deduplication and scoped download; S3 live test open |
| DOC-02 | Multi-page capture, crop/rotation/reorder, quality checks and phone QR handoff | BUILT — ten-page capture, crop/rotate/reorder/restore, local clarity heuristics, manual perspective correction and expiring same-user phone QR handoff; real-device acceptance remains a deployment gate |
| DOC-03 | Text/layout/table/math/figure extraction with page and region provenance | BUILT — structured page/region text, tables, math, figures and handwriting with bounds/confidence/uncertainty; native text plus configured document provider; representative extraction quality remains unverified |
| DOC-04 | Source/extraction review, uncertainty, missing-page handling and corrections | BUILT — missing-page checks, reviewed source regions/image overlays and corrected canonical text; provider output starts unreviewed; queued extraction needs explicit application to the current draft |
| CUR-01 | Approved curriculum, school plan, section coverage and assessment scope separated | BUILT — approved curriculum, school plan, taught/included outcomes and separate section coverage; sources and learning activities remain pinned to reviewed evidence |
| CUR-02 | Outcomes, editions, sources, exclusions and teacher confirmation | BUILT — editions, outcomes, exact source excerpts/pages, exclusions, section scope and teacher confirmation |
| ASM-01 | Blueprint, question bank, provenance, solutions, rubric and fixed paper versions | BUILT — blueprints, immutable paper versions, answer keys/rubrics and provenance-preserving approved bank; observed item/distractor summaries use moderated attempts; educational calibration remains a release gate |
| ASM-02 | AI generation, selective regeneration, pinned items and independent validators | BUILT — configured generation/regeneration with pinned items, deterministic validators and separate key-blind semantic review; live model quality remains unverified |
| ASM-03 | Marks/optional-group totals, scope, duplicates, answerability and diagram checks | BUILT — totals/options/scope/duplicates/evidence/rubric validation and independent answerability proposals; exact approved image regions are cropped on the server and frozen into key-free print/online snapshots; PDF figures require a reviewed image capture, and semantic review does not certify an unseen diagram |
| ASM-04 | Print and online paper parity; restricted answer key | BUILT for browser printing — authenticated print rechecks the exact current approved version, shares the key-free candidate projection, escapes all author text and isolates document security policy; long A4 EN/AR/UR exports visually verified, system/printer font matrix remains a deployment check |
| OPS-01 | Datesheet, room capacity, seating, invigilators and accommodations connected | BUILT — reviewed datesheet/room/seating/invigilation, front-row/edge/separate-room needs and neighbor/diagonal spacing; shared booking fences protect existing resource writers |
| EXM-01 | Standard browser question types and approved resources | BUILT — single/multiple choice, localized numeric, short/extended text and math/code response editors, with fixed approved resources; code is stored as an answer and never executed |
| EXM-02 | Server timing, sequenced autosave, reconnect, submission receipt and version isolation | BUILT for standard browser — snapshot, deadline, autosave, replay, receipt and bounded database-clock deadline sweeps in the existing worker; corruption is reported without grading or losing saved responses |
| EXM-03 | Practice/device checks, extra time, recovery and accessible alternatives | BUILT — device/connectivity/storage practice, sequenced recovery, fixed extra time, supervised breaks, reader/scribe/large-text accommodations; supported-device/assistive-technology acceptance remains open |
| EXM-04 | Supported secure exam client integration and server configuration verification | OUT OF SCOPE — user selected standard browser exams; secure-browser mode explicitly rejected |
| EXM-05 | Managed-device deployment policies and tested device matrix | OUT OF SCOPE — user selected standard browser exams; no managed-device deployment claimed |
| EXM-06 | Explicit camera/screen permissions, recording service, proctor console and retention | BUILT — optional separately consented camera/screen clips, current-scope private review, human notes, stop/delete and 1–7-day retention; declining never blocks the standard exam or changes marks |
| MRK-01 | Script/student/paper/page matching, QR scripts and response extraction | BUILT — signed QR/script matching, camera/image QR reader where supported, page/identity confirmation and key-free evidence-quoted response proposals from approved transcripts; staff explicitly apply and import |
| MRK-02 | Deterministic objective scoring; evidence-linked written mark proposals | BUILT — deterministic objective proposals and rubric-linked written proposals with exact student quotes, bounded marks, idempotent credit receipt and mandatory staff review |
| MRK-03 | Moderation, approval, key changes, regrading, appeals and result versions | BUILT — moderation, immutable result versions, reviewed key corrections/regrading, scoped appeals and exact gradebook transfer; publishing remains explicitly controlled |
| SCH-01 | Admissions, enrolment, transfer, withdrawal and guardian relationship workflows | BUILT — reviewed admissions/enrollment, guardian rights, current-date transfers/withdrawals with preserved history, capacity/identity checks and cutover reconciliation |
| SCH-02 | Year rollover, promotion, calendars, teacher allocation and timetabling | BUILT — draft year/classes, activation/pause/resume/closure, reviewed promotion, bounded 24-class/400-lesson solver and explicit timetable publication; subjects, exact teacher allocations, reviewed holidays and weekly closures |
| SCH-03 | Recorded attendance, leave and substitute coverage workflows | BUILT — dated observed attendance registers and substitute duties with leave/current booking checks, immutable past lesson evidence and reviewed exact changes; attendance is never invented |
| SCH-04 | Curriculum-based lessons, quizzes, remediation and contextual performance insights | BUILT — source-grounded lesson/remediation plans, curriculum quizzes and contextual outcome/item evidence from moderated assessments; separate reviewed legacy gradebook evidence preserves exam/mark/report provenance and avoids double counting AI imports; no inferred teacher ranking |
| SCH-05 | Fees, credits, refunds, reconciliation, expense and revenue scenarios | BUILT — exact invoices, signed carry-forward reconciliation, payments, credits/refunds, opening balances, expenses, bank matching and non-posting revenue scenarios; currency/enrollment/ledger invariants are rechecked |
| SCH-06 | Authorized audience/language/channel announcements and delivery tracking | BUILT — reviewed EN/AR/UR email/SMS/WhatsApp, verified consent/contact/channel preferences, parent opt-out, exact audience/variants, durable queue and fresh delivery fences; live provider acceptance/delivery still requires deployment verification |
| SCH-07 | Evidence-based operational risks, accountable owners and human decisions | BUILT — descriptive evidence-based operational findings, accountable owner/due date and reviewed decisions; no automatic misconduct judgment or punitive action |
| SCH-08 | Year closure, archive, retention; explicit payroll/transport/library/inventory scope | BUILT for stated scope — reviewed year closure, archived evidence and private-original/recording retention; payroll, transport, library, inventory and dormitory continue in existing reviewed workspaces with no unattended writes |
| RUN-01 | Persistent versioned runs, idempotency, cancellation, partial failure and audit | BUILT — persistent versioned scheduled runs, bounded steps, exact preview hashes, atomic step receipts, pause/cancel, visible partial completion and blocked-state recovery; separate durable document jobs support cancel/retry/apply |
| RUN-02 | Approval tied to reviewed version; concurrent edit protection; pinned decisions | BUILT for implemented operations — version-bound approvals, CAS and fixed question preservation |
| RUN-03 | Action-level autonomy policies, expiry, budgets, pause and escalation | BUILT — action allowlists, scope/expiry/run/action budgets and versioned policy binding; already reviewed exact steps may run later, while changed evidence requires renewed review |
| SEC-01 | Tenant/campus/role/subject checks on reads, writes and execution | BUILT for new surfaces — tenant/campus/role/subject, fresh permission grants, current student assignments, guarded campus selection and discarded late old-scope replies |
| SEC-02 | Provider allowlisting, backend secrets, hostile-document isolation and bounded input | BUILT baseline — strict input, approved provider destination, backend secrets and generic provider errors |
| SEC-03 | Answer-key separation, source access, recordings, retention and deletion | BUILT — key-free candidates, private originals/cropped exam assets, explicit original-retention jobs and recording expiry/deletion; actual production storage policy/backup acceptance remains a release gate |
| QA-01 | Representative EN/AR/UR document and assessment calibration | TOOLING BUILT; EXTERNAL GATE OPEN — recorded-result EN/AR/UR corpus scoring, source hashes, human expectations/attestations and minimum coverage; synthetic examples intentionally fail the live educational release gate |
| QA-02 | Browser/mobile/keyboard/RTL/reduced-motion verification | PARTIAL — Chromium desktop/mobile/RTL/reduced-motion and draft/microphone recovery; device matrix open |
| QA-03 | Tenant isolation, stale approvals, retries, exam reliability and load tests | BUILT local acceptance — tenant/campus/grant revocation, stale reviews, concurrency/replays/deadlines plus 32-candidate HTTP exam load; sustained production-scale load remains a deployment gate |
| QA-04 | Measured setup time, correction effort, teacher review burden and recovery success | INSTRUMENTATION BUILT; PILOT OPEN — real bounded setup/source/paper approval elapsed time, saved-edit counts and document recovery observations; these are not measured active work time or demonstrated school time savings |

## Completion work delivered on 13 October 2026

The shared workspace now has 17 permission-filtered tabs, with learning/assessment tools under curriculum, optional recording in the exam player/review desk, and review observations on Overview. Operational drafts use the existing save → approve current version → exact preview → apply/receipt flow. Scheduled runs hold these same exact reviewed operations, not arbitrary model instructions.

The central registry covers `curriculum.import_topics`, `academics.setup_year`, `timetable.create_draft`, `timetable.create_school_drafts`, `timetable.publish_reviewed`, `communications.queue_announcement`, `exams.create_session_plan`, `fees.generate_invoices`, `finance.apply_operation`, `setup.apply_changes`, `academics.transition_year`, `students.promote_enrollment`, `attendance.record_register`, `timetable.assign_substitutes` and `operations.record_risk_decision`. Roster/script imports, result publication and gradebook transfers retain their specialized review contracts.

Shared manual writers now participate in the same booking, enrollment, financial and communication invariants, including ordinary invitations, calendar/resource changes, legacy fee reminders and inbound WhatsApp relationship checks. Existing records are preserved; proposals cannot silently overwrite financial or academic history.

Final review also closed historical access gaps: retained source originals, extraction jobs and figure crops keep their original classification and teaching-scope permissions after reclassification; OCR cannot be applied into a broader scope. Saved runs recheck their original approved step permissions, and billing-suspended runs become blocked so later schools can progress.

## Database recovery

The reported remote `P3009` is repaired. Read-only catalog comparison found an earlier partial schema adoption: columns/tables existed but continuation CHECK constraints did not. The missing validated constraints were added transactionally, then the continuation and language migrations were marked applied. No school records were deleted or rewritten. The migration files already in history remain unchanged. See [the precise recovery procedure](../recovery/RUNBOOK.md#school-ai-continuation-collision-13-october-2026).

Fresh installation of all 45 migrations through `20261013141000_school_ai_assistant_catalog` passed on an empty local PostgreSQL database, with no Prisma schema drift. Additional pre-existing completion/document tables were inspected and their missing constraints, policies and immutable trigger repaired before those migrations were reconciled. After that recovery, the seven remaining additive migrations were deployed successfully to the reported database. All 45 current migration files are applied; the archived baseline ledger entry is preserved.

## External deployment prerequisites

- Evaluated text/document/audio models and server-only credentials; document/audio egress is explicitly disabled by default. Missing configuration leaves manual review available.
- Private durable storage, configured worker/Redis and monitored deletion/expiry processing. Original source material never goes under `public/`.
- Verified email/SMS/WhatsApp provider setup, approved WhatsApp templates and real receipt integration. Tests never send real school messages or financial transactions.
- Representative EN/AR/UR educational calibration, printer/device/assistive-technology acceptance and a measured school pilot. The calibration command does not manufacture passing live results from synthetic examples.
- Standard browser exams cannot prevent switching tabs/apps or taking screenshots. Optional recording is limited evidence with explicit consent, not device lockdown or proof of misconduct.

## Verification

All fixtures and browser work use isolated PostgreSQL at `127.0.0.1:55438`, a test-only signing secret and port 3106. Remote access was limited to the reported migration recovery; no remote fixture, student exam, provider send or financial posting was created.

Final verification on 13 October 2026:

| Check | Result |
| --- | --- |
| Pure School AI tests | 173 passed |
| Complete database suite | 329 passed |
| Browser coverage | All 192 scenarios verified: combined run passed 190; an outdated exam notice assertion stopped the student flow and its dependent marking case. After correcting the assertion, the full affected exam file passed 7/7. |
| Shared design-system contracts | 3 passed |
| Locale contracts | 8 passed |
| TypeScript | Passed, including final production build type checking |
| Changed/new-file ESLint | Zero errors; one existing React PDF Image alt-text warning |
| Production build | Full npm build passed; final frozen-source Next.js build also passed |
| Fresh migrations and Prisma schema | All 45 replayed locally with no schema drift |
| Reported database | Recovery completed; repeat migrate deploy has no pending migrations; schema comparison has no difference |
| Whitespace checks | git diff --check passed |

No failing application regression remains from this local pass. The browser suite uses synthetic Chromium desktop/mobile contexts; the separate device and provider gates below remain open.

The exam load harness used 32 synthetic candidates with real HTTP sign-in and candidate cookies, at most eight concurrent requests, paced autosaves, stale-sequence conflicts and final receipt verification. All 32 passed: 366 requests in 33.279 seconds, p50 113.12 ms, p95 632.96 ms and p99 2177.28 ms. Eleven HTTP 409 responses comprised eight intentional stale saves and three start conflicts resolved by readiness refresh/retry; no 429 occurred. It checked final answers, ownership, fixed deadlines, repeat receipts and key isolation. This local development-server sample is not production capacity certification.

## Implementation map

- `src/app/ai`: authorized authoring workspace and student/staff exam routes.
- `src/components/school-ai`: feature composition using shared `src/components/ui` controls; full-screen setup uses the shared `ModalSurface` rather than a second dialog implementation.
- `src/lib/school-ai`: strict schemas, scope, versioned repository, intake/provider adapters, assessment/exam rules and typed execution.
- `src/app/api/school-ai`: authenticated, bounded API entry points. Model output cannot invoke arbitrary routes or SQL.
- `prisma/migrations/20261012090000_school_ai_workspace` and later School AI migrations: additive tables and constraints. Existing academic and financial records are preserved.
- `tests/school-ai`: reusable synthetic fixtures, pure/domain/database/browser verification. Tokens, screenshots and browser output remain under ignored `test-results/`.

## Route and interaction coverage

The complete page-path inventory is reconciled in [the shared route checklist](../ui-plan/route-checklist.md): 88 pages and all discovered route boundaries. Existing route statuses are not promoted by reuse of a shared component. New School AI routes remain IN PROGRESS for the complete device/role/state matrix even where individual cases pass.

| Surface | Verified scope | Evidence | Remaining UI acceptance |
| --- | --- | --- | --- |
| `/ai`: overview and fullscreen setup | Synthetic manager/owner/teacher scope; 1440×1000 desktop and selected 360×800 EN/AR/UR flows; resumable answers, missing facts, durable private chat, bounded approved evidence context, setup-task delegation, denied microphone, dirty navigation, reduced motion | `workspace`, `ux`, `assistant-scope` browser suites | Tablet, screen-reader/zoom matrix and physical microphone/device-voice matrix UNVERIFIED |
| `/ai`: sources and roster | Private source save/review, multipage crop/rotation/order, failed/slow scan recovery, mapped CSV correction, duplicate/stale imports; desktop and selected RTL phone cases | `scan`, `roster-import`, `workspace` browser suites | Representative OCR/math/handwriting quality and physical phone/QR device matrix UNVERIFIED |
| `/ai`: curriculum, papers and question bank | Reviewed evidence, pinned reuse, exact-version printing, key isolation and EN/AR/UR long-paper PDF pagination; selected phone layouts | `question-bank`, `paper-print`, `workspace` browser suites; rendered candidate PDFs inspected | Live generation and educational calibration UNVERIFIED |
| `/ai`: academic/timetable/announcement plans | Save/review/approve/exact-preview/apply, stale state, lost response, access denial and EN/AR/UR phone forms | `academic-setup`, `timetable-setup`, `announcements` browser suites | Live email/SMS/WhatsApp delivery UNVERIFIED; preview/send UI uses controlled transport, with real database consent/contact/revocation fences |
| `/ai`: exam planning and fee invoices | Exact reviewed draft session/seating/duties and pending invoice creation; lost-response replay, stale roster, enrollment dates, existing manual writers and EN/AR/UR phone layouts | `exam-session-plan`, `fee-invoices`, `scheduling-resources` browser suites and matching database suites | Bounded school solver, physical accommodation seating and finance workflows have local tests; full device/role matrix UNVERIFIED |
| `/ai`: school setup, operations, finance and runs | Reviewed resource/people/transfer/cutover flows, observation-based attendance, year lifecycle/promotion, bounded joint solver/publication, risk decisions, financial postings/reconciliation and run pause/cancel | `school-setup`, `school-operations`, `finance-operations`, `runs-documents-voice` suites | Populated school pilot and sustained production load UNVERIFIED |
| `/ai`: knowledge, processing and observations | Effective facts, supersession, scoped historical source evidence, extraction queue/retry/cancel and bounded review/recovery observations | Knowledge/document/insights pure and DB cases; `runs-documents-voice` browser cases | Live OCR/storage/worker monitoring and measured pilot outcomes UNVERIFIED |
| `/school-capture` and optional exam recording | Same-user expiring handoff, signed-out recovery, opt-in real browser media capture, private playable clips, consent/error/stop/delete and AR/UR phone layouts | `runs-documents-voice`, `exam-proctor` browser suites and private-storage DB cases | Physical camera/screen/browser matrix and deployed retention worker UNVERIFIED |
| `/ai`: history | Paginated versions, compare, saved-version approval, restore, scope and AR/UR phone comparison | `history` browser suite | Complete keyboard and assistive-technology matrix UNVERIFIED |
| `/ai`: work and policies | Typed records, domain permissions, approvals and execution restrictions verified in pure/database tests; cross-panel opening exercised | `workspace` domain/database and `academic-setup` browser suites | Every policy/work editor visual/action state UNVERIFIED |
| `/ai/exams` and `/ai/exams/[id]` | Desktop student lifecycle, real saved answers, deterministic choice proposals, staff moderation/accommodation, explicit gradebook transfer; selected AR/UR phone gradebook review | `exam`, `exam-gradebook` browser suites | Student exam in all locales, tablet and supported browser/device matrix UNVERIFIED |
| `/admin?view=timetable` and shared timetable editors | Exact year/term selection, teacher/room scope, sparse periods, reviewed lesson clearing, cancel/failure/retry, AR/UR phone dialogs | `timetable-scope` and `timetable-setup` browser suites; owner HTTP scope suite | Every role's full editor matrix UNVERIFIED; owner HTTP checks do not certify owner visual layout |
| `/principal` and existing communications history | Actual server-action/API responses hide announcement rows, contents and counts after permission revocation | Two real read-path cases in `announcements` browser suite | Complete dashboard/history visual states UNVERIFIED; this batch changes their access filtering |
| Existing global header/sidebar and student import dialog | New navigation, selected responsive/RTL shell checks, shared control contract; existing admission review tokens preserved | Shared adoption checks and the above route flows | Every other application route using these components was not visually rechecked in this batch |

Evidence screenshots and synthetic PDFs remain ignored and reproducible; no customer records or live sends were used. PASS applies to the named cases, not to an entire route or to the full school-autopilot PRD.

## Deployment acceptance still requiring external evidence

1. Run the calibration harness with representative, properly authorized EN/AR/UR school material and independently reviewed expectations. Evaluate OCR, handwriting/math/figures, generation and marking separately.
2. Verify private storage permissions, recording expiry/deletion, backup/restore, configured worker dispatch and incident monitoring in the intended environment.
3. Verify each enabled communication provider and receipt path with authorized test recipients, including opt-out and access changes immediately before send.
4. Test the supported camera/microphone/screen, QR decoder, browser, printer and accessibility-device matrix. Refusal and unsupported devices must retain the documented manual/standard-exam path.
5. Run a populated staging upgrade and sustained realistic exam load, then measure actual setup/review/correction effort in a school pilot. Keep the review observations' sampling and elapsed-time limitations visible.
