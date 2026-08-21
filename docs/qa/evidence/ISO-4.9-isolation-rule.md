# ISO-4.9 / ISO-5.1 / FINDING-A — The Isolation Rule (written, unambiguous)

**Status:** ESTABLISHED 2026-08-21. Required by the work order before §2 testing begins.

## The rule

> **Row-level `school_id`, enforced by the application guard, is the only live tenant
> isolation mechanism. Schema-per-tenant is write-only dead code. RLS is inert.
> Test the application guard; testing the other two exercises code no request reaches.**

## Mechanism 1 — Row-level + app guard — **LIVE. THE ONLY ONE.**

- `src/lib/db/prisma.ts` guard injects a `school_id` predicate on every tenant-model query.
- `src/lib/db/tenant-models.ts` registry: **91 tenant models, 5 global** (regenerated via
  `scripts/gen-tenant-registry.mjs`, ISO-4.2 → **no drift**).
- All 96 Prisma models map to the `public` schema. Every request reads and writes here.
- **This is the entire defence.** See ISO-4.8: no DB backstop exists.

> Correction to spec §0.3 / FINDING-A: the count is **91/96 tenant-scoped, 5 global** —
> not 93/96. The 5 global models are `School`, `PendingRegistration`, `PlatformConfig`,
> `SuperAdminAuditLog`, `PasswordReset`. ISO-4.3 should read "identify the 5", not "the 3".

## Mechanism 2 — Schema-per-tenant — **DEAD CODE (write-only)**

Provisioned by `createTenantSchema()`, then never read. Proof:

1. **Empirical:** the local DB contains **0 schemas** matching `school\_%`, yet holds a
   working seeded tenant (`Demo School`, `6863b0e2-…`). The app runs normally against a
   database where not one per-tenant schema exists.
2. **Structural:** nothing targets those tables. `withTenant()`, `tenantExec()` and
   `getTenantForUser()` were **deleted** from `src/lib/db/tenant.ts` (see its closing
   comment) because `SET search_path` leaked across the pooled connection. No
   `SET search_path` remains anywhere in `src/`.
3. **Non-critical by construction:** `register/route.ts:88-95` wraps the call in
   `try/catch`, sets `tenantSchemaReady = false` and continues on failure. Registration
   succeeds without a schema — it cannot be on the read path.
4. **Drift (ISO-5.3):** it provisions **12 tables** against **91 tenant models**. Even if
   something did read it, ~87% of the domain is absent.

**Action:** delete `createTenantSchema()` and its 3 call sites. It writes 13 DDL
statements via `$executeRawUnsafe` per registration for tables nothing queries — pure
attack surface (see FINDING-E) and ~13 wasted round trips per signup.

## Mechanism 3 — Postgres RLS — **INERT**

`prisma/rls.sql` (689 lines, verified correct 2026-08-14) is not applied: 0 tables with
RLS enabled, 0 policies, `TENANT_RLS` unset, and the connecting role is a superuser with
`rolbypassrls = true`. Full detail in `ISO-4.8-rls-status.txt`. **Not enabled** — the work
order prohibits switching it on during QA.

## Consequence for §2

- Test **only** the application guard. It is load-bearing and alone.
- Every §2 case is **P0** — no second layer will catch a miss.
- ISO-5.2 is closed (see `FINDING-E-verdict.txt`); ISO-5.3/5.4/5.5 are moot against dead
  code — reframe them as "confirm it is dead, then remove it."
