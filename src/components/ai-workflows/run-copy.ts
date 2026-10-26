import type { StepUiState } from "@/lib/ai-workflows/view";
import type { WorkflowErrorCode } from "@/lib/ai-workflows/errors";

/** One word per state, the same for every role, in EN/AR/UR (UX §9.2). Server codes map here; no raw server text is shown. */
export type Lang = "en" | "ar" | "ur";
export type T = Record<Lang, string>;

export const STATE_WORDS: Record<StepUiState, T> = {
  planned: { en: "Planned", ar: "مخطط", ur: "منصوبے میں" },
  needs_input: { en: "Needs you", ar: "بحاجة إليك", ur: "آپ کی ضرورت" },
  awaiting_confirm: { en: "Ready to save", ar: "جاهز للحفظ", ur: "محفوظ کرنے کے لیے تیار" },
  running: { en: "Working…", ar: "جارٍ العمل…", ur: "کام جاری ہے…" },
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
  EXPIRED: { en: "Nobody took this within 14 days, so it was not done. Ask again if it is still needed.", ar: "لم يتولَّ أحد هذا خلال 14 يوماً فلم يُنفَّذ. اطلبه مجدداً إن لزم.", ur: "14 دن میں کسی نے یہ نہیں لیا، اس لیے یہ نہیں ہوا۔ ضرورت ہو تو دوبارہ کہیں۔" },
  CARE_REFERRAL: { en: "This sounds important, and it is not something AI should handle. Please talk to someone at school you trust: your class teacher, the principal or the school office. If anyone is in danger right now, call your local emergency number. Nothing you typed was saved.", ar: "يبدو هذا مهماً، وليس أمراً يتولاه الذكاء الاصطناعي. تحدث إلى شخص تثق به في المدرسة: معلم الفصل أو المدير أو مكتب المدرسة. إن كان أحد في خطر الآن فاتصل برقم الطوارئ. لم يُحفظ شيء مما كتبته.", ur: "یہ اہم بات لگتی ہے، اور اسے اے آئی کو نہیں سنبھالنا چاہیے۔ اسکول میں کسی قابلِ اعتماد شخص سے بات کریں: کلاس ٹیچر، پرنسپل یا اسکول دفتر۔ اگر ابھی کوئی خطرے میں ہے تو ایمرجنسی نمبر پر کال کریں۔ آپ نے جو لکھا وہ محفوظ نہیں ہوا۔" },
  ACCESS_CHANGED: { en: "Your access changed. Sign in again to continue.", ar: "تغيّرت صلاحياتك. سجّل الدخول مجدداً.", ur: "آپ کی رسائی بدل گئی۔ دوبارہ سائن ان کریں۔" },
  ROLE_NOT_ALLOWED: { en: "This is not part of your role.", ar: "هذا ليس ضمن دورك.", ur: "یہ آپ کے کردار میں شامل نہیں۔" },
  SEAT_HELD: { en: "Another colleague holds this desk; it was sent to them.", ar: "زميل آخر مسؤول عن هذا؛ أُرسل إليه.", ur: "یہ کام کسی اور ساتھی کا ہے؛ انہیں بھیج دیا گیا۔" },
  SCOPE_DENIED: { en: "That record is outside your campus.", ar: "هذا السجل خارج حرمك.", ur: "یہ ریکارڈ آپ کے کیمپس سے باہر ہے۔" },
  STALE_VERSION: { en: "Something changed. Check the preview again.", ar: "تغيّر شيء. راجع المعاينة مجدداً.", ur: "کچھ بدل گیا۔ پیش نظارہ دوبارہ دیکھیں۔" },
  LEASED: { en: "Still working on the last step. Try again in a moment.", ar: "ما زال العمل جارياً. حاول بعد لحظة.", ur: "پچھلا مرحلہ جاری ہے۔ ذرا دیر میں کوشش کریں۔" },
  CONFIRM_REQUIRED: { en: "Use the save button on the card; typing yes does not save.", ar: "استخدم زر الحفظ؛ كتابة نعم لا تحفظ.", ur: "کارڈ کا بٹن دبائیں؛ جی لکھنے سے محفوظ نہیں ہوتا۔" },
  BUDGET_EXHAUSTED: { en: "This request reached its AI limit. Start a new request to continue.", ar: "بلغ الطلب حده. ابدأ طلباً جديداً.", ur: "اس درخواست کی حد پوری ہو گئی۔ نئی درخواست شروع کریں۔" },
  RATE_LIMITED: { en: "You're sending messages too quickly. Wait a moment and try again; your AI credits have not run out.", ar: "ترسل الرسائل بسرعة كبيرة. انتظر قليلاً ثم حاول مجدداً؛ لم تنفد أرصدة الذكاء الاصطناعي.", ur: "آپ بہت تیزی سے پیغامات بھیج رہے ہیں۔ کچھ دیر بعد دوبارہ کوشش کریں؛ آپ کے AI کریڈٹس ختم نہیں ہوئے۔" },
  CREDITS_EXHAUSTED: { en: "Your school has no AI credits left this month.", ar: "لا رصيد ذكاء اصطناعي متبقٍ هذا الشهر.", ur: "اس مہینے اسکول کے اے آئی کریڈٹ ختم ہو گئے۔" },
  PROVIDER_UNAVAILABLE: { en: "AI is busy or not reachable right now. Nothing was changed and nothing was charged; it tries again by itself shortly, or press Continue.", ar: "الذكاء الاصطناعي مشغول أو غير متاح. لم يتغير شيء ولم يُخصم شيء؛ سيحاول مجدداً قريباً، أو اضغط «متابعة».", ur: "اے آئی ابھی مصروف یا دستیاب نہیں۔ کچھ نہیں بدلا اور کوئی کریڈٹ نہیں کٹا؛ یہ خود جلد دوبارہ کوشش کرے گا، یا «جاری رکھیں» دبائیں۔" },
  DEADLINE: { en: "That took too long. Nothing new was saved; try again.", ar: "استغرق وقتاً طويلاً. لم يُحفظ شيء جديد.", ur: "بہت وقت لگا۔ کچھ نیا محفوظ نہیں ہوا؛ دوبارہ کوشش کریں۔" },
  DOMAIN_REFUSED: { en: "The school's rules refused this. Open the screen to see why.", ar: "رفضت قواعد المدرسة ذلك. افتح الشاشة للسبب.", ur: "اسکول کے اصولوں نے یہ رد کیا۔ وجہ کے لیے اسکرین کھولیں۔" },
  INVALID_INPUT: { en: "Some details are missing or not valid.", ar: "بعض التفاصيل ناقصة أو غير صحيحة.", ur: "کچھ تفصیلات نامکمل یا غلط ہیں۔" },
  NOT_CONNECTED: { en: "AI can't do this yet. Your request was not sent anywhere.", ar: "لا يمكن للذكاء الاصطناعي فعل هذا بعد. لم يُرسل طلبك.", ur: "اے آئی یہ ابھی نہیں کر سکتا۔ آپ کی درخواست کہیں نہیں بھیجی گئی۔" },
  UNCERTAIN: { en: "We can't tell whether this was saved. Check the screen before trying again.", ar: "لا نعرف إن حُفظ. تحقق من الشاشة قبل المحاولة.", ur: "معلوم نہیں محفوظ ہوا یا نہیں۔ دوبارہ کوشش سے پہلے اسکرین دیکھیں۔" },
  PRACTICE_MODE: { en: "Practice mode: nothing is saved to your school until AI is approved for it.", ar: "وضع التدريب: لا يُحفظ شيء حتى اعتماد الذكاء الاصطناعي.", ur: "مشق موڈ: منظوری تک اسکول میں کچھ محفوظ نہیں ہوتا۔" },
  SUSPENDED: { en: "Your school's subscription is paused.", ar: "اشتراك مدرستك متوقف.", ur: "اسکول کی رکنیت رکی ہوئی ہے۔" },
  INTERNAL: { en: "Something went wrong. Nothing new was saved.", ar: "حدث خطأ. لم يُحفظ شيء جديد.", ur: "کچھ غلط ہو گیا۔ کچھ نیا محفوظ نہیں ہوا۔" },
  NOT_FOUND: { en: "This request is no longer available.", ar: "هذا الطلب لم يعد متاحًا.", ur: "یہ درخواست اب دستیاب نہیں۔" },
  SUPERSEDED: { en: "A newer version replaced this. Refresh to see it.", ar: "حلّت محله نسخة أحدث. حدّث الصفحة لرؤيتها.", ur: "اس کی جگہ نیا ورژن آ گیا ہے۔ دیکھنے کے لیے صفحہ تازہ کریں۔" },
  KEY_CONFLICT: { en: "This was already sent. Refresh to see the latest.", ar: "أُرسل هذا من قبل. حدّث الصفحة لرؤية الأحدث.", ur: "یہ پہلے ہی بھیجا جا چکا ہے۔ تازہ ترین دیکھنے کے لیے صفحہ تازہ کریں۔" },
};

