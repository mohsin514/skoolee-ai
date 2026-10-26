# LEAP demo runbook (SKO-452)

Operator runbook for the three-minute assessment story. Everything shown is **synthetic demonstration data**; say so on screen and aloud. This is an internal document, not a product page.

## 1. Before the session

| Step | Command or check | Owner |
|---|---|---|
| Build | Record the exact commit on `dev` that you will demo (`git log -1 --oneline`). Do not demo uncommitted work. | Founder |
| Reset | `DEMO_PASSWORD=<12+ chars> DATABASE_URL=<demo database> npx tsx scripts/demo/reset-demo-tenant.ts`. Use only the dedicated demo database. A non-local database also needs `DEMO_RESET_ALLOW_REMOTE=1`. | Founder |
| Confirm reset | The printed manifest shows `users 5, classes 2, students 12, guardianLinks 2, exams 3, approvedRecords 2, familyActions 1`, and the same `fingerprint` as the last rehearsal. | Founder |
| Accounts | `demo-principal@example.invalid`, `demo-teacher@example.invalid`, `demo-guardian@example.invalid`, `demo-hod@example.invalid` (Head of Science), `demo-student@example.invalid` (password from `DEMO_PASSWORD`; never reuse a real password). MFA is enrolled at first sign-in for the principal. | Founder |
| Exam chain data (SKO-500) | Grade 7 A and B with Science (approved eight-outcome syllabus in three units, outcome 1 taught), Grade 7 A Mathematics with no syllabus (for the live Syllabus Drop), a Science department headed by the HOD, a published Grade 7 A timetable (Science 07:30, Mathematics 08:15, Monday to Saturday) and a mid-term with Science on the date sheet nine days after the reset. | Founder |
| Scanner | The live scan needs the configured mark-scan extractor and object store for the demo environment. Print the mark sheet from the exam's mark-sheet template before the session. | Founder |
| Recorded fallback | A labelled screen recording of the same story (EN and AR), with captions and a transcript. **Not yet recorded.** | Founder |

The reset only deletes and recreates the school `skoolee-demo-synthetic` labelled `[Synthetic demo]`. It refuses any other school at that id and never reads or changes another tenant (tested in `tests/demo/reset-demo-tenant.database.test.ts`).

## 2. The three-minute story (one class, one fictional pupil)

| Time | Screen | What to say | What must be visible |
|---|---|---|---|
| 0:00 | Teacher → Tests / Exam Studio: the approved paper `[Synthetic demo] Photosynthesis check` | "The paper comes from an approved syllabus page; every question cites its source." | Source reference on each question |
| 0:40 | Teacher → mark scan for `[Synthetic demo] Science unit test` | "I photograph the paper mark sheet." | Pages accepted or sent back for retake |
| 1:10 | Scan review | "One cell is ambiguous — a 7 or a 1. The system does not guess; I decide." | The uncertain cell held for review; teacher approval before import |
| 1:50 | Results | "Only the approved marks are imported. Nothing is published until I approve." | Import receipt; no publication without approval |
| 2:20 | Guardian (phone, Arabic or English) → family inbox | "The family gets one clear action, in their language." | `[Synthetic demo] Review Student 01's science feedback` |
| 2:50 | Close | "A later reassessment would show progress. That is a **later** step, not something that happened during this demo." | Label "later" on any reassessment mention |

Do not show or imply instant learning gains, school counts, revenue or time savings.

## 3. If the network fails

1. Say what happened: "The venue connection dropped; here is the same flow recorded on the synthetic dataset."
2. Switch to the labelled recording at the matching step.
3. When the connection returns, reopen the live scan batch. Captured pages and reviewed cells are kept server-side; the import is idempotent, so a retried import does not duplicate marks (SKO-412).
4. Never re-run the reset during a session. It deletes the demo state you are in the middle of.

## 4. Audience asks (keep them separate)

- **Schools:** a scoped pilot with a named school champion, agreed measures (teacher task time, scan corrections, family action completion) and a conversion conversation.
- **Partners:** introductions, local implementation and support capability, with clear responsibilities.
- **Investors:** the buyer segment, measured adoption, costs and retention signals as they exist, and milestone-based use of funds. Any funding amount is an aspiration, not a result.

