/**
 * SKO-480: counts with the right plural form per language, using the CLDR categories from
 * Intl.PluralRules (Arabic has zero, one, two, few, many and other) instead of an English "s" rule.
 */
export type CountNoun = "student" | "subject" | "class" | "campus";
type Language = "en" | "ar" | "ur";
type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const NOUNS: Record<Language, Record<CountNoun, Forms>> = {
  en: {
    student: { one: "{0} student", other: "{0} students" },
    subject: { one: "{0} subject", other: "{0} subjects" },
    class: { one: "{0} class", other: "{0} classes" },
    campus: { one: "{0} campus", other: "{0} campuses" },
  },
  ar: {
    student: { zero: "لا طلاب", one: "طالب واحد", two: "طالبان", few: "{0} طلاب", many: "{0} طالبًا", other: "{0} طالب" },
    subject: { zero: "لا مواد", one: "مادة واحدة", two: "مادتان", few: "{0} مواد", many: "{0} مادة", other: "{0} مادة" },
    class: { zero: "لا صفوف", one: "صف واحد", two: "صفان", few: "{0} صفوف", many: "{0} صفًا", other: "{0} صف" },
    campus: { zero: "لا فروع", one: "فرع واحد", two: "فرعان", few: "{0} فروع", many: "{0} فرعًا", other: "{0} فرع" },
  },
  ur: {
    student: { one: "{0} طالب علم", other: "{0} طلبہ" },
    subject: { one: "{0} مضمون", other: "{0} مضامین" },
    class: { one: "{0} جماعت", other: "{0} جماعتیں" },
    campus: { one: "{0} کیمپس", other: "{0} کیمپسز" },
  },
};

export function countLabel(language: string, count: number, noun: CountNoun) {
  const lang: Language = language === "ar" || language === "ur" ? language : "en";
  const forms = NOUNS[lang][noun];
  const category = new Intl.PluralRules(lang).select(count);
  return (forms[category] ?? forms.other).replace("{0}", new Intl.NumberFormat(lang === "en" ? "en" : `${lang}-u-nu-latn`).format(count));
}
