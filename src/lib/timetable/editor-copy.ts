import type { Language } from "@/lib/locale/package";

const scopeMessages = {
  year: ["Timetable academic year", "العام الدراسي للجدول", "نظام الاوقات کا تعلیمی سال"],
  term: ["Timetable term", "الفصل الدراسي للجدول", "نظام الاوقات کی مدت"],
  ANNUAL: ["Annual", "سنوي", "سالانہ"], TERM_1: ["Term 1", "الفصل الأول", "پہلی مدت"], TERM_2: ["Term 2", "الفصل الثاني", "دوسری مدت"], TERM_3: ["Term 3", "الفصل الثالث", "تیسری مدت"],
  class: ["Timetable class", "صف الجدول", "نظام الاوقات کی جماعت"], chooseClass: ["Choose a class", "اختر صفًا", "جماعت منتخب کریں"],
  published: ["Published", "منشور", "شائع شدہ"], draft: ["Draft", "مسودة", "مسودہ"], absent: ["No timetable", "لا يوجد جدول", "نظام الاوقات موجود نہیں"],
  scopeHint: ["Class schedules use the selected year and term. Teacher, room and clash views also include annual and unclassified terms from this year because they may overlap.", "تستخدم جداول الصفوف العام والفصل المحددين. وتشمل عروض المعلمين والغرف والتعارضات الجداول السنوية والفصول غير المصنفة من هذا العام لاحتمال تداخلها.", "جماعت کا نظام الاوقات منتخب سال اور مدت کا ہے۔ اساتذہ، کمروں اور تصادم کے جائزے میں اسی سال کے سالانہ اور غیر واضح مدت والے نظام الاوقات بھی شامل ہیں کیونکہ ان کا وقت متصادم ہو سکتا ہے۔"],
  changeTitle: ["Discard unsaved timetable changes?", "تجاهل تغييرات الجدول غير المحفوظة؟", "نظام الاوقات کی غیر محفوظ تبدیلیاں چھوڑ دیں؟"],
  changeHint: ["Save your edits before switching, or discard them to open the selected schedule. Saved timetables stay unchanged.", "احفظ تعديلاتك قبل التبديل، أو تجاهلها لفتح الجدول المحدد. تبقى الجداول المحفوظة دون تغيير.", "منتخب نظام الاوقات کھولنے سے پہلے تبدیلیاں محفوظ کریں یا انہیں چھوڑ دیں۔ محفوظ نظام الاوقات تبدیل نہیں ہوں گے۔"],
  discard: ["Discard and switch", "تجاهل وتبديل", "چھوڑ کر تبدیل کریں"], keep: ["Keep editing", "متابعة التعديل", "ترمیم جاری رکھیں"],
} as const;
export function timetableScopeCopy(language: Language) { const index = language === "ar" ? 1 : language === "ur" ? 2 : 0; return Object.fromEntries(Object.entries(scopeMessages).map(([key, values]) => [key, values[index]])) as Record<keyof typeof scopeMessages, string>; }


