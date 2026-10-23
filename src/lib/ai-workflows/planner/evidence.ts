import { normalizeText, tokens } from "./normalize";

/**
 * Evidence is matched only against the user's own words (request and answers, stored as segments),
 * never against server-added text. A quote matches as a normalised substring, or by token-set
 * similarity ≥ 0.85 within one sentence. A matched quote must also agree with the value it supports:
 * the value's own words have to appear in it. Anything else turns that field into a question.
 */
export interface Segment { id: string; normalized: string }
export interface EvidenceClaim { pointer: string; quote: string }
export interface EvidenceMatch { pointer: string; segmentId: string; start: number; end: number }

const THRESHOLD = 0.85;

function sentences(text: string): string[] { return text.split(/(?<=[.!?؟۔\n])\s*/u).filter(Boolean); }

export function matchQuote(quote: string, segments: readonly Segment[]): EvidenceMatch | null {
  const needle = normalizeText(quote);
  if (needle.length < 2) return null;
  for (const segment of segments) {
    const at = segment.normalized.indexOf(needle);
    if (at >= 0) return { pointer: "", segmentId: segment.id, start: at, end: at + needle.length };
  }
  const want = new Set(tokens(quote));
  if (want.size < 2) return null;
  for (const segment of segments) for (const sentence of sentences(segment.normalized)) {
    const have = new Set(tokens(sentence));
    const overlap = [...want].filter(word => have.has(word)).length;
    if (overlap / want.size >= THRESHOLD) { const at = segment.normalized.indexOf(sentence); return { pointer: "", segmentId: segment.id, start: at, end: at + sentence.length }; }
  }
  return null;
}

/** Scalar text the value contributes; ids (already bound) and booleans carry no words to check. */
function wordsOf(value: unknown): string[] {
  if (typeof value === "string") return /^[0-9a-f-]{20,}$/i.test(value) ? [] : tokens(value);
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(wordsOf);
  if (value && typeof value === "object") return Object.entries(value).filter(([key]) => !/(^id$|Id$|Ids$)/.test(key)).flatMap(([, child]) => wordsOf(child));
  return [];
}

export function readPointer(value: unknown, pointer: string): unknown {
  return pointer.split("/").filter(Boolean).reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), value);
}

/**
 * Checks every required pointer. Returns matches for the ones supported and the pointers that need a
 * question. A value whose words are not in the user's text is not supported, even with a quote.
 */
export function checkEvidence(input: unknown, required: readonly string[], claims: readonly EvidenceClaim[], segments: readonly Segment[]) {
  const matches: EvidenceMatch[] = [], missing: string[] = [];
  const userWords = new Set(segments.flatMap(segment => tokens(segment.normalized)));
  for (const pointer of required) {
    const value = readPointer(input, pointer);
    if (value === undefined || value === null || (Array.isArray(value) && !value.length)) { missing.push(pointer); continue; }
    const claim = claims.find(item => item.pointer === pointer || item.pointer.startsWith(`${pointer}/`));
    const match = claim ? matchQuote(claim.quote, segments) : null;
    const words = wordsOf(value);
    const agrees = words.length === 0 || words.filter(word => userWords.has(word)).length / words.length >= 0.6;
    if (match && agrees) matches.push({ ...match, pointer });
    else missing.push(pointer);
  }
  return { matches, missing };
}
