# Skoolee — Multi-Tenant QA Master Plan, UX Audit & UI Audit

**Version:** 1.0  ·  **Date:** 2026-08-21  ·  **Owner:** QA Lead
**Scope:** 11 roles · 67 pages · 179 API routes · 96 Prisma models (93 tenant-scoped) · 17 permission modules

> **How to use this document.** Each section is a self-contained work package with stable IDs.
> Assign by section (e.g. "Agent A → §2 + §3", "Agent B → §6"). Every test case has:
> `ID · Precondition · Steps · Expected · Severity · Evidence required`.
> Report results in the tracker format in §13. Never mark a case PASS without the evidence artifact.

---

## 0. System Under Test — Ground Truth

### 0.1 Roles (`prisma/schema.prisma` → `enum UserRole`)

| # | Role | Tenant scope | Dashboard root |
|---|------|--------------|----------------|
| 1 | `APP_OWNER` | **Cross-tenant** (sees all schools) | `/owner` |
| 2 | `SUPER_ADMIN` | One school, all campuses | `/super` |
| 3 | `CAMPUS_ADMIN` | One school, one campus | `/admin` |
| 4 | `ADMIN` (legacy) | One school | `/admin` |
| 5 | `PRINCIPAL` | One school/campus | `/principal` |
| 6 | `TEACHER` | One campus, own classes | `/teacher` |
| 7 | `PARENT` | Own children only | `/parent` |
| 8 | `STUDENT` | Own record only | `/student` |
| 9 | `ACCOUNTANT` | One school, finance modules | `/accountant` |
| 10 | `LIBRARIAN` | One campus, library | `/librarian` |
| 11 | `RECEPTIONIST` | One campus, front-desk | `/receptionist` |

Shared surface: `/dashboard/*` (analytics, billing, classes, communications, marks, reports, settings, students).

### 0.2 Permission modules (`src/lib/permissions.ts`)
`students · fees · payroll · leave · attendance · timetable · exams · reports · staff · admissions · accounts · ai · library · front-desk · transport · inventory · dormitory`
Each × 4 actions (`view/add/edit/delete`) → **68 permission bits per role × 11 roles = 748 permission assertions.**

> **Verified 2026-08-21 against code.** The 748 figure is the *assertion surface*, not the number of distinct
> matrices. `DEFAULT_PERMISSIONS` defines role-specific matrices for only **6** roles (`TEACHER`, `PARENT`,
> `STUDENT`, `ACCOUNTANT`, `LIBRARIAN`, `RECEPTIONIST`). `CAMPUS_ADMIN`, `ADMIN` and `PRINCIPAL` all receive
> `DEFAULT_MATRIX` — **full view/add/edit/delete on all 17 modules**, including `payroll` and `accounts`.
> `APP_OWNER` and `SUPER_ADMIN` are `FIXED_PERMISSION_ROLES`: `assertPermission()` returns `true` before any
> DB lookup, so per-module overrides can never restrict them. Unknown/unmapped roles fall back to the
> `TEACHER` matrix (fail-safe). See PERM-P1 in §12 — PRINCIPAL defaulting to payroll delete needs a product decision.

### 0.3 Isolation mechanisms (⚠ TWO coexist — see FINDING-A in §12)
- **Row-level:** `school_id` column on **91/96** models + fail-closed Prisma guard (`src/lib/db/tenant-context.ts`, `tenant-models.ts`).
  The 5 models without `school_id` are global by design — `School`, `PendingRegistration`, `PlatformConfig`,
  `SuperAdminAuditLog`, `PasswordReset` — but each still needs an explicit isolation test (see ISO-GLOBAL-1..5 in §2.1):
  a `PasswordReset` or `PendingRegistration` row is enumerable across tenants if the token/email lookup is unscoped.
- **Schema-level:** `createTenantSchema()` in `src/lib/db/tenant.ts` provisions a dedicated Postgres schema with 12 tables per school.
- **Campus-level:** `campusId` on the JWT (`src/lib/auth.ts` → `AuthUser`), nullable.

### 0.4 Auth
JWT in cookie `skoolee_token`, carrying `userId, email, role, schoolId, campusId, schoolSlug, schoolStatus, onboardingComplete`.

---

## 1. Test Environment & Fixture Data (BUILD THIS FIRST — blocks everything else)

**Do not start any other section until §1 is signed off.** Cross-tenant tests are meaningless without adversarial fixtures.

### 1.1 Required tenants

| Fixture | School | Campuses | Purpose |
|---|---|---|---|
| `T1` | Alpha School Group | Alpha-North, Alpha-South | Primary happy path, multi-campus |
| `T2` | Beta Academy | Beta-Main | Isolation counterparty |
| `T3` | Gamma (standalone) | Gamma-Main | Single-campus / Path B provisioning |
| `T4` | Delta (SUSPENDED) | Delta-Main | Licence/subscription enforcement |
| `T5` | Epsilon (DELETED school, live sessions) | — | Reproduces the known stale-session dead-end |
| `T6` | Zeta (EMPTY — onboarded, zero data) | Zeta-Main | Empty-state UX audit |

### 1.2 Collision fixtures (the whole point)
Create **identical-looking** records in T1 and T2 so a leak is instantly visible and an ID guess is plausible:
- Same student full name + same roll number (`R-001`) in both.
- Same class name (`Grade 5-A`), same subject (`Mathematics`), same academic year.
- Same teacher email **local part** on different domains; and one *identical* email if the schema permits (test `users.email UNIQUE` scope — see EDGE-1.7).
- Same invoice number, same exam title, same book ISBN, same vehicle registration.
- Same `campus` name in both tenants.

### 1.3 User matrix per tenant
For T1 and T2, create **one user of every role** (11 each), plus:
- `T1-TEACHER-A` assigned to Grade 5-A only; `T1-TEACHER-B` assigned to Grade 6-B only.
- `T1-PARENT-A` linked to exactly 2 children; `T1-PARENT-B` linked to 1 child in a *different* campus.
- One user with **all permissions revoked** in every module (`T1-ADMIN-NULL`).
- One `is_active = false` user per tenant (`T1-*-DISABLED`).
- One user mid-`accept-invite` (unconsumed token), one with an **expired** invite token.

### 1.4 Tooling
- Record every fixture ID in `docs/qa/fixtures.json` — test cases reference IDs, never names.
- Two isolated browser profiles / storage contexts so two tenants can be live simultaneously.
- An HTTP client (curl/Postman) for direct API tests — **UI-only testing cannot prove isolation.**
- Capture cookie `skoolee_token` per persona into env vars `TOK_T1_TEACHER`, `TOK_T2_ADMIN`, etc.

### 1.5 Exit criteria for §1
- [ ] 6 tenants provisioned, collision data confirmed identical across T1/T2.
- [ ] 22+ personas can log in and land on their dashboard.
- [ ] All tokens captured; `fixtures.json` committed.

