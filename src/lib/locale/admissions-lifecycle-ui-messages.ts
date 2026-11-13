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
  // SKAI-1258: offer terms and acceptance deposit.
  ["Enrolment terms the family must agree to (optional)", "شروط التسجيل التي يجب أن توافق عليها الأسرة (اختياري)", "داخلے کی شرائط جن پر خاندان کو متفق ہونا ہوگا (اختیاری)"],
  ["Acceptance deposit (optional)", "عربون القبول (اختياري)", "قبولیت کی پیشگی رقم (اختیاری)"],
  ["Deposit currency", "عملة العربون", "پیشگی رقم کی کرنسی"],
  ["Enrolment terms", "شروط التسجيل", "داخلے کی شرائط"],
  ["Acceptance deposit: {0}", "عربون القبول: {0}", "قبولیت کی پیشگی رقم: {0}"],
  ["I have read and agree to these enrolment terms.", "لقد قرأت شروط التسجيل هذه وأوافق عليها.", "میں نے داخلے کی یہ شرائط پڑھ لی ہیں اور ان سے متفق ہوں۔"],
  ["You agreed to these terms on {0}.", "لقد وافقت على هذه الشروط في {0}.", "آپ نے {0} کو ان شرائط سے اتفاق کیا۔"],
  // SKAI-1261: priority criteria and score.
  ["Most urgent first", "الأكثر إلحاحًا أولًا", "سب سے فوری پہلے"],
  ["Highest priority score first", "أعلى درجة أولوية أولًا", "سب سے زیادہ ترجیحی اسکور پہلے"],
  ["Priority {0}", "الأولوية {0}", "ترجیح {0}"],
  ["Priority score {0}", "درجة الأولوية {0}", "ترجیحی اسکور {0}"],
  ["No priority criteria met", "لم يُستوفَ أي معيار أولوية", "کوئی ترجیحی معیار پورا نہیں ہوا"],
  ["Priority criteria, one per line: points | question key | answer | name (English)", "معايير الأولوية، معيار في كل سطر: النقاط | مفتاح السؤال | الإجابة | الاسم (بالإنجليزية)", "ترجیحی معیارات، ہر سطر میں ایک: پوائنٹس | سوال کی کلید | جواب | نام (انگریزی)"],
  ["Used to rank offers, for example: 10 | hasSibling | yes | Sibling at the school", "تُستخدم لترتيب العروض، مثلًا: 10 | hasSibling | yes | أخ أو أخت في المدرسة", "پیشکشوں کی درجہ بندی کے لیے، مثلاً: 10 | hasSibling | yes | اسکول میں بہن بھائی"],
];
export const arabicAdmissionsLifecycleUi: Record<string, string> = Object.fromEntries(admissionsLifecycleUiEntries.map(([key, ar]) => [key, ar]));
export const urduAdmissionsLifecycleUi: Record<string, string> = Object.fromEntries(admissionsLifecycleUiEntries.map(([key, , ur]) => [key, ur]));
