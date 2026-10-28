# SKAI-952 — deployment verification and Done levels

Audit: 2026-10-28. This records evidence, not independent QA sign-off.

## PR reconciliation

All 13 requested PRs are merged. No merge or closure was performed in this audit.

| Area | PRs | Evidence in dev commit `98ed29b6651ebf626de0dc6db355fcb0aac99b72` |
| --- | --- | --- |
| AI Workflows teacher slice | [51](https://github.com/mohsin514/skoolee-ai/pull/51) | Merge `75c5b8a8` is an ancestor |
| AI Workflows slices 3–9 | [54](https://github.com/mohsin514/skoolee-ai/pull/54), [55](https://github.com/mohsin514/skoolee-ai/pull/55), [56](https://github.com/mohsin514/skoolee-ai/pull/56), [57](https://github.com/mohsin514/skoolee-ai/pull/57), [58](https://github.com/mohsin514/skoolee-ai/pull/58), [59](https://github.com/mohsin514/skoolee-ai/pull/59), [60](https://github.com/mohsin514/skoolee-ai/pull/60) | Slice source commits and merge `599bc6bd` reached dev via [62](https://github.com/mohsin514/skoolee-ai/pull/62), not via #51 |
| Conversation recovery / library rename | [115](https://github.com/mohsin514/skoolee-ai/pull/115) | Merge `0de67d36` is an ancestor |
| List, grid/calendar, request states | [118](https://github.com/mohsin514/skoolee-ai/pull/118), [119](https://github.com/mohsin514/skoolee-ai/pull/119), [120](https://github.com/mohsin514/skoolee-ai/pull/120) | Merges `8ede23c3`, `b5b10771`, `07c6aee0` are ancestors |
| Reviewed deletion | [121](https://github.com/mohsin514/skoolee-ai/pull/121) | Merged 2026-10-28; `e6f5f9de` is an ancestor |

GitHub PR state and local `git merge-base --is-ancestor` / history inspected.
Individual stack merge commits #54–#59 are not ancestors; their source commits
are in the slice-9 ancestry. A merged badge alone would not prove dev inclusion.

## Environment evidence

| Environment | Recorded commit | Observed result | Limitation |
| --- | --- | --- | --- |
| Vercel project `skoolee-ai-dev` | `98ed29b6651ebf626de0dc6db355fcb0aac99b72` | GitHub deployment 7381378966 success, 2026-10-28 09:11:34 UTC | Successful deployment record does not prove custom-domain alias or capability acceptance |
| `dev.skooleeai.com/login` | Not independently exposed by page | EN/AR/UR login rendered; AR and UR document `dir=rtl` | Browser also displayed “No internet connection”; no authenticated capability pass claimed |
| Production promotion attempt | `733c2889e1d776f8b6b1c19a2536822e912d4777` | [Run 40630185404](https://github.com/mohsin514/skoolee-ai/actions/runs/40630185404) failed at missing `RELEASE_APPROVED_SHA` | This is an attempted commit, not the live production commit |
| Live production / each capability | Unknown | Operator must establish provider project, custom-domain alias and serving SHA | No L4 or L5 claim |

The successful dev deployment URL is
https://skoolee-ai-5gtquro21-mohsinali14993gmailcoms-projects.vercel.app.
The provider's “Production – skoolee-ai-dev” label means the dev project's
production deployment; it must not be confused with the application's production environment.

## Read-only post-deploy smoke

After confirming the deployment's successful provider status and its domain alias:

```sh
npm run test:deployment
node scripts/deployment/smoke.mjs https://dev.skooleeai.com > /tmp/SKAI-952-dev-smoke.json
```

Use the confirmed production origin for production; do not guess it from a branch
name. The smoke checks the real login HTML and an anonymous 401 session response
with null identity and `no-store`. It fails on redirects, provider login/error
pages, wrong status/body, timeout or network error. It uses no cookies, credentials,
database connection or app writes and does not load `.env`. Attach its JSON to the
ticket with the deployment URL, provider evidence and independently verified SHA.
A supplied or local SHA is never presented as a serving SHA by the script.

## Per-capability evidence and remaining gates

Copy this record onto each pilot capability ticket; populate only verified facts:

`Level · Environment / URL · Serving SHA / provider evidence · Capability · Permitted role @ QA-01 school/campus · Denied role · Second school/campus isolation · EN/UR/AR · Device / keyboard / 200% text · Server outcome · Evidence links · Tester / date`

- L1: built and local tests passed. L2: merged, with PR and merge evidence.
- L3: deployed to dev and capability verified, including the ticket's required QA evidence.
- L4: verified on production. L5: used in a pilot with evidence.
- The areas above have L2 merge evidence. Successful dev deployment plus public
  smoke is insufficient to grant each capability L3. No L4/L5 is established.
- Release owner must supply the approved production SHA, evidence link,
  forward-recovery decision and configured deployment destination through the
  existing controlled release process. Never bypass that gate.
- Confirm custom-domain-to-deployment identity, then run the smoke after deploy.
- An independent founder/tester must run capability acceptance using synthetic
  QA-01 data, attach server outcomes and screenshots, and stamp the verified level
  on each capability ticket. Author testing does not substitute for this QA.
- Keep SKAI-952 open until the environment/capability table and ticket evidence
  are complete. Only QA moves tickets to Done.

## Smoke execution evidence

[Initial run](SKAI-952-smoke-initial.json): login request failed/timed out;
anonymous session check passed. [One retry](SKAI-952-smoke-retry.json) at
2026-10-28 10:18:30 UTC: login 200 and anonymous session 401 passed.
Both outcomes are retained; this establishes public-route reachability only.
The observed transient failure and browser offline indicator prevent any claim
of a stable authenticated end-to-end capability verification.
