/**
 * Input sanitisation — the layer that runs *before* validation.
 *
 * Validation answers "is this acceptable?"; sanitisation answers "what did the
 * user actually mean?". Keeping them apart matters because most of what arrives
 * from a real form is not malicious, just untidy: a name pasted out of a PDF
 * carries a zero-width joiner, a phone number copied from WhatsApp carries
 * non-breaking spaces, and a roll number typed on a phone keyboard picks up a
 * trailing space that then fails a uniqueness check against the identical
 * number already in the table.
 *
 * Rejecting those is technically correct and practically useless — the teacher
 * cannot see the difference between the two spellings. So we clean first, then
 * judge what is left.
 *
 * The genuinely hostile cases are handled here too, and deliberately by
 * *removal* rather than escaping: control characters, HTML, and the spreadsheet
 * formula prefixes that turn an exported roster into a payload on the
 * registrar's machine.
 *
 * Everything in this file is pure, synchronous, and safe on both the client and
 * the server, so the same normalisation runs in the browser (where it keeps the
 * field tidy as the user types) and again in the route handler (where it is the
 * only copy that can be trusted).
 */

/**
 * Characters no legitimate form field ever contains.
 *
 * The C0 and C1 control ranges, minus tab/newline/carriage-return which
 * multiline text is allowed to keep; the zero-width characters (U+200B–U+200F,
 * U+FEFF), which are invisible and defeat equality checks; and the
 * bidirectional overrides (U+202A–U+202E, U+2060–U+206F), which can reorder
 * rendered text so a stored value displays as something other than what it is.
 */
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/** Unicode spaces that are not U+0020 — non-breaking, en/em, ideographic. */
const EXOTIC_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Strips control and invisible formatting characters, keeping tab/newline. */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

/** Normalises every exotic space to a plain U+0020. */
export function normalizeSpaces(value: string): string {
  return value.replace(EXOTIC_SPACES, " ");
}

/**
 * The default for single-line text.
 *
 * Trims, removes invisibles, folds runs of whitespace to one space, and drops
 * newlines — a single-line input should never carry one, but a paste can put
 * one there and it survives all the way into a PDF layout if nothing removes it.
 */
export function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeSpaces(stripControlChars(value))
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The default for textareas — remarks, notes, addresses, medical history.
 *
 * Keeps paragraph structure (that is the point of a textarea) but collapses
 * runs of three or more blank lines, which is almost always an accident of
 * pasting and pushes the rest of a report card off the page.
 */
export function sanitizeMultiline(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeSpaces(stripControlChars(value))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Person and institution names.
 *
 * Deliberately Unicode-aware rather than ASCII-only: this product is used in
 * Pakistan and stores Urdu names alongside English ones, so an `[A-Za-z]`
 * filter would silently erase the entire `nameUr` field. `\p{L}` covers Arabic
 * script, `\p{M}` keeps the combining marks that Urdu diacritics depend on, and
 * the punctuation set is the one real names use — O'Brien, Anne-Marie,
 * Muhammad bin Qasim, Jr., Dr.
 */
export function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeText(value).replace(/[^\p{L}\p{M}\p{Nd}\s'\-.,()/]/gu, "");
}

/** Lowercases and strips spaces. Emails are case-insensitive in practice. */
export function sanitizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeText(value).toLowerCase().replace(/\s+/g, "");
}

/**
 * Phone numbers, kept as digits plus an optional leading +.
 *
 * Spaces, dashes and brackets are dropped rather than preserved so that
 * "0300-1234567", "0300 1234567" and "(0300) 1234567" all become one
 * comparable value — otherwise the same parent is three different contacts
 * depending on which clerk typed them in.
 */
export function sanitizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = sanitizeText(value).replace(/[^\d+]/g, "");
  const plus = cleaned.startsWith("+") ? "+" : "";
  return plus + cleaned.replace(/\+/g, "");
}

