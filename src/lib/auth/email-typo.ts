/**
 * "Did you mean name@gmail.com?" — a one-tap rescue for the handful of
 * consumer mail domains people mistype, and for fat-fingered ".com"s.
 *
 * Deliberately conservative: school domains, test domains, country TLDs
 * (".co", ".co.uk", ".ca") and real providers that merely look similar
 * ("mail.com", "ymail.com") are never "corrected".
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Popular consumer providers we offer corrections towards (all ".com"). */
const TARGETS = ["gmail", "googlemail", "outlook", "hotmail", "live", "yahoo", "icloud"] as const;

/** Real ".com" mail labels that sit within an edit or two of a target. */
const GENUINE = new Set(["mail", "email", "ymail", "gmx", "aol", "msn", "me", "mac", "zoho", "proton", "protonmail", "yandex", "hey", "fastmail", "rocketmail", "outlook365"]);

/** Transposed or doubled ".com" endings. ".co" is a real TLD and is never fixed. */
const TLD_FIXES: Record<string, string> = { con: "com", cmo: "com", ocm: "com", vom: "com", xom: "com", comm: "com" };

/** Optimal-string-alignment (restricted Damerau–Levenshtein) distance. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The corrected full address, or null when nothing looks mistyped. */
export function suggestEmailDomain(email: string): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim();
  if (!EMAIL.test(value)) return null;
  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  const dot = domain.indexOf(".");
  if (dot <= 0) return null;

  const label = domain.slice(0, dot);
  const rest = domain.slice(dot + 1);
  const tld = TLD_FIXES[rest] ?? rest;
  // Only single-label ".com" domains are candidates: everything else
  // (school.edu.pk, co.uk, example.test, gmail.co) is left exactly as typed.
  if (tld !== "com") return null;

  let fixedLabel = label;
  if (!GENUINE.has(label) && !(TARGETS as readonly string[]).includes(label)) {
    // Short labels allow one slip, longer ones two.
    const limit = label.length >= 6 ? 2 : 1;
    let best: { target: string; distance: number } | null = null;
    for (const target of TARGETS) {
      const distance = editDistance(label, target);
      if (distance === 0 || distance > limit) continue;
      if (!best || distance < best.distance) best = { target, distance };
    }
    if (best) fixedLabel = best.target;
  }

  const fixed = `${fixedLabel}.${tld}`;
  return fixed === domain ? null : `${local}@${fixed}`;
}
