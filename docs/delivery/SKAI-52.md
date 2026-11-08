# SKAI-52 — shared list verification and corrections

## Contract and reproduced gaps

Continue the inventory and contract in SCRUM-306.md against dev 98ed29b6; PR #118 is merged. Do not duplicate open PR #133's access-notice test fix.

1. `/api/owner/users?page=999999999&limit=2` returned page 100000 with no rows despite seven authorized pages. The same implementation appeared in owner schools/sessions/audit and group users/audit. Count with the existing authorization predicate, then use shared `pageWindow` before reading. Empty lists have page/pages 1. Response field names and stable ID tie-breakers remain compatible.
2. Owner Next page changed displayed rows but not the URL. Refresh/Back could not restore the page. Schools/users/sessions now use the existing namespaced `useListField` hook; session active-only filtering is persisted too. Filter changes reset only their list's page and preserve console scope.

Reads remain GET-only. No persisted fields, migrations, jobs, notifications, external messages, report formats or mutation flows change. Existing drafts are not remounted by paging. Request version guards continue to suppress obsolete responses. Counts and rows use the same tenant/campus/role predicates. A separate count and read is not a snapshot guarantee during concurrent deletion; subsequent reads reclamp.

## Affected route/consumer inventory

| Surface | Read path / consumer | Verification |
| --- | --- | --- |
| Record search | `/search`, `/api/search`, search service | scoped rows/counts/options, denied roles, stable pages, Back, refresh, stale replies, offline/503/partial/timeout/429 |
| Roster | shared students panel, `/api/students` | URL filters, direct foreign-class and denied-role requests |
| Owner lists | `/owner`, `/api/owner/{schools,users,sessions,audit-logs}` | fixed stale pages; owner user browser page/filter/Back/refresh |
| Group lists | `/api/super/{users,audit-logs}` | stale/empty pages, two campus filters, foreign school and denied role |
| Finance | invoice tab | filter/page reset, scope, refresh/Back; no payment mutations |
| Operations | library catalogue/books API, inventory items API | library browser page two; 501 inventory rows over six bounded requests with unique IDs and no crossover |
| Exports/selectors | existing owner `loadOwnerPages`, shared `loadListPages` | existing 50+ page and partial failure tests; response fields retained |
| Admissions | queries API and admissions service | queries API already bounded with ID tie-breaker; application pipeline still capped at 300 and its summary loads matching active records — open acceptance work |
| Chat | conversation/message services | bounded limits, conversation-ID/message-ID ties and message cursors; no messaging changes |
| Other dashboards/forms/native | existing independently scoped consumers, Capacitor/Tauri wrappers | unchanged; device-specific and comprehensive consumer verification remains open |

## Reproduction and evidence

Synthetic QA-01 school with North/South campuses and QA-02 foreign school only. Local app `http://localhost:3152`, disposable DB `127.0.0.1:55452/skai52`. The guard accepts only this exact pair or the legacy `127.0.0.1:55438/postgres` test target. No deployed DB was used. Fixture users authenticate through normal login/MFA. Outbound messaging is disabled by the QA launcher. Fixture schools are removed by suite teardown.

```sh
bash scripts/qa/isolated-env.sh up 55452 skai52 --schema
bash scripts/qa/app.sh 3152 55452 skai52
# In another terminal, export DATABASE_URL for the isolated DB and the same QA AUTH_SECRET.
SEARCH_TEST_APP=http://localhost:3152 SEARCH_EVIDENCE_DIR=/tmp/SKAI-52-evidence \
  node --import tsx --test --test-concurrency=1 tests/search/records.browser.test.ts
```

- Full browser suite: 24/24 pass; additional focused run covers keyboard pager activation and 200% text capture.
- Existing targeted list/owner/search unit checks: 12/12 pass.
- `npm run test`: 209 pass, two existing skips; no failures.
- `npm run typecheck` with 12 GB heap: pass. `npm run build`: pass.
- `test:isolation`, `i18n:check`, `size:check`, `test:e2e:smoke`: absent from package.json; attempted and reported as missing. Existing PR workflow explicitly phases these scripts in. The browser suite supplies direct tenant/campus/denied-role and locale evidence; this does not claim those missing commands passed.
- `npm run lint`: pass on the final source tree after moving custom generated QA/build output outside the repository. No lint rules or CI gates were changed.
- Inventory traversal: 501 rows / six requests / 250 ms in one local run; not a production load-test or SLO claim.
- Evidence under `evidence/SKAI-52/`: EN owner page two, Arabic phone RTL, Urdu search, teacher redirect after denied search plus direct API 403, 200% text, and a WebM owner flow. Screenshots wait until the splash is gone. Teacher denial may redirect to the permitted teacher console; the screenshot is not a claim of a visible 403 banner.

## Review and remaining acceptance

This is L1 local evidence, not L3 deployment verification or independent QA sign-off. Do not mark Done. Move to In Review with the PR; move to Deployed to Dev only after actual deployment verification. Human approval and green required PR gates are required before merge.

Remaining app-wide acceptance: admissions' capped application collection/summary contract; comprehensive remaining dashboard/form consumer audit; supported native device runs; production-scale performance; independent QA on dev. The 200% capture and keyboard pager activation are focused checks, not a complete accessibility audit. These limitations must remain visible and must not be represented as full ticket closure.

Risk: low/medium. Read behavior changes for stale pages and empty-page metadata; valid-page ordering and access predicates remain intact. Rollback: revert this commit. No feature flag, migration, auth policy, AI/model/prompt/gateway or AI-05 evaluation change.