export const UI: Record<string, T> = {
  askTitle: { en: "Ask Skoolee", ar: "اسأل سكولي", ur: "اسکولی سے پوچھیں" },
  askHint: { en: "Say what you want done. AI prepares it; you check before anything is saved.", ar: "اكتب ما تريد. يجهزه الذكاء الاصطناعي وتراجعه قبل الحفظ.", ur: "بتائیں کیا کرنا ہے۔ اے آئی تیار کرتا ہے؛ محفوظ ہونے سے پہلے آپ دیکھتے ہیں۔" },
  askPlaceholder: { en: "Say what you want done…", ar: "قل ما تريد إنجازه…", ur: "بتائیں آپ کیا کروانا چاہتے ہیں…" },
  send: { en: "Ask", ar: "اسأل", ur: "پوچھیں" },
  sending: { en: "Planning…", ar: "جارٍ التخطيط…", ur: "منصوبہ بن رہا ہے…" },
  close: { en: "Close · it keeps going", ar: "إغلاق · يستمر العمل", ur: "بند کریں · کام جاری رہے گا" },
  previewCode: { en: "Preview", ar: "معاينة", ur: "پیش نظارہ" },
  saveStep: { en: "Save", ar: "حفظ", ur: "محفوظ کریں" },
  answer: { en: "Send answer", ar: "إرسال الإجابة", ur: "جواب بھیجیں" },
  questionsTitle: { en: "One detail needed", ar: "تفصيل مطلوب", ur: "ایک تفصیل درکار" },
  missingField: { en: "What should the {0} be?", ar: "ما هو {0}؟", ur: "{0} کیا ہونا چاہیے؟" },
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
  questionsTitleMany: { en: "{0} details needed", ar: "مطلوب {0} تفاصيل", ur: "{0} تفصیلات درکار" },
  openRecord: { en: "Open record", ar: "فتح السجل", ur: "ریکارڈ کھولیں" },
  openItsScreen: { en: "Open its screen", ar: "فتح شاشته", ur: "اس کی اسکرین کھولیں" },
  preparedForYou: { en: "Prepared for you", ar: "مُعدّ لك", ur: "آپ کے لیے تیار" },
  waitingCount: { en: "{0} waiting for you", ar: "{0} بانتظارك", ur: "{0} آپ کے منتظر" },
  seeWhatAiCanDo: { en: "See what AI can do", ar: "اطّلع على ما يمكن للذكاء الاصطناعي فعله", ur: "دیکھیں اے آئی کیا کر سکتا ہے" },
  practiceTitle: { en: "Practice mode", ar: "وضع التدريب", ur: "مشق موڈ" },
  practiceTip: { en: "Even after you confirm, practice runs show what would happen and save nothing.", ar: "حتى بعد تأكيدك، تعرض جولات التدريب ما كان سيحدث ولا تحفظ شيئًا.", ur: "تصدیق کے بعد بھی مشق صرف دکھاتی ہے کہ کیا ہوتا، اور کچھ محفوظ نہیں کرتی۔" },
  nothingChanged: { en: "Nothing was changed", ar: "لم يتغيّر شيء", ur: "کچھ نہیں بدلا" },
  howItFinishes: { en: "How each step finishes", ar: "كيف تنتهي كل خطوة", ur: "ہر مرحلہ کیسے مکمل ہوتا ہے" },
  showMore: { en: "Show {0} more", ar: "عرض {0} أخرى", ur: "مزید {0} دکھائیں" },
  showLess: { en: "Show less", ar: "عرض أقل", ur: "کم دکھائیں" },
  reconnecting: { en: "Reconnecting…", ar: "جارٍ إعادة الاتصال…", ur: "دوبارہ جڑ رہا ہے…" },
  checkNow: { en: "Check now", ar: "تحقّق الآن", ur: "ابھی دیکھیں" },
  laneSaved: { en: "Saved", ar: "تم الحفظ", ur: "محفوظ" },
  laneWaiting: { en: "Waiting for you", ar: "بانتظارك", ur: "آپ کا منتظر" },
  laneWithOwner: { en: "With its owner", ar: "لدى صاحبه", ur: "متعلقہ شخص کے پاس" },
  laneNotRun: { en: "Didn't run", ar: "لم يُنفَّذ", ur: "نہیں چلا" },
  savedOf: { en: "{0} of {1} saved", ar: "حُفظ {0} من {1}", ur: "{1} میں سے {0} محفوظ" },
};

export function t(table: Record<string, T>, key: string, language: Lang, ...values: Array<string | number>): string {
  const text = table[key]?.[language] ?? table[key]?.en ?? key;
  return text.replace(/\{(\d+)\}/g, (match, index) => (index in values ? String(values[Number(index)]) : match));
}

