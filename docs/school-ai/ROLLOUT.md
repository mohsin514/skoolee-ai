# School AI implementation and rollout

The integrated workspace connects guided setup, reviewed school operations, assessment, private source processing and scheduled reviewed runs. [IMPLEMENTATION.md](IMPLEMENTATION.md) tracks every requirement and its external acceptance gates. Use the [go-live checklist](GO_LIVE_CHECKLIST.md) for exact environment variables and launch steps. Code completion and synthetic verification do not certify live educational quality or production operations.

The selected exam target is **standard browser exams without device lockdown**. Optional camera/screen clips cannot prevent app/tab switching or screenshots. Declining recording never blocks an exam or changes marks.

## Staff and student journeys

Authorized staff enter `/ai` from the shared sidebar. Seventeen permission-filtered tabs use shared controls, English/Arabic/Urdu, RTL, draft guards, loading/error recovery and reduced motion. Managers select a campus; teachers remain within assigned classes/subjects. Students enter `/ai/exams`.

- **Guided setup:** fullscreen questions adapt to new-school/import/migration paths, save progress and delegate missing facts. Reviewed year/classes, rooms/periods, staff invitations, guardian relationships, transfers/withdrawals, opening balances and cutover reconciliation use explicit typed drafts. Named subject/teacher selectors and exact holiday/weekly-closure previews complete the academic setup path. Roster mapping recognizes EN/AR/UR headings and retains editable rows, identity checks and exact admission receipts.
- **Contextual conversation:** shared text/audio/file/camera input is available on School AI domain tabs. Saved private history is bounded and rechecks current and historical access. Focused named-entity selection supplies only explicitly chosen current facts, masks names before generation and restores failed private requests in their original workflow. Conversation text never becomes approved school memory.
- **Voice:** explicit microphone consent starts turn-based recording, silence detection, transcription and available device speech playback. Interrupt, pause, resume and stopping release capture. Sessions end after five minutes/16 turns. Missing device voices or provider configuration leave text/manual paths available. A spoken yes does not approve operational changes.
- **Scanning:** up to ten photos support local crop, rotation, reordering, restore, manual perspective correction and clarity heuristics. A 15-minute QR handoff uses the same authenticated person/school/campus/access version on a phone. Originals remain private. Structured extraction includes page/region text, tables, math, figures, handwriting, confidence and uncertainty; missing pages/unreviewed regions block approval. Provider output starts unreviewed.
- **School memory:** facts/preferences retain source quote/version, owner, effective dates and explicit supersession. Conflicting current facts require resolution. Immutable revisions support comparison and restore as a new draft.
- **Exact changes:** save → approve current version → inspect exact preview → apply/receipt. Each operation rechecks current access, scope, evidence, versions and records. Changed state invalidates stale previews. Typed proposals cannot invoke arbitrary SQL or application routes.

## Operational coverage

Academic operations cover year activation/pause/resume/closure, reviewed promotion, observed attendance and dated substitute duties. History remains preserved. Descriptive risk reviews contain evidence, owner, due date and a human decision; no punitive judgment is inferred.

Timetables support editable single-class drafts and bounded joint solving for up to 24 classes/400 lessons. Current assignments, room capacity, periods, working days, calendar and actual lesson/exam windows constrain suggestions. Search exhaustion differs from infeasibility. Explicit publication validates the complete board. Manual and AI writers share booking fences.

Exam planning connects draft sessions, datesheets, rooms, seats and invigilators with front-row/edge/separate-room requests and neighbor/diagonal spacing. Limits remain 40 papers, ten classes, six rooms per paper and 1,000 seat assignments. Calendar/resource/leave changes cannot silently invalidate existing bookings.

Finance covers reviewed pending invoices, signed carry-forward reconciliation, payments, credits/refunds, opening balances, expenses and bank matching. Currency, enrollment, account scope, allocations and ledger invariants are rechecked. Revenue scenarios do not post money. Cutover compares six people/resource datasets and every existing financial currency/year against independently verified source totals; it does not invent past entries.

Announcements cover exact EN/AR/UR email, SMS and static approved WhatsApp variants. Preview shows eligible verified/consented guardians, deduplication, missing translations and exclusions. Parent settings allow opt-out. The queue worker rechecks current actor access, relationship rights, contact, consent and language immediately before sending. Legacy fee/report messaging and inbound WhatsApp honor these boundaries. Uncertain sends are not automatically retried. Provider acceptance differs from delivered/read receipts.

Payroll, transport, library, inventory and dormitory continue in existing reviewed workspaces; no unattended writes are claimed for those modules.

## Curriculum, assessment and results

