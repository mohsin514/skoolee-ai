import type { Language } from "@/lib/locale/package";
const messages = {
  title: ["Private assistant", "المساعد الخاص", "نجی معاون"],
  hint: ["Saved privately to your account in this campus and subject. Resume after reloading. Conversations are context, not approved school facts or permission to act.", "تُحفظ بشكل خاص في حسابك ضمن هذا الفرع والمادة. يمكنك المتابعة بعد إعادة التحميل. المحادثات سياق وليست حقائق مدرسية معتمدة أو إذنًا للتنفيذ.", "گفتگو اس شاخ اور مضمون میں آپ کے اکاؤنٹ کے لیے نجی طور پر محفوظ ہے۔ دوبارہ لوڈ کرنے کے بعد جاری رکھیں۔ گفتگو سیاق ہے، منظور شدہ حقائق یا کارروائی کی اجازت نہیں۔"],
  choose: ["Saved conversation", "محادثة محفوظة", "محفوظ گفتگو"],
  fresh: ["New conversation", "محادثة جديدة", "نئی گفتگو"],
  empty: ["Start with a question. The first message creates a private conversation.", "ابدأ بسؤال. تنشئ الرسالة الأولى محادثة خاصة.", "سوال سے شروع کریں۔ پہلا پیغام ایک نجی گفتگو بناتا ہے۔"],
  archive: ["Archive conversation", "أرشفة المحادثة", "گفتگو محفوظ فہرست سے ہٹائیں"],
  archived: ["Archived conversations", "المحادثات المؤرشفة", "آرکائیو شدہ گفتگو"],
  active: ["Active conversations", "المحادثات النشطة", "فعال گفتگو"],
  resume: ["Resume conversation", "استئناف المحادثة", "گفتگو جاری کریں"],
  archivedHint: ["This conversation is archived. Resume it to send another message.", "هذه المحادثة مؤرشفة. استأنفها لإرسال رسالة جديدة.", "یہ گفتگو آرکائیو ہے۔ نیا پیغام بھیجنے کے لیے اسے جاری کریں۔"],
  refresh: ["Refresh conversation", "تحديث المحادثة", "گفتگو تازہ کریں"],
  earlier: ["Load earlier exchanges", "تحميل التبادلات السابقة", "پچھلے پیغامات لوڈ کریں"],
  more: ["More conversations", "مزيد من المحادثات", "مزید گفتگو"],
  loading: ["Loading private conversation…", "جارٍ تحميل المحادثة الخاصة…", "نجی گفتگو لوڈ ہو رہی ہے…"],
  failed: ["The conversation could not be loaded or saved. Your current text is retained.", "تعذر تحميل المحادثة أو حفظها. احتُفظ بالنص الحالي.", "گفتگو لوڈ یا محفوظ نہیں ہوئی۔ موجودہ متن برقرار ہے۔"],
  hidden: ["This exchange is hidden because access to its school evidence changed.", "أُخفي هذا التبادل لأن الوصول إلى أدلته المدرسية تغير.", "اس گفتگو کے تعلیمی شواہد کی رسائی بدلنے کی وجہ سے یہ پیغامات پوشیدہ ہیں۔"],
  pending: ["A reply is still processing. Refresh to check its saved result. An expired attempt can be retried explicitly.", "لا تزال الإجابة قيد المعالجة. حدّث للتحقق من النتيجة المحفوظة. يمكن إعادة محاولة الطلب المنتهي صراحةً.", "جواب پر کارروائی جاری ہے۔ محفوظ نتیجہ دیکھنے کے لیے تازہ کریں۔ ختم شدہ کوشش واضح طور پر دوبارہ کی جا سکتی ہے۔"],
  recovery: ["The last reply did not complete. Retry the saved message, or edit it to start a new turn.", "لم تكتمل الإجابة الأخيرة. أعد محاولة الرسالة المحفوظة، أو عدّلها لبدء تبادل جديد.", "آخری جواب مکمل نہیں ہوا۔ محفوظ پیغام دوبارہ بھیجیں یا نیا مرحلہ شروع کرنے کے لیے ترمیم کریں۔"],
  you: ["You", "أنت", "آپ"], assistant: ["Assistant", "المساعد", "معاون"],
  saved: ["Conversation saved", "حُفظت المحادثة", "گفتگو محفوظ ہو گئی"],
} as const;
export function conversationCopy(language: Language) { const index = language === "ar" ? 1 : language === "ur" ? 2 : 0; return Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[index]])) as Record<keyof typeof messages, string>; }
