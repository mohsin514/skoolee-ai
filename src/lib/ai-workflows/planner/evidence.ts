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
  // Ids and enum codes (ABSENT, CLASS_TEST) are the schema's words, not the user's.
  if (typeof value === "string") return /^[0-9a-f-]{20,}$/i.test(value) || /^[A-Z][A-Z0-9_]+$/.test(value) ? [] : tokens(value);
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
/** "/entries/*\/said" names every item of an array: each one needs its own quote (control P3). */
export function expandPointers(input: unknown, pointers: readonly string[]): string[] {
  return pointers.flatMap(pointer => {
    const at = pointer.indexOf("/*");
    if (at < 0) return [pointer];
    const list = readPointer(input, pointer.slice(0, at));
    if (!Array.isArray(list) || !list.length) return [pointer.slice(0, at)];
    return expandPointers(input, list.map((_, index) => `${pointer.slice(0, at)}/${index}${pointer.slice(at + 2)}`));
  });
}

export const joinThousands = (text: string) => text.replace(/(\d)[,\s.\u066C\u060C](?=\d{3}(?!\d))/g, "$1");

export function checkEvidence(input: unknown, required: readonly string[], claims: readonly EvidenceClaim[], segments: readonly Segment[]) {
  const matches: EvidenceMatch[] = [], missing: string[] = [];
  // "Rs 12,500" and "12 500" are the user's 12500: thousands separators are joined before comparing numbers.
  const userWords = new Set(segments.flatMap(segment => [...tokens(segment.normalized), ...tokens(joinThousands(segment.normalized))]));
  for (const pointer of expandPointers(input, required)) {
    const value = readPointer(input, pointer);
    if (value === undefined || value === null || (Array.isArray(value) && !value.length)) { missing.push(pointer); continue; }
    // A claim on the field, below it, or on its own array item ("/entries/0" for "/entries/0/said"); never on the whole list.
    const item = /\/\d+$/.test(pointer.slice(0, pointer.lastIndexOf("/"))) ? pointer.slice(0, pointer.lastIndexOf("/")) : null;
    const claim = claims.find(claimed => claimed.pointer === pointer || claimed.pointer.startsWith(`${pointer}/`) || claimed.pointer === item);
    const match = claim ? matchQuote(claim.quote, segments) : null;
    const words = wordsOf(value);
    const agrees = words.length === 0 || words.filter(word => userWords.has(word)).length / words.length >= 0.6;
    if (match && agrees) matches.push({ ...match, pointer });
    else missing.push(pointer);
  }
  return { matches, missing };
}
