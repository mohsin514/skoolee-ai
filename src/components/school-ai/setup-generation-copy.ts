import type { Language } from "@/lib/locale/package";

const messages = {
  reviewTitle: ["Your school workspace", "مساحة عمل مدرستك", "آپ کے اسکول کی ورک اسپیس"],
  reviewHint: ["Your answers become saved, editable plans and policies. Open a generated draft to review the details and continue the workflow.", "تتحول إجاباتك إلى خطط وسياسات محفوظة وقابلة للتعديل. افتح مسودة مُعدّة لمراجعة التفاصيل ومتابعة العمل.", "آپ کے جوابات محفوظ، قابلِ ترمیم منصوبوں اور پالیسیوں میں بدلتے ہیں۔ تفصیلات کا جائزہ لینے اور کام جاری رکھنے کے لیے تیار مسودہ کھولیں۔"],
  generate: ["Generate my workspace", "جهّز مساحة عملي", "میری ورک اسپیس تیار کریں"],
  finish: ["Finish and generate", "إنهاء وتجهيز", "مکمل کریں اور تیار کریں"],
  skipFinish: ["Skip and generate", "تخطي وتجهيز", "چھوڑیں اور تیار کریں"],
  regenerate: ["Save and regenerate", "حفظ وإعادة التجهيز", "محفوظ کر کے دوبارہ تیار کریں"],
  retry: ["Retry preparation", "إعادة محاولة التجهيز", "تیاری دوبارہ کریں"],
  saving: ["Saving your answers", "جارٍ حفظ إجاباتك", "آپ کے جوابات محفوظ ہو رہے ہیں"],
  savingHint: ["Your final answer is being saved before preparation starts.", "تُحفظ إجابتك الأخيرة قبل بدء التجهيز.", "تیاری شروع ہونے سے پہلے آخری جواب محفوظ ہو رہا ہے۔"],
  generating: ["Preparing your school workspace", "جارٍ تجهيز مساحة عمل مدرستك", "آپ کے اسکول کی ورک اسپیس تیار ہو رہی ہے"],
  generatingHint: ["Using your saved answers to prepare and save useful drafts. You will see the results here when they are ready.", "نستخدم إجاباتك المحفوظة لإعداد مسودات مفيدة وحفظها. ستظهر النتائج هنا عند اكتمالها.", "آپ کے محفوظ جوابات سے مفید مسودے بنا کر محفوظ کیے جا رہے ہیں۔ تیار ہونے پر نتائج یہاں نظر آئیں گے۔"],
  restoring: ["Loading your saved results", "جارٍ تحميل نتائجك المحفوظة", "آپ کے محفوظ نتائج لوڈ ہو رہے ہیں"],
  answersStep: ["Save answers", "حفظ الإجابات", "جوابات محفوظ کریں"],
  draftsStep: ["Prepare and save drafts", "إعداد المسودات وحفظها", "مسودے بنا کر محفوظ کریں"],
  readyStep: ["Ready to review", "جاهز للمراجعة", "جائزے کے لیے تیار"],
  ready: ["Your workspace drafts are ready", "مسودات مساحة عملك جاهزة", "آپ کی ورک اسپیس کے مسودے تیار ہیں"],
  savedCount: ["{count} drafts saved to your workspace", "حُفظت {count} مسودات في مساحة عملك", "آپ کی ورک اسپیس میں {count} مسودے محفوظ ہو گئے"],
  live: ["Prepared with AI", "أُعدّت بالذكاء الاصطناعي", "اے آئی سے تیار کیے گئے"],
  prototype: ["Prepared from your answers", "أُعدّت من إجاباتك", "آپ کے جوابات سے تیار کیے گئے"],
  prototypeHint: ["Live AI was unavailable. Editable prototype drafts were prepared from your saved answers instead. Any missing details are listed for review.", "لم يتوفر الذكاء الاصطناعي المباشر. أُعدّت مسودات أولية قابلة للتعديل من إجاباتك المحفوظة، مع توضيح التفاصيل الناقصة للمراجعة.", "لائیو اے آئی دستیاب نہیں تھا۔ آپ کے محفوظ جوابات سے قابلِ ترمیم ابتدائی مسودے تیار کیے گئے ہیں۔ نامکمل تفصیلات جائزے کے لیے درج ہیں۔"],
  draftOnly: ["These are saved drafts. Review and approval are still required before applying changes or sending anything.", "هذه مسودات محفوظة. تظل المراجعة والاعتماد مطلوبين قبل تطبيق أي تغيير أو إرسال أي شيء.", "یہ محفوظ مسودے ہیں۔ تبدیلی لاگو کرنے یا کچھ بھی بھیجنے سے پہلے جائزہ اور منظوری ضروری ہے۔"],
  draft: ["Saved draft", "مسودة محفوظة", "محفوظ مسودہ"],
  openWorkflow: ["Open generated workflow", "فتح سير العمل المُعدّ", "تیار ورک فلو کھولیں"],
  openPolicy: ["Open generated policy", "فتح السياسة المُعدّة", "تیار پالیسی کھولیں"],
  reviewAcademics: ["Review academic setup", "مراجعة الإعداد الأكاديمي", "تعلیمی ترتیب کا جائزہ لیں"],
  openFirst: ["Open first generated draft", "فتح أول مسودة مُعدّة", "پہلا تیار مسودہ کھولیں"],
  missingCount: ["{count} details to confirm", "{count} تفاصيل تحتاج تأكيدًا", "{count} تفصیلات کی تصدیق درکار ہے"],
  details: ["View draft details", "عرض تفاصيل المسودة", "مسودے کی تفصیلات دیکھیں"],
  missing: ["Details to confirm", "تفاصيل تحتاج تأكيدًا", "تصدیق کے لیے تفصیلات"],
  noResults: ["Your answers are saved. Generate your workspace to turn them into useful drafts.", "إجاباتك محفوظة. جهّز مساحة عملك لتحويلها إلى مسودات مفيدة.", "آپ کے جوابات محفوظ ہیں۔ انہیں مفید مسودوں میں بدلنے کے لیے ورک اسپیس تیار کریں۔"],
  failed: ["Workspace preparation needs another try", "يلزم إعادة محاولة تجهيز مساحة العمل", "ورک اسپیس کی تیاری دوبارہ کرنے کی ضرورت ہے"],
  empty: ["No drafts were returned. Your answers are retained; please retry preparation.", "لم تصل أي مسودات. إجاباتك محفوظة؛ أعد محاولة التجهيز.", "کوئی مسودہ موصول نہیں ہوا۔ آپ کے جوابات برقرار ہیں؛ تیاری دوبارہ کریں۔"],
  reviewAnswers: ["Review or change your answers", "راجع إجاباتك أو غيّرها", "اپنے جوابات دیکھیں یا تبدیل کریں"],
  unconfirmed: ["Not confirmed", "غير مؤكد", "تصدیق نہیں ہوئی"],
  stale: ["These drafts use an earlier version of your answers. Generate again to include your latest changes.", "تستخدم هذه المسودات نسخة سابقة من إجاباتك. أعد التجهيز لتضمين أحدث تغييراتك.", "یہ مسودے آپ کے جوابات کے پچھلے نسخے سے بنے ہیں۔ تازہ تبدیلیاں شامل کرنے کے لیے دوبارہ تیار کریں۔"],
  restoreFailed: ["Saved results could not be loaded. Retry preparation to recover them; the same saved answers will not create duplicate drafts.", "تعذر تحميل النتائج المحفوظة. أعد محاولة التجهيز لاستعادتها؛ لن تنشئ الإجابات نفسها مسودات مكررة.", "محفوظ نتائج لوڈ نہیں ہوئے۔ انہیں بحال کرنے کے لیے تیاری دوبارہ کریں؛ انہی محفوظ جوابات سے مسودے دہرائے نہیں جائیں گے۔"],
} as const;

export function setupGenerationCopy(language: Language) {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  return Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[index]])) as Record<keyof typeof messages, string>;
}
