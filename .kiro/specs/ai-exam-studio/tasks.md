# Implementation Plan: AI Exam Studio (SKO-408)

## Overview

Implementation language is **TypeScript** — the design specifies TypeScript modules, Zod schemas and Prisma models directly, so no language choice is open.

The plan follows the design's four shippable slices. Each slice leaves the repository green against named commands and demonstrable through the Studio Workspace:

1. **Slice 1 — authoring, rehearsal, sealed release.** Includes the `DELIVERY_POLICY` record kind, because slice 1 needs `separationOfDuties` (R2.4) and `maxForms` (R10.1) from it. No managed client required.
2. **Slice 2 — Exam Room boundary and integrity signals.**
3. **Slice 3 — control room, incident and remedy flow, learning recovery, evidence packs.**
4. **Slice 4 — Managed Exam Mode admission,** whose shipping claim is gated behind the SKO-449 real-device gates.

Three cross-cutting concerns are placed deliberately rather than deferred:

- **The Studio shell, the status vocabulary and the Studio_Intro land in slice 1 (task 3)** — they are the first thing a viewer sees — and each later slice enriches the shell with its own space rather than rebuilding it.
- **EN/AR/UR copy, RTL direction and accessibility are part of each UI task's acceptance**, never a single late task. The two e2e sweeps (tasks 18.3, 26.1) confirm coverage; they do not create it.
- **The demo dataset script is an opt-in, reversible script (task 25)** that never applies a migration.

### Verification commands

Every task below cites one of these, or a named new test file run by one of them:

| Command | Covers |
| --- | --- |
| `npm run test:school-ai` | `tests/school-ai/*.test.ts` excluding `*.database.test.ts` — pure domain, no I/O |
| `npm run test:school-ai:db` | `tests/school-ai/*.database.test.ts`; refuses to start unless `DATABASE_URL === DIRECT_URL` and the host is loopback |
| `npm run test:school-ai:e2e` | `tests/school-ai/*.browser.spec.ts` only — see the naming note below |
| `npm run check:ui` | `tests/design-system/adoption.test.ts` |
| `npm run lint` | `eslint` |
| `npm run build` | `prisma generate` → `check:commercial` → `check:ui` → `next build` |

**Naming correction carried into every e2e task.** `tests/school-ai/playwright.config.ts` sets `testMatch: "*.browser.spec.ts"`. The design document named e2e files `exam-studio-*.spec.ts`, which that matcher would not collect. Every e2e file in this plan is named `exam-studio-*.browser.spec.ts` so `npm run test:school-ai:e2e` actually runs it.

### Migrations are operator-applied

`DATABASE_URL` in this environment points at a **remote Supabase pooler**. For all six migration tasks:

- The task author writes `prisma/schema.prisma` and the `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql` directory, then runs `npx prisma generate` and `npm run build` locally.
- **An operator applies the migration with `prisma migrate deploy` against a named, reviewed target.** No application code path, no worker, no cron, no route handler and no script applies a migration.
- **The demo dataset script never applies a migration.** It checks `_prisma_migrations` for the six directory names and exits with instructions if the target schema is behind (task 25.1).
- Database tests run only against a disposable loopback database, enforced by `scripts/run-school-ai-tests.mjs`.
- Timestamps continue from the latest applied migration, `20261013141000_school_ai_assistant_catalog`.

### Framework documents

Tasks marked **[read next-docs]** must re-read the named guides under `node_modules/next/dist/docs/` before writing code, per `AGENTS.md` and the design's "Framework constraints" table. The installed Next.js is 16.2.3: Middleware is renamed Proxy, `context.params` is a promise, Route Handlers are uncached by default because `next.config.ts` does not set `cacheComponents`, and a streamed response cannot change its status after the first chunk.

### Property tests

The design adds **no property-based-testing dependency**. Each of the 40 correctness properties is one test driven by the seeded deterministic generators in `tests/school-ai/exam-studio-generators.ts` (task 1.6), running **at least 100 iterations over a fixed seed list**, printing the failing seed and shrunk input so any failure reproduces as a plain unit test. Each property test carries the tag comment `// Feature: ai-exam-studio, Property N: <title>`.

## Tasks

- [x] 1. Shared foundations, determinism fix and the authority matrix

  - [x] 1.1 Extract canonical serialization and fix the `localeCompare` determinism defect
    - Create `src/lib/school-ai/canonical.ts` exporting `canonicalJson`, `canonicalDigest`, `normalizeForHash` and `legacyWorkspaceRequestHash`
    - `canonicalJson` sorts keys by **code unit** (`a < b ? -1 : a > b ? 1 : 0`), not `localeCompare`, so an independent verifier can recompute a digest outside Skoolee AI
    - `normalizeForHash` applies `\r\n`/`\r` → `\n`, trailing space and tab removal per line, Unicode NFC — **to hash input only, never to stored or rendered content**
    - **Must-fix, not inherit:** `src/lib/school-ai/repository.ts:40` sorts with `a.localeCompare(b)` and `repository.ts:43` feeds it into `workspaceRequestHash`, whose output is persisted in `SchoolAiRecord.requestHash` and compared against stored rows. Move that function to `canonical.ts` as `legacyWorkspaceRequestHash` with its `localeCompare` behaviour **unchanged**, and re-export it from `repository.ts` under its existing name so no call site changes and idempotency replay on existing rows keeps working
    - _Requirements: 8.2, 19.3, 25.10_
    - Verify: new `tests/school-ai/exam-studio-canonical.test.ts` via `npm run test:school-ai`, asserting code-unit order differs from `localeCompare` for a key pair where ICU collation disagrees, and that `legacyWorkspaceRequestHash` reproduces a known stored hash byte-for-byte

  - [x] 1.2 Build the frozen studio authority matrix
    - Create `src/lib/school-ai/studio-access.ts` with `StudioRole`, `StudioAction`, the frozen `STUDIO_AUTHORITY` allow-list, `studioRolesFor`, `assertStudioAction` and `recordStudioAction`
    - Compose over the existing primitives (`isSchoolAiManager`, `getAssignedWorkspaceSubjects`, `loadWorkspacePermissionSnapshot`) rather than replacing them; load the permission snapshot inside the same request so a revoked grant is refused on the next request
    - Every refusal criterion is satisfied by **absence** from a role's action set, not by a negative branch
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 27.1, 27.2, 27.3, 27.7, 27.9_
    - Verify: `npm run test:school-ai`

  - [x]* 1.3 Write the property test for the authority matrix
    - **Property 32: The authority matrix decides every studio action**
    - **Validates: Requirements 2.1–2.16**
    - Generated input: the full studio role × studio action cross-product, plus revoked-grant sequences
    - File: `tests/school-ai/exam-studio-authority.test.ts`; verify with `npm run test:school-ai`

  - [x] 1.4 Create the trilingual copy modules and the status vocabulary strings
    - Create `src/lib/school-ai/exam-studio-copy.ts` as the shared index, with the 16-token status vocabulary (`DRAFT`, `NEEDS_SOURCE`, `NEEDS_CORRECTION`, `READY_FOR_REVIEW`, `APPROVED`, `CHANGED_AFTER_APPROVAL`, `STALE`, `BLOCKING`, `ADVISORY`, `SEALED`, `SAVED`, `SAVING`, `UNSAVED`, `SAVE_FAILED`, `GATE_OPEN`, `NOT_MEASURED`) in English, Arabic and Urdu together
    - **Establish the per-area copy convention now:** each later UI task adds its keys to its own `exam-studio-copy-<area>.ts` module re-exported from this index, so no two tasks edit one copy file. Numbered placeholders only; no concatenated English strings
    - Route all copy through the existing `useUiText`/`UiText`/`useLocale` from `src/components/locale/LocaleProvider.tsx`
    - _Requirements: 22.1, 22.8, 22.9, 1.8_
    - Verify: `npm run test:school-ai`

  - [ ]* 1.5 Write the property test for copy completeness
    - **Property 37: Interface copy exists in all three languages and avoids concatenation**
    - **Validates: Requirements 22.1, 22.3, 22.4, 22.8, 22.9**
    - Generated input: every interface message key across the copy index and its area modules
    - File: `tests/school-ai/exam-studio-locale.test.ts`; verify with `npm run test:school-ai`

  - [x] 1.6 Build the seeded deterministic generator fixture
    - Create `tests/school-ai/exam-studio-generators.ts` with an xorshift PRNG, a `SEEDS_100` fixed seed list, and `arbitraryPaper`, `arbitraryResponses`, `arbitrarySaveSequence`, `arbitraryInterleaving`, `arbitrarySignalStream`, `arbitraryTenantPair`, `arbitraryClientDescriptor`, `arbitraryHostileString`
    - Fold the design's edge cases into the generators rather than into separate tests: empty and whitespace-only answers, a 100-item paper, Arabic text wrapping an LTR formula, a numeric answer at the tolerance boundary, a sequence number at the schema maximum, 500 students in one bulk action, four forms with identical blueprints
    - Add no new dependency — `npm run build` gates on the dependency list
    - Reuse `tests/school-ai/assessment-fixture.ts`, `assessment-browser-fixture.ts`, `browser-fixture.ts` and `exam-proctor-fixture.ts` rather than duplicating them
    - _Requirements: 30.2, 30.5_
    - Verify: `npm run test:school-ai`

  - [x] 1.7 Build the Commercial Evidence Register
    - Create `src/lib/school-ai/commercial-evidence.ts` with the claim record (claim text, requirement identifier, cited repository artifact, state of `BUILT`/`PARTIAL`/`EXTERNAL_GATE_OPEN`/`NOT_STARTED`), the named-differentiator list mapped to requirement identifiers, the single-export function and the banned-term scan for `cheat-proof`, `tamper-proof`, `fraud-proof` and `guaranteed detection`
    - Seed every gate from the design's five release gates as `EXTERNAL_GATE_OPEN` with its owning ticket, so no later task can claim a gate it cannot close
    - Record the eight integration contracts of Requirement 29 with owning ticket, consumed record and Exam-Studio behaviour when that record is absent
    - A numeric figure with no recorded measurement renders `not measured`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8, 29.9, 29.10, 30.9, 30.10_
    - Verify: `npm run test:school-ai`

  - [x]* 1.8 Write the property test for the evidence register
    - **Property 39: Capability claims without evidence are recorded as not started**
    - **Validates: Requirements 1.1, 1.2, 1.7, 1.8, 1.9, 29.10**
    - Generated input: claim lists with and without citations, and with open and closed owning gates
    - File: `tests/school-ai/exam-studio-evidence.test.ts`; verify with `npm run test:school-ai`

- [x] 2. Slice 1 migration — release, form sets and exposure

  - [x] 2.1 Write migration `20261014120000_school_ai_exam_studio_release`
    - Add `SchoolAiExamFormSet`, `SchoolAiExamFormRelease` and `SchoolAiExposureEntry`; add `form_set_id` and `form_label` to `SchoolAiExamAssignment`; add the exposure lookup index
    - Follow the established tenant pattern exactly: `schoolId String @default("")`, cascading `School` and `Campus` relations, every compound foreign key pinning `schoolId` and `campusId`, `@@map` to snake_case, indexes led by `schoolId, campusId`
    - Every new column nullable or defaulted, so the migration is a pure `ADD COLUMN` with no table rewrite; no existing column altered or dropped
    - **Operator-applied.** The task delivers the SQL and the generated client; an operator runs `prisma migrate deploy` against the reviewed remote target. Never applied by code, a worker or the demo script
    - _Requirements: 25.10, 30.1, 10.5, 8.1_
    - Verify: `npx prisma generate` then `npm run build`

