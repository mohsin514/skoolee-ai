# §6 UX · §7 UI/A11y · §8 Perf & Integrity — findings

Audited 2026-08-21 against the local fixture set, signed in as T1-CAMPUS_ADMIN.

## Measurement caveat (read before trusting any contrast number)

The in-app browser pane intermittently stopped performing layout — `textContent`
held 25,138 characters while `innerText` was 0 and every `getBoundingClientRect()`
returned 0×0. axe-core silently skips hidden/zero-size elements, so in that state
it reported **0 violations on a page that genuinely had 27**.

Contrast counts below are only from runs where layout was confirmed working.
Label/name findings are DOM-based and unaffected. **A CI a11y sweep must assert
that layout happened** (a non-zero rect on a known element) before trusting a
clean result, or it will report green on a blank page.

---

## §7.3 Accessibility (axe-core 4.11.4, WCAG 2.0/2.1/2.2 A + AA)

### FIXED — critical: form controls with no accessible name
`/dashboard/students` reported 2 critical violations:
- `label` (1 node) — a bare `<input type="date">`
- `select-name` (2 nodes) — `<select>` elements with no accessible name

Root cause: `<Label>Date</Label>` sat next to `<Input type="date">` with **no
`htmlFor`/`id` pair**, so the visual association never reached assistive tech.
The two filter dropdowns had no label at all.

Fixed: `htmlFor`/`id` pairs for the attendance Date and Class controls,
`aria-label` on the class filter. (The status filter already had one — my first
patch duplicated it and the typecheck caught it; the original was kept.)
Verified in the DOM: `["Filter students by class", "Filter by status", "attendance-class"]`.

### OPEN — serious: colour contrast is a design-system defect, not page bugs
`/admin` 12 nodes · `/dashboard/students` 27 nodes.

Every failure is the same root cause: **opacity modifiers on the brand text
colour**. Measured examples —

| Class | Foreground | Background | Ratio | AA needs |
|---|---|---|---|---|
| `text-[#4d4354]/35` | `#bdb8c1` | `#faf7fc` | **1.83** | 4.5 |
| `text-[#4d4354]/50` | `#a59da9` | `#fdf6fe` | **2.47** | 4.5 |
| `text-[#4d4354]/55` | `#9b94a0` | `#faf7fc` | **2.77** | 4.5 |
| `text-[#4d4354]/70` | `#827b87` | `#ffffff` | **4.09** | 4.5 |
| `text-rose-600` on `bg-rose-50` | `#ec003f` | `#fff1f2` | **4.12** | 4.5 |

Compounding it, these appear at 9–11px. Not fixed here deliberately: the repair
is a token change (define a `muted-foreground` that is a solid colour meeting
4.5:1, and stop expressing "muted" as opacity on the base ink), which touches
the whole design system and should be one deliberate pass — §7.1's job, not a
scattering of per-element overrides.

### FIXED — §7.3 unique page `<title>` per route
All 67 app routes shared `"SkooleeAI - AI School Management Software"`. Only 13
files defined metadata, all of them marketing pages.

Cause: every dashboard page is `"use client"`, and per the Next 16.2.3 docs
(`generate-metadata.md`) the `metadata` export is **Server Components only** —
but it *is* supported in `layout.js`. The root layout already had the
`"%s | SkooleeAI"` template, unused.

Fixed by adding titles to the 7 existing server layouts and creating minimal
layouts for `accountant`, `librarian`, `receptionist`. Verified live:
`/admin` → `Campus Admin | SkooleeAI`; `/dashboard/students` → `Dashboard | SkooleeAI`.

---

## §6 UX

### OPEN — P2: full-screen "Processing…" splash on every navigation
Each route change replaces the entire viewport with a centred logo and
"Processing…" bar. Observed 8–14s on `/dashboard/students` in dev.

Breaks CP-6 ("skeletons matching final layout"): a full-page splash discards all
context, gives no hint what is loading, and makes every navigation feel like a
cold start. It also hides how slow a page actually is. Recommend per-panel
skeletons that preserve the shell.

### OPEN — P3: unnamed buttons on the login page
4 `<button>` elements with empty accessible names (icon-only controls:
password-reveal and the carousel dots). Keyboard and screen-reader users get
"button" with no indication of purpose.

### VERIFIED not-a-defect — login credentials in the URL
A synthetic `.click()` on the submit button produced
`/login?email=…&password=…`. Re-tested with a **real** trusted click: logs in
correctly to `/admin?view=academic-hub`, no credentials in the URL. The first
result was an artifact of bypassing React's handler — **not reported as a bug.**

Residual hardening note (P3): the form declares no `method`/`action`, so its
native fallback is a GET. If hydration ever fails, that fallback would put the
password in the URL. `method="post"` on the form makes the failure mode safe.

---

## §8 Performance & Data Integrity

### FIXED — PERF-5: tenant tables with no `school_id` index
`users`, `campuses`, `notifications` had no index on `school_id` — and the
tenant guard adds a `school_id` predicate to **every** query on them. Added
`@@index([schoolId])` to all three; re-check reports 0 tables missing.

(`EXPLAIN` still shows a Seq Scan at fixture volume — correct behaviour on a
32-row table, not evidence the index is unused. It cannot be demonstrated
without PERF-1's 5,000-student dataset.)

### OPEN — P2: no per-tenant timezone exists
No `timezone` field on `School` or `Campus` anywhere in the schema, and
attendance defaults to `new Date().toISOString().slice(0,10)` — a **UTC** date,
not the school's local one.

For a UTC+5 tenant the calendar date diverges from UTC between 00:00–05:00 PKT.
That window sits outside normal school hours, so day-to-day attendance marking
is mostly unaffected — but any cutoff, report boundary or automated job in that
window dates itself to the wrong day, and §6.5's "UTC+0 browser on a UTC+5
tenant" case is unhandled by construction.

Not fixed here: adding a tenant timezone touches all 151 datetime columns and
every date computation in the app. That is a deliberate migration, not a QA
fix, and doing it halfway would be worse than the current consistent-UTC
behaviour.

### INT-5 note — all 151 datetime columns are `timestamp without time zone`
This is the Prisma default and is internally consistent (Prisma normalises to
UTC), so it is not a defect on its own. It becomes one only in combination with
the missing tenant timezone above, and for the two raw-SQL date comparisons
(`/api/cron/risk-digest`, `/api/teachers/performance`), which bypass Prisma's
normalisation and should be reviewed against it.

### INT-4 — money types: PASS
17 money fields on `Decimal`/`Int`. One `Float`: `FeeStructure.taxPercentage`.
P3 — a float percentage multiplied into a Decimal amount reintroduces the
rounding drift the Decimal columns exist to avoid.
