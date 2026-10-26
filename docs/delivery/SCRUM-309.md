# SCRUM-309 — Confirmation dialogs for destructive actions

Jira: https://skooleeai.atlassian.net/browse/SCRUM-309

## Contract and inventory

The initial app inventory is `SCRUM-309-inventory.json` (85 files with confirmation consumers, 60 DELETE handler files, including intentionally denied methods). A filename inventory is not evidence that every domain has been verified; pending entries remain explicit.

`ConfirmAction` remains the single dialog primitive over `Modal`. Initial focus is the safe cancel action, including reason-required decisions. Escape/cancel preserve the parent form; in-flight writes cannot dismiss. The shared synchronous ref fence suppresses same-tick duplicate activation before React rerenders. Callers return the actual mutation promise. Rejected promises retain the reason and show a localized alert. Domain callers retaining their own error handling must only close on success.

The eleven operations DELETE consumers (transport routes/vehicles, dormitory types/rooms, library categories/books/members, inventory categories/stores/suppliers/items) use the existing row overflow workflow with a shared reviewed-delete adapter:

* `DELETE ?id=&campusId=&preview=true` is read-only and returns `{success:true, preview:{id,label,count:1,version,blocked}}` after authorization. Version is a deterministic SHA-256 snapshot of current fields and relevant dependencies; models without `updatedAt` are covered.
* Confirmation sends the unchanged URL with `If-Match: <version>`. Missing/malformed review is 428, inaccessible record 404, denied authority 403, changed snapshot or blocked dependencies 409. Responses are non-cacheable. Old unreviewed clients fail safely and must refresh/update; no legacy bypass.
* The serializable transaction rereads the active actor, role, campus, accessVersion, module delete grant, operational school, target scope, version and dependent history. Deletion and a deterministic, actor/school/campus/action/record/version-bound audit receipt commit together. Retrying a committed version replays the receipt after authorization; concurrent database rollbacks retry the entire transaction. No confidential record fields enter receipts.
* State: idle → preparing → review/blocked/error → submitting → success/error/conflict. Network/provider/timeout ambiguity retains the same version for a safe retry; conflict requires an explicit fresh review. Cancel invalidates late preview results. Scope/query/drafts are not navigated or reset. Success announces deletion and reloads only the existing list.
* Historical book loans, copies, reservations and charges; dorm allocations; transport assignments/trips/stops; and inventory stock/history prevent destructive cascade loss. No partial domain deletion is committed.

No schema migration/backfill. Rollback: revert code; metadata receipts are harmless. These operations do not enqueue jobs or call external providers. Reports/exports read the same persisted records; history is preserved by dependency guards. Shared web controls are consumed by role portals and the unchanged Capacitor/Tauri wrappers; physical-device evidence is not yet recorded.

## Dependencies

Based on freshly fetched `origin/dev`, independently of unmerged PRs #118 (lists), #119 (views), #120 (request states). Shared consumer files overlap and require reconciliation when landing. No pagination/grid/calendar or unfinished SCRUM-308 audit scope is imported. The two existing CI harness corrections, if included, must be noted explicitly.

## Validation and current boundaries

Database tests exercise all eleven operations, three simultaneous confirmations, one receipt, missing review, changed fields, new dependencies, denied role, same-school other campus, other tenant, revoked module permission and inactive actor. Real-app tests cover English draft/URL retention and stale review, offline retry and persisted deletion, direct API denial and Urdu mobile keyboard cancellation. Shared modal tests cover nested focus restoration, Escape/backdrop/drag, RTL, typed reasons, same-tick activation and rejected promises.

Wider consumer audit and independent domain-specific concurrency coverage are still in progress. Do not mark the entire card complete from these tests alone. In particular, document deletion, independent academic/finance/owner flows, additional broad-impact POST/PATCH commands, and client evidence require explicit accounting before the full-acceptance gate.
