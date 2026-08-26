/**
 * Reading what the office actually types when naming sections and subjects.
 *
 * Two screens ask these questions — Quick Setup when a class is first created,
 * and the class manager when a parallel section opens later — and they have to
 * agree on what "A-D" means, or the same input produces different classes
 * depending on which dialog you happened to be in.
 */

/**
 * Expand a shorthand range into the sections it means: "A-D" → A B C D,
 * "1-4" → 1 2 3 4.
 *
 * Schools name sections in runs, and typing "A, B, C, D, E, F" by hand is both
 * slow and the kind of thing you miscount. Anything that is not a single
 * character either side of a dash is left exactly as typed, so a section
 * legitimately called "Pre-Nursery" survives untouched.
 */
export function expandSectionRange(token: string): string[] {
  const match = token.match(/^([A-Za-z0-9])\s*-\s*([A-Za-z0-9])$/);
  if (!match) return [token];

  const [, rawStart, rawEnd] = match;
  const numeric = /\d/.test(rawStart) && /\d/.test(rawEnd);
  const alpha = /[A-Za-z]/.test(rawStart) && /[A-Za-z]/.test(rawEnd);
  if (!numeric && !alpha) return [token];

  let start = numeric ? Number(rawStart) : rawStart.toUpperCase().charCodeAt(0);
  let end = numeric ? Number(rawEnd) : rawEnd.toUpperCase().charCodeAt(0);
  if (end < start) [start, end] = [end, start];
  // A typo like "A-Z" should not silently queue 26 classes for creation.
  if (end - start > 15) return [token];

  const out: string[] = [];
  for (let i = start; i <= end; i++) {
    out.push(numeric ? String(i) : String.fromCharCode(i));
  }
  return out;
}

/** Split on commas/newlines, expand ranges, drop blanks, de-duplicate. */
export function parseSections(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap(expandSectionRange)
    .filter((section) => {
      const key = section.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Read a pasted subject list.
 *
 * Timetables and syllabi arrive from spreadsheets and WhatsApp, so the input
 * accepts what people actually have: "Maths 100, English 75, Science" on one
 * line, or one per line, with or without the marks. A trailing number is read
 * as the total; anything else keeps the default.
 */
export function parseSubjectList(text: string): { name: string; totalMarks: string }[] {
  return text
    .split(/[,\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((token) => {
      const withMarks = token.match(/^(.*?)[\s:\u2013-]+(\d{1,3})$/);
      if (withMarks && withMarks[1].trim()) {
        return { name: withMarks[1].trim(), totalMarks: withMarks[2] };
      }
      return { name: token, totalMarks: "100" };
    });
}