Suggested line: "Seeking pilot schools and an implementation partner."

## 5. Launch review (before any public use)

- [ ] Every link in the deck, site and handouts opens the intended page.
- [ ] Pricing and entitlements match the product: run `npx tsx scripts/check-commercial-contract.ts` and compare with the marketing site.
- [ ] Arabic copy, PDFs and captions reviewed by a native speaker.
- [ ] Contact routing (form, email, WhatsApp) reaches a monitored inbox.
- [ ] Current event details rechecked on the official LEAP site.
- [ ] Every claim in the materials appears in `claims-register.md` with evidence, date and permission, or is marked as a target.
- [ ] Two timed rehearsals from reset, EN and AR, with matching fingerprints and end states, plus one rehearsed network failure.

## 6. The five-minute arc (SKO-507, plan §10)

Reset with the arc's pre-seeded data: `DEMO_PASSWORD=<12+ chars> DATABASE_URL=<demo database> npx tsx scripts/demo/reset-demo-tenant.ts --leap`. The manifest gains a `leap` block: 12 Grade 7 A learners, the Gases check paper and two released earlier sittings.

**Pre-seeded by `--leap` (say so if asked):** six extra synthetic Grade 7 A learners with accounts; an approved "Gases check" paper whose second item is ambiguous (Nitrogen against Air); two earlier released sittings (six and three weeks before the demo) whose marked scripts are written as fixtures. These are the Exam Twin's evidence and Item Watch's example. Nothing else is seeded.

Every beat carries one label. **LIVE**: the product does it on stage. **RECORDED**: play the labelled clip and say it is a recording. **PLANNED**: built later or needs a service the demo environment does not have; describe it, do not show it.

| Time | Beat | Label | Rehearsed by |
|---|---|---|---|
| 0:00 | Office requests every paper in one click; the Papers ledger lists each one | LIVE | arc spec |
| 0:20 | The teacher's Exam Studio shows the next step | LIVE | arc spec |
| 0:40 | Syllabus Drop from a photographed syllabus | PLANNED here (needs the AI provider and a camera); RECORDED once a clip exists | — |
| 1:20 | HOD countersigns the coverage | LIVE | slice 1 suite |
| 1:35 | Blueprint fills from the provider; Paper DNA strip | PLANNED here (needs the AI provider); the paper is authored from the approved source in rehearsal | slice 1 suite (deterministic DNA) |
| 2:15 | Solver flags "Nitrogen vs Air" | PLANNED (needs the AI provider) | — |
| 2:15 | Exam Twin: expected share per item from this class's earlier released sittings, labelled as an estimate with its sample | LIVE | arc spec |
| 2:45 | HOD signs the paper; the slot reads MODERATED | LIVE | arc spec |
| 2:55 | One seal; the ledger reads SEALED | LIVE | arc spec |
| 3:20 | Control room board | LIVE | arc spec |
| 3:20 | Cable pull and reconnect on the candidate laptop | LIVE | slice 4 suite (offline answer, reconnect and reload; also uncertain-response extension retry) |
| 4:00 | Script Stream of a photographed marked pile | PLANNED here (needs the camera and reader); RECORDED once a clip exists | slice 3 suite (QR scan, hand-marked scores) |
| 4:30 | Mistake Map → tick one outcome → ten-minute plan → one family note in the guardian's language; "Twin said / class scored" | LIVE | arc spec |
| 4:30 | Item Watch names the seeded ambiguous item on last term's Gases check | LIVE | arc spec |
| 4:50 | Pilot Ledger: the school joins; six tiles, each with its claim id, sample and window | LIVE | arc spec |