- [ ] 3. Studio shell, status vocabulary and the Studio_Intro

  - [x] 3.1 Build the single status vocabulary component
    - Create `src/components/school-ai/exam-studio/studio-status.tsx` wrapping the existing `Badge` and `TaskStatus`, rendering each of the 16 tokens as **a word and an icon as well as a colour** so no state is conveyed by colour alone
    - Compose only from `src/components/ui` under `docs/ui-plan/component-contracts.md`; use the existing token values from `docs/ui-plan/tokens-and-styles.md`; introduce no component library, icon set, font family or colour identity
    - _Requirements: 21.1, 21.2, 21.3, 23.9, 24.1_
    - **[read next-docs]** `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/01-getting-started/11-css.md`, `03-architecture/accessibility.md`
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ] 3.2 Build the Exam Studio shell with the seven-space registry and the state union
    - Create `src/components/school-ai/exam-studio/exam-studio-shell.tsx` owning the space router, the scope banner (school, campus, class, subject, sitting) and the single `SpaceState<T>` discriminated union with variants `loading`, `empty`, `ready`, `partial`, `error`, `permission`, `reconnecting`, `recovered`
    - **Create the frozen space registry with all seven entries up front**, each lazily importing its own space module, so every later slice adds only its own file and never edits the registry
    - `empty` renders `TaskFeedback` naming the next action; `loading` renders the existing `Skeleton`; `error` keeps the retained input and offers retry; `permission` names the required permission and carries no restricted data
    - Unsaved, failed-save and failed-submission states render as a **persistent in-page `TaskFeedback` region**, never a Sonner toast alone
    - Set document direction RTL for `ar` and `ur`, LTR for `en`; wrap authored text, option text, maths and code in `<bdi>` with `dir="auto"`; never translate a person name, record identifier, authored item text, server code or candidate response
    - Use `ModalSurface` and its existing layer arithmetic for every dialog including the full-screen rehearsal and control-room surfaces; use the assessment domain tone from `src/lib/ui/module-tones.ts` with the brand hue reserved for primary actions and active navigation; rely on the global `:focus-visible` token with `focus-inset`/`focus-on-dark`, never a screen-level focus override
    - _Requirements: 21.1, 21.2, 21.5, 21.6, 21.7, 22.2, 22.3, 22.4, 24.1, 24.2, 24.4, 24.5, 24.6, 24.7, 24.8, 24.10, 24.11_
    - **[read next-docs]** `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/01-getting-started/11-css.md`
    - Verify: `npm run check:ui` and `npm run lint`

  - [x] 3.3 Build the Studio_Intro motion sequence
    - Create `src/components/school-ai/exam-studio/studio-intro.tsx` with the four-phase sequence at **1100 ms total** against the 1800 ms contractual ceiling, animating only `opacity`, `scale` and `y` so the overlay cannot reflow the workspace
    - Wrap the tree in `MotionConfig reducedMotion="user"` following the existing `src/components/chat/chat-dock.tsx` pattern — the global rule at `src/app/globals.css:723` does not stop Framer Motion
    - Reduced motion renders **a single static assistant mark with no `transform` and no keyframes** (first frame is final frame) with `onComplete` on the next animation frame, so the measured duration is one frame
    - Skip on `pointerdown`, `keydown` and `wheel`/`scroll` via capture-phase listeners that cancel the controls and unmount in the same tick
    - Once per browser session per user via a `sessionStorage` key plus an account preference; `aria-hidden="true"`, no focusable element, `pointer-events: none` from phase 3, no data request; workspace data fetch starts in parallel on mount; an initialization failure is caught by an error boundary that renders the workspace without the intro
    - Rendered only by the shell, which is not in the tree of `/ai/exams/[id]`, the attempt start action, the active control-room view or the print route, so the intro cannot delay or overlay an attempt
    - Use the existing brand tokens, the existing assistant mark and the installed `framer-motion@^11.18.2`; add no new visual identity and no new font
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.11, 20.12, 20.13, 20.14, 20.15, 21.8_
    - Verify: `npm run check:ui` and `npm run lint`

  - [x]* 3.4 Write the Studio_Intro example and reduced-motion tests
    - This is the requirements document's P25, correctly an example rather than a property: duration, skip and exclusion do not vary with generated input
    - Cover every criterion of Requirement 20 including the reduced-motion static mark, the 200 ms reduced-motion completion, skip on each input kind, exclusion from the attempt page and print output, and absence from the deadline computation
    - File: `tests/school-ai/exam-studio-intro.browser.spec.ts`; verify with `npm run test:school-ai:e2e`
    - _Requirements: 20.1–20.15, 30.4_

  - [ ] 3.5 Mount Exam Studio in the existing workspace navigation
    - Add the Exam Studio entry to the existing `/ai` workspace navigation through `src/lib/school-ai/navigation.ts`, preserving the existing permission filtering of workspace tabs
    - _Requirements: 21.10, 27.1, 27.2_
    - Verify: `npm run test:school-ai` and `npm run check:ui`

- [x] 4. Delivery Policy record kind and approval separation

  - [x] 4.1 Build the delivery policy domain module
    - Create `src/lib/school-ai/delivery-policy.ts` with `deliveryPolicySchema`, `validationGateSchema`, `supportedDeviceSchema`, the closed `ADMISSION_REASON_CODES` set, `PLATFORM_DEFAULT_DELIVERY_POLICY`, `admissionDecision`, `openGates` and `managedModeAvailable`
    - `separationOfDuties` resolves R2.4, which has no record today: the platform default is `NOT_REQUIRED`, so an unconfigured school degrades to always-allow **and the interface says which policy source applied**
    - `maxForms` is `z.number().int().min(1).max(4)`, so a school may configure down from 4 but never up
    - `localReleaseSeconds` is bounded `1..120`; `requiredConfigKeyId` stores an identity only and never a key
    - `managedModeAvailable` returns false while **any** gate lacks a dated pass result — fail closed by construction
    - _Requirements: 12.2, 12.7, 12.8, 12.9, 12.10, 10.1, 2.4, 13.4_
    - Verify: `npm run test:school-ai`

  - [x] 4.2 Register the three new record kinds and the approval separation check
    - Extend `allowedWorkspaceKinds` in `src/lib/school-ai/access.ts` with `DELIVERY_POLICY`, `BRIEF` and `PRACTICE` in one edit, and add `assertApprovalSeparation(user, record, policy)` beside the existing `assertApprovalRole`, which keeps its current signature
    - `SchoolAiRecord.kind` is a plain `String` column, so these three kinds need **no migration** and inherit versioning, `APPROVED` status, immutable `SchoolAiRevision` snapshots, campus scoping, compare-and-set on version and audit logging
    - Validate the new kinds in `src/lib/school-ai/repository.ts`
    - _Requirements: 12.2, 12.3, 2.3, 2.4, 25.1, 25.2, 25.3, 25.4, 25.9_
    - Verify: `npm run test:school-ai`

  - [ ]* 4.3 Write the delivery policy storage and approval integration test
    - Policy stored as a versioned record, approved by an Academic_Approver, and governing an attempt only from its approved revision; a policy authored by the approver is refused when `separationOfDuties` is `REQUIRED`
    - File: `tests/school-ai/exam-studio-policy.database.test.ts`; verify with `npm run test:school-ai:db`
    - _Requirements: 12.2, 12.3, 2.4_

- [ ] 5. Assessment brief and the Brief space

  - [x] 5.1 Build the assessment brief domain module
    - Create `src/lib/school-ai/assessment-brief.ts` with `briefValueSchema` as a discriminated union over `CONFIRMED_FACT`, `EXTRACTED_SUGGESTION` and `OPEN_DECISION`, the nine-key `BRIEF_QUESTION_SEQUENCE`, `assessmentBriefSchema`, `nextOpenDecision` and `briefReadiness`
    - A Confirmed_Fact carries the confirming actor, authoritative timestamp and school/campus/class/subject scope; an Extracted_Suggestion carries source record identifier, source version, page or region reference and the exact excerpt, and is always `reviewed: false`
    - Accepting a suggestion converts it to a Confirmed_Fact **while retaining the original suggestion and the acceptance event** in the brief history; a skipped decision stays open; no value is ever derived from conversation text without an explicit confirmation
    - A school default is presented as an Extracted_Suggestion labelled as a school default
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 3.13_
    - Verify: `npm run test:school-ai`

  - [ ] 5.2 Build the brief route handlers
    - `GET /api/school-ai/workspace/[id]/brief` returning `{ brief, openDecisions, readiness }` and `POST` accepting one answer and returning `{ brief, version, next }`
    - Store the brief as a `SchoolAiRecord` of kind `BRIEF`, so a draft persists server-side across sessions and each save writes an immutable revision
    - A failed validation bound returns the specific failed bound **and echoes the entered text** for correction; a version mismatch returns 409
    - Follow the repository's handler shape: `assertSameOrigin`, `requireSchoolAiUser`, `readBoundedJson`, Zod parse, service call, `schoolAiError` in `catch`
    - _Requirements: 3.9, 3.10, 3.12, 3.13, 25.5, 25.6, 27.4_
    - **[read next-docs]** `01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/03-file-conventions/route.md` — `context.params` is a promise and must be awaited; handlers are uncached by default because `next.config.ts` does not set `cacheComponents`
    - Verify: `npm run test:school-ai:db`

  - [ ] 5.3 Build the Brief space
    - Create `src/components/school-ai/exam-studio/spaces/brief-space.tsx` presenting **exactly one Open_Decision at a time** in the recorded sequence, each value with its classification visible, plus the readiness summary listing every remaining blocker
    - Add EN/AR/UR copy in `exam-studio-copy-brief.ts`, RTL-correct, with the entered-text retention and failed-bound message accessible to a screen reader
    - _Requirements: 3.1, 3.2, 3.8, 3.12, 22.1, 22.2, 23.1, 23.2, 24.1, 24.4_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 5.4 Write the property test for brief classification
    - **Property 33: Every brief value holds exactly one classification**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 3.10, 3.11, 3.13**
    - Generated input: arbitrary answered, accepted and skipped subsets over the nine-key sequence
    - File: `tests/school-ai/exam-studio-brief.test.ts`; verify with `npm run test:school-ai`

