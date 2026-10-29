> **Archived tracker note (29 October 2026):** Linear (SKO-) is now a read-only archive; Jira SKAI is the tracker of record (decision D6, `docs/product-review-2026-10/d6-tracker-of-record.md`). SKO references and Linear statuses below are historical. See `docs/archive/linear/` for the export and open-item crosswalk.

# Exam Studio flagship plan — version 2, 23 October 2026

Owner ticket: [SKO-408](https://linear.app/skoolee-ai-app/issue/SKO-408). Sub-issues: SKO-500 to SKO-507 (one per build slice, §11). Target: LEAP 2027, Riyadh, 12–15 April 2027 (recheck the official site before booking). Funding target: at least USD 1M (always "target", never a commitment).

This is the planning hand-off. Version 1 was produced by one planning session from a full read of the code, the Linear ticket, the `.kiro` spec, the product-review documents, sixteen subsystem audit readers and six design proposers. Version 2 folds in three independent critiques (a non-technical founder, the engineer who will build Slice 1, and a controller of examinations from the launch markets). Implementation happens in a later session on a cheaper model, slice by slice from §11, §13 and §14.

How to read it:

- Founder: §0 (words), §1 (how exams work), §3 (decisions, what goes where, this week, the calendar), §5 (the product idea), §9 (patent), §10 (demo). Skim the rest.
- Implementation session: everything, then start at §14 (Slice 1 spec) with §12 (rules).

Honesty notes. The audit findings in Appendices A and D were produced by code-reading agents. The adversarial verification pass was cut short by a rate limit, so findings marked **(audit)** must be re-checked at their file:line before they are fixed; findings marked **(verified)** were confirmed by the planning session's own reading or by a critic. Scale: Appendix A holds 7 areas and about 110 findings, Appendix D holds 9 areas (authoring, roles and re-reads) and 149 findings; the two overlap heavily. Roughly 30 findings are verified; expect perhaps one in ten of the rest to be wrong in detail and a few to be wrong outright. The claims register in `docs/leap/claims-register.md` still says "Founder review is pending"; review it this week (§3.4).

---

## 0. Words used in this document

School exam words:

| Word | Meaning here |
|---|---|
| Term exam | A mid-term or final exam the whole school sits in one period, announced and run by the exam office. |
| Classroom assessment | A quiz or class test one teacher runs for one class. |
| Date sheet | The timetable of the term exam: which subject sits on which day, period and room. Published to families. |
| Syllabus split | Which chapters a term exam covers (for example mid-term = chapters 1–5). |
| Paper pattern | The school's rule for a paper's shape: total marks, duration, sections, question types. |
| Paper, form, version | The question paper. A form is one of several parallel papers (A, B, C) for the same sitting. A version is one saved revision of a paper. |
| Blueprint | The plan of a paper before questions exist: sections, counts, marks, outcomes. |
| Answer key, marking scheme, rubric | The correct answers; the mark allocation; the criteria for marking a written answer. |
| Moderation | A second person (head of department) reads the paper before it is used: coverage, difficulty, marks add up, language versions agree. |
| Seal (digital) | The approver's act of freezing an approved paper version; it produces a content hash that follows the paper. |
| Sealed envelope (physical) | The printed papers packed and sealed by the office until the sitting. |
| Sitting | The event: candidates sit the paper at a date and time, on paper or on a screen. |
| Seating plan | Which candidate sits where, at exam spacing. |
| Invigilator | The teacher supervising a room. Not the subject teacher. |
| Script | A candidate's answer book. Supplementary sheets are the extra sheets issued during the sitting. |
| Marking, second marking, re-check | Awarding marks; a blind second read of a sample; a candidate's request to recount or re-mark. |
| Re-sit, exemption, absentee | A candidate who sits later; who is excused; who did not attend. |
| Report card | The official result document the office publishes. |
| Controller of examinations, exam coordinator | The person who runs the term exam: usually a senior teacher, sometimes the vice principal. |
| HOD | Head of department. In Skoolee this is a department member with role HEAD (or acting head). |
| Academic lead | A Skoolee seat: the campus PRINCIPAL, or the campus admin only while the campus has no principal. Not a role a school assigns; it is derived. |
| Forms A/B/C, exposure | Parallel papers; a record of which questions have been used before and where. |
| Facility, distractor | The share of candidates who got an item right; a wrong option in a multiple-choice item. |

Product and engineering words:

| Word | Meaning here |
|---|---|
| SOURCE record | An uploaded document (a syllabus PDF or photo) with its extracted text. |
| CURRICULUM record | The outcome ladder derived from a syllabus: units, outcomes, page citations, taught flags. Today both records need approval; this plan merges the two approvals into one. |
| Teaching Line | The teacher's dated mark of "taught up to here" on the syllabus map. |
| Paper Slot | One row of the office's papers ledger: one paper for one subject in one term exam, linked to the date-sheet rows it covers. |
| Content hash | A fingerprint of the exact paper, computed from the candidate-facing text only (never the key). Same paper, same hash. |
| Rehearsal | Automated checks run on a paper before release (keys present, options complete, no key leak, taught boundary, and so on). |
| Status words | The closed set of state words used on every screen, listed in §7. |
| Deterministic | Computed by fixed rules from stored records; no AI involved; reproducible. |
| Estimate | A number an AI or a statistical rule proposed; always labelled; never a fact. |
| Pseudonymised | Pupil names replaced by tokens before anything is sent to the AI provider. |
| Synthetic tenant | The demo school with invented data, reset by `scripts/demo/reset-demo-tenant.ts`. |
| Worker, Redis, egress flags | The background process, the queue and the environment settings needed for document reading (OCR) and script reading to run. |
| (audit) / (verified) | A finding reported by a reading agent and not yet confirmed / confirmed by the planning session or a critic. |

---

## 1. How exams work in a school, in plain words

The founder asked who creates exams. In Pakistani, Gulf and international schools the shape is the same, with local names.

| Seat (Skoolee role) | Does | Never does |
|---|---|---|
| **Exam office / controller of examinations** (today: PRINCIPAL or the academic-lead campus admin; this plan adds an *exam coordinator* appointment, usually a senior teacher) | Writes the exam policy (paper pattern per grade band, syllabus split, Ramadan timings). Announces the term exam. Builds and publishes the date sheet. Requests papers from teachers with one submission deadline. Prints, packs and seals envelopes. Rosters invigilators. Collects scripts. Compiles results. Handles absentees, re-sits, re-checks. Publishes report cards on the principal's sign-off. | Does not write papers. Does not mark. Does not approve a paper's content. |
| **Subject teacher** (TEACHER) | Teaches and knows how far the class has reached. Writes (sets) the paper when asked, by the deadline. Marks the scripts of the section they are assigned to mark (often another section of the same grade). Enters marks. Plans re-teaching. Runs their own quizzes and class tests end to end. Invigilates per roster. | Does not schedule term exams. Does not publish results. |
| **Head of department** (DepartmentMember.role HEAD, DEPUTY_HEAD or acting head) | Moderates every paper in the department before it goes to print: coverage, difficulty, marks, language versions, no repeat of last year. Returns it with comments or signs it. Countersigns the taught coverage. Second-marks a sample. Decides re-checks with the office. | Does not seal (unless the school's policy delegates it). |
| **Principal** (PRINCIPAL) | Signs off the paper version (the Seal) for term exams, or delegates sealing to the HOD under policy. Signs the date sheet and the results. Decides appeals that escalate. | Does not write papers. May author papers in a small school; the product allows it. |
| **Invigilator** (any TEACHER or office staff on the duty roster) | Supervises the room, marks attendance, issues supplementary sheets, reads out corrigenda, collects and counts scripts, records incidents. May grant a bounded extra time (up to 15 minutes, for a disruption) and close an attempt of a candidate who left; both logged. | Never sees the key or the marks. Never decides misconduct. |
| **Class teacher / section head** (the class's `classTeacherId`) | Distributes the date sheet and admit slips, collects absentee notes, is the family's contact. | Nothing in the chain. |
| **Student and family** | Sits the paper; sees the date sheet, the seat, the receipt, the result and the feedback after the office publishes. | Never sees the key (unless school policy discloses it after publication) or other candidates. |

Two kinds of assessment, two owners:

- **Term exams** (mid-term, final): owned by the office. Office schedules and requests; teacher writes; HOD moderates; principal (or HOD by delegation) seals; office prints or the system delivers online; invigilators run rooms; teachers mark; HOD samples; office compiles; principal signs; office publishes.
- **Classroom assessments** (quiz, class test): owned by the teacher. The teacher writes, delivers, marks and records. School policy (§5.3) decides whether the teacher may seal and deliver without anyone else.

Facts the plan now respects:

- **One paper per grade and subject.** All sections of Grade 7 Mathematics sit the same sealed paper at the same period; one print run. Skoolee's records are per section (`Exam`, `ExamSchedule`, `Subject` each carry one `classId`), so the Paper Slot groups all sections of a grade-subject and the common paper is bounded by the coverage all its sections have reached (§6 F1, F2).
- **Paper is the default** sitting mode in Pakistan and the Gulf. Online (standard browser, Safe Exam Browser, camera-supervised) is the exception. Both are first-class in the product and the demo.
- **Small schools.** Where one person is both office and principal, that person holds both seats; the product's "second person" rules then fall to the HOD (moderation, second marking) and are recorded as such. A school with no departments may name a moderator per slot by hand.
- **Boards and patterns.** First validation cohorts: Pakistani boards (FBISE, Punjab), KSA MoE, UAE MoE/KHDA-inspected curricula, Cambridge; IB MYP/DP criterion-referenced marking is a mapping layer on the result (§6 F9) and lands in Slice 7. Paper patterns, marking schemes and term structures differ; the pattern pane (§6 F2) carries the school's own.
- **Oral, practical and project assessments** keep the office cycle's existing marks path; Exam Studio's chain covers written papers in this plan.

The code already enforces the first half of the split (`src/lib/academic/exam-permissions.ts`: office creates MID_TERM/FINAL, teachers create QUIZ/CLASS_TEST). Missing: the request from the office to the teacher, the moderation gate, the print run, custody, and the link back from the paper to the date sheet.

---

## 2. What Skoolee has today

Three systems and one side door, each real and mostly solid, none connected.

**A. Office exam cycle** (SKO-413; `src/components/academic/exams/*`, `src/lib/academic/exam*.ts`). Admin or principal → Academics → "Exams & results". Five steps: Schedule → Date sheet → Seating → Marks → Results. Records: `ExamSession` → `Exam` (per section) → `ExamSchedule` (one date-sheet row per subject per section) → `ExamRoom`/`ExamSeat`/`ExamInvigilation` (one invigilator per room) → `Mark` → `ReportCard`. Versioned date-sheet publication with family notifications. Marks typed by hand. The founder's "exam schedule" page is the Date sheet step. An AI "Schedule" tab inside Exam Studio drafts a whole session plan that the office applies into these tables; it stays, for the academic lead only, and will create ACTIVE exams and paper slots after Slice 1.

**B. Exam Studio** (SKO-408; `src/components/school-ai/**`, `src/lib/school-ai/**`). `/ai/studio` for principal, teacher and academic-lead admin. Records are `SchoolAiRecord` rows: SOURCE (uploaded syllabus) → CURRICULUM (outcome ladder; today typed by hand) → PAPER (blueprint, AI items with evidence, per-item review states, forms A/B/C, EN/AR/UR versions) → BRIEF → DELIVERY_POLICY → rehearsal → sealed release (content hash) → `SchoolAiExamAssignment` (online sitting) → `SchoolAiExamAttempt` (autosave, server clock, pauses, clarifications, integrity observations) → marking (AI proposals, rubric evidence) → moderation and corrections → explicit results release → gradebook publication into system A's `Mark` rows → practice, formative checks, learner feedback, evidence packs, repair map. Home: a seven-space rail (Brief, Blueprint, Review desk, Rehearsal, Exam Room, Control room, Improve), an older full editor ("Create & review"), an "Evidence" tab for uploads, the "Schedule" tab.

Why two records to approve today: SOURCE is the document (so the school can prove what was uploaded), CURRICULUM is the outcome ladder (so the paper can cite pages). Both are sensible records; approving them separately, by a manager only, is the defect. This plan keeps both records and merges the approval.

**C. Secure exam delivery** (SKO-449; `/exam-delivery`, `src/lib/school-ai/secure-browser*.ts`). Safe Exam Browser profiles managed by the academic lead; an online sitting can pin a profile; the server verifies the browser's keys. This is the founder's "exam browser" page.

**Side door: teacher Tests & quizzes** (`/teacher/tests`). The teacher's own QUIZ/CLASS_TEST with typed marks; it does not know Exam Studio exists.

Strengths to keep and demo: the key-free sealed hash with rehearsal id; idempotent assignment creation; server-authoritative timing with honest recovery; neutral integrity vocabulary with retention; versioned clarifications; preview-then-authorize remedies and the fingerprinted repair map; blind second-marking samples; verifiable evidence packs; full EN/AR/UR and RTL; the status vocabulary; the office's dry-run date sheet and versioned publication; SKO-412 mark-sheet scanning with held cells.

---

## 3. What to do right now

### 3.1 Decisions only the founder can make (with the trade-offs)

Each has a recommended default; the implementation session takes the default unless told otherwise and records it in the commit message.

1. **Who approves a syllabus and a term paper.** Options: (a) principal approves everything (today's shape): safe, but a 1,500-pupil school has 300 papers a term and the principal becomes the bottleneck; when the principal travels, nothing moves. (b) HOD approves day to day, principal signs only the date sheet and the results: how real schools work; needs departments set up in Skoolee (they exist: `Department`, `DepartmentMember` with HEAD). (c) HOD moderates, principal seals: one extra click per paper for the principal. **Default: (b) for syllabi and classroom papers, (c) for term papers**, with the Seal delegable to the HOD per school policy. Cost of (b)/(c): each department needs a named head in Skoolee before the term.
2. **Teacher autonomy for classroom papers.** A Delivery Policy `classroomTier` lets a subject teacher approve their own syllabus coverage and QUIZ/CLASS_TEST papers up to a ceiling, with rehearsal mandatory. Why a ceiling: above it, a "quiz" is a term exam in disguise and should go through moderation. **Default: enabled, ceiling 50 marks, QUIZ and CLASS_TEST only.** Above the ceiling, or for MID_TERM/FINAL, the paper goes to the HOD and the Seal.
3. **Paper first.** What a school needs: a printer, A4, the office's existing answer booklets, a phone camera for the script QR, about two seconds per script to photograph a pile. What the demo loses without it: the 4:00 beat and the credibility of "one sitting, paper or screen" in markets where paper is the norm. **Default: yes.**
4. **Demo environment.** The syllabus-photo beat (0:40) and the script beat (4:00) need the outbox worker, Redis, private storage and the OpenAI media flags (`SCHOOL_AI_MEDIA_EGRESS_APPROVED`, `SCHOOL_AI_DOCUMENT_MODEL`, `OPENAI_API_KEY`) in the demo environment; none is set in this checkout. Cost: a small VM or a worker dyno plus Redis (tens of dollars a month) and OpenAI usage (cents per page). Time: one day for whoever runs the dev Supabase. **Default: the implementation session provisions it in Slice 1 against the dev environment and documents the steps; the founder confirms the production demo host by 1 December.** Without it those two beats are shown recorded, not live.
5. **Patent.** A provisional application typically costs USD 2–6k with an attorney (drafting is the cost; filing fees are small) and gives twelve months of priority. First step: send §9 and this document to a patent attorney with software experience in KSA or Pakistan plus a US filing option, and ask for a novelty search on the claims in §9. "Dated commit evidence" means the git history and this plan, which already carry dates; keep them. **Default: engage an attorney in November 2026, file a provisional before the first pilot school sees the Seal.**
6. **Pilots.** Three to five design-partner schools (one each in Pakistan, KSA, UAE, one international) signed by 15 December, running a real mid-term through the chain in February–March 2027, so April has measured numbers. Offer: free Exam Studio for the pilot term, white-glove onboarding, a say in the roadmap, in return for a signed design-partner agreement (data consent, opt-in to the Pilot Ledger, permission to cite). **Default: the founder starts outreach this week (§3.4).**
7. **Common paper per grade.** One paper for all sections of a grade-subject (the rule in every launch market) versus one paper per section. **Default: one per grade-subject**, with per-section mode only when the office chooses it for a slot.
8. **Anonymised marking.** Print scripts with a candidate number and a fold-over name, so blind second marking is real. **Default: on for term exams, off for quizzes.**
9. **Family results gating.** Subject-level messages to families (Family Note, Why I Lost Marks) go out only after the office publishes the report card, unless the school opts in per session. **Default: gated.**
10. **AI confidentiality for unreleased papers.** Generation and the solver pass send question text to OpenAI before the sitting. Options: opt-in per school with the provider's retention statement shown, or off for term papers. **Default: opt-in per school, shown at policy approval; the demo tenant opts in.**
11. **Re-check policy.** Window after results (default 7 days), who decides (HOD with the office; principal on escalation), second marker must differ from the first, correction path to the mark and the report card. **Default as stated.**

Engineering defaults the founder does not need to decide: one term list shared by timetable, exams and report cards (`TERM_1`, `TERM_2`, `TERM_3`, `ANNUAL`, with KSA's three semesters expressed as three terms); the active academic cycle instead of the calendar year; the status words below.

### 3.2 What goes where (placement map)

Office steps after Slice 1: Schedule → Date sheet → **Papers** → Seating → Marks → Results.

| Thing | Lives in | Reached from | Connects to |
|---|---|---|---|
| Exam policy and paper pattern | Office → Exams & results → step 1 Schedule (session wizard gains a "Paper pattern" pane in Slice 2) | Session wizard | Seeds every brief; the moderation report checks against it |
| Date sheet (the founder's "exam schedule") | Office → step 2 (unchanged) | Sidebar | Its rows feed Paper Slots |
| **Papers ledger** (new) | Office → step 3 Papers: one row per grade-subject with the slot's status word, author, moderator, deadline, print run, scripts in, marks in | Rail | Studio brief, moderation, Seal, print run, custody, marks |
| Seating, invigilation, print runs, room artefacts | Office → step 4 Seating | Rail | Room sheet, control room |
| Marks, results, re-sits, re-checks, report cards | Office → steps 5 Marks, 6 Results | Rail | Gradebook publication from the Studio; corrections propagate |
| Secure exam delivery (the founder's "exam browser") | Academics → Secure exam delivery (`/exam-delivery`), academic lead (unchanged) | Sidebar; the Studio Exam Room shows the profile picker to the academic lead and a "ask your coordinator" note to teachers | Pinned profile on the sitting |
| Syllabus intake, Syllabus Map, Teaching Line | Exam Studio → space 1 "Syllabus & brief" (front door; the Evidence tab stays as the library) | Teacher Today, next-step card | Bounds generation; feeds the brief; maps results back |
| Writing the paper (brief, blueprint, generation, review) or uploading a written one | Exam Studio spaces 1–3 | Paper Slot deep link, next-step card | Slot status |
| Rehearsal, Paper DNA, Exam Twin | Exam Studio space 4 | Next-step card | Release gate |
| Moderation (HOD) | Exam Studio space 3 Review desk, moderation mode | HOD queue, slot | Blocks the Seal |
| The Seal and the delivery choice (paper, online standard, online secure) | Exam Studio space 5 Exam Room → Seal sheet | After a clean rehearsal and a signed moderation | Print run, sitting, SEB profile, slot |
| Live sitting (online) and room sheet (paper) | Exam Studio space 6 Control room | Office step 4, teacher Today (duty) | Attempts, attendance, corrigenda |
| Marking, second marking, corrections | `/ai/exams/[id]` review desk, framed in the Studio | Exam Room list, slot | Gradebook, repair map |
| Results → next lesson, family notes (gated by publication) | Exam Studio space 7 "Next lesson" | Release, Today | Lesson plans, practice, family inbox |
| Teacher Tests & quizzes | `/teacher/tests` (keep) | Sidebar | "Quiz with Exam Studio"; Studio results recorded into the teacher's own test |
| Student calendar, receipts, results, practice | Student Today and `/student/timetable` ("My exams"), `/ai/exams` player | Today | Date sheet + online sittings in one list |
| Parent brief, results, support requests | `/parent` inbox, `/parent/timetable`, `/parent/results` | Inbox | Date-sheet diff, publication, corrections |

### 3.3 The minimum that must ship for the demo, in order

1. Syllabus photo → outcome ladder → one approval → Syllabus Map with the Teaching Line (F1).
2. Papers ledger: office requests, teacher's brief prefilled, status moves by itself (F2).
3. One front door: the next-step card (F3).
4. The paper assembles itself with the Paper DNA strip (F4, deterministic strands).
5. Moderation decision bound to the hash, then the Seal with the same hash on the printed page (F6).
6. Print run with QR covers and Script Stream marking by question (F7).
7. Calm control room with the reconnect beat and Live Pulse (F8).
8. Results → Mistake Map → next lesson → family note after publication (F9).
9. Rehearsal solver finding and Exam Twin (F5), Pilot Ledger (F12).

Cut from the bottom. Items 1–5 are the pitch; without 6 the paper story is told, not shown; without 7–9 the demo still stands.

### 3.4 Founder's checklist for this week

- Read §0, §1, §3; confirm or change the eleven defaults in §3.1 by replying with the numbers you change.
- Tell the implementation session to start Slice 1 (§13).
- Decide who provisions the demo environment (§3.1 item 4) and by when.
- Email two patent attorneys with §9 and ask for a novelty search quote (§3.1 item 5).
- Draft the pilot outreach message and list ten candidate schools across the four cohorts (§3.1 item 6).
- Review `docs/leap/claims-register.md` (it has waited for founder review since 18 October) and the LEAP dates on the official site.
- Note that your own SUPER_ADMIN account cannot open Exam Studio by design (`src/app/ai/studio/page.tsx` sends it to `/super`). Use the synthetic tenant logins: `demo-principal@example.invalid`, `demo-teacher@example.invalid`, `demo-guardian@example.invalid`, plus a student login and an HOD login the implementation session adds to the reset script in Slice 1. The password comes from `DEMO_PASSWORD` when the tenant is reset.

### 3.5 Calendar back from LEAP (12–15 April 2027)

| Date | Milestone |
|---|---|
| 27 Oct 2026 | Slice 1 starts (SKO-500). |
| 1 Dec 2026 | Slices 1–2 done; demo environment host confirmed; patent attorney engaged. |
| 15 Dec 2026 | Three to five pilot schools signed; Slice 3 (paper or screen) done. |
| 15 Jan 2027 | Slices 4–5 done; pilot schools onboarded (syllabi in, departments and HODs named). |
| 8 Feb – 9 Mar 2027 | Ramadan 1448 (approximate): pilots' mid-terms run through the chain with Ramadan period sets (Slice 2 ships the minimal pattern pane for this). |
| 15 Feb 2027 | Slices 6–7 done. |
| 10 Mar 2027 | Slice 8 done; **feature freeze**. |
| 25 Mar 2027 | Demo rehearsal 1 (EN and AR) from reset; anything not merged is cut from the arc. |
| 5 Apr 2027 | Demo rehearsal 2; pilot numbers frozen into the Pilot Ledger slide. |
| 12–15 Apr 2027 | LEAP. |

Fit check: the eight slices total about 70–95 working days of one implementation session (§11). From 27 October to 10 March is about 95 working days. It fits only if two sessions run in parallel on independent slices from December (Slice 3 and Slice 4 touch different files; Slice 6 is independent of Slice 5 apart from the result projection). Cut order if behind: Slice 8 extras, Slice 7 roster and exports, Slice 6 Support on the Day, Slice 5 Why I Lost Marks.

### 3.6 How the founder reviews a slice

When a slice is reported Done: open the synthetic tenant as the teacher, principal and guardian in that order, follow the acceptance checklist at the end of that slice's section, in English then Arabic on a phone, and reply "accepted" or list what failed. "QA evidence" means the test suite names and results, the screenshots in Linear, and the migration status output pasted into the sub-issue comment.

---

## 4. Gaps and defects found

Grouped by where they bite. Severity is the audit's; **(verified)** means the planning session or a critic confirmed it in code. Fix slice in brackets (slice numbers per §11 v2). Full detail with file:line in Appendices A and D.

### 4.1 The three systems are not connected

- **No link from a date-sheet row to a paper or an online sitting** (verified: `ExamSchedule` carries date, period, room; `SchoolAiExamAssignment` has no `examScheduleId`). [S1]
- **AI-planned exam sessions are created with `Exam.status = DRAFT`** while the wizard writes ACTIVE (verified: `exam-session-plan-service.ts:102` vs `exam-sessions.ts:174`); `exam-pipeline.ts:149` does offer an "Open for Marks" transition, but no office screen exposes it, so the defect is UI exposure plus the wrong default. [S1]
- Results step shows "Published" for a DRAFT class exam (audit, `ExamsWorkspace.tsx:980`). [S1]
- Subject teachers are never told a term exam was scheduled or that their paper is due (audit). [S1]
- Exams & results uses the calendar year, not the active cycle (audit). [S1]
- Two term vocabularies: wizard "Term 1", AI planner free text; the `TERM_1` enum belongs to the timetable solver (verified). [S1]
- Lock requires marks for archived pupils (audit). [S7]
- Publication is buried inside Seating with no rail state (audit). [S7]
- AI-imported marks are indistinguishable from typed marks; one manual mark blocks the whole import (audit). [S5]
- Teachers cannot push Studio results into their own class test (audit). [S1]
- Office opens a teacher's quiz with a "Dates & rooms" tab (audit, minor). [S7]

### 4.2 The syllabus path

- **Approved SOURCE records are never linked to the curriculum**; sources are pasted copies with random ids (verified). [S1]
- **No AI step turns syllabus text into outcomes**; up to 200 outcomes typed by hand (verified). [S1]
- **A teacher cannot approve a source or curriculum** (`assertApprovalRole` is manager-only) and **generation requires an APPROVED curriculum** (verified). [S1]
- Extraction is one call capped at 10,000 output tokens (audit). [S1]
- Upload/OCR need the worker, Redis and three env flags, unset here; the UI still offers the buttons (verified in `.env`). [S1 and §3.1 item 4]
- A manager cannot upload a syllabus teachers can see; sharing is bound to `Subject.teacherId` per section (audit). [S1]
- "Taught so far" is frozen inside the approved curriculum; every change clones and re-approves (audit). [S1]
- No one-syllabus-per-subject-per-year model (audit). [S1]
- Structure review is a per-region checkbox marathon; "Send for review" notifies nobody (audit). [S1, S3]
- Urdu/Arabic documents get the UI language and no `dir="auto"` (audit, minor). [S1]
- No URL intake; no reverse import from the office syllabus tracker (`SyllabusTopic`) (audit, minor). [S8]

### 4.3 The front door

- **Four competing front doors** (verified). [S1]
- **A principal (or any manager) can never start a brief** in a campus with more than one subject (verified by reading `brief-space.tsx` and `resolveStudioScope`). [S1]
- **The Brief's nine decisions never reach generation** (verified: the generate request posts only curriculum, blueprint, language, coverage section). [S1]
- The spec's scope banner and helpers are dead code (verified). [S1]
- The "Try a sample workflow" prototype panel is the second block on the flagship home (verified). [S1]
- `/ai` offers "Open Exam Studio" to managers the page then bounces (verified). [S1]
- Hash and `?workflow` state drift (audit, minor). [S1]
- Sidebar mis-highlights on `/ai/exams`; no way back to the Studio (audit, minor). [S2]

### 4.4 Review, rehearsal, seal, print, secure delivery

- **"Create revised draft" is refused for any reviewed, rehearsed or form-set paper** (audit, critical, `assessment-studio.tsx:195`). [S2]
- **Single-item regeneration fails once any item carries a review record** (audit, critical, `item-regeneration-service.ts:55`). [S2]
- **SEB admission can never succeed with the per-exam `.seb`** (verified: `secure-browser-service.ts:103-108` builds a per-exam start URL; the Config Key then never matches the profile). [S2]
- Expiry worker ignores SECURE_BROWSER attempts (verified: `exam-expiry.ts:54`). [S2]
- The sealed paper cannot be printed once the record is edited, and never from the sitting (audit). [S2]
- **No paper-based release** (verified: modes are STANDARD, SECURE_BROWSER, PROCTORED; the list is hard-coded in `exam.ts:12,126`, `exam-boundary-service.ts:47`, `exam-gradebook-service.ts:32`, `item-evidence-service.ts:52`). [S3]
- Rehearsal is four shallow checks plus free text (audit). [S2]
- A paper nobody item-reviewed is released as "Ready" (audit). [S2]
- **The seven-space studio cannot make a PAPER approved** (audit). [S2]
- Exam Room hardcodes `mode: "STANDARD"`; SEB unreachable from the Studio (audit). [S2]
- `verifyContentHash` has no caller (verified: `release.ts:225`). [S2]
- Exam window uses the browser time zone (audit, minor). [S2]
- `ExamReleasePanel` is rendered in three places (audit, minor). [S2]

### 4.5 The live sitting

- **The invigilator on duty cannot open the control room** (verified: `exam-service.ts:63-67` filters by `createdById`; `isAssignedInvigilator` is never set). [S4]
- `ExamInvigilation.examRoomId` is unique: exactly one invigilator per room (verified in the schema). [S4]
- The control room never refreshes; a network failure freezes it (audit). [S4]
- No absentees, roll numbers, remaining time, progress or SEB status on the board (audit). [S4]
- Client auto-submits at a stale deadline, discarding a live extra-time grant (audit). [S4]
- Expiry auto-submits paused attempts (audit). [S4]
- Extra time is manager-only, one request at a time; the matrix gives it to the invigilator (verified mismatch). [S4]
- INVIGILATOR and MODERATOR studio roles derive from any staff role including accountant and librarian (verified: `studio-access.ts:176-177`). [S4]
- Integrity policies only editable from the marking desk before the first attempt (audit, minor). [S2]

### 4.6 Marking, results, improvement

- **Marking cannot be fast** (verified: `examReviewSchema` requires feedback per mark and a note; one attempt per PATCH). [S5]
- Paper script import rejects every choice answer unless the option text appears verbatim (audit). [S3]
- After release every desk path to change a result fails; an upheld appeal has no correction route (audit). [S5]
- Post-release remedies silently fail and are marked APPLIED; a key correction fixes only already-marked scripts (audit). [S5]
- Gradebook marks drift from released results; publication cannot be re-sent; all-or-nothing (audit). [S5]
- Blind second marking is not blind (audit). [S5]
- Evidence pack refuses teachers (`subjectId` never passed) and omits moderation, corrections, repairs (audit). [S5]
- No outcome heatmap; distractor counts computed but not rendered (audit). [S5]
- A learner's result shows numbers and marks only (audit). [S5]
- Practice sets need a principal (audit). [S5]
- Only the creating teacher can mark (verified). [S5]
- Family correction notices link parents to a 404 (audit). [S6]

### 4.7 Student and family

- No single calendar of paper and online sittings (audit). [S6]
- "My online exams" has no per-exam state and staff copy (audit). [S6]
- Parents see no online exams or results although the copy promises "families" (audit). [S6]
- Released results reachable only by reopening the exam page (audit). [S6]
- SEB attempt reopened outside SEB shows a generic error (audit). [S2]
- Reader, large text and submission-mode accommodations are cosmetic (audit). [S6]

### 4.8 Authority (Appendix D)

- Authority is decided in four unrelated places (verified): only eight services use the frozen matrix; the rest use `isSchoolAiManager` (which includes SUPER_ADMIN, CAMPUS_ADMIN, ADMIN) or `staffExamAccess`. The "academic lead only" gate is bypassed through `/ai` and `/ai/exams` (audit). Decision: narrow approval to the academic lead and the HOD (via `DepartmentMember`), let the office operator schedule, request, assign, print and publish the gradebook, and enforce it in `access.ts` and capabilities. [S1 data, S2 enforcement]
- The standalone ADMIN owner may be created without a `campusId` at registration (audit, open); verify `register.ts`. [S1]
- Skoolee has departments and heads (`Department`, `DepartmentMember.role` HEAD/DEPUTY_HEAD/COORDINATOR) that the Studio never reads; version 1 of this plan wrongly said no HOD seat exists. [S1]

### 4.9 Domain requirements added by the controller review

Each becomes part of a feature in §6 and a slice in §11.

- One common paper per grade-subject across sections; per-section coverage combines by intersection for a common paper, with a warning when sections differ. [S1]
- An exam coordinator seat distinct from the principal. [S1]
- HOD as moderator and day-to-day approver; author never moderates their own paper; a return loop with per-item comments and re-moderation showing only the diff. [S1 data, S2 gate]
- Office status words: REQUESTED, MODERATED, PRINTED, SAT, MARKED, PUBLISHED, beside the Studio's words; a marks-return deadline per slot. [S1]
- One session-wide submission deadline (default 15 working days before the first sitting), per-row override. [S1]
- Intake of a teacher-written paper (Word/PDF/photo plus key and scheme) into a slot through the same review and Seal. [S2]
- Reserve paper and a compromise protocol (mark COMPROMISED, cancel, release the reserve form, record against the hash). [S2]
- Errata/corrigenda after sealing and during paper sittings, recorded against the hash, no reprint. [S2 seal, S3 rooms]
- Print from class strength before seating (copies = enrolled + spare), anonymised covers (candidate number, fold-over name), seat labels as a later run, supplementary sheet labels, printed room artefacts (seating chart, signed attendance sheet, admit slips). [S3]
- Physical-first marking: teachers annotate scripts in red, then photograph the marked pile; the system reads awarded marks per question (SKO-412 pattern) and keeps the annotated image for re-checks and PTMs. [S3]
- Script custody at the room: count against PRESENT, bundle with the signed sheet, hand to the office, to the marker, back; retention. [S3]
- Unfair-means workflow for paper rooms (report, confiscation, committee decision, penalty, family notice; no AI conclusion). [S4]
- Absentee categories (medical, leave, UFM, exempt) with evidence; re-sit decision (different form, capped or full marks per policy); publication with AB/pending markers rather than blocking a class. [S5, S7]
- Re-check and appeal policy for paper and online (window, fee option, second marker differs, HOD/office decides, principal escalation). [S5]
- Grace marks and scaling recorded as approved corrections with reason and approver. [S5]
- Criterion-referenced marking (IB MYP criteria, DP bands) as a mapping layer on slot and result. [S7]
- Ministry and board exports (KSA Noor, UAE MoE/KHDA, Pakistani board send-up) at least as CSV in the ministry's column order. [S7]
- Exam period sets with date ranges (Ramadan, short days, Friday exclusion) usable by date sheet and slot duration. [S2 minimal, S7 full]
- Invigilation roster realism: two or more invigilators per hall, chief invigilator, relief, swaps, setter exclusion, gender constraints on segregated campuses. [S4 multi-invigilator, S7 roster]
- Office exam-syllabus publication to families (EXPLICIT coverage) separate from teachers' taught coverage; the Teaching Line warns rather than silently trimming a common paper. [S1]
- HOD countersign of taught coverage; honest dating (backdating recorded, drag backwards to un-teach, audit of jumps). [S1]
- Family result messages gated by report-card publication. [S5]
- Pre-release confidentiality: per-school opt-in for sending unreleased question text to the provider, retention statement, data-residency wording. [S1 policy, S2 UI]
- Script viewing after release for paper sittings (scanned annotated pages) and the PTM step. [S6]
- Paper collection receipt by room count and bundle scan, not per-script scanning at the desk. [S3]
- Demo beats for the office and the moderator. [§10]

---

## 5. The product: one chain, one vocabulary

### 5.1 The idea in one paragraph

Every term exam and every quiz becomes one connected chain the whole school reads in the same words: **taught** (the Teaching Line on the syllabus map) → **written** (generated from what was taught, or uploaded) → **moderated** (the HOD's decision bound to the exact content hash) → **sealed** (one calm sheet, one reason, one hash that appears on the printed page, the screen, the receipt and the office ledger) → **sat** (paper or screen, one attempt per candidate) → **marked** (by exceptions, with evidence) → **corrected** (one approved correction reaches every mark, report card and family) → **taught again** (the next ten minutes, the practice set, one line to each family after the office publishes). AI proposes and explains; it never publishes, concludes misconduct, changes marks, extends time or messages a family. The office runs the cycle from its own date sheet; the teacher lives in one loop; the HOD and principal approve from one queue.

Working name: **the Exam Chain**. Two visible gestures carry it on stage: the **Teaching Line** and the **Seal**.

### 5.2 Why this is distinctive, and what to say

Competitors generate questions (MagicSchool, Eduaide, AssessPrep AI), deliver and monitor online sittings (Inspera, ExamSoft), scan and grade scripts (Gradescope), or run planners and gradebooks (Toddle, ManageBac, Classera). None answers four questions from one record: Was every question taught before the sitting? Is the paper the students sat the paper the principal approved? Can a mark be re-derived from the script, key and rubric? When a key is wrong, what else changes? The chain answers all four, in Arabic, Urdu and English, for paper and screen, inside the office's own date sheet.

One line per competitor for the pitch (vendor descriptions, not verified comparisons): Inspera and ExamSoft are online-delivery suites priced for universities and boards, with no office date sheet and no paper chain; Gradescope scans scripts for grading but has no syllabus, no moderation and no office cycle; AssessPrep (ManageBac) and Toddle are IB-centred planners with assessment add-ons, English-first; Classera is a Gulf LMS with quizzes and schedules but no evidence chain; MagicSchool and Eduaide draft questions with no delivery, marking or office. A Gulf or Pakistani school switches because the chain fits the exam office it already has, in its languages, on paper.

Say "built", "bound", "sealed", "verifiable", "estimate". Never "first", "only", "cheat-proof", "lockdown", "detects cheating", "calibrated", "learning gains".

### 5.3 Tiered authority (who can create an exam)

The Delivery Policy is one record per campus (falling back to the school's, then the platform default), edited by the academic lead on the Studio's policy screen (`DELIVERY_POLICY` kind), approved with separation of duties as today. It gains:

- `classroomTier` (optional, defaulted): `{ enabled: true, examTypes: ["QUIZ","CLASS_TEST"], maxMarks: 50, requiresRehearsal: true, teacherApprovesSyllabus: true }`. With it on, the subject teacher approves their own SOURCE, CURRICULUM, PRACTICE and PAPER records for classroom papers within their assigned subject and class. Term papers (MID_TERM, FINAL) always go to moderation and the Seal.
- `moderation`: `{ required: true, moderatorRule: "DEPARTMENT_HEAD", authorMayModerate: false }`; a slot's moderator defaults to the head of the subject's department, else the academic lead; the office may override per slot; the author can never be the moderator.
- `sealedBy`: `"PRINCIPAL" | "HEAD_OF_DEPARTMENT"` (default PRINCIPAL; the academic lead may delegate to the HOD).
- `providerConfidentiality`: `{ unreleasedPaperText: "OPT_IN" | "OFF" }` (default OPT_IN; the policy screen shows the provider retention statement; OFF disables generation, the solver pass and Paper DNA AI strands for term papers).
- `familyResultsGate`: `"AFTER_PUBLICATION" | "ON_RELEASE"` (default AFTER_PUBLICATION).
- `discloseKeyAfterPublication`: boolean (default false).
- `solverFindings`: `"BLOCK_DISAGREEMENT" | "ADVISORY"` (default BLOCK_DISAGREEMENT).

The frozen studio matrix stays frozen; a new pure module resolves which role an actor holds for a given record from the policy, the department membership and the slot.

### 5.4 Pricing placement

Exam Studio is the flagship module of the existing tiers; paper mode and the Script Stream belong to the same module (no separate add-on); AI credits are consumed per generation, extraction, solver pass and script read as today. The marketing site's four tiers by campus, students and AI credits do not change in this plan; the implementation session must not alter `src/config/plans.ts` without a separate decision.

---

## 6. Feature specifications

Effort: S ≤1 day, M 2–4 days, L 1–2 weeks, XL more. Each feature names what it reuses.

### F1. Syllabus Drop, Syllabus Map and the Teaching Line (L)

**Pitch.** Photograph the syllabus once. From then on the teacher drags a line along it as she teaches, and the exam only ever asks what she has taught.

**Mechanism.**
1. Space 1 becomes "Syllabus & brief". Its first panel is one drop surface with no document-kind dropdown: Camera (multi-page `ScanComposer`), Phone capture (`PhoneCaptureButton`), Upload (PDF/image/TXT ≤10MB), Paste text, "Same as last year" (clone the newest APPROVED CURRICULUM for the same subject and grade from the previous academic year, with lineage), "School library" (approved curriculum for the same subject and grade on another section or campus, read-only copy into scope). Registers and scripts are refused here.
2. Extraction: page-batched (batches of up to 60k characters, one provider call each, merged in page order; unread pages recorded in `missingPages`), job-status polling every 5 s, a specific "document too long / reading paused" message, `dir="auto"` on all review textareas, a document-language selector stored as `sourceLanguage`.
3. **Outcome proposal (AI, reviewed):** `POST /api/school-ai/workspace/[sourceId]/outcomes/propose` proposes `{ unit, title, code?, page, excerpt }` suggestions stored unreviewed on the SOURCE; the teacher accepts, merges, splits or edits on a swipeable card list; `…/outcomes/accept` creates or extends the CURRICULUM with `sources[].sourceRecordId/sourceVersion` and outcomes carrying page citations.
4. **One approval:** approving the CURRICULUM approves the cited SOURCE revision in the same transaction (`approvalBundle`). The HOD (department head) or academic lead approves term-exam syllabi; the teacher self-approves under the classroom tier.
5. **Teaching Line.** `teaching_progress` rows beside the approved curriculum (never inside it). The map renders units as columns and outcomes as cards with page thumbnails; the line is a draggable rule (pointer, keyboard arrows on a focusable handle, tap-on-unit alternative, reduced motion respected). Dragging forward writes `taught_on = today` for every outcome up to that point; dragging backward removes rows (un-teach), recorded in the audit event; a jump of more than one unit in a day is flagged in the audit event and shown to the HOD; a backdated date is allowed and stored as entered with `recordedAt` separate. Two teachers of one section write to the same rows (last write wins, author kept). A substitute with a timetable allocation may write. Students do not see the line; families see the office's published coverage (below).
6. **Common paper and coverage.** For a grade-level slot the generation boundary is the **intersection** of the sections' taught outcomes, shown with a per-section difference list and a warning; the office may instead set an **EXPLICIT** coverage (chapters) on the slot, which is what families see on the date sheet and the student card; the Teaching Line then warns "not yet taught in 7-B" rather than trimming.
7. **HOD countersign.** When a slot moves to READY_FOR_REVIEW the moderator sees the taught coverage with its dates and countersigns it as part of moderation.
8. **Syllabus change mid-year.** "New edition" creates a new curriculum version from the new source; progress rows carry forward by outcome id, then by outcome code, then by exact title match; unmatched outcomes are listed for the teacher to map or leave untaught. Sealed papers keep their own curriculum version and are unaffected.
9. Consumers: the Brief reads progress as a suggestion for `taughtCoverage`; the Blueprint greys out everything past the line; generation receives only taught outcomes; Rehearsal gains `TAUGHT_AFTER_SITTING` (blocking) when the slot date precedes an outcome's taught-on date; the Improve space maps results back onto the map.

**Placement.** Studio space 1 (registry entry `brief` keeps its id and module; its name key becomes "Syllabus & brief"); teacher Today ("where did you reach?" after each timetabled period); HOD queue item "Approve syllabus"; office slot (EXPLICIT coverage).
**Roles.** Teacher drops, reviews, drags. HOD countersigns and approves. Office sets explicit coverage when it wants to. Academic lead approves when there is no HOD.
**Reuses.** `source-library.tsx`, `scan-composer.tsx`, `phone-capture.tsx`, `source-structure-review.tsx`, `intake.ts`, `document-jobs-service.ts`, `providers.ts`, `assessment.ts`, `assessment-brief.ts`, `brief-service.ts`, `curriculum-execution.tsx`, `today-schedule.tsx`, `SyllabusTopic` (the office tracker: the teacher's taps also update `SyllabusTopic.status` through the existing import tool so the office tracker stops drifting).
**Acceptance.** §14.8.

### F2. Paper Slots: the office ↔ studio bridge (L)

**Pitch.** Every line on the papers ledger knows where its paper is: requested, written, moderated, sealed, printed, sat, marked, published.

**Mechanism.** `exam_paper_slots`, one per **grade-subject** in a session (not per section): links all matching `ExamSchedule` rows (`exam_schedules.paper_slot_id`), carries the office facts (total marks, duration, languages, form count, delivery kind PAPER | ONLINE | MIXED, explicit coverage, submission deadline, marks-return deadline, author, moderator, marker overrides per section), and the links the chain fills in (paper record and version, form release, assignments per section, print run, custody counts). **Status is derived, never typed**, from the Studio's words plus six office words (§7). Slots are created by "Request papers" on the date sheet (bulk; one session-wide deadline defaulting to 15 working days before the first sitting; per-row overrides) and when a session plan is applied. Notifications: in-app `EXAM_PAPER_REQUESTED` (ACTION) to the author, `EXAM_PAPER_DUE_SOON` from a daily sweep, `EXAM_PAPER_SUBMITTED` to the moderator, `EXAM_PAPER_MODERATED` to the author; the office may also send a templated email or WhatsApp nudge where the school has channels approved (existing announcement channels). Opening the slot creates or links a BRIEF whose subject, class, total marks, duration, sitting date, languages and form count are CONFIRMED_FACTs with `acceptedFrom: { slotId }` and origin `OFFICE_POLICY`; `taughtCoverage` is suggested from the Teaching Line or set from the slot's explicit coverage. The Exam Room prefills the sitting from the slot (window from date and period or from the pattern's duration; roster = all sections' candidates; one assignment per section sharing the sealed paper); gradebook publication is preselected to each section's exam and subject.

**Undo paths.** Deleting a date-sheet row with a slot in SEALED or PRINTED state is refused with the slot named; removing a subject cascades schedules, so the delete route refuses when a sealed slot exists. A wrong paper sealed or printed is handled by the compromise protocol (F6). A slot requested in error is cancelled by the office with a reason (status CANCELLED, paper kept).

**Placement.** Office step 3 Papers (grid: subject, grade, sections, author, moderator, deadline, status word, readiness ticks, print, scripts in, marks in; actions: Request papers, Nudge, Edit, Record print run, Cancel) and a Paper column on the Master date sheet. Teacher: Today "Needs you" row, Studio next-step card. HOD and principal: queue items.
**Fixes folded in.** Session plans create ACTIVE exams and expose "Open for marks"; Results badge; active cycle; one term list; teacher notifications on session creation and publication.
**Reuses.** `exam-sessions.ts`, `datesheet-publication.ts`, `exam-session-plan-service.ts`, `brief-service.ts`, `notifications/events.ts` and `links.ts`, `principal/queue.ts`, `exam-gradebook-service.ts`, `ExamsWorkspace.tsx`, `MasterDatesheet.tsx`, `announcement-channels.ts`.
**AI.** A nightly at-risk ranking by a visible rule (days to deadline × missing steps) and a drafted reminder in the author's language that the office sends. Never auto-sends.

### F2b. Upload a written paper (M)

A teacher who typed the paper in Word uploads the paper, the key and the marking scheme (PDF, DOCX converted server-side, or photos); the existing extraction reads them; an AI pass proposes `questions[]` (prompt, type, marks, options, key, rubric lines) as unreviewed suggestions the teacher confirms item by item; the result is an ordinary PAPER record with `generation.kind = "UPLOADED"` and every item in DRAFT review state, so moderation, rehearsal and the Seal apply unchanged. Reuses `intake.ts` (documentKind `paper`), `document-jobs-service.ts`, `paperDataSchema`, `item-review.ts`. [S2]

### F3. Your Next Step and the loop home (M)

A pure resolver `nextStudioStep(input)` returns one typed step in a fixed, published order: blocked → owed by a deadline → needs a person → open sitting → improvement → "add your syllabus". The teacher home becomes five tiles (Syllabus, Where I reached, Papers, Marking, Next lesson); the seven-space rail stays as the paper's pipeline behind a paper card; managers get the class-and-subject picker (the spec's scope banner, from the existing copy and helpers); the hero CTA points at the next step; the sample panel moves below the rail behind a disclosure and hides when the provider is live; the Brief seeds the blueprint and the generate request; the legacy editor is renamed "Advanced editor". Principals may author (small schools) but the default next step for a principal is approvals. Queue items `SYLLABUS_APPROVAL`, `PAPER_DUE`, `PAPER_MODERATION`, `PAPER_SEAL`, `RESULT_RELEASE` rank after `REPORT_APPROVAL` in the principal queue and clear when their source condition clears.

### F4. The paper assembles itself, with Paper DNA (M)

The Blueprint draws the empty paper deterministically (sections and empty item frames), then fills frame by frame from the existing stream; "Stop here" keeps what arrived. `paper-dna.ts` computes deterministic strands: marks by section/type/outcome; coverage split (assessed, taught-not-assessed, assessed-not-taught); time budget; **recorded difficulty tags** from `bankMetadata.difficulty` or UNSPECIFIED (never an estimate of difficulty); language load. Two AI strands in one batched call per revision (Bloom level with the quoted verb; minutes with a reason), stored unconfirmed in `questions[].profile`, invalidated on edit; they feed Rehearsal as ADVISORY. Nothing blocks on an AI strand. The AI strands obey `providerConfidentiality`.

### F5. Rehearsal 2.0 with the solver pass and Exam Twin (L)

Rehearsal gains a synthetic attempt through the real save path in a rolled-back transaction; figure completeness; print pagination; keyboard pass; `TAUGHT_AFTER_SITTING`; and, under the confidentiality opt-in, an AI **solver pass** given only the key-free projection (`assertKeyFreeProjection`): `SOLVER_DISAGREES` is **blocking by default** (the author resolves: edit, regenerate with diff, or dismiss with a note that the moderator sees); `SOLVER_AMBIGUOUS` is advisory; the policy flag `solverFindings` is set by the academic lead. **Exam Twin phase 1** (deterministic, `exam-twin.ts`): per-item facility from this class's and this grade's stored evidence (item lineage via `reusedFrom`, outcome-level evidence, office `Mark` history); a reused item shows "observed, n=46"; a new item shows an outcome-weighted estimate with a range; below `MIN_SAMPLE` it shows NOT_MEASURED. Phase 2 records forecasts and shows "Twin said 58, class scored 61". The demo fixture seeds one earlier released sitting for the demo grade so the Twin has evidence to show.

### F6. The Seal, with moderation beside it (L)

**Moderation gate (HOD).** When a slot reaches READY_FOR_REVIEW a moderation task goes to the slot's moderator (department head by default; never the author). The Review desk in moderation mode shows the key-free projection (or the key for a moderator with `READ_PROTECTED_KEY`) beside a deterministic conformance report: marks sum vs the pattern; section counts and types; every item within the approved coverage and the Teaching Line (countersign); duration-to-marks ratio; language versions parity; exposure ledger hits; figures present; the solver findings and the author's dismissals. The decision (RETURNED with per-item comments, or SIGNED) is stored with the paper's content hash in `exam_paper_moderations`; a returned paper goes back to the author with the comments inline; re-moderation shows only the diff since the last decision; any change after signing shows CHANGED_AFTER_APPROVAL and blocks the Seal and printing.

**The Seal.** After a signed moderation and a clean rehearsal, the approver (principal, or HOD under `sealedBy`) opens the Seal sheet: title and version, content hash prefix, rehearsal id and advisories, forms and languages, the delivery line from the slot (paper: date, rooms, copies; online: window, profile; both), the moderator's signature, the approver's authority; a reason is optional (prefilled "Moderated by <name>"). Sealing carries the rehearsal across the approval version bump, writes `sealed_at` and `form_release_id` on the slot, records the sitting date into the seal (for STALE), and fixes the paper for printing. `GET /api/school-ai/exams/[id]/print` renders the sealed snapshot and refuses on hash mismatch; `…/verify` recomputes and compares; the office ledger, the print footer and the receipt show the prefix.

**After sealing.** Corrigendum: a correction notice recorded against the hash and read out in every room (and pushed as a clarification to online attempts); never a reprint. Compromise: mark the sealed paper COMPROMISED with a reason; cancel the sitting or release the reserve form (form B kept unprinted for this purpose); the incident is recorded against the hash and appears in the evidence pack.

The Exam Room gains the delivery selector (paper / online standard / online secure profile); the profile picker and the `/exam-delivery` link show only to the academic lead, teachers see "secure delivery is set by your coordinator"; SEB profiles own their `.seb` with a profile-level start URL (`/ai/exams`, where the candidate picks the open sitting) and the expected Config Key shown.

### F7. Paper or screen: one sitting (L–XL)

`SchoolAiExamAssignment.mode` gains PAPER and MIXED (every hard-coded mode list updated; MIXED means per-section modes or a device-failure fallback, never a split room). **Print run** from class strength (enrolled + spare %), allowed once SEALED, before seating; a later seat-label run after seating. Covers carry a candidate number and a fold-over name when the session anonymises (§3.1 item 8), the script QR (signed with slot, candidate, seat when known, content hash), form label, language, hash prefix; supplementary-sheet labels with the candidate number; a markers' key sheet gated by `READ_PROTECTED_KEY`; envelope labels with a token bound to the hash; a run goes STALE if the paper changes. Printed room artefacts: seating chart per room and notice board, signed attendance sheet per room, admit slips where used.

**Marking, physical first.** Teachers mark on paper in red; then photograph the marked pile (`ScanComposer`); the QR splits the stream per candidate (QR-less sheets are matched by candidate number or held for a person); the system reads the awarded marks per question from the margin or the award grid (SKO-412 pattern: held cells, confidence) and keeps the annotated pages as the re-check record; objective sections may be scored from the scan with `scoreObjectiveResponses`, option letters accepted as evidence; where a school prefers screen marking, the by-question swipe strip with the rubric and held cells is available. Blind second marking reads the anonymised scan.

**Custody.** The room sheet records attendance per seat (PRESENT, ABSENT with category, LATE, EXEMPT) and the collected count; the count is reconciled against PRESENT and any difference is shown, never auto-adjusted; bundles move room → office → marker → office with actor and time; a retention period applies. The room sheet works offline (queued writes) and the attendance sheet is also printed and signed.

**Unfair means** (paper rooms): an invigilator report with script confiscation, a committee decision, a penalty recorded on the attempt, a family notice sent by the office; no AI conclusion.

### F8. Calm control room with Live Pulse (M)

One board per sitting: header from the slot (title, SEALED badge, rooms, invigilators, wall-clock window, no countdown); one row per candidate from the roster (NOT_STARTED, admitted, SAVING/SAVED with last saved time, UNSAVED, SAVE_FAILED, paused, submitted with receipt, SEB admission summary, observation count), sorted by what needs a person; actions: corrigendum/clarification (versioned, acknowledged), pause/resume, extend time (bulk, idempotent, per-attempt outcomes; the on-duty invigilator may extend up to 15 minutes, the academic lead more), close attempt (candidate left). Polls every 5 s, shows the last successful exchange, uses the reconnecting/error states. **Live Pulse** (deterministic, no bodies): per question answered/blank/skipped (inferred, labelled) shares, per section progress, stalled minutes; tapping a stalled question drafts a clarification. Invigilator access via the duty roster: `ExamInvigilation` gains `role` (LEAD, ASSISTANT, RELIEF) and loses the one-per-room uniqueness; INVIGILATOR in the studio matrix is derived from the roster, not from any staff role. Fixes: deadline pushed on extension; paused attempts never expire; `SECURE_BROWSER` attempts expire; 423 while paused is calm.

### F9. Results become the next lesson (L)

After explicit release, space 7 renders one scroll by outcome. **Mistake Map** (deterministic): outcome × student heatmap from REVIEWED attempts; outcomes ranked by evidence weight with n; distractor clusters; CHECK_ITEM items excluded and linked to key correction and the repair map; NOT_MEASURED below the threshold. AI, optional and pseudonymised: names written-answer patterns from stored rubric quotes. **Next Ten Minutes:** a Today card before the next timetabled period of a class with a released result; a ten-minute REMEDIATION plan with practice items and one formative item; the teacher confirms. **Family Note:** one draft per family from `deriveFeedback`, in the guardian's language, no ranking; sent only after the office publishes the report card (or on release when the session opts in); through the inbox or an approved WhatsApp template (requires the school's verified business template per language; lead time two to four weeks; in-app is the default). **Why I Lost Marks:** per question, own response (online) or the annotated scan (paper), awarded/maximum, feedback, credited rubric quotes, outcome and page; the key only under `discloseKeyAfterPublication`; the re-check form preselects the question and respects the re-check window and fee setting. **Report cards:** gradebook publication writes `Mark` rows with lineage (`sourceAssignmentId`, `sourceAttemptId`); a correction after publication proposes a report-card successor version through the existing report versioning, which the office approves and reprints; grace marks and scaling are recorded as approved corrections with reason and approver. Marking fixes: by-question view, optional feedback for objective items, objective-only attempts are finalised by the deterministic scorer (a product rule, not an AI decision) with the teacher able to reopen, post-release corrections through the second-reviewer path, per-cell gradebook publication with drift flags, blind sample view, evidence-pack `subjectId` and missing sections, remedy fixes, teacher-approved practice under the tier, any assigned marker may mark (slot marker overrides, cross-section marking).

### F10. Student and family (M each)

- **My Next Paper**: one card per sitting per student (published date-sheet row, seat and room, invigilator optional per school, online window and mode, approved accommodations, the slot's published coverage), countdown in the school's time zone; replaces the flat table on `/student/timetable` and feeds Today; parents get the same per child. Status badges on "My online exams"; past exams grouped.
- **Candidates without accounts** (paper sittings): nothing in the app; the family channel carries the date sheet, receipt and published result where the guardian has an account; the office prints admit slips and results as today.
- **It's In**: online receipt at submit (attempt, assignment, content hash, responses hash, counts, server time, accommodations, pauses, acknowledged notices, profile version) with a short code and QR; paper receipt by room count and bundle scan (not per-script scanning at the desk), optional per school.
- **Family Exam Brief**: inbox items from the date-sheet publication diff (only affected families), report-card publication and corrections; one action each; acknowledgement receipts per publication version visible to the office.
- **Support on the Day**: one family request per session → the SEN coordinator or academic lead decides once → seat plan, timer snapshot and proctor policy written together; receipt back. Accommodations supported: extra time, breaks, reader, scribe, large text, high contrast, camera exemption, front row, edge seat, extra spacing, separate room.
- **Script viewing after publication** for paper sittings (the annotated scan) and the PTM step. Later: Revision Map, Daily Ten, My Growth Line.

### F11. Office depth (L)

Full paper-pattern pane (marks, duration, sections, coverage rule, languages, lead days, exam period sets with date ranges for Ramadan and short days, Friday exclusion); invigilation roster drafter (free at period, not the setter, fair load, two per large hall, chief, relief, swaps, gender constraint on segregated campuses: campus gains `gender` and staff appointments gain the same); sealed-envelope desk with custody scans; re-sits (ExamSchedule kind RESIT), exemptions and re-checks desk that publishes with AB/pending markers rather than blocking; date-sheet drafter constraints (gap days, heavy-subject spacing, blackout dates, period sets, same subject same time); Control tower header ("are we ready for Monday?") computed from the ledger with a visible rule; publication milestone on the rail; IB criterion mapping; ministry exports (Noor, MoE/KHDA, board send-up CSVs); lock ignores archived pupils; quiz tab fix.

### F12. Pilot Ledger (S)

Nightly metrics per school with claim ids from `commercial-evidence.ts`, code citations and sample sizes, opt-in per school; the LEAP slide is generated from it and says which numbers are estimates.

### F13. Parity Lens (M, Slice 8)

Lexical layer (numerals and units normalised across Arabic-Indic and Urdu digits, option count and order, figure labels, reading-load ratio band, bidi hygiene) plus an AI back-translation layer per item group returning findings bound to exact quotes (`MEANING_DRIFT`, `NEGATION`, `TERM_INCONSISTENT`); each finding needs one recorded human decision; release blocked on undecided findings. Reuses `form-set.ts`, `SchoolAiLanguageProposal`. Owner: the author and a second-language reader in the department.

### F14. Item Watch (M, Slice 8)

Post-sitting signals with n and the label CHECK_ITEM: distractor preferred, nobody full credit, near-zero or negative discrimination, top-quartile candidates preferring a distractor, blank share above the median, facility split between language versions. On demand, an AI distractor defence quoting the prompt; the approver authorises a remedy through the existing preview-then-apply path and the repair map. Reuses `recovery.ts`, `exam-incident-service.ts`, `assessment-repair.ts`.

---

## 7. UX, UI and interaction model

- **One front door, one continuing task.** The next-step card first on every role's Studio home and the first row of Today.
- **One vocabulary.** The status words (`studio-status.tsx`), each a word plus an icon plus a colour, never colour alone, in EN/AR/UR:

| Word | Means |
|---|---|
| DRAFT | Being written; nothing is owed yet. |
| NEEDS_SOURCE | An item cites no syllabus page. |
| NEEDS_CORRECTION | A reviewer asked for a change. |
| READY_FOR_REVIEW | The author is done; a person must read it. |
| APPROVED | A reviewer accepted this version. |
| CHANGED_AFTER_APPROVAL | Edited after approval; approval no longer applies. |
| STALE | Something it depended on changed (for example the sitting date moved). |
| BLOCKING | A check failed that stops the next step. |
| ADVISORY | A check noted something; nothing is stopped. |
| SEALED | Frozen under a content hash; cannot change. |
| SAVED / SAVING / UNSAVED / SAVE_FAILED | The state of the reader's own last change. |
| GATE_OPEN | A sitting window is open now. |
| NOT_MEASURED | No figure exists; never shown as zero. |
| REQUESTED | (office) The office asked for this paper; nothing written yet. |
| MODERATED | (office) The HOD signed the paper. |
| PRINTED | (office) A print run exists for the sealed version. |
| SAT | (office) The sitting happened; attendance recorded. |
| MARKED | (office) Marks are in for every present candidate. |
| PUBLISHED | (office) The office published the result. |

- **Phone-first and RTL-first.** Every new surface designed at 360px first; Arabic and Urdu copy ships with English (`type Copy = typeof en`); authored text, hashes, codes and numbers in `<bdi dir="auto">` or `dir="ltr"`.
- **Motion rules.** No pulsing timers, no confetti, no promotional overlays, nothing that delays Start or hides a save state. Allowed: the intro beat, the paper filling frame by frame, the Seal sheet's single dialog transition, rows re-sorting.
- **States.** Every surface uses the `SpaceState` union. No toast is ever the only record of an unsaved answer.
- **Design system.** Shared primitives only; tokens only; `check:ui` passes.
- **Offline.** The room sheet and script photography queue writes offline and sync later; paper mode is the stated fallback when connectivity fails.
- **Habit loop.** Morning "Needs you" and evening "What changed", one notification per user per day, none when empty.
- **Onboarding.** An Exam Studio guide in the Front Desk guide pattern (`.sk-ink-cover`, `InkHeading`) for teacher, HOD, office and principal, plus a spotlight tour on first open (Slice 6).

---

## 8. AI inside the chain

| Step | Deterministic | AI proposes (labelled; a person decides) | Never |
|---|---|---|---|
| Syllabus | validation, idempotent intake, structure | page extraction with uncertainty; outcome ladder with page citations | sets taught flags; approves |
| Brief and blueprint | facts from slot and policy; coverage from the Teaching Line | defaults only | decides coverage |
| Generation | taught-only input; schema validation; item states | items with source refs; regeneration with diff; question extraction from an uploaded paper | marks approved |
| Paper DNA | marks, coverage, time budget, language load, recorded tags | Bloom level with quoted verb; minutes with reason | blocks release |
| Rehearsal | checks, synthetic attempt, TAUGHT_AFTER_SITTING, Twin phase 1 | solver disagreement with reasoning | declares difficulty |
| Moderation | conformance report, exposure ledger | nothing | signs |
| Seal | hash, verify, print | nothing | releases |
| Sitting | clock, saves, receipts, Live Pulse, attendance | clarification draft | pauses, extends, admits |
| Marking | objective scoring, rubric structure, held cells, mark-grid reading with confidence | rubric-quote proposals; transcription with quotes; pattern names | finalises written marks |
| Correction | enumeration, fingerprint, receipts | explanation draft | applies |
| Next lesson | mistake map, thresholds | ten-minute plan; family-note rewording; learner explanation | sends |

Rules: pseudonymised input; idempotent per evidence hash; logged in `AIUsageLog`; credit-bounded; manual path when the provider is down; evaluation sets per language per step before live use with real learners; **unreleased paper text leaves the school only under the per-school opt-in (§5.3)**, with the provider's retention statement shown at approval and data-residency wording for KSA and UAE in the policy screen.

Data statement for schools (plain words): syllabus photos and scripts are stored in the school's private storage (the configured bucket or volume), never in a public folder; pupil names are replaced by tokens before any text goes to the AI provider; question text goes to the provider only when the school opts in; observations and recordings expire on the school's retention policy; evidence packs are verifiable offline.

Cost budget (estimates to measure in pilots): one syllabus extraction ≈ 1–3 credits per 20 pages; one paper generation ≈ 1 credit; one solver pass ≈ 1 credit; one script page read ≈ 0.1 credit; a 300-paper term ≈ 600–900 credits plus script reading. The implementation session records actual tokens per feature in `AIUsageLog` so the ledger reports real figures.

---

## 9. Patent candidates (plain words, not legal advice)

Recommendation: one provisional application on the combined mechanism with independent claims from C1–C4 and dependent claims from C5–C7; a design application on the Teaching Line gesture and the Seal sheet. Novelty searches: Inspera, ExamSoft, Turnitin, Gradescope, AssessPrep/ManageBac, Toddle, MagicSchool, Classera, Eduaide. Confidence is the planning session's estimate, not a legal opinion.

| # | Candidate claim | Inventive step | Closest prior art | Confidence |
|---|---|---|---|---|
| C1 | Generating an assessment only from curriculum outcomes carrying a taught-on date earlier than the scheduled sitting, countersigned by a second person; including a snapshot of those outcomes and dates in the content hash under which the form is released; preventing release when any outcome's date follows the sitting date. | Boundary enforced at generation input, blocking rehearsal and the sealed hash; the record is dated and countersigned, not self-reported. | Standards-aligned generators; unit planners with coverage. | medium |
| C2 | Releasing an assessment only under a content hash computed from a candidate-facing projection that structurally excludes protected key fields, carrying the rehearsal and moderation identifiers that justified release, propagated to printed copies, online delivery, receipts and office mark records, verifiable by recomputation. | Key-free by allow-list; moderation and rehearsal inside the seal; lineage to authoritative marks. | Document hashing; e-assessment integrity. | low–medium |
| C3 | Before release, presenting the key-free projection to a model, comparing its answers with the withheld key, converting disagreements into review states that block release until a human resolves them, and sealing the rehearsal identifier. | Solver sees exactly what the candidate sees; disagreement is a gate state. | Post-hoc item analysis. | medium |
| C4 | Printing per-candidate identifiers bound to a sealed version and a seating allocation, importing photographed scripts (including annotated marks) into the same single-attempt record used for on-screen sittings, refusing duplicates across modes. | Paper and screen converge on one attempt row under one hash. | Gradescope; Inspera. | medium |
| C5 | Propagating an approved correction across dependent records from stored references, pinned by a fingerprint, approved by a second person, applied with resumable receipts, reaching office marks, report versions, practice sets and family notices. | Cross-system propagation with fingerprint and receipts. | Regrade workflows. | medium |
| C6 | Deriving per-item stall signals from ordered autosave snapshots without exposing response content, exposed only to roles lacking response-read rights, bound to versioned acknowledged clarifications. | Progress inference under a role boundary. | Candidate status monitors. | low–medium |
| C7 | Estimating per-item facility of an unreleased assessment from stored outcome-linked evidence of the same cohort, lineage-aware for reused items, with published sample sizes and a later accuracy comparison. | Pre-release, cohort-own evidence, honest error. | Post-hoc psychometrics. | medium |

Do not claim: "first", "only", "cheat-proof", "lockdown", "detects cheating", "calibrated difficulty", "learning gains", school counts, time saved, revenue.

---

## 10. The LEAP five-minute arc

Synthetic tenant only, labelled on screen. Subject: **Grade 7 Science** throughout. Dates are relative to the demo day (the reset script creates the sitting nine days out). Devices: founder's phone (teacher), a tablet (HOD and principal), a laptop (office and control room), a second laptop as the candidate, an assistant's phone as the guardian. Pre-seeded by the reset script: the session and date sheet, the paper slot requested nine days out, an earlier released sitting (for the Twin), a seeded ambiguous item, a printed page with the hash footer (printed in rehearsal from the sealed fixture paper), a handwritten marked script image. Live: everything else. Fallback per beat: beats 0:40 and 4:00 need the worker and provider; if either is down, play the recorded clip and say so.

| Time | Screen | Say | Show | Live or recorded |
|---|---|---|---|---|
| 0:00 | Office laptop, Papers ledger | "The office asked for every paper in one click; here is where each one is." | Nine rows; one REQUESTED, due in six days, author Ms Fatima. | live |
| 0:20 | Teacher phone, Today | "Her phone already knows the job." | One card: Grade 7 Science paper due in 6 days · add your syllabus. | live |
| 0:40 | Syllabus Drop → Map | "She photographs the syllabus she was handed." | Camera on a printed syllabus; outcome ladder with page numbers; thumb drags the Teaching Line to Unit 3. | live (recorded fallback) |
| 1:20 | HOD tablet | "The head of department signs the coverage once." | One queue item; countersign; the slot reads DRAFT because the brief now exists. | live |
| 1:35 | Blueprint | "Press once." | Empty frames fill one by one with page numbers; "Stop here · kept 6"; Paper DNA strip reads 62 minutes in 40 → drop one item. | live (provider) |
| 2:15 | Rehearsal | "Before any student sees it, the Studio sits it." | Solver: "Nitrogen vs Air: two options defensible" → regenerate → diff → clear. Twin: Q7 expected 28% correct, from last term's 46 responses. | live (provider for solver; Twin deterministic) |
| 2:45 | HOD tablet, moderation | "The head signs the paper against the pattern." | Conformance report all green; SIGNED; the slot reads MODERATED. | live |
| 2:55 | Principal tablet, Seal sheet | "One seal." | Hash prefix; "Paper · Room 4 · 42 copies" and "Online · secure profile v2"; SEALED. The printed page on stage shows the same eight characters. | live |
| 3:20 | Control room and candidate laptop | nothing | Cable pulled: "reconnecting · last exchange 10:14:52"; cable back: SAVED. Q9 amber "61% skipped" → corrigendum in Arabic → acknowledgements climb. | live |
| 4:00 | Script Stream (phone) | "The other section sat on paper and the teacher marked in red." | The marked pile photographed; QR splits three scripts; marks read with two cells held; one corrected. | live (recorded fallback) |
| 4:30 | Next lesson | "Results end in Monday's lesson." | Mistake map; tick one outcome; ten-minute plan; one family note in Urdu queued for publication day. | live |
| 4:50 | Pilot Ledger slide | "Every number here was computed by the product this morning; the estimates say so." | Six tiles with footnotes. | live |

---

## 11. Build order (slices)

Estimates are working days of one implementation session (an AI coding session with a human reviewer; two can run in parallel on disjoint slices). Totals: 70–95 days; see §3.5 for the fit check and the cut order. Each slice ends with: tests, `check:ui`, `tsc` with the large heap, migration applied to dev Supabase, commit and push on `dev`, the Linear sub-issue moved to Done with QA evidence, and the founder's review (§3.6).

### Slice 1 — Syllabus first, Paper Slots, one front door (15–20 days) [SKO-500](https://linear.app/skoolee-ai-app/issue/SKO-500)
F1, F2, F3, the deterministic halves of F4 and F8, §5.3 policy fields, §4.1–4.3 fixes, the exam coordinator seat, HOD lookup, demo environment steps. Full spec in §14. Internally two milestones: 1a (days 1–8: schema, Teaching Line, Syllabus Drop, outline, approval bundle, tier) and 1b (days 9–20: slots, Papers step, notifications, next step, loop home, Paper DNA, Live Pulse read model, fixes).

### Slice 2 — Moderation, the Seal, print/verify, uploaded papers, SEB (10–12 days) [SKO-501](https://linear.app/skoolee-ai-app/issue/SKO-501)
Studio review/approve for PAPER with rehearsal carried across the version bump; moderation mode with conformance report, return loop and diff; the Seal sheet with the sitting date; print and verify routes; corrigenda and the compromise protocol; F2b uploaded papers; legacy papers must enter review; delivery selector and profile-owned `.seb`; expiry covers SECURE_BROWSER; rehearsal 2.0 deterministic checks including `TAUGHT_AFTER_SITTING`; the two critical authoring bugs (clone, regeneration); authority narrowing in `access.ts` and capabilities; minimal pattern pane (marks, duration, period sets with date ranges for Ramadan); time-zone labels; framed `/ai/exams/[id]`.

### Slice 3 — Paper or screen (10–14 days) [SKO-503](https://linear.app/skoolee-ai-app/issue/SKO-503)
F7: PAPER/MIXED modes across every mode list; print run from class strength with anonymised covers, supplementary labels, key sheet, envelope tokens, STALE; room artefacts; Script Stream with physical-first marking and mark-grid reading; custody and attendance with offline queue; option-letter evidence; collection receipt by count.

### Slice 4 — Calm control room (6–8 days) [SKO-502](https://linear.app/skoolee-ai-app/issue/SKO-502)
F8: roster board, polling, error states, server time, bulk bounded extend, invigilator access from the roster with multi-invigilator rooms, matrix narrowing for INVIGILATOR/MODERATOR, deadline push, pause/expiry fixes, close-attempt, Live Pulse UI, corrigendum from a stalled question, unfair-means report for paper rooms.

### Slice 5 — Marking, results, corrections, next lesson (10–12 days) [SKO-504](https://linear.app/skoolee-ai-app/issue/SKO-504)
F9 and the §4.6 fixes; family-results gating; re-check policy; grace marks; report-card successor on correction; gradebook lineage and per-cell publication; evidence-pack completeness; marker overrides.

### Slice 6 — Student and family (6–8 days) [SKO-505](https://linear.app/skoolee-ai-app/issue/SKO-505)
F10 and the §4.7 fixes; onboarding guide and tour.

### Slice 7 — Office depth (10–14 days) [SKO-506](https://linear.app/skoolee-ai-app/issue/SKO-506)
F11.

### Slice 8 — Intelligence and the demo (6–8 days) [SKO-507](https://linear.app/skoolee-ai-app/issue/SKO-507)
F5 solver pass and Twin phase 2, F4 AI strands, F13 Parity Lens, F14 Item Watch, F12 Pilot Ledger, demo fixtures (seeded earlier sitting, ambiguous item, marked script image, nine-day slot, HOD and student logins), the arc rehearsed in EN and AR; Revision Map and Daily Ten if time allows.

---

## 12. Engineering rules for the implementation session

- **Audit before fixing.** Open every Appendix A/D finding at its file:line and confirm it before changing code.
- **Branch.** This checkout has been found on branch `codex/role-specific-ai-setup` with another session's uncommitted work; check `git branch --show-current` before every commit, commit on `dev` (or push `HEAD:dev` deliberately), and never commit another session's files.
- **Shared checkout.** Commit only your own hunks through a temporary `GIT_INDEX_FILE`; never `git add` shared files wholesale (`prisma/schema.prisma`, `tenant-models.ts`, copy catalogs); never run `npx prisma format`; re-stage the real index after a temp-index commit (see the memory notes).
- **Migrations.** Hand-written SQL per folder; diffed with `prisma migrate diff --from-schema-datamodel`; applied to dev Supabase through `DIRECT_URL` (port 5432) with `migrate deploy`; `migrate status` and a drift check; `prisma generate`; `gen-tenant-registry`; restart the dev server. Another session's unapplied migration (`20261026000300_user_tour_progress`) exists; apply only yours if theirs looks incomplete; name yours to sort after it.
- **Tenant isolation.** Every new table has `school_id` and `campus_id` and the fail-closed guard. **Roster rule:** the date sheet, seating, slots and attempts read the `Student` roster by `classId` with `status: "active", archivedAt: null` (the roster the seating planner uses); never the `/dashboard/students` projection.
- **Design system.** Shared primitives only; tokens only; `npm run check:ui`; `scripts/ui-token-codemod.ts` for violations; EN/AR/UR together; 360/768/1440 and RTL checked; no `title=` tooltips.
- **Tests.** Pure modules under `node --test` via `scripts/run-school-ai-tests.mjs`; database suites on a disposable loopback DB; Playwright specs named `*.browser.spec.ts`; screenshots in the scratchpad.
- **`tsc`** with `NODE_OPTIONS=--max-old-space-size=12288`.
- **AI provider.** OpenAI stays; pseudonymise; never pollinations.ai; honour `providerConfidentiality`.
- **Linear.** Sub-issue In Progress when a slice starts; QA comment with suites, results, migration status and screenshots; Done only after QA; SKO-408 stays In Progress until all slices are Done.
- **Claims.** "built", "bound", "sealed", "estimate", "not measured"; never "first", "only", "cheat-proof", "learning gains".

---

## 13. Hand-off prompt for the implementation session

> Continue the Exam Studio work from `docs/product-review-2026-10/exam-studio-plan-2026-10-22/README.md` (version 2). Start with Slice 1 (SKO-500) following §14 item by item, milestone 1a then 1b. Before fixing any Appendix A or D finding, open its file:line and confirm it. Follow §12 exactly: check the branch, temp-index commits of your own hunks only, migrations hand-written and applied to dev Supabase, `check:ui`, `tsc` with the large heap, EN/AR/UR together, 360px and RTL checks, Linear SKO-500 In Progress → QA comment → Done, then continue to SKO-501 without asking. Take every §3.1 default and name it in the commit message. Verify each finished item in the browser on the synthetic tenant and report what you could not verify.

---

## 14. Slice 1 implementation spec (self-contained)

Where this section and §6 differ, this section wins. Confirm every cited line before editing.

### 14.1 Decisions applied in Slice 1

| Decision | Applied as |
|---|---|
| Approval | HOD (department HEAD, DEPUTY_HEAD or acting head of the subject's department) or academic lead approves syllabi and term papers; teacher self-approves classroom records under the tier. `isSchoolAiManager` is no longer sufficient for approval of Exam Studio records (narrowed in a new predicate; other kinds keep the old predicate until Slice 2). |
| Classroom tier | `classroomTier` optional with the platform default (§5.3); PAPER data gains `examType` (default CLASS_TEST when created without a slot; MID_TERM/FINAL from a slot). Generation still requires an APPROVED curriculum; the tier only changes who may approve. |
| Office seat | `campuses.exam_coordinator_user_id` nullable; `isOfficeRole` (academic exam permissions) also admits that user for scheduling, requesting, nudging, print runs and gradebook publication; not for approval or release. |
| Common paper | One slot per (session, subject name normalised, grade = `Class.name`); linked to every `ExamSchedule` of that subject across the grade's sections; per-section assignments share the sealed paper. Coverage = intersection, or EXPLICIT set by the office. |
| Deadline | Session-wide `paper_due_on` default = first sitting − 15 working days (weekends from the campus calendar); per-slot override; `marks_due_on` default = sitting + 5 working days. |
| Taught coverage | `teaching_progress` beside the curriculum; "taught" = `outcome.taught || progress row`; the teacher's taps also update `SyllabusTopic.status` for matching topics (by title) so the office tracker follows. |
| Term and year | `TERM_1/2/3/ANNUAL` everywhere (wizard select, planner select, API validation, migration normalises existing rows case-insensitively); `useAcademicYear()`/`getActiveAcademicYear(campusId)`. |
| Session plans | `applyExamSessionPlan` writes `Exam.status = "ACTIVE"` and creates slots; ExamsWorkspace exposes "Open for marks" for legacy DRAFT exams through the existing pipeline patch. |
| Status words | Six office tokens added to `STUDIO_STATUS_TOKENS` with icon, colour family and EN/AR/UR copy (§7). |
| Registry | `studio-space-registry.ts` entry `brief` keeps id and module; `nameKey` → `syllabusSpace`, `hintKey` → `syllabusHint` (copy only). |

### 14.2 Data model

Migration folder: `prisma/migrations/20261026100000_exam_studio_chain_s1/`. Hand-written SQL, verified with `prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma --script`. New tables carry `school_id` and `campus_id` and join the tenant registry.

```prisma
model TeachingProgress {
  id                String   @id @default(uuid())
  schoolId          String   @map("school_id")
  campusId          String   @map("campus_id")          // the subject's campus; a curriculum with null campus takes the subject's
  subjectId         String   @map("subject_id")
  classId           String   @map("class_id")
  curriculumId      String   @map("curriculum_id")       // SchoolAiRecord kind CURRICULUM
  curriculumVersion Int      @map("curriculum_version")
  outcomeId         String   @map("outcome_id")
  taughtOn          DateTime @map("taught_on") @db.Date  // as entered (may be backdated)
  recordedAt        DateTime @default(now()) @map("recorded_at")
  timetableSlotId   String?  @map("timetable_slot_id")
  teacherId         String   @map("teacher_id")
  note              String?  @db.Text
  evidenceSourceId  String?  @map("evidence_source_id")
  @@unique([schoolId, campusId, subjectId, classId, curriculumId, outcomeId])
  @@index([schoolId, campusId, subjectId, classId, taughtOn])
  @@map("teaching_progress")
}

model ExamPaperSlot {
  id                 String    @id @default(uuid())
  schoolId           String    @map("school_id")
  campusId           String    @map("campus_id")
  examSessionId      String    @map("exam_session_id")
  examSession        ExamSession @relation(fields: [examSessionId], references: [id], onDelete: Cascade)
  subjectName        String    @map("subject_name")       // normalised (trimmed, case-folded) for grouping
  gradeName          String    @map("grade_name")         // Class.name without section
  schedules          ExamSchedule[]                       // via exam_schedules.paper_slot_id
  requestedById      String    @map("requested_by_id")
  requestedAt        DateTime  @default(now()) @map("requested_at")
  dueOn              DateTime  @map("due_on") @db.Date
  marksDueOn         DateTime? @map("marks_due_on") @db.Date
  totalMarks         Int       @map("total_marks")
  durationMinutes    Int       @map("duration_minutes")
  deliveryKind       String    @default("PAPER") @map("delivery_kind")    // PAPER | ONLINE | MIXED
  languages          Json      @default("[\"en\"]")
  formCount          Int       @default(1) @map("form_count")
  coverageRule       String    @default("TAUGHT") @map("coverage_rule")   // TAUGHT | EXPLICIT
  explicitCoverage   Json?     @map("explicit_coverage")                  // { chapters: string[], outcomeIds?: string[] }
  authorUserId       String?   @map("author_user_id")
  moderatorUserId    String?   @map("moderator_user_id")
  markerOverrides    Json?     @map("marker_overrides")                   // [{ classId, markerUserId }]
  paperRecordId      String?   @map("paper_record_id")
  paperVersion       Int?      @map("paper_version")
  formReleaseId      String?   @map("form_release_id")
  sealedAt           DateTime? @map("sealed_at")
  sealedSittingDate  DateTime? @map("sealed_sitting_date") @db.Date
  copiesRequested    Int?      @map("copies_requested")
  printedById        String?   @map("printed_by_id")
  printedAt          DateTime? @map("printed_at")
  printedHash        String?   @map("printed_hash")
  cancelledAt        DateTime? @map("cancelled_at")
  cancelReason       String?   @map("cancel_reason")
  lastNudgeAt        DateTime? @map("last_nudge_at")
  nudgeCount         Int       @default(0) @map("nudge_count")
  version            Int       @default(1)
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")
  @@unique([examSessionId, subjectName, gradeName])
  @@index([schoolId, campusId, authorUserId, dueOn])
  @@map("exam_paper_slots")
}
```

Additive columns: `exam_schedules.paper_slot_id TEXT NULL` (FK to `exam_paper_slots`, `ON DELETE SET NULL`, index); `school_ai_exam_assignments.exam_schedule_id TEXT NULL` and `paper_slot_id TEXT NULL` (indexed); `exam_sessions.paper_due_on DATE NULL`, `exam_sessions.paper_policy JSONB NULL` (Slice 2 fills it); `campuses.exam_coordinator_user_id TEXT NULL`. Delete rules: the schedule and subject delete routes refuse when the linked slot is SEALED or PRINTED, naming the slot.

JSON-only changes (extend the Zod schemas; all optional so stored records still parse):

- CURRICULUM: `sources[].sourceRecordId?`, `sources[].sourceVersion?`, `sources[].pageRange?`; `outcomes[].unit?`; `approvalBundle?`; `lineage?`. `validateReferences` checks cited sources exist in scope at that version.
- SOURCE: `detectedKind?`, `outlineProposal?: { generatedAt, model, requestHash, suggestions: [{ id, unit, title, code?, page, excerpt }] }`.
- PAPER: `examType?`, `slotId?`, `generation.kind` gains `"UPLOADED"` (used in Slice 2).
- BRIEF: `SUGGESTION_ORIGINS` gains `OFFICE_POLICY`; `acceptedFrom` gains `slotId?`.
- DELIVERY_POLICY: `classroomTier?`, `moderation?`, `sealedBy?`, `providerConfidentiality?`, `familyResultsGate?`, `discloseKeyAfterPublication?`, `solverFindings?`, each with a default in `resolveDeliveryPolicy` (the schema is a `strictObject` whose parse failure silently falls back to the platform default: add the keys as optional with `.default()` and extend the platform default object; add a test that every stored approved policy in the fixtures still parses).

### 14.3 Pure modules (`src/lib/school-ai/`, under `npm run test:school-ai`)

| Module | Exports | Rules |
|---|---|---|
| `teaching-progress.ts` | `progressRowsForLine(curriculum, upToOutcomeId, taughtOn)`, `rowsToRemoveForLine(rows, curriculum, upToOutcomeId)`, `taughtOutcomeIds(curriculum, rows)`, `carryForward(previousRows, previousCurriculum, nextCurriculum)` (id, then `code`, then exact normalised title), `coverageChoiceFromProgress(curriculum, rows)`, `intersectionCoverage(perSection: rows[][])` | Outcome order = `curriculum.outcomes` order; inclusive; a jump of more than one unit in one write is flagged in the result for the audit event. |
| `paper-slot-status.ts` | `deriveSlotStatus(input)` → one token; `slotReadiness(input)` → ticks | REQUESTED (no paper); DRAFT; READY_FOR_REVIEW (items all READY/APPROVED, record not APPROVED, no moderation); MODERATED (signed moderation for the current hash); APPROVED (record APPROVED); SEALED (`formReleaseId` or any assignment hash); CHANGED_AFTER_APPROVAL (paper version > moderated/sealed version); STALE (`sealedSittingDate` ≠ the schedules' date); PRINTED; GATE_OPEN (a sitting window open now); SAT (attendance recorded for every section, Slice 3); MARKED (marks for every present candidate); PUBLISHED (exam PUBLISHED); CANCELLED. Never stored. |
| `next-studio-step.ts` | `nextStudioStep(input)` | Order: blocked → owed (slot due) → needs a person (moderation, approval) → open sitting → improvement → "add your syllabus". One test per rule. |
| `paper-dna.ts` | `paperDna(paper, curriculum, progressRows)` | Deterministic strands only in Slice 1. |
| `exam-pulse.ts` | `pulseFromAttempts(paper, attempts, now)` | No response bodies in the output type; "skipped" labelled inferred. |
| `exam-authority.ts` | `approverFor(record, policy, departments, user, assignedSubjects)`, `mayApprove(...)`, `moderatorFor(slot, departments, policy)`, `isExamOffice(user, campus)` | Author never moderates; tier rules; HOD from `DepartmentMember` (HEAD, DEPUTY_HEAD, acting) of the department that owns the subject (by `Department` ↔ subject mapping; where none, the academic lead). |

### 14.4 Services and route contracts

All handlers: `assertSameOrigin`, `requireSchoolAiUser`/`requireAuthUser`, bounded JSON, Zod, service, `errorResponse`; `context.params` is a promise.

| Route | Auth | Body / query → result |
|---|---|---|
| `GET /api/school-ai/teaching-progress?subjectId&classId` | AUTHOR_ITEM in scope, or manager, or HOD of the department | `{ curriculumId, curriculumVersion, rows[], taughtOutcomeIds[], perSection? }` for the current approved curriculum (newest APPROVED for subject name + grade + campus; sections share it). |
| `POST /api/school-ai/teaching-progress/line` | teacher in scope (or substitute with a timetable allocation) | `{ curriculumId, curriculumVersion, classId, upToOutcomeId, taughtOn, timetableSlotId? }` → `{ written, removed, flagged }`; idempotent; audit event with the jump flag. |
| `DELETE /api/school-ai/teaching-progress/[outcomeId]?curriculumId&classId` | same | Undo. |
| `POST /api/school-ai/workspace/[sourceId]/outcomes/propose` | AUTHOR_ITEM on the SOURCE | `{ idempotencyKey }` → `{ proposal }`; chunked provider calls; `aiOutputSchema(outlineProposalSchema)`; pseudonymise; `AIUsageLog` feature `SCHOOL_AI_CURRICULUM_OUTLINE`; rate limit 4 / 10 min / user; idempotent per source revision hash; honours `providerConfidentiality` (syllabus text is not unreleased paper text; allowed). |
| `POST /api/school-ai/workspace/[sourceId]/outcomes/accept` | same | `{ curriculumId?, title?, academicYear, board?, accepted: [{ suggestionId, title, unit, page, code? }] }` → `{ record }`; creates or extends a DRAFT CURRICULUM with `sources[0] = { sourceRecordId, sourceVersion, … }`, outcomes with `sourcePage`, `taught: false`, `included: true`, `approvalBundle`. |
| `PATCH /api/school-ai/workspace/[id]` action=approve (existing) | `mayApprove` | On a CURRICULUM with `approvalBundle`, approve the named SOURCE revision in the same transaction (`updateWorkspaceRecordInTransaction`, approve branch); `assertApprovalRole` is replaced for Exam Studio kinds by `exam-authority.mayApprove`. |
| `POST /api/academic/exam-sessions/[id]/paper-slots` | office (`isExamOffice` + exams.add) | `{ dueOn?, deliveryKind?, languages?, overrides?: [{ subjectName, gradeName, dueOn?, authorUserId?, moderatorUserId?, coverageRule?, explicitCoverage? }] }` → `{ created, skipped }`; groups schedules by subject name + grade; author default: the subject teacher of the first section (or the class teacher under `teachingMode` SINGLE); moderator default from `moderatorFor`; fires `EXAM_PAPER_REQUESTED`. |
| `GET /api/academic/exam-sessions/[id]/paper-slots` | `assertSharedModuleRead("exams")` | `{ slots: [{ …slot, status, readiness, authorName, moderatorName, sections[], date, period }] }`. |
| `PATCH /api/academic/paper-slots/[id]` | office | Compare-and-set on `version`; editable: due, author, moderator, delivery kind, coverage rule and explicit coverage, marker overrides, copies, print run record, cancel with reason. |
| `POST /api/academic/paper-slots/[id]/nudge` | office | In-app `EXAM_PAPER_DUE_SOON`; optional email/WhatsApp through the existing announcement channels when configured. |
| `GET /api/school-ai/paper-slots/mine` | staff | Author's slots (teacher), department's slots (HOD), campus slots (office/lead), with status. |
| `POST /api/school-ai/paper-slots/[id]/brief` | author, HOD or office | Creates or returns the linked BRIEF with CONFIRMED_FACTs from the slot (`OFFICE_POLICY`, actor `requestedById`, at `requestedAt`); `taughtCoverage` suggested from the intersection (or explicit coverage as a fact). |
| `GET /api/school-ai/exams/[id]/pulse` | `staffExamAccess` view | `pulseFromAttempts(...)`. |

Service hooks: PAPER save with `slotId` updates the slot's `paperRecordId`/`paperVersion` in the same transaction and verifies scope; `createSchoolAiExam` with `examScheduleId` prefills the window, sets `examScheduleId`/`paperSlotId`, and (Slice 2) the seal writes `sealedAt`/`sealedSittingDate`; `applyExamSessionPlan` → ACTIVE exams + slots; `createExamSession` → `EXAM_SESSION_SCHEDULED` to `teachersOfClass`; `publishDatesheet` → subject teachers added to recipients; `coverageChoices` in `brief-service.ts` adds the progress-derived choice; `AssessmentStudio.newPaper` accepts an initial blueprint from the newest APPROVED BRIEF and passes `coverageSection`; notifications `EXAM_SESSION_SCHEDULED`, `EXAM_PAPER_REQUESTED` (ACTION; link `/ai/studio#space=brief&slot=<id>`; source `{ type: "paper-slot", id }`; `dueAt`), `EXAM_PAPER_DUE_SOON`, `EXAM_PAPER_SUBMITTED` (to the moderator), `EXAM_PAPER_MODERATED` (to the author), with intents and targets in `links.ts`; principal queue types `SYLLABUS_APPROVAL`, `PAPER_DUE`, `PAPER_MODERATION`, `PAPER_SEAL`, `RESULT_RELEASE` with ranks 9–13 and a source condition each; the delete routes for schedules and subjects refuse when a sealed or printed slot exists; the demo reset script adds an HOD (department head of Science) and a student login.

### 14.5 UI

Studio (`src/components/school-ai/exam-studio/`): `syllabus-drop.tsx`, `syllabus-map.tsx` (with `TeachingLine`), `outline-review.tsx`, `studio-scope-picker.tsx`, `next-step-card.tsx`, `loop-home.tsx`, `paper-dna-strip.tsx`, `pulse-panel.tsx`; `spaces/brief-space.tsx` mounts the drop or the map above the brief; `exam-room-space.tsx` gains the slot selector and prefill; `exam-studio-shell.tsx` hero CTA → next step; `school-ai-workspace.tsx` moves the sample panel below the rail behind a disclosure and hides it when the provider is live; `studio-status.tsx` and `exam-studio-copy.ts` gain the six office tokens.

Office (`src/components/academic/exams/`): `ExamsWorkspace.tsx` `STEPS` gains `papers` at index 3 (later steps renumbered), `progress.papers = sealed / slots`; `PapersStep.tsx` grid and actions; `MasterDatesheet.tsx` Paper column; `SessionWizard.tsx` term select over `TIMETABLE_TERMS`, year from `useAcademicYear()`, session deadline field; Results badge keyed on PUBLISHED with "Open for marks" for DRAFT.

Teacher: `src/app/teacher/page.tsx` "Needs you" row from `/api/school-ai/paper-slots/mine` and the "where did you reach?" card after each slot of `today-schedule.tsx` (writes the line; copy keys in `ui-messages.ts`); `src/app/teacher/tests/page.tsx` secondary action "Quiz with Exam Studio"; `exam-gradebook-service.ts` authorize: manager, office, or the assignment creator who manages the target QUIZ/CLASS_TEST.

HOD: the principal queue surfaces to a department head on `/teacher` as "Department approvals" (a `QueueItem` list reusing the queue component) when `DepartmentMember.role` is HEAD/DEPUTY_HEAD or acting.

Copy: `exam-studio-copy-syllabus.ts`, `exam-studio-copy-slots.ts`, `exam-studio-copy-home.ts` registered in `EXAM_STUDIO_COPY_AREAS`; office and Today strings via `useUiText` keys in `ui-messages.ts`; notification titles in `events.ts`; all three languages together.

### 14.6 Tests

Pure: `teaching-progress.test.ts` (line, undo, carry-forward, intersection, jump flag), `paper-slot-status.test.ts` (every token), `next-studio-step.test.ts` (every rule), `paper-dna.test.ts`, `exam-pulse.test.ts` (no bodies), `exam-authority.test.ts` (tier, HOD, author-never-moderator, office seat), delivery-policy fixtures still parse with the new optional keys, copy completeness via the registry. Database: slot grouping by subject and grade across sections; slots from a session and from an applied plan; schedule delete refused when sealed; approval bundle in one transaction; tier approval allowed/refused; PAPER save updates the slot; assignment with `examScheduleId` sets slot links; `SyllabusTopic` follows the line. Browser (`exam-studio-s1.browser.spec.ts`): teacher phone 390px EN and AR: drop → outline → approve (tier) → map → line → next step → generated paper (fixture provider); office 1440px: request papers → grid → nudge → "Open for marks"; HOD: countersign and approve a syllabus; principal: scope picker → brief. Gates: `check:ui`, `tsc` (large heap), `test:school-ai`, `tests/academic` suites.

### 14.7 Order of work and commits

Milestone 1a: (1) schema, migration, registry, policy keys, pure modules and tests; (2) teaching-progress routes, Syllabus Map and Line, Today prompt, `SyllabusTopic` sync; (3) outline propose/accept, Syllabus Drop, approval bundle, `exam-authority` and the narrowed approval predicate, HOD queue surface. Milestone 1b: (4) slots service and routes, Papers step, Master date sheet column, notifications, queue types, session fixes, delete refusals; (5) next step, loop home, scope picker, hero and sample panel, brief seeding, status tokens; (6) Paper DNA strip, Live Pulse panel, Exam Room slot prefill, teacher tests shortcut, gradebook authorize, demo reset additions, demo environment steps documented in `docs/ENVIRONMENTS.md`; (7) browser specs, EN/AR/UR sweep, screenshots, QA comment, Done. Each commit: temp index of your own hunks; push `dev`; migration applied to dev Supabase before commit 1 is pushed.

### 14.8 Acceptance checklist for SKO-500

- [ ] Teacher with no curriculum: photo → outline → approve (tier) → map in ≤ 3 minutes on the synthetic tenant; manager-uploaded syllabus visible to every section teacher of that grade.
- [ ] Teaching Line writes dated rows, undo and backdating work and are audited, the jump flag reaches the HOD view; a paper generated afterwards contains no outcome past the line; keyboard and tap alternatives exist.
- [ ] HOD countersigns coverage and approves a syllabus from their queue; the author cannot be the moderator of their own slot.
- [ ] Principal can pick class and subject and start a brief; a principal's default next step is approvals.
- [ ] "Request papers" creates one slot per grade-subject linking all sections; the author is notified; Today shows it; the brief is prefilled with `OFFICE_POLICY` facts; the slot's word moves REQUESTED → DRAFT → READY_FOR_REVIEW → APPROVED with no typing; deleting a sealed slot's schedule row is refused; cancelling a slot keeps the paper.
- [ ] Applied session plan yields ACTIVE exams and slots; Results never says "Published" for a DRAFT; the wizard shows the active cycle's classes; one term list; the exam coordinator seat can request and nudge but not approve.
- [ ] Next-step card is the first element at 360px; hero CTA follows it; the sample panel is below the rail and hidden when the provider is live.
- [ ] Paper DNA strip renders with no provider; Live Pulse shows shares without any answer text.
- [ ] `check:ui`, `tsc`, pure and database suites green; AR and UR screenshots attached to SKO-500; migration status pasted.

---

## Appendices

- A. `appendix-a-audit-findings.txt` — first audit run: seven subsystem maps with findings, file:line evidence, expected school behaviour and suggested fix.
- B. `appendix-b-design-proposals.txt` — six angle proposals with mechanisms, placement, data and demo moments.
- C. `appendix-c-sko-408-description.txt` — the Linear ticket description as of 22 October 2026.
- D. `appendix-d-late-readers.txt` — second audit run (nine areas: authoring, roles, shell, office, candidate, syllabus, control room, marking, release) with 149 findings; its roles and authoring findings are folded into §4.8.
- E. `appendix-e-plan-critics.txt` — the three critiques (founder, engineer, controller) that produced version 2.
