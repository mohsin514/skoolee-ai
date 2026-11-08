# SKAI-905 — D5 educator evaluation recommendation

Research cut-off: 29 October 2026. Owner/decider: Mohsin Ali. **For founder approval; not yet recorded in the PRD decision log.**

## Options considered

| Choice | Options |
| --- | --- |
| Reviewers | Founder-recruited independent teachers vs pilot-school teachers vs paid panel |
| Item set | Ad-hoc samples vs fixed, versioned set per launch language and pack |
| Thresholds | Set after seeing results vs pre-registered before the run |

## Evidence, interpretation and limits

- [OpenAI evals guide](https://platform.openai.com/docs/guides/evals) (viewed 29 Oct 2026) recommends a fixed dataset and graders defined before iterating, so changes are measured against a stable baseline. Supports pre-registration; OpenAI stays the provider.
- With 30 items, a pass rate near 80% carries a ~±14–16 point 95% margin. Enough to catch a broken language or pack, not to claim fine-grained quality — 30 is a floor.
- D2 requires FBISE and BISE Lahore configured separately, KSA Arabic first and Dubai IGCSE 0580, so items must be stratified per pack, not pooled.
- Pilot-school teachers are also the buyer; independent reviewers reduce that conflict.

## Recommendation

**Founder-owned evaluation; ≥30 items per launch language (EN, UR, AR) per launch pack; thresholds pre-registered and committed before scoring.**
- Reviewers: two independent subject teachers per language, paid and not employed by a pilot school; a third adjudicates disagreements.
- Item set: stratified by topic and difficulty for each pack (FBISE Grade 9 Maths, BISE Lahore Grade 9 Maths, KSA intermediate Maths, IGCSE 0580); frozen and versioned before scoring; synthetic only.
- Thresholds: ≥90% of items curriculum-aligned; zero critical errors (wrong key, out-of-syllabus, unsafe content); AI marking agrees with reviewers on ≥85% of items; inter-rater Cohen's κ ≥0.6 or the run is repeated.
- A failed threshold keeps that pack's AI flag off; AI-05 stays in force.

## Risks

- Arabic maths reviewers are hard to recruit → start sourcing now.
- 30 items too few for subgroup claims → expand to 60 for any pack going to L5.
- Model or prompt updates invalidate results → re-run the frozen set on every change.

## What it unblocks

Per-pack AI release flags, AI-05 evidence, D4 demo credibility, SKAI-1020 pack decisions.

## Follow-up tickets

1. D5-01 Pre-registration document (items, rubric, thresholds) committed before scoring.
2. D5-02 Frozen 30-item sets per pack and language.
3. D5-03 Recruit and contract reviewers (two per language plus adjudicator).
4. D5-04 Eval runner that re-scores the frozen set on model/prompt change.
