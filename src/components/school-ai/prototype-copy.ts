import type { Language } from "@/lib/locale/package";

const messages = {
  selectSaved: ["Choose a saved curriculum or paper to continue, or start a new one.", "اختر منهجًا أو ورقة محفوظة للمتابعة، أو ابدأ واحدًا جديدًا.", "جاری رکھنے کے لیے محفوظ نصاب یا پرچہ منتخب کریں، یا نیا بنائیں۔"],
  title: ["Try a sample workflow", "جرّب سير عمل نموذجيًا", "نمونہ ورک فلو آزمائیں"],
  hint: ["Explore the assistant, a curriculum and an exam paper with fictional school data. Available even when the AI connection is unavailable.", "استكشف المساعد والمنهج وورقة الامتحان ببيانات مدرسية خيالية، حتى عند تعذر اتصال الذكاء الاصطناعي.", "فرضی اسکول ڈیٹا کے ساتھ معاون، نصاب اور امتحانی پرچہ آزمائیں۔ اے آئی کنکشن دستیاب نہ ہونے پر بھی کام کرتا ہے۔"],
  sample: ["Sample mode", "الوضع التجريبي", "نمونہ موڈ"],
  open: ["Try sample demo", "جرّب العرض النموذجي", "نمونہ ڈیمو آزمائیں"],
  close: ["Close sample", "إغلاق النموذج", "نمونہ بند کریں"],
  assistant: ["Assistant", "المساعد", "معاون"],
  curriculum: ["Curriculum", "المنهج", "نصاب"],
  paper: ["Exam paper", "ورقة الامتحان", "امتحانی پرچہ"],
  message: ["What would you like to try?", "ماذا تود أن تجرب؟", "آپ کیا آزمانا چاہیں گے؟"],
  defaultMessage: ["Plan a 40-minute lesson on fractions for Grade 5 using sample data.", "خطّط لدرس مدته 40 دقيقة عن الكسور للصف الخامس باستخدام بيانات نموذجية.", "نمونہ ڈیٹا سے جماعت پنجم کے لیے کسر پر 40 منٹ کا سبق بنائیں۔"],
  run: ["Run sample workflow", "تشغيل سير العمل النموذجي", "نمونہ ورک فلو چلائیں"],
  response: ["Sample response", "إجابة نموذجية", "نمونہ جواب"],
  outcomes: ["Learning outcomes", "نواتج التعلم", "سیکھنے کے نتائج"],
  evidence: ["Sample source material", "مصادر نموذجية", "نمونہ ماخذ مواد"],
  answer: ["Show answer and marking guide", "عرض الإجابة ودليل التصحيح", "جواب اور مارکنگ رہنما دیکھیں"],
  marks: ["marks", "درجات", "نمبر"],
  minutes: ["minutes", "دقائق", "منٹ"],
  copy: ["Copy sample", "نسخ النموذج", "نمونہ کاپی کریں"],
  copied: ["Sample copied", "نُسخ النموذج", "نمونہ کاپی ہو گیا"],
  copyFailed: ["Select the sample text to copy it.", "حدد نص النموذج لنسخه.", "کاپی کرنے کے لیے نمونہ متن منتخب کریں۔"],
  download: ["Download sample", "تنزيل النموذج", "نمونہ ڈاؤن لوڈ کریں"],
  configured: ["Configured", "مُعدّ", "ترتیب دیا گیا"],
  liveUnavailable: ["Live AI could not complete this request. Your draft is retained. Retry, continue editing, or try the sample workflow.", "تعذر على الذكاء الاصطناعي المباشر إكمال الطلب. احتُفظ بمسودتك. أعد المحاولة أو تابع التحرير أو جرّب سير العمل النموذجي.", "لائیو اے آئی درخواست مکمل نہیں کر سکا۔ آپ کا مسودہ برقرار ہے۔ دوبارہ کوشش کریں، ترمیم جاری رکھیں یا نمونہ ورک فلو آزمائیں۔"],
  editSample: ["Edit sample draft", "تحرير المسودة النموذجية", "نمونہ مسودہ ترمیم کریں"],
  starterTitle: ["Start with an example", "ابدأ بمثال", "مثال سے شروع کریں"],
  lesson: ["Plan a lesson", "خطّط لدرس", "سبق بنائیں"],
  lessonPrompt: ["Help me plan a 40-minute lesson. Ask me for the class, subject and learning outcome first.", "ساعدني في التخطيط لدرس مدته 40 دقيقة. اسألني أولاً عن الصف والمادة وناتج التعلم.", "40 منٹ کا سبق بنانے میں مدد کریں۔ پہلے جماعت، مضمون اور سیکھنے کا مقصد پوچھیں۔"],
  notice: ["Draft a parent notice", "اكتب إشعارًا للأهل", "والدین کے لیے اطلاع"],
  noticePrompt: ["Help me draft a parent announcement. Ask for the event, date and audience before writing it.", "ساعدني في كتابة إعلان للأهل. اسأل عن الحدث والتاريخ والجمهور قبل كتابته.", "والدین کے لیے اعلان لکھنے میں مدد کریں۔ پہلے تقریب، تاریخ اور متعلقہ افراد کے بارے میں پوچھیں۔"],
  checklist: ["Create a checklist", "أنشئ قائمة تحقق", "چیک لسٹ بنائیں"],
  checklistPrompt: ["Help me make a school readiness checklist. Ask which campus and term I am preparing for.", "ساعدني في إعداد قائمة لجاهزية المدرسة. اسألني عن الفرع والفصل الدراسي الذي أستعد له.", "اسکول کی تیاری کی چیک لسٹ بنانے میں مدد کریں۔ پوچھیں کہ میں کس شاخ اور ٹرم کی تیاری کر رہا ہوں۔"],
  navigation: ["Choose a workspace tool", "اختر أداة في مساحة العمل", "ورک اسپیس ٹول منتخب کریں"],
} as const;

export function prototypeCopy(language: Language) {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  return Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[index]])) as Record<keyof typeof messages, string>;
}