/** Questions a resolver asks (promptKey); `{0}` is the field pointer. */
export const QUESTION_WORDS: Record<string, T> = {
  FORM_EMAIL_INVALID: { en: "That email is not valid. Enter an address such as owner@example.com. Your other details are saved.", ar: "البريد غير صالح. أدخل عنواناً مثل owner@example.com. التفاصيل الأخرى محفوظة.", ur: "یہ ای میل درست نہیں۔ owner@example.com جیسا پتہ دیں۔ باقی تفصیلات محفوظ ہیں۔" },
  "platform.pricing_plan": { en: "Which package’s default monthly price should change: Basic, Pro, Enterprise or Custom?", ar: "أي باقة تريد تغيير سعرها الشهري الافتراضي: Basic أو Pro أو Enterprise أو Custom؟", ur: "کس پیکیج کی طے شدہ ماہانہ قیمت بدلنی ہے: Basic، Pro، Enterprise یا Custom؟" },
  "platform.pricing_amount": { en: "What should the new default monthly price be in PKR? For example: Pro 4500. Existing subscriptions will not change.", ar: "ما السعر الشهري الافتراضي الجديد بالروبية الباكستانية؟ مثال: Pro 4500. لن تتغير الاشتراكات الحالية.", ur: "نئی طے شدہ ماہانہ قیمت پاکستانی روپے میں کیا ہو؟ مثلاً Pro 4500۔ موجودہ سبسکرپشن تبدیل نہیں ہوگی۔" },
  FIELD_INVALID: { en: "That value is not valid for {0}. Please enter a corrected value.", ar: "هذه القيمة غير صالحة للحقل {0}. أدخل قيمة صحيحة.", ur: "{0} کی قدر درست نہیں۔ براہ کرم درست قدر دیں۔" },
  "platform.owner_email_taken": { en: "That email is already used by a school. What different owner email should I use?", ar: "هذا البريد مستخدم لدى مدرسة. ما البريد الآخر للمالك؟", ur: "یہ ای میل پہلے سے کسی اسکول میں استعمال ہو رہی ہے۔ مالک کی دوسری ای میل بتائیں۔" },
  PUPIL_AMBIGUOUS: { en: "More than one pupil matches. Which one did you mean?", ar: "أكثر من طالب يطابق الاسم. من تقصد؟", ur: "ایک سے زیادہ طالب علم ملتے ہیں۔ آپ کس کی بات کر رہے ہیں؟" },
  PUPIL_NOT_FOUND: { en: "No pupil in this class matches that name. Give the full name or roll number.", ar: "لا يوجد طالب بهذا الاسم في الفصل. اكتب الاسم الكامل أو رقم القيد.", ur: "اس کلاس میں اس نام کا کوئی طالب علم نہیں۔ پورا نام یا رول نمبر لکھیں۔" },
  PUPIL_TWICE: { en: "The same pupil is named twice. Which status is right?", ar: "ذُكر الطالب نفسه مرتين. أي حالة صحيحة؟", ur: "ایک ہی طالب علم دو بار لکھا گیا ہے۔ کون سی حالت درست ہے؟" },
  PUPIL_NEGATED: { en: "This sounds like a \"not\". What should this pupil be marked?", ar: "يبدو أن العبارة منفية. بماذا يُسجَّل هذا الطالب؟", ur: "یہ نفی لگتی ہے۔ اس طالب علم کی حاضری کیا لگائیں؟" },
  ASSIGNMENT_AMBIGUOUS: { en: "More than one homework matches. Which one?", ar: "أكثر من واجب يطابق. أيها؟", ur: "ایک سے زیادہ ہوم ورک ملتے ہیں۔ کون سا؟" },
  ASSIGNMENT_NOT_FOUND: { en: "No draft homework of yours matches that. Give its title.", ar: "لا يوجد واجب مسودة بهذا الاسم. اكتب عنوانه.", ur: "آپ کا کوئی مسودہ ہوم ورک نہیں ملا۔ عنوان لکھیں۔" },
  RESOURCE_AMBIGUOUS: { en: "More than one resource matches. Which one?", ar: "أكثر من مصدر يطابق. أيها؟", ur: "ایک سے زیادہ وسائل ملتے ہیں۔ کون سا؟" },
  RESOURCE_NOT_FOUND: { en: "No draft resource of yours matches that. Give its title.", ar: "لا يوجد مصدر مسودة بهذا الاسم.", ur: "آپ کا کوئی مسودہ وسیلہ نہیں ملا۔" },
  CLASS_REQUIRED: { en: "Which class is this for?", ar: "لأي فصل؟", ur: "یہ کس کلاس کے لیے ہے؟" },
  GOAL_REQUIRED: { en: "Which goal does this portfolio entry show?", ar: "أي هدف يظهره هذا المدخل؟", ur: "یہ پورٹ فولیو اندراج کون سا ہدف دکھاتا ہے؟" },
  DATE_INVALID: { en: "That date is not clear. Which date?", ar: "التاريخ غير واضح. أي تاريخ؟", ur: "تاریخ واضح نہیں۔ کون سی تاریخ؟" },
  LEAVE_TO_BEFORE_FROM: { en: "The leave ends before it starts. Which dates?", ar: "الإجازة تنتهي قبل أن تبدأ. ما التواريخ؟", ur: "چھٹی شروع ہونے سے پہلے ختم ہو رہی ہے۔ تاریخیں کیا ہیں؟" },
  LEAVE_TYPE_NOT_FOUND: { en: "Which type of leave?", ar: "أي نوع من الإجازة؟", ur: "کس قسم کی چھٹی؟" },
  LEAVE_TYPE_AMBIGUOUS: { en: "Which type of leave?", ar: "أي نوع من الإجازة؟", ur: "کس قسم کی چھٹی؟" },
  MEETING_DATE_PAST: { en: "That date has passed. Which date?", ar: "هذا التاريخ مضى. أي تاريخ؟", ur: "یہ تاریخ گزر چکی۔ کون سی تاریخ؟" },
  MEETING_END_BEFORE_START: { en: "The window ends before it starts. What times?", ar: "النافذة تنتهي قبل أن تبدأ. ما الأوقات؟", ur: "وقت شروع ہونے سے پہلے ختم ہو رہا ہے۔ اوقات کیا ہیں؟" },
  MEETING_WINDOW_TOO_SHORT: { en: "That is shorter than one meeting slot. What times?", ar: "أقصر من موعد واحد. ما الأوقات؟", ur: "یہ ایک سلاٹ سے کم ہے۔ اوقات کیا ہیں؟" },
  MEETING_LOCATION_NEEDED: { en: "Where will families meet you?", ar: "أين تلتقي بك الأسر؟", ur: "والدین آپ سے کہاں ملیں گے؟" },
  MEETING_CANCELLATION_POLICY_NEEDED: { en: "How can families cancel or change a meeting?", ar: "كيف تلغي الأسر أو تغير اللقاء؟", ur: "والدین ملاقات کیسے منسوخ یا تبدیل کریں؟" },
  DIGEST_WEEK_NOT_STARTED: { en: "That week has not started yet. Which week?", ar: "هذا الأسبوع لم يبدأ. أي أسبوع؟", ur: "یہ ہفتہ ابھی شروع نہیں ہوا۔ کون سا ہفتہ؟" },
  EXAM_AMBIGUOUS: { en: "More than one test matches. Which one?", ar: "أكثر من اختبار يطابق. أيها؟", ur: "ایک سے زیادہ ٹیسٹ ملتے ہیں۔ کون سا؟" },
  EXAM_NOT_FOUND: { en: "No open test of yours matches that. Which test?", ar: "لا يوجد اختبار مفتوح بهذا الاسم. أي اختبار؟", ur: "آپ کا کوئی کھلا ٹیسٹ نہیں ملا۔ کون سا ٹیسٹ؟" },
  SUBJECT_REQUIRED: { en: "Which subject?", ar: "أي مادة؟", ur: "کون سا مضمون؟" },
  SUBJECT_NOT_IN_EXAM: { en: "That subject is not in this test. Which subject?", ar: "هذه المادة ليست في الاختبار. أي مادة؟", ur: "یہ مضمون اس ٹیسٹ میں نہیں۔ کون سا مضمون؟" },
  MARK_OVER_TOTAL: { en: "That mark is above the total. What is the right mark?", ar: "الدرجة أعلى من الكلية. ما الدرجة الصحيحة؟", ur: "نمبر کل سے زیادہ ہیں۔ درست نمبر کیا ہیں؟" },
  MARK_NOT_SAID: { en: "This mark is not in your words. What mark did this pupil get?", ar: "هذه الدرجة ليست في كلامك. ما درجة الطالب؟", ur: "یہ نمبر آپ کے الفاظ میں نہیں۔ اس طالب علم کے نمبر کیا ہیں؟" },
  MARK_REQUIRED: { en: "What mark should it be?", ar: "ما الدرجة؟", ur: "نمبر کیا ہونے چاہییں؟" },
  MARK_NOT_FOUND: { en: "No mark is saved for this pupil in that test yet.", ar: "لا توجد درجة محفوظة لهذا الطالب.", ur: "اس ٹیسٹ میں اس طالب علم کے نمبر ابھی محفوظ نہیں۔" },
  TERM_REQUIRED: { en: "Which term is this for?", ar: "لأي فصل دراسي؟", ur: "یہ کس ٹرم کے لیے ہے؟" },
  REPORT_AMBIGUOUS: { en: "More than one report matches. Which term?", ar: "أكثر من تقرير يطابق. أي فصل؟", ur: "ایک سے زیادہ رپورٹ ملتی ہیں۔ کون سی ٹرم؟" },
  REPORT_NOT_FOUND: { en: "No report of this pupil is open for remarks.", ar: "لا يوجد تقرير مفتوح للملاحظات لهذا الطالب.", ur: "اس طالب علم کی کوئی رپورٹ تبصروں کے لیے کھلی نہیں۔" },
  CLASS_NOT_FOUND: { en: "That class is not on this campus yet. Which class?", ar: "هذا الفصل غير موجود بعد. أي فصل؟", ur: "یہ کلاس ابھی اس کیمپس پر نہیں۔ کون سی کلاس؟" },
  FEE_GROUP_AMBIGUOUS: { en: "Several fee groups have this name. Which one?", ar: "عدة مجموعات رسوم بهذا الاسم. أيها؟", ur: "اس نام کے کئی فیس گروپ ہیں۔ کون سا؟" },
  FEE_TYPE_AMBIGUOUS: { en: "Several fee types match. Which one?", ar: "عدة أنواع رسوم تطابق. أيها؟", ur: "کئی فیس اقسام ملتی ہیں۔ کون سی؟" },
  FEE_TYPE_CODE_TAKEN: { en: "Another fee type already uses code {0}. What code should this one have?", ar: "رمز {0} مستخدم. ما الرمز الجديد؟", ur: "کوڈ {0} پہلے سے استعمال میں ہے۔ نیا کوڈ کیا ہو؟" },
  FEE_ASSIGN_CLASSES_NEEDED: { en: "Which classes or grades should this fee group apply to?", ar: "على أي فصول تنطبق مجموعة الرسوم؟", ur: "یہ فیس گروپ کن کلاسوں پر لاگو ہو؟" },
  FEE_GRADE_NOT_FOUND: { en: "There is no class with this name on the campus. Which class?", ar: "لا يوجد فصل بهذا الاسم. أي فصل؟", ur: "اس نام کی کوئی کلاس نہیں۔ کون سی کلاس؟" },
  FEE_FINE_RULE_AMBIGUOUS: { en: "Several fine rules have this name. Which one?", ar: "عدة قواعد غرامة بهذا الاسم. أيها؟", ur: "اس نام کے کئی جرمانہ قواعد ہیں۔ کون سا؟" },
  FEE_PERCENT_OVER_100: { en: "A percentage cannot be more than 100. What percentage?", ar: "النسبة لا تتجاوز 100. ما النسبة؟", ur: "فیصد 100 سے زیادہ نہیں ہو سکتا۔ کتنا فیصد؟" },
  FEE_DISCOUNT_AMBIGUOUS: { en: "Several discounts have this name. Which one?", ar: "عدة خصومات بهذا الاسم. أيها؟", ur: "اس نام کی کئی رعایتیں ہیں۔ کون سی؟" },
  FEE_DISCOUNT_CODE_TAKEN: { en: "Another discount already uses code {0}. What code should this one have?", ar: "رمز {0} مستخدم لخصم آخر.", ur: "کوڈ {0} کسی اور رعایت کا ہے۔" },
  STUDENT_CATEGORY_AMBIGUOUS: { en: "Several student categories match. Which one?", ar: "عدة فئات طلاب تطابق. أيها؟", ur: "کئی طلبہ زمرے ملتے ہیں۔ کون سا؟" },
  STUDENT_CATEGORY_NOT_FOUND: { en: "There is no student category with this name. Which one?", ar: "لا توجد فئة بهذا الاسم. أيها؟", ur: "اس نام کا کوئی زمرہ نہیں۔ کون سا؟" },
  ROSTER_BATCH_AMBIGUOUS: { en: "Which staged roster do you mean?", ar: "أي قائمة مُعدّة تقصد؟", ur: "کون سی تیار شدہ فہرست؟" },
  ROSTER_BATCH_NOT_FOUND: { en: "No staged roster has that name. Choose one of the staged rosters.", ar: "لا توجد قائمة بهذا الاسم.", ur: "اس نام کی کوئی تیار فہرست نہیں۔" },
  CYCLE_CHOOSE_DRAFT: { en: "Which draft academic year should start?", ar: "أي عام دراسي مسودة يبدأ؟", ur: "کون سا مسودہ تعلیمی سال شروع ہو؟" },
  CHAT_SETTINGS_NOTHING_TO_CHANGE: { en: "Which messaging rule should change?", ar: "أي قاعدة مراسلة تتغير؟", ur: "پیغام رسانی کا کون سا اصول بدلے؟" },
  INVITATION_AMBIGUOUS: { en: "Several pending invitations match that name. Which one?", ar: "عدة دعوات معلقة تطابق. أيها؟", ur: "کئی زیر التوا دعوت نامے ملتے ہیں۔ کون سا؟" },
  INVITATION_NOT_FOUND: { en: "No pending invitation for that person.", ar: "لا توجد دعوة معلقة لهذا الشخص.", ur: "اس شخص کا کوئی زیر التوا دعوت نامہ نہیں۔" },
  INVITATION_UNSENT_NOT_FOUND: { en: "No unsent invitation for that person.", ar: "لا توجد دعوة غير مرسلة لهذا الشخص.", ur: "اس شخص کا کوئی غیر ارسال شدہ دعوت نامہ نہیں۔" },
  GUARDIAN_NEEDED: { en: "Which guardian is this about?", ar: "أي ولي أمر؟", ur: "کون سا سرپرست؟" },
  GUARDIAN_AMBIGUOUS: { en: "Several guardians of this child match. Which one?", ar: "عدة أولياء أمور يطابقون. أيهم؟", ur: "اس بچے کے کئی سرپرست ملتے ہیں۔ کون سا؟" },
  GUARDIAN_NOT_FOUND: { en: "That guardian is not linked to this child.", ar: "ولي الأمر غير مرتبط بهذا الطفل.", ur: "یہ سرپرست اس بچے سے منسلک نہیں۔" },
  APPLICATION_AMBIGUOUS: { en: "Several applications match that name. Which one?", ar: "عدة طلبات تطابق. أيها؟", ur: "کئی درخواستیں ملتی ہیں۔ کون سی؟" },
  APPLICATION_NOT_FOUND: { en: "No open application for that child.", ar: "لا يوجد طلب مفتوح لهذا الطفل.", ur: "اس بچے کی کوئی کھلی درخواست نہیں۔" },
  LEAVE_REQUEST_AMBIGUOUS: { en: "This person has several pending leave requests. Which one?", ar: "لدى هذا الشخص عدة طلبات إجازة. أيها؟", ur: "اس شخص کی کئی زیر التوا چھٹی کی درخواستیں ہیں۔ کون سی؟" },
  LEAVE_REQUEST_NOT_FOUND: { en: "No pending leave request for that person on those dates.", ar: "لا يوجد طلب إجازة معلق في هذه التواريخ.", ur: "ان تاریخوں پر اس شخص کی کوئی زیر التوا درخواست نہیں۔" },
  CHILD_CHOICE: { en: "Which child is this about?", ar: "عن أي طفل؟", ur: "یہ کس بچے کے بارے میں ہے؟" },
  CHILD_AMBIGUOUS: { en: "More than one of your children matches. Which one?", ar: "أكثر من طفل يطابق. أيهم؟", ur: "آپ کے ایک سے زیادہ بچے ملتے ہیں۔ کون سا؟" },
  ABSENCE_NOT_ON_DATE: { en: "There is no absence to explain on that day. Which day?", ar: "لا يوجد غياب في ذلك اليوم. أي يوم؟", ur: "اس دن کوئی غیر حاضری نہیں۔ کون سا دن؟" },
  NO_OPEN_ABSENCES: { en: "There are no absences left to explain.", ar: "لا توجد غيابات تحتاج إلى تبرير.", ur: "وضاحت کے لیے کوئی غیر حاضری باقی نہیں۔" },
  ARRIVAL_TIME_NEEDED: { en: "What time did your child arrive?", ar: "متى وصل طفلك؟", ur: "بچہ کس وقت پہنچا؟" },
  LEAVE_IN_PAST_EXPLAIN_INSTEAD: { en: "Those days have passed. Would you like to explain the absence instead?", ar: "مضت تلك الأيام. هل تريد تبرير الغياب بدلاً من ذلك؟", ur: "وہ دن گزر چکے۔ کیا غیر حاضری کی وضاحت کرنا چاہیں گے؟" },
  LEAVE_TOO_LONG: { en: "Leave can be up to 30 days. Which dates?", ar: "الإجازة حتى 30 يوماً. ما التواريخ؟", ur: "چھٹی زیادہ سے زیادہ 30 دن۔ کون سی تاریخیں؟" },
  TEACHER_CHOICE: { en: "Which teacher would you like to meet?", ar: "أي معلم تريد لقاءه؟", ur: "کس استاد سے ملنا چاہیں گے؟" },
  TEACHER_AMBIGUOUS: { en: "More than one teacher matches. Which one?", ar: "أكثر من معلم يطابق. أيهم؟", ur: "ایک سے زیادہ اساتذہ ملتے ہیں۔ کون سا؟" },
  TEACHER_NOT_FOUND: { en: "That teacher does not teach your child. Which teacher?", ar: "هذا المعلم لا يدرّس طفلك. أي معلم؟", ur: "یہ استاد آپ کے بچے کو نہیں پڑھاتے۔ کون سا استاد؟" },
  MEETING_DATE_UNAVAILABLE: { en: "There are no free slots that day. Which day suits you?", ar: "لا مواعيد متاحة ذلك اليوم. أي يوم يناسبك؟", ur: "اس دن کوئی خالی وقت نہیں۔ کون سا دن مناسب ہے؟" },
  MEETING_TIME_UNAVAILABLE: { en: "That time is taken. Which time suits you?", ar: "هذا الوقت محجوز. أي وقت يناسبك؟", ur: "یہ وقت بک ہے۔ کون سا وقت مناسب ہے؟" },
  MEETING_MODE_CHOICE: { en: "In person or online?", ar: "حضورياً أم عبر الإنترنت؟", ur: "بالمشافہ یا آن لائن؟" },
  ACTIVITY_AMBIGUOUS: { en: "More than one activity matches. Which one?", ar: "أكثر من نشاط يطابق. أيها؟", ur: "ایک سے زیادہ سرگرمیاں ملتی ہیں۔ کون سی؟" },
  ACTIVITY_NOT_FOUND: { en: "No open activity has that name. Which one?", ar: "لا يوجد نشاط مفتوح بهذا الاسم.", ur: "اس نام کی کوئی کھلی سرگرمی نہیں۔ کون سی؟" },
  PICKUP_END_BEFORE_START: { en: "The pickup window ends before it starts. What times?", ar: "نافذة الاستلام تنتهي قبل أن تبدأ.", ur: "لینے کا وقت شروع ہونے سے پہلے ختم ہو رہا ہے۔" },
  PICKUP_WINDOW_TOO_LONG: { en: "A pickup pass covers up to 12 hours. What times?", ar: "تصريح الاستلام حتى 12 ساعة.", ur: "پاس زیادہ سے زیادہ 12 گھنٹے کا ہوتا ہے۔" },
  PICKUP_WINDOW_PASSED: { en: "That time has passed. Which day and time?", ar: "مضى ذلك الوقت. أي يوم ووقت؟", ur: "یہ وقت گزر چکا۔ کون سا دن اور وقت؟" },
  PICKUP_TOO_FAR_AHEAD: { en: "A pickup pass can be up to 14 days ahead. Which day?", ar: "التصريح حتى 14 يوماً مقدماً.", ur: "پاس زیادہ سے زیادہ 14 دن پہلے بنتا ہے۔ کون سا دن؟" },
  INVOICE_CHOICE: { en: "Which invoice would you like to pay?", ar: "أي فاتورة تريد دفعها؟", ur: "کون سا انوائس ادا کرنا ہے؟" },
  INVOICE_NOT_FOUND: { en: "No unpaid invoice matches that.", ar: "لا توجد فاتورة غير مدفوعة مطابقة.", ur: "کوئی غیر ادا شدہ انوائس نہیں ملا۔" },
  DATE_IN_PAST: { en: "That date has passed. Which date?", ar: "مضى هذا التاريخ. أي تاريخ؟", ur: "یہ تاریخ گزر چکی۔ کون سی تاریخ؟" },
  COUNSELLOR_NOT_FOUND: { en: "No counsellor has that name. Which counsellor?", ar: "لا يوجد مرشد بهذا الاسم.", ur: "اس نام کا کوئی کاؤنسلر نہیں۔ کون سا؟" },
  CAMPUS_AMBIGUOUS: { en: "More than one campus matches. Which one?", ar: "أكثر من فرع يطابق. أيها؟", ur: "ایک سے زیادہ کیمپس ملتے ہیں۔ کون سا؟" },
  CAMPUS_NOT_FOUND: { en: "No campus has that name. Which campus?", ar: "لا يوجد فرع بهذا الاسم.", ur: "اس نام کا کوئی کیمپس نہیں۔ کون سا؟" },
  POLICY_TEMPLATE_AMBIGUOUS: { en: "More than one group rule matches. Which one?", ar: "أكثر من قاعدة تطابق. أيها؟", ur: "ایک سے زیادہ گروپ قواعد ملتے ہیں۔ کون سا؟" },
  POLICY_TEMPLATE_NOT_FOUND: { en: "No group rule has that name. Which one?", ar: "لا توجد قاعدة بهذا الاسم.", ur: "اس نام کا کوئی گروپ قاعدہ نہیں۔" },
  POLICY_REVIEWER_REQUIRED: { en: "Who should review this before it goes live?", ar: "من يراجعها قبل التطبيق؟", ur: "نافذ ہونے سے پہلے کون جائزہ لے؟" },
  POLICY_OVERRIDE_CHOICE: { en: "Which campus exception do you mean?", ar: "أي استثناء تقصد؟", ur: "کون سی کیمپس چھوٹ؟" },
  IDENTITY_CONNECTION_CHOICE: { en: "Google or Microsoft sign-in?", ar: "تسجيل دخول Google أم Microsoft؟", ur: "گوگل یا مائیکروسافٹ سائن ان؟" },
  SUPPORT_REQUEST_CHOICE: { en: "Which support request?", ar: "أي طلب دعم؟", ur: "کون سی سپورٹ درخواست؟" },
  ROLE_REQUIRED: { en: "Which role should they have?", ar: "ما الدور؟", ur: "کون سا کردار؟" },
  STAFF_AMBIGUOUS: { en: "More than one person matches. Which one?", ar: "أكثر من شخص يطابق. أيهم؟", ur: "ایک سے زیادہ افراد ملتے ہیں۔ کون سا؟" },
  STAFF_NOT_FOUND: { en: "No staff member has that name. Who do you mean?", ar: "لا يوجد موظف بهذا الاسم.", ur: "اس نام کا کوئی عملہ نہیں۔" },
};

