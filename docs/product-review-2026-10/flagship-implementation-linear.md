> **Archived tracker note (29 October 2026):** Linear (SKO-) is now a read-only archive; Jira SKAI is the tracker of record (decision D6, `docs/product-review-2026-10/d6-tracker-of-record.md`). SKO references and Linear statuses below are historical. See `docs/archive/linear/` for the export and open-item crosswalk.

## 15 October 2026 implementation supplement — SKO-408 remains in progress

Implemented a concrete exam-delivery increment on the existing workspace and design system. This does **not** close SKO-408 or represent completion of its full assessment-to-recovery loop.

### Delivered increment

- Dedicated Exam Studio introduction/workspace entry and interactive candidate exam UX: question map, focus view, mark-for-review, progress, explicit save and final submission summary. The introduction is explanatory; it does not claim unseen services are complete.
- Server-enforced application boundary for an active eligible candidate: unrelated page reads redirect; unrelated APIs and all disallowed write methods return 409. Submission, server deadline or withdrawal of exam access releases the boundary. Competing exam starts serialize per account. Allowed routes retain current authentication and domain authorization. Session status exposes the current active exam URL for cached-navigation recovery.
- Explicit required-camera school policy and a reasoned, approved learner exemption. The timer cannot start through the normal flow until required-camera readiness and the notice are acknowledged. Browser readiness is a report, not device attestation. Capture failures preserve answer saving/submission and provide recovery.
- Bounded, idempotent browser observations and a scoped human review desk. Eight event types, enum-only metadata, 600-event cap per attempt, 200-row cursor pages and individual-event refresh. Human decisions require current grants, a reason and a current version. Observations are immutable; reviews are audited. There is no automated misconduct finding, score penalty, or publication action.

### Verified backend acceptance

1. **Boundary:** with an in-progress exam, try student home, pricing, AI insights, chat, another exam, dotted API paths and a Server Action POST. Page reads redirect; writes/APIs return `EXAM_SESSION_ACTIVE`; exact exam saving, session status and logout remain available. Submit and repeat: ordinary navigation becomes available. Page redirects and session responses are noncacheable.
2. **Race/recovery:** start two assignments simultaneously; one eligible active attempt succeeds. Concurrent observation/submission preserves the final answer sequence and timestamp. After expiry, the server releases navigation independently of the browser timer. Removing assignment membership denies the exam and allows an eligible replacement assignment.
3. **Required camera:** no readiness/notice or an incorrect notice version fails before attempt creation. Valid readiness starts the attempt; an approved exemption starts without a camera report. These API assertions do not prove physical capture continuity.
4. **Evidence and human review:** replay the same event without duplication, reject a conflicting replay, reject another learner/unassigned teacher, and exhaust the cap without losing answer submission. Read all 600 events without gaps/duplicates. Teacher-owner view and explicit review grants, administrator review, principal review and immediate permission revocation are verified. A stale conflicting review returns 409; exact retry succeeds; answers and marks remain unchanged.

Tests completed at this supplement's backend checkpoint: **8 new integration tests passed**, **9 existing proctor integration tests passed**, **4 real HTTP tests passed**, and **17 pure boundary/schema plus assessment tests passed**. An additional native-history browser regression verifies hydrated exam restoration with server-saved answers. Focused ESLint and TypeScript compilation passed. Camera, responsive layouts and review-desk browser verification have separate frontend evidence and must be recorded with their final results; the HTTP suite alone is not evidence for those interactions.

Native history was independently verified on both development and an isolated production build. A Next16 development HTML-cache/debug-stream reuse defect was diagnosed through browser network evidence and corrected with a development-only fresh redirect query; production keeps canonical URLs and no-store. No browser-history trap or operating-system restriction was introduced.

### Still planned / release gates

- Full evidence → teacher-owned Learning Action → family delivery/confirmation → comparable reassessment → outcome proof remains shared work with canonical SKO-425. The new UI and integrity controls do not implement that entire loop or establish learning gains.
- Curriculum/language cohorts, real SIS/LMS connector contracts, representative AI evaluation sets, curriculum-validity/moderation results, measured adoption/time savings and paid pilot/commercial evidence remain validation work. Do not claim global curricular equivalence, defensible novelty or investment readiness from this increment.
- Standard browsers cannot lock the operating system or another device. Observation absence/presence is not proof of misconduct. Any managed-device lockdown needs a separate deployment contract.
- Existing media has its own 1–7-day expiry/purge path. **New integrity metadata, review reasons and audit copies do not yet have a timed purge.** Agree a finite school policy, implement deletion/redaction including audit copies, publish the notice and test expiry before using this new metadata with real learners.
- Additive schema SQL was applied only to the isolated local database. Remote migration, deployment, production monitoring and production learner validation were not performed.

Implementation evidence: `src/proxy.ts`; `src/app/api/auth/session/route.ts`; `src/lib/school-ai/exam-boundary*.ts`; `exam-integrity*.ts`; `exam-service.ts`; `exam-proctor.ts`; `src/app/api/school-ai/exams/[id]/integrity/route.ts`; `prisma/migrations/20261015160000_school_ai_exam_integrity/migration.sql`; `tests/school-ai/exam-boundary*`; `exam-integrity.database.test.ts`; `exam-proctor.database.test.ts`.

Detailed local handoff: `/Users/angular_dev_15/Downloads/skoolee-ai/docs/product-review-2026-10/exam-security-implementation.md`. Product/source audit: `/Users/angular_dev_15/Downloads/skoolee-ai/docs/product-review-2026-10/flagship-audit.md`.


### Final production verification — 15 October 2026

Final isolated production build passed. The final combined production browser run passed 38 cases: boundary 5, required camera 8, optional capture 6, integrity desk 8, real Studio introduction 6, Studio shell 5. These repeat the development scenarios against the final production build; they are not additional distinct cases. Synthetic fixtures and disposable local PostgreSQL only; no remote migration or deployment. See README.md for evidence and remaining release gates. SKO-408 remains in progress and SKO-471/472/473 remain specified backlog features.
