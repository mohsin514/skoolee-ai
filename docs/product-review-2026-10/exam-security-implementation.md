# SKO-408 application boundary and integrity implementation

Implementation review, 15 October 2026. This supplements the product audit and describes the backend delta built during this review; it does not represent completion of the full flagship or production approval.

## Delivered behavior

- A candidate with an eligible, active exam can request only that exam's delivery endpoints, authenticated session status, logout, and required application assets. Other page reads redirect to the active exam; other APIs and nonread requests, including Server Actions, return `409 EXAM_SESSION_ACTIVE`. The decision uses current database state, before public-path and dotted-file shortcuts. Database lookup failure returns 503 rather than opening unrelated application routes.
- Submission or the server deadline releases the next request. Withdrawn assignment or pupil membership releases the navigation restriction while domain authorization denies the now-inaccessible exam. Competing exam starts serialize on the current account and admit only one eligible active attempt. An expired or withdrawn older attempt cannot strand a new eligible assignment.
- `GET /api/auth/session` returns an authenticated `activeExamUrl` or null with `Cache-Control: private, no-store`. The frontend uses it to restore the exam from cached navigation and history. This endpoint does not replace the server request boundary.
- Schools can explicitly require camera recording before the timer starts. Policy requires enabled camera capture and private media storage. A new attempt requires the browser's readiness report and recording notice version; an approved, reasoned camera exemption removes that gate. A resumed attempt remains resumable. The browser report is spoofable and is not hardware attestation.
- Candidates report only eight bounded observation types: page hidden/visible, window blurred/focused, camera started/ended/unavailable, and upload failed. Details contain only a bounded reason enum. Arbitrary URLs, browsing history, images, raw video, and an automatic misconduct verdict are rejected by this API.
- Each event has an idempotency key; conflicting replay is rejected. An attempt can retain at most 600 observations. The event path serializes separately from the answer sequence, and limit/observation failure does not reject otherwise valid answer saving or submission.
- Current authorized staff can inspect a cursor-paginated event history and refresh one scoped event by ID. Review requires current edit grants, an explicit human decision and a reason. Optimistic version conflicts preserve the existing decision. Original observations are immutable at the database level; review history is audited. Review never updates answers, scores, result publication, or sanctions.

## Backend contracts

`GET /api/school-ai/exams/:id/integrity` returns `events`, `summary` (`total`, `pending`, `followUp`, `truncated`), `canReview`, and `nextCursor`. Pages contain at most 200 events ordered by received time and ID. `?cursor=` loads older scoped rows. `?eventId=` loads one current scoped event; it cannot be combined with a cursor. Unknown or out-of-scope keys return 404.

`POST` accepts `{ attemptId, clientEventId, kind, observedAt, details }`. `clientEventId` is a UUID. `details.reason`, when present, is one of `PERMISSION_DENIED`, `DEVICE_UNAVAILABLE`, `TRACK_ENDED`, `NETWORK`, `UPLOAD_REJECTED`, `UNKNOWN`. Server receipt time is distinct from untrusted browser observation time. Event retries can replay exactly after the attempt ends; new events require an in-progress unexpired attempt.

`PATCH` accepts `{ eventId, version, decision, reason }`. Decisions are `DISMISSED`, `NOTED`, `FOLLOW_UP`; they are observations workflow states, not misconduct findings. Reasons require 3–2000 characters. An exact successful retry is idempotent; a conflicting stale review returns 409.

All integrity responses, including errors, are private and noncacheable. Mutations require same-origin requests and current authenticated scope. POST additionally has a bounded request body and per-candidate/assignment rate limit.

`POST /api/school-ai/exams/:id/attempt` additionally accepts `cameraReady` and `consentVersion`. The legacy notice identifier `optional-video-v1` is retained for compatibility; required-camera explanatory copy is a separate UI responsibility. Approved accommodation records accept `cameraExempt` alongside their existing approver, reason, and approval time.

## Authority and limits

- The boundary is within Skoolee. A normal browser cannot prevent other applications, devices, tabs, screenshots, operating-system navigation, or a user modifying client code. A managed kiosk/secure browser would require a separate operational product contract.
- Teacher access remains restricted to the current assigned subject/class and an exam they own. The default teacher can view; reviewing also requires current `ai.edit` and `exams.edit` grants. Principals, campus managers and administrators remain subject to their current campus and permission grants; a role label alone is insufficient.
- Browser events and camera interruptions are unverified observations. Accessibility tools, permissions, device failure and connectivity can explain them. Staff must review context; this implementation makes no automated cheating inference.
- The camera start gate validates reported readiness and policy, not continuous capture or identity. Capture failure during an attempt must keep answer saving/submission available and provide recovery and a staff-contact path.
- Media already has a separate 1–7-day retention policy and purge path. **Integrity event metadata, review reasons, and the corresponding audit entries currently have no time-based purge.** Attempt/assignment deletion cascades the event rows; copied review reasons in AuditLog survive until separately removed or the school is deleted. Neither behavior is a finite retention policy. A school-approved finite retention period, retention notice, audited purge job, and verification that audit copies of review notes are also removed/redacted are a release gate before real learner deployment of this new metadata. Do not claim media expiry covers these records.
- Logging an observation does not prove it occurred as reported; absence of observations does not prove compliance. Neither should be represented as a confidence score for misconduct.