const addMessages = {
  title: ["Add period", "إضافة حصة", "پیریڈ شامل کریں"],
  hint: ["Add one empty lesson cell to this draft. Choose its subject, teacher and room afterward in the timetable.", "أضف خلية درس فارغة واحدة إلى هذه المسودة، ثم اختر مادتها ومعلمها وغرفتها من الجدول.", "اس مسودے میں سبق کا ایک خالی خانہ شامل کریں۔ پھر نظام الاوقات میں اس کا مضمون، استاد اور کمرہ منتخب کریں۔"],
  draftOnly: ["Periods can be added only to a draft. Save pending edits first.", "يمكن إضافة الحصص إلى المسودة فقط. احفظ التعديلات المعلقة أولًا.", "پیریڈ صرف مسودے میں شامل کیے جا سکتے ہیں۔ پہلے زیر التوا تبدیلیاں محفوظ کریں۔"],
  day: ["Day for the new period", "يوم الحصة الجديدة", "نئے پیریڈ کا دن"], period: ["New period number", "رقم الحصة الجديدة", "نئے پیریڈ کا نمبر"], start: ["New period start", "بداية الحصة الجديدة", "نئے پیریڈ کا آغاز"], end: ["New period end", "نهاية الحصة الجديدة", "نئے پیریڈ کا اختتام"],
  fixed: ["Times follow the campus definition or this draft’s existing period. Change the definition before using different times.", "تتبع الأوقات تعريف الفرع أو الحصة الموجودة في هذه المسودة. غيّر التعريف قبل استخدام أوقات مختلفة.", "اوقات شاخ کی ترتیب یا اس مسودے کے موجودہ پیریڈ کے مطابق ہیں۔ مختلف اوقات استعمال کرنے سے پہلے ترتیب تبدیل کریں۔"],
  close: ["Close", "إغلاق", "بند کریں"], saving: ["Adding period…", "جارٍ إضافة الحصة…", "پیریڈ شامل ہو رہا ہے…"], saved: ["Period added to this draft.", "أُضيفت الحصة إلى هذه المسودة.", "پیریڈ اس مسودے میں شامل کر دیا گیا۔"],
  occupied: ["Already present", "موجودة بالفعل", "پہلے سے موجود"], full: ["Every configured period is already present on this day. Choose another working day.", "كل الحصص المعرفة موجودة في هذا اليوم. اختر يومًا دراسيًا آخر.", "اس دن کے تمام مقررہ پیریڈ پہلے سے موجود ہیں۔ دوسرا تعلیمی دن منتخب کریں۔"],
  failed: ["The period could not be added. Your selections are retained; retry when the connection is available.", "تعذرت إضافة الحصة. حُفظت اختياراتك؛ أعد المحاولة عند توفر الاتصال.", "پیریڈ شامل نہیں ہوا۔ آپ کے انتخاب محفوظ ہیں؛ رابطہ بحال ہونے پر دوبارہ کوشش کریں۔"],
  TIMETABLE_SLOT_INVALID: ["Enter a working day, a period from 1 to 30, and valid start and end times.", "أدخل يومًا دراسيًا ورقم حصة من 1 إلى 30 وأوقات بداية ونهاية صحيحة.", "تعلیمی دن، 1 سے 30 تک پیریڈ نمبر اور درست آغاز و اختتام درج کریں۔"],
  TIMETABLE_NOT_FOUND: ["This timetable is no longer available in your campus. Reload the page.", "لم يعد هذا الجدول متاحًا في فرعك. أعد تحميل الصفحة.", "یہ نظام الاوقات اب آپ کی شاخ میں دستیاب نہیں۔ صفحہ دوبارہ لوڈ کریں۔"],
  PERMISSION_DENIED: ["Your timetable editing access changed. Reload and check your access.", "تغيرت صلاحية تعديل الجدول. أعد التحميل وتحقق من صلاحياتك.", "نظام الاوقات میں ترمیم کی اجازت بدل گئی ہے۔ دوبارہ لوڈ کر کے اجازت دیکھیں۔"],
  TIMETABLE_DRAFT_REQUIRED: ["Return this timetable to draft before adding a period.", "أعد الجدول إلى مسودة قبل إضافة حصة.", "پیریڈ شامل کرنے سے پہلے نظام الاوقات کو مسودہ بنائیں۔"],
  TIMETABLE_SCOPE: ["The class, campus or academic year is no longer open for changes.", "لم يعد الصف أو الفرع أو العام الدراسي متاحًا للتعديل.", "جماعت، شاخ یا تعلیمی سال میں تبدیلی اب دستیاب نہیں۔"],
  TIMETABLE_SLOT_EXISTS: ["This day and period already exist. Open the existing cell to edit it.", "هذا اليوم والحصة موجودان بالفعل. افتح الخلية الحالية لتعديلها.", "اس دن کا یہ پیریڈ پہلے سے موجود ہے۔ ترمیم کے لیے موجودہ خانہ کھولیں۔"],
  TIMETABLE_WEEKEND: ["Choose a working day from the current campus calendar.", "اختر يومًا دراسيًا من تقويم الفرع الحالي.", "شاخ کے موجودہ کیلنڈر سے تعلیمی دن منتخب کریں۔"],
  TIMETABLE_PERIOD_CHANGED: ["Campus periods changed. Close this dialog and reload before adding a period.", "تغيرت حصص الفرع. أغلق هذا الحوار وأعد التحميل قبل إضافة حصة.", "شاخ کے پیریڈ بدل گئے ہیں۔ پیریڈ شامل کرنے سے پہلے یہ مکالمہ بند کر کے دوبارہ لوڈ کریں۔"],
  TIMETABLE_EXISTING_INVALID: ["Correct invalid times in the existing timetable first.", "صحح الأوقات غير الصالحة في الجدول الحالي أولًا.", "پہلے موجودہ نظام الاوقات کے غلط اوقات درست کریں۔"],
  TIMETABLE_PERIOD_INCONSISTENT: ["Use the same start and end times for this period on every day.", "استخدم وقتي البداية والنهاية نفسيهما لهذه الحصة كل يوم.", "ہر دن اس پیریڈ کے لیے آغاز اور اختتام کے یکساں اوقات استعمال کریں۔"],
  TIMETABLE_SLOT_OVERLAP: ["This period overlaps another period on the same day.", "تتداخل هذه الحصة مع حصة أخرى في اليوم نفسه.", "اس پیریڈ کے اوقات اسی دن کے دوسرے پیریڈ سے متصادم ہیں۔"],
} as const;
export function addPeriodCopy(language: Language) { const index = language === "ar" ? 1 : language === "ur" ? 2 : 0; return Object.fromEntries(Object.entries(addMessages).map(([key, values]) => [key, values[index]])) as Record<keyof typeof addMessages, string>; }

