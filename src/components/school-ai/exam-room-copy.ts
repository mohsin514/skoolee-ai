import type { AssessmentLocale } from "@/lib/school-ai/assessment";

const en = {
  room: "Your exam space", calm: "One question. One clear next step.",
  map: "Your progress", focus: "Focus on one question", all: "Show all questions",
  flag: "Review later", unflag: "Remove review mark", flagged: "Marked for review",
  flagsHint: "Review marks stay on this page. They are not answers or a submission.",
  previous: "Previous question", next: "Next question", review: "Review marked questions",
  progress: "Required answers completed", sectionLimit: "This section is complete. Clear an answer to choose another question.",
  lock: "Exam session active", lockHint: "Your other Skoolee tasks resume after the server confirms submission or the exam deadline passes.",
  finalReview: "Your final check", remaining: "Required answers still missing", marked: "Questions marked for review",
  savedOnly: "Check the save status before submitting. A review mark does not change your answer.",
  saveNow: "Save answers", focusHint: "Switching views keeps your answers. The timer continues.",
};
type Copy = typeof en;
const ar: Copy = {
  room: "مساحة اختبارك", calm: "سؤال واحد. وخطوة تالية واضحة.",
  map: "تقدمك", focus: "التركيز على سؤال واحد", all: "عرض جميع الأسئلة",
  flag: "المراجعة لاحقاً", unflag: "إزالة علامة المراجعة", flagged: "محدد للمراجعة",
  flagsHint: "تبقى علامات المراجعة في هذه الصفحة. وهي ليست إجابات أو إرسالاً.",
  previous: "السؤال السابق", next: "السؤال التالي", review: "مراجعة الأسئلة المحددة",
  progress: "الإجابات المطلوبة المكتملة", sectionLimit: "اكتمل هذا القسم. امسح إجابة لاختيار سؤال آخر.",
  lock: "جلسة الاختبار نشطة", lockHint: "تعود مهام سكولي الأخرى بعد تأكيد الخادم للإرسال أو انتهاء وقت الاختبار.",
  finalReview: "مراجعتك النهائية", remaining: "الإجابات المطلوبة المتبقية", marked: "الأسئلة المحددة للمراجعة",
  savedOnly: "تحقق من حالة الحفظ قبل الإرسال. علامة المراجعة لا تغير إجابتك.",
  saveNow: "حفظ الإجابات", focusHint: "تغيير طريقة العرض يحافظ على إجاباتك. يستمر المؤقت.",
};
const ur: Copy = {
  room: "آپ کی امتحانی جگہ", calm: "ایک سوال۔ ایک واضح اگلا قدم۔",
  map: "آپ کی پیش رفت", focus: "ایک سوال پر توجہ دیں", all: "تمام سوالات دکھائیں",
  flag: "بعد میں جائزہ لیں", unflag: "جائزے کا نشان ہٹائیں", flagged: "جائزے کے لیے نشان زد",
  flagsHint: "جائزے کے نشان اسی صفحے پر رہتے ہیں۔ یہ جواب یا جمع شدہ کام نہیں ہیں۔",
  previous: "پچھلا سوال", next: "اگلا سوال", review: "نشان زد سوالات کا جائزہ",
  progress: "مکمل مطلوبہ جوابات", sectionLimit: "یہ حصہ مکمل ہے۔ دوسرا سوال منتخب کرنے کے لیے ایک جواب صاف کریں۔",
  lock: "امتحان جاری ہے", lockHint: "سرور سے جمع ہونے کی تصدیق یا امتحان کا وقت ختم ہونے کے بعد سکولی کے دوسرے کام دستیاب ہوں گے۔",
  finalReview: "آپ کا آخری جائزہ", remaining: "باقی مطلوبہ جوابات", marked: "جائزے کے لیے نشان زد سوالات",
  savedOnly: "جمع کرنے سے پہلے محفوظ ہونے کی حالت دیکھیں۔ جائزے کا نشان جواب نہیں بدلتا۔",
  saveNow: "جوابات محفوظ کریں", focusHint: "منظر بدلنے سے جوابات محفوظ رہتے ہیں۔ ٹائمر چلتا رہتا ہے۔",
};
export function examRoomCopy(locale: AssessmentLocale): Copy { return locale === "ar" ? ar : locale === "ur" ? ur : en; }