Approved curricula carry edition, outcomes, exact source excerpts/pages, exclusions and separate section coverage. Source-grounded lesson/remediation plans need explicit teacher confirmation. Papers combine blueprint, approved question bank, pinned regeneration, solutions/rubric, immutable snapshots and deterministic scope/totals/duplicate/provenance checks. Independent semantic proposals solve without the supplied answer key; they may flag disagreement but do not prove correctness. Difficulty/item/distractor summaries describe observed moderated evidence, not universal calibration.

Standard exams use fixed approved snapshots and key-free candidate projections, server timing, sequenced autosave, reconnect/retry and final receipts. Responses include single/multiple choice, localized numbers, short/extended text and math/code text; code is never executed. Resources, extra time, supervised breaks, reader/scribe and large text are explicit. Availability end is a hard cap. Offline answer persistence is not promised.

Printing rechecks the exact approved paper and shares the candidate projection. Figures come from exact approved PNG/JPEG/WebP source regions, are cropped and verified on the server, and retain identical pixels in print and online snapshots. Private source provenance and answer keys are excluded from candidate output. PDF figures require a separate reviewed image capture; the editor explains this. The text-only semantic checker does not certify unseen diagrams.

Signed QR/script matching supports camera/image decoding where available and manual fallback. Staff confirm student/paper/pages. Key-free response proposals cite exact quotes from approved reviewed transcripts, leave unresolved questions visible and require explicit application/import. Written mark proposals cite student evidence and bounded rubric credits; staff moderate. Reviewed key corrections/regrading create immutable result revisions with scoped appeals and controlled publication. Gradebook transfer blocks conflicting existing marks/absences/reports and never silently scores nonstarters zero. Existing report review/publication remains separate.

## Optional recording

Staff may offer camera/screen capture before the first attempt; policy then freezes. Each stream requires candidate consent and browser permission. No audio is captured. Candidates may decline, stop or delete without losing answers or marks. The browser targets independently playable 20-second clips; delayed browser timers can make clips longer. The server caps uploads at 2 MiB each, 360 clips or 128 MiB per stream, with four starts. Gaps are possible; stopping discards the unfinished clip and releases tracks.

Only the candidate and currently authorized exam staff can open private clips. Current assignment membership is rechecked for reads/uploads. The review console paginates 50 sessions at a time; human notes do not change marks. Access expires immediately after the selected 1–7 days (default one); the worker removes files. Reserved storage keys allow abandoned-upload cleanup. This is optional evidence capture, not lockdown or automatic cheating detection.

## Workers, review and recovery

The existing `npm run worker:outbox` process handles communication, due exams, reviewed runs, document jobs and recording retention. Deploy and monitor it with the intended database/Redis/storage settings; API routes alone do not start it.

Runs hold at most 20 exact approved steps with scheduled start/expiry and atomic step receipts. Pause/cancel serialize against execution. Earlier completed steps remain visible when later work blocks. Policies bind operations, scope, expiry and run/action budgets to a saved reviewed version. Changed permissions/evidence/previews require a new review. History and replay recheck the original approved step's domain and subject permissions even if its current draft was reclassified. Billing-suspended work becomes blocked so it cannot starve later schools' queued runs. This is bounded deferred execution of reviewed work, not unrestricted autonomous decision-making.

Document extraction has durable queues, leases, bounded retries and explicit cancel/retry/apply. Successful extraction awaits application to the current draft. Original downloads, figures and job history retain every historical source classification and teaching-scope obligation; reclassifying a source does not expose its old original or extraction. Applying OCR to a broader classification is blocked. Original deletion requires a reviewed archived version and refuses referenced evidence. Unknown provider outcomes need explicit retry because external costs cannot always be undone. Raw prompts/audio and secrets are not written into AI usage logs.

Exam expiry uses the database UTC clock and bounded locked batches. Corrupt snapshots are reported without discarding saved answers or inventing marks. Recording deletion uses a bounded school cursor; failed storage deletion does not starve later schools. Document/recording processing is separate from the main outbox pump.

## Database installation

Use versioned migrations, never a production reset. The 45-migration chain through `20261013141000_school_ai_assistant_catalog` passed on an empty local PostgreSQL database and matched Prisma without schema drift.

The migrations add the workspace/execution/request/history contracts, conversations/tasks, result versions/appeals, substitutes, runs, carry-forward column, lifecycle constraints, document jobs, setup/risk/publication operation lists, channel preferences, recordings, schema index alignment and assistant metadata.

