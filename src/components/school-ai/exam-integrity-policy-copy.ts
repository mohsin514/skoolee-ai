import type { AssessmentLocale } from "@/lib/school-ai/assessment";
const en = {
  title: "Activity reporting and retention", off: "Activity reporting is off for this exam. Video recording has separate settings.",
  notice: (days: number) => `This exam reports page visibility, window focus and camera or upload interruptions to authorized exam staff. Reports, staff review notes and their audit copies expire ${days} day(s) after your server exam deadline. They do not include visited websites, keystrokes, video or audio.`,
  safeguards: "These observations do not prove misconduct or change marks. Reporting problems never block answer saving or submission.",
  enable: "Enable browser activity reports for this assignment", days: "Retention days after the exam deadline", daysHint: "Choose 1–365 days under your school's approved policy. No duration is preselected; this product limit is not a legal recommendation.",
  reference: "Approved school policy reference", referenceHint: "Enter the policy name or reference. Do not include learner information.",
  save: "Save activity policy", saving: "Saving policy…", saved: "Activity policy saved. Candidates see the notice before starting.", failure: "The policy could not be saved. Refresh and try again.",
  frozen: "An authorized administrator can set this policy before the first attempt. Once an attempt starts, its retention period cannot be extended.",
  expires: "Expires", retentionHint: "Expired reports and review notes disappear from staff views immediately. The retention worker removes their stored copies; operational monitoring is required.",
};
const ar: typeof en = {
  title: "الإبلاغ عن النشاط والاحتفاظ", off: "الإبلاغ عن النشاط متوقف لهذا الامتحان. لتسجيل الفيديو إعدادات منفصلة.",
  notice: days => `يرسل هذا الامتحان ظهور الصفحة وتركيز النافذة وانقطاعات الكاميرا أو الرفع إلى موظفي الامتحان المخوّلين. تنتهي صلاحية التقارير وملاحظات المراجعة ونسخ سجل التدقيق بعد ${days} يوم من موعد انتهاء امتحانك على الخادم. لا تتضمن المواقع التي زرتها أو ضغطات المفاتيح أو الفيديو أو الصوت.`,
  safeguards: "لا تثبت هذه الملاحظات مخالفة ولا تغيّر الدرجات. مشاكل الإبلاغ لا تمنع حفظ الإجابات أو تسليمها.",
  enable: "تفعيل تقارير نشاط المتصفح لهذا الامتحان", days: "أيام الاحتفاظ بعد موعد انتهاء الامتحان", daysHint: "اختر من 1 إلى 365 يومًا وفق سياسة المدرسة المعتمدة. لا توجد مدة محددة مسبقًا؛ حد المنتج ليس توصية قانونية.",
  reference: "مرجع سياسة المدرسة المعتمدة", referenceHint: "أدخل اسم السياسة أو مرجعها دون معلومات عن الطلاب.",
  save: "حفظ سياسة النشاط", saving: "جارٍ حفظ السياسة…", saved: "حُفظت سياسة النشاط. يرى الطلاب الإشعار قبل البدء.", failure: "تعذّر حفظ السياسة. حدّث الصفحة وحاول مجددًا.",
  frozen: "يمكن للمسؤول المخوّل ضبط السياسة قبل أول محاولة. بعد بدء المحاولة، لا يمكن تمديد مدة الاحتفاظ.",
  expires: "تنتهي الصلاحية", retentionHint: "تختفي التقارير وملاحظات المراجعة المنتهية من عروض الموظفين فورًا. تحذف مهمة الاحتفاظ النسخ المخزنة؛ يلزم رصد التشغيل.",
};
const ur: typeof en = {
  title: "سرگرمی کی رپورٹ اور محفوظ رکھنے کی مدت", off: "اس امتحان میں سرگرمی کی رپورٹ بند ہے۔ ویڈیو ریکارڈنگ کی ترتیبات الگ ہیں۔",
  notice: days => `یہ امتحان صفحے کی موجودگی، ونڈو کی توجہ، کیمرے یا اپ لوڈ کی رکاوٹوں کی رپورٹ مجاز امتحانی عملے کو دیتا ہے۔ رپورٹس، عملے کے جائزے کے نوٹس اور ان کی آڈٹ نقول سرور پر آپ کے امتحان کی آخری مہلت کے ${days} دن بعد ختم ہوتی ہیں۔ ان میں دیکھی گئی ویب سائٹس، کی بورڈ کی ٹائپنگ، ویڈیو یا آواز شامل نہیں۔`,
  safeguards: "یہ مشاہدات بدعملی کا ثبوت نہیں اور نمبر تبدیل نہیں کرتے۔ رپورٹنگ کا مسئلہ جوابات محفوظ کرنے یا جمع کرانے سے نہیں روکتا۔",
  enable: "اس امتحان کے لیے براؤزر سرگرمی کی رپورٹ فعال کریں", days: "امتحان کی آخری مہلت کے بعد محفوظ رکھنے کے دن", daysHint: "اسکول کی منظور شدہ پالیسی کے مطابق 1 سے 365 دن منتخب کریں۔ کوئی مدت پہلے سے منتخب نہیں؛ مصنوعات کی یہ حد قانونی سفارش نہیں ہے۔",
  reference: "اسکول کی منظور شدہ پالیسی کا حوالہ", referenceHint: "پالیسی کا نام یا حوالہ لکھیں۔ طالب علم کی معلومات شامل نہ کریں۔",
  save: "سرگرمی کی پالیسی محفوظ کریں", saving: "پالیسی محفوظ ہو رہی ہے…", saved: "سرگرمی کی پالیسی محفوظ ہوگئی۔ طلبہ آغاز سے پہلے اطلاع دیکھتے ہیں۔", failure: "پالیسی محفوظ نہیں ہوئی۔ تازہ کریں اور دوبارہ کوشش کریں۔",
  frozen: "مجاز منتظم پہلی کوشش سے پہلے یہ پالیسی مقرر کر سکتا ہے۔ کوشش شروع ہونے کے بعد محفوظ رکھنے کی مدت بڑھائی نہیں جا سکتی۔",
  expires: "مدت ختم", retentionHint: "مدت ختم ہونے پر رپورٹس اور جائزے کے نوٹس عملے کے منظر سے فوراً ہٹ جاتے ہیں۔ مقررہ کام محفوظ نقول حذف کرتا ہے؛ کام کی نگرانی ضروری ہے۔",
};
export const examIntegrityPolicyCopy = (locale: AssessmentLocale) => locale === "ar" ? ar : locale === "ur" ? ur : en;
