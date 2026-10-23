import { entriesForRole } from "../registry";
import { runGates } from "../registry/gates";
import type { CapabilityContext, CapabilityEntry, GateResult } from "../registry/types";
import { tokens } from "./normalize";

/**
 * Code-first retrieval (architecture §5.1): role filter → BM25 over the entry's EN/AR/UR copy and
 * key words → live gate check. The model only ever sees the few entries that survive, with their
 * descriptions; entries a role holds but cannot use right now are listed separately with who can.
 */
const K1 = 1.2, B = 0.75;
export const MAX_CARDS = 8;

function documentOf(entry: CapabilityEntry): string[] {
  const { title, whenToUse, examples } = entry.copy;
  return tokens([entry.key.replace(/[._]/g, " "), ...Object.values(title), ...Object.values(whenToUse), ...Object.values(examples).flat()].join(" "));
}

export function rank(query: string, entries: readonly CapabilityEntry[]): Array<{ entry: CapabilityEntry; score: number }> {
  const docs = entries.map(entry => ({ entry, words: documentOf(entry) }));
  const avg = docs.reduce((sum, doc) => sum + doc.words.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const doc of docs) for (const word of new Set(doc.words)) df.set(word, (df.get(word) ?? 0) + 1);
  const q = [...new Set(tokens(query))];
  return docs.map(({ entry, words }) => {
    const tf = new Map<string, number>();
    for (const word of words) tf.set(word, (tf.get(word) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * words.length / avg));
    }
    return { entry, score };
  }).sort((a, b) => b.score - a.score || a.entry.key.localeCompare(b.entry.key));
}

export interface Retrieval { cards: CapabilityEntry[]; unavailable: Array<{ entry: CapabilityEntry; reason: Exclude<GateResult, { ok: true }> }> }

export async function retrieve(ctx: CapabilityContext, maskedRequest: string): Promise<Retrieval> {
  const ranked = rank(maskedRequest, entriesForRole(ctx.user.role));
  // Keep relevance order; entries with no lexical overlap still fill the slate so short or
  // cross-language requests are not left with nothing to choose from.
  const cards: CapabilityEntry[] = [], unavailable: Retrieval["unavailable"] = [];
  for (const { entry } of ranked) {
    if (cards.length >= MAX_CARDS) break;
    const gate = await runGates(ctx, entry.gates);
    if (gate.ok) cards.push(entry);
    else if (unavailable.length < 4) unavailable.push({ entry, reason: gate });
  }
  return { cards, unavailable };
}
