import { normalizeText } from "../planner/normalize";

/**
 * Child-safety and wellbeing phrases (EN/AR/UR, including Roman Urdu). A request that mentions harm to a
 * child, abuse, self-harm or bullying is not an AI task: it is never stored as a segment, never sent to
 * a model and never logged as a capability gap. The person is shown how to reach a trusted adult at
 * school instead. Matching is deliberately broad; a false positive costs one extra sentence of care.
 */
const PHRASES = [
  // English
  "abuse", "abused", "abusing", "molest", "touched me", "touches me", "hit me", "hits me", "beat me", "beats me", "hurting me", "hurt myself", "self harm", "self-harm",
  "kill myself", "suicide", "suicidal", "want to die", "bullied", "bullying", "bully me", "unsafe at home", "scared to go home", "harass", "harassed", "harassment",
  // Roman Urdu
  "mujhe marta", "mujhe marti", "khudkushi", "mar jana chahta", "mar jana chahti", "tang karta", "tang karti",
  // Urdu
  "زیادتی", "مارتا ہے", "مارتی ہے", "خودکشی", "مرنا چاہتا", "مرنا چاہتی", "تنگ کرتا", "تنگ کرتی", "ہراساں", "جنسی",
  // Arabic
  "تحرش", "اعتداء", "يضربني", "تضربني", "انتحار", "أؤذي نفسي", "اؤذي نفسي", "تنمر", "أريد أن أموت", "اريد ان اموت",
].map(phrase => normalizeText(phrase));

export function mentionsCare(text: string): boolean {
  const normalized = normalizeText(text);
  return PHRASES.some(phrase => {
    const at = normalized.indexOf(phrase);
    if (at < 0) return false;
    // Whole words only for Latin phrases ("abuse" must not match "disabuse" in "kabuse"); scripts without case compare as substrings.
    if (!/^[a-z]/.test(phrase)) return true;
    const before = normalized[at - 1], after = normalized[at + phrase.length];
    return (!before || !/[a-z]/.test(before)) && (!after || !/[a-z]/.test(after));
  });
}
