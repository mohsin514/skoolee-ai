/**
 * SKAI-1013: keep authored mathematics in its authored order inside RTL (Urdu/Arabic) text.
 *
 * In an RTL paragraph the Unicode bidi algorithm reorders runs of Western digits separated by
 * spaced operators, so "3 + 4 = 7" displays as "7 = 4 + 3" and "-5" as "5-". We isolate each
 * Latin-script expression (Western digits, Latin letters, operators) as LTR. Expressions authored
 * with Arabic-Indic digits are left untouched: their layout convention needs native educator review.
 */
export type MathSegment = { text: string; math: boolean };

const RUN = /[0-9A-Za-z.,()[\]{}+\-−×÷*/^=<>≤≥≠±√%°²³π|? ]+/g;
// Whole Latin words ("and", "then") end an expression; single-letter variables and f(x) do not.
const WORD = /(?<=^|\s)[A-Za-z]{2,}(?=\s|$)/g;
const HAS_DIGIT = /[0-9]/;
const HAS_OPERATOR_OR_SIGN = /[+\-−×÷*/^=<>≤≥≠±√%²³]|\d\s*[A-Za-z(]|\)\s*\(/;

export function mathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let cursor = 0;
  const push = (value: string, math: boolean) => {
    if (!value) return;
    const last = segments.at(-1);
    if (last && last.math === math && !math) last.text += value; else segments.push({ text: value, math });
  };
  const runs = [...text.matchAll(RUN)].flatMap(match => {
    const parts: { raw: string; start: number }[] = []; let from = 0;
    for (const word of match[0].matchAll(WORD)) { parts.push({ raw: match[0].slice(from, word.index), start: match.index! + from }); from = word.index! + word[0].length; }
    parts.push({ raw: match[0].slice(from), start: match.index! + from });
    return parts;
  });
  for (const { raw, start } of runs) {
    const lead = raw.length - raw.trimStart().length, core = raw.trim();
    // Only isolate real expressions; plain words, lone numbers and punctuation keep normal flow.
    const isMath = HAS_DIGIT.test(core) && HAS_OPERATOR_OR_SIGN.test(core);
    if (!isMath) continue;
    push(text.slice(cursor, start + lead), false);
    push(core, true);
    cursor = start + lead + core.length;
  }
  push(text.slice(cursor), false);
  return segments;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Escaped HTML with each expression wrapped as an LTR isolate. */
export function mathAwareHtml(text: string): string {
  return mathSegments(text).map(segment => segment.math ? `<bdi class="math" dir="ltr">${escapeHtml(segment.text)}</bdi>` : escapeHtml(segment.text)).join("");
}
