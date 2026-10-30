import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalDigest, canonicalJson, legacyWorkspaceRequestHash, normalizeForHash } from "../../src/lib/school-ai/canonical";

/** A real stored `SchoolAiRecord.requestHash` input: `{ kind, title, campusId, data }`. */
const storedRequest = { campusId: "campus-a", data: { curriculumId: "curriculum-a", language: "en", questions: [{ id: "q1", marks: 2, prompt: "What is 2 + 2?" }] }, kind: "PAPER", title: "Term One Mathematics" };
const STORED_REQUEST_HASH = "522b8067ba0364bd09c1d01e3d2252db741dbb28320ff9a4e09361749f226354";

/** The legacy comparator, recomputed here so "behaviour unchanged" is checked against the
 * host's own collation rather than against a hash that a different ICU build would move. */
function localeCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(localeCanonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, localeCanonical(item)]));
  return value;
}
const localeHash = (value: unknown) => createHash("sha256").update(JSON.stringify(localeCanonical(value))).digest("hex");

test("key order is code unit, not collation, so a verifier outside Skoolee AI recomputes the same digest", () => {
  const pairs: ReadonlyArray<readonly [string, string]> = [["a", "B"], ["Z", "a"], ["a", "A"], ["z", "ä"]];
  const disagreeing = pairs.filter(([a, b]) => Math.sign(a < b ? -1 : a > b ? 1 : 0) !== Math.sign(a.localeCompare(b)));
  assert.ok(disagreeing.length > 0, `collation and code units agree on every candidate pair: ${JSON.stringify(pairs)}`);
  for (const [a, b] of disagreeing) {
    const keys = Object.keys(JSON.parse(canonicalJson({ [a]: 1, [b]: 2 })) as Record<string, unknown>);
    assert.deepEqual(keys, [a, b].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    assert.notDeepEqual(keys, [a, b].sort((x, y) => x.localeCompare(y)));
  }
  // Same fields, collated order vs code-unit order: the digests must not be interchangeable.
  const mixed = { B: 3, Z: 1, a: 2, nested: { A: "x", b: [1, 2] } };
  assert.notEqual(canonicalDigest(mixed), legacyWorkspaceRequestHash(mixed));
});

test("legacyWorkspaceRequestHash reproduces a stored hash byte for byte and keeps its collated order", () => {
  assert.equal(legacyWorkspaceRequestHash(storedRequest), STORED_REQUEST_HASH);
  const shuffled = { title: "Term One Mathematics", kind: "PAPER", data: { questions: [{ prompt: "What is 2 + 2?", marks: 2, id: "q1" }], language: "en", curriculumId: "curriculum-a" }, campusId: "campus-a" };
  assert.equal(legacyWorkspaceRequestHash(shuffled), STORED_REQUEST_HASH);
  for (const value of [{ B: 3, Z: 1, a: 2, nested: { A: "x", b: [{ y: 1, X: 2 }] } }, { fingerprint: "f-1", kind: "SOURCE", campusId: null }, [1, "two", null], "plain", 7]) {
    assert.equal(legacyWorkspaceRequestHash(value), localeHash(value));
  }
});

test("repository re-exports the legacy hash under its existing name and keeps no collated sort of its own", () => {
  const source = readFileSync(new URL("../../src/lib/school-ai/repository.ts", import.meta.url), "utf8");
  assert.match(source, /export const workspaceRequestHash = legacyWorkspaceRequestHash;/);
  assert.match(source, /import \{ legacyWorkspaceRequestHash \} from "\.\/canonical";/);
  assert.ok(!source.includes("localeCompare"), "repository.ts must not sort hash input with localeCompare any more");
});

test("canonical serialization is key-order independent and refuses values a verifier cannot reproduce", () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  assert.equal(canonicalDigest({ b: 1, a: 2 }), canonicalDigest({ a: 2, b: 1 }));
  assert.equal(canonicalDigest({ a: 1 }), createHash("sha256").update('{"a":1}', "utf8").digest("hex"));
  // An absent optional field and a present-but-undefined one are the same paper.
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
  assert.equal(canonicalJson([undefined]), "[null]");
  // One object reached twice as siblings is legal; reached inside itself it is not.
  const shared = { k: 1 };
  assert.equal(canonicalJson({ a: shared, b: shared }), '{"a":{"k":1},"b":{"k":1}}');
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /CANONICAL_CYCLE/);
  for (const value of [undefined, { n: Number.NaN }, { n: Number.POSITIVE_INFINITY }, { at: new Date(0) }, { m: new Map() }, { s: new Set() }, { n: BigInt(1) }, new Date(0)]) {
    assert.throws(() => canonicalJson(value), /CANONICAL_UNSUPPORTED_VALUE/);
  }
});

test("normalizeForHash folds line endings, trailing blanks and Unicode form without touching the input", () => {
  assert.equal(normalizeForHash("a \r\nb\t\r\nc"), "a\nb\nc");
  assert.equal(normalizeForHash("x  \ny\t\n"), "x\ny\n");
  assert.equal(normalizeForHash("e\u0301"), "\u00e9");
  assert.equal(normalizeForHash("\u0627\u0644\u0633\u0644\u0627\u0645 \r\n"), "\u0627\u0644\u0633\u0644\u0627\u0645\n");
  const input = { "prompt ": "Solve \r\n2x = 4  ", items: [{ text: "e\u0301 \t" }], marks: 2, flag: true, missing: null };
  assert.deepEqual(normalizeForHash(input), { "prompt ": "Solve\n2x = 4", items: [{ text: "\u00e9" }], marks: 2, flag: true, missing: null });
  // Hash input only: the stored projection is never rewritten in place.
  assert.deepEqual(input.items, [{ text: "e\u0301 \t" }]);
  assert.equal(input["prompt "], "Solve \r\n2x = 4  ");
  // Only insignificant whitespace is folded; a digest still separates different content.
  assert.equal(canonicalDigest(normalizeForHash({ p: "a\r\nb  " })), canonicalDigest(normalizeForHash({ p: "a\nb" })));
  assert.notEqual(canonicalDigest(normalizeForHash({ p: "a b" })), canonicalDigest(normalizeForHash({ p: "ab" })));
});
