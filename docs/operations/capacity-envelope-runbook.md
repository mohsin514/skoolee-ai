# Capacity envelope and cost per active school — runbook (SKAI-868, NFR-REL-06)

Status: **not measured on a deployed environment yet.** No capacity or cost claim may be published until a dated run
from this runbook exists. A metric with no samples is *unmeasured*, never a pass (`src/lib/capacity/objectives.ts`).

## What already exists in code (SKO-451)
| Piece | Where |
| --- | --- |
| Service classes, objectives, per-school background limits | `src/lib/capacity/policy.ts`, `objectives.ts`, `admission.ts` |
| Per-instance telemetry, pool pressure, queue age per school | `src/lib/capacity/telemetry.ts`, `service.ts` |
| Synthetic morning-peak harness (quiet + noisy windows) | `src/lib/capacity/harness.ts`, `tests/capacity/peak-profile.ts` |
| Runner writing JSON + Markdown reports | `scripts/capacity/peak-load.ts` -> `test-results/capacity/` |
| Owner console report and policy change review | `src/app/api/owner/capacity/route.ts`, `src/components/owner/CapacityReport.tsx` |

The runner refuses non-isolated targets (`assertIsolated`). Admission limits are **instance-local** (in-process
counters); the durable-job allowance in the outbox dispatcher is **platform-wide** (database-backed).

## 1. Inputs (from the pilot charter — owner fills in)
| Input | Value | Source |
| --- | --- | --- |
| Schools in pilot, students per school | _TBD_ | pilot charter |
| Peak simultaneous users (morning attendance window) | _TBD_ | pilot schedule |
| Exam: candidates per sitting, autosave interval | _TBD_ | exam timetable |
| Fee payment confirmations per peak hour | _TBD_ | finance office |
| Background work (exports, report cards) per day | _TBD_ | school admin |

## 2. Target environment
Production-like and isolated: same instance size, instance count (>= 2 to observe instance-local limits), Postgres
plan and pooler limits as production. Synthetic QA schools only (QA-01); provider calls stubbed unless the run states
otherwise. Record the release commit and environment in every report.

## 3. Profiles
1. **Quiet baseline** — protected work only, to get the fairness denominator.
2. **Mixed sustained** — exam saves/submissions + attendance + payment confirmation + one noisy exporter, for the
   length of the real morning/exam window from step 1.
3. **Spike** — 2x the peak simultaneous users for a documented short window.
4. **Dependency degradation** — add latency to the database or provider stub; expect bounded 429/503 with
   `Retry-After`, no hung requests.

Run: `DATABASE_URL=<isolated> CAPACITY_OPERATOR_EMAIL=... CAPACITY_OPERATOR_PASSWORD=... npx tsx scripts/capacity/peak-load.ts <origin> <seconds>`

## 4. After each run — reconcile, don't eyeball
- Every accepted exam submission and confirmed payment maps to exactly one final record/receipt.
- Noisy tenant background peak <= its limit (`peakOverLimit <= 0`); protected p95 within the fairness ratio.
- Overload recovered after traffic subsided with no lost accepted work (check outbox for stuck rows).
- Capture p50/p95/p99, error/timeout rates, rejections, queue age, recovery time.

## 5. Cost per active school (template)
| Line | Monthly cost at observed load | Basis |
| --- | --- | --- |
| App instances | _TBD_ | instance size x count x hours |
| Database + pooler | _TBD_ | plan |
| Storage + egress | _TBD_ | GB observed |
| Messaging / AI providers | _TBD_ | per-unit price x observed volume |
| Support | _TBD_ | hours per school |
| **Cost per active school / per student** | _TBD_ | total / active schools |

Next upgrade trigger: the first objective whose observed value exceeds 70% of its target at the mixed profile.

## 6. Human actions still required
- Pilot owner supplies the inputs in section 1.
- Ops provisions the production-like isolated target and runs profiles 1-4; attaches the reports to SKAI-868.
- Founder approves the cost table and the published school/user capacity statement.
- Rerun on every material release or customer-profile change.