/** Errors at every AI site go through this: unknown codes fall back to INTERNAL. */
export function errorWords(code: string | null | undefined, language: Lang): string {
  const entry = (code ? (ERROR_WORDS as Record<string, T | undefined>)[code] : undefined) ?? ERROR_WORDS.INTERNAL!;
  return entry[language] ?? entry.en;
}

/** The one A/B/C/X vocabulary (Run Sheet, setup, catalogue, inbox, frame, SetupPrompt). C long takes `{0}` = role list; use cLongAny when none is known. */
export type StepClassKey = "A" | "B" | "C" | "X";
export const CLASS_WORDS: Record<StepClassKey, { long: T; short: T; help: T }> = {
  A: {
    long: { en: "Runs on its own", ar: "يعمل تلقائيًا", ur: "خود چلتا ہے" },
    short: { en: "Runs itself", ar: "تلقائي", ur: "خودکار" },
    help: { en: "AI does it straight away and shows you the receipt.", ar: "ينفّذه الذكاء الاصطناعي فورًا ويُريك الإيصال.", ur: "اے آئی فوراً کرتا ہے اور آپ کو رسید دکھاتا ہے۔" },
  },
  B: {
    long: { en: "You confirm first", ar: "تؤكّد أولًا", ur: "پہلے آپ تصدیق کریں" },
    short: { en: "You confirm", ar: "بتأكيدك", ur: "آپ کی تصدیق" },
    help: { en: "AI shows exactly what will change. Nothing is saved until you press Save.", ar: "يعرض الذكاء الاصطناعي ما سيتغيّر بالضبط، ولا يُحفظ شيء قبل أن تضغط حفظ.", ur: "اے آئی بالکل دکھاتا ہے کہ کیا بدلے گا۔ محفوظ کریں دبانے تک کچھ محفوظ نہیں ہوتا۔" },
  },
  C: {
    long: { en: "Goes to {0}", ar: "يُحال إلى {0}", ur: "{0} کو جاتا ہے" },
    short: { en: "Goes to its owner", ar: "إلى صاحبه", ur: "متعلقہ شخص کو" },
    help: { en: "AI prepares it and hands it to the person who decides, on their own screen.", ar: "يُجهّزه الذكاء الاصطناعي ويُحيله إلى صاحب القرار على شاشته.", ur: "اے آئی اسے تیار کر کے فیصلہ کرنے والے کو اس کی اپنی اسکرین پر دیتا ہے۔" },
  },
  X: {
    long: { en: "Not connected yet · kept as a task", ar: "غير متصل بعد · يبقى مهمة", ur: "ابھی منسلک نہیں · کام کے طور پر محفوظ" },
    short: { en: "Kept as a task", ar: "يبقى مهمة", ur: "کام کے طور پر" },
    help: { en: "Your answer is kept. AI can't do this yet, so it stays on your to-do list.", ar: "تُحفظ إجابتك. لا يستطيع الذكاء الاصطناعي فعل هذا بعد، فيبقى في قائمة مهامك.", ur: "آپ کا جواب محفوظ ہے۔ اے آئی یہ ابھی نہیں کر سکتا، اس لیے یہ آپ کی کاموں کی فہرست میں رہتا ہے۔" },
  },
};
export const CLASS_C_LONG_ANY: T = { en: "Goes to the person who decides", ar: "يُحال إلى صاحب القرار", ur: "فیصلہ کرنے والے کو جاتا ہے" };

