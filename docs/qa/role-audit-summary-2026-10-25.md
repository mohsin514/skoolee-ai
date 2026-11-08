# Role audit and validation — 25 October 2026

All role PRs target `dev`. The latest validated base is `2bb81de3`; the combined local validation commit was `0a35e905` on `codex/role-audits-validation`. No PR was merged by this audit. Earlier group-administration work is now included in dev.

| Role | PR | Responsibilities exercised and gaps fixed |
| --- | --- | --- |
| Standalone administrator | #89 | Seven workspaces at desktop/phone widths; fee summaries use actual partial receipts and the invoice currency; platform-owner API denied. |
| Campus administrator | #103 | Class creation/edit/impact/transfer, history and scope; usable nested drawer, failed-save preservation, serialization retries, typed restore errors, scoped class-count AI and literal announcement bodies. |
| Principal | #105 | Academic/operations queue separation, assignment, snooze, source resolution/history and Arabic mobile; robust AI repair context; zero/ungraded metric regressions. |
| Teacher | #106 | Daily scope/counts, check-in recovery and school-time ordering; 37 domain AI regressions cover attendance, assessment, teaching and staff actions. |
| Student | #107 | Own released work, extensions, submission, closed work, source links, offline behavior and exam boundary; shared-device cache removed, refused/obsolete responses clear actions. |
| Parent | #108 | Siblings across campuses, per-child permissions, co-guardian decisions, explanation review, child query navigation and inbox recovery; retired tokens cannot alter scope. |
| Accountant | #109 | Invoice/payment filters and retry, Arabic/Urdu keyboard navigation, collection replay with exactly one payment/ledger entry; stale responses ignored and date labels visible. |
| Receptionist/front desk | #110 | Calls, callbacks, visitors, postal handover/delivery, complaints and certificate lifecycle; 38 role checks including school-day filtering, replay, confidential data and foreign-campus denial. |
| Librarian | #111 | Copy scans, issue/return/replay, concurrency, limits, fines, reservations, lost-copy/fees handoff; initial-load retry and truthful post-save refresh recovery at 320px. |
| Platform owner AI follow-up | #112 | Pilot requests stay pilot charters instead of silently becoming institution/account provisioning, in English, Arabic and Urdu. |

## Combined checks

- Production build **passed**, including source TypeScript, commercial contract, 8 UI adoption checks and capability inventory.
- **85 browser/API tests passed**. The standalone test additionally contains 14 workspace/viewport checks and an owner-API boundary check.
- **204 AI database tests passed**, including scope, confirmation, replay, privacy, handoff and provider-failure behavior.
- **98 AI unit tests passed**.
- **110 authorization tests passed**, 2 intentionally skipped; **31 navigation** and **22 focused metric/calendar/queue tests passed**.
- Library's separate 6 database regressions also passed during its role audit.
- All ten PRs were mergeable against dev at inspection. A common one-line restore-error fallback fixes a type error introduced by the latest dev update; it is included so individual branches can build independently.

## Live AI: passing focused fixes, incomplete final rerun

The initial real-provider baseline completed all 106 cases and had 93.4% recall, with zero unauthorized writes or PII egress. It identified actual campus intent/injection failures, malformed-response repair failures and an Arabic owner pilot-routing failure.

After fixes, focused rechecks passed: six campus cases, two admission/report cases and three owner pilot cases, across English, Arabic and Urdu. The final full attempt produced 28 successful cases and 78 `PROVIDER_UNAVAILABLE` errors after the configured API quota was exhausted. All proposed capabilities matched expectations (100% precision), with zero forbidden plans, unauthorized writes or PII egress. **This is not a fully passing 106-case live rerun.** It must be repeated after quota is available.

Vercel preview builds were rejected by the account's build-rate limit. GitHub checks were queued at inspection. The local production build passed; no preview deployment is claimed verified.

## Evidence and remaining scope

The downloadable local evidence package contains 73 screenshots and 4 document/PDF captures from the final combined run, plus reports and logs. Generated screenshots, build output, raw provider data and test artifacts are excluded from git. Product assets were preserved; no arbitrary source files were deleted.

This is a tested regression audit of the listed role workflows. It is not a claim that every possible product action or integration is complete. The capability inventory still reports **660 unconnected capabilities and 29 handlers awaiting classification**; these are backlog/inventory gaps, not implemented features. Real email/SMS delivery, payment gateways, SSO, hardware scanners/printers and every exam delivery mode were not exercised. Fixtures were synthetic and outbound messages were disabled.
