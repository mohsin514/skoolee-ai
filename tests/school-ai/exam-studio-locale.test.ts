/**
 * Property 37 — Exam Studio interface copy exists in all three languages and avoids concatenation
 * (R22.1, R22.3, R22.4, R22.8, R22.9).
 *
 * The sweep is driven from `EXAM_STUDIO_COPY_AREAS`, so every area a later UI task registers is
 * covered without this file being edited. `exam-studio-copy.test.ts` holds the example-based checks
 * of the status vocabulary and of three named `fillStudioCopy` calls; this file holds the universal
 * statements over generated input — generated key subsets and orderings, generated placeholder value
 * sets, generated placeholder reorderings and generated spellings of the banned terms:
 *
 * - every generated key resolves through `pickStudioCopy` in English, Arabic and Urdu (R22.1, R22.8);
 * - a key's placeholder multiset agrees across the three languages, numbered and gap-free (R22.9);
 * - `fillStudioCopy` substitutes by index, so a translation may reorder the parts and still render
 *   exactly the same values — the generated reorderings stand for an RTL translation moving the
 *   parts around the sentence (R22.9);
 * - a generated placeholder value — a person name, record identifier, server code or candidate
 *   response, including hostile text and text that itself reads like a placeholder — passes through
 *   byte for byte and is never translated or expanded a second time (R22.3, R22.4);
 * - no value in any language carries an English fragment, a bare concatenation seam, a literal
 *   server code or a banned absolute-security term (R22.9, R22.3, R1.8).
 *
 * Two parts of Requirement 22 are deliberately not asserted here because neither is a property of
 * the copy tables: the document direction of R22.2 and the `<bdi>` isolation of R22.4 belong to the
 * shell and are checked by `npm run check:ui`. What this file does assert of R22.4 is the copy-side
 * precondition for that isolation — authored text, maths and code reach a message as a placeholder
 * value that survives substitution unchanged, never as part of a translated string.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, type Language } from "../../src/lib/locale/package";
import { EXAM_STUDIO_COPY_AREAS, fillStudioCopy, pickStudioCopy } from "../../src/lib/school-ai/exam-studio-copy";
import { PROPERTY_ITERATIONS, SEEDS_100, arbitraryHostileString, forEachSeed, xorshift, type Rng } from "./exam-studio-generators";

// ---------------------------------------------------------------------------------------------
// The registry under test
// ---------------------------------------------------------------------------------------------

type CopyAddress = { area: string; key: string };

/** Every `<area, key>` pair the copy index exposes, in registration order. */
const ADDRESSES: readonly CopyAddress[] = EXAM_STUDIO_COPY_AREAS.flatMap((area) => Object.keys(area.en).map((key) => ({ area: area.area, key })));
const AREAS = new Map(EXAM_STUDIO_COPY_AREAS.map((area) => [area.area, area]));
const label = (address: CopyAddress) => `${address.area}.${address.key}`;

/**
 * Resolve an address through the public reader. Returns null for an address the registry does not
 * hold, so a shrunk candidate that invents an area or key cannot masquerade as a copy defect.
 */
function resolve(address: CopyAddress): Record<Language, string> | null {
  const area = AREAS.get(address.area);
  if (!area || !Object.prototype.hasOwnProperty.call(area.en, address.key)) return null;
  const values = {} as Record<Language, string>;
  for (const language of LANGUAGES) values[language] = pickStudioCopy(area, language)[address.key];
  return values;
}

// ---------------------------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------------------------

/** R1.8 bans these from interface copy. The scan runs over every language so a translation cannot reintroduce one. */
const BANNED_TERMS = ["cheat-proof", "tamper-proof", "fraud-proof", "guaranteed detection"] as const;
/** Separators a translator or a copy editor could put between the two words of a banned term. */
const BANNED_SEPARATORS = ["-", " ", "  ", "\u00a0", "\u2010", "\u2011", "\u2013", "\u2014", " - "] as const;

/** Folds case, compatibility forms, every dash shape and every run of spacing, so `Cheat\u2011Proof` and `cheat  proof` both reduce to the recorded term. */
const seamFold = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[-\s]+/g, "-");
const bannedHit = (value: string) => BANNED_TERMS.find((term) => seamFold(value).includes(seamFold(term)));