---

## 2. Tenant Isolation — The Critical Suite (P0)

> **Rule for the tester:** every case here is P0/Blocker. A single leak fails the release.
> Evidence = raw HTTP response body + status code, saved to `docs/qa/evidence/ISO-*.txt`.

### 2.1 Horizontal object access (IDOR) — run against **all 179 API routes**

Generate the route inventory first:
```bash
find src/app/api -name route.ts | sed 's|src/app/api||;s|/route.ts||' | sort > docs/qa/api-inventory.txt
```

**ISO-1.x — Cross-tenant read by ID**
| ID | Steps | Expected |
|---|---|---|
| ISO-1.1 | Auth as `T1-ADMIN`. GET every `/api/**/[id]` route using a **T2** resource ID. | `404` (preferred) or `403`. **Never** `200`. Never a body that confirms existence. |
| ISO-1.2 | Same, but as `T1-SUPER_ADMIN`. | Same. Super admin is school-scoped, not global. |
| ISO-1.3 | Same, as `T1-TEACHER` / `PARENT` / `STUDENT`. | Same. |
| ISO-1.4 | Compare response **timing** for a valid-but-foreign ID vs a random non-existent ID. | Delta < 50ms — no timing oracle. |
| ISO-1.5 | Compare error **message text** for foreign ID vs non-existent ID. | Byte-identical. No "not in your school" wording. |

**ISO-2.x — Cross-tenant write**
| ID | Steps | Expected |
|---|---|---|
| ISO-2.1 | As `T1-ADMIN`, `PATCH`/`PUT` a T2 record ID with a valid body. | 404/403, **and T2 record byte-unchanged** (verify by re-reading as T2). |
| ISO-2.2 | As `T1-ADMIN`, `DELETE` a T2 record. | 404/403, record still present. |
| ISO-2.3 | `POST` a create with `schoolId` in the body set to **T2**. | Body `schoolId` ignored; record lands in T1. Never trust client-supplied `schoolId`. |
| ISO-2.4 | `POST` a create with a **foreign FK** (e.g. T1 student assigned to T2 `classId`). | 400/422 validation error. Never a dangling cross-tenant FK. |
| ISO-2.5 | Bulk/import endpoints: upload a CSV where one row carries a T2 identifier. | Whole batch rejected or that row rejected; no cross-tenant write. |

**ISO-3.x — Cross-tenant list leakage**
| ID | Steps | Expected |
|---|---|---|
| ISO-3.1 | As T1, list every collection endpoint. Assert **every** returned `schoolId` == T1. | Zero foreign rows. Script this: fail on any `schoolId != T1`. |
| ISO-3.2 | Pagination: request page far beyond T1's row count (`?page=9999`, `?limit=100000`). | Empty set, not a spill into other tenants' rows. |
| ISO-3.3 | Search endpoints: query the exact collision string ("Grade 5-A", roll `R-001`). | Only T1's copy returned; result count == 1. |
| ISO-3.4 | Sort/filter params: `?sortBy=schoolId`, `?filter[schoolId]=T2`, `?where=...`. | Param rejected or ignored; never widens scope. |
| ISO-3.5 | Any endpoint accepting raw filter/`orderBy` JSON passthrough to Prisma. | **Must not exist.** Grep for `JSON.parse(req` near Prisma calls. |
| ISO-3.6 | Aggregate/count endpoints (`/api/analytics/*`, `/api/reports/*`). | Totals equal T1-only totals computed independently via direct SQL. |

**ISO-4.x — The fail-closed guard itself** (`src/lib/db/tenant-context.ts`)
| ID | Steps | Expected |
|---|---|---|
| ISO-4.1 | Call a tenant-scoped Prisma model with **no** tenant context set. | Throws. Never returns rows. This is the fail-closed contract. |
| ISO-4.2 | Re-run `scripts/gen-tenant-registry.mjs`; diff against committed registry. | No diff. If diff → a model was added without registration → **BLOCKER**. |
| ISO-4.3 | Identify the **3 models without `school_id`** (96 − 93). Justify each in writing. | Each is provably global (e.g. platform config). Any tenant data here → BLOCKER. |
| ISO-4.4 | Raw SQL: grep for `$queryRaw`/`$executeRaw`/`$executeRawUnsafe` across `src/`. Audit each for tenant predicate. | Every raw query has an explicit `school_id`/schema binding **and** parameterisation (no string interpolation of user input). |
| ISO-4.5 | Transactions (`$transaction`): confirm tenant context propagates into every statement. | Guard active inside the transaction closure. |
| ISO-4.6 | Concurrency: fire 50 parallel requests alternating T1/T2 tokens against the same endpoint. | Zero cross-responses. Proves context isn't stored in module-level/global state. |
| ISO-4.7 | Same as 4.6 but with a Node cold start + warm serverless container reuse. | No context bleed between invocations. |
| ISO-4.8 | Confirm the connecting DB role's `rolbypassrls` flag: `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user;` | Record it. If `true`, RLS is a no-op and the app guard is the sole defence — every §2 case becomes P0. |
| ISO-4.9 | Which of the three mechanisms (row-level / schema-per-tenant / RLS) is live for each entity? | A written, unambiguous rule exists before testing begins (FINDING-A). |

**ISO-5.x — Schema-per-tenant path** (`createTenantSchema`)
| ID | Steps | Expected |
|---|---|---|
| ISO-5.1 | Determine which tenants use schema isolation vs row isolation. Document the rule. | Written, unambiguous. (See FINDING-A.) |
| ISO-5.2 | Provision a new school; assert schema name is derived safely. | `schemaName` cannot contain quotes/`;` — it is interpolated into `CREATE SCHEMA "${schemaName}"` **unsanitised**. Attempt `evil"; DROP SCHEMA public;--` as school name/slug. |
| ISO-5.3 | Confirm the 12 provisioned tables match the Prisma models in use. | No drift; else half the app queries the wrong store. |
| ISO-5.4 | Delete a school — verify schema teardown and orphan rows. | Documented, reversible or hard-deleted per policy. |
| ISO-5.5 | Cross-check: does a row-level query ever read the per-school schema, or vice versa? | One source of truth per entity. |

**ISO-6.x — Campus isolation (second dimension)**
| ID | Steps | Expected |
|---|---|---|
| ISO-6.1 | `T1-CAMPUS_ADMIN` (Alpha-North) requests an Alpha-**South** resource. | 403/404. Same-tenant ≠ same-campus. |
| ISO-6.2 | `campusId` is `null` on the JWT for some roles. Request a campus-scoped resource. | Deterministic: either all-campuses (documented) or denied. **Never** "null matches everything" by accident. |
| ISO-6.3 | Teacher moved between campuses mid-session. | Old campus data disappears on next request, not only after re-login. |
| ISO-6.4 | Parent with children in two campuses of the same school. | Sees both children; no campus filter drops one silently. |
| ISO-6.5 | Reports/analytics for `CAMPUS_ADMIN`. | Aggregates cover only their campus. Verify against direct SQL. |

