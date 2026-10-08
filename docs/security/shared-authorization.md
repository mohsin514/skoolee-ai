# Shared authorization — policy 2026-10-08.1

SKO-207. The release review operates exclusively on synthetic accounts and records. It creates no school-facing security console and does not certify untested endpoints.

## Decisions

The session signature supplies an account ID and school ID, not an authorization snapshot. `resolveCurrentPrincipal` reads the active account and its current campus, profile and institution before every `getAuthUser` call, including layouts and server actions. A changed role or school invalidates an old session; a changed campus immediately narrows its next operation to the new campus. Missing/deleted accounts, inconsistent campus-school relations and deleted institutions fail closed. School suspension remains the existing billing-policy decision so billing recovery continues to work.

| Principal | Scope and action |
| --- | --- |
| APP_OWNER | Current active platform role; existing owner entry points explicitly authorize platform administration. |
| SUPER_ADMIN | Own institution; requested campuses must belong to it. Existing module permissions apply. |
| Campus staff | Current `User.campusId`; no campus means no campus-record access. Existing role/module action matrix applies. School-wide nullable-campus configuration remains readable. |
| PARENT | Explicit `Student.parentUserId`, within own school; linked siblings can span campuses. Names and email addresses confer no ownership. |
| STUDENT | Explicit `Student.studentUserId`, within own school; family record surfaces remain read-only. |
| Parent link | Signed, expiring single-child/single-school capability; current active child and operational school checked on every use. No cross-child selection or draft reports. |

First-time standalone ADMIN institution setup is a confined school bootstrap identity: the current active account must be unfinished and match the school registration contact, and can initialize at most one campus. Other school setup requests are denied.

The current schema has one staff campus membership (`User.campusId`). Employment appointments are not access grants. Institution-wide membership belongs to SUPER_ADMIN. Multiple simultaneous staff-campus memberships are not inferred from assignments; a future membership schema must explicitly extend this policy. Teacher class/subject permissions remain the existing module-specific checks, with current campus enforced underneath them.

Families see marks only when their exam is PUBLISHED, and report cards only in PUBLISHED/SENT. The dashboard, portal, AI context and report download share these predicates. Report notifications additionally require approved remarks and a published exam timestamp. Callers cannot bypass that rule with `approvedData: true`.

## Enforcement and coverage inventory

| Surface | Shared enforcement | Synthetic evidence |
| --- | --- | --- |
| Session/layouts/server actions (including settings, campus creation, teacher and institution onboarding) | Current principal resolver; chat/staff transaction wrappers preserve role and campus | All 11 roles; disabled, reassigned and role-changed accounts with existing token; role dashboards |
| Student dashboard | Explicit student scope and released predicates | Real STUDENT/PARENT page renders using namesake fixtures; AI/portal/fee/report ownership probes |
| Parent data, timetable, datesheet | `withParentScope` keeps tenant context inside callback | Own child, cross-campus sibling, namesake, foreign school and unknown ID; session and capability |
| AI insights | Shared child resolver, released marks/reports, current campus and AI permission | Production resolver with same-name pupils and draft/published records; stale-campus HTTP request |
| Report download | Shared report scope, module view permission, capability scope | Own/draft/foreign/unknown reports; guardian unlink; link remains authenticated |
| Fee child ledger/invoice export | Child scope / existing staff fee module permission | Own child allowed; namesake/foreign/unknown denied; family job status denied |
| Roster export/search | Existing staff module guard plus current campus | Cross-campus query denied; namesake CSV contains only current campus |
| Chat attachment signing | Current principal, live conversation membership and conversation campus | Unknown conversation denied before signing; no external storage call |
| Notifications | Live student-school-campus/guardian/recipient check; released-report gate | Mismatched guardian contact, foreign child and draft report rejected before delivery |
| Prisma reads/writes | School filter; current staff campus; included collections; scoped nested selectors and FK validation | Cross-campus scalar FK, nested connect, cross-school nested link, all-or-nothing mixed bulk; valid nested updates and earlier writes in same interactive transaction |
| User-attributed queued remarks | `runAsCurrentActor` reloads active membership and module action before execution | Reassignment narrows queued read; deactivation rejects queued action |

