import type { Language } from "./package";
const en = {
events: "Scheduled exam impact",
eventHelp: "Existing date and local start time stay unchanged. UTC interpretations are shown below (up to 100 future papers). Zero candidates means a DST gap; two means an ambiguous time. Review the timetable before activation.",
noEvents: "No future timed exam papers in this scope.",
utcBefore: "Current UTC",
utcAfter: "Proposed UTC",
  country: "Institution / campus country", title: "Language and regional settings", help: "Preview before applying to your school. Display changes never convert stored amounts or identities.",
  personal: "My display language", inherit: "Inherit school or campus language", scope: "Settings scope", school: "School defaults", group: "School-group defaults", inherited: "Inherited from school", override: "Override this setting", delegated: "Delegated campus settings", delegationHelp: "Only checked fields can be changed by this campus administrator or principal.",
  language: "Default language", timezone: "IANA timezone", calendar: "Calendar display", numberingSystem: "Digits", currency: "Currency display package", weekStartsOn: "First weekday", weekend: "Weekend days", effectiveDate: "Effective date (YYYY-MM-DD, 00:00 UTC)",
  preview: "Preview changes", reset: "Reset draft", apply: "Apply reviewed settings", preparing: "Preparing interface and document samples…", save: "Save", saved: "Locale settings saved for the selected effective date.", pending: "Currency change awaits independent finance review.", permission: "School settings access or delegated campus permission is required.", timezoneError: "This timezone is unsupported. Choose a valid IANA timezone.", error: "Unable to save. Check the fields and try again.", futureDate: "Choose a future effective date.", stale: "Settings changed since preview. Preview again before applying.",
  dateHelp: "Gregorian and ISO 8601 display only. Stored dates remain Gregorian. No unvalidated calendar conversion is offered.", moneyHelp: "Existing records retain their currency and integer minor units. Currency changes require finance review. No automatic conversion.",
  attendance: "Attendance date", birthday: "Date of birth", invoice: "Invoice", report: "Report", notification: "Notification", print: "Print or save as PDF", before: "Current display", after: "Proposed display", schedule: "Future event (same stored UTC instant)", historical: "Historical event (original timezone retained)", original: "Underlying Gregorian date", synthetic: "Synthetic formatting sample; translation approval is still required.", review: "Pending finance review", approve: "Approve currency", reject: "Reject currency", active: "Scheduled / active", empty: "Choose a locale package to preview your school’s formats.", inheritedField: "Use school value", days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
type Catalog = { [K in keyof typeof en]: typeof en[K] extends string[] ? string[] : string };
const ar: Catalog = {
events: "أثر التغيير على الاختبارات المجدولة",
eventHelp: "يبقى التاريخ ووقت البدء المحلي دون تغيير. تظهر تفسيرات UTC لأول 100 اختبار مستقبلي. عدم وجود وقت يعني فجوة صيفية ووقتان يعنيان وقتًا ملتبسًا. راجع الجدول قبل التفعيل.",
noEvents: "لا توجد اختبارات مستقبلية بوقت محدد في هذا النطاق.",
utcBefore: "UTC الحالي",
utcAfter: "UTC المقترح",
  country: "\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u0624\u0633\u0633\u0629 / \u0627\u0644\u062d\u0631\u0645",
  title: "إعدادات اللغة والمنطقة", help: "عاين الإعدادات قبل تطبيقها على المدرسة. لا يغيّر العرض المبالغ المخزنة أو الهويات.",
  personal: "لغة العرض الشخصية", inherit: "استخدام لغة المدرسة أو الحرم", scope: "نطاق الإعدادات", school: "إعدادات المدرسة", group: "إعدادات مجموعة المدارس", inherited: "موروث من المدرسة", override: "تجاوز هذا الإعداد", delegated: "إعدادات الحرم المفوضة", delegationHelp: "يمكن لمسؤول الحرم أو المدير تغيير الحقول المحددة فقط.",
  language: "اللغة الافتراضية", timezone: "المنطقة الزمنية IANA", calendar: "عرض التقويم", numberingSystem: "الأرقام", currency: "حزمة عرض العملة", weekStartsOn: "أول أيام الأسبوع", weekend: "أيام العطلة الأسبوعية", effectiveDate: "تاريخ السريان (YYYY-MM-DD، الساعة 00:00 UTC)",
  preview: "معاينة التغييرات", reset: "إعادة تعيين المسودة", apply: "تطبيق الإعدادات المراجعة", preparing: "جارٍ إعداد نماذج الواجهة والمستندات…", save: "حفظ", saved: "تم حفظ إعدادات اللغة لتاريخ السريان المحدد.", pending: "تغيير العملة بانتظار مراجعة مالية مستقلة.", permission: "يلزم إذن إعدادات المدرسة أو تفويض الحرم.", timezoneError: "المنطقة الزمنية غير مدعومة. اختر منطقة IANA صالحة.", error: "تعذر الحفظ. تحقق من الحقول وحاول مجددًا.", futureDate: "اختر تاريخ سريان مستقبليًا.", stale: "تغيرت الإعدادات بعد المعاينة. أعد المعاينة قبل التطبيق.",
  dateHelp: "عرض التقويم الميلادي وISO 8601 فقط. تبقى التواريخ المخزنة ميلادية. لا تتوفر تحويلات تقويم غير معتمدة.", moneyHelp: "تحتفظ السجلات الحالية بعملتها ووحداتها الصغرى الصحيحة. يلزم تغيير العملة مراجعة مالية. لا يوجد تحويل تلقائي.",
  attendance: "تاريخ الحضور", birthday: "تاريخ الميلاد", invoice: "فاتورة", report: "تقرير", notification: "إشعار", print: "طباعة أو حفظ PDF", before: "العرض الحالي", after: "العرض المقترح", schedule: "حدث مستقبلي (نفس اللحظة المخزنة بتوقيت UTC)", historical: "حدث سابق (المنطقة الزمنية الأصلية محفوظة)", original: "التاريخ الميلادي الأساسي", synthetic: "نموذج تنسيق تجريبي؛ ما زالت الترجمة بحاجة إلى اعتماد.", review: "بانتظار المراجعة المالية", approve: "اعتماد العملة", reject: "رفض العملة", active: "مجدول / نشط", empty: "اختر حزمة اللغة لمعاينة تنسيقات المدرسة.", inheritedField: "استخدام قيمة المدرسة", days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};
const ur: Catalog = {
events: "طے شدہ امتحانات پر اثر",
eventHelp: "موجودہ تاریخ اور مقامی آغاز کا وقت برقرار رہتے ہیں۔ پہلے 100 آئندہ پرچوں کے UTC اوقات دکھائے گئے ہیں۔ کوئی وقت نہ ہونا موسمی خلا اور دو اوقات ابہام ظاہر کرتے ہیں۔ نفاذ سے پہلے شیڈول کا جائزہ لیں۔",
noEvents: "اس دائرے میں وقت والے آئندہ امتحانی پرچے نہیں ہیں۔",
utcBefore: "موجودہ UTC",
utcAfter: "مجوزہ UTC",
 country: "ادارے / کیمپس کا ملک", title: "زبان اور علاقائی ترتیبات", help: "اسکول پر لاگو کرنے سے پہلے پیش منظر دیکھیں۔ نمائش کی تبدیلی محفوظ رقوم یا شناخت تبدیل نہیں کرتی۔",
 personal: "میری نمائشی زبان", inherit: "اسکول یا کیمپس کی زبان استعمال کریں", scope: "ترتیبات کا دائرہ", school: "اسکول کی بنیادی ترتیبات", group: "اسکول گروپ کی بنیادی ترتیبات", inherited: "اسکول سے حاصل کردہ", override: "یہ ترتیب تبدیل کریں", delegated: "کیمپس کی تفویض کردہ ترتیبات", delegationHelp: "کیمپس منتظم یا پرنسپل صرف منتخب خانے تبدیل کر سکتا ہے۔",
 language: "بنیادی زبان", timezone: "IANA زمانی خطہ", calendar: "تقویم کی نمائش", numberingSystem: "ہندسے", currency: "کرنسی کی نمائش", weekStartsOn: "ہفتے کا پہلا دن", weekend: "ہفتہ وار تعطیلات", effectiveDate: "نافذ ہونے کی تاریخ (YYYY-MM-DD، 00:00 UTC)",
 preview: "تبدیلیوں کا پیش منظر", reset: "مسودہ دوبارہ ترتیب دیں", apply: "نظرثانی شدہ ترتیبات لاگو کریں", preparing: "انٹرفیس اور دستاویز کے نمونے تیار ہو رہے ہیں…", save: "محفوظ کریں", saved: "زبان کی ترتیبات منتخب تاریخ کے لیے محفوظ ہو گئیں۔", pending: "کرنسی کی تبدیلی آزاد مالی جائزے کی منتظر ہے۔", permission: "اسکول کی ترتیبات کی اجازت یا کیمپس کا اختیار درکار ہے۔", timezoneError: "یہ زمانی خطہ معاونت یافتہ نہیں۔ درست IANA خطہ منتخب کریں۔", error: "محفوظ نہیں ہو سکا۔ خانے جانچ کر دوبارہ کوشش کریں۔", futureDate: "مستقبل کی تاریخ منتخب کریں۔", stale: "پیش منظر کے بعد ترتیبات تبدیل ہوئی ہیں۔ دوبارہ پیش منظر دیکھیں۔",
 dateHelp: "صرف عیسوی اور ISO 8601 تقویم دستیاب ہیں۔ محفوظ تاریخیں عیسوی رہتی ہیں۔ غیر مصدقہ تقویمی تبدیلیاں دستیاب نہیں۔", moneyHelp: "پرانے ریکارڈ اپنی اصل کرنسی اور صحیح چھوٹی اکائیاں برقرار رکھتے ہیں۔ کرنسی کی تبدیلی کے لیے مالی جائزہ ضروری ہے۔ خودکار تبادلہ نہیں ہوتا۔",
 attendance: "حاضری کی تاریخ", birthday: "تاریخ پیدائش", invoice: "فیس کا بل", report: "رپورٹ", notification: "اطلاع", print: "پرنٹ یا PDF محفوظ کریں", before: "موجودہ نمائش", after: "مجوزہ نمائش", schedule: "مستقبل کا واقعہ (وہی محفوظ UTC لمحہ)", historical: "گزشتہ واقعہ (اصل زمانی خطہ برقرار)", original: "بنیادی عیسوی تاریخ", synthetic: "یہ نمائشی نمونہ ہے؛ ترجمے کی منظوری ابھی درکار ہے۔", review: "مالی جائزے کا منتظر", approve: "کرنسی منظور کریں", reject: "کرنسی مسترد کریں", active: "طے شدہ / فعال", empty: "اسکول کے فارمیٹ دیکھنے کے لیے زبان کا پیکیج منتخب کریں۔", inheritedField: "اسکول کی قدر استعمال کریں", days: ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"],
};

export const catalogs = { en, ar, ur };
export function messages(language: Language) { return catalogs[language]; }