**ISO-7.x — Non-DB leak channels** (most commonly missed)
| ID | Channel | Test |
|---|---|---|
| ISO-7.1 | **File uploads** (`/api/uploads`) | Guess/enumerate a T2 file URL while authed as T1, and while **unauthenticated**. Storage keys must be tenant-prefixed + access-controlled or unguessable. |
| ISO-7.2 | **Generated PDFs** (`src/lib/pdf.tsx`) | Report-card URL for a T2 student → denied. PDF contains no T2 branding/data. |
| ISO-7.3 | **Email** (`src/lib/email`) | Templates render only the recipient's tenant branding; no bcc/leak of other tenants' addresses. |
| ISO-7.4 | **WhatsApp** (`src/lib/whatsapp`) | Message send scoped to tenant; per-tenant credentials never shared/cross-charged. |
| ISO-7.5 | **Notifications** (`/api/notifications`) | Realtime/poll channels are tenant-partitioned; subscribe with a T2 channel id as T1 → denied. |
| ISO-7.6 | **Background jobs** (`/api/cron`, `src/lib/queue`) | Job payloads carry `schoolId`; a job cannot process two tenants in one run without re-scoping. Cron endpoints require a secret — call `/api/cron/*` unauthenticated. |
| ISO-7.7 | **Caching** | Any cache key (Next.js `revalidate`, `unstable_cache`, CDN, `Cache-Control`) must include `schoolId`. Test: T1 loads page → T2 loads same route → assert no T1 data. **Check for `Cache-Control: public` on any authed route.** |
| ISO-7.8 | **AI features** (`src/lib/ai`, `/api/ai`) | Prompt contains only the caller's tenant data; PII pseudonymised before send (per policy); AI credit consumption billed to correct tenant; no shared conversation/vector store across tenants. |
| ISO-7.9 | **Audit log** (`/api/audit-log`) | T1 admin cannot read T2 audit entries. Every mutating action *is* logged with actor + schoolId. |
| ISO-7.10 | **Error pages / stack traces** | 500s never echo SQL, model names, or other tenants' IDs. |
| ISO-7.11 | **Autocomplete / typeahead** | Any `?q=` suggestion endpoint is tenant-scoped (classic leak point). |
| ISO-7.12 | **Exports** (CSV/XLSX) | Row count and contents match tenant-scoped UI exactly. |
| ISO-7.13 | **Webhooks** (`/api/stripe`, `/api/safepay`) | Signature verified; a replayed/forged event cannot upgrade another tenant's plan. |

### 2.2 Automation requirement
Isolation cannot be regression-tested by hand at 179 routes. **Deliverable: `scripts/qa/isolation-sweep.mjs`** that, for every route in `api-inventory.txt`, replays it with each of the 22 personas and asserts the matrix above. Ship it in CI as a required check.

---

## 3. Authentication, Session & Licence (P0)

| ID | Case | Expected |
|---|---|---|
| AUTH-1.1 | Login with valid creds, each of 11 roles. | Lands on role-correct dashboard; no flash of wrong nav. |
| AUTH-1.2 | Wrong password / unknown email. | Identical generic error + identical timing (no user enumeration). |
| AUTH-1.3 | Same email exists in T1 and T2. | Login resolves deterministically (document the rule) or asks which school. **Never** logs into the wrong tenant. |
| AUTH-1.4 | Tamper the JWT `role` claim → `APP_OWNER`. | Signature check fails → 401. |
| AUTH-1.5 | Tamper `schoolId` claim to T2. | Rejected. |
| AUTH-1.6 | Use an **expired** token. | 401 + redirect to login with `returnTo` preserved. |
| AUTH-1.7 | Use a token from a **deleted** school (T5). | Clean sign-out path exists. *(Known open defect: "Operations Locked" with no sign-out — verify fix.)* |
| AUTH-1.8 | Deactivated user (`is_active=false`) with a still-valid token. | Next request 401s. Not just blocked at login. |
| AUTH-1.9 | Role changed server-side mid-session. | New permissions apply within one request/refresh; privileges never *increase* without re-auth. |
| AUTH-1.10 | Logout. | Cookie cleared, back-button shows no cached authed content, token unusable. |
| AUTH-1.11 | Concurrent sessions, two devices. | Documented behaviour; logout-all option exists (missing? → §12). |
| AUTH-1.12 | Cookie flags on `skoolee_token`. | `HttpOnly`, `Secure`, `SameSite=Lax/Strict`, sane `Max-Age`, scoped `Path`. |
| AUTH-1.13 | CSRF on all state-changing routes. | Non-GET requests from a foreign origin rejected (SameSite alone is not sufficient for `Lax`+POST edge cases). |
| AUTH-2.1 | `/accept-invite` valid token. | Account created **in the inviting tenant only**. |
| AUTH-2.2 | Invite token reuse. | Second use rejected. |
| AUTH-2.3 | Expired invite. | Clear message + "request new invite" path. |
| AUTH-2.4 | Invite token from T1 used while logged in as a T2 user. | No account cross-linking; forced logout or clean error. |
| AUTH-2.5 | Invite email tampering (accept with a different email than invited). | Rejected. |
| AUTH-3.1 | `/forgot-password` for unknown email. | Same response as known email; no enumeration. |
| AUTH-3.2 | Reset token: reuse, expiry, cross-tenant use. | All rejected. |
| AUTH-3.3 | Password reset invalidates existing sessions. | Yes. |
| AUTH-4.1 | `/first-login` forced flow. | Cannot be skipped by direct-URL navigation to a dashboard. |
| AUTH-4.2 | `onboardingComplete=false` user deep-links to `/dashboard/students`. | Redirected to `/onboarding`. |
| AUTH-5.1 | Suspended school (T4) — every role logs in. | `/subscription-suspended`; read-only or fully blocked per policy; billing contact can still reach billing. |
| AUTH-5.2 | Suspended school — direct API POST. | Blocked at API layer, not just UI. |
| AUTH-5.3 | Licence/seat limit exceeded (add user beyond plan). | Clear blocking message with upgrade CTA; no silent success. |
| AUTH-5.4 | Plan downgrade with data above the new limit. | Documented behaviour; no data loss without warning. |
| AUTH-5.5 | AI credit exhaustion mid-generation. | Graceful stop, no partial charge, clear top-up path. |
| AUTH-6.1 | Rate limiting (`src/lib/rate-limit.ts`) on login, forgot-password, invite, AI, exports. | Enforced **per tenant AND per IP**; one tenant cannot exhaust another's quota. |

---

## 4. Role-by-Role Dashboard Packs

> For each role: run the **Common Pack** (§4.0) then the role's specific pack.
> Every role pack has the same four phases: **Access · Actions · Data correctness · Negative.**