const periodChangeMessages = {
  title: ["Review removed lesson assignments", "مراجعة تعيينات الدروس التي ستُزال", "ہٹائی جانے والی سبق کی تقرریوں کا جائزہ"],
  hint: ["Changing these periods to a non-teaching type clears their subject, teacher and room assignments on the days listed below. Subject, staff and room records remain available.", "يؤدي تغيير هذه الحصص إلى نوع غير تدريسي إلى مسح تعيينات المادة والمعلم والغرفة في الأيام المذكورة أدناه. تبقى سجلات المواد والموظفين والغرف متاحة.", "ان پیریڈز کو غیر تدریسی قسم میں بدلنے سے درج ذیل دنوں میں ان کے مضمون، استاد اور کمرے کی تقرریاں ہٹ جائیں گی۔ مضامین، عملے اور کمروں کے ریکارڈ دستیاب رہیں گے۔"],
  count: ["Affected lesson cells: {count}", "خلايا الدروس المتأثرة: {count}", "متاثرہ سبق کے خانے: {count}"],
  confirm: ["Clear listed assignments and save", "مسح التعيينات المذكورة والحفظ", "درج تقرریاں ہٹا کر محفوظ کریں"],
  cancel: ["Back to period settings", "العودة إلى إعدادات الحصص", "پیریڈ کی ترتیبات پر واپس جائیں"],
  saving: ["Saving period changes…", "جارٍ حفظ تغييرات الحصص…", "پیریڈ کی تبدیلیاں محفوظ ہو رہی ہیں…"],
  failed: ["The period changes were not confirmed. Your review is retained; retry or return to settings.", "لم يتم تأكيد تغييرات الحصص. احتُفظ بالمراجعة؛ أعد المحاولة أو عُد إلى الإعدادات.", "پیریڈ کی تبدیلیوں کی تصدیق نہیں ہوئی۔ جائزہ برقرار ہے؛ دوبارہ کوشش کریں یا ترتیبات پر واپس جائیں۔"],
  period: ["Period", "الحصة", "پیریڈ"],
  subject: ["Subject", "المادة", "مضمون"], teacher: ["Teacher", "المعلم", "استاد"], room: ["Room", "الغرفة", "کمرہ"],
  assigned: ["Assigned", "معيّن", "مقرر"],
  CLASS: ["Class", "درس", "کلاس"], BREAK: ["Break", "استراحة", "وقفہ"], PRAYER: ["Prayer", "صلاة", "نماز"], ASSEMBLY: ["Assembly", "تجمع", "اسمبلی"], ACTIVITY: ["Activity", "نشاط", "سرگرمی"],
} as const;
export function periodChangeCopy(language: Language) { const index = language === "ar" ? 1 : language === "ur" ? 2 : 0; return Object.fromEntries(Object.entries(periodChangeMessages).map(([key, values]) => [key, values[index]])) as Record<keyof typeof periodChangeMessages, string>; }
