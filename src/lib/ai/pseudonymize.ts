// ─────────────────────────────────────────────────────────────────
// Pseudonymization for AI
//
// We hold children's data. Names, guardian phone numbers, emails, home
// addresses and CNICs must never leave our infrastructure attached to a
// real person. Any of that reaching a third-party model — even a paid one
// with a data-processing agreement — is a breach of trust we can't undo.
//
// So before any prompt goes to a non-local provider we:
//   1. Replace personal identifiers with stable, meaningless tokens
//      (Ayesha Khan -> STUDENT_1), keeping a per-request map.
//   2. Send only the tokenized text.
//   3. Rehydrate the model's reply with the real values on the way back.
//
// And as a backstop, scanForPII()/assertNoPII() catch identifiers that
// slipped through (free-text notes, an un-pseudonymized field) and refuse
// the send rather than leak them. Defence in depth: masking is the plan,
// the scanner is the guarantee.
// ─────────────────────────────────────────────────────────────────

export class PIILeakError extends Error {
  status = 500;

  constructor(message: string) {
    super(message);
    this.name = "PIILeakError";
  }
}

export type PIIKind = "STUDENT" | "PERSON" | "PHONE" | "EMAIL" | "ADDRESS" | "ID";

// Object keys whose values are personal identifiers. Matched case-insensitively
// against the whole key, so `guardianWhatsapp`, `parent_email` etc. are covered.
const SENSITIVE_KEYS: Array<{ pattern: RegExp; kind: PIIKind }> = [
  { pattern: /studentname|student_name/i, kind: "STUDENT" },
  { pattern: /(full|guardian|parent|father|mother|teacher|staff|contact|principal)?_?name$/i, kind: "PERSON" },
  { pattern: /^name$/i, kind: "PERSON" },
  { pattern: /whatsapp|phone|mobile|contact_?no|cell/i, kind: "PHONE" },
  { pattern: /email/i, kind: "EMAIL" },
  { pattern: /address/i, kind: "ADDRESS" },
  { pattern: /cnic|nic|b_?form|nationalid|national_id/i, kind: "ID" },
];

function classifyKey(key: string): PIIKind | null {
  for (const { pattern, kind } of SENSITIVE_KEYS) {
    if (pattern.test(key)) return kind;
  }
  return null;
}

/**
 * Stable, reversible substitution of personal values for tokens, scoped to a
 * single AI request. Feed it the sensitive values you know about; it hands
 * back tokens and later restores them.
 */
export class Pseudonymizer {
  private forward = new Map<string, string>();
  private reverse = new Map<string, string>();
  private counters: Partial<Record<PIIKind, number>> = {};

  /** Returns a stable token for `value`, minting one on first sight. */
  token(value: string, kind: PIIKind = "PERSON"): string {
    const trimmed = value.trim();
    if (!trimmed) return value;

    const existing = this.forward.get(trimmed);
    if (existing) return existing;

    const n = (this.counters[kind] = (this.counters[kind] ?? 0) + 1);
    const token = `[${kind}_${n}]`;
    this.forward.set(trimmed, token);
    this.reverse.set(token, trimmed);
    return token;
  }

  /** Replaces every registered value in `text` with its token (longest first). */
  mask(text: string): string {
    let out = text;
    const originals = [...this.forward.keys()].sort((a, b) => b.length - a.length);
    for (const original of originals) {
      out = out.split(original).join(this.forward.get(original)!);
    }
    return out;
  }

  /** Restores real values in a model reply. */
  unmask(text: string): string {
    let out = text;
    const tokens = [...this.reverse.keys()].sort((a, b) => b.length - a.length);
    for (const token of tokens) {
      out = out.split(token).join(this.reverse.get(token)!);
    }
    return out;
  }

  /**
   * Deep-copies `value`, replacing any string under a sensitive key with a
   * token. Use to sanitize a structured context object before serializing it
   * into a prompt.
   */
  maskObject<T>(value: T): T {
    return this.walk(value, null) as T;
  }

  private walk(value: unknown, keyKind: PIIKind | null): unknown {
    if (typeof value === "string") {
      return keyKind ? this.token(value, keyKind) : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.walk(item, keyKind));
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.walk(v, classifyKey(k));
      }
      return out;
    }
    return value;
  }
}

// ─── Egress scanner ──────────────────────────────────────────────
// Patterns for identifiers that must never reach a remote provider.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Pakistani mobile: +923xxxxxxxxx / 03xxxxxxxxx, with optional separators.
const PK_PHONE_RE = /(?:\+?92[\s-]?|0)3\d{2}[\s-]?\d{7}\b/g;
// CNIC: 13 digits, usually 5-7-1.
const CNIC_RE = /\b\d{5}[\s-]?\d{7}[\s-]?\d\b/g;

/** Returns a de-duplicated list of PII-looking substrings found in `text`. */
export function scanForPII(text: string): string[] {
  const hits = new Set<string>();
  for (const re of [EMAIL_RE, PK_PHONE_RE, CNIC_RE]) {
    for (const m of text.matchAll(re)) hits.add(m[0]);
  }
  return [...hits];
}

/**
 * Throws if `text` still contains anything that looks like an email, phone
 * number or CNIC. Called immediately before any send to a remote AI provider.
 */
export function assertNoPII(text: string, context = "AI prompt"): void {
  const hits = scanForPII(text);
  if (hits.length > 0) {
    // Never log the values themselves — that would just relocate the leak.
    throw new PIILeakError(
      `Refusing to send ${context} to a third-party model: ${hits.length} ` +
        `personal identifier(s) (phone/email/CNIC) survived pseudonymization. ` +
        `This is blocked to protect student and guardian data.`
    );
  }
}
