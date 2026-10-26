# SCRUM-309 — Confirmation dialogs for destructive actions

Jira: https://skooleeai.atlassian.net/browse/SCRUM-309

## Contract and inventory

The initial app inventory is `SCRUM-309-inventory.json` (85 files with confirmation consumers, 60 DELETE handler files, including intentionally denied methods). A filename inventory is not evidence that every domain has been verified; pending entries remain explicit.

`ConfirmAction` remains the single dialog primitive over `Modal`. Initial focus is the safe cancel action, including reason-required decisions. Escape/cancel preserve the parent form; in-flight writes cannot dismiss. The shared synchronous ref fence suppresses same-tick duplicate activation before React rerenders. Callers return the actual mutation promise. Rejected promises retain the reason and show a localized alert. Domain callers retaining their own error handling must only close on success.

Fourteen DELETE domains (transport routes/vehicles, dormitory types/rooms, library categories/books/members, inventory categories/stores/suppliers/items, student/staff documents, academic rooms) use the existing row overflow workflow with a shared reviewed-delete adapter:

* `DELETE ?id=&campusId=&preview=true` is read-only and returns `{success:true, preview:{id,label,count:1,version,blocked}}` after authorization. Version is a deterministic SHA-256 snapshot of current fields and relevant dependencies; models without `updatedAt` are covered.
* Confirmation sends the unchanged URL with `If-Match: <version>`. Missing/malformed review is 428, inaccessible record 404, denied authority 403, changed snapshot or blocked dependencies 409. Responses are non-cacheable. Old unreviewed clients fail safely and must refresh/update; no legacy bypass.
* The serializable transaction rereads the active actor, role, campus, accessVersion, module delete grant, operational school, target scope, version and dependent history. Deletion and a deterministic, actor/school/campus/action/record/version-bound audit receipt commit together. Retrying a committed version replays the receipt after authorization; concurrent database rollbacks retry the entire transaction. No confidential record fields enter receipts.
* State: idle → preparing → review/blocked/error → submitting → success/error/conflict. Network/provider/timeout ambiguity retains the same version for a safe retry; conflict requires an explicit fresh review. Cancel invalidates late preview results. Scope/query/drafts are not navigated or reset. Success announces deletion and reloads only the existing list.
* Historical book loans, copies, reservations and charges; dorm allocations; transport assignments/trips/stops; and inventory stock/history prevent destructive cascade loss. No partial domain deletion is committed.

No schema migration/backfill. Rollback: revert code; metadata receipts are harmless. Student/staff document deletion preserves the existing post-commit S3 cleanup boundary; failed cleanup remains best effort and is an explicit integration gap. Other covered operations do not enqueue jobs or call external providers. Academic room deletion uses the existing scheduling campus fence and retains timetable/exam dependency guards. Reports/exports read the same persisted records; history is preserved by dependency guards. Shared web controls are consumed by role portals and the unchanged Capacitor/Tauri wrappers; physical-device evidence is not yet recorded.

## Dependencies

Based on freshly fetched `origin/dev`, independently of unmerged PRs #118 (lists), #119 (views), #120 (request states). Shared consumer files overlap and require reconciliation when landing. No pagination/grid/calendar or unfinished SCRUM-308 audit scope is imported. The two existing CI harness corrections, if included, must be noted explicitly.

## Validation and current boundaries

Database tests exercise all fourteen domains, three simultaneous confirmations, one receipt, missing review, changed fields, new dependencies, denied role, same-school other campus, other tenant, revoked module permission and inactive actor. Real-app tests cover English draft/URL retention and stale review, offline retry and persisted deletion, direct API denial and Urdu mobile keyboard cancellation. Shared modal tests cover nested focus restoration, Escape/backdrop/drag, RTL, typed reasons, same-tick activation and rejected promises.

Wider consumer audit and independent domain-specific concurrency coverage are still in progress. Do not mark the entire card complete from these tests alone. In particular, reliable document-storage cleanup, remaining independent academic/finance/owner flows, additional broad-impact POST/PATCH commands, and physical client evidence require explicit accounting before the full-acceptance gate.

## Additional caller audit and CI corrections

The reviewed adapter lives in `src/components/ui/reviewed-delete.tsx`: `ReviewedDelete` serves existing row menus, and `ReviewedDeleteDialog` serves existing form/dashboard triggers. Both compose the same `ConfirmAction` primitive. Room capacity remains visible in the review detail. Closing or unmounting invalidates a pending preview.

Failure-retention corrections also cover invoice cancellation/overdue, care disclosure/member/workspace decisions, tax signoff, support-grant decisions, report publish/send, exam publish/paper removal, readiness approval, pickup restrictions, dorm reservation cancellation, billing requests and AI-run cancellation. These caller corrections preserve their existing domain contracts; they do **not** prove that every corresponding server already has full stale-version and retry protection. That verification remains pending.

CI harness corrections: outbox Node tests preload the repository `server-only` shim; corrections browser tests choose visible record selects and use the mobile kind selector below 640px. Confirmation tests open the canonical catalogue tab and wait for the app's connection probe to clear the offline banner before retrying. They never bypass the network mutation guard.

PR #121 at `2074d5f2` had two actionable test failures (confirmation offline synchronization and corrections mobile navigation); fixes are included and require a fresh CI run. Vercel demo's exact status was “Deployment rate limited — retry in 24 hours.” This is the authorized exception; no other failure is exempt. No reviews or inline findings existed at that inspection. Jira web link, PR comment and all three screenshot attachments were verified after reload; proof is `/tmp/scrum309/evidence/jira-pr-and-attachments.png`.
