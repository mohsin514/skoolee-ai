# SKO-476 [101] Campus-scoped audit history and sensitive change coverage — QA 17 October 2026

## What was already there (kept)
`src/lib/audit-history.ts` (scope from the principal, forged campus rejected, stale cursor 409, minimized changes,
retention-hidden rows), `/api/audit-log`, the Activity History modal (EN/AR/UR, filters, cursor paging),
migration `20261015170000_audit_log_campus_scope`.

## Gaps closed
| Gap | Change |
| --- | --- |
| Campus admins saw almost no history (9 of 52 writers set campusId) | Tenant guard stamps the acting campus on audit events without one (`src/lib/db/prisma.ts`); school-level actors stay school-wide |
| No database append-only guarantee | Migration `20261017100000_audit_log_append_only`: UPDATE always refused; DELETE only after retention ends and with no active AUDIT_LOG hold (or school deletion cascade) |
| Holds without expiry | `data_legal_holds.expires_at`; AUDIT_LOG holds require one; expired holds stop counting everywhere; integrity purge skips held audit copies |
| No audited export | `/api/audit-log/export` CSV: same scope/minimization, `reports.view` permission (revocable per role), formula-safe cells, dated filename, one receipt per retry key |
| Mixed table names broke filters | `src/lib/audit-categories.ts` maps record types to every spelling in use |
| `/super` used an older modal without filters/export | Uses the shared modal, opened on the selected campus |
| No sensitive write-route inventory | `scripts/audit-coverage.mjs` + `npm run check:audit-coverage`; 34 routes gained atomic audit events via `src/lib/audit-events.ts`; 9 verified exclusions in `audit-coverage-exclusions.json`; inventory in `docs/operations/audit-coverage.md` (65/74 covered) |

Migration applied to the isolated QA database and to the dev Supabase database (status up to date, no drift).

## Results
| Check | Result |
| --- | --- |
| `tests/audit/history.database.test.ts` (55438) | **5/5** |
| `tests/audit/activity-history.browser.test.ts` (55438 / app 3107) | **3/3** |
| `npm run check:audit-coverage` | 65/74 covered, 9 reviewed exclusions |
| `tests/authorization/access.test.ts` (documented setup: prepare.mjs, fake S3 bucket `synthetic-only`) | **35/35** |
| `tests/corrections/*` (55413 / 3213) | **19/19** (×3) |
| `tests/academic/*` (55416 / 3216) | **11/11** |
| `tests/data-lifecycle/lifecycle.database.test.ts` | **5/5** |
| `npm run test:school-ai` / `test:school-ai:db` | **358/358**, **338/338** |
| `npx tsc --noEmit` | 0 errors |

## Observed, outside scope
- `/admin?view=leadership` deep link for a first-visit Urdu campus admin at 390px falls back to the overview; the menu path works (test navigates via "More → Admins & Access").
- Exam autosaves are intentionally not audited (start and final submission are).

## Screenshots (also attached in Linear)
`history-campus-admin-en-1440.png`, `history-owner-campus-filter-en-1440.png`, `history-export-denied-en-1440.png`,
`history-campusAdmin-ar-390.png`, `history-campusAdmin-ur-390.png` — synthetic accounts only.
