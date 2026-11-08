/** SKAI-151 grading model copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const gradingModelUiEntries: readonly (readonly [string, string, string])[] = [
  ["Each grade band needs a different label.", "يجب أن يكون لكل نطاق تقدير اسم مختلف.", "ہر گریڈ بینڈ کا نام مختلف ہونا چاہیے۔"],
  ["The pass mark must equal the start of a grade band, so no band mixes passing and failing results.", "يجب أن تساوي درجة النجاح بداية أحد نطاقات التقدير، حتى لا يجمع نطاق واحد بين النجاح والرسوب.", "پاس مارک کسی گریڈ بینڈ کے آغاز کے برابر ہونا چاہیے، تاکہ کسی ایک بینڈ میں پاس اور فیل دونوں نتائج نہ ہوں۔"],
  ["Give every grade band GPA points from 0 to 10, never higher than the band above it.", "أعطِ كل نطاق تقدير نقاط معدل من 0 إلى 10، دون أن تتجاوز نقاط النطاق الذي يعلوه.", "ہر گریڈ بینڈ کو 0 سے 10 تک جی پی اے پوائنٹس دیں، جو اوپر والے بینڈ سے زیادہ نہ ہوں۔"],
  ["Confirm the re-grade impact before you activate this version.", "أكّد أثر إعادة التقدير قبل تفعيل هذا الإصدار.", "اس ورژن کو فعال کرنے سے پہلے دوبارہ گریڈنگ کے اثر کی تصدیق کریں۔"],
  ["Effect on recorded marks", "الأثر على الدرجات المسجلة", "درج شدہ نمبروں پر اثر"],
  ["{0} marks re-graded: {1} change letter, {2} change pass or fail, {3} on published exams.", "أُعيد تقدير {0} درجة: {1} يتغير تقديرها، و{2} تتغير نتيجتها بين النجاح والرسوب، و{3} في امتحانات منشورة.", "{0} نمبروں کی دوبارہ گریڈنگ: {1} کا گریڈ بدلے گا، {2} کا پاس یا فیل بدلے گا، {3} شائع شدہ امتحانات میں۔"],
  ["I have reviewed these changes. Activate this version for new calculations; published reports keep their issued grades until re-issued.", "راجعتُ هذه التغييرات. فعّل هذا الإصدار للحسابات الجديدة؛ تحتفظ التقارير المنشورة بتقديراتها الصادرة حتى يُعاد إصدارها.", "میں نے یہ تبدیلیاں دیکھ لی ہیں۔ یہ ورژن نئے حساب کے لیے فعال کریں؛ شائع شدہ رپورٹیں دوبارہ جاری ہونے تک اپنے جاری کردہ گریڈ برقرار رکھیں گی۔"],
  ["GPA points", "نقاط المعدل", "جی پی اے پوائنٹس"],
  ["GPA", "المعدل", "جی پی اے"],
  ["The pass mark must start a band. Add GPA points to every band, or leave them all empty for letter grades only.", "يجب أن تبدأ درجة النجاح نطاقًا. أضف نقاط المعدل لكل نطاق، أو اتركها جميعًا فارغة للتقديرات الحرفية فقط.", "پاس مارک کسی بینڈ کا آغاز ہونا چاہیے۔ ہر بینڈ میں جی پی اے پوائنٹس شامل کریں، یا صرف حرفی گریڈ کے لیے سب خالی چھوڑ دیں۔"],
];
export const arabicGradingModelUi: Record<string, string> = Object.fromEntries(gradingModelUiEntries.map(([key, ar]) => [key, ar]));
export const urduGradingModelUi: Record<string, string> = Object.fromEntries(gradingModelUiEntries.map(([key, , ur]) => [key, ur]));