/** Run (job) statuses as people say them. */
export type RunStatus = "PLANNING" | "NEEDS_INPUT" | "PLAN_REVIEW" | "RUNNING" | "WAITING_CONFIRM" | "WAITING_HANDOFF" | "PAUSED" | "BLOCKED" | "FAILED" | "COMPLETED" | "CANCELLED" | "EXPIRED";
export const RUN_STATUS_WORDS: Record<RunStatus, T> = {
  PLANNING: { en: "Planning", ar: "قيد التخطيط", ur: "منصوبہ بن رہا ہے" },
  PLAN_REVIEW: { en: "Planning", ar: "قيد التخطيط", ur: "منصوبہ بن رہا ہے" },
  RUNNING: { en: "Working", ar: "قيد العمل", ur: "کام جاری ہے" },
  WAITING_CONFIRM: { en: "Waiting for your OK", ar: "بانتظار موافقتك", ur: "آپ کی منظوری کا منتظر" },
  WAITING_HANDOFF: { en: "Waiting for a decision", ar: "بانتظار قرار", ur: "فیصلے کا منتظر" },
  NEEDS_INPUT: { en: "Needs a detail", ar: "يحتاج تفصيلة", ur: "ایک تفصیل درکار" },
  PAUSED: { en: "Paused", ar: "متوقف مؤقتًا", ur: "رکا ہوا" },
  BLOCKED: { en: "Stopped by a problem", ar: "توقف بسبب مشكلة", ur: "مسئلے کی وجہ سے رک گیا" },
  FAILED: { en: "Stopped by a problem", ar: "توقف بسبب مشكلة", ur: "مسئلے کی وجہ سے رک گیا" },
  COMPLETED: { en: "Finished", ar: "اكتمل", ur: "مکمل" },
  CANCELLED: { en: "Stopped", ar: "أُوقف", ur: "روک دیا" },
  EXPIRED: { en: "Expired", ar: "انتهت صلاحيته", ur: "میعاد ختم" },
};
export function runStatusWords(status: string, language: Lang): string {
  const entry = (RUN_STATUS_WORDS as Record<string, T | undefined>)[status];
  return entry ? entry[language] : "";
}

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
const P = (en: [string, string], ar: PluralForms, ur: [string, string]): Record<Lang, PluralForms> => ({ en: { one: en[0], other: en[1] }, ar, ur: { one: ur[0], other: ur[1] } });
const ar = (one: string, two: string, few: string, other: string): PluralForms => ({ one, two, few, many: other, other });

