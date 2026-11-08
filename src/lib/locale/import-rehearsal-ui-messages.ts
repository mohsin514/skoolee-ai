/** SKAI-913 roster migration rehearsal copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const importRehearsalUiEntries: readonly (readonly [string, string, string])[] = [
  ["Rehearsal only", "معاينة تجريبية فقط", "صرف آزمائشی جائزہ"],
  ["Nothing has been saved. Pupil, guardian and enrollment records stay unchanged until you commit this reviewed batch.", "لم يُحفظ أي شيء. تبقى سجلات الطلاب وأولياء الأمور والتسجيل دون تغيير حتى تعتمد هذه الدفعة بعد مراجعتها.", "ابھی کچھ محفوظ نہیں ہوا۔ جب تک آپ اس جائزہ شدہ بیچ کو منظور نہیں کرتے، طلبہ، سرپرستوں اور داخلوں کا ریکارڈ نہیں بدلے گا۔"],
  ["Additions", "إضافات", "اضافے"],
  ["Existing, unchanged", "موجود، دون تغيير", "موجود، بغیر تبدیلی"],
  ["Excluded", "مستبعد", "خارج"],
  ["Errors", "أخطاء", "غلطیاں"],
  ["Unresolved", "غير محسوم", "غیر حل شدہ"],
  ["Total rows", "مجموع الصفوف", "کل قطاریں"],
  ["Download reconciliation sheet", "تنزيل ورقة المطابقة", "مطابقتی شیٹ ڈاؤن لوڈ کریں"],
  ["Unfinished rehearsal", "معاينة غير مكتملة", "نامکمل آزمائشی جائزہ"],
  ["Reopen rehearsal", "إعادة فتح المعاينة", "جائزہ دوبارہ کھولیں"],
  ["{0} was staged {1} and has not been committed.", "تمت معاينة {0} في {1} ولم يتم اعتمادها بعد.", "{0} کو {1} پر جائزے کے لیے رکھا گیا اور ابھی منظور نہیں ہوا۔"],
  ["Could not reopen this rehearsal", "تعذرت إعادة فتح هذه المعاينة", "یہ جائزہ دوبارہ نہیں کھل سکا"],
];
export const arabicImportRehearsalUi: Record<string, string> = Object.fromEntries(importRehearsalUiEntries.map(([key, ar]) => [key, ar]));
export const urduImportRehearsalUi: Record<string, string> = Object.fromEntries(importRehearsalUiEntries.map(([key, , ur]) => [key, ur]));