The reported database had partial schema adoption. The continuation `P3009` and further pre-existing feature tables were repaired through inspected forward completion. See [the incident procedure](../recovery/RUNBOOK.md#school-ai-continuation-collision-13-october-2026). The incident-specific scripts reject unexpected definitions and must not run against newer operation sets. The seven remaining additive migrations were then deployed successfully on the reported database. For another environment, follow its reviewed deployment process, regenerate Prisma and restart application/worker processes.

Application tenant/campus/permission checks are active. New tables include tenant policies. The repository's broader optional RLS deployment still needs its documented non-owner/service-role configuration. `db push` alone omits SQL triggers, CHECKs and policies and is not equivalent to migration deployment.

## Configuration

Use [.env.school-ai.example](../../.env.school-ai.example) with the deployment secret manager:

- Approved text gateway: `AI_PROVIDER=openai`, server-only `OPENAI_API_KEY` and evaluated `OPENAI_MODEL`.
- Media egress is disabled by default. Enable `SCHOOL_AI_MEDIA_EGRESS_APPROVED=true` and compatible document/transcription models only for an approved deployment. The adapter pins the approved official endpoint.
- Private S3 or `SCHOOL_AI_STORAGE_DIR` on a durable absolute private volume. Public directories, unsafe symlinks and redirected tenant paths are rejected. Ephemeral serverless filesystems are unsuitable.
- Existing email settings; optional Twilio account/token/Messaging Service for SMS; optional WhatsApp account/phone/token/API version and exact BODY-only template JSON. Live template approval and app-level guardian contact evidence/consent are required.
- Keep `EMAIL_DEV_MODE=true` and `DISABLE_OUTBOUND_MESSAGES=true` in local QA. Provider mocks are not delivery acceptance.

## Reproducing local verification

Provision empty disposable PostgreSQL at `127.0.0.1:55438`. Fixtures refuse other targets. Never use the test secret in a deployment.

```sh
export DATABASE_URL=postgresql://angular_dev_15@127.0.0.1:55438/postgres
export DIRECT_URL=postgresql://angular_dev_15@127.0.0.1:55438/postgres
export AUTH_SECRET=school-ai-isolated-browser-test-secret-only
npx prisma migrate deploy
npx prisma generate
npm run test:school-ai
npm run test:school-ai:db
npm run check:ui
npm run test:locale
node --import tsx tests/school-ai/browser-fixture.ts
node --import tsx tests/school-ai/assessment-browser-fixture.ts
```

The runner discovers all pure/database files. Fixture files run serially; deliberate race scenarios stay concurrent. The complete migration chain installs the production enrollment/invoice triggers.

Start a separate server in that isolated environment:

```sh
OPENAI_API_KEY= SCHOOL_AI_MEDIA_EGRESS_APPROVED=false EMAIL_DEV_MODE=true DISABLE_OUTBOUND_MESSAGES=true SCHOOL_AI_STORAGE_DIR=/private/tmp/skoolee-ai-test-documents NEXT_BUILD_DIR=.next/school-ai-tests npx next dev --hostname 127.0.0.1 -p 3106
```

Run `npm run test:school-ai:e2e`. Browser files run serially because some share locale/attempt fixtures. Reseed before the full suite; restart after Prisma client changes. Tokens, screenshots and reports remain in ignored `test-results/`.

`npm run test:school-ai:load` creates 32 synthetic candidates on the exact guarded target, signs in through HTTP, checks paced saves/stale retries/submission/receipts and cleans only its synthetic school. This is local load evidence, not a production capacity promise.

Calibration evaluates recorded results without sending school data:

```sh
npm run calibrate:school-ai -- --fixtures tests/fixtures/school-ai-calibration/synthetic-examples.json --synthetic-replay --require-gate
```

This example intentionally exits 2 with BLOCKED: synthetic replay does not prove live accuracy. Real evaluation requires source-hashed deidentified representative material, approved processing, reviewed expectations, exact-model outputs/request IDs and human adjudication. Default coverage is ten qualified cases per language/category across EN/AR/UR and text/handwriting/table/math/figure/assessment. Thresholds are team policy, not certification.

## Acceptance boundary

Final checks are recorded in [the implementation ledger](IMPLEMENTATION.md#verification): 173 pure tests, 329 database tests, all 192 browser scenarios after the affected exam-file rerun, shared UI/locale checks, TypeScript and production builds. Local verification covers state transitions, isolation, retries, shared controls, RTL and exams. Live AI quality, provider delivery, production storage/worker/backup settings, assistive devices/printers and measured school outcomes remain external release gates.

The separate legacy report-version suite requires ports 55410/3210 and its own fixture. School AI tests exercise changed gradebook/report paths but do not represent that independent suite. No live communications, real financial postings or school exams are sent by acceptance tests.