/** Receipt and preview count nouns, chosen with Intl.PluralRules (Arabic has six categories). */
export const COUNT_WORDS: Record<string, Record<Lang, PluralForms>> = {
  created: P(["created", "created"], ar("أُنشئ", "أُنشئ", "أُنشئت", "أُنشئ"), ["بنایا", "بنائے"]),
  saved: P(["saved", "saved"], ar("حُفظ", "حُفظ", "حُفظت", "حُفظ"), ["محفوظ", "محفوظ"]),
  updated: P(["updated", "updated"], ar("حُدّث", "حُدّث", "حُدّثت", "حُدّث"), ["اپ ڈیٹ", "اپ ڈیٹ"]),
  assigned: P(["assigned", "assigned"], ar("أُسند", "أُسند", "أُسندت", "أُسند"), ["تفویض", "تفویض"]),
  requests: P(["request", "requests"], ar("طلب", "طلبان", "طلبات", "طلبًا"), ["درخواست", "درخواستیں"]),
  drafts: P(["draft", "drafts"], ar("مسودة", "مسودتان", "مسودات", "مسودة"), ["مسودہ", "مسودے"]),
  changes: P(["change", "changes"], ar("تغيير", "تغييران", "تغييرات", "تغييرًا"), ["تبدیلی", "تبدیلیاں"]),
  records: P(["record", "records"], ar("سجل", "سجلان", "سجلات", "سجلًا"), ["ریکارڈ", "ریکارڈ"]),
  pupils: P(["pupil", "pupils"], ar("طالب", "طالبان", "طلاب", "طالبًا"), ["طالب علم", "طلبہ"]),
  students: P(["student", "students"], ar("طالب", "طالبان", "طلاب", "طالبًا"), ["طالب علم", "طلبہ"]),
  classes: P(["class", "classes"], ar("فصل", "فصلان", "فصول", "فصلًا"), ["کلاس", "کلاسیں"]),
  sections: P(["section", "sections"], ar("شعبة", "شعبتان", "شعب", "شعبة"), ["سیکشن", "سیکشن"]),
  slots: P(["slot", "slots"], ar("موعد", "موعدان", "مواعيد", "موعدًا"), ["سلاٹ", "سلاٹ"]),
  invoices: P(["invoice", "invoices"], ar("فاتورة", "فاتورتان", "فواتير", "فاتورة"), ["انوائس", "انوائس"]),
  payments: P(["payment", "payments"], ar("دفعة", "دفعتان", "دفعات", "دفعة"), ["ادائیگی", "ادائیگیاں"]),
  entries: P(["entry", "entries"], ar("إدخال", "إدخالان", "إدخالات", "إدخالًا"), ["اندراج", "اندراجات"]),
  explanations: P(["explanation", "explanations"], ar("توضيح", "توضيحان", "توضيحات", "توضيحًا"), ["وضاحت", "وضاحتیں"]),
  cycles: P(["cycle", "cycles"], ar("دورة", "دورتان", "دورات", "دورة"), ["سائیکل", "سائیکل"]),
  bookings: P(["booking", "bookings"], ar("حجز", "حجزان", "حجوزات", "حجزًا"), ["بکنگ", "بکنگز"]),
  allocations: P(["allocation", "allocations"], ar("تخصيص", "تخصيصان", "تخصيصات", "تخصيصًا"), ["تقسیم", "تقسیمات"]),
  lessons: P(["lesson", "lessons"], ar("درس", "درسان", "دروس", "درسًا"), ["سبق", "اسباق"]),
  exams: P(["exam", "exams"], ar("اختبار", "اختباران", "اختبارات", "اختبارًا"), ["امتحان", "امتحانات"]),
  members: P(["member", "members"], ar("عضو", "عضوان", "أعضاء", "عضوًا"), ["رکن", "اراکین"]),
  loans: P(["loan", "loans"], ar("إعارة", "إعارتان", "إعارات", "إعارة"), ["اجرا", "اجرا"]),
  returns: P(["return", "returns"], ar("إرجاع", "إرجاعان", "إرجاعات", "إرجاعًا"), ["واپسی", "واپسیاں"]),
  reservations: P(["reservation", "reservations"], ar("حجز", "حجزان", "حجوزات", "حجزًا"), ["ریزرویشن", "ریزرویشنز"]),
  renewals: P(["renewal", "renewals"], ar("تجديد", "تجديدان", "تجديدات", "تجديدًا"), ["تجدید", "تجدیدات"]),
  invitations: P(["invitation", "invitations"], ar("دعوة", "دعوتان", "دعوات", "دعوة"), ["دعوت نامہ", "دعوت نامے"]),
  types: P(["type", "types"], ar("نوع", "نوعان", "أنواع", "نوعًا"), ["قسم", "اقسام"]),
  marked: P(["marked", "marked"], ar("سُجّل", "سُجّل", "سُجّلوا", "سُجّل"), ["درج", "درج"]),
  present: P(["present", "present"], ar("حاضر", "حاضران", "حاضرون", "حاضرًا"), ["حاضر", "حاضر"]),
  absent: P(["absent", "absent"], ar("غائب", "غائبان", "غائبون", "غائبًا"), ["غیر حاضر", "غیر حاضر"]),
  sent: P(["sent", "sent"], ar("أُرسل", "أُرسل", "أُرسلت", "أُرسل"), ["بھیجا", "بھیجے"]),
  invited: P(["invited", "invited"], ar("دُعي", "دُعي", "دُعوا", "دُعي"), ["مدعو", "مدعو"]),
};

/** Counts that are machine detail (money minor units, durations, bounds) and never shown. */
export const INTERNAL_COUNT_KEYS: ReadonlySet<string> = new Set(["amountMinor", "dayTenths", "slotMinutes", "bufferMinutes", "end"]);
export function isInternalCountKey(key: string): boolean { return INTERNAL_COUNT_KEYS.has(key) || key.endsWith("Minor"); }

/** The plural noun for one count, or null when the key has no human word. */
export function countWord(key: string, count: number, language: Lang): string | null {
  const forms = COUNT_WORDS[key]?.[language];
  if (!forms) return null;
  const category = new Intl.PluralRules(language).select(count);
  return forms[category] ?? forms.other;
}

/** Shown receipt parts: drops zero, internal and unknown keys. The only way to show receipt or preview counts. */
export function receiptParts(receipt: { counts?: Record<string, number> | null } | null | undefined, language: Lang): Array<{ key: string; count: number; label: string }> {
  const parts: Array<{ key: string; count: number; label: string }> = [];
  for (const [key, count] of Object.entries(receipt?.counts ?? {})) {
    if (typeof count !== "number" || !Number.isFinite(count) || count === 0) continue;
    // Zero values (including alreadyAssigned / kept) were dropped above.
    if (isInternalCountKey(key)) continue;
    const label = countWord(key, count, language);
    if (label) parts.push({ key, count, label });
  }
  return parts;
}