- [ ] 6. Item review state, staleness and the review desk

  - [x] 6.1 Add the four optional schema fields to the assessment module
    - In `src/lib/school-ai/assessment.ts`, add `review?` to `questionSchema` and `formSet?`, `itemGroupIds?` and `staleness?` to `paperDataSchema`
    - **All four optional**, so every existing stored `paperData` row parses unchanged under `.strict()` and no data migration is needed; `undefined` resolves to `DRAFT`, or `NEEDS_SOURCE` when `sourceRefs` is empty
    - Extend `validatePaperApproval` with the item-review-state check and the figure-staleness check; this is the **single writer** of `assessment.ts` in the plan, so no other task edits it
    - _Requirements: 4.1, 4.2, 4.10, 6.2, 25.10, 30.1_
    - Verify: `npm run test:school-ai`

  - [x] 6.2 Build the item review and staleness domain module
    - Create `src/lib/school-ai/item-review.ts` with `itemReviewStateSchema`, `itemReviewSchema`, `itemStateFor`, the transition rules and `applyStaleness(paper, change)` as a **pure single-pass function over one paper**
    - Item state is a property of a record version, so `SchoolAiRevision`'s existing immutable `data` snapshot satisfies "retain every invalidated observation keyed by the record version that produced it" with no new code
    - Dependency graph is fixed and shallow: prompt/options/marks → key, rubric, semantic observation, item approval; figures → figure check, item approval; superseded source version → `NEEDS_SOURCE`; taught coverage change → section coverage check; any invalid item → form rehearsal result
    - An existing Released_Form is left byte-identical when an upstream value changes after release
    - Each invalidated artifact records the triggering change, triggering actor and authoritative timestamp
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9, 4.10, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
    - Verify: `npm run test:school-ai`

  - [ ] 6.3 Build the review desk, evidence drawer and review-state route
    - `POST /api/school-ai/workspace/[id]/items/[questionId]/review-state` accepting `{ version, state, itemRevision }`, refusing approval without the approver role and refusing an item revision mismatch with 409
    - Create `spaces/review-desk.tsx`, `item-workbench.tsx` and `evidence-drawer.tsx`: the drawer shows the approved source excerpt, page or region reference, outcome mapping, generation record (provider model identifier and generation timestamp), the complete item review history, and the originating paper identifier, version and question identifier for a `reusedFrom` item
    - The workbench shows the per-state item counts for the current form and presents Protected_Key fields **only to roles permitted by Requirement 2**, excluding them from every candidate-facing payload
    - EN/AR/UR copy in `exam-studio-copy-review.ts`; keyboard-operable throughout with accessible name, role and state on every control
    - _Requirements: 4.5, 4.7, 4.8, 4.9, 4.11, 2.1, 2.2, 22.1, 22.2, 23.1, 23.2, 25.4, 25.5_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/01-getting-started/07-mutating-data.md` — a Server Function is reachable by direct POST and must authorize itself
    - Verify: `npm run test:school-ai:db`, `npm run check:ui`

  - [ ]* 6.4 Write the property test for item review state derivation
    - **Property 16: Item review state is derived from the item alone**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
    - Generated input: mutations of every listed item field — prompt, options, marks, key, rubric, model answer, outcome mapping, figures, source references
    - File: `tests/school-ai/exam-studio-items.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 6.5 Write the property test for release blocking on unapproved items
    - **Property 17: A form with any unapproved item cannot be released**
    - **Validates: Requirements 4.10, 7.4**
    - Generated input: papers with random distributions of the six item review states and of `BLOCKING`/`ADVISORY` rehearsal results
    - File: `tests/school-ai/exam-studio-items.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 6.6 Write the property test for transitive staleness
    - **Property 15: Staleness is transitively complete**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.7, 6.9**
    - Generated input: an edit applied to every upstream field of an approved item and of an approved source version
    - File: `tests/school-ai/exam-studio-staleness.test.ts`; verify with `npm run test:school-ai`

- [ ] 7. Streamed generation, single-item regeneration and the Blueprint space

  - [ ] 7.1 Build the generation frame grammar
    - Create `src/lib/school-ai/generation-stream.ts` with `generationFrameSchema` as a strict discriminated union over `stage`, `item`, `error`, `cancelled` and `complete`, plus `encodeFrames` and `decodeFrames` over the Web Streams API
    - The `error` frame carries a bounded reason string and a `retained` count only — **never a provider response body and never a stack trace**
    - _Requirements: 5.1, 5.2, 5.9, 5.12, 24.10, 26.9_
    - Verify: `npm run test:school-ai`

  - [ ] 7.2 Build the streaming generation route handler
    - `POST /api/school-ai/generate-paper/stream` returning a `ReadableStream` of NDJSON with `X-Accel-Buffering: no`, because reverse proxies and CDNs buffer by default
    - **Everything that can return a 4xx runs before the first chunk**: `assertSameOrigin`, `requireSchoolAiUser("add")`, the rate limit, `validateCurriculumApproval`, `validateBlueprint`, provider availability and credit checks. Once the first chunk is sent the status and headers are fixed, so a mid-stream failure is a terminal `error` frame under an already-sent `200`
    - Leave the existing `POST /api/school-ai/generate-paper` exactly as it is — it is the fallback when an intermediary buffers, and `exam-preflight.tsx` and `assessment-studio.tsx` depend on its single-JSON contract
    - Pass `request.signal` into `generateAIDraft`; on abort stop consuming the provider, emit a `cancelled` frame if the stream is still writable, and record the cancellation with the authoritative timestamp through `consumeAICreditAndLog` with the tokens actually consumed
    - Preserve every `locked` item through the existing locked-question merge; refuse to write a `reusedFrom` bank origin from provider output; keep manual authoring, key entry, rubric entry and review available when the provider is unavailable or document and audio egress is unapproved
    - _Requirements: 5.1, 5.2, 5.4, 5.9, 5.10, 5.11, 5.12, 26.3, 26.4, 26.7, 26.8_
    - **[read next-docs]** `01-app/02-guides/streaming.md`, `01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 7.3 Build single-item regeneration, the diff and the progress surface
    - `POST /api/school-ai/workspace/[id]/items/[questionId]/regenerate` with `maxDuration = 30`, non-streaming, returning `{ previous, candidate, differingFields }` and **writing nothing**; the Author accepts or rejects in a second call
    - The merge is `replaceOneQuestion(paper, questionId, candidate)`, a pure function copying every other element by reference, which is what makes "preserve every other item byte-for-byte" checkable
    - Accepting sets the item to `DRAFT` and records the superseded item in the item history; rejecting leaves the previous item unchanged
    - Create `item-diff.tsx` (previous and regenerated side by side with differing fields marked) and `generation-progress.tsx` (NDJSON frame consumer showing produced count, requested count, current stage and a cancel action). Add the item diff as a **shared component under the existing contracts**, not a feature-local fork
    - Reordering within a section preserves each item's identifier, key, rubric, figures, source references and review state
    - EN/AR/UR copy in `exam-studio-copy-generation.ts`; progress and cancellation announced to assistive technology
    - _Requirements: 5.3, 5.5, 5.6, 5.7, 5.8, 21.4, 22.1, 23.1, 23.2, 24.4, 24.11_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`
    - Verify: `npm run test:school-ai:db`, `npm run check:ui`

  - [ ] 7.4 Build the Blueprint space
    - Create `spaces/blueprint-space.tsx` for sections, taught coverage, form-set configuration and language selection, wired to the streamed generation progress and the diff
    - Long-running generation state is stored server-side and read on mount, so a page reload shows the same state
    - _Requirements: 5.1, 5.2, 9.1, 10.2, 22.1, 22.2, 24.2, 24.11_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 7.5 Write the property test for locked and unselected item preservation
    - **Property 14: Locked and unselected items are preserved**
    - **Validates: Requirements 5.3, 5.4, 5.8**
    - Generated input: papers with random locked subsets under whole-paper generation, single-item regeneration and in-section reorder
    - File: `tests/school-ai/exam-studio-generation.test.ts`; verify with `npm run test:school-ai`

- [ ] 8. Form sets, parallel language versions and the exposure ledger

  - [x] 8.1 Build the form-set domain module
    - Create `src/lib/school-ai/form-set.ts` with `formSetSchema` whose `labels` is `z.array(formLabelSchema).min(1).max(4)`, the blueprint parity comparison over `blueprintHash` plus section totals, the language comparison and the allocation checks
    - Keep `paperDataSchema.language` a **single value** — one `SchoolAiRecord` of kind `PAPER` per (form, language), linked by `formSet.id` and `itemGroupIds`. Multiplying the field would invalidate `buildCandidatePaperHtml`, `candidatePaper`, the assignment snapshot and the scan path at once
    - `MARKS_MISMATCH` and `KEY_STRUCTURE_MISMATCH` are deterministic comparisons; a model comparison of meaning is a proposal carrying its uncertainty that requires a human decision and **never edits an item version**
    - The 4-form bound is enforced in three places: the schema, `deliveryPolicySchema.maxForms`, and a re-read of the approved policy inside the release transaction
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3_
    - Verify: `npm run test:school-ai`

  - [ ] 8.2 Wire one assignment per form and freeze each candidate's form
    - Extend `src/lib/school-ai/exam-service.ts` with form allocation: one `SchoolAiExamAssignment` per form grouped by `formSetId` and labelled by `formLabel`, plus a `SchoolAiExamFormAllocation` row mapping `(formSetId, studentId) → assignmentId` under `@@unique([formSetId, studentId])`
    - The payoff is that every existing path already resolves to exactly one assignment and therefore one form with no change: `scopedAssignment`, `paperSnapshot`, `startSchoolAiExam`, `saveSchoolAiAttempt`, `getSchoolAiAttempt`, the expiry sweep, `exam-script-service.ts` and `exam-results.ts` all key off `assignmentId`
    - Refuse a form change while an attempt for that candidate is active, via a `FOR UPDATE` read of the allocation row plus an existence check on the attempt
    - _Requirements: 10.8, 10.9, 10.10, 9.10_
    - Verify: `npm run test:school-ai:db`

  - [ ] 8.3 Build the exposure ledger
    - Record, on release, each item identifier, item revision, form label, Released_Form revision, assigned cohort identifiers and exam date; report `REPEAT_EXPOSURE` when an item has a prior exposure to a cohort assigned to the current form
    - Create `exposure-ledger.tsx` showing every prior exposure with cohort and date when an Author adds an item; restrict read access to Author, Academic_Approver and Moderator within the owning school and campus
    - EN/AR/UR copy; empty state names the next action
    - _Requirements: 10.5, 10.6, 10.7, 10.11, 22.1, 24.1_
    - Verify: `npm run test:school-ai:db`, `npm run check:ui`

  - [ ] 8.4 Build the language review surface
    - Create `language-review.tsx` showing two selected language versions of one item side by side with the shared outcome mapping, marks and key structure visible, each in its correct text direction, with mismatch observations and their uncertainty surfaced for an explicit human decision
    - Render each language version in its correct direction in the browser as `paper-print.ts` already does for print; isolate LTR notation inside RTL text with `<bdi>` and `dir="auto"`
    - EN/AR/UR copy in `exam-studio-copy-language.ts`
    - _Requirements: 9.1, 9.3, 9.6, 9.11, 22.2, 22.4, 22.6, 23.1, 23.2_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 8.5 Write the property test for language version agreement
    - **Property 20: Language versions agree on marks and key structure**
    - **Validates: Requirements 9.2, 9.4, 9.5, 9.7, 9.8, 9.9**
    - Generated input: multi-language item groups with generated mark, option-count, correct-option-count and numeric-key perturbations
    - File: `tests/school-ai/exam-studio-language.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 8.6 Write the property test for form parity and exposure
    - **Property 22: Form sets satisfy blueprint parity or no form is released**
    - **Validates: Requirements 10.1, 10.3, 10.4, 10.5, 10.7**
    - Generated input: form sets of 1 to 4 forms with injected parity breaks in section totals, marks totals and outcome coverage
    - File: `tests/school-ai/exam-studio-forms.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 8.7 Write the property test for one candidate one form
    - **Property 21: One candidate receives exactly one form**
    - **Validates: Requirements 10.8, 10.9, 10.10**
    - Generated input: cohort allocations across 1 to 4 forms, including a change request while an attempt is active
    - File: `tests/school-ai/exam-studio-forms.database.test.ts`; verify with `npm run test:school-ai:db`

- [ ] 9. Rehearsal service

  - [ ] 9.1 Build the rehearsal check registry
    - Create `src/lib/school-ai/rehearsal.ts` with the eleven-member `RehearsalCheck` set, `rehearsalResultSchema` (check, outcome, item identifiers, accountable owner role, named repair path, detail), `classifyRehearsal` and `candidateKeySeparationIssues`
    - `candidateKeySeparationIssues` serializes `candidatePaper(paper)` and asserts that no model answer, rubric criterion text, correct option identifier, numeric key value, source excerpt or semantic-review explanation appears anywhere in it — pure, no database, and the same function Property 6 fuzzes
    - A rehearsal result is evidence of the named checks only and carries no statement that the form is certified, cheat-proof or guaranteed correct
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.12, 1.8_
    - Verify: `npm run test:school-ai`

  - [ ] 9.2 Build the rehearsal service with transaction rollback
    - Create `src/lib/school-ai/rehearsal-service.ts` running the full check suite, including the synthetic save and submit rehearsal **through the real `saveSchoolAiAttempt` code path** so it exercises the same save, sequencing, deadline and receipt logic a candidate hits
    - Leave no residue by **rolling back a serializable transaction via a `RehearsalRollback` sentinel** rather than deleting rows: there is no window in which a synthetic attempt is visible to the marking desk, the gradebook, the expiry sweep or the integrity pipeline, and no cleanup step that can fail
    - Belt and braces: synthetic rows also carry `rehearsal: true` in their JSON, and `listSchoolAiAttempts`, `expireSchoolAiAttempts` and the results path exclude them by explicit predicate
    - Record the result against the exact form revision rehearsed; mark a recorded result invalid when the form revision changes; run the print pagination check for every language version
    - _Requirements: 7.2, 7.7, 7.8, 7.10, 7.11, 6.5_
    - Verify: `npm run test:school-ai:db`

  - [ ] 9.3 Build the rehearse route, the Rehearsal space and the blocker report
    - `POST /api/school-ai/workspace/[id]/rehearse` returning `{ results, blocking, advisory, canRelease, rehearsalId }`, refusing with 409 if the version changed
    - Create `spaces/rehearsal-space.tsx` and `rehearsal-report.tsx`: each blocker shows its accountable owner and named repair path, and opening a blocker **navigates to the specific item or setting the repair path names**
    - Rehearsal state is server-recorded and readable after a page reload; the full-screen rehearsal surface uses the existing `ModalSurface` layer arithmetic
    - EN/AR/UR copy in `exam-studio-copy-rehearsal.ts`; keyboard-operable with accessible name, role and state on every control
    - _Requirements: 7.3, 7.4, 7.9, 21.6, 22.1, 22.2, 23.1, 23.2, 24.2, 24.11_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`
    - Verify: `npm run test:school-ai:db`, `npm run check:ui`

  - [ ]* 9.4 Write the property test for rehearsal residue
    - **Property 23: Rehearsal leaves no residue**
    - **Validates: Requirements 7.8**
    - Generated input: rehearsal runs against arbitrary saved forms, asserting no synthetic assignment, attempt, response, mark, result, gradebook entry or integrity signal exists after the run and none is visible during it
    - File: `tests/school-ai/exam-studio-rehearsal.database.test.ts`; verify with `npm run test:school-ai:db`