/** Letters and digits of the three scripts Exam Studio ships, without a Unicode property escape the ES2017 target would reject. */
const WORD_CHARACTERS = "0-9A-Za-z\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff";
const LETTER_OR_DIGIT = new RegExp(`[${WORD_CHARACTERS}]`);
const NON_WORD = new RegExp(`[^${WORD_CHARACTERS}]+`);

/** A value split into placeholder tokens and words, so the seam check reads `{0}` as a part rather than as punctuation. */
const wordTokens = (value: string) => value.split(/(\{\d+\})/).flatMap((part) => (/^\{\d+\}$/.test(part) ? [part] : part.split(NON_WORD).filter(Boolean)));

/**
 * ASCII words of three letters or more carrying at least one lowercase letter. An acronym or a unit
 * — `PDF`, `A4`, `CSV` — reads the same in all three languages and is allowed through; `Draft` or
 * `review` left inside an Arabic string is an untranslated English fragment.
 */
const latinWords = (value: string) => (value.match(/[A-Za-z]{3,}/g) ?? []).filter((word) => /[a-z]/.test(word));

/** An English connective at either edge of a value is a sentence fragment waiting to be concatenated. */
const CONNECTIVES = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);

/** A server code, record identifier or UUID baked into copy text. Each of those reaches the screen as a placeholder value, never as a translated string (R22.3). */
const IDENTIFIER_LITERAL = /[A-Z][A-Z0-9]*_[A-Z0-9_]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{6,}/;

const occurrences = (haystack: string, needle: string) => (needle.length === 0 ? 0 : haystack.split(needle).length - 1);

/**
 * `forEachSeed` appends the failing seed and the shrunk input to the error's message, but a Node
 * `AssertionError` captured its stack when it was constructed and the test reporter prints that
 * stack rather than the current message. Rethrowing the annotated message as a fresh error puts the
 * seed and the shrunk input in the printed failure, with the original assertion kept as the cause.
 * `exam-studio-evidence.test.ts` wraps its sweep the same way.
 */
function sweep<T>(build: (rng: Rng, seed: number) => T, check: (value: T, seed: number) => void): void {
  try {
    forEachSeed(build, check);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }
}

// ---------------------------------------------------------------------------------------------
// Generated input
// ---------------------------------------------------------------------------------------------

/**
 * Values a composed message carries. R22.3 excludes a translation of each of these kinds, so the
 * property is that they travel through substitution byte for byte in every language.
 */
const DO_NOT_TRANSLATE = [
  "Fatima Al-Mansouri", "\u0641\u0627\u0637\u0645\u0629 \u0627\u0644\u0645\u0646\u0635\u0648\u0631\u064a", "\u0639\u0627\u0626\u0634\u06c1 \u062e\u0627\u0646", // person names
  "SKO-408", "rec_01HQ8ZJ4K7V9M2PBN", "paper-7f3a21", "q-A-s1-3", // record identifiers
  "NEEDS_SOURCE", "ATTEMPT_WINDOW_CLOSED", "409", // server codes
  "2 + 2 = 4", "\u0627\u062c\u0645\u0639 \u0627\u0644\u0643\u0645\u064a\u062a\u064a\u0646 \u062b\u0645 \u0627\u0639\u062f \u0627\u0644\u0639\u062f.", "return a + b;", // candidate responses, one with an LTR formula inside RTL prose
  "{1}", "${0}", "$&", "$'", // a response that reads like a placeholder or like a replacement pattern
] as const;

/** Interface words of the synthetic composed message, one pool per language. */
const PROSE: Record<Language, readonly string[]> = {
  en: ["Section", "of", "items left", "for", "marks"],
  ar: ["\u0627\u0644\u0642\u0633\u0645", "\u0645\u0646", "\u0639\u0646\u0627\u0635\u0631 \u0645\u062a\u0628\u0642\u064a\u0629", "\u0644\u0640", "\u062f\u0631\u062c\u0627\u062a"],
  ur: ["\u062d\u0635\u06c1", "\u0645\u06cc\u06ba \u0633\u06d2", "\u0639\u0646\u0627\u0635\u0631 \u0628\u0627\u0642\u06cc", "\u06a9\u06d2 \u0644\u06cc\u06d2", "\u0646\u0645\u0628\u0631"],
};

/** `\u241f` ("\u241f"), produced by no generator, so a rendered message splits back into the parts it was composed from. */
const SEGMENT = "\u241f";