`prisma.$transaction(callback)` binds the transaction client for FK checks so a new child can reference a class created earlier in that transaction. Included collections need explicit scoping because Prisma query extensions do not run separately for nested reads. Nested connect/update/delete selectors carry scope into the actual mutation as well as the reference checks.

Denials use a stable generic message without the requested identity or record contents. Structured server audit events include a random decision reference, policy version, resource/action and reason. When principal context is available they include truncated SHA-256 actor/tenant identifiers, never names, emails, request bodies or record IDs. These are diagnostics, not an immutable audit ledger.

## Service identities and limits

PDF and unattributed remark workers are trusted internal school automation identities, bound to the required queue tenant; PDF campus payloads further restrict campus. Notification automation binds school and optional campus, derives current recipient relationships, and rechecks publication before delivery. Queue transport remains a privileged internal boundary. No public queue-enqueue producer was found in this checkout. The synthetic run tests the shared job/notification policies, not live Redis execution or outbound providers. Existing platform/webhook/cron `runUnscoped` call sites remain separately authorized service boundaries; this change does not claim exhaustive runtime coverage of every route or raw SQL/RLS.

Downloads now stream after current authorization instead of returning long-lived storage URLs. New local reports are not written beneath `public`; the proxy denies the legacy `/generated/reports` namespace including encoded separators/names and dot segments. Tests place a synthetic file there to prove those paths cannot serve it. Other static assets remain available. Previously issued external signed URLs retain their provider expiry; revoke/remove those objects separately if immediate historical-link revocation is required. Existing S3 notification attachments remain expiring capabilities. The parent capability is intentionally a 30-day single-child sharing link, not a revocable guardian session; changing guardian membership does not revoke an already-issued link. No database schema is changed here.

## Reproduce without real data

Use a disposable PostgreSQL database named `sko207` on loopback port 55407 and app port 3207. The test refuses any other database host/port/name or nonlocal app host. It never loads `.env`; explicitly set DATABASE_URL, DIRECT_URL and a local-only AUTH_SECRET for both processes. Create the database/schema using the repository's migration workflow (a fresh schema push also works for this synthetic-only check). Run `node tests/authorization/prepare.mjs` before starting the app: it writes a synthetic legacy report and an unrelated static control file so production static-file inventory is tested, not just nonexistent paths. Start `next dev --webpack -p 3207` (or the built `next start -p 3207`) with those variables, then run:

```sh
node --import tsx --test tests/authorization/access.test.ts
```

The suite creates unique school/account fixtures, cleans only those fixture schools and its synthetic public file, and never calls an outbound notification provider. It checks 11 roles at desktop 1440×960, tablet 768×1024 and mobile 390×844 using local Chromium; screenshots are written under `/tmp/sko207-<role>-<layout>.png`. Browser checks wait for rendered content; they are smoke coverage, not a comprehensive visual/accessibility audit. Run `next build --webpack` and `tsc --noEmit` with the same local environment. Preserve the test summary and build result alongside the PR; do not attach secrets or capability URLs from server logs.

## Release evidence (2026-10-08)

The production build and focused ESLint validation passed. The synthetic matrix exercises 26 named checks with repeated denied/allowed requests inside those cases. The final run uses a local production server, 11 temporary roles, two schools and three campuses; no real accounts, remote database or outbound providers are involved. The public-file test also verifies an unrelated control file is actually served, preventing a false pass from missing-file 404s.

Visual spot checks confirm populated dashboards render, but the existing student mobile view has a wide left gutter and the parent tablet header is compressed. Those are responsive UI follow-ups, not evidence of authorization failure. The test is a role/layout smoke check, not a claim of pixel-perfect layout or complete accessibility validation.
