import type { StepUiState } from "@/lib/ai-workflows/view";
import type { WorkflowErrorCode } from "@/lib/ai-workflows/errors";

/** One word per state, the same for every role, in EN/AR/UR (UX §9.2). Server codes map here; no raw server text is shown. */
type Lang = "en" | "ar" | "ur";
type T = Record<Lang, string>;

export const STATE_WORDS: Record<StepUiState, T> = {
  planned: { en: "Planned", ar: "مخطط", ur: "منصوبے میں" },
  needs_input: { en: "Needs you", ar: "بحاجة إليك", ur: "آپ کی ضرورت" },
  awaiting_confirm: { en: "Ready to save", ar: "جاهز للحفظ", ur: "محفوظ کرنے کے لیے تیار" },
  running: { en: "Saving…", ar: "جارٍ الحفظ…", ur: "محفوظ ہو رہا ہے…" },
  saved: { en: "Saved", ar: "تم الحفظ", ur: "محفوظ" },
  looked_up: { en: "Looked up", ar: "تم الاطلاع", ur: "دیکھ لیا" },
  draft: { en: "Draft saved", ar: "حُفظت مسودة", ur: "مسودہ محفوظ" },
  handed_off: { en: "With the approver", ar: "لدى المعتمِد", ur: "منظور کنندہ کے پاس" },
  approved_elsewhere: { en: "Approved", ar: "تمت الموافقة", ur: "منظور" },
  skipped: { en: "Not run", ar: "لم يُنفذ", ur: "نہیں چلا" },
  uncertain: { en: "Can't tell if saved", ar: "لا نعرف إن حُفظ", ur: "معلوم نہیں محفوظ ہوا یا نہیں" },
  failed: { en: "Didn't run", ar: "لم يتم", ur: "نہیں ہوا" },
  stale: { en: "Changed — check again", ar: "تغيّر — راجع مجدداً", ur: "بدل گیا — دوبارہ دیکھیں" },
  cancelled: { en: "Stopped", ar: "أُوقف", ur: "روک دیا" },
  practice: { en: "Example · not saved", ar: "مثال · لم يُحفظ", ur: "مثال · محفوظ نہیں" },
};