### 4.0 Common Pack (run for all 11 roles — 11 × 30 cases)

| ID | Case | Expected |
|---|---|---|
| CP-1 | Land on dashboard after login. | Correct root; no 403 flash; no layout shift after data loads. |
| CP-2 | Every nav item visible. | Maps 1:1 to `canView` permissions. No dead links, no links to 403. |
| CP-3 | Every nav item **not** visible. | Direct-URL navigation to it → `/403`, and the API also denies. |
| CP-4 | Every button/action on every page. | Present only if permitted; disabled state has a tooltip reason. |
| CP-5 | Empty state (T6 tenant). | Purposeful empty state with a primary CTA — never a blank panel or "0" grid. |
| CP-6 | Loading state. | Skeletons matching final layout; no CLS; no infinite spinner on error. |
| CP-7 | Error state (kill the API, return 500). | Inline error + retry. Never a white screen or raw stack. |
| CP-8 | Offline / network drop mid-action. | Action not silently lost; clear retry. |
| CP-9 | Slow network (throttle 3G). | Optimistic UI or progress; no double-submit possible. |
| CP-10 | Double-click every submit button. | Exactly one record created (idempotency). |
| CP-11 | Browser back after a mutation. | No stale data, no resubmit prompt. |
| CP-12 | Deep link to every page while logged out. | Redirect to login → after login, return to the **intended** page. |
| CP-13 | Refresh on every page. | State preserved (filters, tab, page number in URL). |
| CP-14 | All numbers/dates/currency. | Consistent locale, timezone, and currency symbol per tenant. |
| CP-15 | Pagination + sort + filter combined. | Persist in URL; survive refresh; total count accurate. |
| CP-16 | Search with 0 results / special chars / very long string / emoji / RTL (Urdu). | Correct, no crash, no injection. |
| CP-17 | Long content (100-char name, 500 students). | No overflow, truncation with tooltip, virtualised or paginated list. |
| CP-18 | Responsive 320 / 375 / 768 / 1024 / 1440 / 2560px. | No horizontal scroll; tables scroll in their own container. |
| CP-19 | Mobile (Capacitor iOS/Android shells present). | Touch targets ≥ 44px; safe-area insets respected; no hover-only affordances. |
| CP-20 | Keyboard-only traversal. | Every action reachable; visible focus ring; logical order; no traps. |
| CP-21 | Screen reader pass (VoiceOver/NVDA) on one flow per role. | Labels, roles, live regions for toasts, table headers associated. |
| CP-22 | Colour contrast. | WCAG AA (4.5:1 text, 3:1 UI). Check disabled + placeholder + chart colours. |
| CP-23 | Dark mode (if supported) & forced-colours mode. | No invisible text; no hard-coded white panels. |
| CP-24 | Zoom to 200%. | Content reflows, nothing clipped. |
| CP-25 | Toasts/alerts. | Announce, auto-dismiss ≥ 5s, dismissible, don't cover the action. |
| CP-26 | Destructive actions. | Confirmation naming the exact object; undo where feasible; never a bare "Are you sure?". |
| CP-27 | Unsaved-changes guard. | Navigating away from a dirty form warns. |
| CP-28 | Form validation. | Inline, on blur, specific ("Roll number already used in Grade 5-A"), not a generic red box; errors summarised + focus moved to first error. |
| CP-29 | Print stylesheet / PDF export of any report on the page. | Legible, tenant-branded, no nav chrome. |
| CP-30 | Console + network clean. | Zero console errors; no 4xx/5xx on happy path; no PII in query strings. |

### 4.1 `APP_OWNER` — `/owner` (highest risk role)
- OWN-1 Cross-tenant list of all schools; counts match sum of tenants.
- OWN-2 **Impersonation / drill-into-tenant** (if present): entering T1 must set full tenant context; an obvious persistent banner "Viewing Alpha School as APP_OWNER"; exit restores owner context cleanly; every impersonated action is audit-logged with both identities.
- OWN-3 Owner **cannot** silently mutate tenant data without audit trail.
- OWN-4 Platform metrics (MRR, active schools, AI credits) reconcile with billing source of truth.
- OWN-5 Suspend/reactivate a school → takes effect for that tenant's live sessions within one request.
- OWN-6 Delete a school → confirmation requires typing the school name; downstream sessions handled (see AUTH-1.7).
- OWN-7 Owner-only routes (`/api/owner/*`) return 403 for **every** other role including `SUPER_ADMIN`.
- OWN-8 Negative: an `APP_OWNER` of nothing (no schools) → empty state, not a crash.

### 4.2 `SUPER_ADMIN` — `/super`
- SUP-1 Sees all campuses of own school only; campus switcher lists exactly their campuses.
- SUP-2 Creates campuses, users, and assigns roles; **cannot** grant `APP_OWNER`.
- SUP-3 Cannot edit their own role or delete themselves (last-admin lockout guard).
- SUP-4 `/super/billing`: plan, invoices, payment method, seat usage; matches `/api/billing` + Stripe/Safepay state.
- SUP-5 Permission-matrix editor: change TEACHER `fees.canView` → true, verify teacher's UI **and** API change; revert.
- SUP-6 Cannot edit `APP_OWNER`/`SUPER_ADMIN` matrices (documented as fixed).
- SUP-7 Cross-campus aggregate reports = sum of per-campus reports.

### 4.3 `CAMPUS_ADMIN` / `ADMIN` — `/admin`
- ADM-1 All ISO-6.x campus cases.
- ADM-2 Student CRUD: admission → class assignment → fee plan → parent link → ID card/report.
- ADM-3 **Two student rosters exist** (`/admin` vs `/dashboard/students`) — run every CRUD case on **both**, and diff field-by-field. Any drift = defect (see FINDING-B).
- ADM-4 Staff CRUD + invite flow + deactivation.
- ADM-5 Timetable builder: clash detection (teacher double-booked, room double-booked, class double-booked), across campuses.
- ADM-6 Academic year / cycle rollover (`/api/academic-cycle`, `cycleEvents.ts`): promote students, carry forward balances, archive last year. **Test rollover twice, and rollback.**
- ADM-7 Bulk import students (valid, malformed, duplicate roll, 5000 rows, wrong encoding, formula-injection cell `=cmd|...`).
- ADM-8 Legacy `ADMIN` vs `CAMPUS_ADMIN` — confirm identical or documented difference (FINDING-C).

### 4.4 `PRINCIPAL` — `/principal`
- PRI-1 Read-heavy: approvals (leave, admissions), school-wide analytics.
- PRI-2 Leave approval: approve/reject/comment → teacher notified → attendance auto-adjusted → payroll reflects unpaid leave.
- PRI-3 Cannot access payroll amounts unless permitted; verify matrix.
- PRI-4 Exam approval gate: principal publishes results → students/parents see them only after publish (test pre-publish visibility as STUDENT/PARENT).

