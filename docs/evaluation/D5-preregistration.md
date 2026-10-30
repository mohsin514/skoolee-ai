# D5 educator evaluation: pre-registration

Ticket: SKAI-1050 (D5-01). Decision: [D5 educator evaluation](../product-review-2026-10/d5-educator-evaluation.md). Registered: 29 October 2026, before any scoring. Owner: Mohsin Ali.

This document fixes the items, rubric, thresholds and procedure **before** any result is seen. Changing any of them after the first scored run needs a new registration version (see Versioning). The thresholds are encoded in `src/lib/ai-evaluation/educator/metrics.ts` (`D5_THRESHOLDS`); the code and this document must match.

## 1. Scope

| Evaluation pack | Catalogue packs it gates | Languages |
| --- | --- | --- |
| `fbise-g9-maths` | `fbise-*` | EN, UR, AR |
| `bise-lahore-g9-maths` | `bise-lahore-*` | EN, UR, AR |
| `ksa-intermediate-maths` | `ksa-moe-*` | EN, UR, AR |
| `igcse-0580` | `cambridge-0580-*` | EN, UR, AR |

Packs are scored separately and never pooled (D2).

## 2. Items

- At least **30 items per language per pack**, stratified by topic and difficulty (easy, medium, hard) across the pack's syllabus. A pack going to L5 needs 60.
- Items are written by educators, not by the AI and not by the engineering team. Each has a stem, a reference answer, a mark allocation and a **synthetic** learner response for the AI to mark. No real student work and no personal data. The runner refuses any prompt that fails `assertNoPII`.
- Format: `evaluation/educator/items/<pack>/<language>/items.json`, schema in `src/lib/ai-evaluation/educator/item-set.ts` (schema version 1).
- A set is **frozen** before scoring with `pnpm eval:educator freeze <items.json>`, which records a SHA-256 of its content. The runner refuses any set that is not frozen, was edited after freezing, contains placeholders, or has fewer than 30 items.
- The repository holds only **placeholder sets** (one item each, `"placeholder": true`). They exist to test the tooling and are never recorded as results.

## 3. Rubric (per item, per reviewer)

| Field | Question | Values |
| --- | --- | --- |
| `aligned` | Is the AI's handling of this item consistent with the pack's syllabus (correct scope, terminology and language)? | yes / no |
| `critical` | Is there a critical error: a wrong answer key, out-of-syllabus content, or unsafe content? | yes / no |
| `mark` | What mark would you award the synthetic response? | 0 to `maxMarks` |

Reviewer files: `evaluation/educator/reviews/<fingerprint>/<pack>/<language>/reviewer-a.json`, `reviewer-b.json` and `adjudication.json`. Reviewers are identified only by a pseudonymous code (`EN-R1`, `UR-R2`, `AR-ADJ`). Names and contracts stay outside the repository.

## 4. Reviewers

Two independent subject teachers per language, paid and not employed by a pilot school, review every item without seeing each other's answers. A third person (adjudicator) decides every item where the two differ on any field. Recruitment is D5-03 and is human-only.

## 5. Metrics and thresholds

Final judgement per item: the shared reviewer value when both agree on every field; otherwise the adjudicator's.

| Metric | Definition | Threshold |
| --- | --- | --- |
| Curriculum alignment | Share of items whose final `aligned` is yes | **at least 90%** |
| Critical errors | Count of items whose final `critical` is yes | **zero** |
| AI marking agreement | Share of items where the AI mark equals the final reviewer mark | **at least 85%** |
| Inter-rater reliability | Cohen's kappa between the two reviewers on `aligned` | **at least 0.6** |

Cohen's kappa = (p_o − p_e) / (1 − p_e). If p_e = 1 (both reviewers gave one identical label throughout), kappa is 1 when they agree on every item.

Verdict per pack and language:
- kappa below 0.6: **REPEAT**. The run is repeated with reviewer calibration; no pass or fail is recorded.
- otherwise any threshold missed: **FAILED**.
- otherwise: **PASSED**.

## 6. Decision rule (the AI flag)

A pack's AI capability (AI paper generation) is on only when **all three languages PASSED** for the current model/prompt fingerprint. Any FAILED or REPEAT verdict keeps it off. AI-05 stays in force. The flag is read by `curriculumPackGateFor(..., { ai: true })` from `src/config/educator-evaluation-status.json`.

Until D5-03 reviewers report, missing results are enforced only with `EDUCATOR_EVAL_ENFORCE=1`; a recorded failure is always enforced. Set `EDUCATOR_EVAL_ENFORCE=1` in production once the first real run is recorded.

## 7. Procedure

1. Educators author the item sets; founder reviews them for coverage and synthetic-only content.
2. Freeze each set (`pnpm eval:educator freeze ...`) and commit it.
3. `pnpm eval:educator run` scores every frozen set with the configured OpenAI model at temperature 0 and stores marks in `evaluation/educator/results/<fingerprint>/`.
4. Reviewers score the items independently; the adjudicator resolves disagreements. Commit the files under `reviews/<fingerprint>/`.
5. Run `pnpm eval:educator run` again. It reuses the stored marks, computes the metrics and writes verdicts to the status file. Commit it.

## 8. Re-runs and versioning

- **Fingerprint** = SHA-256 of model label, `AI_PROMPT_VERSION`, `AI_POLICY_VERSION`, the D5 scoring prompt and its version. Any change makes earlier results stale: the next run re-scores every frozen set and discards earlier verdicts. Reviewers then re-review against the new AI marks.
- **Item sets** are never edited once frozen. Corrections ship as a new `setVersion`, frozen again, and invalidate results for that set.
- **This document** is versioned by git. Changing items, rubric, thresholds or the decision rule after the first scored run needs a new registration section dated before the next run, approved by the owner. Registration version: 1.

## 9. Human-only work

Recruiting and paying reviewers (D5-03), writing the real items, reviewing, adjudicating and owner sign-off on results.
