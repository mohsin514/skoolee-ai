# SKO-391 — Standalone and school-group onboarding with resumable setup

QA date: 2026-10-17 · Isolated Postgres `127.0.0.1:55470/sko391` · isolated app `localhost:3470` (Next dev, this branch) · synthetic data only.

## What was built

- **Durable setup state** — new `institution_setups` table (migration `20261017120000_institution_setup`): institution type, adoption mode, current step, completed steps, a validated draft (school details + campus drafts + academic defaults), a version for optimistic concurrency, status/failed step/last error, completion result, and the named setup delegate.
- **Type-driven journeys** (not role-driven): standalone `structure → identity → package → academic → review`; group `structure → identity → package → campuses → academic → review`. The structure step asks "Use Exam Studio with my current systems" vs "Set up school operations" and one school vs group, with a preview when the shape changes. Campus drafts are never discarded.
- **Package step** in the wizard with Compare packages for the creator or a purchase-delegated colleague; the package page and the checkout-status page return to the exact saved step (`returnStep` now covers every step).
- **Transactional, retry-safe completion** — one `tenantTransaction`; the setup row is claimed by version so concurrent completions write once; a retry after success replays the stored result; an existing same-school campus with the same ID is reused; cycles are upserted per campus/year. Any failure rolls everything back, records `FAILED` + the failing step, and keeps every draft. Over-limit campuses stay as drafts (final action rechecks the current package).
- **Handover** — the creator can name a setup delegate (temporary password, forced change at first sign-in, MFA). The delegate never gets owner or membership rights and gets purchase rights only if ticked. Revocation deactivates the account and ends its sessions; stale versions are refused.
- **Non-owners** (staff without delegation) see a no-access explanation instead of an endless spinner; family and teacher roles are refused by the server.
- Wizard copy in **EN / AR / UR**, RTL mirroring, linked focusable error summary, `aria-current="step"` progress, single-column phone layout.

## Results

| Suite | Command | Result |
|---|---|---|
| Unit (setup rules, copy) | `npm run test:onboarding` | 11/11 pass |
| Database (isolated 55470) | `npm run test:onboarding:db` | 9/9 pass |
| Browser (Playwright, isolated app) | `npm run test:onboarding:browser` | 7/7 pass |
| Regression: checkout intents + payment routes | `node --import tsx --test tests/checkout-intents/domain.test.ts tests/checkout-intents/payment-routes.test.ts` | 8/8 pass |
| `tsc --noEmit`, eslint on touched files | | clean |

### Ticket verification mapping

| Acceptance / verification item | Evidence |
|---|---|
| Standalone asks identity once, one primary campus, owner membership; retried final request creates nothing new | DB test 1 (1 campus, 1 cycle, owner `campusId` = primary, replayed retry); browser test 1, shots 01–05 |
| Simultaneous completion writes once | DB test 2 |
| Group stays a group with one campus; drafts beyond limit saved | DB test 3; browser test 2, shots 06, 09 |
| Group: draft three campuses, cancel checkout, resume with drafts | browser test 2 — shots 07a (paid checkout unavailable in isolated env), 07b (cancelled checkout → "Resume saved setup" → exact step, 3 drafts) |
| Refresh / sign-out / another browser restore steps and drafts | browser test 1 (reload mid-journey), test 2 (Save and exit → fresh sign-in at 390 px), shot 08 |
| Interrupt after first group campus → recover without duplicates | DB test 4 (injected fault after campus 1: 0 campuses, FAILED, drafts intact; retry → 2 campuses, 2 cycles) |
| Real partial failure surfaced at the failing step | DB test 5 + browser test 3, shot 10 (campus ID owned by another institution) |
| Handover: new owner resumes same task; revoked delegate's review submission denied | DB test 8; browser test 4, shots 11–12 |
| Invitees / staff / family cannot set up or buy; no purchase prompt without delegation | DB test 9; browser tests 4–5, shot 13 |
| Final review shows type, activated campuses, academic defaults, package, optional work, systems of record | shots 05, 09, 15-* |
| Fees/payroll never block Exam Studio adoption | unit test; browser test 1 asserts it is not listed |
| No onboarding/package redirect loop after completion | browser test 1 |
| EN/LTR, AR/RTL, UR/RTL at 390 and 1440, no horizontal overflow | browser tests 6–7, shots 14-*, 15-* |

Screenshots: `01`–`15` in this folder. The temporary password in shot 11 was redacted before capture.

## Not covered / follow-ups

- Activating a campus kept as a draft *after* setup has no dedicated screen yet; the drafts are kept in `institution_setups.draft` and the owner can add them from campus management once the package allows it.
- The flagship-only minimum (roster, curriculum, approved source, data policy before a first reviewed assessment) and the PK/SA/AE package-availability fixtures belong to Exam Studio and the package catalogue; this ticket only guarantees that onboarding never requires fees or payroll.
- Not run here: 320 px and 768 px widths, 200 % zoom, and a full keyboard-only walkthrough. Focus moving to the error summary and to each step heading is asserted.
- Paid checkout could not complete in the isolated app because no payment provider is configured. The cancelled-checkout return was exercised with a recorded CANCELLED intent.