type CopyProbe = {
  /** A generated subset of the registry in a generated order (R22.1 over every key, not a fixed sample). */
  addresses: CopyAddress[];
  /** Candidate placeholder values: names, identifiers, server codes, candidate responses and hostile text. */
  values: string[];
  /** How many of those the caller actually supplies, so an unsupplied index is exercised as well. */
  supplied: number;
  /** The placeholder order of the synthetic translation: a language that moves the parts (R22.9). */
  order: number[];
  /** Interface words between the parts, drawn per language. */
  prose: Record<Language, string[]>;
};

function arbitraryCopyProbe(rng: Rng): CopyProbe {
  const addresses = rng.subset(ADDRESSES, 1, ADDRESSES.length);
  const parts = rng.int(1, 4);
  const values = Array.from({ length: parts }, () => (rng.bool(1, 3) ? arbitraryHostileString(rng, { maxLength: 120 }).value : rng.pick(DO_NOT_TRANSLATE)));
  const prose = {} as Record<Language, string[]>;
  for (const language of LANGUAGES) prose[language] = Array.from({ length: rng.int(1, PROSE[language].length) }, () => rng.pick(PROSE[language]));
  return {
    addresses,
    values,
    // One draw in four leaves a trailing index unsupplied, which must render as the token rather than as `undefined`.
    supplied: rng.bool(1, 4) ? rng.int(0, parts - 1) : parts,
    order: rng.shuffle(Array.from({ length: parts }, (_unused, index) => index)),
    prose,
  };
}

/** The generator's own bound on `values`, kept here so the domain check and the draw cannot drift apart. */
const MAX_PARTS = 4;

/**
 * True while a candidate is a probe the generator could actually have drawn.
 *
 * The shrinker removes array elements, so it reaches probes with no placeholder parts at all, or an
 * `order` that is no longer a permutation of the parts. The composed-message oracle below is not
 * defined there — a message with no parts renders one empty segment where the expectation holds
 * none — so such a candidate fails for a reason the copy index cannot cause. Skipping it keeps the
 * reported shrunk input a real counterexample instead of the empty probe, which every failure would
 * otherwise collapse to. `exam-studio-evidence.test.ts` guards its sweep the same way.
 *
 * An empty `addresses` list is deliberately allowed: it is a legitimate narrowing that says the
 * failure needs no copy key, and `resolve` already tolerates an address the registry does not hold.
 */
function insideGeneratorDomain(probe: CopyProbe): boolean {
  const parts = probe.values.length;
  if (parts < 1 || parts > MAX_PARTS) return false;
  if (!Number.isInteger(probe.supplied) || probe.supplied < 0 || probe.supplied > parts) return false;
  if (probe.order.length !== parts) return false;
  return [...probe.order].sort((left, right) => left - right).every((index, position) => index === position);
}