- [ ] 10. Sealed release, print and browser parity, and the Exam Room space

  - [x] 10.1 Build the content hash and release precondition module
    - Create `src/lib/school-ai/release.ts` with `contentHash`, `verifyContentHash` and the release preconditions
    - `contentHash` prefixes a scheme version and includes the language and form label in the hash input — `canonicalDigest({ v: 1, language, formLabel, projection })` — so two language versions cannot collide and each carries its own stable hash
    - Input is `candidatePaper()`, whose doc comment already states it is an explicit allow-list, so Protected_Key values are absent by construction; the Protected_Key is stored separately with its own access check
    - _Requirements: 8.1, 8.2, 8.6, 8.7, 9.9_
    - Verify: `npm run test:school-ai`

  - [ ] 10.2 Build the release service and route
    - `POST /api/school-ai/workspace/[id]/release` accepting `{ version, rehearsalId, formSetId? }` and returning `{ contentHash, releasedVersion, releasedAt }`
    - Refuse a revision mismatch with 409, refuse while any `BLOCKING` rehearsal result or unresolved `MARKS_MISMATCH`/`KEY_STRUCTURE_MISMATCH` observation stands, refuse while any item is unapproved, refuse the whole Form_Set when any form fails blueprint parity and name the failing form and check, and refuse on separation of duties when the approved policy requires it
    - Re-read the approved policy inside the release transaction and refuse the Form_Set if `labels.length > policy.maxForms`
    - Record releasing actor, authoritative release timestamp, released revision, Content_Hash and rehearsal result identifier; an edit after release creates a new draft revision and leaves the Released_Form, its hash and its Protected_Key unchanged
    - _Requirements: 8.1, 8.8, 8.9, 8.10, 4.10, 6.7, 9.8, 10.3, 10.4, 2.3, 2.4, 25.4, 25.5_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/01-getting-started/07-mutating-data.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 10.3 Verify the content hash on both renderers
    - Recompute the Content_Hash when rendering the browser candidate projection and refuse delivery with 409 `CONTENT_HASH_MISMATCH` on a difference; recompute on `GET /api/school-ai/workspace/[id]/print` and refuse the print request rather than render a document that could pass as the released paper
    - Exclude every Protected_Key value from the hash input and from both outputs; render each language version in its correct direction in the browser and in print
    - _Requirements: 8.3, 8.4, 8.6, 22.6, 22.7_
    - **[read next-docs]** `01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/03-file-conventions/route.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 10.4 Build the Exam Room space and the release seal
    - Create `spaces/exam-room-space.tsx` and `release-seal.tsx` showing the Content_Hash prefix and the approved version number on the staff release view and on the print output, plus the assignment surface
    - Display the stored hash prefix beside the recomputed one when they differ; EN/AR/UR copy in `exam-studio-copy-release.ts`
    - _Requirements: 8.5, 22.1, 22.2, 23.1, 23.2, 24.1, 24.4_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 10.5 Write the property test for protected values in candidate payloads
    - **Property 6: No candidate-facing payload carries a protected value**
    - **Validates: Requirements 4.11, 7.5, 8.6, 15.6, 19.5**
    - Generated input: papers containing answer keys, rubrics, model answers, source excerpts, reviewer notes and semantic review output, checked against the candidate projection, the print output, the control-room payload and a role-restricted evidence pack
    - File: `tests/school-ai/exam-studio-release.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 10.6 Write the property test for the content hash round trip
    - **Property 7: Content hash round trip**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - Generated input: released forms under arbitrary object key reordering, CRLF/LF variation, trailing-whitespace variation and Unicode normalization form variation
    - File: `tests/school-ai/exam-studio-release.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 10.7 Write the property test for print and browser parity
    - **Property 8: Print and browser outputs carry identical content**
    - **Validates: Requirements 8.3, 8.4, 22.6**
    - Generated input: released forms rendered to both outputs in each of English, Arabic and Urdu, with a single content byte corrupted to confirm both renderers refuse
    - File: `tests/school-ai/exam-studio-print.browser.spec.ts`; verify with `npm run test:school-ai:e2e`

  - [ ]* 10.8 Write the property test for approval version binding
    - **Property 18: Approval binds to the reviewed version**
    - **Validates: Requirements 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.9**
    - Generated input: interleavings of a concurrent edit and an approval against one record, including restoring a historical version
    - File: `tests/school-ai/exam-studio-versions.database.test.ts`; verify with `npm run test:school-ai:db`

- [ ] 11. Untrusted content isolation, scope and design-system adoption

  - [ ] 11.1 Enforce provider output isolation and output escaping
    - Validate every provider output against a strict schema with bounded field sizes before storing; refuse a non-conforming output, record the refusal and leave the existing record byte-identical
    - Refuse a provider output naming a record, school, campus or bank origin outside the requesting actor's current scope; exclude every instruction found inside a source document, extracted region, candidate response or provider output from the operations Exam Studio performs
    - Escape every authored text, option text, candidate response, clarification text and figure caption in the browser and print output; store a candidate code response as an answer value and never execute it
    - Send provider requests only to an allowlisted destination with server-held credentials; withhold document and audio content while egress approval is absent from the environment configuration, keeping manual authoring and review available; present a generic provider failure message carrying no response body and no credential
    - Read the provider and intake records owned by SKO-383 and SKO-460 rather than reimplementing provider selection and extraction
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 26.10, 26.11_
    - Verify: `npm run test:school-ai`

  - [ ]* 11.2 Write the property test for escaping and provider schema refusal
    - **Property 30: Untrusted text is escaped and non-conforming provider output is refused**
    - **Validates: Requirements 26.2, 26.3, 26.4, 26.5, 26.6, 26.10**
    - Generated input: `arbitraryHostileString` across authored text, option text, candidate responses, clarification text and figure captions, plus provider outputs failing the strict schema
    - File: `tests/school-ai/exam-studio-untrusted.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 11.3 Write the property test for internal-detail leakage
    - **Property 35: No server-reported failure leaks internals**
    - **Validates: Requirements 5.9, 24.10, 26.9**
    - Generated input: provider, database and filesystem error shapes, asserting no stack frame, provider response body, SQL text or absolute file path reaches the browser
    - File: `tests/school-ai/exam-studio-untrusted.test.ts`; verify with `npm run test:school-ai`

  - [ ] 11.4 Extend the design-system adoption check
    - Add two assertions to the existing `tests/design-system/adoption.test.ts`: `package.json` gains no new UI dependency, and no new `@font-face` is registered
    - This **extends the existing mechanism rather than adding one** — the test already walks `src/`, already bans native `button`, `motion.button`, `select`, `textarea` and non-specialized `input` outside `src/components/ui`, and already bans every `focus:`/`focus-visible:`/`focus-within:` ring, outline, border and shadow utility and the retired focus hex
    - Because `npm run build` runs `check:ui` before `next build`, this is a hard build gate that fails fast
    - This closes **Property 36: Shared design-system adoption holds for every file** — **Validates: Requirements 21.1, 21.3, 21.5, 21.9**
    - _Requirements: 21.1, 21.3, 21.5, 21.9, 30.6_
    - Verify: `npm run check:ui` and `npm run build`

  - [ ]* 11.5 Write the property test for tenant and campus isolation
    - **Property 9: No cross-tenant or cross-campus read**
    - **Validates: Requirements 19.9, 19.10, 27.1, 27.2, 27.4, 27.7, 27.8**
    - Generated input: `arbitraryTenantPair` with deliberately overlapping identifiers, exercised against a **data-driven surface list** so each later slice adds its reads to the same constant and the test is authored once
    - File: `tests/school-ai/exam-studio-scope.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ]* 11.6 Write the property test for numeral parsing
    - **Property 28: Numeric answer parsing round trip**
    - **Validates: Requirements 22.5**
    - Generated input: numeric values in Western, Arabic-Indic and Extended Arabic-Indic numerals, with and without an Arabic decimal separator, plus values outside the accepted grammar which must return null rather than a coerced number
    - File: `tests/school-ai/exam-studio-locale.test.ts`; verify with `npm run test:school-ai`

- [ ] 12. Checkpoint — slice 1 green and demonstrable
  - Run `npm run test:school-ai`, `npm run test:school-ai:db`, `npm run test:school-ai:e2e`, `npm run check:ui`, `npm run lint` and `npm run build`
  - Confirm the Studio_Intro plays into a seven-space shell, a brief reaches readiness, a paper streams and reseals, a rehearsal blocks a release and a sealed release proves print and browser parity in English, Arabic and Urdu
  - Confirm the Commercial Evidence Register reports every managed-mode gate as `EXTERNAL_GATE_OPEN` with its owning ticket
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Slice 2 migrations — Exam Room and integrity

  - [ ] 13.1 Write migration `20261014121000_school_ai_exam_studio_room`
    - Add `SchoolAiAttemptReceipt` with `attempt_id` **unique** and `SchoolAiExamFormAllocation` with `@@unique([formSetId, studentId])`; add `writer_session_id`, `writer_admitted_at` and `last_ack_at` to `SchoolAiExamAttempt`
    - Add the partial index `school_ai_exam_attempts_active_writer_idx ON school_ai_exam_attempts (school_id, user_id) WHERE status = 'IN_PROGRESS'` — this is the one query the Exam Room boundary makes
    - The unique constraint on `attempt_id` is what makes "exactly one receipt" a database fact rather than careful code
    - **Operator-applied** against the reviewed remote target; never applied by code, a worker or the demo script
    - _Requirements: 16.5, 16.7, 10.8, 11.1, 25.10, 30.1_
    - Verify: `npx prisma generate` then `npm run build`

  - [ ] 13.2 Write migration `20261014122000_school_ai_exam_studio_integrity`
    - Add `SchoolAiIntegritySignal` and `SchoolAiIntegrityDecision` plus the retention index `school_ai_integrity_signals_retention_idx ON school_ai_integrity_signals (school_id, retention_until) WHERE deleted_at IS NULL`, mirroring the existing proctor clip sweep shape
    - **Operator-applied**; never applied by code, a worker or the demo script
    - _Requirements: 14.2, 14.16, 25.10, 30.1_
    - Verify: `npx prisma generate` then `npm run build`

- [ ] 14. App-level Exam Room boundary

  - [ ] 14.1 Build the pure Exam Room decision and allowlists
    - Create `src/lib/school-ai/exam-room.ts` with `import "server-only"`, the frozen `EXAM_ROOM_PAGE_ALLOWLIST` and `EXAM_ROOM_SURFACE_ALLOWLIST`, the `ExamRoomSurface` and `ExamRoomDecision` types, and `examRoomDecision` as a **pure function** so the whole allowlist decision is testable with no database
    - Allowed while an attempt is active: the attempt page for the active assignment only, sign-out, identity refresh, exam meta, the candidate paper and figures read, answer save and submit, the receipt, clarifications, integrity signal report, capture upload, and only the support paths listed in the approved Delivery_Policy
    - Pages refused get `303 See Other` so a form POST does not re-submit on redirect; interfaces get `403` with code `EXAM_ROOM_ACTIVE`, because 403 is already the repository's refusal vocabulary in `src/lib/api/scope.ts` and existing clients already recover from it
    - A refusal body names only the active attempt — no Protected_Key value and no other candidate's data
    - Staff, Guardian and Platform_Support sessions are excluded from the boundary entirely
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.9, 11.11, 11.12, 29.3_
    - Verify: `npm run test:school-ai`

  - [ ] 14.2 Build the signed claim and the authoritative attempt resolution
    - `issueExamRoomClaim` and `readExamRoomClaim` over a separate `skoolee_exam_room` cookie — `httpOnly`, `SameSite=Lax`, `Secure` — signed with the existing `JWT_SECRET` through `jose`
    - A **positive** claim's `Max-Age` is the seconds remaining until `deadlineAt`, so it expires at the authoritative deadline by construction and can only ever *add* restriction; a **negative** claim is signed with a 15 s TTL; a missing or unreadable claim falls through to the database read, so deleting the cookie buys one indexed query, not an escape
    - `resolveActiveAttempt` is memoized per request with React `cache()` for server components and by one explicit call in route handlers, and runs **only for `user.role === "STUDENT"`**, backed by the new partial index
    - `assertExamRoomAllows` throws `ApiError(403, "EXAM_ROOM_ACTIVE")`; the attempt start response always rewrites the positive claim in the session that started it
    - **Indeterminate state:** if the claim is unreadable *and* the query fails, permit the attempt page, refuse every write, and record an `EXAM_ROOM_INDETERMINATE` signal at `INFORMATION` severity for staff review. Never fail open on a write
    - _Requirements: 11.3, 11.6, 11.12, 11.13, 16.9_
    - **[read next-docs]** `01-app/02-guides/data-security.md` — a server-only Data Access Layer performs authorization and returns minimal DTOs
    - Verify: `npm run test:school-ai:db`

  - [ ] 14.3 Add the optimistic proxy hint
    - Add exactly one cookie-only block to `src/proxy.ts` after the existing `jwtVerify` and before the role routing guard, redirecting a student off a non-attempt page when a positive claim is readable
    - **Keep it import-free of Prisma and `next/headers`.** The file already documents its cookie-only contract — it verifies the JWT signature and deliberately skips the revocation check because that is a database read on every non-asset request including every router prefetch
    - The installed proxy reference independently confirms the constraint: proxy must not rely on shared modules, may be deployed to a CDN, must not be used for data fetching, and is explicitly not a full authorization solution. This tier is a hint, never the enforcement point
    - _Requirements: 11.3, 11.4_
    - **[read next-docs]** `01-app/01-getting-started/16-proxy.md`, `01-app/03-api-reference/03-file-conventions/proxy.md` — Middleware is renamed Proxy, the `middleware` convention is deprecated, and the `runtime` config option throws in a proxy file
    - Verify: `npm run lint` and `npm run build`

  - [ ] 14.4 Wire authoritative enforcement next to the data
    - Call `assertExamRoomAllows` from every Exam Studio page, layout, route handler **and Server Function**
    - The installed proxy reference states that **Server Functions are not separate routes in the matcher chain** — they are POST requests to the route that uses them, so a matcher change can silently remove proxy coverage and each Server Function must verify authentication and authorization itself. This is why enforcement lives here and not in the proxy
    - Restore ordinary route and interface access within the next request once an attempt reaches `SUBMITTED`, `EXPIRED` or another final state
    - Register these surfaces in the Property 9 surface list from task 11.5
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.9, 11.10_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/proxy.md`, `01-app/01-getting-started/07-mutating-data.md`, `01-app/02-guides/data-security.md`
    - Verify: `npm run test:school-ai:db`

  - [ ]* 14.5 Write the property test for the Exam Room allowlist
    - **Property 31: The Exam Room allowlist is exactly honoured**
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.5, 11.6, 11.9, 11.12**
    - Generated input: the full role × requested surface × attempt state cross-product
    - File: `tests/school-ai/exam-studio-exam-room.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 14.6 Write the server-side boundary enforcement integration test
    - Assert the boundary is enforced for a page, a route handler **and a Server Function** — the last specifically because the installed proxy reference states a matcher does not cover Server Functions
    - Assert the boundary labels itself in candidate and staff copy as an in-application restriction that does not control other applications, other browser tabs outside Skoolee AI, other devices or screenshots
    - File: `tests/school-ai/exam-studio-exam-room.browser.spec.ts`; verify with `npm run test:school-ai:e2e`
    - _Requirements: 11.3, 11.10, 11.11, 30.4_

- [ ] 15. Attempt durability, writer sessions and receipts

  - [ ] 15.1 Add the writer-revocation outcome to the save decision
    - Extend `examSaveDecision` in `src/lib/school-ai/exam.ts` with optional `writerSessionId` and `currentWriterSessionId` inputs and a new `REVOKED` outcome
    - Return `REVOKED` **ahead of the `EXPIRED` and `STALE` checks**, so a delayed offline save from a superseded session is refused on its own terms rather than misreported as stale
    - The existing `SAVE`/`REPLAY`/`STALE`/`EXPIRED`/`FINISHED` behaviour is unchanged, and `tests/school-ai/assessment.test.ts:63-66` must keep passing untouched
    - Compute every deadline from the authoritative server clock; exclude the client clock from deadline computation
    - _Requirements: 11.7, 11.8, 16.3, 16.4, 16.8, 16.9_
    - Verify: `npm run test:school-ai`

  - [ ] 15.2 Build the attempt receipt module
    - Create `src/lib/school-ai/attempt-receipt.ts` with `attemptReceiptSchema`, `responseDigest` (a `canonicalDigest` over the normalized response map, order-independent) and `resolveFinalState` as the **single resolution point** for the submit-versus-expiry race
    - The receipt carries the final state, final response digest, the Content_Hash of the delivered form, the authoritative final time, the final revision sequence, the language and the form label
    - _Requirements: 16.5, 16.6, 16.7_
    - Verify: `npm run test:school-ai`

  - [ ] 15.3 Wire writer sessions and the single receipt write
    - Extend `src/lib/school-ai/exam-service.ts`: admit a writing session, revoke the previous one immediately on takeover, refuse every subsequent save from a superseded session with `403 WRITER_REVOKED`, and refuse a second concurrent writing session for the same attempt
    - Write the receipt **inside the same serializable transaction that sets the final state**; a duplicate submit or a concurrent expiry sweep hits the unique constraint, is translated to a read of the existing row, and returns the identical receipt
    - Acknowledge each committed save with the committed revision sequence and the authoritative server time; record `last_ack_at` for the control room
    - When an attempt record is unreadable or fails validation, report the fault to staff, **preserve every stored response** and withhold a grade — never substitute an empty response map, matching the existing `exam-expiry.ts` behaviour of returning `"invalid"` and leaving the row for operator repair
    - _Requirements: 11.7, 11.8, 16.1, 16.2, 16.5, 16.6, 16.8, 16.10_
    - Verify: `npm run test:school-ai:db`

  - [ ] 15.4 Build the attempt read, save, submit and receipt routes
    - `GET /api/school-ai/exams/[id]/attempt` returning `{ paper, responses, sequence, deadlineAt, serverNow, saveState }`; `POST` accepting `saveExamSchema` plus `writerSessionId`; `GET …/attempt/receipt` returning the identical receipt on every repeat and 409 before a final state
    - Keep the attempt read surface allowlisted so the save state and remaining time stay readable at every point, including while a refusal is displayed
    - Reference the SKO-451 sustained load verification as the source of any capacity statement; this feature's own evidence makes no production capacity claim
    - _Requirements: 16.1, 16.2, 16.7, 16.11, 16.14, 11.12_
    - **[read next-docs]** `01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/01-getting-started/08-caching.md` — handlers are dynamic by default here because `next.config.ts` does not set `cacheComponents`, so no `use cache`, `cacheLife` or `cacheTag`
    - Verify: `npm run test:school-ai:db`

  - [ ]* 15.5 Write the property test for save ordering
    - **Property 2: The newest acknowledged revision wins**
    - **Validates: Requirements 16.3, 16.4**
    - Generated input: `arbitrarySaveSequence` producing permuted and duplicated save requests with arbitrary sequence numbers
    - File: `tests/school-ai/exam-studio-attempt.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 15.6 Write the property test for clock authority
    - **Property 19: Deadlines are clock-authoritative**
    - **Validates: Requirements 16.9, 20.10**
    - Generated input: client-reported times before the attempt start and after the deadline
    - File: `tests/school-ai/exam-studio-attempt.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 15.7 Write the property test for acknowledged answer durability
    - **Property 1: No acknowledged answer is ever lost**
    - **Validates: Requirements 16.2, 16.3, 16.4**
    - Generated input: `arbitraryInterleaving` over save, reconnect, reload, writer-takeover and deadline-expiry events across a bounded response map
    - File: `tests/school-ai/exam-studio-attempt.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ]* 15.8 Write the property test for receipt uniqueness
    - **Property 3: Exactly one final receipt**
    - **Validates: Requirements 16.5, 16.6**
    - Generated input: interleavings of submit requests, duplicate submits and the expiry sweep within one interval for one attempt
    - File: `tests/school-ai/exam-studio-attempt.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ]* 15.9 Write the property test for receipt idempotence
    - **Property 4: Receipt reads are idempotent**
    - **Validates: Requirements 16.7**
    - Generated input: repeated receipt reads after each reachable final state
    - File: `tests/school-ai/exam-studio-attempt.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ]* 15.10 Write the property test for writer takeover
    - **Property 5: Takeover revokes the previous writer**
    - **Validates: Requirements 11.7, 11.8, 16.8**
    - Generated input: writer-session admission sequences including a save submitted by a superseded session after an arbitrary offline delay
    - File: `tests/school-ai/exam-studio-attempt.database.test.ts`; verify with `npm run test:school-ai:db`

