import { createHash } from "node:crypto";

/** Canonical serialization for content hashes.
 *
 * A Content_Hash has to be recomputable by a reviewer who has no access to Skoolee AI
 * (R19.3), and has to be independent of key order and insignificant whitespace (R8.2).
 * Both properties fail the moment serialization depends on host configuration, so this
 * module refuses every value whose JSON text would be ambiguous instead of coercing it.
 */

const UNSUPPORTED = "CANONICAL_UNSUPPORTED_VALUE";

/** Class instances, Date, Map and Set all serialize through host-specific hooks, and
 * recursing into their own entries would silently hash `{}`. Only plain records pass. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Code-unit order, never `localeCompare`: ICU collation differs between builds, locales
 * and runtimes, so a collated key order is not reproducible outside this process. */
const byCodeUnit = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0);

function write(value: unknown, path: string, open: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    // NaN and Infinity would serialize as `null` and collide with a real null.
    case "number": if (!Number.isFinite(value)) throw new Error(`${UNSUPPORTED}:${path}`); return JSON.stringify(value);
    case "string": return JSON.stringify(value);
    case "object": break;
    default: throw new Error(`${UNSUPPORTED}:${path}`);
  }
  const node = value as object;
  // Tracked per branch, not globally: the same object may legitimately appear twice as
  // siblings (`replaceOneQuestion` copies untouched items by reference) but never inside itself.
  if (open.has(node)) throw new Error(`CANONICAL_CYCLE:${path}`);
  open.add(node);
  try {
    if (Array.isArray(value)) return `[${value.map((item, index) => write(item === undefined ? null : item, `${path}[${index}]`, open)).join(",")}]`;
    if (!isPlainRecord(value)) throw new Error(`${UNSUPPORTED}:${path}`);
    // An undefined property is dropped, exactly as `JSON.stringify` drops it, so an absent
    // optional field and a present-but-undefined one cannot produce two different hashes.
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(byCodeUnit);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${write(item, `${path}.${key}`, open)}`).join(",")}}`;
  } finally {
    open.delete(node);
  }
}

/** Deterministic JSON text with every object key in code-unit order. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error(`${UNSUPPORTED}:$`);
  return write(value, "$", new Set<object>());
}

/** sha256 of `canonicalJson(value)` as UTF-8 bytes. The encoding is stated explicitly
 * because an independent verifier has to hash the same bytes. */
export function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** `\r\n`/`\r` -> `\n`, trailing spaces and tabs removed per line, then Unicode NFC.
 * Applied in that order, and to hash input only: stored and rendered content keeps its
 * original bytes, because an exam answer or a figure caption is evidence. */
const normalizeHashText = (text: string) => text.replace(/\r\n?/gu, "\n").replace(/[ \t]+$/gmu, "").normalize("NFC");

/** Normalizes every string inside a hash input, leaving the shape untouched.
 * Object keys are left alone on purpose: normalizing a key could merge two fields and
 * silently drop content from the hash. */
export function normalizeForHash<T>(value: T): T {
  if (typeof value === "string") return normalizeHashText(value) as T;
  if (Array.isArray(value)) return value.map(item => normalizeForHash(item)) as T;
  if (isPlainRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeForHash(item)])) as T;
  return value;
}

/** Sorts keys with `localeCompare`, which is ICU-dependent and therefore wrong for a
 * hash anyone has to reproduce. It is kept byte-for-byte because its output is persisted
 * in `SchoolAiRecord.requestHash` and compared against stored rows on idempotency
 * replay; changing it would reject a replay of work already accepted. New digests use
 * `canonicalDigest`. Do not reuse this function for anything new. */
function legacyCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legacyCanonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, legacyCanonical(item)]));
  return value;
}
export function legacyWorkspaceRequestHash(value: unknown) { return createHash("sha256").update(JSON.stringify(legacyCanonical(value))).digest("hex"); }
