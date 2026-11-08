/** SKAI-148 class setup copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const classSetupUiEntries: readonly (readonly [string, string, string])[] = [
  ["Create a range of grades", "إنشاء نطاق من الصفوف", "جماعتوں کی ایک رینج بنائیں"],
  ["e.g. Grade 1 to Grade 5, each with the same sections", "مثلاً من الصف 1 إلى الصف 5، لكل منها الشعب نفسها", "مثلاً گریڈ 1 سے گریڈ 5 تک، ہر ایک کے ایک جیسے سیکشن"],
  ["e.g. Grade", "مثلاً الصف", "مثلاً گریڈ"],
  ["From grade", "من الصف", "گریڈ سے"],
  ["To grade", "إلى الصف", "گریڈ تک"],
  ["Capacity (seats per class)", "السعة (مقاعد لكل فصل)", "گنجائش (فی جماعت نشستیں)"],
  ["Optional, e.g. 35", "اختياري، مثلاً 35", "اختیاری، مثلاً 35"],
  ["The last grade must be the same as or after the first grade, at most 15 grades.", "يجب أن يكون الصف الأخير مساوياً للصف الأول أو بعده، وبحد أقصى 15 صفاً.", "آخری گریڈ پہلے گریڈ کے برابر یا اس کے بعد ہو، زیادہ سے زیادہ 15 گریڈ۔"],
  ["Capacity must be a whole number from 1 to 200, or left blank.", "يجب أن تكون السعة عدداً صحيحاً من 1 إلى 200، أو تُترك فارغة.", "گنجائش 1 سے 200 تک مکمل عدد ہو، یا خالی چھوڑ دیں۔"],
  ["That would create more than 60 classes at once. Split the range or the sections.", "سيؤدي ذلك إلى إنشاء أكثر من 60 فصلاً دفعة واحدة. قسّم النطاق أو الشعب.", "اس سے ایک ساتھ 60 سے زیادہ جماعتیں بنیں گی۔ رینج یا سیکشن تقسیم کریں۔"],
  ["Created {0} classes, {1} to {2}", "تم إنشاء {0} فصول، من {1} إلى {2}", "{0} جماعتیں بن گئیں، {1} سے {2} تک"],
  ["{0} of {1} seats filled", "{0} من {1} مقاعد مشغولة", "{1} میں سے {0} نشستیں پُر"],
  ["Capacity not set", "السعة غير محددة", "گنجائش مقرر نہیں"],
];

export const arabicClassSetupUi: Record<string, string> = Object.fromEntries(classSetupUiEntries.map(([en, ar]) => [en, ar]));
export const urduClassSetupUi: Record<string, string> = Object.fromEntries(classSetupUiEntries.map(([en, , ur]) => [en, ur]));