/** Shown when a receipt has no visible parts. */
export const RECEIPT_KIND_WORDS: Record<"write" | "draft" | "handoff" | "read", T> = {
  write: { en: "Saved", ar: "تم الحفظ", ur: "محفوظ" },
  draft: { en: "Draft saved", ar: "حُفظت مسودة", ur: "مسودہ محفوظ" },
  handoff: { en: "Sent for a decision", ar: "أُرسل للقرار", ur: "فیصلے کے لیے بھیجا گیا" },
  read: { en: "Looked up", ar: "تم الاطلاع", ur: "دیکھ لیا" },
};

/** Field names for question pointers; never show a slash path. */
export const FIELD_WORDS: Record<string, T> = {
  schoolName: { en: "school name", ar: "اسم المدرسة", ur: "اسکول کا نام" },
  ownerName: { en: "owner name", ar: "اسم المالك", ur: "مالک کا نام" },
  ownerEmail: { en: "owner email", ar: "بريد المالك الإلكتروني", ur: "مالک کا ای میل" },
  city: { en: "city", ar: "المدينة", ur: "شہر" },
  kind: { en: "type", ar: "النوع", ur: "قسم" },
  date: { en: "date", ar: "التاريخ", ur: "تاریخ" },
  title: { en: "title", ar: "العنوان", ur: "عنوان" },
  class: { en: "class", ar: "الفصل", ur: "کلاس" },
  student: { en: "student", ar: "الطالب", ur: "طالب علم" },
  amount: { en: "amount", ar: "المبلغ", ur: "رقم" },
  reason: { en: "reason", ar: "السبب", ur: "وجہ" },
  from: { en: "start", ar: "البداية", ur: "آغاز" },
  to: { en: "end", ar: "النهاية", ur: "اختتام" },
  name: { en: "name", ar: "الاسم", ur: "نام" },
  subject: { en: "subject", ar: "المادة", ur: "مضمون" },
  term: { en: "term", ar: "الفصل الدراسي", ur: "ٹرم" },
  time: { en: "time", ar: "الوقت", ur: "وقت" },
  location: { en: "place", ar: "المكان", ur: "جگہ" },
  code: { en: "code", ar: "الرمز", ur: "کوڈ" },
};
const GENERIC_DETAIL: T = { en: "a detail", ar: "تفصيلة", ur: "تفصیل" };
const ITEM_WORD: T = { en: "item {0}", ar: "البند {0}", ur: "آئٹم {0}" };

/** A JSON pointer such as /lines/2/date as words ("date, item 3"). */
export function humanisePointer(pointer: string | null | undefined, language: Lang): string {
  const segments = (pointer ?? "").split("/").filter(Boolean);
  const leaf = [...segments].reverse().find(segment => !/^\d+$/.test(segment)) ?? null;
  const lastIndex = [...segments].reverse().find(segment => /^\d+$/.test(segment));
  const index = lastIndex === undefined ? null : Number(lastIndex);
  let label: string;
  if (leaf && FIELD_WORDS[leaf]) label = FIELD_WORDS[leaf][language];
  else if (leaf && language === "en") label = leaf.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim() || GENERIC_DETAIL.en;
  else label = GENERIC_DETAIL[language];
  return index === null ? label : `${label}, ${ITEM_WORD[language].replace("{0}", String(index + 1))}`;
}

