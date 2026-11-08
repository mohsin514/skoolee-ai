import type { AssessmentLocale } from "@/lib/school-ai/assessment";

// SKO-407: alignment to the curriculum being assembled, duplicates and specific coverage gaps.
type Copy = {
  objective: string; anyObjective: string; sameVersion: string; mapped: string; partlyMapped: string; unmapped: string; duplicate: string;
  noAllowed: string; leadDecision: string; relations: { SAME: string; PARTIAL: string; STABLE_ID: string };
  gapsTitle: string; noGaps: string; gapOutcome: string; gapSlots: string;
};
const en: Copy = {
  objective: "Objective in this curriculum", anyObjective: "Any objective", sameVersion: "Same curriculum version", mapped: "Mapped by a curriculum lead", partlyMapped: "Some objectives are not mapped yet", unmapped: "Different curriculum version — no recorded mapping",
  duplicate: "Already in this paper", noAllowed: "No recorded mapping for this objective. Ask a curriculum lead to record one in the objective map.", leadDecision: "Only objectives a curriculum lead mapped are offered.",
  relations: { SAME: "same objective", PARTIAL: "partly overlaps", STABLE_ID: "same objective, newer version" },
  gapsTitle: "Coverage still missing", noGaps: "Every planned objective and question slot is covered.", gapOutcome: "{marks} marks of {outcome} coverage are still missing in {section}.", gapSlots: "{section}: {marks} marks of question slots are still empty.",
};
const ar: Copy = {
  objective: "الهدف في هذا المنهج", anyObjective: "أي هدف", sameVersion: "إصدار المنهج نفسه", mapped: "رُبط بواسطة قائد المنهج", partlyMapped: "بعض الأهداف غير مربوطة بعد", unmapped: "إصدار منهج مختلف — لا يوجد ربط مسجل",
  duplicate: "موجود في هذه الورقة", noAllowed: "لا يوجد ربط مسجل لهذا الهدف. اطلب من قائد المنهج تسجيله في خريطة الأهداف.", leadDecision: "لا تُعرض إلا الأهداف التي ربطها قائد المنهج.",
  relations: { SAME: "الهدف نفسه", PARTIAL: "تداخل جزئي", STABLE_ID: "الهدف نفسه، إصدار أحدث" },
  gapsTitle: "تغطية ما زالت ناقصة", noGaps: "كل هدف مخطط وكل خانة سؤال مغطاة.", gapOutcome: "ما زالت {marks} درجات من تغطية {outcome} ناقصة في {section}.", gapSlots: "{section}: ما زالت خانات أسئلة بقيمة {marks} درجات فارغة.",
};
const ur: Copy = {
  objective: "اس نصاب میں مقصد", anyObjective: "کوئی بھی مقصد", sameVersion: "نصاب کا یہی ورژن", mapped: "نصاب کے سربراہ نے منسلک کیا", partlyMapped: "کچھ مقاصد ابھی منسلک نہیں", unmapped: "نصاب کا مختلف ورژن — کوئی ریکارڈ شدہ ربط نہیں",
  duplicate: "اس پرچے میں پہلے سے موجود", noAllowed: "اس مقصد کا کوئی ریکارڈ شدہ ربط نہیں۔ نصاب کے سربراہ سے مقاصد کے نقشے میں درج کرائیں۔", leadDecision: "صرف وہ مقاصد دکھائے جاتے ہیں جنہیں نصاب کے سربراہ نے منسلک کیا۔",
  relations: { SAME: "ایک ہی مقصد", PARTIAL: "جزوی مماثلت", STABLE_ID: "ایک ہی مقصد، نیا ورژن" },
  gapsTitle: "کوریج ابھی باقی ہے", noGaps: "ہر منصوبہ بند مقصد اور سوال کی جگہ پوری ہے۔", gapOutcome: "{section} میں {outcome} کی کوریج کے {marks} نمبر ابھی باقی ہیں۔", gapSlots: "{section}: سوالات کی خالی جگہوں کے {marks} نمبر باقی ہیں۔",
};
export const questionBankAlignmentCopy = (locale: AssessmentLocale): Copy => locale === "ar" ? ar : locale === "ur" ? ur : en;
export const fillCopy = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key) => key in values ? String(values[key]) : match);
