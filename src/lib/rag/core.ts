import { z } from "zod";
import { USER_ROLES } from "@/lib/roles";

export const documentSchema = z.strictObject({
  title: z.string().trim().min(3).max(160), content: z.string().trim().min(20).max(80000),
  roles: z.array(z.enum(USER_ROLES)).min(1).max(11).transform(values => [...new Set(values)]),
  campusId: z.string().min(1).max(128).nullable().default(null),
  expiresAt: z.iso.datetime().nullable().default(null),
});
export const querySchema = z.string().trim().min(3).max(1000);
export function knowledgeFollowup(message: string, previous: string): string | null {
  if (!/^(?:and\b|what about\b|how about\b|why\b|when\b|does (?:it|that|this)\b|can (?:it|that|this)\b)|\b(?:that policy|this policy|those rules|its deadline)\b/i.test(message.trim())) return null;
  return `${previous.slice(-600)}\nFollow-up question: ${message.slice(0, 350)}`;
}
export function sensitiveKnowledgeRequest(query: string) {
  return /\b(passwords?|credentials?|api[ _-]?keys?|access[ _-]?tokens?|private[ _-]?keys?|login usernames?)\b|پاس ورڈ|كلمة المرور/i.test(query);
}
export const CHUNK_SIZE = 1800, OVERLAP = 180;

/** Exact character offsets make every citation independently verifiable against its version. */
export function chunkText(text: string) {
  const chunks = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end));
      if (boundary > start + CHUNK_SIZE / 2) end = boundary + 1;
    }
    const body = text.slice(start, end);
    if (body.trim()) chunks.push({ ordinal: chunks.length, text: body, startOffset: start, endOffset: end });
    if (end === text.length) break;
    start = end - OVERLAP;
  }
  return chunks;
}

const STOP = new Set("am reviewing the a an and or is are was were be been being what how do does did can could would should i we you my our your to in of for about please me tell policy policies document documents school this that these those it its at by from with as on not only give get find look up need want say says state states stated explain describe summarize rule rules procedure guidance published official current source sources cite quote exact evidence relevant requirement requirements concerning according regarding against know written based understand verify help recorded handbook operating live record exceptions separate approval approved request requests within through into without also".split(" "));
export const terms = (text: string) => (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(term => term.length > 1 && !STOP.has(term));
export function cosine(a: readonly number[], b: readonly number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export interface SearchChunk { id: string; documentId: string; text: string; title: string; embedding: number[]; model: string | null; }
/** BM25 + reciprocal rank fusion, with evidence thresholds and source diversity. */
export function hybridRank(query: string, chunks: SearchChunk[], vector: number[] | null, model: string) {
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

export const groundedAnswerSchema = z.strictObject({ claims: z.array(z.strictObject({ text: z.string().min(1).max(700), source: z.number().int().min(1).max(6), quote: z.string().min(12).max(1000) })).min(1).max(6) });
export function validateClaims(value: unknown, sources: readonly { text: string }[]) {
  const parsed = groundedAnswerSchema.safeParse(value);
  if (!parsed.success || parsed.data.claims.some(claim => !sources[claim.source - 1]?.text.includes(claim.quote) || (claim.text.match(/\d+(?:[.:]\d+)*/g) ?? []).some(number => !new RegExp(`(?<!\\d)${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(claim.quote)))) return null;
  return parsed.data.claims;
}