/** Ask workspace + Run Sheet surface copy (UI pass). Shared keys live in UI above. */
export const RUN_UI: Record<string, T> = {
  savedAnswers: { en: "Details saved so far", ar: "التفاصيل المحفوظة", ur: "اب تک محفوظ تفصیلات" },
  finishCurrent: { en: "Use the review or confirmation button above to finish this request. Choose New request to start something different.", ar: "استخدم زر المراجعة أو التأكيد أعلاه لإكمال هذا الطلب. اختر طلباً جديداً لبدء عمل آخر.", ur: "اس درخواست کو مکمل کرنے کے لیے اوپر جائزے یا تصدیق کا بٹن دبائیں۔ دوسرے کام کے لیے نئی درخواست منتخب کریں۔" },
  readyForReview: { en: "Ready for your review", ar: "جاهز لمراجعتك", ur: "آپ کے جائزے کے لیے تیار" },
  provisionReady: { en: "Your school details are ready. Review the filled form and select Provision school to create it.", ar: "بيانات المدرسة جاهزة. راجع النموذج المعبأ ثم اختر تجهيز المدرسة لإنشائها.", ur: "اسکول کی تفصیلات تیار ہیں۔ بھرا ہوا فارم دیکھیں اور اسکول بنانے کے لیے پروویژن اسکول دبائیں۔" },
  reviewCreateSchool: { en: "Review and create school", ar: "مراجعة وإنشاء المدرسة", ur: "جائزہ لیں اور اسکول بنائیں" },
  yourRequest: { en: "Your request", ar: "طلبك", ur: "آپ کی درخواست" },
  asked: { en: "Asked", ar: "طُلب", ur: "پوچھا گیا" },
  youAsked: { en: "You asked", ar: "طلبت", ur: "آپ نے کہا" },
  planningSteps: { en: "Planning your steps…", ar: "جارٍ تخطيط خطواتك…", ur: "آپ کے مراحل طے ہو رہے ہیں…" },
  planReady: { en: "Plan ready: {0} steps", ar: "الخطة جاهزة: {0} خطوات", ur: "منصوبہ تیار: {0} مراحل" },
  checkForUpdates: { en: "Check for updates", ar: "تحقّق من التحديثات", ur: "تازہ صورتحال دیکھیں" },
  creditsUsed: { en: "Used {0} AI credits", ar: "استُخدم {0} من أرصدة الذكاء الاصطناعي", ur: "{0} اے آئی کریڈٹ استعمال ہوئے" },
  creditsHelp: { en: "Charged only for AI work. Nothing is charged when AI is unavailable.", ar: "يُحتسب فقط مقابل عمل الذكاء الاصطناعي. لا يُحتسب شيء عند تعذّره.", ur: "صرف اے آئی کے کام پر چارج ہوتا ہے۔ اے آئی دستیاب نہ ہو تو کچھ چارج نہیں ہوتا۔" },
  tryAgain: { en: "Try again", ar: "حاول مجددًا", ur: "دوبارہ کوشش کریں" },
  stopTitle: { en: "Stop this request?", ar: "إيقاف هذا الطلب؟", ur: "یہ درخواست روک دیں؟" },
  stopBody: { en: "Steps already saved stay saved. Nothing else will run.", ar: "الخطوات المحفوظة تبقى محفوظة. لن يُنفَّذ شيء آخر.", ur: "محفوظ ہو چکے مراحل محفوظ رہیں گے۔ اور کچھ نہیں چلے گا۔" },
  keepGoing: { en: "Keep going", ar: "متابعة العمل", ur: "جاری رکھیں" },
  found: { en: "Skoolee found", ar: "وجد سكولي", ur: "اسکولی کو ملا" },
  copyAnswer: { en: "Copy answer", ar: "نسخ الإجابة", ur: "جواب کاپی کریں" },
  alreadySaved: { en: "Already saved earlier · nothing new", ar: "حُفظ سابقًا · لا جديد", ur: "پہلے ہی محفوظ تھا · کچھ نیا نہیں" },
  approvedBy: { en: "Approved by {0}", ar: "وافق عليه {0}", ur: "{0} نے منظور کیا" },
  waitingFor: { en: "Waiting for {0}", ar: "بانتظار {0}", ur: "{0} کا انتظار" },
  withRoles: { en: "With the {0}", ar: "لدى {0}", ur: "{0} کے پاس" },
  readyOnScreen: { en: "Ready on its screen. Finish it there.", ar: "جاهز في شاشته. أكمله هناك.", ur: "اپنی اسکرین پر تیار ہے۔ وہیں مکمل کریں۔" },
  checkBeforeSaving: { en: "Check before saving", ar: "راجع قبل الحفظ", ur: "محفوظ کرنے سے پہلے دیکھیں" },
  previewCodeHelp: { en: "This code changes if anything in the preview changes. Saving applies exactly this version.", ar: "يتغيّر هذا الرمز إذا تغيّر أي شيء في المعاينة. الحفظ يطبّق هذه النسخة بالضبط.", ur: "پیش نظارے میں کچھ بھی بدلے تو یہ کوڈ بدل جاتا ہے۔ محفوظ کرنا بالکل یہی ورژن لاگو کرتا ہے۔" },
  copyCode: { en: "Copy preview code", ar: "نسخ رمز المعاينة", ur: "پیش نظارے کا کوڈ کاپی کریں" },
  previewUpdated: { en: "Preview updated", ar: "حُدّثت المعاينة", ur: "پیش نظارہ تازہ ہو گیا" },
  quickChanges: { en: "Quick changes", ar: "تغييرات سريعة", ur: "فوری تبدیلیاں" },
  whatYouConfirmed: { en: "What you confirmed", ar: "ما أكّدته", ur: "آپ نے کیا تصدیق کیا" },
  workingOnIt: { en: "Working on it…", ar: "جارٍ العمل عليه…", ur: "اس پر کام ہو رہا ہے…" },
  ordinal: { en: "{0} of {1}", ar: "{0} من {1}", ur: "{1} میں سے {0}" },
  orTypeAnswer: { en: "Or type your answer", ar: "أو اكتب إجابتك", ur: "یا اپنا جواب لکھیں" },
  yourAnswer: { en: "Your answer", ar: "إجابتك", ur: "آپ کا جواب" },
  practiceStep: { en: "Example only. Nothing was saved to your school.", ar: "مثال فقط. لم يُحفظ شيء في مدرستك.", ur: "صرف مثال۔ آپ کے اسکول میں کچھ محفوظ نہیں ہوا۔" },
  refusedNoLink: { en: "The school's rules refused this. Nothing was saved.", ar: "رفضت قواعد المدرسة ذلك. لم يُحفظ شيء.", ur: "اسکول کے قواعد نے اسے مسترد کیا۔ کچھ محفوظ نہیں ہوا۔" },
  uncertainNoLink: { en: "We can't tell whether this was saved. Check the record before trying again.", ar: "لا نعرف إن حُفظ. تحقّق من السجل قبل المحاولة مجددًا.", ur: "معلوم نہیں یہ محفوظ ہوا یا نہیں۔ دوبارہ کوشش سے پہلے ریکارڈ دیکھیں۔" },
  outcomeTitle_EXECUTED: { en: "Done", ar: "تم", ur: "ہو گیا" },
  outcomeTitle_PARTIAL: { en: "Partly done", ar: "تم جزئيًا", ur: "جزوی طور پر مکمل" },
  outcomeTitle_AWAITING_APPROVAL: { en: "Prepared and waiting", ar: "جاهز وبالانتظار", ur: "تیار اور منتظر" },
  outcomeTitle_PLAN_SAVED: { en: "Saved as a draft plan", ar: "حُفظ كمسودة خطة", ur: "مسودہ منصوبے کے طور پر محفوظ" },
  outcomeTitle_NOT_SUPPORTED: { en: "AI can't do this yet", ar: "لا يستطيع الذكاء الاصطناعي فعل هذا بعد", ur: "اے آئی ابھی یہ نہیں کر سکتا" },
  outcomeTitle_NOTHING_DONE: { en: "Nothing was saved", ar: "لم يُحفظ شيء", ur: "کچھ محفوظ نہیں ہوا" },
  askSomethingElse: { en: "Ask something else", ar: "اطلب شيئًا آخر", ur: "کچھ اور پوچھیں" },
  reviewSteps: { en: "Review steps", ar: "راجع الخطوات", ur: "مراحل دیکھیں" },
  rephrase: { en: "Rephrase", ar: "أعد الصياغة", ur: "دوبارہ لکھیں" },
  savedAt: { en: "Saved", ar: "تم الحفظ", ur: "محفوظ" },
  askTrust: { en: "AI works within your role. Steps that need your OK wait for you.", ar: "يعمل الذكاء الاصطناعي ضمن صلاحيات دورك. الخطوات التي تحتاج موافقتك تنتظرك.", ur: "اے آئی آپ کے کردار کی حد میں کام کرتا ہے۔ جن مراحل کو آپ کی منظوری چاہیے وہ آپ کا انتظار کرتے ہیں۔" },
  askPlaceholderExample: { en: "Ask in your own words, e.g. “{0}”", ar: "اطلب بكلماتك، مثل: «{0}»", ur: "اپنے الفاظ میں کہیں، مثلاً: “{0}”" },
  replyBelow: { en: "Reply in the Ask box below.", ar: "اكتب ردّك في مربع الطلب أدناه.", ur: "نیچے پوچھیں والے خانے میں جواب لکھیں۔" },
  replyBelowOrTap: { en: "Tap an answer, or reply in the Ask box below.", ar: "اختر إجابة، أو اكتب ردّك في مربع الطلب أدناه.", ur: "کوئی جواب چنیں، یا نیچے والے خانے میں لکھیں۔" },
  answerPlaceholder: { en: "Type your answer…", ar: "اكتب إجابتك…", ur: "اپنا جواب لکھیں…" },
  answeringNow: { en: "Answering Skoolee's question", ar: "تجيب عن سؤال Skoolee", ur: "اسکولی کے سوال کا جواب" },
  askInstead: { en: "Ask something new instead", ar: "اطلب شيئًا جديدًا بدلًا من ذلك", ur: "اس کے بجائے نیا سوال پوچھیں" },
  welcomeTitle: { en: "What should we get done today?", ar: "ماذا ننجز اليوم؟", ur: "آج کیا کام کرنا ہے؟" },
  welcomeHint: { en: "Ask in your own words. Skoolee plans the steps, asks for anything missing, and shows you what it will change.", ar: "اطلب بكلماتك. يخطط Skoolee للخطوات ويسأل عن أي نقص ويعرض ما سيغيّره.", ur: "اپنے الفاظ میں کہیں۔ اسکولی مراحل طے کرتا ہے، کمی ہو تو پوچھتا ہے، اور دکھاتا ہے کہ کیا بدلے گا۔" },
  kbdSend: { en: "to send", ar: "للإرسال", ur: "بھیجنے کے لیے" },
  kbdNewLine: { en: "new line", ar: "سطر جديد", ur: "نئی سطر" },
  kbdFocus: { en: "to focus", ar: "للتركيز", ur: "یہاں آنے کے لیے" },
  charsNear: { en: "{0} of {1} characters used", ar: "استُخدم {0} من {1} حرفًا", ur: "{1} میں سے {0} حروف استعمال ہوئے" },
  tryAsking: { en: "Try asking", ar: "جرّب أن تطلب", ur: "یہ پوچھ کر دیکھیں" },
  stillWaiting: { en: "Your current request is still waiting for you. A new one keeps it under Recent requests.", ar: "طلبك الحالي ما زال بانتظارك. الطلب الجديد يُبقيه ضمن الطلبات الأخيرة.", ur: "آپ کی موجودہ درخواست ابھی آپ کی منتظر ہے۔ نئی درخواست اسے حالیہ درخواستوں میں رکھتی ہے۔" },
  newRequest: { en: "New request", ar: "طلب جديد", ur: "نئی درخواست" },
  recentWaiting: { en: "Requests waiting for you: {0}", ar: "طلبات بانتظارك: {0}", ur: "آپ کی منتظر درخواستیں: {0}" },
  recentEmpty: { en: "No requests yet", ar: "لا طلبات بعد", ur: "ابھی کوئی درخواست نہیں" },
  recentEmptyHint: { en: "What you ask appears here, so you can come back to it.", ar: "يظهر هنا ما تطلبه لتعود إليه.", ur: "آپ جو پوچھیں گے وہ یہاں نظر آئے گا تاکہ آپ واپس آ سکیں۔" },
  recentError: { en: "Your recent requests could not be loaded.", ar: "تعذّر تحميل طلباتك الأخيرة.", ur: "آپ کی حالیہ درخواستیں لوڈ نہیں ہو سکیں۔" },
  retry: { en: "Try again", ar: "حاول مجددًا", ur: "دوبارہ کوشش کریں" },
  offTitle: { en: "AI Workflows are not switched on for your school yet.", ar: "لم تُفعَّل مسارات الذكاء الاصطناعي لمدرستك بعد.", ur: "آپ کے اسکول کے لیے اے آئی ورک فلو ابھی فعال نہیں۔" },
  offHint: { en: "Ask your school admin to switch it on.", ar: "اطلب من مسؤول مدرستك تفعيلها.", ur: "اپنے اسکول ایڈمن سے اسے فعال کرنے کو کہیں۔" },
  backHome: { en: "Back to your dashboard", ar: "العودة إلى لوحتك", ur: "اپنے ڈیش بورڈ پر واپس جائیں" },
  aiWorkflows: { en: "AI Workflows", ar: "مسارات الذكاء الاصطناعي", ur: "اے آئی ورک فلو" },
};
