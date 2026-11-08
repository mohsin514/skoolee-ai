import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoPII } from "@/lib/ai/pseudonymize";
import { EDUCATOR_EVAL_LANGUAGES, EDUCATOR_EVAL_PACKS, validateItemSet, type EvalItem } from "./item-set";
import { evaluateReviews, reviewFileSchema, type ReviewFile } from "./metrics";
import { EDUCATOR_EVAL_SCORING_PROMPT, evaluationFingerprint, evaluationStatusSchema, type EvaluationStatus, type ModelPromptVersion } from "./gate";

/**
 * SKAI-1053 (D5-04): re-scores every frozen set when the model/prompt fingerprint changes, stores
 * AI marks under `results/<fingerprint>/`, and turns reviewer files under `reviews/<fingerprint>/`
 * into verdicts in the status file the per-pack AI gate reads. Scoring is injectable so tests
 * never call OpenAI; items are synthetic and every prompt passes `assertNoPII` before sending.
 */
export type ScoringMessages = { system: string; user: string };
export type Scorer = (messages: ScoringMessages, item: EvalItem) => Promise<number>;

export function scoringMessages(item: EvalItem): ScoringMessages {
  const user = JSON.stringify({ question: item.stem, referenceAnswer: item.referenceAnswer, maxMarks: item.maxMarks, answer: item.syntheticResponse });
  assertNoPII(user, "educator evaluation prompt");
  return { system: EDUCATOR_EVAL_SCORING_PROMPT, user };
}

export function parseMark(reply: string, maxMarks: number): number {
  const mark = Number((JSON.parse(reply) as { mark?: unknown }).mark);
  if (!Number.isInteger(mark) || mark < 0 || mark > maxMarks) throw new Error(`Model returned an invalid mark: ${reply.slice(0, 80)}`);
  return mark;
}

export type RunOptions = { root: string; statusPath: string; version: ModelPromptVersion; scorer: Scorer; allowPlaceholder?: boolean; now?: Date };
export type SetReport = { pack: string; language: string; state: "SKIPPED_MISSING" | "INVALID" | "SCORED" | "REUSED"; review: "NONE" | "PASSED" | "FAILED" | "REPEAT" | "PLACEHOLDER_NOT_RECORDED"; messages: string[] };

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };

export async function runEducatorEvaluation(opts: RunOptions): Promise<{ fingerprint: string; reports: SetReport[]; status: EvaluationStatus }> {
  const now = opts.now ?? new Date();
  const fingerprint = evaluationFingerprint(opts.version);
  const fp = fingerprint.slice(0, 16);
  const previous = existsSync(opts.statusPath) ? evaluationStatusSchema.parse(readJson(opts.statusPath)) : { fingerprint: null, model: null, updatedAt: null, packs: {} };
  // A new fingerprint discards every earlier verdict: results only hold for the model/prompt they measured.
  const status: EvaluationStatus = previous.fingerprint === fingerprint ? previous : { fingerprint, model: opts.version.model, updatedAt: now.toISOString(), packs: {} };
  const reports: SetReport[] = [];
  for (const pack of EDUCATOR_EVAL_PACKS) for (const language of EDUCATOR_EVAL_LANGUAGES) {
    const report: SetReport = { pack, language, state: "SKIPPED_MISSING", review: "NONE", messages: [] };
    reports.push(report);
    const itemsPath = join(opts.root, "items", pack, language, "items.json");
    if (!existsSync(itemsPath)) continue;
    const check = validateItemSet(readJson(itemsPath), { allowPlaceholder: opts.allowPlaceholder, expect: { pack, language } });
    if (!check.ok) { report.state = "INVALID"; report.messages = check.errors; continue; }
    const resultsPath = join(opts.root, "results", fp, pack, `${language}.json`);
    const stored = existsSync(resultsPath) ? readJson(resultsPath) as { itemSetSha256: string; marks: Record<string, number> } : null;
    let marks: Record<string, number>;
    if (stored && stored.itemSetSha256 === check.contentSha256) { marks = stored.marks; report.state = "REUSED"; }
    else {
      marks = {};
      for (const item of check.set.items) marks[item.id] = await opts.scorer(scoringMessages(item), item);
      writeJson(resultsPath, { fingerprint, model: opts.version.model, promptVersion: opts.version.promptVersion, policyVersion: opts.version.policyVersion, itemSetSha256: check.contentSha256, setVersion: check.set.setVersion, scoredAt: now.toISOString(), marks });
      report.state = "SCORED";
    }
    const reviewDir = join(opts.root, "reviews", fp, pack, language);
    const load = (name: string): ReviewFile | null => existsSync(join(reviewDir, name)) ? reviewFileSchema.parse(readJson(join(reviewDir, name))) : null;
    const reviewerA = load("reviewer-a.json"), reviewerB = load("reviewer-b.json");
    if (!reviewerA || !reviewerB) continue;
    const outcome = evaluateReviews({ itemIds: check.set.items.map(item => item.id), itemSetSha256: check.contentSha256, reviewerA, reviewerB, adjudication: load("adjudication.json"), aiMarks: marks });
    report.messages = outcome.failures;
    if (check.set.placeholder) { report.review = "PLACEHOLDER_NOT_RECORDED"; continue; }
    report.review = outcome.verdict;
    status.packs[pack] = { ...status.packs[pack], [language]: { verdict: outcome.verdict, itemSetSha256: check.contentSha256, setVersion: check.set.setVersion, evaluatedAt: now.toISOString(), metrics: outcome.metrics, failures: outcome.failures } };
    status.updatedAt = now.toISOString();
  }
  writeJson(opts.statusPath, status);
  return { fingerprint, reports, status };
}