- [ ] 16. Integrity signals and the review queue

  - [ ] 16.1 Build the integrity signal domain module
    - Create `src/lib/school-ai/integrity-signal.ts` with the ten-member `INTEGRITY_SIGNAL_TYPES`, `SignalSeverity` of `INFORMATION`/`ATTENTION`/`REVIEW`, `signalUncertaintySchema` whose `benignCauses` is `.min(1)` so it can **never be empty**, the bounded report and batch schemas, the fixed `severityFor` and `uncertaintyFor` tables, `INTEGRITY_BUDGET` and `applyBudget`, and `integrityDecisionSchema`
    - **No outcome vocabulary exists:** three severity members and four decision members, none naming misconduct, cheating, guilt or dishonesty, so there is no enum value a model could write that means "cheated"
    - Severity is a property of the signal type, never of a model guess; a model observation is stored with `method: "MODEL_PROPOSAL"`
    - Accept client reports as untrusted data against a closed type set and bounded field sizes; the server timestamp is authoritative and the client timestamp is stored beside it and never used for ordering
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.11, 14.15_
    - Verify: `npm run test:school-ai`

  - [ ] 16.2 Build the integrity signal service with a narrowed write client
    - Create `src/lib/school-ai/integrity-signal-service.ts` typed against `type IntegrityWriteClient = Pick<TxClient, "schoolAiIntegritySignal" | "schoolAiIntegrityDecision">`
    - **The service literally cannot reach `schoolAiExamAttempt`, `schoolAiExamResultRevision` or `schoolAiExamAssignment`**, so "a signal never changes a mark, a score proposal, a result version, an attempt state, a deadline, a device release or a guardian notification" is a type error rather than a review finding
    - Over-budget reports are counted and dropped, never stored and never an error the client can use as an oracle for the budget state
    - A model proposal does not enter a moderation or result record until a human decision row exists
    - Restrict read access to Invigilator, Moderator, Academic_Approver and the Author of the released form within the owning school and campus
    - _Requirements: 14.5, 14.6, 14.7, 14.8, 14.13, 14.14, 14.15_
    - Verify: `npm run test:school-ai:db`

  - [ ] 16.3 Build the integrity signal and queue routes
    - `POST /api/school-ai/exams/[id]/integrity-signals` returning `{ accepted, dropped }` with `200` on over-budget rather than `429`; `GET`/`POST /api/school-ai/exams/[id]/integrity-queue` for grouped signals and human decisions, refusing candidate, guardian and support sessions
    - A decision records the deciding actor, a stated reason and the authoritative timestamp, and is recorded as a decision **about a signal group**
    - Register these surfaces in the Property 9 surface list
    - _Requirements: 14.9, 14.10, 14.11, 14.14, 2.5, 2.6, 2.7_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 16.4 Build the integrity review queue surface
    - Create `integrity-queue.tsx` presenting each group with its signal list, each signal's uncertainty including its stated benign causes, and the available human decisions — added as a **shared component under the existing contracts**, not a feature-local fork
    - Display, with every group, the statement that a signal is an observation and not proof of misconduct
    - EN/AR/UR copy in `exam-studio-copy-integrity.ts`; keyboard-operable with accessible name, role and state; every state conveyed by colour also conveyed by text or an icon
    - _Requirements: 14.9, 14.12, 14.13, 21.4, 22.1, 22.2, 23.1, 23.2, 23.9, 24.1_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 16.5 Write the property test for the absent misconduct vocabulary
    - **Property 12: No signal classification or decision names misconduct**
    - **Validates: Requirements 14.3, 14.4, 14.11, 14.13**
    - Generated input: every signal type and every decision value, asserting at least one benign cause and no model observation reaching a moderation or result record without a human decision row
    - File: `tests/school-ai/exam-studio-integrity.test.ts`; verify with `npm run test:school-ai`

  - [ ]* 16.6 Write the property test for signal outcome neutrality
    - **Property 11: Integrity signals never change an outcome**
    - **Validates: Requirements 14.5, 14.6, 14.7, 14.8**
    - Generated input: `arbitrarySignalStream` including malformed reports, out-of-order client timestamps and over-budget volume, asserting the attempt's responses, sequence, status, deadline, score proposal and every result version are byte-identical before and after
    - File: `tests/school-ai/exam-studio-integrity.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ] 16.7 Add the integrity retention sweep
    - Retain signals for the retention period recorded on the approved policy and record each deletion event, reusing the existing `exam-proctor-sweep.ts` pattern and the approved `ProctorPolicySchema.retentionDays` bound of 1 to 7 days, so there is **one retention mechanism, not two**
    - _Requirements: 14.16, 13.7_
    - Verify: `npm run test:school-ai:db`

- [ ] 17. Consented capture additions

  - [ ] 17.1 Add the capture consent record, unavailable signal and recording indicator
    - Request camera and screen consent as a **separate decision from the attempt start** with a recorded consent version; a decline still starts the attempt, delivers the candidate projection and leaves the authoritative deadline unchanged
    - Exclude a consent decision from every marking, scoring, moderation and result computation; exclude capture consent from the admission decision except where an approved policy explicitly records capture as required and the interface displays that requirement before the attempt start
    - Record `CAPTURE_UNAVAILABLE` at `INFORMATION` severity when a device has no camera, denies the permission or loses it mid-attempt, and continue the attempt
    - Display an unambiguous recording indicator while a session is active; stopping a session retains every stored clip under the existing retention rule; exclude recordings from Guardian and Platform_Support access
    - The existing `exam-proctor.ts` consent, container-signature and 1-to-7-day retention model is already correct; this task adds only the signal, the indicator and the consent version
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.8, 13.9, 13.10, 13.12, 2.12, 2.14_
    - Verify: `npm run test:school-ai:db`, `npm run check:ui`

  - [ ]* 17.2 Write the property test for consent neutrality
    - **Property 13: Capture consent refusal is outcome-neutral**
    - **Validates: Requirements 13.2, 13.3, 13.4**
    - Generated input: attempts replayed under both consent decisions with the response map held constant, asserting the score proposal, review validation result, authoritative deadline and delivered projection are identical
    - File: `tests/school-ai/exam-studio-capture.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ]* 17.3 Write the capture storage and serving integration test
    - Recordings stored as private objects outside any publicly served path, container signature verified before storage, served with content-type sniffing disabled and only to roles permitted by Requirement 2
    - File: `tests/school-ai/exam-studio-capture.database.test.ts`; verify with `npm run test:school-ai:db`
    - _Requirements: 13.6, 13.11, 2.14_