### 4.5 `TEACHER` — `/teacher` (10 sub-pages)
- TCH-1 Sees **only own classes** — assert with `T1-TEACHER-B` requesting Teacher A's class ID.
- TCH-2 `attendance`: mark present/absent/leave, edit window (can they edit yesterday? last month? — test the boundary), bulk mark, weekend/holiday dates, duplicate submission for same date.
- TCH-3 `marks`: enter marks, > total marks, negative, non-numeric, blank, decimal; submit → locked after publish; audit trail on change.
- TCH-4 `tests`/`exams`: teacher can create quiz/class test but **NOT** mid-term/final (per code comment). Attempt via API with `examType=FINAL` → must 403.
- TCH-5 `students`: view-only per matrix — assert no edit/delete buttons **and** API denies.
- TCH-6 `leave`: apply, cancel, overlapping dates, exceeding balance.
- TCH-7 `ai` / `insights`: generation respects credits; PII pseudonymised; output reviewable before send (human-review policy page exists → enforce it).
- TCH-8 `reports`: report card generation for own class only; Urdu/English (`src/lib/urdu.ts`) rendering, RTL layout, font embedding in PDF.
- TCH-9 `timetable`/`calendar`: own schedule only; substitution handling.
- TCH-10 `classes`: class teacher vs subject teacher permission difference.

### 4.6 `PARENT` — `/parent`
- PAR-1 Sees **only own children**. Request another parent's child ID → 404. Request a T2 child ID → 404.
- PAR-2 Multi-child switcher: switching child changes **every** panel (attendance/fees/results/timetable); no stale data from previous child.
- PAR-3 Child in a different campus renders correctly.
- PAR-4 `fees`: view invoice, pay online (Stripe + Safepay), partial payment, overpayment, failed payment, duplicate payment, payment then refund; receipt PDF.
- PAR-5 Payment webhook race: close browser mid-payment → status still reconciles.
- PAR-6 `results`: only published results; unpublished → hidden (verify via API too).
- PAR-7 Parent of a **withdrawn/graduated** student — documented access window.
- PAR-8 Parent with 0 linked children → empty state with "contact school" guidance.
- PAR-9 Notifications/WhatsApp: opt-out honoured; message content contains no other child's data.

### 4.7 `STUDENT` — `/student`
- STU-1 Own record only; sibling's ID → 404.
- STU-2 `coursework`, `schedule`, `timetable`, `attendance`, `fees`, `reports` — read-only; assert no mutating API succeeds for this role on any of the 179 routes.
- STU-3 Fee visibility policy — should a student see family financial detail? Decide and enforce (UX/privacy question, flag to product).
- STU-4 Graduated/inactive student login behaviour.

### 4.8 `ACCOUNTANT` — `/accountant`
- ACC-1 Fees: structure setup, discounts/scholarships, late fees, waivers, partial payments, refunds, adjustments.
- ACC-2 Reconciliation: ledger totals == sum of invoices == gateway payouts. Verify with independent SQL.
- ACC-3 Rounding: currency to 2dp everywhere; no float drift in totals; test 1/3 splits.
- ACC-4 Payroll (`src/lib/payroll.ts`): salary run, deductions for unpaid leave (links to PRI-2), payslip PDF, cannot see own salary edit rights.
- ACC-5 Cannot access academic marks (matrix says `exams: false` — verify API).
- ACC-6 Financial reports export; cross-tenant totals never included (ISO-3.6).
- ACC-7 Negative amounts, zero-amount invoice, invoice for a deleted student, invoice in a closed academic year.
- ACC-8 Concurrency: two accountants record a payment on the same invoice simultaneously → no double credit.

### 4.9 `LIBRARIAN` — `/librarian`
- LIB-1 Catalogue CRUD; ISBN collision across tenants (T1/T2 same ISBN) → both independent.
- LIB-2 Issue/return: to a student of another campus, another tenant (must fail), an inactive student.
- LIB-3 Overdue calculation, fines flowing to the fee ledger (cross-module link → verify accountant sees it).
- LIB-4 Book issued twice, return without issue, lost-book workflow.
- LIB-5 Cannot access students module beyond lookup (matrix).

### 4.10 `RECEPTIONIST` — `/receptionist`
- REC-1 Front desk: visitor log, gate pass, enquiry capture.
- REC-2 `admission-queries` → converts to admission → appears in admin roster (cross-module link).
- REC-3 Cannot view fees/marks/payroll — verify API.
- REC-4 Phone/CNIC validation, duplicate enquiry detection.
- REC-5 PII handling: visitor data retention policy.

---

## 5. Cross-Module Interlink Matrix (the "actions are interlinked" requirement)

> These are the highest-value functional tests. Each is an **end-to-end chain across 2+ roles**.
> Evidence: a screen recording plus DB state before/after.

| ID | Chain | Roles | Assert at each hop |
|---|---|---|---|
| X-1 | Enquiry → Admission → Student created → Class assigned → Fee invoice auto-generated → Parent account invited → Parent pays → Accountant ledger updated | RECEPTIONIST → ADMIN → ACCOUNTANT → PARENT | Data identical at each hop; single `school_id`; audit entries at each step |
| X-2 | Teacher marks attendance → Parent sees it same day → Absent triggers WhatsApp → Monthly attendance % feeds report card → Principal analytics | TEACHER → PARENT → PRINCIPAL | Percentages agree across all four surfaces |
| X-3 | Exam created → Teacher enters marks → Grade calculated (`/api/calculated-grades`, `grade-config`) → Principal publishes → Student & Parent see result → Report card PDF (Urdu+English) → WhatsApp send | ADMIN → TEACHER → PRINCIPAL → STUDENT/PARENT | Grade boundaries applied from tenant's own `grade-config`, **not** another tenant's |
| X-4 | Teacher applies leave → Principal approves → Timetable substitution → Attendance of that class handled → Payroll deduction | TEACHER → PRINCIPAL → ADMIN → ACCOUNTANT | No orphan class period; payroll math correct |
| X-5 | Fee structure change mid-year → existing invoices unaffected → new invoices use new structure → parent sees correct amount | ACCOUNTANT → PARENT | No retroactive mutation |
| X-6 | Academic year rollover → students promoted → old data archived & still readable → new timetable → fees re-issued | ADMIN → all | Historical records immutable; reports for last year still correct |
| X-7 | Student transfers campus (Alpha-North → Alpha-South) | ADMIN | Attendance/marks/fee history follows; old campus admin loses access; new gains it |
| X-8 | Student withdraws / is deleted | ADMIN → ACCOUNTANT → TEACHER | Outstanding fees handled; marks retained for audit; teacher roster updates; no orphan FK |
| X-9 | Teacher deactivated | ADMIN | Classes reassigned or flagged; can't log in; historical marks retain attribution |
| X-10 | Library fine → fee ledger → parent pays → librarian sees cleared | LIBRARIAN → ACCOUNTANT → PARENT | Single source of truth for the amount |
| X-11 | Transport route assignment → fee component → attendance/pickup | ADMIN → ACCOUNTANT → PARENT | Consistent |
| X-12 | Plan upgrade (more campuses/students/AI credits) → limits lift immediately for all live sessions | SUPER_ADMIN → all | No re-login required; no stale limit cached |
| X-13 | Plan downgrade below current usage | SUPER_ADMIN | Explicit warning listing what exceeds; no silent data deletion |
| X-14 | Bulk communication (`/dashboard/communications`) to "all parents" | ADMIN → PARENT | Recipient list == tenant's parents exactly; count shown before send; **cross-tenant recipient = P0 leak** |
| X-15 | Notification fan-out on any of the above | all | Each recipient sees only their own; deep link in notification respects permissions |