## Source locations

- `src/proxy.ts`, `src/lib/school-ai/exam-boundary.ts`, `exam-boundary-service.ts`: canonical allowlist and authoritative active-attempt lookup.
- `src/app/api/auth/session/route.ts`: authenticated current active exam URL for cached-navigation recovery.
- `src/lib/school-ai/exam-service.ts`, `exam.ts`, `exam-proctor.ts`: account-level start serialization, camera readiness/exemption contract.
- `src/lib/school-ai/exam-integrity.ts`, `exam-integrity-service.ts`, `src/app/api/school-ai/exams/[id]/integrity/route.ts`: observation and review API.
- `prisma/migrations/20261015160000_school_ai_exam_integrity/migration.sql`: additive event table, composite scope relations, tenant RLS, constraints and immutable-observation trigger. `schema.prisma` and `tenant-models.ts` have minimal related additions.

## Validation and migration status

The migration was applied only to the isolated local PostgreSQL test instance on port 55438. No remote database migration or deployment was performed. The local instance has no Prisma migration ledger, so only this additive SQL file was applied directly; production migration order and rollback/recovery remain deployment work.

Verification performed:

- Pure boundary/schema and existing assessment tests: 17 passed.
- New backend integration suite: 8 passed. Covers scoped and immutable observation storage, idempotency, human review/version conflicts, 600-event limit and complete pagination, withdrawn membership, cross-assignment start race, concurrent final submission without changing answer timestamps, camera start/exemption, and current teacher/principal permissions.
- Existing proctor database regression suite: 9 passed, including private media scope, expiry, deletion, ownership, simultaneous capture sessions and clip retries.
- Real HTTP suite against localhost:3106: 4 passed. Covers pages, public URLs, unrelated AI/chat APIs, dotted paths, spoofed role headers, another exam, Server Action POST, RSC prefetch redirects, session URL/no-store, submission release, server deadline release, stale access-version rejection, logout, observation POST, student review denial and authorized staff review without mark changes. A fifth permanent browser regression verifies native history restores a hydrated exam and server-saved answers.
- TypeScript compilation and focused ESLint passed after the backend changes. Frontend history/camera/desk browser flows are verified separately by their implementation owners.

The database tests deliberately provoke serialization conflicts and verify safe retries. Their Prisma conflict logs are expected when final assertions pass; no failing assertion is treated as a passed test.

## Native history diagnosis and development-only cache correction

A real Chromium native Back traversal first requests `/student`, then follows the active-exam 307. In Next 16.2.3 development mode, `node_modules/next/dist/server/base-server.js` unconditionally replaces document Cache-Control with `no-cache, must-revalidate`, overriding Proxy's no-store. CDP confirmed that Chromium reused the previous exam HTML from disk cache, including its old `__next_r` request ID. Next's development React debug channel had already consumed that request's stream, so the new document displayed server skeletons without completing hydration. A fresh reload worked. This was reproduced independently with camera disabled.

An isolated production build on localhost:3107 used noncacheable HTML, fetched a fresh document, and hydrated after Back normally. The development-only boundary redirect now adds a fresh, nonsecret `_exam_resume` UUID query to avoid reuse of that consumed debug document. Production retains the canonical URL. The route allowlist and client guard compare pathnames, and no browser history cancellation, repeated history insertion, OS restriction or third-party navigation interception was added. Independent CDP verification confirmed a fresh development document/debug ID and successful hydration after this correction. Production candidate responses explicitly retain private no-store.

## Follow-up implementation audit — 15 October 2026

The candidate boundary now verifies the live login session and current principal before looking up or disclosing an active assignment. Revoked, expired or stale claims receive a generic noncacheable denial or sign-in redirect without an exam URL or deadline.

The additive `20261015170000_audit_log_campus_scope` migration adds campus scope to audit history and safely backfills existing integrity-review copies from their event. New review copies write that campus atomically with the review. Campus-limited history queries exclude other-campus and unknown legacy rows; a campus role without a campus is denied. School-wide administrators retain school-scoped access. Broad legacy mutation coverage, audit exports and finite lifecycle/purge policy remain SKO-476/SKO-447 work.

Required-camera copy no longer claims recording is universally optional or unable to affect admission. The preflight still explains consent, short clips, retention of media, approved alternatives and the fact that observations do not automatically change marks. Continuous forensic recording and operating-system lockdown are not established by these changes.