- [ ] 18. Attempt page interface states and accessibility

  - [ ] 18.1 Build the durable attempt save-state surface
    - Display the save state as one of `SAVED`, `SAVING`, `UNSAVED` or `SAVE_FAILED` with the authoritative time of the last acknowledged save
    - Persist `UNSAVED` and `SAVE_FAILED` as a **visible durable in-page element until the next acknowledged save**, and a failed submission as a persistent failure record with the reason and a retry action retaining every entered response — the existing root Sonner is bottom-centre with a 5000 ms duration, which is exactly why a toast cannot be the only record of a lost answer
    - Present the reconnect state with the time of the last successful exchange, and the recovery outcome with the restored revision sequence and any input the server refused
    - Render the clarification notice and the attempt receipt in the candidate's recorded interface language
    - _Requirements: 16.11, 16.12, 16.13, 24.6, 24.7, 24.8, 22.10_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ] 18.2 Complete attempt page accessibility
    - Make every control on the attempt page operable by keyboard alone with an accessible name, role and current state, including the save state, the remaining time and the recording indicator
    - Announce the new save state on change and the remaining time when it crosses the configured warning threshold; maintain a visible focus indicator using the existing focus behaviour with no screen-level override
    - Support the existing reader, scribe and large-text accommodations; preserve every entered response when the candidate changes text size, zoom level or interface language; present every state conveyed by colour with an additional text or icon indicator
    - **Record that complete assistive-technology and device acceptance requires manual testing with real assistive technology and an expert accessibility review, which these automated checks do not replace** — register this in the Commercial Evidence Register as an open gate, not a passing check
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.8, 23.9, 23.10, 21.5_
    - **[read next-docs]** `03-architecture/accessibility.md`
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 18.3 Write the property test for response preservation and accessibility
    - **Property 38: Entered responses survive presentation changes**
    - **Validates: Requirements 23.1, 23.2, 23.5, 23.8, 23.9**
    - Generated input: response maps crossed with text size, zoom level and interface language changes during an attempt
    - File: `tests/school-ai/exam-studio-a11y.browser.spec.ts`; verify with `npm run test:school-ai:e2e`

- [ ] 19. Checkpoint — slice 2 green and demonstrable
  - Run `npm run test:school-ai`, `npm run test:school-ai:db`, `npm run test:school-ai:e2e`, `npm run check:ui`, `npm run lint` and `npm run build`
  - Confirm a candidate in an active attempt is confined to the allowlisted surfaces by server enforcement, that a session takeover revokes the previous writer, that exactly one receipt exists after a submit-versus-expiry race, and that an integrity signal stream leaves every outcome byte-identical
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Slice 3 migrations — incident and recovery

  - [ ] 20.1 Write migration `20261014123000_school_ai_exam_studio_incident`
    - Add `SchoolAiExamClarification` with `@@unique([assignmentId, version])` for immutable notice versions, `SchoolAiExamClarificationAck` with `@@unique([clarificationId, attemptId])`, and `SchoolAiExamRemedy`; add `paused_ms` to `SchoolAiExamAttempt`
    - **Operator-applied**; never applied by code, a worker or the demo script
    - _Requirements: 17.1, 17.4, 17.7, 15.4, 25.10, 30.1_
    - Verify: `npx prisma generate` then `npm run build`

  - [ ] 20.2 Write migration `20261014124000_school_ai_exam_studio_recovery`
    - Add `SchoolAiLearningFeedback` with `@@unique([attemptId, resultVersion])` and `SchoolAiEvidencePack`
    - **Operator-applied**; never applied by code, a worker or the demo script
    - _Requirements: 18.1, 19.1, 19.8, 25.10, 30.1_
    - Verify: `npx prisma generate` then `npm run build`

- [ ] 21. Exam control room

  - [ ] 21.1 Build the control room service and view
    - Create `src/lib/school-ai/control-room-service.ts` with `ControlRoomRow` and `ControlRoomView` carrying readiness, attempt state, last acknowledged sequence and its authoritative time, remaining time, delivery tier, admission reason code where refused, and the open signal count
    - **Responses, marks, Protected_Key values and unreleased results are deliberately absent from the type**, so an invigilator read of them is not expressible
    - Carry `serverNow` and `lastRefreshedAt` so the component can render the authoritative server time beside every remaining time and never present a stale value as live
    - Show candidates only from the invigilator's school and campus, and only from sittings assigned to that invigilator unless the actor holds a manager role
    - Extra time applies a fixed value to the authoritative deadline with a stated reason; a supervised pause records actor, reason and timestamp and extends the deadline by the recorded paused duration
    - _Requirements: 15.1, 15.3, 15.4, 15.6, 15.9, 15.11, 2.5, 2.6_
    - Verify: `npm run test:school-ai:db`

  - [ ] 21.2 Build idempotent bulk control actions
    - Follow the pattern `createSchoolAiExam` already uses: hash the idempotency key with school and actor into a deterministic row id, so a repeat submission finds the existing record and returns the same per-attempt outcomes
    - Require an explicit scope confirmation before a bulk action, refusing a mismatch with 409
    - **Persist the per-attempt outcome array on the idempotency row before the response is written**, so a reload shows the same outcomes; partial failure is a normal recorded result, not an error
    - _Requirements: 15.2, 15.7, 15.8, 24.3, 24.11_
    - Verify: `npm run test:school-ai:db`

  - [ ] 21.3 Build the control room routes
    - `GET /api/school-ai/exams/[id]/control-room` and `POST …/control-room/actions`, with `Cache-Control: private, no-store` set explicitly even though handlers are uncached by default in this configuration, matching what the repository already does on sensitive reads
    - A local release request for a managed attempt is recorded and its outcome displayed
    - Register these surfaces in the Property 9 surface list
    - _Requirements: 15.1, 15.5, 15.7, 15.8, 15.10_
    - **[read next-docs]** `01-app/01-getting-started/08-caching.md`, `01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/03-file-conventions/route.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 21.4 Build the Control room space
    - Create `spaces/control-room-space.tsx` polling on a 5 s interval and rendering `lastRefreshedAt` beside every value, with a reconnect state showing the last successful refresh time when the server is unreachable
    - Use the existing `ModalSurface` layer arithmetic for the full-screen control-room overlay; exclude the Studio_Intro from the active control-room view
    - EN/AR/UR copy in `exam-studio-copy-control-room.ts`; keyboard-operable with accessible name, role and state; delivery tier rendered with **distinct labels** for the Exam Room boundary tier and the Managed Exam Mode tier
    - _Requirements: 15.1, 15.2, 15.10, 15.11, 12.16, 20.7, 21.6, 22.1, 22.2, 23.1, 23.2, 24.1, 24.2, 24.6_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 21.5 Write the property test for bulk action idempotence
    - **Property 27: Bulk control actions are idempotent**
    - **Validates: Requirements 15.7, 15.8**
    - Generated input: repeated submissions of one bulk action under a single idempotency key over generated attempt sets up to the 500-attempt bound
    - File: `tests/school-ai/exam-studio-control-room.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ] 21.6 Consume the SKO-413 sitting records
    - Read sitting composition, room allocation and duty assignment from SKO-413's records rather than reimplementing sitting scheduling; when those records are absent, fall back to the assignment's class roster and **label the scope as "class roster (no sitting record)"**
    - Record the integration contract and the absent-record behaviour in the Commercial Evidence Register
    - _Requirements: 15.12, 29.5, 29.9, 29.11_
    - Verify: `npm run test:school-ai:db`

- [ ] 22. Incident service — clarifications and remedies

  - [ ] 22.1 Build the incident domain module
    - Create `src/lib/school-ai/incident.ts` with clarification notice versioning, audience definition over named attempts or a named sitting, and remedy proposal computation for `RUBRIC_CORRECTION`, `KEY_CORRECTION`, `REGRADE` and `ITEM_NEUTRALIZATION` including the computed mark change per affected candidate
    - _Requirements: 17.1, 17.4, 17.7_
    - Verify: `npm run test:school-ai`

  - [ ] 22.2 Build clarification issue and display
    - Record notice text, version, issuing actor, authoritative timestamp and the defined audience; display the newest version to every in-progress attempt inside the audience and record the display acknowledgement per attempt
    - Exclude every candidate outside the audience; a revision creates a new version and preserves the previous one
    - **Issuing a notice changes nothing else:** no change to the Released_Form, the Content_Hash, the Protected_Key, marks, deadlines or item content, and no automatic change while an attempt is in progress
    - Render the notice in the candidate's recorded interface language
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 22.10_
    - Verify: `npm run test:school-ai:db`

  - [ ] 22.3 Build remedy proposal and authorized application
    - Produce a proposal with the affected item, affected attempts and computed mark change per candidate; the proposal route **applies nothing**
    - Require an explicit Academic_Approver authorization **naming the remedy identifier** before applying; application creates a new immutable result version per affected candidate through the existing `SchoolAiExamResultRevision` records and preserves every previous version
    - Record the applied proposal, authorizing actor, authoritative timestamp and affected result versions; on a partway failure report the per-candidate outcome and leave every unprocessed candidate's result version unchanged
    - Route moderation decisions through the SKO-424 moderation and regrade records and the SKO-422 item review records rather than duplicating them
    - _Requirements: 17.7, 17.8, 17.9, 17.10, 17.11, 17.12, 17.13, 29.7, 29.11, 2.3_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/01-getting-started/07-mutating-data.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 22.4 Build the clarification composer and remedy preview
    - Create `clarification-composer.tsx` (notice text, audience, version history) and `remedy-preview.tsx` listing **every affected candidate with the previous mark, the proposed mark and the proposed total before any change is applied**
    - EN/AR/UR copy in `exam-studio-copy-incident.ts`; per-target outcome list for a partial application; keyboard-operable with accessible name, role and state
    - _Requirements: 17.1, 17.8, 22.1, 22.2, 23.1, 23.2, 24.3, 24.4_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 22.5 Write the property test for clarification audience
    - **Property 25: Clarification notices reach exactly their audience**
    - **Validates: Requirements 17.3, 17.4, 17.5, 17.6**
    - Generated input: generated audience definitions over mixed attempt states, asserting no released form, content hash, protected key, mark, deadline or item content changes
    - File: `tests/school-ai/exam-studio-incident.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ]* 22.6 Write the property test for remedy application
    - **Property 24: Remedy application is all-or-recorded**
    - **Validates: Requirements 17.10, 17.12**
    - Generated input: remedy proposals with a generated partial failure index
    - File: `tests/school-ai/exam-studio-incident.database.test.ts`; verify with `npm run test:school-ai:db`

- [ ] 23. Learning recovery loop

  - [ ] 23.1 Build the recovery domain module
    - Create `src/lib/school-ai/recovery.ts` with feedback derivation, practice eligibility and outcome comparison
    - Every feedback statement links to the exact released item identifier, the awarded marks and the rubric criterion the evidence came from; a statement no released item and no awarded mark supports is **excluded**
    - A practice set derives only from released items, approved sources and approved curriculum outcomes, and refuses an item from an unreleased form, an item scheduled in a future Form_Set and any Protected_Key value
    - A change between an earlier and a later outcome observation is presented as an observation with its sample counts, never as a caused change; exclude teacher rankings, teacher effectiveness scores and candidate behavioural inferences
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.10, 18.11_
    - Verify: `npm run test:school-ai`

  - [ ] 23.2 Build the recovery service and practice approval
    - Produce the feedback record on result release; require a teacher approval of a practice set before it reaches a candidate or guardian, recording the approving actor, authoritative timestamp and approved revision
    - Store the practice set as a `SchoolAiRecord` of kind `PRACTICE`; release a formative check **through the same rehearsal, release and delivery path as any other form**
    - Withhold the feedback record from the candidate and the guardian while the result version is unreleased
    - _Requirements: 18.1, 18.6, 18.7, 18.8, 18.12, 2.11, 2.12_
    - Verify: `npm run test:school-ai:db`

  - [ ] 23.3 Build the Results and Improve space
    - Create `spaces/improve-space.tsx` showing results, evidence-linked feedback, practice approval and the formative check, with the earlier and later outcome evidence side by side including the item count and candidate count for each observation
    - Render feedback and practice content in the candidate's recorded interface language from English, Arabic and Urdu; `GET /api/school-ai/exams/[id]/recovery` returns a role-shaped payload
    - EN/AR/UR copy in `exam-studio-copy-recovery.ts`; keyboard-operable with accessible name, role and state
    - _Requirements: 18.9, 18.13, 22.1, 22.2, 23.1, 23.2, 24.1, 24.2_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`
    - Verify: `npm run check:ui`, `npm run lint`

  - [ ]* 23.4 Write the property test for practice set containment
    - **Property 26: Practice sets never leak secured or future items**
    - **Validates: Requirements 18.2, 18.3, 18.4, 18.5**
    - Generated input: banks mixing released, unreleased and future-scheduled items, asserting every feedback statement resolves to an existing released item identifier and an awarded mark
    - File: `tests/school-ai/exam-studio-recovery.test.ts`; verify with `npm run test:school-ai`

