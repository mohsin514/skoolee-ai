# Exam Studio flagship plan — 22 October 2026

Owner ticket: [SKO-408](https://linear.app/skoolee-ai-app/issue/SKO-408). Target: LEAP 2027, Riyadh, 12–15 April 2027 (recheck the official site). Funding target: at least USD 1M (say "target", never a commitment).

This document is the planning hand-off. It was produced by one planning session (Claude Fable 5.1) from a full read of the code, the Linear ticket, the `.kiro` spec, the product-review documents, seven subsystem audit readers and six design proposers. Implementation happens in a later session on a cheaper model, working slice by slice from §11 and §13.

How to read it:

- Founder: read §1 (how exams work), §3 (what to do right now and what goes where), §5 (the product idea), §9 (patent), §10 (demo). Skim the rest.
- Implementation session: read everything, then start at §11 Slice 1 and §12. The appendices hold the raw audit findings (file:line evidence) and the raw proposals.

Honesty notes. The audit findings were produced by code-reading agents; the adversarial verification pass was cut short by a rate limit, so every finding marked **(audit)** must be re-checked at its file:line before it is fixed, and every one marked **(verified)** was confirmed by the planning session's own reading. Three audit readers (authoring, roles, spec drift) were re-run at the end of the session; their output is appended in Appendix D when present.

---

## 1. How exams work in a school, in plain words

The founder asked who creates exams. In a Pakistani, Gulf or international school the answer is the same shape everywhere, with local names:

| Role (Skoolee role) | What they do in the exam cycle | What they never do |
|---|---|---|
| **Exam office / controller of examinations / academic coordinator** (PRINCIPAL, or CAMPUS_ADMIN as "academic lead" when the campus has no principal) | Decides the exam policy (pattern per grade band: total marks, duration, sections, syllabus split for mid-term vs final, Ramadan timings). Announces the term exam (mid-term, final). Builds and publishes the **date sheet** (which subject, which day, which period, which room). Seats candidates. Rosters invigilators. Prints and seals papers. Compiles results. Publishes report cards. Handles absentees, re-sits and appeals. | Does not write the question papers. Does not mark scripts. |
| **Subject teacher** (TEACHER) | Teaches the syllabus and knows how far the class has reached. **Writes (sets) the question paper** for their class and subject when the office asks, by the office's deadline. Invigilates other rooms per roster. **Marks** their own subject's scripts. Enters marks. Plans re-teaching. Creates and runs their own **quizzes and class tests** end to end. | Does not schedule term exams. Does not publish results. |
| **Head of department / senior teacher / moderator** (today: a TEACHER or the PRINCIPAL; Skoolee has a MODERATOR studio role but no HOD seat) | **Moderates** (pre-reads) each paper: syllabus coverage, difficulty, marks add up, language versions agree, not a repeat of last year. After marking, second-marks a sample. | Does not seal or publish. |
| **Principal** (PRINCIPAL) | **Approves** (signs off) the paper version. Releases results. Decides appeals. | Does not write papers. |
| **Invigilator** (any TEACHER on the duty roster) | Supervises the room, marks absentees, hands out and collects scripts, grants a few minutes of extra time when the power goes, reads out clarifications. | Never sees the answer key or marks. |
| **Student / parent** | Sits the paper. Sees the date sheet, the seat, the result, the feedback. | Never sees the key or other candidates. |

Two kinds of assessment, two owners:

- **Term exams** (mid-term, final): owned by the office. The office schedules, the teacher writes, the HOD moderates, the principal approves, the office prints or the system delivers online, the invigilator runs the room, the teacher marks, the office compiles and publishes.
- **Classroom assessments** (quiz, class test): owned by the teacher alone. The teacher writes, delivers, marks and records. The office does not schedule them. A school policy decides whether a teacher may seal and deliver a classroom paper without the principal.

Paper is the default sitting mode in Pakistan and the Gulf; online sittings (standard browser, locked Safe Exam Browser, camera-supervised) are the exception and growing. The product must treat paper and screen as equals.

The code already enforces the first half of this split: `src/lib/academic/exam-permissions.ts` lets the office create MID_TERM/FINAL and teachers create QUIZ/CLASS_TEST. What is missing is the second half: the request from the office to the teacher for the paper, the moderation gate, the print run, and the link back from the paper to the date-sheet row.

---

## 2. What Skoolee has today

Three systems and one side door, all real and mostly solid, but not connected.

**A. Office exam cycle** (SKO-413, `src/components/academic/exams/*`, `src/lib/academic/exam*.ts`). Admin or principal → Academics → "Exams & results" (`?view=exam-cycles`). Five steps: Schedule → Date sheet → Seating → Marks → Results. Records: `ExamSession` (the announcement) → `Exam` (per class) → `ExamSchedule` (one date-sheet row per subject) → `ExamRoom`/`ExamSeat`/`ExamInvigilation` → `Mark` → `ReportCard`. Versioned date-sheet publication with family notifications. Marks are typed by hand. The founder's "exam schedule" page is the Date sheet step.

**B. Exam Studio** (SKO-408, `src/components/school-ai/**`, `src/lib/school-ai/**`). `/ai/studio` for principal, teacher and academic-lead admin. Records are `SchoolAiRecord` rows: SOURCE (uploaded syllabus) → CURRICULUM (outcomes with page citations, taught flags, section coverage) → PAPER (blueprint, AI-generated items with evidence, per-item review states, forms A/B/C, EN/AR/UR versions) → BRIEF (conversational brief) → DELIVERY_POLICY → rehearsal → sealed release (key-free content hash) → `SchoolAiExamAssignment` (online sitting) → `SchoolAiExamAttempt` (autosave, server clock, pauses, clarifications, integrity observations) → marking (AI proposals, rubric evidence) → moderation and corrections → explicit results release → gradebook publication into system A's `Mark` rows → practice, formative checks, learner feedback, evidence packs, repair map. The home shows a seven-space rail (Brief, Blueprint, Review desk, Rehearsal, Exam Room, Control room, Improve) plus an older full editor ("Create & review"), an "Evidence" tab for uploads, and a "Schedule" tab that drafts office sessions by AI.

**C. Secure exam delivery** (SKO-449, `/exam-delivery`, `src/lib/school-ai/secure-browser*.ts`). Safe Exam Browser profiles (config keys, tested devices, approval) managed by the academic lead; an online sitting can pin a profile; the server verifies the browser's hashes. This is the founder's "exam browser" page.

**Side door: teacher Tests & quizzes** (`/teacher/tests`, `ExamCycleManager`). The teacher's own QUIZ/CLASS_TEST with hand-typed marks. It does not know Exam Studio exists.

Strengths worth keeping and demoing: sealed key-free content hash with rehearsal id; serializable idempotent assignment creation; server-authoritative timing with sequenced saves and honest recovery; neutral integrity vocabulary with retention; versioned clarifications with acknowledgements; preview-then-authorize remedies and the fingerprinted repair map; blind second-marking samples; evidence packs verifiable with `shasum`; full EN/AR/UR copy and RTL; the sixteen-token status vocabulary; the office's dry-run date sheet with conflict checks and versioned publication.

---

## 3. What to do right now

### 3.1 Decisions only the founder can make

1. **Approval policy.** Who approves a syllabus and a paper? Recommended default: the principal (or academic lead) approves once per syllabus per year, and once per term-exam paper version; an optional HOD moderation step before the principal; teachers approve their own classroom papers when school policy allows (tiered authority, §5.3). Today a teacher cannot approve anything and the principal must approve the syllabus twice (source, then curriculum) before a teacher can generate a single question.
2. **Teacher autonomy for quizzes.** Allow a "classroom tier" in the Delivery Policy: a subject teacher may generate, rehearse, seal and deliver QUIZ/CLASS_TEST papers up to a mark ceiling without the principal. Recommended: on by default for pilots, with rehearsal mandatory.
3. **Paper first.** Confirm that printed sittings are first-class in the product and in the demo (print runs, QR scripts, scanning). Recommended: yes; it is the majority mode in the launch markets.
4. **Demo environment.** The LEAP demo needs the outbox worker, Redis, private storage and the OpenAI media egress flags configured, or syllabus OCR and script reading will not run. Decide now who provisions it (see Appendix A, syllabus intake, "worker/env" finding).
5. **Patent.** Engage a patent attorney in Q4 2026 for a provisional filing on the combined chain (§9). Keep dated commit evidence. Nothing in this document is legal advice.
6. **Pilots.** The claims register forbids school counts, time saved or learning gains without pilot evidence. Recruit 3–5 design-partner schools (PK, KSA, UAE, one international) so April has measured numbers.
7. **Term vocabulary.** One term list (Term 1/2/3/Annual) shared by timetable, exams and report cards; today the office wizard writes "Term 1" and the AI planner writes "TERM_1" (audit).

### 3.2 What goes where (placement map)

| Thing | Lives in | Reached from | Connects to |
|---|---|---|---|
| Exam policy and pattern per grade band | Office → Exams & results → step 1 Schedule (session wizard gains a "Paper pattern" pane) | Session wizard | Seeds every teacher's brief (F2) |
| Date sheet (the founder's "exam schedule") | Office → Exams & results → step 2 Date sheet (unchanged) | Sidebar | Each row spawns a Paper Slot (F2) |
| **Papers ledger (new step)** | Office → Exams & results → step 3 **Papers** (slot × status grid) | Rail | Teacher briefs, moderation, seal, print run, marks |
| Seating, invigilation, print runs | Office → steps 4 Seating | Rail | Room sheet, control room |
| Marks and results | Office → steps 5 Marks, 6 Results | Rail | Gradebook publication from Studio; corrections propagate |
| Secure exam delivery (the founder's "exam browser") | Academics → Secure exam delivery (`/exam-delivery`), academic lead only (unchanged) | Sidebar **and** the Studio Exam Room when releasing an online secure sitting (today unreachable from the Studio) | Pinned SEB profile on the assignment |
| Syllabus intake and Teaching Line | Exam Studio → space 1 "Syllabus & brief" (replaces the generic Evidence tab as the front door; Evidence stays as the library behind it) | Teacher Today card, Studio next-step card | Bounds generation; feeds the brief; feeds Improve |
| Writing the paper (brief, blueprint, generation, review) | Exam Studio spaces 1–3 | Paper Slot deep link, next-step card | Paper Slot status |
| Rehearsal, Paper DNA, Exam Twin | Exam Studio space 4 | Next-step card | Release gate |
| Seal and delivery choice (paper, online standard, online secure) | Exam Studio space 5 Exam Room → the Seal sheet | Review desk after rehearsal | Print run, assignment, SEB profile, office slot |
| Live sitting (online) and room sheet (paper) | Exam Studio space 6 Control room (one calm board) | Office step 4, teacher Today (invigilator duty) | Attempts, attendance, clarifications |
| Marking, moderation, corrections | `/ai/exams/[id]` review desk, framed inside the Studio chrome | Exam Room list, Paper Slot | Gradebook, repair map |
| Results → next lesson, family notes | Exam Studio space 7 "Next lesson" | Release, Today card | Lesson plans, practice, family inbox |
| Teacher Tests & quizzes | `/teacher/tests` (keep) | Sidebar | "Quiz with Exam Studio" shortcut; Studio results record into the teacher's own class test |
| Student calendar, receipts, results explainer, practice | Student Today and `/student/timetable` (merged "My exams"), `/ai/exams` player | Today | Date sheet + online sittings in one list |
| Parent brief, results, support requests | `/parent` inbox, `/parent/timetable`, `/parent/results` | Inbox | Date-sheet diff, release, repair notices |

### 3.3 The one-sentence answer to "what do I do right now"

Connect the three systems through one record per date-sheet row (the Paper Slot), make the syllabus the first screen of Exam Studio with a one-gesture taught boundary (the Teaching Line), give every role one front door ("Your next step"), and ship the three deterministic AI moments that need no live provider on stage (Paper DNA, Exam Twin phase 1, Live Pulse). Everything else in this plan hangs off those four.

---

## 4. Gaps and defects found

Grouped by where they bite. Severity is the audit's; **(verified)** means the planning session confirmed it in code. Fix slice in brackets. Full detail with file:line in Appendix A.

### 4.1 The three systems are not connected

- **No link from a date-sheet row to a paper or an online sitting** (verified: `ExamSchedule` has no paper or assignment reference; `SchoolAiExamAssignment` has no `examScheduleId`). The office cannot see whether a paper exists, who owes it, by when, whether it was moderated or printed. [S1]
- **AI-planned exam sessions are created with `Exam.status = DRAFT`** while the wizard creates ACTIVE; no office screen activates them, so marks can never be entered and families never see the date sheet (verified in `applyExamSessionPlan`; the DRAFT→ACTIVE path is audit). [S1]
- Results step shows a green "Published" badge for any DRAFT class exam (audit, `ExamsWorkspace.tsx:980`). [S1]
- Subject teachers are never told a term exam was scheduled or that their paper is due (audit). [S1]
- Exams & results uses the calendar year, not the active academic cycle, hiding classes for half the year (audit). [S1]
- Lock requires marks for archived/withdrawn pupils (audit). [S5]
- Two term vocabularies (audit). [S1]
- Date-sheet publication is buried inside Seating with no rail state (audit). [S7]
- AI-imported marks are indistinguishable from typed marks; one manual mark blocks the whole import; all-or-nothing publication (audit). [S5]
- Teachers cannot push Studio results into their own class test (audit). [S1]
- Office can open a teacher's quiz with a "Dates & rooms" tab quizzes never have (audit, minor). [S7]

### 4.2 The syllabus path (the founder's prerequisite)

- **Approved SOURCE records are never linked to the curriculum**; the curriculum's sources are pasted copies with random ids; no picker, no `sourceRecordId` (verified in `curriculumDataSchema`). [S1]
- **No AI step turns syllabus text into outcomes**; every outcome, page and taught flag is typed by hand, up to 200 times (verified: no such route exists). [S1]
- **A teacher cannot approve a source or curriculum** (`assertApprovalRole` is manager-only) and **generation requires an APPROVED curriculum** (verified). A teacher must wait for the principal twice before generating. [S1]
- Extraction is one provider call capped at 10,000 output tokens; long syllabi fail and retries repeat the failure (audit). [S1]
- Upload/OCR depend on the worker, Redis and three env flags, unset in this checkout; the UI still offers the buttons (audit; decision 4 above). [S1]
- A principal or office cannot upload a syllabus that teachers can see; sharing is bound to `Subject.teacherId`, so section teachers and substitutes cannot reuse it (audit). [S1]
- "Taught so far" is frozen inside the approved, read-only curriculum; every coverage change clones the record and needs a fresh approval (audit; the UI/server disagree). [S1]
- No one-syllabus-per-subject-per-year model; duplicates pile up; the paper silently takes the first approved curriculum (audit). [S1]
- Structure review is a per-region checkbox marathon; "Send for review" notifies nobody; the principal has no approval queue (audit). [S1, S3]
- Urdu/Arabic documents get the UI language as source language and no `dir="auto"` in review (audit, minor). [S1]
- No URL intake for board syllabi; no reverse import from the office syllabus tracker (audit, minor). [S8]

### 4.3 The front door

- **Four competing front doors** on a teacher's first screen: hero CTA to the legacy editor, hero CTA to `/ai/exams`, five tabs, an eight-button rail, four journey cards, a "sample workflow" prototype panel (verified by reading the shell and workspace). [S1]
- **A principal can never start a brief** because only teachers get a subject selector (audit, `brief-space.tsx:89`). [S1]
- **The Brief's nine decisions never reach generation**; teachers re-enter duration, marks, languages and coverage in the legacy editor (audit; the generate request indeed posts only curriculum, blueprint, language, coverage section). [S1]
- The spec's scope banner and its persistence helpers are dead code (verified: nothing imports them). [S1]
- The "Try a sample workflow" prototype panel is the second block on the flagship home (verified). [S1]
- `/ai` offers "Open Exam Studio" to managers the page then bounces (audit). [S1]
- Hash and `?workflow` state drift between the rail and the tabs (audit, minor). [S1]
- Sidebar mis-highlights on `/ai/exams`; no way back to the Studio (audit, minor). [S2]

### 4.4 Review, rehearsal, seal, print, secure delivery

- **SEB admission can never succeed with the configuration the product tells students to download** (audit, `secure-browser-service.ts:106`): the `.seb` is generated per exam with the exam URL inside it, so its Config Key never matches the profile's recorded keys. Profiles must own the configuration. [S2]
- Expiry worker ignores SECURE_BROWSER attempts (`AND e.mode = 'STANDARD'`; verified via the spec note and `exam-expiry.ts`). [S2]
- The sealed paper cannot be printed once the record is edited again, and never from the assignment (audit). [S2]
- **No paper-based release**: no print run, no per-candidate copies with QR, no markers' key sheet, no envelope manifest (verified: modes are STANDARD, SECURE_BROWSER, PROCTORED only). [S4]
- Rehearsal is four shallow checks plus a free-text form; no synthetic attempt, figure, print or keyboard checks (audit). [S2]
- A paper nobody item-reviewed is released as "Ready" (legacy path hashes with `rehearsalId: null`) (audit). [S2]
- **The seven-space studio cannot make a PAPER approved**; the Exam Room's empty state leads nowhere; approval bumps the version and invalidates the rehearsal (audit). [S2]
- The Exam Room hardcodes `mode: "STANDARD"`; SEB is unreachable from the Studio (audit). [S2]
- Seal verification is by eye; `verifyContentHash` has no caller (audit). [S2]
- Exam window uses the browser time zone with no label (audit, minor). [S2]
- `ExamReleasePanel` is rendered in three places; Review desk and Rehearsal are the same surface (audit, minor). [S2]

### 4.5 The live sitting

- **The invigilator on duty cannot open the control room** unless they authored the paper or are a manager (audit, `exam-service.ts:67`). [S3]
- The control room never refreshes and has no refresh control; a network failure freezes it (audit). [S3]
- The board shows no absentees, roll numbers, remaining time, progress or SEB status (audit). [S3]
- Client auto-submits at its stale deadline, discarding a live extra-time grant (audit). [S3]
- Expiry worker auto-submits paused attempts (audit). [S3]
- Extra time is manager-only and one request at a time (audit). [S3]
- Post-release remedies silently fail per candidate and are then marked APPLIED; a key correction fixes only already-marked scripts (audit). [S5]
- Integrity policies can only be switched on from the marking desk and only before the first attempt (audit, minor). [S2]

### 4.6 Marking, results, improvement

- **Marking cannot be fast**: one student at a time, mandatory feedback text per answered question including MCQs, no auto-finalise for objective papers, no by-question view (audit; the schema requirement is verified). [S5]
- Paper script import rejects every choice answer unless the option text appears verbatim in the OCR transcript (audit). [S4]
- After results are released every desk path to change a result fails; an upheld appeal has no correction route (audit). [S5]
- Office gradebook marks drift from released results; the publication cannot be re-sent (audit). [S5]
- Blind second marking is not blind (audit). [S5]
- Teachers see the evidence-pack panel but every call is refused (`subjectId` never passed to the authority check) (audit). [S5]
- Evidence pack omits moderation, corrections, repairs, gradebook receipt (audit). [S5]
- No class-level outcome heatmap or misconception view; distractor counts are computed but never rendered (audit). [S5]
- A learner's released result shows question numbers and marks only: no question text, no own answer (audit). [S5]
- Practice sets need a principal to approve, contrary to the spec's teacher approval (audit). [S5]
- Only the creating teacher can mark an exam (audit). [S3]
- Family correction notices link parents to a page that 404s for parents (audit). [S6]

### 4.7 Student and family

- No single place shows the date sheet and online exams together (audit). [S6]
- "My online exams" shows no state per exam and staff-facing copy (audit). [S6]
- Parents cannot see online exams or released results although the release copy promises "families" (audit). [S6]
- Released results are reachable only by reopening the exam page (audit). [S6]
- A secure-browser attempt reopened outside SEB shows a generic error (audit). [S2]
- Reader, large text and submission-mode accommodations are cosmetic in the player (audit). [S6]

---

## 5. The product: one chain, one vocabulary

### 5.1 The idea in one paragraph

Every exam in a school becomes one connected chain the whole school can read in the same sixteen words: **taught** (the Teaching Line on the syllabus map) → **written** (generation bounded by what was taught) → **moderated** (HOD decision bound to the exact content hash) → **sealed** (the Seal, one hash on the printed paper, the screen, the receipt and the office date sheet) → **sat** (paper or screen, one attempt per candidate) → **marked** (by exceptions, with evidence) → **corrected** (one approved correction propagates to every mark, report card and family) → **taught again** (the next ten minutes, the practice set, one line to each family). AI proposes and explains at every step; it never publishes, concludes misconduct, changes marks, extends time or messages a family. The office runs the cycle from its own date sheet; the teacher lives in one loop; the principal approves from one queue.

Working name for the mechanism: **the Exam Chain**. Two visible gestures carry it on stage: the **Teaching Line** (drag it along the syllabus) and the **Seal** (one calm sheet, one reason, one hash that follows the paper everywhere).

### 5.2 Why this is distinctive

Competitors generate questions (MagicSchool, Eduaide, AssessPrep AI), deliver and monitor online sittings (Inspera, ExamSoft), scan and grade scripts (Gradescope), or run planners and gradebooks (Toddle, ManageBac, Classera). None of them answers four questions at once, from one record: Was every question taught before the sitting? Is the paper the students sat the paper the principal approved? Can a mark be re-derived from the script, key and rubric? When a key is wrong, what else changes? The chain answers all four, in Arabic, Urdu and English, for paper and screen, inside the office's own date sheet. Say "built", "bound", "sealed", "verifiable". Never say "first", "only", "cheat-proof" or "guaranteed fair".

### 5.3 Tiered authority (answers "who can create an exam")

Add to the Delivery Policy record a `classroomTier`: `{ enabled, examTypes: ["QUIZ","CLASS_TEST"], maxMarks, requiresRehearsal: true, teacherApprovesSyllabus: true }`. With it on, the subject teacher is the approver for their own classroom papers and for the taught coverage of their own subject; the principal (or HOD then principal) remains the approver for MID_TERM/FINAL papers, policy and results release. The studio authority matrix stays frozen; the tier resolves which role an actor holds for a given paper. This is the single change that makes the teacher's first five minutes possible without removing the principal's control over term exams.

---

## 6. Feature specifications

Each feature names what it reuses so the implementation session builds on, not beside, the code. Effort: S ≤1 day, M 2–4 days, L 1–2 weeks, XL more.

### F1. Syllabus Drop, Syllabus Map and the Teaching Line (M+M)

**Pitch.** Photograph the syllabus once. From then on the teacher drags a line along it as she teaches, and the exam only ever asks what she has taught.

**Mechanism.**
1. Space 1 becomes "Syllabus & brief". Its first panel is one drop surface with five inputs and no document-kind dropdown: Camera (multi-page `ScanComposer`), Phone capture (`PhoneCaptureButton`, QR hand-off), Upload (PDF/image/TXT ≤10MB), Paste text, and two shortcuts: "Same as last year" (clone the newest APPROVED CURRICULUM for the same subject and grade from the previous year, keeping lineage) and "School library" (pick an approved curriculum for the same subject and grade on another class or campus). Document kind defaults to `syllabus`; registers and scripts are refused here.
2. Extraction stays as it is (document job, OpenAI, uncertainty flags), but split per page batch so long PDFs succeed, with unread pages recorded as `missingPages`, and with a job-status poll instead of "Refresh progress".
3. **New AI step, reviewed:** `POST /api/school-ai/workspace/[id]/outcomes/propose` (new `curriculum-outline-service.ts`) reads the approved or reviewed source pages and proposes `{unit, title, code?, page, excerpt}` outcomes as EXTRACTED_SUGGESTIONS (the brief's three-way classification in `assessment-brief.ts`). The teacher accepts, merges, splits or edits in bulk on a swipeable card list. Accepting writes `curriculum.outcomes[]` with `sourceRecordId`, `sourceVersion`, `sourcePage` (new fields on `curriculum.sources[]`/`outcomes[]`; validate in `validateReferences`).
4. **One-tap approval bundle:** approving the curriculum also approves the cited source revision (`approvalBundle: { sourceId, sourceVersion }` on the CURRICULUM data). The principal gets one queue item, not two. Under the classroom tier the teacher self-approves.
5. **Teaching Line.** New table `teaching_progress` (school, campus, subject, class, curriculum id and version, outcome id, taught_on, timetable_slot_id?, teacher_id, note?, evidence_source_id?; unique per subject/class/outcome/version). The Syllabus Map renders units as columns and outcomes as cards with page thumbnails; the Teaching Line is a draggable rule (pointer and keyboard; tap-on-unit alternative; reduced motion respected). Dragging it writes `taught_on = today` for every outcome up to that point. The Today page asks "Period 3, 7-B Maths: where did you reach?" after each timetabled period. The approved curriculum is never modified; coverage lives beside it and carries forward across versions by outcome id.
6. Consumers: the Brief reads progress as an EXTRACTED_SUGGESTION for `taughtCoverage`; the Blueprint greys out everything past the line; generation receives only taught outcomes (as today, via `sectionCoverage` derived from progress); Rehearsal gains a blocking check `TAUGHT_AFTER_SITTING` when a slot date precedes an outcome's `taught_on`; the Improve space maps results back onto the map.

**Placement.** Studio space 1; teacher Today card; principal queue item "Approve syllabus".
**Roles.** Teacher drops, reviews, drags. Principal/HOD approves once (or the teacher under the classroom tier). Office nothing.
**Reuses.** `source-library.tsx`, `scan-composer.tsx`, `phone-capture.tsx`, `source-structure-review.tsx`, `intake.ts`, `document-jobs-service.ts`, `providers.ts`, `assessment.ts`, `assessment-brief.ts`, `brief-service.ts`, `curriculum-execution.tsx` (`curriculum.import_topics`), `today-schedule.tsx`.
**Data.** `teaching_progress` table; JSON additions on CURRICULUM (`sources[].sourceRecordId/sourceVersion`, `approvalBundle`, `lineage`); SOURCE `detectedKind`.
**AI.** Extraction (existing) and outcome proposal (new), both as suggestions with page citations; never sets taught flags.
**Acceptance.** A teacher with no curriculum reaches a reviewed outcome ladder from a phone photo in under three minutes on the synthetic tenant; the Teaching Line writes dated progress; a paper generated afterwards contains no outcome past the line; a rehearsal on a slot dated before a taught-on date reports `TAUGHT_AFTER_SITTING`; EN/AR/UR; 360px.

### F2. Paper Slots (the office ↔ studio bridge) (L)

**Pitch.** Every line on the date sheet knows where its paper is: requested, written, moderated, sealed, printed, sat, marked.

**Mechanism.** New table `exam_paper_slots`, one-to-one with `ExamSchedule`: requested_by, requested_at, due_on, total_marks (from the subject), duration_minutes (from the period), delivery_kind (PAPER | ONLINE | MIXED), languages, form_count, author_user_id (default `Subject.teacherId`, office may override), moderator_user_id?, paper_record_id?, paper_version?, form_release_id?, assignment_id?, print run fields (copies_requested, printed_by, printed_at, content_hash), sealed_at. **Status is derived, never typed**, in the sixteen tokens: NOT_MEASURED (no paper), DRAFT, READY_FOR_REVIEW, APPROVED, SEALED, CHANGED_AFTER_APPROVAL, STALE (the date moved after sealing), GATE_OPEN (sitting window open). Slots are created by "Request papers" on the date sheet (bulk, per-row due dates defaulting to sitting date minus policy lead days) and automatically when a session plan is applied. Creating a slot fires an in-app notification to the author (new event `EXAM_PAPER_REQUESTED`, category ACTION, link to the Studio brief) and a Today card. Opening the slot creates or links a BRIEF whose subject, class, total marks, duration, sitting date and languages are CONFIRMED_FACTs with `acceptedFrom` the slot (new suggestion origin `OFFICE_POLICY`). The Exam Room's assignment form is prefilled with the slot's date and period window and the roster of the slot's class; gradebook publication is preselected to the slot's exam and subject; the assignment gets `examScheduleId`.

**Placement.** Office: a new **Papers** step in `ExamsWorkspace` (Schedule → Date sheet → Papers → Seating → Marks → Results) with a slot × status grid and a "Nudge" action; a Paper column on `MasterDatesheet`. Teacher: Today "Needs you" row and the Studio next-step card. Principal: queue items.
**Fixes folded in.** Session plans create ACTIVE exams (or an "Open for marks" action); Results badge bug; academic cycle year; teacher notifications; one term list.
**Reuses.** `exam-sessions.ts`, `datesheet-publication.ts`, `exam-session-plan-service.ts`, `brief-service.ts`, `notifications/events.ts`, `principal/queue.ts`, `exam-gradebook-service.ts`, `ExamsWorkspace.tsx`, `MasterDatesheet.tsx`.
**Data.** `exam_paper_slots`; `SchoolAiExamAssignment.examScheduleId`; `SchoolAiRecord` PAPER data `slotId`; notification event; queue types `PAPER_DUE`, `PAPER_SEAL`.
**AI.** Only a nightly "at risk" ranking by a visible rule (days to sitting × missing steps) and a drafted reminder in the teacher's language that the office sends. Never auto-sends.
**Acceptance.** Publishing a date sheet with "Request papers" creates one slot per row; the named teacher is notified and sees the brief prefilled; the slot's token changes as the paper moves through the chain without anyone typing a status; the office grid shows it; deleting a schedule row cascades the slot but never the paper.

### F3. Your Next Step and the loop home (M)

**Pitch.** Every teacher, head and principal opens Exam Studio to one sentence: what needs you now, and the one button that does it.

**Mechanism.** A pure resolver `nextStudioStep(scope, records, slots, assignments, capabilities)` beside `studio-scope.ts` returns one typed step `{ token, space, title, actionLabel, href }`. Fixed, published order: blocked (SAVE_FAILED, BLOCKING rehearsal) → owed by a date (paper slot due) → needs a person (READY_FOR_REVIEW items, curriculum awaiting approval) → open (GATE_OPEN sitting) → improvement (released results with no next lesson). The teacher home becomes five tiles (Syllabus, Where I reached, Papers, Marking, Next lesson), each with a derived state and one action; the seven-space rail stays as the paper's pipeline behind a paper card. The hero CTA points at the next step. The "sample workflow" panel moves behind a "Try with sample data" link and never shows when the provider is live. Managers get a class-and-subject picker (the spec's scope banner, with its existing copy and helpers). The Brief seeds the blueprint and the generate request (duration, marks, languages, coverage). The legacy editor becomes "Advanced editor".

**Reuses.** `studio-scope.ts` (dead helpers), `exam-studio-copy-shell.ts` scope keys, `studio-overview.tsx`, `school-ai-workspace.tsx` examOnly branches, `FlagshipCard`, `principal/queue.ts`.
**Data.** None.
**Acceptance.** A single-subject teacher reaches a generated paper in ≤8 interactions from login on the synthetic tenant; a principal can start a brief; the resolver has unit tests for every ordering rule; no competing CTA above the fold at 360px.

### F4. The paper assembles itself, with Paper DNA (M)

**Pitch.** Press once and watch the paper fill in question by question, each carrying the page it came from; above it, the paper's DNA: what it tests, how hard, how long, in which language.

**Mechanism.** The Blueprint draws the empty paper deterministically first (sections and empty item frames from the blueprint), then consumes the existing NDJSON stream (`generation-stream.ts`) frame by frame; "Stop here" keeps what arrived. A pure module `paper-dna.ts` computes deterministic strands from `PaperData` and the curriculum revision: marks by section/type/outcome; coverage split (assessed, taught-not-assessed, assessed-not-taught); time budget (per-item minutes against duration); difficulty mix from `bankMetadata.difficulty` or UNSPECIFIED; language load (characters per mark per version, numeral consistency). Two strands are AI proposals in one batched call per revision: Bloom level per item with the quoted verb, and estimated minutes with a one-line reason; both stored as unconfirmed `questions[].profile` inside the paper JSON, confirmed by the teacher, invalidated on edit (same mechanism as item review). Strands feed Rehearsal as ADVISORY checks; nothing blocks on an AI strand.

**Placement.** Blueprint canvas; per-item column in Review desk; rows in Rehearsal; a read-only DNA chip on the office slot.
**Reuses.** `generation-stream.ts`, `paper-generation-stream-service.ts`, `item-review.ts`, `question-bank.ts`, `calibration.ts` numeral normaliser.
**Data.** JSON only; `AIUsageLog` feature `SCHOOL_AI_PAPER_DNA`.
**Acceptance.** Deterministic strands render with no provider; AI strands are labelled "estimate" and invalidate on edit; a 60-marks-in-40-minutes paper shows an amber time strand.

### F5. Rehearsal 2.0 with Exam Twin (L)

**Pitch.** Before a single student sees the paper, the Studio sits it, argues with the key, and tells you what will go wrong on Tuesday.

**Mechanism.** Rehearsal gains: a synthetic attempt through the real save path in a rolled-back transaction; figure completeness; print pagination; keyboard pass; TAUGHT_AFTER_SITTING (F1); an AI **solver pass** given only the key-free candidate projection (reuse `assertKeyFreeProjection`), whose answers are compared deterministically with the protected key; disagreements and declared ambiguities become ADVISORY findings `SOLVER_DISAGREES` / `SOLVER_AMBIGUOUS` the author must resolve (edit, regenerate with diff, dismiss with note); a policy flag may promote ambiguity to blocking. **Exam Twin phase 1 (deterministic):** `exam-twin.ts` estimates per-item facility from this class's stored evidence only (item lineage via `reusedFrom`, outcome-level evidence from `summarizeOutcomeEvidence`, historical percentage distribution from office `Mark` rows); a reused item shows observed facility "observed, n=46"; a new item shows an outcome-weighted estimate with a range; below `MIN_SAMPLE` it shows NOT_MEASURED. Phase 2 records forecasts and shows "Twin said 58, class scored 61" after the sitting. Never call it calibration or difficulty.

**Placement.** Space 4; summary chip in Paper DNA; the sealed `rehearsalId` shown in the Control room.
**Reuses.** `exam-release-service.ts` (`automatedRehearsal`, `releaseReadiness`), `release.ts`, `item-evidence.ts`, `recovery.ts`, `exam-gradebook.ts` (`frozenMarkMaximum`).
**Data.** New rehearsal check codes in `SchoolAiRehearsal.results`; `solverRunId`; phase 2 table `school_ai_item_forecasts`.
**Acceptance.** A seeded ambiguous item ("Nitrogen" vs "Air") produces `SOLVER_AMBIGUOUS`; the twin shows an observed facility for a reused item and NOT_MEASURED for a cold class; the legacy "never reviewed" path can no longer read "Ready".

### F6. The Seal and the HOD moderation gate (M+M)

**Pitch.** One calm sheet, one reason, one seal, and the same seal shows on the printed paper, the student's receipt and the office date sheet.

**Mechanism.** After a clean rehearsal the Review desk offers "Submit for review" (the record-level review/approve actions the spaces lack today) and, for the approver, "Prepare the seal". The Seal sheet reads like a certificate: title and version, content hash prefix (LTR, monospace), rehearsal id and advisories, forms and languages, the delivery line from the slot (paper: date, room, copies; online: window, profile version; both), the approver's name and authority. Sealing requires a reason, carries the rehearsal across the approval version bump (approval changes no content), and writes `sealed_at` and `form_release_id` on the slot. A `GET /api/school-ai/exams/[id]/print` renders `paperSnapshot` and refuses on hash mismatch; `GET …/verify` recomputes and compares; the office slot, the print footer and the receipt all show the prefix. **Moderation gate:** when a slot reaches READY_FOR_REVIEW, a moderation task goes to the slot's moderator; the Review desk shows a deterministic conformance report (marks sum vs pattern, section counts, every item within approved coverage, duration-to-marks ratio, language versions parity, exposure ledger hits, figures present) beside the key-free projection; the HOD's decision is stored with the content hash, so any later change shows CHANGED_AFTER_APPROVAL and blocks printing. The Exam Room gains the delivery selector (standard / secure profile / paper) and a link to `/exam-delivery`; SEB profiles own their `.seb` (profile-level start URL, expected Config Key shown), fixing the admission dead end.

**Reuses.** `exam-release-panel.tsx` (split into item-review and rehearsal components), `release.ts`, `verifyContentHash`, `paper-print.ts`, `secure-browser-service.ts`, `studio-access.ts` (`APPROVE_VERSION`, `RECORD_MODERATION`).
**Data.** `exam_paper_moderations` (slot, paper id/version, content hash, moderator, decision, item comments, report, decided_at); print/verify routes; profile `.seb` ownership.
**Acceptance.** A paper edited after the HOD signed shows CHANGED_AFTER_APPROVAL and cannot be printed; the printed PDF footer prefix equals the assignment hash and `verify` returns a match; a secure sitting admits a client that opened the profile's `.seb`.

### F7. Paper or screen: one sitting (L–XL)

**Pitch.** A school can print half the room and screen the other half, and there is still exactly one attempt per student, one key, one marking desk.

**Mechanism.** `SchoolAiExamAssignment.mode` gains PAPER and MIXED (no login needed for PAPER candidates). A print run is created only for a slot that is SEALED (and MODERATED where policy says so) and seated: copies = seats per room + spare % + accommodation copies, pages per copy from the server render; one PDF per room with per-candidate cover sheets carrying the script QR (`issueExamScript` extended to sign `examScheduleId`, `studentId`, `examSeatId`, `contentHash`), seat label, form label, language, hash prefix; a markers' key sheet gated by `READ_PROTECTED_KEY`; envelope labels with a sealed-envelope token bound to the hash; a paper that changed after printing marks the run STALE. After the sitting: **Script Stream**: photograph the pile on a phone (`ScanComposer`); the QR splits the stream per candidate; pages are stored against the attempt (not as a manager-approved SOURCE); objective sections are proposed and scored with `scoreObjectiveResponses`; option letters (A/B/ب/1) count as transcript evidence; written items get the rubric-quote proposal; the teacher marks **one question across all scripts** with a swipe and a rubric strip; uncertain cells are held, never auto-marked. Attendance: the room sheet on the invigilator's phone records PRESENT/ABSENT/LATE per seat (`exam_attendance`), which becomes the authoritative absent flag at marks entry and the re-sit list.

**Placement.** Office steps 3–5; Exam Room (print run and scanned-in count); `/ai/exams/[id]` Scripts tab; teacher phone flow.
**Reuses.** `exam-script-service.ts`, `script-qr.ts`, `script-response-service.ts`, `written-marking-service.ts`, `exam-docs.tsx` (react-pdf), `paper-print.ts`, `exam-rooms.ts`, `marks-scan` (SKO-412).
**Data.** `exam_print_runs`, `exam_envelopes`, `script_cover_batches`, `script_pages`, `exam_attendance`; `assignment.mode` PAPER|MIXED.
**Acceptance.** A sealed paper produces one PDF per room with QR cover sheets whose count equals the seats; a photographed script lands on the right attempt; a second scan of the same QR is refused as a duplicate; an absent candidate cannot receive a mark without an office reopening.

### F8. Calm control room with Live Pulse (M)

**Pitch.** A sitting is a quiet board: rooms, people, their last saved second, and four human actions; nothing flashes, nothing counts down at you.

**Mechanism.** One board per sitting: header from the slot (title, SEALED badge, rooms, invigilators, wall-clock window, current time once a minute, no countdown); one row per candidate **from the roster** (NOT_STARTED, admitted, SAVING/SAVED with last saved time, UNSAVED, SAVE_FAILED, paused, submitted with receipt time, SEB admission summary, observation count), sorted by what needs a person; four actions: clarify (versioned, acknowledged), pause/resume, extend time (bulk, idempotent, per-attempt outcomes, allowed for the invigilator on duty within a bound), close attempt (candidate left). Polls every 5 s (paused when hidden), shows the last successful exchange, uses the `reconnecting`/`error` states, never freezes. **Live Pulse** (deterministic, no bodies): per question, the share of live attempts that answered, left blank or skipped (inferred and labelled), per section progress, "stalled n minutes"; built from key presence only under `READ_ACTIVE_ATTEMPT`, so the authority matrix is unchanged; tapping a stalled question drafts a clarification. Fixes folded in: invigilator access via `ExamInvigilation` through the slot; deadline pushed to the client on extension; expiry never auto-submits paused attempts; `SECURE_BROWSER` attempts expire; 423 while paused is not an error loop.

**Reuses.** `control-room-space.tsx`, `exam-incident-service.ts`, `exam-expiry.ts`, `exam-player.tsx`, `accommodations/service.ts` (`liveAdjustment`), `exam-proctor-console.tsx`.
**Data.** None for phase 1; phase 2 optional `progress` JSON on attempts.
**Acceptance.** The on-duty teacher opens the board for Hall 2; the board moves without reloading; the cable-pull demo shows "reconnecting · last exchange 10:14:52" then SAVED; a 10-minute extension grows the candidate's clock; Q9 at "61% skipped" turns into one clarification with a climbing acknowledgement count.

### F9. Results become the next lesson (M+M)

**Pitch.** The results page does not end with a table; it ends with Monday's lesson, the practice set and one line to each family, all proposed, none sent until you say so.

**Mechanism.** After explicit release, space 7 renders one scroll organised by the syllabus map's outcomes. **Mistake Map** (`mistake-map.ts`, deterministic): outcome × student heatmap from REVIEWED attempts only; outcomes ranked by evidence weight with n; misconception clusters as (item, preferred distractor) groups; CHECK_ITEM items excluded from the learning reading and linked to key correction and the repair map; below `MINIMUM_ITEM_RESPONSES` it says NOT_MEASURED. AI, optional, pseudonymised: names written-answer patterns from stored rubric quotes (each pattern must cite two exact quotes). **Next Ten Minutes:** a card on the teacher's Today twelve minutes before the next timetabled period of a class with a released result: the two lowest outcomes, question numbers, class fraction; on tap, a ten-minute REMEDIATION plan (existing `lessonPlanSchema`, source refs required) with up to three practice items from released items and one formative check item; the teacher confirms; delivery is recorded without any learning-gain claim. **Family Note:** one draft per family from `deriveFeedback` (addressed, partial, missed, not answered, item numbers, practice link, teacher's words), in the guardian's language, no ranking; optional AI rewording pinned to the facts; the teacher previews and sends by explicit action through the inbox or an approved WhatsApp template. **Why I Lost Marks** (student): per question, own response, awarded/maximum, teacher feedback, credited rubric criteria with quotes, the outcome and textbook page; the key only when policy allows; "explain in my words" generated from exactly those inputs; the re-check form preselects the question. Fixes folded in: by-question marking, optional feedback for objective items, auto-finalise objective-only attempts, post-release corrections via the second-reviewer path, per-cell gradebook publication with drift flags, blind sample view, evidence-pack `subjectId`, teacher approval of practice sets under the tier.

**Reuses.** `recovery.ts`, `improve-service.ts`, `learning.ts`, `practice.ts`, `exam-results.ts`, `exam-moderation-service.ts`, `assessment-repair.ts`, `parent/inbox.ts`, `notifications/service.ts`, `pseudonymize.ts`.
**Data.** `family_result_notes`; optional `next_lesson_cards`; DELIVERY_POLICY `discloseKeyAfterRelease`, `learnerExplanations`; attempt `explanations` cache.
**Acceptance.** On the synthetic tenant, release → map shows "Fractions: learning evidence" and "Q7: check the question" → tick → three proposals → one sentence → send to inbox → the guardian sees it in Arabic; no number is shown below the evidence threshold.

### F10. Student and family: My Next Paper, It's In, Family Exam Brief (M each)

- **My Next Paper**: one card per upcoming sitting per student (published date-sheet row + own seat and room + invigilator + online window and mode + approved accommodations + "what this paper covers" from the linked slot's taught coverage, titles only), server-side countdown in the school's time zone; replaces the flat table on `/student/timetable` and feeds Today; parents get the same per child. Status badges on "My online exams" (Opens / Resume / Submitted / Result released); past exams grouped below.
- **It's In**: a verifiable receipt at submit (attempt id, assignment, content hash, responses hash, counts, server time, accommodations, pauses, clarifications acknowledged, profile version) with a short code and QR; for paper sittings the invigilator's collection scan writes a seat-bound receipt; the family inbox gets "received 10:42, receipt K7Q2" in their language.
- **Family Exam Brief**: inbox items derived from the date-sheet publication diff (only affected families on a change), result release, and corrections; one action each (Acknowledge, Read the explanation); acknowledgement receipts per publication version visible to the office.
- **Support on the Day**: one family request per exam session → one approver decision → written to the seat plan, the online timer snapshot and the proctor policy at once, with a receipt back.
- Later: Revision Map (ordered by the learner's own evidence, never a question from the paper), Daily Ten (practice generated from approved coverage, recorded in the exposure ledger so it can never appear on a sealed form), My Growth Line (no rank, no prediction).

**Reuses.** `datesheet-publication.ts` (diff), `student/today.ts`, `exam-player.tsx`, `script-qr.ts`, `parent/inbox.ts`, `accommodations/*`.
**Data.** `ExamSchedulePaper` is covered by the slot; attempt `receipt` and `receiptCode`; `ExamSeat.collectedAt`; inbox kinds `EXAM_DATESHEET`, `RESULT_RELEASED`, `EXAM_SUBMITTED`, `EXAM_SUPPORT`; `exam_support_requests`; `datesheet_acknowledgements`.

### F11. Office depth (L, after the demo core)

Session paper pattern pane in the wizard (marks, duration, sections, coverage rule, languages, lead days, Ramadan periods) seeding every brief with `OFFICE_POLICY` facts; invigilation roster drafter with fairness and setter exclusion; sealed-envelope desk with custody scans; script custody bundles with count reconciliation; re-sits, exemptions and appeals desk that blocks publication while exceptions are open; date-sheet drafter with policy constraints (gap days, heavy-subject spacing, blackout dates, Ramadan periods); a Control tower header ("are we ready for Monday?") computed from the ledger with a visible rule and no model score.

### F12. Pilot Ledger (S)

A nightly materialised metric per school (minutes from first syllabus upload to first sealed release; share of released items with sources; blocking rehearsal findings per 100 items; mixed sittings and duplicate-attempt refusals; minutes from approved repair to last receipt; language versions released with parity; practice sets built; evidence packs exported), each row carrying a claim id from `commercial-evidence.ts` with a code citation and a sample size, opt-in per school. The LEAP slide is generated from it and says which numbers are estimates.

---

## 7. UX, UI and interaction model

- **One front door, one continuing task.** The next-step card is the first thing on every role's Studio home and the first row of Today. The rail is the pipeline behind a paper, not the home.
- **One vocabulary.** The sixteen status tokens (`studio-status.tsx`) are the only state words anywhere: office grid, Studio, print footer, receipts, parent inbox. Word plus icon plus colour, never colour alone.
- **Phone-first and RTL-first.** Every new surface is designed at 360px first (Syllabus Drop tiles, the swipe review, the Teaching Line handle with keyboard and tap alternatives, the control board rows, the by-question marking strip). Arabic and Urdu copy ships together with English (`type Copy = typeof en`). Authored text, hashes, codes and numbers sit in `<bdi dir="auto">` or `dir="ltr"`.
- **Motion rules (from the ticket).** No pulsing timers, no confetti, no promotional overlays, nothing that delays Start or hides a save state. Allowed: the existing intro beat, the paper filling frame by frame (200 ms fades), the Seal sheet's single dialog transition, rows re-sorting.
- **States.** Every surface uses the `SpaceState` union: loading, empty with the named next action, ready, partial with per-target outcomes, error with retained input and retry, permission naming the right, reconnecting with last exchange, recovered with refused input. No toast is ever the only record of an unsaved answer.
- **Design system.** Shared primitives only (`src/components/ui`), tokens only, `check:ui` passes, `font-black` and mapped hex never appear. The brand violet stays for primary actions; the assessment module tone for surfaces.
- **Habit loop.** Morning "Needs you" (next step per user; principal queue items SYLLABUS_APPROVAL, PAPER_SEAL, RESULT_RELEASE) and evening "What changed" (one notification per user per day, none when empty), both in the user's language.

---

## 8. AI policy inside the chain

| Step | Deterministic | AI proposes (labelled, human decides) | Never |
|---|---|---|---|
| Syllabus | validation, idempotent intake, structure | page extraction with uncertainty, outcome ladder with page citations | sets taught flags, approves |
| Brief and blueprint | facts from slot and policy, coverage from Teaching Line | nothing beyond defaults | decides coverage |
| Generation | taught-only input, schema validation, item states | items with source refs, regeneration with diff | marks approved |
| Paper DNA | marks, coverage, time budget, language load | Bloom level with quoted verb, minutes with reason | blocks release |
| Rehearsal | five+ checks, synthetic attempt, TAUGHT_AFTER_SITTING, Twin phase 1 | solver disagreement with reasoning | declares difficulty |
| Moderation | conformance report, exposure ledger | second-reader notes | signs |
| Seal | hash, verify, print | nothing | releases |
| Sitting | clock, saves, receipts, Live Pulse, attendance | clarification draft | pauses, extends, admits |
| Marking | objective scoring, rubric structure, held cells | rubric-quote proposals, transcription with quotes, pattern names | finalises |
| Correction | enumeration, fingerprint, receipts | explanation draft | applies |
| Next lesson | mistake map, evidence thresholds | ten-minute plan, family note rewording, learner explanation | sends |

Every provider call: pseudonymised input, idempotent per evidence hash, logged in `AIUsageLog`, credit-bounded, with a manual path when the provider is down. Evaluation sets per language per step before any live use with real learners (calibration policy already in `calibration.ts`).

---

## 9. Patent candidates (plain words, not legal advice)

Recommendation: one provisional application on the combined mechanism, with independent claims drawn from C1–C4 and dependent claims from C5–C7; a design application on the Teaching Line gesture and the Seal sheet. Novelty searches should cover Inspera, ExamSoft, Turnitin, Gradescope, AssessPrep/ManageBac, Toddle, MagicSchool, Classera, Eduaide. Confidence is the planning session's estimate of whether a claim survives prior art, not a legal opinion.

| # | Candidate claim (method/system) | Inventive step | Closest prior art | Confidence |
|---|---|---|---|---|
| C1 | Generating an assessment only from curriculum outcomes carrying a taught-on date earlier than the scheduled sitting; including a snapshot of those outcomes and dates in the content hash under which the form is released; and preventing release when any outcome's taught-on date follows the sitting date. | The boundary is enforced at three points that cannot disagree (generation input, blocking rehearsal, sealed hash) and the gesture that sets it is a dated record, not a flag. | Standards-aligned generators (MagicSchool, AssessPrep AI); unit planners with coverage (Toddle, ManageBac). None binds generation to dated teaching records or seals the coverage. | medium |
| C2 | Releasing an assessment only under a content hash computed from a candidate-facing projection that structurally excludes protected key fields, carrying the identifier of the rehearsal that justified release, propagating that hash to printed copies, online delivery, candidate receipts and office mark records, and verifying any copy by recomputation without access to the issuing system. | Key-free by construction with an allow-list, rehearsal id inside the hash, chain reaches authoritative marks. | Document hashing and e-assessment integrity (Inspera, ExamSoft). Generic hashing is prior art; the key-exclusion allow-list plus rehearsal binding plus mark lineage is the specific combination. | low–medium |
| C3 | Before release, presenting the key-free candidate projection to a model, comparing its answers with the withheld key, converting disagreements and declared ambiguities into review states that block release until resolved by a human, and sealing the rehearsal identifier into the release. | Solver sees exactly what the student sees; disagreement is a workflow state the gate respects. | Item quality tools, automated distractor analysis (post hoc). | medium |
| C4 | Printing per-candidate script identifiers bound to a sealed assessment version and a seating allocation, importing scanned scripts into the same single-attempt record used for on-screen sittings, and refusing duplicate attempts across modes. | Paper and screen converge on one attempt row under one hash and one seat plan. | Gradescope (scanned scripts, region grading), Inspera (digital). Neither unifies paper and screen attempts under one sealed version. | medium |
| C5 | Propagating an approved correction to a released assessment across dependent records (results, office marks, report versions, practice sets, family notices) from stored references, pinned by a fingerprint of everything read, approved by a second person, applied with resumable per-step receipts. | Cross-system propagation with fingerprint and receipts. | Regrade workflows (Gradescope), gradebook corrections. SKO-472 already exists; the extension to office records and practice withdrawal is new. | medium |
| C6 | Deriving per-item stall signals from ordered autosave snapshots without exposing response content, exposing them only to roles lacking response-read rights, and binding them to versioned, acknowledged clarifications. | Progress inference under a role boundary. | Candidate status monitors (Inspera, Classera). | low–medium |
| C7 | Estimating per-item facility of an unreleased assessment from stored outcome-linked response evidence of the same cohort, lineage-aware for reused items, with published sample sizes and a later accuracy comparison. | Pre-release, cohort-own evidence, honest error. | Post-hoc psychometrics (ExamSoft, Inspera). | medium |

Do not claim: "first", "only", "cheat-proof", "lockdown", "detects cheating", "calibrated difficulty", "learning gains", school counts, time saved, revenue. The claims register in `docs/leap/claims-register.md` governs every public statement.

---

## 10. The LEAP five-minute arc

Synthetic tenant only, labelled on screen; every step live, recorded or marked "planned". Rehearse twice from reset in English and Arabic. Any feature not merged by the rehearsal date is cut from the arc, never faked.

| Time | Screen | Say | Show | Beat |
|---|---|---|---|---|
| 0:00 | Teacher phone, Today | "Her phone already knows the job." | One card: Grade 7 Maths mid-term paper due in 9 days · add your syllabus. | relief |
| 0:30 | Syllabus Drop → Map | "She photographs the syllabus she was handed." | Camera on a printed syllabus; the outcome ladder appears with page numbers; thumb drags the Teaching Line to Unit 3. | ownership |
| 1:15 | Principal tablet | "The principal approves once, with a reason." | One queue item; approve; the slot flips to DRAFT. | control stays human |
| 1:35 | Blueprint | "Press once." | Empty frames fill one by one, each with "p. 14"; "Stop here · kept 6"; Paper DNA strip reads 62 minutes in 40 → she drops one item. | wonder, then trust |
| 2:20 | Rehearsal | "Before any student sees it, the Studio sits it." | Solver flags "Nitrogen vs Air: two options defensible"; regenerate; diff; clear. Exam Twin: Q7 expected 28% correct, n=46. | safety |
| 2:50 | Seal sheet (tablet) | "One reason, one seal." | Hash prefix; delivery line "Paper · 3 Nov · Room 4 · 42 copies" and "Online · secure profile v2"; SEALED. Printed page on stage shows the same eight characters. | gravity |
| 3:20 | Control room (laptop) and candidate (second device) | nothing | Cable pulled: "reconnecting · last exchange 10:14:52"; cable back: SAVED. Q9 amber "61% skipped" → clarification in Arabic → acknowledgements climb. | calm |
| 4:00 | Script Stream (phone) | "The other half sat on paper." | Pile photographed; QR splits three scripts; Q4 swiped 2, 1, 2 on the rubric strip; one cell held. | speed with honesty |
| 4:30 | Next lesson | "Results end in Monday's lesson." | Mistake map; tick Fractions; ten-minute plan; one family note in Urdu; send to inbox; guardian phone shows it. | continuity |
| 4:50 | Pilot ledger slide | "Every number here was computed by the product this morning; the estimates say so." | Six tiles with footnotes. | credibility |

---

## 11. Build order (slices)

Estimates assume one implementation session working full days on this codebase. Linear: SKO-500 (S1), SKO-501 (S2), SKO-502 (S3), SKO-503 (S4), SKO-504 (S5), SKO-505 (S6), SKO-506 (S7), SKO-507 (S8), all children of SKO-408. Each slice ends with: tests (`npm run test:school-ai`, relevant database/browser suites), `check:ui`, `tsc` with the large heap, migration applied to dev Supabase, commit and push on `dev`, Linear sub-issue moved to Done with QA evidence.

### Slice 1 — Syllabus first, the bridge, one front door (target 8–10 days) [SKO-500](https://linear.app/skoolee-ai-app/issue/SKO-500)
1. `teaching_progress` table, API, Syllabus Map with the Teaching Line, Today period prompt (F1.5–6).
2. Syllabus Drop surface; `sourceRecordId/sourceVersion` on curriculum sources with a picker; outcome proposal route and swipe review; approval bundle; manager scope for uploads; teacher read of approved syllabi by subject name and grade; page-batched extraction; job polling; `dir="auto"` (F1.1–4, §4.2 fixes).
3. Delivery Policy `classroomTier` and `curriculumApprovalFor(tier)`; generation accepts a self-attested curriculum for classroom papers (§5.3).
4. `exam_paper_slots`, "Request papers", Papers step, Paper column, notifications, Today card, brief prefill, Exam Room prefill, `assignment.examScheduleId`, gradebook preselect; session plans create ACTIVE exams; Results badge fix; academic cycle year; one term list (F2, §4.1 fixes).
5. Next-step resolver, loop home tiles, manager class-and-subject picker, hero CTA, demo panel demoted, Brief seeds blueprint and generation, scope banner from existing copy (F3, §4.3 fixes).
6. Paper DNA deterministic strands and Live Pulse read model (deterministic halves of F4 and F8), so the demo has two AI-looking moments that need no provider.
7. Teacher "Quiz with Exam Studio" shortcut on `/teacher/tests` and recording Studio results into the teacher's own class test.

### Slice 2 — Release chain and secure delivery (5–7 days) [SKO-501](https://linear.app/skoolee-ai-app/issue/SKO-501)
Studio review/approve for PAPER with rehearsal carried across the approval bump; Seal sheet; print and verify routes; legacy papers must enter review; delivery selector and `/exam-delivery` link in the Exam Room; profile-owned `.seb` with expected Config Key; expiry covers SECURE_BROWSER; rehearsal 2.0 checks (synthetic attempt, figures, print, keyboard, TAUGHT_AFTER_SITTING); time-zone labels; form label on release; framed `/ai/exams/[id]` with a return path (F5 deterministic parts, F6 seal half).

### Slice 3 — Calm control room (4–6 days) [SKO-502](https://linear.app/skoolee-ai-app/issue/SKO-502)
Roster board, polling, error states, server time, bulk extend for the on-duty invigilator, invigilator access via `ExamInvigilation` through the slot, deadline push on extension, paused attempts never expire, 423 handling, close-attempt action, Live Pulse UI, clarification from a stalled question; any assigned subject teacher may mark (F8).

### Slice 4 — Paper or screen (8–12 days) [SKO-503](https://linear.app/skoolee-ai-app/issue/SKO-503)
PAPER/MIXED modes, print run from seating, cover-sheet batches, key sheet, envelope tokens, STALE runs, Script Stream capture and split, option-letter evidence, by-question swipe marking with held cells, room sheet attendance and absent flags (F7).

### Slice 5 — Marking, results and the next lesson (8–10 days) [SKO-504](https://linear.app/skoolee-ai-app/issue/SKO-504)
By-question marking, optional objective feedback, auto-finalise objective attempts, post-release correction path, per-cell gradebook publication with drift flags and `Mark` lineage, blind sample view, evidence-pack `subjectId` and missing sections, remedy fixes, Mistake Map, Next Ten Minutes, Family Note, Why I Lost Marks, teacher-approved practice under the tier, HOD moderation gate (F9, F6 moderation half, §4.5–4.6 fixes).

### Slice 6 — Student and family (6–8 days) [SKO-505](https://linear.app/skoolee-ai-app/issue/SKO-505)
My Next Paper, status badges, It's In receipts (online and paper), parent surfaces for online exams and released results, Family Exam Brief from the publication diff, Support on the Day, accommodation rendering in the player, SEB reopen message (F10, §4.7 fixes).

### Slice 7 — Office depth (8–12 days) [SKO-506](https://linear.app/skoolee-ai-app/issue/SKO-506)
Session paper pattern pane, invigilation roster drafter, envelope and custody desk, re-sits and appeals desk, date-sheet drafter constraints, Control tower header, publication milestone on the rail, quiz tab fix (F11).

### Slice 8 — Demo and intelligence (6–8 days) [SKO-507](https://linear.app/skoolee-ai-app/issue/SKO-507)
Exam Twin phase 1 and solver pass, Parity Lens, Item Watch, Pilot Ledger, demo fixtures (seeded ambiguous item, handwritten script image, 9-day slot) in `scripts/demo/reset-demo-tenant.ts`, the five-minute arc rehearsed in EN and AR, Revision Map and Daily Ten if time allows (F5 AI half, F12).

---

## 12. Engineering rules for the implementation session

- **Audit before fixing.** Open every Appendix A finding at its file:line and confirm it before changing code; several were not independently verified.
- **Shared checkout.** Other sessions edit this checkout. Commit only your own hunks through a temporary `GIT_INDEX_FILE`; never `git add` shared files wholesale (`prisma/schema.prisma`, `tenant-models.ts`, copy catalogs). Never run `npx prisma format`. Re-stage the real index after a temp-index commit. See the memory notes on shared-checkout commits.
- **Migrations.** Hand-written SQL per migration folder, diffed with `prisma migrate diff --from-schema-datamodel`, applied to dev Supabase through `DIRECT_URL` (port 5432) with `migrate deploy`, then `migrate status` and a drift check, then `prisma generate`, then `gen-tenant-registry`; restart the dev server after generate. An unapplied migration from another session (`20261026000300_user_tour_progress`) is present; apply only your own if theirs looks incomplete.
- **Tenant isolation.** Every new table has `school_id` and `campus_id`, the fail-closed guard, and both student rosters are checked (`/admin` and `/dashboard/students` have drifted).
- **Design system.** Shared primitives only; tokens only; `npm run check:ui` passes; `scripts/ui-token-codemod.ts` for violations; EN/AR/UR together; 360/768/1440 and RTL checked; no `title=` tooltips, no hand-rolled pills.
- **Tests.** Pure modules under `node --test` through `scripts/run-school-ai-tests.mjs`; database suites against a disposable loopback DB; Playwright browser specs named `*.browser.spec.ts`; keep screenshots in the scratchpad (the design-system run wipes `test-results`).
- **`tsc`** needs `NODE_OPTIONS=--max-old-space-size=12288`.
- **AI provider.** OpenAI stays; pseudonymise before every prompt; never pollinations.ai.
- **Linear.** Move the sub-issue to In Progress when a slice starts, post a QA comment with suite names, results and evidence paths, move to Done only after QA; keep SKO-408 In Progress until all slices are Done.
- **Claims.** Copy says "built", "bound", "sealed", "estimate", "not measured"; never "first", "only", "cheat-proof", "learning gains".

---

## 13. Hand-off prompt for the implementation session

Paste this after switching the model:

> Continue the Exam Studio work from `docs/product-review-2026-10/exam-studio-plan-2026-10-22/README.md`. Start with Slice 1 (§11), item by item, in the order listed. Before fixing any finding from Appendix A, open its file:line and confirm it. Follow §12 exactly: temp-index commits of your own hunks only, migrations hand-written and applied to dev Supabase, `check:ui`, `tsc` with the large heap, EN/AR/UR together, 360px and RTL checks, Linear sub-issue SKO-500 In Progress → QA comment → Done. Work autonomously; when a decision from §3.1 is needed, take the recommended default and note it in the commit message. Verify each finished item in the browser on the synthetic tenant before moving on, and report what you could not verify.

---

## Appendices

- A. `appendix-a-audit-findings.txt` — seven subsystem maps with every finding, file:line evidence, expected school behaviour and suggested fix.
- B. `appendix-b-design-proposals.txt` — six angle proposals (exam office, teacher daily, investor and patent, student and family, AI differentiation, UX) with mechanisms, placement, data and demo moments.
- C. `appendix-c-sko-408-description.txt` — the full Linear ticket description as of 22 October 2026.
- D. `appendix-d-late-readers.txt` — authoring, roles and spec-drift readers (added when they finish).