// Feature: ai-exam-studio, Property 37: Interface copy exists in all three languages and avoids concatenation
test("Property 37: interface copy exists in all three languages and avoids concatenation", () => {
  assert.ok(ADDRESSES.length > 0, "the Exam Studio copy registry is empty, so the sweep would pass vacuously");
  assert.ok(SEEDS_100.length >= 100 && PROPERTY_ITERATIONS >= 100, `the seeded sweep offers ${PROPERTY_ITERATIONS} iterations; the testing strategy requires at least 100`);
  const visited = new Set<string>();

  sweep(arbitraryCopyProbe, (probe, seed) => {
    if (!insideGeneratorDomain(probe)) return; // a shrunk candidate the generator could not have drawn
    const supplied = probe.values.slice(0, Math.max(0, Math.min(probe.supplied, probe.values.length)));
    for (const value of [...probe.values, ...LANGUAGES.flatMap((language) => probe.prose[language] ?? [])]) {
      assert.ok(!value.includes(SEGMENT), `the generator produced the reserved segment separator inside ${JSON.stringify(value)}`);
    }

    for (const address of probe.addresses) {
      const values = resolve(address);
      if (!values) continue; // a shrunk candidate may name an area or key the registry does not hold
      const name = label(address);
      visited.add(name);

      for (const language of LANGUAGES) {
        // Annotated rather than inferred, and it must stay annotated. `assert.equal` from
        // `node:assert/strict` carries `asserts actual is T`, so the `typeof value` assertion below
        // is resolved against the type of `value` itself; with an inferred declaration that is
        // circular, TypeScript falls back to `any`, and every scan in this block then passes
        // vacuously on an `any`.
        const value: string = values[language];
        // R22.1 and R22.8: the key resolves, in this language, to copy of its own. The declared
        // type promises a string; this asserts the table actually holds one, which is what a locale
        // table missing the key would break at runtime.
        assert.equal(typeof value, "string", `${name} does not resolve in ${language}`);
        assert.ok(value.trim().length > 0, `${name} resolves to blank copy in ${language}`);

        // R22.9: numbered placeholders only, gap-free, with no stray brace a message would render literally.
        const braced = value.match(/\{[^{}]*\}/g) ?? [];
        for (const token of braced) assert.match(token, /^\{\d+\}$/, `${name} in ${language} uses ${token}; Exam Studio copy is numbered only`);
        const bare = value.replace(/\{\d+\}/g, "");
        assert.ok(!bare.includes("{") && !bare.includes("}"), `${name} in ${language} leaves a stray brace, which a composed message would render as text`);
        const indices = [...new Set(braced.map((token) => Number(token.slice(1, -1))))].sort((left, right) => left - right);
        assert.deepEqual(indices, indices.map((_unused, position) => position), `${name} in ${language} skips a placeholder index; the convention is 0-based and gap-free`);
        assert.ok(LETTER_OR_DIGIT.test(bare), `${name} in ${language} is placeholders and separators only, which assembles other strings instead of being copy`);

        // R1.8, carried into interface copy by R22.1.
        const hit = bannedHit(value);
        assert.equal(hit, undefined, `${name} in ${language} claims "${hit ?? ""}"`);

        // R22.3: an identifier or server code is a placeholder value, never part of a translated string.
        const embedded = value.match(IDENTIFIER_LITERAL);
        assert.equal(embedded, null, `${name} in ${language} embeds the identifier "${embedded?.[0] ?? ""}" in its copy`);
      }

      // R22.9: a value that opens or closes on an English connective is a fragment awaiting concatenation.
      const tokens = wordTokens(values.en);
      for (const edge of [tokens[0], tokens[tokens.length - 1]]) {
        if (edge) assert.ok(!CONNECTIVES.has(edge.toLowerCase()), `${name} begins or ends on the connective "${edge}", so it is an English fragment meant to be concatenated`);
      }
      // R22.1 and R22.8: a translation that keeps an English word is not a translation.
      const english = new Set(latinWords(values.en).map((word) => word.toLowerCase()));
      for (const language of ["ar", "ur"] as const) {
        for (const word of latinWords(values[language])) assert.ok(!english.has(word.toLowerCase()), `${name} in ${language} keeps the English fragment "${word}"`);
      }

      // R22.9: the three languages compose the same message from the same parts, in whatever order each reads best.
      const multiset = (language: Language) => (values[language].match(/\{\d+\}/g) ?? []).sort();
      for (const language of LANGUAGES) assert.deepEqual(multiset(language), multiset("en"), `${name} changes its placeholder multiset in ${language}`);

      // R22.3 and R22.4: every supplied value survives substitution into the real template unchanged.
      for (const language of LANGUAGES) {
        const rendered = fillStudioCopy(values[language], supplied);
        for (let index = 0; index < supplied.length; index += 1) {
          const token = `{${index}}`;
          const count = occurrences(values[language], token);
          if (count === 0 || supplied[index].length === 0) continue;
          assert.ok(occurrences(rendered, supplied[index]) >= count, `${name} in ${language} altered the value passed at ${token}`);
          if (!supplied.some((value) => value.includes(token))) assert.ok(!rendered.includes(token), `${name} in ${language} left ${token} unfilled`);
        }
        // A supplied value may itself read like a placeholder — `DO_NOT_TRANSLATE` carries `{1}`,
        // because a candidate may legitimately type one — and `fillStudioCopy` substitutes in a
        // single pass, so such a value is inserted verbatim and never expanded a second time. The
        // tokens an unsupplied index should still show are therefore the template's own plus the
        // ones each substituted value carried in with it.
        // Return type annotated, like `value` above: inside this sweep callback an inferred one is
        // resolved through the callback's own type and TypeScript falls back to `any`.
        const carriedIn = (token: string): number => supplied.reduce<number>((total, value, index) => total + occurrences(value, token) * occurrences(values[language], `{${index}}`), 0);
        for (let index = supplied.length; index < supplied.length + 2; index += 1) {
          const token = `{${index}}`;
          assert.equal(occurrences(rendered, token), occurrences(values[language], token) + carriedIn(token), `${name} in ${language} did not leave the unsupplied ${token} intact`);
        }
      }
    }

    // A synthetic composed message, so the reordering statement is exercised while the registered
    // areas still carry no placeholders. Each part carries its own interface word, exactly as a
    // translation moves "of {1}" ahead of "{0}".
    const reference = [...probe.order].sort((left, right) => left - right);
    for (const language of LANGUAGES) {
      const words = probe.prose[language] ?? [];
      const wordAt = (index: number) => (words.length === 0 ? "part" : words[Math.abs(index) % words.length]);
      const template = (sequence: readonly number[]) => sequence.map((index) => `${wordAt(index)} {${index}}`).join(SEGMENT);
      const expected = (sequence: readonly number[]) => sequence.map((index) => `${wordAt(index)} ${index < supplied.length ? supplied[index] : `{${index}}`}`);
      const render = (sequence: readonly number[]) => fillStudioCopy(template(sequence), supplied).split(SEGMENT);

      // Substitution is by index and nothing else: no positional drift, no re-expansion of a value
      // that reads like a placeholder, no interpretation of a `$` replacement pattern.
      for (const sequence of [probe.order, reference]) assert.deepEqual(render(sequence), expected(sequence), `fillStudioCopy did not substitute by index in ${language}`);
      // The statement the property names: reordering the placeholders renders the same values.
      assert.deepEqual([...render(probe.order)].sort(), [...render(reference)].sort(), `reordering the placeholders changed what the ${language} message renders`);
    }

    // The scan above is only as good as the spellings it catches, so each banned term is replayed in
    // a generated casing and dash shape. The variants come from the seed rather than from the probe,
    // so shrinking a failure elsewhere cannot quietly weaken this check.
    const variantRng = xorshift(seed ^ 0x51ed51ed);
    for (const term of BANNED_TERMS) {
      const variant = [...term].map((character) => (variantRng.bool() ? character.toUpperCase() : character)).join("").replace(/[-\s]/g, () => variantRng.pick(BANNED_SEPARATORS));
      assert.equal(bannedHit(`${variantRng.pick(PROSE.en)} ${variant} ${variantRng.pick(PROSE.ar)}`), term, `the banned-term scan misses the spelling "${variant}"`);
    }
  });

  // Generated subsets sample the registry; this closes the universal quantifier over every key.
  assert.deepEqual([...visited].sort(), ADDRESSES.map(label).sort(), "the sweep did not reach every registered copy key");
});

