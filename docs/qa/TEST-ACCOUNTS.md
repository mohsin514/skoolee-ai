# QA Test Accounts

**Password for every account below:** `QaFixture#2026`

Sign in at <http://localhost:3000/login>. All addresses use `@example.invalid`, 
which is a reserved TLD that can never receive real mail — so this data can never 
be confused with a real school.


## Tenants

| Fixture | School | Slug | Status | Purpose |
|---|---|---|---|---|
| `T1` | Alpha School Group | `t1-alpha` | ACTIVE | Primary. Multi-campus (Alpha-North / Alpha-South / Central). |
| `T2` | Beta Academy | `t2-beta` | ACTIVE | Isolation counterparty — holds records identical to T1 on purpose. |
| `T3` | Gamma Standalone | `t3-gamma` | ACTIVE | Standalone. Its CAMPUS_ADMIN has **every permission revoked**. |
| `T4` | Delta Suspended | `t4-delta` | SUSPENDED | **Suspended** — licence and billing-block tests. |
| `T5` | Epsilon Doomed | `t5-epsilon` | ACTIVE (deleted) | **Deleted after its token was captured** — stale-session test. Cannot log in. |
| `T6` | Zeta Empty | `t6-zeta` | ACTIVE | **Empty** — onboarded with zero data, for empty-state tests. |

## Accounts

| Tenant | Role | Email | Signs in? | Notes |
|---|---|---|---|---|
| `T1` | ACCOUNTANT | `t1-accountant@example.invalid` | yes |  |
| `T1` | ADMIN | `t1-admin@example.invalid` | yes |  |
| `T1` | APP_OWNER | `t1-app_owner@example.invalid` | yes | Platform owner — sees all schools at `/owner` |
| `T1` | CAMPUS_ADMIN | `t1-campus_admin@example.invalid` | yes |  |
| `T1` | LIBRARIAN | `t1-librarian@example.invalid` | yes |  |
| `T1` | PARENT | `t1-parent@example.invalid` | yes | Has **2 children** (Ayesha Khan, Bilal Ahmed) |
| `T1` | PARENT | `t1-parent-b@example.invalid` | yes | 1 child on a **different campus** (Alpha-South) |
| `T1` | PRINCIPAL | `t1-principal@example.invalid` | yes |  |
| `T1` | RECEPTIONIST | `t1-receptionist@example.invalid` | yes |  |
| `T1` | STUDENT | `t1-student@example.invalid` | yes |  |
| `T1` | SUPER_ADMIN | `t1-super_admin@example.invalid` | yes |  |
| `T1` | TEACHER | `t1-teacher@example.invalid` | yes | Class teacher of **Grade 5-A** only |
| `T1` | TEACHER | `t1-teacher-b@example.invalid` | yes | Class teacher of **Grade 6-B** only — use to test cross-class access |
| `T1` | TEACHER | `t1-teacher-disabled@example.invalid` | 403 | `is_active = false` — refused at login *and* mid-session |
| `T2` | ACCOUNTANT | `t2-accountant@example.invalid` | yes |  |
| `T2` | ADMIN | `t2-admin@example.invalid` | yes |  |
| `T2` | APP_OWNER | `t2-app_owner@example.invalid` | yes | Platform owner |
| `T2` | CAMPUS_ADMIN | `t2-campus_admin@example.invalid` | yes |  |
| `T2` | LIBRARIAN | `t2-librarian@example.invalid` | yes |  |
| `T2` | PARENT | `t2-parent@example.invalid` | yes |  |
| `T2` | PRINCIPAL | `t2-principal@example.invalid` | yes |  |
| `T2` | RECEPTIONIST | `t2-receptionist@example.invalid` | yes |  |
| `T2` | STUDENT | `t2-student@example.invalid` | yes |  |
| `T2` | SUPER_ADMIN | `t2-super_admin@example.invalid` | yes |  |
| `T2` | TEACHER | `t2-teacher@example.invalid` | yes |  |
| `T2` | TEACHER | `t2-teacher-disabled@example.invalid` | 403 | `is_active = false` |
| `T3` | CAMPUS_ADMIN | `t3-campus_admin@example.invalid` | yes | **All 17 modules revoked** — every module should 403 |
| `T3` | SUPER_ADMIN | `t3-super_admin@example.invalid` | yes |  |
| `T4` | SUPER_ADMIN | `t4-super_admin@example.invalid` | yes | Suspended school — API calls return 402 |
| `T4` | TEACHER | `t4-teacher@example.invalid` | yes | Suspended school — API calls return 402 |
| `T5` | SUPER_ADMIN | `t5-super_admin@example.invalid` | 401 | School was deleted — session is dead by design |
| `T6` | SUPER_ADMIN | `t6-super_admin@example.invalid` | yes | Empty tenant — every screen should show an empty state |

## Collision data (identical in T1 and T2 on purpose)

Any of these appearing in the *other* tenant's screen is a data leak:

| Thing | Value |
|---|---|
| student | `Ayesha Khan / R-001` |
| class | `Grade 5-A / 2026` |
| subject | `Mathematics` |
| exam | `Mid Term 2026` |
| book | `978-0-262-03384-8` |
| campus | `Central Campus` |

Three things deliberately **cannot** collide, because the schema forbids it — 
`admissionNo` and `invoiceNumber` are still globally unique. `email` used to be too; 
that was FINDING-D and is now fixed, so one address can hold an account at several schools.


## Rebuilding

```bash
node scripts/qa/seed-fixtures.mjs && node scripts/qa/capture-tokens.mjs
```

The seed is deterministic — every id is derived by SHA-1 from a stable label, so 
re-running produces byte-identical ids and `fixtures.json` never churns.
