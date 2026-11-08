/**
 * SKAI-1053 (D5-04) — `pnpm eval:educator [run|freeze <items.json>|validate] [--allow-placeholder] [--dry]`
 *
 * run      Re-score every frozen set for the current model/prompt fingerprint (OpenAI), then apply
 *          any reviewer files and update src/config/educator-evaluation-status.json.
 *          --dry uses an offline scorer that awards zero marks (no network) for plumbing checks.
 * freeze   Freeze one items.json (records its content hash). Refuses an already-frozen set.
 * validate Check every items.json is frozen and unedited (placeholders allowed).
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { AI_PROMPT_VERSION } from "@/lib/ai/prompts";
import { AI_POLICY_VERSION } from "@/lib/ai/evaluation";
import { getAIModel } from "@/lib/ai/openai";
import { EDUCATOR_EVAL_LANGUAGES, EDUCATOR_EVAL_PACKS, freezeItemSet, itemSetSchema, validateItemSet } from "@/lib/ai-evaluation/educator/item-set";
import { parseMark, runEducatorEvaluation, type Scorer } from "@/lib/ai-evaluation/educator/runner";

const root = join(process.cwd(), "evaluation", "educator");
const statusPath = join(process.cwd(), "src", "config", "educator-evaluation-status.json");
const [command = "run", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter(arg => arg.startsWith("--")));

function openAIScorer(model: string): Scorer {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1" });
  return async (messages, item) => {
    const reply = await client.chat.completions.create({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: messages.system }, { role: "user", content: messages.user }] });
    return parseMark(reply.choices[0]?.message?.content ?? "", item.maxMarks);
  };
}

async function main() {
  if (command === "freeze") {
    const path = rest.find(arg => !arg.startsWith("--"));
    if (!path) throw new Error("Usage: pnpm eval:educator freeze <items.json>");
    const frozen = freezeItemSet(itemSetSchema.parse(JSON.parse(readFileSync(path, "utf8"))));
    writeFileSync(path, `${JSON.stringify(frozen, null, 2)}\n`);
    console.log(`Frozen ${frozen.pack}/${frozen.language} v${frozen.setVersion}: ${frozen.frozen!.contentSha256}`);
    return;
  }
  if (command === "validate") {
    let bad = 0;
    for (const pack of readdirSync(join(root, "items"))) for (const language of readdirSync(join(root, "items", pack))) {
      const path = join(root, "items", pack, language, "items.json");
      const check = validateItemSet(JSON.parse(readFileSync(path, "utf8")), { allowPlaceholder: true, expect: { pack, language } });
      if (!check.ok) { bad++; console.error(`${pack}/${language}: ${check.errors.join(" ")}`); }
    }
    const missing = EDUCATOR_EVAL_PACKS.flatMap(pack => EDUCATOR_EVAL_LANGUAGES.filter(language => !existsSync(join(root, "items", pack, language, "items.json"))).map(language => `${pack}/${language}`));
    if (missing.length) console.warn(`No item set yet: ${missing.join(", ")}`);
    if (bad) process.exitCode = 1; else console.log("All item sets are frozen and unedited.");
    return;
  }
  if (command !== "run") throw new Error(`Unknown command ${command}.`);
  const label = getAIModel();
  const [provider, model] = label.split(":", 2);
  const dry = flags.has("--dry");
  if (!dry && provider !== "openai") throw new Error(`Educator evaluation scores with OpenAI only; the configured provider is ${provider}.`);
  const scorer: Scorer = dry ? async () => 0 : openAIScorer(model);
  // A dry run works on a temporary copy so it never writes results or the committed status file.
  const runRoot = dry ? mkdtempSync(join(tmpdir(), "d5-dry-")) : root;
  if (dry) cpSync(root, runRoot, { recursive: true });
  const { fingerprint, reports } = await runEducatorEvaluation({ root: runRoot, statusPath: dry ? join(runRoot, "status.json") : statusPath, version: { model: label, promptVersion: AI_PROMPT_VERSION, policyVersion: AI_POLICY_VERSION }, scorer, allowPlaceholder: flags.has("--allow-placeholder") });
  console.log(`Fingerprint ${fingerprint.slice(0, 16)} (${label} / ${AI_PROMPT_VERSION} / ${AI_POLICY_VERSION})`);
  for (const report of reports) console.log(`${report.pack}/${report.language}: ${report.state} review=${report.review}${report.messages.length ? ` — ${report.messages.join(" ")}` : ""}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