- [ ] 24. Evidence pack export with a verifiable manifest

  - [ ] 24.1 Build the evidence pack and manifest module
    - Create `src/lib/school-ai/evidence-pack.ts` with the manifest shape listing every included file, its digest, the record identifier and record version of each included record, the digest algorithm name, and named gap entries for a missing record version
    - The manifest must be checkable by **an independent verifier with no access to Skoolee AI**, which is why task 1.1's code-unit canonical ordering exists
    - _Requirements: 19.2, 19.3, 19.4, 19.11_
    - Verify: `npm run test:school-ai`

  - [ ] 24.2 Build the evidence pack service and route
    - Include the full chain: approved source versions, taught coverage, brief revision, blueprint revision, item and key and rubric revisions, the Released_Form revision with its Content_Hash, assignment and accommodation records, the Delivery_Policy revision, admission decisions, attempt revisions and receipt, integrity signals with decisions, moderation decisions, result versions, and release and appeal records
    - Exclude Protected_Key values unless the requesting actor holds a permitted role, recording any inclusion in the manifest and the access audit record; **exclude capture recordings by default**, including one only on an explicit, separately authorized request recorded with actor, reason and timestamp
    - Restrict every pack to the requesting actor's school and campus scope and exclude every record from another school or campus; record production and download with actor, scope, included record versions and timestamp
    - Complete the remaining export when a requested record version is missing, recording the gap as a named missing record
    - Register this surface in the Property 9 surface list and add the evidence-pack claims to the Commercial Evidence Register
    - _Requirements: 19.1, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 25.1, 25.8, 25.9_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/02-guides/data-security.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 24.3 Build the evidence pack panel
    - Create `evidence-pack-panel.tsx` showing the export scope, the manifest, the audit trail and the full record chain for a selected result version with each link's version number and authoritative timestamp
    - Long-running export state is server-recorded and readable after a page reload; EN/AR/UR copy in `exam-studio-copy-evidence.ts`
    - _Requirements: 19.8, 25.8, 22.1, 22.2, 23.1, 23.2, 24.2, 24.11_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 24.4 Write the property test for independent manifest verification
    - **Property 29: Evidence manifests verify independently**
    - **Validates: Requirements 19.2, 19.3, 19.4, 19.11**
    - Generated input: evidence pack exports re-digested by a helper that **shares no code with the producer**, plus exports with a deliberately missing record version
    - File: `tests/school-ai/exam-studio-evidence.database.test.ts`; verify with `npm run test:school-ai:db`

- [ ] 25. Opt-in demonstration dataset script

  - [ ] 25.1 Build the demonstration dataset script
    - Create `scripts/school-ai-exam-studio-demo.ts`, **absent from `db:seed` and from `build`**, invoked as `tsx scripts/school-ai-exam-studio-demo.ts --target <db> --confirm <db> [--reset] [--force-remote]`
    - `--target` is required; without it the script exits non-zero **without opening a connection**. It resolves `DATABASE_URL`, prints the resolved host and database name, and requires `--confirm` to equal that database name before any write. A non-loopback host additionally requires `--force-remote`, and the script prints a warning naming the host first
    - **The script never applies a migration.** It checks `_prisma_migrations` for the six Exam Studio migration directories and exits with instructions if the target schema is behind
    - Every created row carries `demoTag: "SKO-408-DEMO"`; `--reset` deletes **exactly** the tagged rows in foreign-key order and writes to no row it did not create. Writes are idempotent upserts keyed on deterministic ids derived from `sha256("SKO-408-DEMO:" + logical name)`, so re-running changes nothing
    - The approver account is `PRINCIPAL`, which `requiresMfa()` forces to hold a second factor, so provision a working TOTP secret through the existing `src/lib/auth/mfa-manage.ts` path. **The password is read from `SKOOLEE_DEMO_APPROVER_PASSWORD`; the script never prints it and never embeds a default**, and exits with instructions if the variable is absent
    - Identities are obviously synthetic (`Demo Candidate 01`, `demo-candidate-01@example.invalid` — `example.invalid` is reserved by RFC 2606, so a stray send cannot reach anyone). No live communication send, no payment, no provider document egress: set and assert the run flags `announcements-service.ts` and `src/lib/ai/openai.ts` already honour
    - Seed the interesting paths, not the happy one: 7 of 9 brief decisions confirmed with 2 left open, 2 forms in English and Urdu, 12 items with **one deliberately ambiguous short-text item left `NEEDS_CORRECTION`** so the rehearsal reports a real `BLOCKING` result, form A sealed and form B unreleased, 6 attempts across submitted, in-progress, expired, admission-refused and not-started, 9 signals in 3 groups with one undecided, 1 released result, 1 open appeal, 1 approved practice set and 1 scheduled formative check
    - End the output with the line that the created records are synthetic and are not evidence of a school outcome
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 28.11, 30.7_
    - Verify: `npm run test:school-ai:db` and `npm run lint`

  - [ ]* 25.2 Write the property test for demonstration script containment
    - **Property 40: The demonstration script writes only tagged rows**
    - **Validates: Requirements 28.6, 28.7**
    - Generated input: two consecutive runs plus a reset against a loopback database, asserting re-running changes nothing, the reset removes exactly the marked rows, and no untagged row is written or deleted
    - File: `tests/school-ai/exam-studio-demo.database.test.ts`; verify with `npm run test:school-ai:db`

  - [ ] 25.3 Expose the dataset through the SKO-452 demonstration path
    - Record the integration contract with the SKO-452 demonstration work and expose the Exam Studio dataset through that owner's demonstration path where one exists
    - _Requirements: 28.12, 29.9, 29.11_
    - Verify: `npm run test:school-ai`

- [ ] 26. Cross-cutting state coverage and migration safety

  - [ ]* 26.1 Write the property test for interface state totality
    - **Property 34: Every interface state renders its required region**
    - **Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.5, 24.8**
    - Generated input: every studio space crossed with every variant of the `SpaceState` union, now that all seven spaces exist; also covers the navigation confirmation naming unsaved fields and the long-running state readable after a reload
    - File: `tests/school-ai/exam-studio-states.browser.spec.ts`; verify with `npm run test:school-ai:e2e`

  - [ ] 26.2 Write the migration safety test
    - Apply each of the Exam Studio migration directories to a loopback database **already seeded with existing academic and financial fixtures**, and assert row counts and per-table checksums for every pre-existing table are unchanged
    - The assertion holds by construction because every new column is nullable or defaulted and no column is dropped or retyped; **the test exists to catch a future edit that breaks that**
    - _Requirements: 25.10, 30.1, 30.3, 30.7_
    - Verify: `npm run test:school-ai:db`

- [ ] 27. Checkpoint — slice 3 green and demonstrable
  - Run `npm run test:school-ai`, `npm run test:school-ai:db`, `npm run test:school-ai:e2e`, `npm run check:ui`, `npm run lint` and `npm run build`
  - Confirm the demo script creates and fully reverses its dataset against a loopback target, that a clarification reaches exactly its audience, that a remedy preview precedes any mark change, and that an evidence manifest verifies with a helper sharing no code with the producer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 28. Slice 4 migration and the expiry filter widening

  - [ ] 28.1 Write migration `20261014125000_school_ai_exam_studio_managed`
    - Add `SchoolAiExamAdmission`; add `delivery_policy_record_id` and `delivery_policy_version` to `SchoolAiExamAssignment` and `local_release_seconds` to `SchoolAiExamAttempt`
    - `config_hash_prefix` stores the **first 16 hex characters only**, never the key and never the full hash, so a stored audit row cannot be replayed as a credential
    - **Operator-applied**; never applied by code, a worker or the demo script
    - _Requirements: 12.4, 12.7, 12.11, 25.10, 30.1_
    - Verify: `npx prisma generate` then `npm run build`

  - [ ] 28.2 Widen the expiry sweep mode filter
    - **Must-fix, not inherit:** `src/lib/school-ai/exam-expiry.ts:54` filters `AND e.mode = 'STANDARD'` in the reference queries and in the locked per-attempt read. If managed attempts are admitted without widening it, **their deadlines would never be swept**
    - Widen the filter to the set of admitted modes in the same slice that enables managed admission, and add a database test for a managed attempt expiring
    - _Requirements: 12.1, 12.20, 16.6, 16.9_
    - Verify: new case in `tests/school-ai/exam-expiry.database.test.ts` via `npm run test:school-ai:db`