/** Digits only — CNIC, postal codes, account numbers, OTPs. */
export function sanitizeDigits(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "");
}

/** Formats a 13-digit CNIC as 00000-0000000-0 once enough digits are present. */
export function formatCnic(value: unknown): string {
  const digits = sanitizeDigits(value).slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/** URL-safe identifiers: lowercase, hyphen-separated, no leading/trailing dash. */
export function sanitizeSlug(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Short uppercase codes — subject codes, section letters, account codes. */
export function sanitizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeText(value).toUpperCase().replace(/[^A-Z0-9\-_/]/g, "");
}

/**
 * Numeric text as typed.
 *
 * Keeps one leading minus and one decimal point, discards thousands separators
 * and stray characters, so "Rs 12,500.00" becomes "12500.00". Returns a string
 * rather than a number because this feeds a controlled input — turning it into
 * a number mid-edit makes "12." impossible to type.
 */
export function sanitizeNumericText(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[^\d.\-]/g, "");
  const negative = cleaned.startsWith("-");
  const [whole, ...rest] = cleaned.replace(/-/g, "").split(".");
  const decimals = rest.length ? `.${rest.join("").slice(0, 4)}` : "";
  return `${negative ? "-" : ""}${whole}${decimals}`;
}

/** Removes any HTML tag — plain text in, plain text out. */
export function stripHtmlTags(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "");
}

/**
 * Guards a value that will be written into a CSV/XLSX export.
 *
 * Excel and Google Sheets treat a leading =, +, - or @ as the start of a
 * formula, so a guardian name stored as an =HYPERLINK(...) expression runs on
 * the machine of whoever opens the exported roster. Prefixing with an
 * apostrophe keeps the text visible while disarming it.
 */
export function sanitizeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const cleaned = stripControlChars(text).replace(/[\r\n]+/g, " ");
  return /^[=+\-@\t]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

/** Strips path separators and traversal from a user-supplied filename. */
export function sanitizeFileName(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeText(value)
    .replace(/[/\\]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-]+/, "")
    .replace(/[^\p{L}\p{Nd}\-_. ]/gu, "")
    .slice(0, 180);
}

/**
 * Accepts only http(s) URLs.
 *
 * Returns "" for anything else, which is what makes it safe to drop straight
 * into an href: `javascript:`, `data:` and `vbscript:` all fail the protocol
 * check rather than being pattern-matched out of a string.
 */
export function sanitizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = sanitizeText(value);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Search boxes: plain text, length-capped so a paste cannot become a query DoS. */
export function sanitizeSearch(value: unknown, maxLength = 120): string {
  return sanitizeText(value).slice(0, maxLength);
}

/**
 * Recursively sanitises every string in a parsed JSON body.
 *
 * Applied at the API boundary before the schema runs, so control characters and
 * exotic whitespace are gone no matter which route received them and whether or
 * not that route's schema thought to strip them. Depth-limited because the body
 * is attacker-controlled and a deeply nested object would otherwise blow the
 * stack before any validation had a chance to reject it.
 */
export function sanitizeDeep<T>(input: T, depth = 0): T {
  if (depth > 12) return input;

  if (typeof input === "string") return sanitizeMultiline(input) as unknown as T;
  if (Array.isArray(input)) {
    return input.slice(0, 5000).map((item) => sanitizeDeep(item, depth + 1)) as unknown as T;
  }
  // Plain and null-prototype objects both recurse. Checking only for
  // `Object.prototype` would fail *open* — anything with another prototype
  // would be returned exactly as it arrived, unsanitised.
  const proto = input && typeof input === "object" ? Object.getPrototypeOf(input) : undefined;
  if (input && typeof input === "object" && (proto === Object.prototype || proto === null)) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      // Prototype-pollution keys never survive the boundary.
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      output[key] = sanitizeDeep(value, depth + 1);
    }
    return output as unknown as T;
  }
  return input;
}
