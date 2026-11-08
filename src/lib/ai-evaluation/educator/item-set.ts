import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * SKAI-1051 (D5-02): the frozen educator-evaluation item set. One file per pack and language at
 * `evaluation/educator/items/<pack>/<language>/items.json`. A set is scored only once frozen; the
 * freeze records a SHA-256 of the canonical content, so any later edit is refused (bump
 * `setVersion` and freeze a new set instead, per docs/evaluation/D5-preregistration.md).
 */
export const EDUCATOR_EVAL_SCHEMA_VERSION = 1;
export const EDUCATOR_EVAL_LANGUAGES = ["en", "ur", "ar"] as const;
export type EducatorEvalLanguage = (typeof EDUCATOR_EVAL_LANGUAGES)[number];
/** D5 launch packs, stratified separately (D2): never pooled. */
export const EDUCATOR_EVAL_PACKS = ["fbise-g9-maths", "bise-lahore-g9-maths", "ksa-intermediate-maths", "igcse-0580"] as const;
export type EducatorEvalPack = (typeof EDUCATOR_EVAL_PACKS)[number];
/** Pre-registered floor: at least 30 frozen items per language per pack. */
export const MIN_ITEMS_PER_SET = 30;

export const evalItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  topic: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  stem: z.string().min(1),
  referenceAnswer: z.string().min(1),
  maxMarks: z.number().int().positive(),
  /** Synthetic learner answer the AI marks; never a real student's work. */
  syntheticResponse: z.string().min(1),
  placeholder: z.boolean(),
}).strict();
export type EvalItem = z.infer<typeof evalItemSchema>;

export const itemSetSchema = z.object({
  schemaVersion: z.literal(EDUCATOR_EVAL_SCHEMA_VERSION),
  pack: z.enum(EDUCATOR_EVAL_PACKS),
  language: z.enum(EDUCATOR_EVAL_LANGUAGES),
  setVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  placeholder: z.boolean(),
  items: z.array(evalItemSchema).min(1),
  frozen: z.object({ frozenAt: z.iso.datetime(), contentSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable(),
}).strict();
export type ItemSet = z.infer<typeof itemSetSchema>;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** Hash of everything except the freeze record itself. */
export function itemSetContentSha256(set: Omit<ItemSet, "frozen">): string {
  const { schemaVersion, pack, language, setVersion, placeholder, items } = set;
  return sha256(canonicalJson({ schemaVersion, pack, language, setVersion, placeholder, items }));
}

export function freezeItemSet(set: ItemSet, now = new Date()): ItemSet {
  if (set.frozen) throw new Error(`Set ${set.pack}/${set.language} v${set.setVersion} is already frozen. Bump setVersion to freeze a new set.`);
  return { ...set, frozen: { frozenAt: now.toISOString(), contentSha256: itemSetContentSha256(set) } };
}

export type ItemSetCheck = { ok: true; set: ItemSet; contentSha256: string } | { ok: false; errors: string[] };

/**
 * Refuses an un-frozen set, an edited one (hash mismatch) and duplicate ids; unless
 * `allowPlaceholder` (dry runs only), also placeholder sets and sets below the 30-item floor.
 */
export function validateItemSet(raw: unknown, opts: { allowPlaceholder?: boolean; expect?: { pack: string; language: string } } = {}): ItemSetCheck {
  const parsed = itemSetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) };
  const set = parsed.data;
  const errors: string[] = [];
  if (opts.expect && (opts.expect.pack !== set.pack || opts.expect.language !== set.language)) errors.push(`File location ${opts.expect.pack}/${opts.expect.language} does not match set ${set.pack}/${set.language}.`);
  const ids = set.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) errors.push("Item ids must be unique.");
  const hash = itemSetContentSha256(set);
  if (!set.frozen) errors.push("Set is not frozen; freeze it before scoring.");
  else if (set.frozen.contentSha256 !== hash) errors.push("Set was edited after it was frozen (content hash mismatch). Restore it, or bump setVersion and freeze a new set.");
  const hasPlaceholder = set.placeholder || set.items.some(item => item.placeholder);
  if (!opts.allowPlaceholder) {
    if (hasPlaceholder) errors.push("Set contains placeholder items; real educator-authored items are required for scoring.");
    if (set.items.length < MIN_ITEMS_PER_SET) errors.push(`Set has ${set.items.length} items; the pre-registered floor is ${MIN_ITEMS_PER_SET}.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, set, contentSha256: hash };
}
