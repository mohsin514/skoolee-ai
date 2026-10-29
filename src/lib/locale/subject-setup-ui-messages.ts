/** SKAI-149 subject catalogue copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const subjectSetupUiEntries: readonly (readonly [string, string, string])[] = [
  ["Elective", "اختياري", "اختیاری"],
  ["Core", "أساسي", "لازمی"],
  ["Archived", "مؤرشف", "محفوظ شدہ"],
  ["Archive subject", "أرشفة المادة", "مضمون محفوظ کریں"],
  ["Restore subject", "استعادة المادة", "مضمون بحال کریں"],
  ["Subject code (optional)", "رمز المادة (اختياري)", "مضمون کا کوڈ (اختیاری)"],
  ["e.g. MATH", "مثال: MATH", "مثلاً MATH"],
  ["Elective subject", "مادة اختيارية", "اختیاری مضمون"],
  ["Add primary core pack", "إضافة حزمة المواد الأساسية للمرحلة الابتدائية", "پرائمری بنیادی پیک شامل کریں"],
  ["Add secondary core pack", "إضافة حزمة المواد الأساسية للمرحلة الثانوية", "سیکنڈری بنیادی پیک شامل کریں"],
  ["{0} subjects added, {1} already there", "أُضيفت {0} مواد، و{1} موجودة مسبقًا", "{0} مضامین شامل ہوئے، {1} پہلے سے موجود تھے"],
];
export const arabicSubjectSetupUi: Record<string, string> = Object.fromEntries(subjectSetupUiEntries.map(([key, ar]) => [key, ar]));
export const urduSubjectSetupUi: Record<string, string> = Object.fromEntries(subjectSetupUiEntries.map(([key, , ur]) => [key, ur]));
