export const TRANSLITERATION_RULES: [string, string][] = [
  ["sh", "ش"], ["ch", "چ"], ["kh", "خ"], ["th", "ث"], ["ph", "ف"],
  ["gh", "غ"], ["zh", "ژ"], ["aa", "ا"], ["ee", "ی"], ["oo", "و"],
  ["ai", "ائ"], ["au", "او"], ["ei", "ائ"],
  ["a", "ا"], ["b", "ب"], ["c", "ک"], ["d", "د"], ["e", "ے"],
  ["f", "ف"], ["g", "گ"], ["h", "ہ"], ["i", "ی"], ["j", "ج"],
  ["k", "ک"], ["l", "ل"], ["m", "م"], ["n", "ن"], ["o", "و"],
  ["p", "پ"], ["q", "ق"], ["r", "ر"], ["s", "س"], ["t", "ت"],
  ["u", "و"], ["v", "و"], ["w", "و"], ["x", "کس"], ["y", "ی"],
  ["z", "ز"],
];

export function transliterateToUrdu(text: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      let result = "";
      let i = 0;
      const lower = word.toLowerCase();
      while (i < lower.length) {
        let matched = false;
        for (const [from, to] of TRANSLITERATION_RULES) {
          if (lower.startsWith(from, i)) {
            result += to;
            i += from.length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          result += lower[i];
          i++;
        }
      }
      return result;
    })
    .join(" ");
}

export const URDU_KEYS = [
  ["ا", "ب", "پ", "ت", "ٹ", "ث", "ج", "چ", "ح", "خ"],
  ["د", "ڈ", "ذ", "ر", "ڑ", "ز", "ژ", "س", "ش", "ص"],
  ["ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل"],
  ["م", "ن", "ں", "و", "ہ", "ھ", "ء", "ی", "ے", " "],
];