- [ ] 29. Managed Exam Mode admission

  - [ ] 29.1 Give the mode assertion a policy argument without opening the default
    - Change `assertSupportedExamMode` in `src/lib/school-ai/exam.ts:125` to `(mode: ExamMode, policy?: ResolvedDeliveryPolicy)`
    - **Called with one argument it behaves exactly as today** — `STANDARD` passes, everything else throws with the existing `/not enabled/` message — so the existing call site at `src/lib/school-ai/exam-service.ts:74`, which converts the throw into HTTP 409, stays correct while the policy plumbing lands
    - This supersedes the 12 October 2026 standard-browser-only decision by **adding** a tier, replacing a blanket refusal with a policy-driven decision that still refuses by default and preserves a refusal for any mode whose gates have not passed. The standard browser tier remains fully supported
    - Refuse a change of an in-progress attempt's effective tier from managed to standard
    - _Requirements: 12.1, 12.13, 12.20_
    - Verify: `npm run test:school-ai`

  - [ ] 29.2 Update the existing fail-closed test rather than deleting it
    - **Must-fix, not inherit:** `tests/school-ai/assessment.test.ts:67` ("unsupported secure/proctored modes fail closed") currently asserts single-argument behaviour at lines 68 and 69
    - **Keep both existing assertions verbatim** as the default-refusal case, and add cases for a gate-open policy (still throws, with a new message naming the open gate) and a fully-gated policy (does not throw)
    - _Requirements: 12.1, 12.8, 12.17, 12.20, 30.2_
    - Verify: `npm run test:school-ai`

  - [ ] 29.3 Build the managed mode service, admission route and per-request client verification
    - `POST /api/school-ai/exams/[id]/admission` recording an `Admission_Decision` with a reason code from the closed set; **on refusal withhold the candidate projection, leave the attempt unstarted and leave the authoritative deadline unset**
    - Refuse while any validation gate lacks a dated pass result, while the device matrix has no dated real-device result for the device class, and while the local release and independent emergency exit paths have no dated pass for the client version
    - Refuse an ordinary browser, an unsupported client version, an unsupported device class, a configuration mismatch, a private or incognito context and an expired policy
    - **Client verification is integration, never attestation.** Safe Exam Browser's documented mechanism is a request header — `X-SafeExamBrowser-ConfigKeyHash` and `X-SafeExamBrowser-RequestHash`, each a SHA-256 over the request URL concatenated with the Config Key or Browser Exam Key, which the server recomputes and compares ([SEB developer integration notes](https://www.safeexambrowser.org/developer/seb-integration.html), [Browser Exam Key specification](https://raw.githubusercontent.com/SafeExamBrowser/SafeExamBrowser-Website/master/developer/documents/SEB-Specification-BrowserExamKey.pdf)). A header is not a hardware attestation; published tooling appends these headers from an ordinary browser extension to reach SEB-gated pages ([nSEA](https://github.com/Chiogros/nSEA)). Treat a matching hash as **evidence of configuration, recorded as such**, and say so in the interface. Content was rephrased for compliance with licensing restrictions
    - Verify the hash **server-side on every allowlisted attempt surface**, not once at admission, because a per-request header check is the only thing the mechanism offers. Read the Config Key and Browser Exam Key from server configuration only (`SCHOOL_AI_SEB_CONFIG_KEY`, `SCHOOL_AI_SEB_EXAM_KEY`), never storing them in a `SchoolAiRecord` and never returning them to a client
    - Apply the same policy to attempts carrying accommodations and record the accommodation-specific client requirement where assistive technology is required; consume the SKO-410 accommodation records rather than reimplementing them
    - Record an authorized downgrade of an unstarted attempt with actor, reason, attempt identifiers and timestamp
    - _Requirements: 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.14, 12.19, 12.21, 23.7, 29.2, 29.4, 29.11_
    - **[read next-docs]** `01-app/03-api-reference/03-file-conventions/route.md`, `01-app/02-guides/data-security.md`
    - Verify: `npm run test:school-ai:db`

  - [ ] 29.4 Build local release and the independent emergency exit recording
    - On a final state, request `Local_Release` and record the outcome with the elapsed seconds against the 120 s target bound recorded on the policy
    - **The emergency exit is independent of Skoolee AI availability** — a client-side quit-password path on the managed client, documented on the policy as `emergencyExitPath`. If the server is unreachable the exit still works and the record arrives late; state that in the interface. Record each use with actor, attempt identifier and authoritative timestamp
    - _Requirements: 12.11, 12.12, 15.5_
    - Verify: `npm run test:school-ai:db`

  - [ ]* 29.5 Write the property test for managed admission
    - **Property 10: No silent managed downgrade**
    - **Validates: Requirements 12.5, 12.6, 12.7, 12.13, 12.14, 12.20**
    - Generated input: `arbitraryClientDescriptor` across client kind, version, device class, configuration match and private context, asserting the reason code is drawn from the closed set, the attempt stays unstarted, the deadline stays unset, and no in-progress attempt's effective tier changes from managed to standard
    - File: `tests/school-ai/exam-studio-managed.test.ts`; verify with `npm run test:school-ai`

- [ ] 30. Managed Exam Mode honest interface state

  - [ ] 30.1 Build the honest managed-mode interface state
    - While any validation gate is open, display Managed Exam Mode as **unavailable with the named open gate and its owner**, and exclude every statement that device lockdown is active
    - Display the delivery tier of every attempt with **distinct labels** for the Exam Room boundary tier and the Managed Exam Mode tier; display a downgraded attempt as standard tier with the recorded downgrade actor and reason
    - Label the Exam Room boundary in candidate and staff copy as an in-application restriction that does not control other applications, other browser tabs outside Skoolee AI, other devices or screenshots
    - Record in the Commercial Evidence Register that the shipping claim for Managed Exam Mode depends on the SKO-449 gates passing on real devices, with state `EXTERNAL_GATE_OPEN` and the owning ticket named
    - EN/AR/UR copy in `exam-studio-copy-managed.ts`; keyboard-operable with accessible name, role and state; tier conveyed by text as well as colour
    - _Requirements: 12.15, 12.16, 12.17, 12.18, 12.19, 11.10, 1.3, 1.8, 29.4, 29.10, 22.1, 23.2, 23.9_
    - Verify: `npm run check:ui` and `npm run lint`

  - [ ]* 30.2 Write the managed mode example tests
    - This is the requirements document's P26, correctly an example rather than a property: a gate is open or closed with no input variation
    - Cover each of the four gates open in turn refusing admission, the downgraded-attempt display, the distinct tier labels, the unavailable state with its named gate, the absent lockdown claim, and the recorded accommodation client requirements
    - File: `tests/school-ai/exam-studio-managed.test.ts` plus `tests/school-ai/exam-studio-managed.browser.spec.ts`; verify with `npm run test:school-ai` and `npm run test:school-ai:e2e`
    - _Requirements: 12.8, 12.9, 12.10, 12.15, 12.16, 12.17, 12.18, 12.21_

- [ ] 31. External gates — blocked by gate, not implementable

  These items **cannot be closed by code or by synthetic tests.** Each is recorded in the Commercial Evidence Register with state `EXTERNAL_GATE_OPEN` and its owning ticket, per R30.9. No task in this plan claims to close one. The work here is to keep the register honest and to wire the dated evidence in once it exists.

  - [ ] 31.1 **Blocked by gate (SKO-449).** Managed client and configuration validation, the Supported_Device_Matrix, the 120 s local release bound and the independent emergency exit, each on real devices
    - Property 10 proves the **refusal** logic is correct; it cannot prove a device locks down
    - Implementable part: the register entry, the dated-evidence intake path and the interface state that reads it
    - _Requirements: 12.19, 1.3, 30.9_
    - Verify: `npm run test:school-ai` on the register entry only

  - [ ] 31.2 **Blocked by gate.** Educational calibration of generation, semantic review and marking proposals against representative, properly authorized English, Arabic and Urdu material with independently reviewed expectations
    - _Requirements: 1.4, 1.5, 30.9_
    - Verify: `npm run test:school-ai` on the register entry only

  - [ ] 31.3 **Blocked by gate.** Camera, microphone, screen, printer, browser and assistive-technology device acceptance, including the documented manual path when a device is unsupported
    - Property 38 checks accessible names, roles, states and response preservation; complete acceptance requires manual testing with real assistive technology and an expert accessibility review, which these automated checks do not replace
    - _Requirements: 23.10, 30.9_
    - Verify: `npm run test:school-ai` on the register entry only

  - [ ] 31.4 **Blocked by gate.** Private storage permissions, recording retention and deletion, backup and restore, and worker dispatch monitoring in the intended environment
    - _Requirements: 13.6, 13.7, 13.8, 14.16, 30.9_
    - Verify: `npm run test:school-ai` on the register entry only

  - [ ] 31.5 **Blocked by gate (SKO-451).** Sustained realistic exam load, and a measured school pilot for any setup, review or correction effort figure
    - **No capacity claim originates in this feature.** A figure with no recorded measurement renders `not measured`
    - _Requirements: 16.14, 1.4, 1.5, 29.8, 30.9_
    - Verify: `npm run test:school-ai` on the register entry only

- [ ] 32. Final checkpoint — all four slices green
  - Run `npm run test:school-ai`, `npm run test:school-ai:db`, `npm run test:school-ai:e2e`, `npm run check:ui`, `npm run lint` and `npm run build`
  - Confirm the Commercial Evidence Register export lists every claim with its state and citation, that every unverifiable claim is an open external gate rather than a passing check, and that no interface copy, document or investor-facing text generated from this repository contains `cheat-proof`, `tamper-proof`, `fraud-proof` or `guaranteed detection`
  - Confirm the six migration directories are recorded as operator-applied with their review dates
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked `*` are optional test sub-tasks and can be skipped for a faster MVP. Core implementation sub-tasks are never marked optional.
- **Migrations are operator-applied.** All six are delivered as schema plus SQL and applied by an operator running `prisma migrate deploy` against a named, reviewed remote Supabase target. No application code path, worker, cron, route handler or script applies a migration, and the demo dataset script checks `_prisma_migrations` and exits rather than creating tables.
- **Three existing-code fixes are must-fix, not inherit:** the `localeCompare` determinism defect at `src/lib/school-ai/repository.ts:40` (task 1.1, which preserves `legacyWorkspaceRequestHash` byte-for-byte because its output is persisted), the `AND e.mode = 'STANDARD'` filter at `src/lib/school-ai/exam-expiry.ts:54` (task 28.2, in the managed slice where it becomes load-bearing), and `tests/school-ai/assessment.test.ts:67`, which is **updated and extended, never deleted** (task 29.2).
- **No property-based-testing dependency is added.** All 40 properties run on `node --test` through the seeded generators in task 1.6, at ≥100 iterations over a fixed seed list, printing the failing seed and shrunk input. Task 11.4 asserts `package.json` gains no new UI dependency, and `npm run build` gates on it.
- **E2E files are named `exam-studio-*.browser.spec.ts`**, correcting the design's `*.spec.ts` naming, because `tests/school-ai/playwright.config.ts` sets `testMatch: "*.browser.spec.ts"` and would not otherwise collect them.
- **Copy is split per area** (`exam-studio-copy-<area>.ts` re-exported from `exam-studio-copy.ts`) so no two tasks edit one copy file and parallel waves cannot conflict. Each UI task adds its EN, AR and UR entries together.
- **Tasks marked [read next-docs]** must re-read the named guides under `node_modules/next/dist/docs/` first. The load-bearing constraints: the Exam Room boundary cannot live in `src/proxy.ts` because proxy must not rely on shared modules and does not see Server Functions as routes; a streamed generation response cannot report a late failure as a 4xx because the status is fixed once the first chunk is sent; `context.params` is a promise; and Route Handlers are dynamic by default here because `next.config.ts` does not set `cacheComponents`.
- **Tasks in section 31 are blocked by gate.** They are listed so the register stays honest and the dated-evidence intake exists; none can be closed by code.
- Property-to-requirement traceability is carried on each test sub-task. Properties sharing one test file are placed in different waves so they never contend for the same file.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "1.6", "1.7", "2.1"] },
    { "id": 1, "tasks": ["1.3", "1.5", "1.8", "3.1", "4.1", "4.2", "6.1"] },
    { "id": 2, "tasks": ["3.2", "4.3", "5.1", "6.2", "7.1", "8.1", "10.1"] },
    { "id": 3, "tasks": ["3.3", "5.2", "6.3", "6.4", "6.6", "7.2", "8.2", "9.1", "11.1"] },
    { "id": 4, "tasks": ["3.4", "3.5", "5.3", "6.5", "7.3", "8.3", "8.5", "9.2", "11.2"] },
    { "id": 5, "tasks": ["5.4", "7.4", "7.5", "8.4", "8.6", "9.3", "11.3", "11.4"] },
    { "id": 6, "tasks": ["8.7", "9.4", "10.2"] },
    { "id": 7, "tasks": ["10.3", "10.4", "10.5", "11.5", "11.6"] },
    { "id": 8, "tasks": ["10.6", "10.7", "10.8"] },
    { "id": 9, "tasks": ["13.1", "14.1", "15.1", "15.2", "16.1"] },
    { "id": 10, "tasks": ["13.2", "14.2", "15.3", "15.5"] },
    { "id": 11, "tasks": ["14.3", "14.4", "15.6", "16.2"] },
    { "id": 12, "tasks": ["14.5", "15.4", "16.3", "16.7", "17.1"] },
    { "id": 13, "tasks": ["14.6", "15.7", "16.4", "16.5", "17.2", "18.1"] },
    { "id": 14, "tasks": ["15.8", "16.6", "17.3", "18.2"] },
    { "id": 15, "tasks": ["15.9", "18.3"] },
    { "id": 16, "tasks": ["15.10"] },
    { "id": 17, "tasks": ["20.1", "22.1", "23.1", "24.1"] },
    { "id": 18, "tasks": ["20.2", "21.1", "21.6", "22.2"] },
    { "id": 19, "tasks": ["21.2", "22.3", "23.2", "24.2"] },
    { "id": 20, "tasks": ["21.3", "22.4", "22.5", "23.3", "23.4", "24.3", "24.4"] },
    { "id": 21, "tasks": ["21.4", "22.6", "25.1"] },
    { "id": 22, "tasks": ["21.5", "25.2", "25.3", "26.2"] },
    { "id": 23, "tasks": ["26.1"] },
    { "id": 24, "tasks": ["28.1"] },
    { "id": 25, "tasks": ["28.2", "29.1"] },
    { "id": 26, "tasks": ["29.2", "29.3", "29.5"] },
    { "id": 27, "tasks": ["29.4", "30.1"] },
    { "id": 28, "tasks": ["30.2"] },
    { "id": 29, "tasks": ["31.1", "31.2", "31.3", "31.4", "31.5"] }
  ]
}
```