The arc spec is `tests/school-ai/exam-studio-s8.browser.spec.ts`: it resets, seeds and runs the arc twice in English and twice in Arabic against a local server, records each beat's label as a test annotation, and stubs nothing. Steps that another slice's suite already drives (authoring the paper, marking the sitting's scripts) are marked FIXTURE in the spec.

```bash
DATABASE_URL=<loopback db> DIRECT_URL=<same> SCHOOL_AI_TEST_ORIGIN=http://localhost:<port> DEMO_PASSWORD=<…> npx playwright test -c tests/school-ai/playwright.sko507.config.ts
```

Words to avoid on stage (claims discipline): "calibrated", "first", "cheat-proof", "learning gains". The Twin and the ledger's PL-6 are estimates; say so.

## 7. Flagship acceptance and role rehearsal

The combined runner covers all eight slices and a separate role matrix. Use a **disposable local database** with all migrations applied, a matching local app server, and a synthetic password. It resets only the labelled demo tenant between suites; do not run another resetting suite against that database at the same time. The app and test process must use the same database and auth secret. Leave external provider credentials empty for this deterministic rehearsal.

```bash
DATABASE_URL=<disposable loopback db> DIRECT_URL=<same> \
AUTH_SECRET=<same synthetic secret as app> DEMO_PASSWORD=<12+ chars> \
SCHOOL_AI_TEST_ORIGIN=http://localhost:3518 \
npx playwright test -c tests/school-ai/playwright.flagship.config.ts
```

The runner writes the HTML report, JSON results and actual screenshots to the ignored `test-results/exam-studio-audit/` directory (override with `EXAM_STUDIO_EVIDENCE_DIR`). Screenshots wait for the boot overlay to leave and include phone, desktop, English and Arabic examples. They are local review material, not files for a product PR. When review is complete, remove screenshots and reports/traces containing their copies before committing if the reviewer requested that cleanup.

| Role | Rehearsed responsibility and boundary |
|---|---|
| Subject teacher / author | Approve a source outline, record taught coverage, prepare/upload a paper, submit it for HOD review and mark assigned learners. Cannot seal or release results with the default teaching grants. Revoked teaching/grants take effect on the next request. |
| Head of department | Review a member's syllabus and moderate the exact paper version. Cannot use the principal's seal. |
| Principal | Request papers, seal after checks, control the sitting, release reviewed online results and explicitly transfer approved marks. |
| Admin / campus admin | Academic lead access is available only while the principal seat is vacant; restoring the principal revokes it. |
| Named exam coordinator | Paper custody, covers and sitting operations; designation does not grant sealing authority. |
| On-duty invigilator | Room board, bounded extensions, notices, pause and integrity signals. Keys, answer scripts, results, learning analysis and recordings stay outside this duty. |
| Student | Own timeline, candidate answers, save/reconnect, extended/paused attempt and released results. No staff authoring or moderation. |
| Parent / guardian | Linked child's published date-sheet change and acknowledgment, released result and permitted family note. Unaffected sibling does not get the change notice. |
| Group admin | Group oversight; no authoring Studio or principal seal. |
| Platform owner | No tenant paper content through Studio or paper endpoints. |
| Accountant / librarian / receptionist / unrelated teacher | Exam content and staff operations are denied. |

### Paper marks now reach the normal gradebook

After attendance, scan and per-question marking, the office opens **Paper marks → gradebook** for that section. The preview shows each candidate, absence, raw paper total, target subject maximum, conversion and outcome score evidence. Exact conversion is the default; a different maximum or fractional raw score needs explicit proportional whole-mark conversion. For example, 3.5/5 becomes 14/20.

Sending requires the same preview hash, an unlocked target and an empty subject gradebook with no generated reports. The operation writes marks atomically with script/version/seal lineage and a durable receipt; retries do not duplicate rows. Source marks/attendance cannot then silently change. Later gradebook corrections appear as drift against the receipt. This does not create fictitious online attempts or publish report cards. Paper outcome totals are score evidence with a sample, not a learning-gain claim.

### Limits of this acceptance

- The browser suite exercises real local UI, API and database paths on synthetic data. Some earlier sittings, historical marked scripts, roster and date-sheet states are labelled fixtures. The suite does not establish production load capacity or pilot impact.
- Live photographed syllabus extraction, AI question generation/solver quality, camera capture and photographed script recognition require their configured providers, storage and devices; this provider-free run does not validate them. Text-paper upload, manual question review, QR scan entry and rubric marking are exercised.
- Paper import recognizes numbered questions, lettered options, stated marks and an answer-key heading. Missing marks produce a warning and a provisional one-mark draft. Arbitrary layouts and embedded diagrams still need human item review and source mapping. Export Word documents to PDF or text before uploading.
- Exception decisions are an auditable desk. A resit, absence or exemption still needs the corresponding scheduling/attendance/marks workflow; the desk does not automatically execute that decision. Record and verify the action before resolving the exception.
- The historical Exam Twin uses released online sitting evidence available at the target sitting's start, including only result revisions available then. It is a labelled estimate. Paper transfer exposes its own outcome evidence; it does not fabricate online history for the Twin.
- Item Watch needs an adequate sample and meaningful score variation. Pilot Ledger calculations use consent and a named observation window; synthetic figures are demonstration values, not funding traction or measured improvement.
- Patentability and exclusive novelty have not been established by implementation or these tests. Do not describe the feature as patented, the first, or unique without separate supporting evidence.

### Local audit evidence (2026-10-25)

The audit closes the saved-solver gap: under `BLOCK_DISAGREEMENT`, current independent-review findings now stop item/paper approval, moderator signing, paper sealing and online assignment. Advisory policy remains advisory. Approval-only revision changes cannot erase findings. A correction or a newer matching recheck updates the evidence; the UI explains the next action in English, Arabic and Urdu. Browser acceptance uses an explicitly labelled synthetic solver finding to exercise this gate, not a claim of live model accuracy.

A separate synthetic live-provider audit attempted image extraction. The first request exposed an invalid JSON-mode request format, now fixed with a regression check. The second was refused with HTTP 429 `credit_balance_exhausted`; no successful extraction, outline, generation or solver result was produced. No further provider calls were made, no notifications were sent, and application AI credits were neither charged nor left reserved. Restore the configured API account's credits before rerunning this live acceptance. Camera hardware, photographed script recognition and model-quality acceptance remain unverified.

Provider quota failures now persist a safe error code and show recovery guidance in English, Arabic and Urdu. The known failed disposable job was reclassified from the observed provider response to capture the corrected UI without another provider request. The private original remains available for manual transcription.

Scanned syllabus and paper intake now resume the saved source and its extraction job. Failed/ready jobs stop the syllabus spinner; polling has a fixed deadline. Applying an extraction is explicit and preserves missing physical pages and uncertain regions for review. Paper creation requires the reviewed source version and locks source validation through insertion. The syllabus-only outline endpoint rejects other document kinds before provider access. Browser fixtures exercise queued, failed and ready extraction states with real local uploads and synthetic results; these validate recovery and review controls, not OCR accuracy.

Local validation passed 40 browser scenarios across all eight slices and the role matrix, 501 School AI unit tests, touched-file lint, and the production build including TypeScript, commercial, UI and capability checks. The screenshot gallery is ignored review evidence and is removed after the reviewer's requested image review. These checks do not replace the live-provider and device acceptance listed above.


### Table and phone review (2026-10-26)

Paper sitting, gradebook preview/receipt, live room, Mistake Map, rehearsal, parallel forms, Exam Twin and results comparisons use the shared table styling. Headers, numeric columns, row spacing and status labels are consistent. Wide operational tables keep their identifying column while scrolling; gradebook rows become individual cards on phones. Absence has its own column, separate from pupil identity. Opening marks focuses the first question; saving or closing returns keyboard focus to that pupil. Transfer drift shows the current gradebook mark beside the immutable transferred mark.

The focused browser rehearsal covers slices 3, 4, 5 and 8 (15 scenarios), including 390px English/Arabic gradebook preview and receipts, no page overflow, keyboard focus restoration, marking, transfer, retries, live-room actions and earlier/later evidence. Dedicated table and evidence captures avoid clipping inside the app's scrolling panels. UI refinements do not change the provider and device acceptance limits above.