export const ERROR_WORDS: Partial<Record<WorkflowErrorCode | "PRACTICE_MODE", T>> = {
  ACCESS_CHANGED: { en: "Your access changed. Sign in again to continue.", ar: "تغيّرت صلاحياتك. سجّل الدخول مجدداً.", ur: "آپ کی رسائی بدل گئی۔ دوبارہ سائن ان کریں۔" },
  ROLE_NOT_ALLOWED: { en: "This is not part of your role.", ar: "هذا ليس ضمن دورك.", ur: "یہ آپ کے کردار میں شامل نہیں۔" },
  SEAT_HELD: { en: "Another colleague holds this desk; it was sent to them.", ar: "زميل آخر مسؤول عن هذا؛ أُرسل إليه.", ur: "یہ کام کسی اور ساتھی کا ہے؛ انہیں بھیج دیا گیا۔" },
  SCOPE_DENIED: { en: "That record is outside your campus.", ar: "هذا السجل خارج حرمك.", ur: "یہ ریکارڈ آپ کے کیمپس سے باہر ہے۔" },
  STALE_VERSION: { en: "Something changed. Check the preview again.", ar: "تغيّر شيء. راجع المعاينة مجدداً.", ur: "کچھ بدل گیا۔ پیش نظارہ دوبارہ دیکھیں۔" },
  LEASED: { en: "Still working on the last step. Try again in a moment.", ar: "ما زال العمل جارياً. حاول بعد لحظة.", ur: "پچھلا مرحلہ جاری ہے۔ ذرا دیر میں کوشش کریں۔" },
  CONFIRM_REQUIRED: { en: "Use the save button on the card; typing yes does not save.", ar: "استخدم زر الحفظ؛ كتابة نعم لا تحفظ.", ur: "کارڈ کا بٹن دبائیں؛ جی لکھنے سے محفوظ نہیں ہوتا۔" },
  BUDGET_EXHAUSTED: { en: "This request reached its AI limit. Start a new request to continue.", ar: "بلغ الطلب حده. ابدأ طلباً جديداً.", ur: "اس درخواست کی حد پوری ہو گئی۔ نئی درخواست شروع کریں۔" },
  CREDITS_EXHAUSTED: { en: "Your school has no AI credits left this month.", ar: "لا رصيد ذكاء اصطناعي متبقٍ هذا الشهر.", ur: "اس مہینے اسکول کے اے آئی کریڈٹ ختم ہو گئے۔" },
  PROVIDER_UNAVAILABLE: { en: "AI is not reachable right now. Nothing was changed; try again.", ar: "الذكاء الاصطناعي غير متاح. لم يتغير شيء.", ur: "اے آئی ابھی دستیاب نہیں۔ کچھ نہیں بدلا؛ دوبارہ کوشش کریں۔" },
  DEADLINE: { en: "That took too long. Nothing new was saved; try again.", ar: "استغرق وقتاً طويلاً. لم يُحفظ شيء جديد.", ur: "بہت وقت لگا۔ کچھ نیا محفوظ نہیں ہوا؛ دوبارہ کوشش کریں۔" },
  DOMAIN_REFUSED: { en: "The school's rules refused this. Open the screen to see why.", ar: "رفضت قواعد المدرسة ذلك. افتح الشاشة للسبب.", ur: "اسکول کے اصولوں نے یہ رد کیا۔ وجہ کے لیے اسکرین کھولیں۔" },
  INVALID_INPUT: { en: "Some details are missing or not valid.", ar: "بعض التفاصيل ناقصة أو غير صحيحة.", ur: "کچھ تفصیلات نامکمل یا غلط ہیں۔" },
  NOT_CONNECTED: { en: "AI can't do this yet. Your request was not sent anywhere.", ar: "لا يمكن للذكاء الاصطناعي فعل هذا بعد. لم يُرسل طلبك.", ur: "اے آئی یہ ابھی نہیں کر سکتا۔ آپ کی درخواست کہیں نہیں بھیجی گئی۔" },
  UNCERTAIN: { en: "We can't tell whether this was saved. Check the screen before trying again.", ar: "لا نعرف إن حُفظ. تحقق من الشاشة قبل المحاولة.", ur: "معلوم نہیں محفوظ ہوا یا نہیں۔ دوبارہ کوشش سے پہلے اسکرین دیکھیں۔" },
  PRACTICE_MODE: { en: "Practice mode: nothing is saved to your school until AI is approved for it.", ar: "وضع التدريب: لا يُحفظ شيء حتى اعتماد الذكاء الاصطناعي.", ur: "مشق موڈ: منظوری تک اسکول میں کچھ محفوظ نہیں ہوتا۔" },
  SUSPENDED: { en: "Your school's subscription is paused.", ar: "اشتراك مدرستك متوقف.", ur: "اسکول کی رکنیت رکی ہوئی ہے۔" },
  INTERNAL: { en: "Something went wrong. Nothing new was saved.", ar: "حدث خطأ. لم يُحفظ شيء جديد.", ur: "کچھ غلط ہو گیا۔ کچھ نیا محفوظ نہیں ہوا۔" },
};

