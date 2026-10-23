import type { Pseudonymizer } from "@/lib/ai/pseudonymize";

/**
 * Names of real people in the actor's scope. A typed request ("issue Atlas to Ayesha") or a lookup
 * label ("Ayesha Khan · 7B") carries names under no sensitive key, so key-based masking alone sends
 * them to the provider. Matching against the campus vocabulary tokenises them wherever they appear.
 */
export interface PeopleVocabulary { names: string[] }

const MIN_LENGTH = 3;

/** Whole names and their individual parts, longest first, deduplicated after NFKC. */
export function buildVocabulary(fullNames: Iterable<string | null | undefined>): PeopleVocabulary {
  const names = new Set<string>();
  for (const raw of fullNames) {
    const name = raw?.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!name || name.length < MIN_LENGTH) continue;
    names.add(name);
    // Given names are how people are usually typed ("Ayesha", "علی"); very short parts would
    // over-match ordinary words, so they stay unregistered.
    for (const part of name.split(" ")) if (part.length >= MIN_LENGTH) names.add(part);
  }
  return { names: [...names].sort((a, b) => b.length - a.length) };
}

/** Registers every vocabulary name that occurs in `texts` (Unicode word boundaries) with the masker. */
export function registerVocabulary(masker: Pseudonymizer, vocabulary: PeopleVocabulary, texts: string[]) {
  const haystack = texts.join("\n").normalize("NFKC");
  let registered = 0;
  for (const name of vocabulary.names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(haystack)) { masker.token(name, "PERSON"); registered++; }
  }
  return registered;
}
