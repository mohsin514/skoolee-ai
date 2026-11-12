import { test } from "node:test";
import assert from "node:assert/strict";
import { cosine, hybridRank, terms, type SearchChunk } from "../../src/lib/rag/core";

// SKAI-1881: the pre-change ranking, kept verbatim so the faster term-count version must return identical results.
function previousHybridRank(query: string, chunks: SearchChunk[], vector: number[] | null, model: string) {
  const q = [...new Set(terms(query))].filter(term => !/^\d+$/.test(term));
  const docs = chunks.map(chunk => ({ chunk, tokens: terms(`${chunk.title} ${chunk.title} ${chunk.text}`) }));
  const average = docs.reduce((n, d) => n + d.tokens.length, 0) / Math.max(1, docs.length);
  const df = new Map(q.map(term => [term, docs.filter(d => d.tokens.includes(term)).length]));
  const lexical = docs.map(({ chunk, tokens }) => ({ chunk, coverage: q.length ? q.filter(term => tokens.includes(term) && (docs.length < 4 || (df.get(term) ?? 0) / docs.length < 0.7)).length / q.length : 0, score: q.reduce((sum, term) => {
    const f = tokens.filter(token => token === term).length;
    const idf = Math.log(1 + (docs.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
    return sum + (f ? idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * tokens.length / Math.max(1, average))) : 0);
  }, 0) })).filter(hit => hit.score > 0 && hit.coverage >= 0.3).sort((a, b) => b.score - a.score);
  const semantic = vector ? chunks.filter(chunk => chunk.model === model).map(chunk => ({ chunk, score: cosine(vector, chunk.embedding) })).filter(hit => hit.score >= 0.35).sort((a, b) => b.score - a.score) : [];
  const scores = new Map<string, { chunk: SearchChunk; score: number }>();
  for (const lane of [lexical, semantic]) lane.slice(0, 30).forEach(({ chunk }, index) => scores.set(chunk.id, { chunk, score: (scores.get(chunk.id)?.score ?? 0) + 1 / (60 + index + 1) }));
  const perDoc = new Map<string, number>();
  return [...scores.values()].sort((a, b) => b.score - a.score).filter(({ chunk }) => {
    const count = perDoc.get(chunk.documentId) ?? 0;
    perDoc.set(chunk.documentId, count + 1);
    return count < 2;
  }).slice(0, 6);
}

const WORDS = "refund fee late bus uniform exam leave library deadline transport سياسة الرسوم طالب 2026 days receipt cancellation term".split(" ");
function seeded(seed: number) { return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }

test("term-count ranking returns exactly the previous results across lexical and hybrid corpora", () => {
  const random = seeded(1881);
  const pick = () => WORDS[Math.floor(random() * WORDS.length)];
  for (let round = 0; round < 40; round++) {
    const chunks: SearchChunk[] = Array.from({ length: 5 + Math.floor(random() * 120) }, (_, i) => ({
      id: `c${i}`, documentId: `d${i % 9}`, title: `${pick()} ${pick()}`, text: Array.from({ length: 4 + Math.floor(random() * 60) }, pick).join(" "),
      embedding: random() < 0.8 ? Array.from({ length: 8 }, () => random() - 0.3) : [], model: random() < 0.8 ? "m" : null,
    }));
    const query = `${pick()} ${pick()} ${pick()}`, vector = round % 2 ? Array.from({ length: 8 }, () => random() - 0.3) : null;
    assert.deepEqual(hybridRank(query, chunks, vector, "m"), previousHybridRank(query, chunks, vector, "m"), `round ${round}: ${query}`);
  }
});
