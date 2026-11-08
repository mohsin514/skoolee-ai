/** SKAI-1370 admissions lifecycle copy: [English, Arabic, Urdu]. Placeholders such as {0} must survive translation. */
export const admissionsLifecycleUiEntries: readonly (readonly [string, string, string])[] = [
  ["Outcome recorded", "تم تسجيل النتيجة", "نتیجہ درج ہو گیا"],
  ["Booking cancelled", "تم إلغاء الحجز", "بکنگ منسوخ کر دی گئی"],
  ["Waitlist place changed", "تم تغيير مكان قائمة الانتظار", "انتظار کی فہرست میں جگہ تبدیل ہو گئی"],
  ["Offer lapsed", "انتهت صلاحية العرض", "پیشکش کی مدت ختم ہو گئی"],
  ["Respond by {0}", "الرد قبل {0}", "{0} تک جواب دیں"],
  ["The respond-by date ({0}) has passed; the family can no longer accept online. Record their answer or waitlist the place.", "لقد انقضى موعد الرد ({0})؛ لم يعد بإمكان الأسرة القبول عبر الإنترنت. سجّل ردّها أو ضعها في قائمة الانتظار.", "جواب دینے کی آخری تاریخ ({0}) گزر چکی ہے؛ خاندان اب آن لائن قبول نہیں کر سکتا۔ ان کا جواب درج کریں یا جگہ انتظار کی فہرست میں ڈالیں۔"],
  ["The family must respond by {0}.", "يجب على الأسرة الرد قبل {0}.", "خاندان کو {0} تک جواب دینا ہوگا۔"],
  ["Waitlist place #{0}", "مكان قائمة الانتظار #{0}", "انتظار کی فہرست میں جگہ #{0}"],
  ["Moved up.", "تم الصعود مرتبة.", "ایک درجہ اوپر منتقل ہوا۔"],
  ["Moved down.", "تم النزول مرتبة.", "ایک درجہ نیچے منتقل ہوا۔"],
  ["Family must respond by (optional)", "يجب على الأسرة الرد قبل (اختياري)", "خاندان کو جواب کی آخری تاریخ (اختیاری)"],
  ["Please respond by {0}.", "يرجى الرد قبل {0}.", "براہ کرم {0} تک جواب دیں۔"],
  ["Offer saved, but this class is over-offered: {0} of {1} seats are taken or offered.", "حُفظ العرض، لكن هذا الصف تجاوز عدد مقاعده: {0} من {1} مقعدًا مشغولة أو معروضة.", "پیشکش محفوظ ہو گئی، لیکن اس کلاس میں گنجائش سے زیادہ پیشکشیں ہیں: {1} میں سے {0} نشستیں لی جا چکی یا پیش کی جا چکی ہیں۔"],
];
export const arabicAdmissionsLifecycleUi: Record<string, string> = Object.fromEntries(admissionsLifecycleUiEntries.map(([key, ar]) => [key, ar]));
export const urduAdmissionsLifecycleUi: Record<string, string> = Object.fromEntries(admissionsLifecycleUiEntries.map(([key, , ur]) => [key, ur]));