**Concurrency chains (run each with two browsers simultaneously):**
- X-C1 Two teachers mark attendance for the same class/date → last-write-wins documented, or conflict surfaced.
- X-C2 Admin deletes a class while a teacher is entering marks for it → graceful error, no orphan.
- X-C3 Accountant voids an invoice while parent is on the payment page → payment rejected cleanly, no charge.
- X-C4 Super admin revokes a teacher's permission while the teacher has the page open → next action denied with a clear message, not a silent no-op.

---

## 6. UX Audit (heuristic + flow-level)

### 6.1 Method
For each of the 67 pages, score 1–5 against the rubric and log every violation as `UX-<page>-<n>` with a screenshot and a concrete recommendation. Do **not** log "looks dated" — log the specific heuristic broken and the fix.

### 6.2 Rubric (Nielsen + product-specific)
| # | Heuristic | What to check on every page |
|---|---|---|
| U1 | Visibility of system status | Loading, saving, saved, failed. Is the user ever unsure whether something saved? |
| U2 | Match to the real world | School vocabulary: "roll number", "section", "term", "fee voucher", "campus". No dev jargon ("entity", "tenant", "record ID") in user-facing text. |
| U3 | User control & freedom | Cancel, back, undo. Escape closes modals. No dead ends. |
| U4 | Consistency | Same action = same label, same icon, same position across all 10 dashboards. Build a component/label inventory and flag every divergence. |
| U5 | Error prevention | Confirmations, constraints, sensible defaults, disabled-until-valid. |
| U6 | Recognition over recall | Selected filters visible; breadcrumbs; the current campus/academic-year always on screen. |
| U7 | Flexibility | Keyboard shortcuts, bulk actions, saved filters for power users (admins live in this app all day). |
| U8 | Minimalist design | Information density appropriate to role: teachers want speed, principals want summary, parents want clarity. |
| U9 | Error recovery | Errors say what happened, why, and the next step. |
| U10 | Help | Contextual help where the domain is non-obvious (grade config, fee structure, permission matrix). |