export const UI: Record<string, T> = {
  askTitle: { en: "Ask Skoolee", ar: "اسأل سكولي", ur: "اسکولی سے پوچھیں" },
  askHint: { en: "Say what you want done. AI prepares it; you check before anything is saved.", ar: "اكتب ما تريد. يجهزه الذكاء الاصطناعي وتراجعه قبل الحفظ.", ur: "بتائیں کیا کرنا ہے۔ اے آئی تیار کرتا ہے؛ محفوظ ہونے سے پہلے آپ دیکھتے ہیں۔" },
  askPlaceholder: { en: "e.g. Add a holiday on 12 November for Iqbal Day", ar: "مثال: أضف إجازة في 12 نوفمبر", ur: "مثلاً: 12 نومبر کو یوم اقبال کی چھٹی شامل کریں" },
  send: { en: "Ask", ar: "اسأل", ur: "پوچھیں" },
  sending: { en: "Planning…", ar: "جارٍ التخطيط…", ur: "منصوبہ بن رہا ہے…" },
  close: { en: "Close · it keeps going", ar: "إغلاق · يستمر العمل", ur: "بند کریں · کام جاری رہے گا" },
  previewCode: { en: "Preview", ar: "معاينة", ur: "پیش نظارہ" },
  saveStep: { en: "Save", ar: "حفظ", ur: "محفوظ کریں" },
  answer: { en: "Send answer", ar: "إرسال الإجابة", ur: "جواب بھیجیں" },
  questionsTitle: { en: "One detail needed", ar: "تفصيل مطلوب", ur: "ایک تفصیل درکار" },
  missingField: { en: "Please give: {0}", ar: "يرجى تقديم: {0}", ur: "براہ کرم بتائیں: {0}" },
  pause: { en: "Pause", ar: "إيقاف مؤقت", ur: "روکیں" },
  resume: { en: "Continue", ar: "متابعة", ur: "جاری رکھیں" },
  cancel: { en: "Stop", ar: "إيقاف", ur: "روک دیں" },
  openScreen: { en: "Open", ar: "فتح", ur: "کھولیں" },
  withApprover: { en: "Prepared · with {0}", ar: "جاهز · لدى {0}", ur: "تیار · {0} کے پاس" },
  counts: { en: "{0} of {1} done", ar: "{0} من {1} مكتمل", ur: "{1} میں سے {0} مکمل" },
  outcome_EXECUTED: { en: "Done. Everything listed was saved.", ar: "تم. حُفظ كل ما هو مدرج.", ur: "ہو گیا۔ درج سب کچھ محفوظ ہو گیا۔" },
  outcome_PARTIAL: { en: "Partly done. Some steps did not run or are with others.", ar: "تم جزئياً. بعض الخطوات لم تُنفذ أو لدى آخرين.", ur: "جزوی طور پر ہوا۔ کچھ مراحل نہیں چلے یا دوسروں کے پاس ہیں۔" },
  outcome_ANSWERED: { en: "Answered. Nothing was changed.", ar: "تمت الإجابة. لم يتغير شيء.", ur: "جواب دے دیا۔ کچھ نہیں بدلا۔" },
  outcome_PLAN_SAVED: { en: "Saved as a draft plan. No school records changed.", ar: "حُفظ كمسودة. لم تتغير السجلات.", ur: "مسودہ منصوبہ محفوظ۔ اسکول کے ریکارڈ نہیں بدلے۔" },
  outcome_AWAITING_APPROVAL: { en: "Prepared and waiting for the approver.", ar: "جاهز وبانتظار المعتمِد.", ur: "تیار اور منظور کنندہ کا منتظر۔" },
  outcome_NOT_SUPPORTED: { en: "AI can't do this yet. Your request was not sent anywhere.", ar: "لا يمكن للذكاء الاصطناعي فعل هذا بعد. لم يُرسل طلبك.", ur: "اے آئی یہ ابھی نہیں کر سکتا۔ آپ کی درخواست کہیں نہیں بھیجی گئی۔" },
  outcome_NOTHING_DONE: { en: "Nothing was saved.", ar: "لم يُحفظ شيء.", ur: "کچھ محفوظ نہیں ہوا۔" },
  history: { en: "Your recent requests", ar: "طلباتك الأخيرة", ur: "آپ کی حالیہ درخواستیں" },
  canDoTitle: { en: "What AI can do for you", ar: "ما يمكن للذكاء الاصطناعي فعله لك", ur: "اے آئی آپ کے لیے کیا کر سکتا ہے" },
  canDoCount: { en: "AI is connected to {0} of {1} things you can do", ar: "الذكاء الاصطناعي متصل بـ {0} من {1} مما يمكنك فعله", ur: "اے آئی آپ کے {1} کاموں میں سے {0} سے جڑا ہے" },
  waitingTitle: { en: "Prepared for you to decide", ar: "مُعد لتقرره", ur: "آپ کے فیصلے کے لیے تیار" },
  waitingEmpty: { en: "Nothing is waiting for you.", ar: "لا شيء بانتظارك.", ur: "آپ کے لیے کچھ زیر التوا نہیں۔" },
  reviewIn: { en: "Review and decide on its screen", ar: "راجع وقرر في شاشته", ur: "اس کی اسکرین پر جائزہ لے کر فیصلہ کریں" },
  classA: { en: "Runs on its own", ar: "يُنفذ تلقائياً", ur: "خود چلتا ہے" },
  classB: { en: "You confirm first", ar: "تؤكد أولاً", ur: "پہلے آپ تصدیق کرتے ہیں" },
  classC: { en: "Prepared for the approver", ar: "يُجهز للمعتمِد", ur: "منظور کنندہ کے لیے تیار" },
};

export function t(table: Record<string, T>, key: string, language: Lang, ...values: Array<string | number>): string {
  const text = table[key]?.[language] ?? table[key]?.en ?? key;
  return text.replace(/\{(\d+)\}/g, (match, index) => (index in values ? String(values[Number(index)]) : match));
}
