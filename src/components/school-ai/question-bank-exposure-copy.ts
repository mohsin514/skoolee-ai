import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import type { BankReuseReason } from "@/lib/school-ai/question-bank-exposure";

type Copy = { title: string; blocked: string; noConflict: string; last: string; next: string; count: string; none: string; practice: string; repair: string; reasons: Record<BankReuseReason, string> };
const en: Copy = {
  title: "Recorded reuse checks", blocked: "Reuse blocked", noConflict: "No recorded reuse conflict", last: "Last recorded exposure", next: "Next recorded exposure", count: "Exposure records for this item", none: "None recorded",
  practice: "Practice and external sharing eligibility have not been evaluated. This check does not certify that an item is safe for practice.",
  repair: "Choose another reviewed question, or ask the assessment lead to review the recorded restriction. Existing issued versions stay unchanged.",
  reasons: { SOURCE_ARCHIVED: "The source paper is archived.", FUTURE_EXPOSURE: "This item or its recorded origin is scheduled for a future exposure.", SEALED_FORM: "The source paper or its form set has a sealed release. No reuse authorization is recorded.", ACTIVE_EXAM: "The source paper has an active exam whose availability window has not ended.", HISTORY_LIMIT: "The exposure history exceeds the inspection limit and needs review." },
};
const ar: Copy = {
  title: "فحوصات إعادة الاستخدام المسجلة", blocked: "إعادة الاستخدام محظورة", noConflict: "لا يوجد تعارض مسجل لإعادة الاستخدام", last: "آخر عرض مسجل", next: "العرض المسجل التالي", count: "سجلات عرض هذا السؤال", none: "لا يوجد سجل",
  practice: "لم تُقيَّم أهلية التدريب أو المشاركة الخارجية. هذا الفحص لا يؤكد أن السؤال آمن للاستخدام في التدريب.",
  repair: "اختر سؤالاً آخر تمت مراجعته، أو اطلب من مسؤول التقييم مراجعة القيد المسجل. تبقى النسخ الصادرة دون تغيير.",
  reasons: { SOURCE_ARCHIVED: "الورقة الأصلية مؤرشفة.", FUTURE_EXPOSURE: "هذا السؤال أو أصله المسجل مقرر لعرض مستقبلي.", SEALED_FORM: "للورقة الأصلية أو مجموعة نماذجها إصدار مختوم. لا يوجد تصريح مسجل لإعادة الاستخدام.", ACTIVE_EXAM: "للورقة الأصلية امتحان نشط لم تنتهِ فترة إتاحته.", HISTORY_LIMIT: "يتجاوز سجل العرض حد الفحص ويحتاج إلى مراجعة." },
};
const ur: Copy = {
  title: "دوبارہ استعمال کی ریکارڈ شدہ جانچ", blocked: "دوبارہ استعمال مسدود ہے", noConflict: "دوبارہ استعمال کا کوئی ریکارڈ شدہ تضاد نہیں", last: "آخری ریکارڈ شدہ پیشکش", next: "اگلی ریکارڈ شدہ پیشکش", count: "اس سوال کی پیشکش کے ریکارڈ", none: "کوئی ریکارڈ نہیں",
  practice: "مشق اور بیرونی اشتراک کی اہلیت نہیں جانچی گئی۔ یہ جانچ سوال کے مشق کے لیے محفوظ ہونے کی تصدیق نہیں کرتی۔",
  repair: "کوئی دوسرا جائزہ شدہ سوال منتخب کریں، یا تشخیصی نگران سے ریکارڈ شدہ پابندی کا جائزہ لیں۔ جاری شدہ نسخے تبدیل نہیں ہوتے۔",
  reasons: { SOURCE_ARCHIVED: "ماخذ پرچہ آرکائیو میں ہے۔", FUTURE_EXPOSURE: "یہ سوال یا اس کا ریکارڈ شدہ ماخذ مستقبل کی پیشکش کے لیے مقرر ہے۔", SEALED_FORM: "ماخذ پرچے یا اس کے فارم سیٹ کا مہر بند اجرا موجود ہے۔ دوبارہ استعمال کی اجازت ریکارڈ نہیں ہے۔", ACTIVE_EXAM: "ماخذ پرچے کا فعال امتحان ہے جس کی دستیابی کی مدت ختم نہیں ہوئی۔", HISTORY_LIMIT: "پیشکش کا ریکارڈ جانچ کی حد سے زیادہ ہے اور جائزہ درکار ہے۔" },
};
export const questionBankExposureCopy = (locale: AssessmentLocale): Copy => locale === "ar" ? ar : locale === "ur" ? ur : en;
