# SKO-447 [073] Regional hosting and data lifecycle controls — QA 17 October 2026

## What was built
| Area | Implementation |
| --- | --- |
| Processing inventory | `src/lib/data-lifecycle/inventory.ts` reads the live configuration (database host, storage endpoint/region, AI provider order, SMTP/WhatsApp/SMS, vendor support). Each service is **verified** only with unexpired platform evidence (`DataServiceVerification`), otherwise **configured**, **unsupported** (provider decides location) or **not configured**. |
| Placement matrix + migration plan | `src/config/data-regions.ts` (engineering capability matrix, not a compliance claim); `planPlacement()` lists every service and blocks targets the core services (database, backups, files) cannot reach. Approved plans record that no data has moved. |
| Retention + legal holds | Versioned `DataRetentionSchedule` (append-only trigger, per-category minimums); `DataLegalHold` for a whole category or a record (release-once trigger, reason required). Preview shows eligible vs held; execution re-checks holds. Categories: in-app notifications, expired sessions, AI usage logs. |
| Requests | `DataLifecycleRequest` (EXPORT / RETENTION_DELETION / MIGRATION) with a DB check that the reviewer is not the requester, version-checked review, and receipts naming stores and backup-expiry behaviour. |
| Exports | Built from the **requester's** current scope (guardian permissions per section; families see published results only). Delivery is requester-only, token in a POST body (never a URL), 24-hour expiry, access re-checked at download, every download audited. |
| UI | `/settings/data` (`DataLifecyclePanel`), EN/AR/UR, RTL, stacked cards on phones. Admin-only sections are hidden for campus staff and guardians. |

Migration: `prisma/migrations/20261017090000_data_lifecycle` (4 tables, check constraints, two immutability triggers). Tenant registry regenerated.

## Results
| Check | Result |
| --- | --- |
| `tests/data-lifecycle/inventory.test.ts` | **5/5** |
| `tests/data-lifecycle/lifecycle.database.test.ts` (55438) | **5/5** |
| `tests/data-lifecycle/data-settings.browser.test.ts` (55438 / app 3107) | **5/5** |
| `npm run test:school-ai` / `test:school-ai:db` (regression after schema change) | **358/358**, **338/338** |
| `npx tsc --noEmit`, eslint on touched files | clean |

Browser coverage: owner sees 8 services with no unearned "verified" label and the isolated DB reported as this host; sets retention, places a record hold, previews 1 eligible / 1 held, requests a run that the owner cannot self-approve; a second administrator approves and exactly the eligible notification is deleted with a receipt; a guardian at 390 px requests an export for their own child, the owner approves (and never gets the link), the guardian downloads a file with no finance data; a UAE region change is blocked naming database and backups; Arabic and Urdu layouts are RTL with no horizontal overflow at 390 px.

## Boundaries
- No region is marked verified: no platform hosting evidence has been recorded yet. Regional and legal-transfer claims still need qualified review.
- An approved migration plan does not move data; execution and reconciliation remain a platform operation.
- Learner-level erasure is not performed here (owned by SKO-389 safe deletion); deletion covers the listed retention categories.
- Provider backups are not edited; deleted rows leave backups when the provider retention window expires.

## Screenshots
`data-owner-en-1440.png`, `data-retention-approved-en-1440.png`, `data-guardian-en-390.png`, `data-owner-ar-390.png`, `data-parent-ur-390.png` — synthetic accounts only.
