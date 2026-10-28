# SKAI-833 — UX reliability rollout and measurement contract

## Outcome

Every supported role can complete its highest-frequency work with a clear next step. Entered work remains recoverable through refresh, navigation, slow or lost connectivity, rejected saves, duplicate submits, permission changes, and session expiry. A saved result is visibly confirmed; a pending result is never presented as complete.

This document is the implementation and QA contract. It does not claim that representative pilot sessions have already happened.

## Role and journey matrix

| Role | Workspace | First journeys to measure and harden |
| --- | --- | --- |
| App owner | `/owner` | provisioning, subscription, capacity, AI governance, pilot evidence |
| Super admin | `/super` | group policy, cross-campus analytics, institution controls |
| Campus admin / Admin | `/admin` | members, admissions, campus setup, timetable, configuration |
| Principal | `/principal` | improvement evidence, approvals, reports, staff and learner oversight |
| Teacher | `/teacher` | attendance, assignments, marks, timetable, reports, support actions |
| Parent | `/parent` | results, fees, attendance, timetable, assignments, messages, pickup |
| Student | `/student` | assignments, timetable, results, accommodations, AI exams |
| Accountant | `/accountant` | fee collection, ledger, payment methods, finance reports |
| Librarian | `/librarian` | circulation, catalog, reservations, fines |
| Receptionist | `/receptionist` | admissions, visitors, postal items, family requests |

Shared journeys are `/onboarding`, `/messages`, `/care`, `/identity`, `/service-desk`, `/billing`, `/corrections`, `/resources`, `/search`, and `/school-capture`.

## Reliability contract for every task

Before a session, the script names the actor, input, expected server outcome, prohibited shortcut, tenant, campus, locale, device, and network condition.

During the task, capture active work time plus review/correction time, server response, whether help was requested, and whether the user was assisted. Wall-clock time is reported separately.

Each write must expose these states in the UI:

1. Editing: the current draft is recoverable and the next action is clear.
2. Saving: controls prevent accidental duplicate submission while preserving edits.
3. Confirmed: the server outcome and recipient/scope are explicit.
4. Pending: the work is queued or awaiting a provider; it is not called complete.
5. Failed: the entered work remains available with retry and a plain explanation.
6. Conflict or revoked access: the draft is preserved, the changed fields are shown, and the user can keep the server value, keep the draft, or leave safely.

## Required coverage

- Two synthetic schools and two campuses, including a denied role and a stale-version or duplicate-submit case.
- English plus Arabic or Urdu RTL, keyboard-only navigation, phone and desktop viewports, and a slow or interrupted network.
- Refresh, back navigation, sign-out, session expiry, permission revocation, rejected save, provider failure, and retry.
- Outcomes reported as independent success, assisted success, abandonment, or incorrect result.
- Notes and recordings use synthetic records only, with explicit permission and a retention date.

## Existing foundation to reuse

- `src/lib/hooks/use-form-draft.ts` and `src/lib/drafts/store.ts`: session-scoped, allowlisted drafts with expiry, conflict review, and session fencing.
- `src/components/ui/draft-recovery.tsx`: review, merge, discard, and navigation guard UI.
- `src/components/offline/offline-register.tsx`: durable offline capture, idempotent sync, conflicts, and sign-out protection.
- `src/components/teacher/sticky-save-bar.tsx`: dirty counts, save/discard, blocked reasons, and keyboard save.
- `src/lib/network/connection.ts` and `src/lib/network/intercept-fetch.ts`: network state and retry behavior.

## Implementation sequence

1. Audit each role's five highest-frequency journeys against the reliability contract and record demonstrated gaps.
2. Apply the shared draft/retry/conflict pattern to the first gap in each role family: academic, operations, family, finance, library, reception, care, and AI.
3. Add focused browser checks for refresh, rejected save, duplicate submit, permission change, RTL, keyboard, and mobile behavior.
4. Run the same tasks with representative pilot users; publish paired baseline/follow-up findings with denominators and missing cases.
5. Link each finding to one owner issue and retest only equivalent difficulty after the targeted fix.

## Measurement rules

Use `src/lib/pilots/findings.ts` for paired baseline/follow-up analysis. A percentage requires at least five comparable, complete, non-synthetic pairs. Report active plus correction time, median change, sample size, assisted work, missing data, exclusions, and elapsed time separately. Do not convert unknown or target values into measured outcomes.

## Closure evidence

The ticket is ready for review only when the implementation commit, environment, role, school/campus, locale, device, network condition, server outcome, screenshots, test commands, reviewer, and date are recorded. A failed observed retest remains open and is linked as a blocking defect; local automated passes cannot close it.

## Current handoff status (2026-10-28)

The current implementation slice is pushed in PR #152 at commit `03098101`. Local validation is recorded truthfully as follows:

- `npm run lint` and `npm run typecheck` pass.
- `npm run test` is blocked in this environment by a `pnpm` `EPERM` while opening a temporary dependency path.
- `npm run build` reaches Prisma generation, then is blocked by a `tsx` IPC-pipe `EPERM`.
- `npm run test:isolation`, `npm run i18n:check`, `npm run size:check`, and `npm run test:e2e:smoke` are not defined in this checkout.
- The family browser suite still requires the isolated database at `127.0.0.1:55438/postgres`.

The following workflow families remain explicit implementation or evidence gaps: reception visitors, phone calls, complaints, and certificates; dormitory allocations; admin admissions and quick-create panels; owner provisioning and subscription review; and library copy registration. These forms currently rely on local state and direct requests, so refresh/navigation recovery has not been demonstrated for them.

Representative pilot measurements, bilingual/mobile/keyboard browser evidence, screenshots or recordings, PR checklist completion, remote check status, and Jira transitions remain outstanding. Jira must remain out of Done; QA owns that transition after reviewing equivalent evidence.