### 6.3 Per-role first-run experience (highest UX risk)
For each of the 11 roles, a **fresh user with zero data** (tenant T6):
- Time-to-first-value: how many clicks until they do the one thing their role exists for?
- Is there an onboarding checklist? Does it persist and show progress?
- Are empty states instructive (what this is, why it's empty, one CTA)?
- Does the app ever show a role a feature they can never use? (Tease-then-403 is a UX failure.)

### 6.4 Critical flow walkthroughs (score each end-to-end)
1. School signup → onboarding → first campus → first class → first student.
2. Teacher's daily 5 minutes: log in → mark attendance → done.
3. Parent's monthly: notification → open → see result → pay fee.
4. Term end: marks entry → grade calc → publish → report cards → distribution.
5. Month end: fee generation → collection → reconciliation.
For each: count steps, count required fields, note every point of hesitation, every place the user must remember something from a previous screen.

### 6.5 Content & localisation
- Every string reviewed for tone and accuracy. No "Lorem", no TODO, no untranslated key.
- Urdu/RTL: layout mirrors correctly, mixed LTR numerals render right, PDF fonts embed, line-breaking correct.
- Dates: one format app-wide; timezone = tenant's timezone, not server's or browser's (test with a UTC+0 browser on a UTC+5 tenant — attendance dated "yesterday" is a classic bug).
- Currency & number formatting per tenant locale.
- Pluralisation ("1 students").

---

## 7. UI Audit (visual & component-level)

### 7.1 Design-system consistency
Build an inventory across all 67 pages, then flag every deviation:
- **Colour**: number of distinct hex values in use vs tokens defined. Any raw hex in components → defect.
- **Type**: distinct font sizes/weights/line-heights vs scale.
- **Spacing**: adherence to the spacing scale; inconsistent card padding across dashboards.
- **Radius, shadow, border**: one set of tokens.
- **Buttons**: primary/secondary/destructive/ghost — same look and same rules everywhere. Flag any page inventing its own.
- **Forms**: label position, required marker, help text, error text, input height — identical everywhere.
- **Tables**: header style, zebra, row height, alignment (numbers right-aligned, currency aligned on decimal), sticky header, sort affordance, row actions position.
- **Modals/drawers**: size, close affordance, overlay, scroll behaviour, focus trap.
- **Empty/loading/error**: three states per data component, consistently styled.
- **Icons**: one icon set, consistent size/stroke. *(Note: repo contains `fix_icons.py` — check for leftover inconsistency.)*
- **Toasts**: one position, one style, four semantic variants.

### 7.2 Per-page visual QA
| ID | Check |
|---|---|
| UI-1 | Alignment: no off-grid elements, optical alignment of icon+text. |
| UI-2 | Overflow: longest realistic string in every cell/label/badge. |
| UI-3 | Truncation: ellipsis + full value on hover/tap. |
| UI-4 | Density: table readable at 50 rows; charts readable at 12 series. |
| UI-5 | Hover/active/focus/disabled/loading state defined for every interactive element. |
| UI-6 | Charts (`/dashboard/analytics`, `/teacher/insights`): axis labels, units, legend, no-data state, colourblind-safe palette, tooltip accuracy. |
| UI-7 | Images/avatars: fallback initials, broken-URL handling, aspect ratio, lazy loading. |
| UI-8 | School logo/branding per tenant renders on dashboard, PDFs, emails — and **never** the wrong tenant's logo (isolation × UI). |
| UI-9 | Print/PDF layout: page breaks don't split table rows or a student's record. |
| UI-10 | Mobile shells (iOS/Android via Capacitor): status bar, notch, back gesture, keyboard covering inputs, pull-to-refresh. |
| UI-11 | Cross-browser: Chrome, Safari, Firefox, Edge + iOS Safari, Android Chrome. |
| UI-12 | Reduced-motion preference honoured. |

### 7.3 Accessibility (WCAG 2.2 AA) — full pass on 10 representative pages, automated pass on all 67
- Automated: axe-core on every route (script it, gate in CI).
- Manual: keyboard, screen reader, zoom 200%, contrast, focus order, form labelling, error identification, target size (2.2 AA: 24×24 min), no keyboard trap, skip link, landmark regions, page `<title>` unique per route, `lang` attribute (and `lang="ur"` on Urdu blocks).

---

## 8. Performance, Reliability & Data Integrity

| ID | Case | Target / expected |
|---|---|---|
| PERF-1 | Dashboard load with 5,000 students / 200 teachers / 3 years of history. | LCP < 2.5s, INP < 200ms; no N+1 (log Prisma query count per request — fail > 30). |
| PERF-2 | Large list rendering. | Server pagination; never `findMany()` unbounded. Grep for `findMany` without `take`. |
| PERF-3 | Report generation for 500 students. | Backgrounded with progress, not a 60s blocking request. |
| PERF-4 | One noisy tenant (bulk import, mass AI) | Does not degrade other tenants — per-tenant queue/rate limits. |
| PERF-5 | DB indexes on `school_id` + every common filter combo. | `EXPLAIN` shows index use; no seq scans on tenant tables. |
| INT-1 | Every FK has correct on-delete behaviour. | No orphans after deleting class/teacher/student/campus/school. |
| INT-2 | Unique constraints are **tenant-scoped**, not global. | e.g. `UNIQUE(campus_id, roll_no)` ✓ — but audit `users.email UNIQUE` (global!) → see FINDING-D. |
| INT-3 | Soft vs hard delete consistency. | Documented per model; soft-deleted rows excluded from every query and every count. |
| INT-4 | Money stored as decimal/integer minor units, not float. | Verify schema. |
| INT-5 | Timestamps timezone-aware; academic dates stored as dates not datetimes where appropriate. | Verify. |
| INT-6 | Backup/restore of a **single tenant**. | Possible and tested (needed for GDPR/deletion requests and for the schema-per-tenant model). |
| INT-7 | Migration re-run safety; `prisma generate` → **restart dev server** (known gotcha). | Documented in runbook. |

---

## 9. Security Suite (beyond isolation)

| ID | Case |
|---|---|
| SEC-1 | OWASP Top 10 pass on all 179 routes: injection, broken access control (covered §2), SSRF on any URL-accepting field, XXE, insecure deserialization. |
| SEC-2 | Stored XSS: put `<img src=x onerror=alert(1)>` in every free-text field (student name, remarks, notes, book title, visitor name) → rendered escaped everywhere including PDFs and emails. Check `src/lib/sanitize-html.ts` coverage. |
| SEC-3 | Formula injection in CSV/XLSX exports (`=`, `+`, `-`, `@` prefixes). |
| SEC-4 | File upload: type/size/extension validation, double extension, SVG-with-script, path traversal in filename, malware placeholder (EICAR). |
| SEC-5 | `createTenantSchema` SQL string interpolation — see ISO-5.2. **Treat as P0 until proven safe.** |
| SEC-6 | Mass assignment: send extra fields (`role`, `schoolId`, `isActive`, `id`, `createdAt`) on every create/update. |
| SEC-7 | Privilege escalation: every role attempts to grant itself a higher role via `/api/roles`, `/api/users`. |
| SEC-8 | Secrets: no keys in client bundle. Grep built output for `sk_`, `SECRET`, `JWT_SECRET`, DB URLs. Check `NEXT_PUBLIC_` vars. |
| SEC-9 | Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. |
| SEC-10 | Public routes (`src/app/(public)/*`, `/api/public/*`) expose zero tenant data; check for any tenant enumeration via slug. |
| SEC-11 | Audit log completeness: every mutating route writes an entry; log is append-only. |
| SEC-12 | PII in logs (`src/lib/logger.ts`): no names, emails, phones, or tokens in server logs. |
| SEC-13 | AI provider calls: PII pseudonymised per policy; no data sent to unapproved endpoints. |
| SEC-14 | Payment: no card data ever touches the app server; PCI scope confined to gateway iframes. |

---

## 10. Regression & Automation Deliverables

The team must ship these, not just a bug list:
1. `scripts/qa/isolation-sweep.mjs` — §2.2. **CI-blocking.**
2. `scripts/qa/permission-matrix.spec.ts` — asserts all 748 permission bits against live APIs.
3. Playwright suites: one per role (11 specs) covering the role's critical path.
4. Playwright suites for the 15 interlink chains (§5).
5. axe-core route sweep over all 67 pages.
6. Prisma query-count assertion middleware in test mode (N+1 guard).
7. Visual regression snapshots at 375px and 1440px for all 67 pages.
8. Seed script that reproduces the §1 fixture set deterministically.

---

## 11. Execution Plan & Assignment

| Wave | Sections | Blocking? | Suggested agent |
|---|---|---|---|
| 0 | §1 Fixtures | Blocks all | Agent-Fixtures |
| 1 | §2 Isolation + §9 Security | Yes — release gate | Agent-Security (must be the most senior) |
| 1 | §3 Auth/Session/Licence | Yes | Agent-Auth |
| 2 | §4.1–4.5 (owner, super, admin, principal, teacher) | No | Agent-RoleA |
| 2 | §4.6–4.10 (parent, student, accountant, librarian, receptionist) | No | Agent-RoleB |
| 3 | §5 Interlink chains | No | Agent-E2E |
| 3 | §6 UX audit | No | Agent-UX |
| 3 | §7 UI audit + a11y | No | Agent-UI |
| 4 | §8 Perf/Integrity | No | Agent-Perf |
| 5 | §10 Automation | No | Agent-Automation |

**Definition of Done for the whole programme:** zero open P0/P1; §2 sweep green in CI; §10 items 1–5 merged; §12 findings each closed or accepted in writing by product.

---

## 12. Findings Already Identified (implement/verify — do not re-discover)

> These came out of the code read. Each needs a decision, not just a test.

**FINDING-A — THREE coexisting isolation architectures (Severity: High, Architectural).**
1. **Row-level** — `school_id` on 93 of 96 Prisma models + the fail-closed application guard.
2. **Schema-per-tenant** — `src/lib/db/tenant.ts` provisions a dedicated Postgres schema with 12 tables per school.
3. **Postgres RLS** — `prisma/rls.sql`, 689 lines, verified correct but **not enabled** (see FINDING-I).

Three mechanisms for one concern means at least two are dead code, or data is silently split across stores. *Action:* establish in writing which is live for which entity **before** any isolation testing — otherwise testers will exercise a code path no request reaches. If schema-per-tenant is legacy, delete it; an unused `CREATE SCHEMA` path built by string interpolation is pure risk (see FINDING-E).

**FINDING-B — Two divergent student rosters (Severity: Medium, known).**
`/admin` and `/dashboard/students` have drifted. *Action:* field-by-field diff, pick one canonical implementation, redirect the other. Two rosters = two places to forget a tenant filter.

**FINDING-C — `ADMIN` legacy role undefined (Severity: Medium).**
`ADMIN` is "kept for backward compatibility" with a full-access default matrix identical to `SUPER_ADMIN`. That is a privilege-escalation surface. *Action:* enumerate live `ADMIN` users, migrate to `CAMPUS_ADMIN`, remove the enum value or restrict its matrix.

**FINDING-D — Global unique email (Severity: High, Product-blocking).**
Provisioned tenant tables declare `email TEXT UNIQUE` and `username TEXT UNIQUE` **without a tenant qualifier**. In a multi-tenant school product, the same person (a parent with children at two schools, a teacher at two campuses/groups) legitimately needs an account in more than one tenant. *Action:* decide the identity model — global identity with tenant memberships, or `UNIQUE(school_id, email)`. Also test AUTH-1.3.

**FINDING-E — Unsanitised schema name in DDL (Severity: P0 if reachable).**
`CREATE SCHEMA IF NOT EXISTS "${schemaName}"` and 12 `CREATE TABLE ... "${schemaName}"` use raw interpolation via `$executeRawUnsafe`. If `schemaName` derives from user input (school name/slug), this is SQL injection with DDL privileges. *Action:* whitelist `^[a-z0-9_]{1,40}$` and assert before use.

**FINDING-F — Permission defaults are fully-open (Severity: Medium).**
`DEFAULT_MATRIX` grants `view/add/edit/delete: true` on all 17 modules, and is assigned to `APP_OWNER, SUPER_ADMIN, CAMPUS_ADMIN, ADMIN, PRINCIPAL`. A newly added role or module therefore defaults to **full access** — a fail-open default in a system whose data layer is deliberately fail-closed. *Action:* invert the default; grant explicitly.

**FINDING-G — Stale-session dead-end (Severity: High, known open).**
A user holding a session for a deleted school gets "Operations Locked" with no sign-out route. *Action:* implement a guaranteed escape hatch — the sign-out control must render on every terminal/blocked state (`/403`, `/subscription-suspended`, operations-locked).

**FINDING-H — Repo hygiene (Severity: Low, but it affects QA reliability).**
~20 one-off `*.py` / `*.js` mutation scripts at repo root (`fix_api_auth.py`, `rewrite_register.py`, `disable_stripe.py`, `fix_tenant_exec.py`, …) plus `_diag_state.ts`, `prisma.config.ts.bak`, `repro-*.js`, and a nested `skoolee-ai/` directory. *Action:* move to `scripts/archive/` or delete. `disable_stripe.py` and `fix_tenant_exec.py` in particular must be confirmed as not runnable in any deploy path.

**FINDING-I — RLS written, verified, and switched off (Severity: High).**
`prisma/rls.sql` contains a complete second line of defence, tested 2026-08-14 (school A saw its 16 rows, school B its 2, unset GUC saw 0 — correctly fail-closed). It is disabled behind two documented blockers, chiefly that the app connects as `postgres`, which has `rolbypassrls = true` — so the policies are a total no-op today even with `FORCE ROW LEVEL SECURITY`. **Consequence for QA: the application guard is currently the only thing separating tenants.** There is no database-layer backstop, so any gap §2 finds is directly exploitable. *Action:* create the dedicated `skoolee_app` login role, repoint `DATABASE_URL`, then enable — as a scheduled change with a rollback, never as part of a QA run. Until then, treat every §2 case as P0.

**FINDING-J — No separate test database (Severity: Medium, process).**
One `DATABASE_URL` serves everything, and `db:reset` is `prisma db push --force-reset --accept-data-loss`. Destructive QA is therefore safe only while the URL points at localhost. *Action:* add a `.env.test` + `DATABASE_URL_TEST`, and make the CI isolation sweep (§10.1) target it explicitly so the suite can never be pointed at Supabase by accident.

### Missing-feature alerts (candidates to implement — confirm each before building)
| # | Gap | Why it matters | Priority |
|---|---|---|---|
| MF-1 | Session management / "sign out all devices" | AUTH-1.11; required after password reset and role change | High |
| MF-2 | MFA/2FA for `APP_OWNER` and `SUPER_ADMIN` | These accounts control whole tenants | High |
| MF-3 | Tenant-scoped data export & deletion (GDPR/right-to-erasure) | Legal, and needed for offboarding a school | High |
| MF-4 | Per-tenant backup/restore | INT-6 | High |
| MF-5 | Admin-visible audit-log **UI** (API exists at `/api/audit-log`) | Schools need to answer "who changed this mark?" | High |
| MF-6 | Impersonation banner + audit for `APP_OWNER` drill-in | OWN-2; support access without accountability is a liability | High |
| MF-7 | Explicit "last admin cannot be removed" guard | SUP-3; tenant lockout is unrecoverable without owner intervention | Medium |
| MF-8 | Bulk operations & saved filters for admins | UX U7 — admins process hundreds of records | Medium |
| MF-9 | Notification preferences per user/channel | PAR-9, deliverability & consent | Medium |
| MF-10 | In-app help / contextual docs for grade config, fee structure, permission matrix | UX U10 — highest-support-cost areas | Medium |
| MF-11 | Optimistic-locking / conflict resolution on concurrent edits | X-C1..C4 | Medium |
| MF-12 | Academic-year rollover **preview & rollback** | ADM-6 — irreversible bulk operation with no dry run is dangerous | High |
| MF-13 | Per-tenant rate limits & usage dashboard | PERF-4, AUTH-6.1 | Medium |
| MF-14 | Status/maintenance page + graceful degradation banner | CP-7/CP-8 | Low |
| MF-15 | Empty-state onboarding checklist per role | §6.3 | Medium |

---

## 13. Reporting Format (all agents use this)

```
ID:            ISO-2.3
Title:         Client-supplied schoolId accepted on POST /api/students
Section:       §2 Tenant Isolation
Severity:      P0 (Blocker) | P1 | P2 | P3
Role/Tenant:   T1-CAMPUS_ADMIN → T2
Precondition:  Fixture T1/T2 seeded per §1.2
Steps:         1... 2... 3...
Expected:      Body schoolId ignored; record created in T1
Actual:        Record created in T2; response 201
Evidence:      docs/qa/evidence/ISO-2.3.txt (request+response), screenshot, SQL proof
Impact:        Cross-tenant data write — customer data corruption
Fix owner:     
Status:        OPEN | FIXED | VERIFIED | ACCEPTED
```

**Severity definitions**
- **P0 Blocker** — any cross-tenant read/write/leak; auth bypass; privilege escalation; data loss; payment error.
- **P1 Critical** — a role cannot complete its core job; incorrect financial or academic figures; broken interlink chain.
- **P2 Major** — feature works but with a wrong state, confusing UX, a11y AA failure, or a missing guard.
- **P3 Minor** — cosmetic, copy, inconsistency.

**Daily rollup:** cases run / passed / failed by section, open P0s by age, blockers to progress.
