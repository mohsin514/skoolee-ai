# SKAI-651 (PM-25.10) Accessible paper delivery: gap record and build contract

Status: gap confirmed on origin/temp (2026-11-13). Not built yet; this file fixes the contract so the build can start without re-triage.

## What exists
- `src/app/api/school-ai/exams/[id]/accommodations/route.ts`: GET lists accommodations, PATCH approves, POST applies a live extension.
- `src/lib/accommodations/service.ts`, `plan.ts`: plan versions (ACTIVE / SUPERSEDED / REVOKED), review window, rehearsal, live deadline extension.

## What is missing (acceptance criterion 2)
No accessible-paper delivery record: no queued / sent / failed status, no idempotent delivery, no bounded retry, no receipt or error detail.

## Proposed contract (default decisions, to be confirmed by product)
1. A delivery is an accessible paper file (large print, screen-reader PDF, braille-ready) generated from the approved plan version for one student and one exam session. In-app only; no email/SMS/WhatsApp (avoids messaging code-owner scope).
2. Audience: support coordinator and exam staff of the same school and campus. Students never receive another student's file.
3. Model (additive migration): `AccommodationPaperDelivery { id, schoolId, campusId, examId, studentId, planVersionId, format, status QUEUED|SENT|FAILED, attempts (max 3), idempotencyKey unique per schoolId, receiptAt, errorCode, createdAt, updatedAt }`. Error codes only; no recipient data in error text or logs.
4. Routes: `POST /api/school-ai/exams/[id]/accommodations/deliveries` (Idempotency-Key header, replay returns the existing row), `GET` same path. Capability-inventory row + purpose predicate; two-school, two-campus and denied-role tests.
5. UI: status chip and receipt in `src/components/school-ai/exam-accommodations.tsx`, EN/UR/AR keys.
6. Pre-live gate: an exam session with an approved alternative-delivery plan shows a warning until its delivery is SENT.

## Human actions
- Product confirms or changes decisions 1-2 above.
- QA runs journey J04 on dev with the evidence named in the ticket.