/**
 * The property above skips a candidate outside the generator's domain, so this records that the
 * generator never draws one — the skip exists for the shrinker alone and cannot quietly swallow a
 * real draw — and that the generated input is varied enough for the statements to mean something.
 */
test("the generated probes stay inside the generator's domain and vary the input the property needs", () => {
  const doNotTranslate = new Set<string>(DO_NOT_TRANSLATE);
  let hostile = 0;
  let verbatim = 0;
  let reordered = 0;
  let unsupplied = 0;
  let fullySupplied = 0;
  const sizes = new Set<number>();

  sweep(arbitraryCopyProbe, (probe, seed) => {
    assert.ok(insideGeneratorDomain(probe), `seed ${seed} drew a probe the property would have skipped`);
    assert.ok(probe.addresses.length >= 1 && probe.addresses.length <= ADDRESSES.length, `seed ${seed} drew ${probe.addresses.length} addresses`);
    for (const language of LANGUAGES) assert.ok(probe.prose[language].length >= 1, `seed ${seed} drew no ${language} interface words`);

    for (const value of probe.values) {
      if (doNotTranslate.has(value)) verbatim += 1;
      else hostile += 1;
    }
    if (probe.order.some((index, position) => index !== position)) reordered += 1;
    if (probe.supplied < probe.values.length) unsupplied += 1;
    if (probe.supplied === probe.values.length) fullySupplied += 1;
    sizes.add(probe.addresses.length);
  });

  assert.ok(hostile > 0 && verbatim > 0, `the sweep drew ${hostile} hostile and ${verbatim} do-not-translate values; it needs both`);
  assert.ok(reordered > 0, "the sweep never drew a placeholder order that differs from the sorted reference, so the reordering statement would be trivial");
  assert.ok(unsupplied > 0 && fullySupplied > 0, `the sweep drew ${unsupplied} probes with an unsupplied index and ${fullySupplied} fully supplied; it needs both`);
  assert.ok(sizes.size > 1, "the sweep drew one key-subset size only, so the registry is sampled rather than swept");
});
