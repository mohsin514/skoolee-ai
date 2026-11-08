import type { AssessmentLocale } from "@/lib/school-ai/assessment";

// SKO-411: per-answer save state and recovery of edits the server has not acknowledged.
const en = {
  CONFIRMED: "Saved", PENDING: "Saving…", FAILED: "Not saved yet — will retry", EMPTY: "Not answered",
  offline: "Connection lost. Your unsaved answers stay on this device and are sent automatically when the connection returns. The timer keeps running on the server.",
  restoreTitle: "Unsent answers found on this device", restoreHint: "These edits were not confirmed by the server before the page closed. Restore them to send them now, or discard them to keep the server copy.",
  outdatedHint: "This device has older unsent edits, but a newer version of your answers is already saved. The saved version is kept; the older edits cannot be applied.",
  questions: "Questions affected", restore: "Restore and send", discard: "Discard local edits", dismiss: "Keep the saved version",
};
type Copy = typeof en;
const ar: Copy = {
  CONFIRMED: "تم الحفظ", PENDING: "جارٍ الحفظ…", FAILED: "لم يُحفظ بعد — ستُعاد المحاولة", EMPTY: "لم تتم الإجابة",
  offline: "انقطع الاتصال. تبقى إجاباتك غير المحفوظة على هذا الجهاز وتُرسل تلقائياً عند عودة الاتصال. يستمر المؤقت على الخادم.",
  restoreTitle: "وُجدت إجابات غير مرسلة على هذا الجهاز", restoreHint: "لم يؤكد الخادم هذه التعديلات قبل إغلاق الصفحة. استعدها لإرسالها الآن، أو تجاهلها للإبقاء على نسخة الخادم.",
  outdatedHint: "يحتوي هذا الجهاز على تعديلات أقدم غير مرسلة، لكن نسخة أحدث من إجاباتك محفوظة بالفعل. تُحفظ النسخة المحفوظة ولا يمكن تطبيق التعديلات الأقدم.",
  questions: "الأسئلة المتأثرة", restore: "استعادة وإرسال", discard: "تجاهل التعديلات المحلية", dismiss: "الإبقاء على النسخة المحفوظة",
};
const ur: Copy = {
  CONFIRMED: "محفوظ", PENDING: "محفوظ ہو رہا ہے…", FAILED: "ابھی محفوظ نہیں — دوبارہ کوشش ہوگی", EMPTY: "جواب نہیں دیا",
  offline: "رابطہ منقطع ہو گیا۔ آپ کے غیر محفوظ جوابات اسی ڈیوائس پر رہتے ہیں اور رابطہ بحال ہوتے ہی خود بخود بھیجے جاتے ہیں۔ ٹائمر سرور پر چلتا رہتا ہے۔",
  restoreTitle: "اس ڈیوائس پر نہ بھیجے گئے جوابات ملے", restoreHint: "صفحہ بند ہونے سے پہلے سرور نے یہ تبدیلیاں تصدیق نہیں کیں۔ انہیں ابھی بھیجنے کے لیے بحال کریں، یا سرور کی کاپی رکھنے کے لیے رد کریں۔",
  outdatedHint: "اس ڈیوائس پر پرانی نہ بھیجی گئی تبدیلیاں ہیں، مگر آپ کے جوابات کا نیا ورژن پہلے سے محفوظ ہے۔ محفوظ ورژن برقرار رہتا ہے؛ پرانی تبدیلیاں لاگو نہیں ہو سکتیں۔",
  questions: "متاثرہ سوالات", restore: "بحال کریں اور بھیجیں", discard: "مقامی تبدیلیاں رد کریں", dismiss: "محفوظ ورژن رکھیں",
};
export const examRecoveryCopy = (locale: AssessmentLocale): Copy => locale === "ar" ? ar : locale === "ur" ? ur : en;
