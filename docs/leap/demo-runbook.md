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
| 3:20 | Cable pull and reconnect on the candidate laptop | LIVE on stage (manual) | slice 4 suite (board states) |
| 4:00 | Script Stream of a photographed marked pile | PLANNED here (needs the camera and reader); RECORDED once a clip exists | slice 3 suite (QR scan, hand-marked scores) |
| 4:30 | Mistake Map → tick one outcome → ten-minute plan → one family note in the guardian's language; "Twin said / class scored" | LIVE | arc spec |
| 4:30 | Item Watch names the seeded ambiguous item on last term's Gases check | LIVE | arc spec |
| 4:50 | Pilot Ledger: the school joins; six tiles, each with its claim id, sample and window | LIVE | arc spec |

The arc spec is `tests/school-ai/exam-studio-s8.browser.spec.ts`: it resets, seeds and runs the arc twice in English and twice in Arabic against a local server, records each beat's label as a test annotation, and stubs nothing. Steps that another slice's suite already drives (authoring the paper, marking the sitting's scripts) are marked FIXTURE in the spec.

```bash
DATABASE_URL=<loopback db> DIRECT_URL=<same> SCHOOL_AI_TEST_ORIGIN=http://localhost:<port> DEMO_PASSWORD=<…> npx playwright test -c tests/school-ai/playwright.sko507.config.ts
```

Words to avoid on stage (claims discipline): "calibrated", "first", "cheat-proof", "learning gains". The Twin and the ledger's PL-6 are estimates; say so.
