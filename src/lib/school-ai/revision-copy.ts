import type { Language } from "@/lib/locale/package";

const messages = {
  history: ["History & comparison", "السجل والمقارنة", "تاریخ اور موازنہ"],
  hint: ["See who changed a saved record, compare versions and review the exact content before approval.", "اعرف من غيّر السجل المحفوظ، وقارن نسخه وراجع المحتوى الدقيق قبل الاعتماد.", "دیکھیں محفوظ ریکارڈ کس نے بدلا، نسخوں کا موازنہ کریں اور منظوری سے پہلے اصل مواد دیکھیں۔"],
  inspect: ["Inspect saved history", "فحص السجل المحفوظ", "محفوظ تاریخ دیکھیں"],
  choose: ["Choose a saved record", "اختر سجلًا محفوظًا", "محفوظ ریکارڈ منتخب کریں"],
  noRecords: ["Saved setup, sources, curricula, papers, workflows and policies will appear here.", "تظهر هنا الإعدادات والمصادر والمناهج والأوراق والمهام والسياسات المحفوظة.", "محفوظ ترتیب، ماخذ، نصاب، پرچے، کام اور پالیسیاں یہاں آئیں گی۔"],
  snapshot: ["Saved snapshot", "النسخة المحفوظة", "محفوظ نسخہ"],
  comparison: ["Version comparison", "مقارنة النسخ", "نسخوں کا موازنہ"],
  selectedVersion: ["Version to inspect", "النسخة المراد فحصها", "جائزے کا نسخہ"],
  compareWith: ["Compare with", "المقارنة مع", "کس نسخے سے موازنہ"],
  noBaseline: ["No earlier snapshot", "لا توجد نسخة سابقة", "کوئی پچھلا نسخہ نہیں"],
  before: ["Earlier content", "المحتوى السابق", "پہلا مواد"],
  after: ["Selected content", "المحتوى المحدد", "منتخب مواد"],
  actor: ["Changed by", "عدّله", "تبدیل کرنے والا"],
  actorId: ["Staff reference", "مرجع الموظف", "عملے کا حوالہ"],
  unknownActor: ["Former or unavailable staff member", "موظف سابق أو غير متاح", "سابق یا غیر دستیاب ملازم"],
  timestamp: ["Saved at", "حُفظ في", "محفوظ ہونے کا وقت"],
  action: ["Recorded action", "الإجراء المسجل", "درج کارروائی"],
  CREATE: ["First draft saved", "حفظ المسودة الأولى", "پہلا مسودہ محفوظ ہوا"],
  SAVE: ["Changes saved", "حفظ التغييرات", "تبدیلیاں محفوظ ہوئیں"],
  REVIEW: ["Submitted for review", "إرسال للمراجعة", "جائزے کے لیے بھیجا گیا"],
  APPROVE: ["Saved version approved", "اعتماد النسخة المحفوظة", "محفوظ نسخہ منظور ہوا"],
  ARCHIVE: ["Record archived", "أرشفة السجل", "ریکارڈ آرکائیو ہوا"],
  ONBOARDING: ["School setup", "إعداد المدرسة", "اسکول کی ترتیب"],
  SOURCE: ["Source document", "المستند المصدر", "ماخذ دستاویز"],
  CURRICULUM: ["Curriculum", "المنهج", "نصاب"],
  PAPER: ["Exam paper", "ورقة الامتحان", "امتحانی پرچہ"],
  WORKFLOW: ["Work plan", "خطة العمل", "کام کا منصوبہ"],
  POLICY: ["School policy", "سياسة المدرسة", "اسکول کی پالیسی"],
  DELIVERY_POLICY: ["Exam delivery policy", "سياسة تقديم الامتحان", "امتحان کی ترسیل کی پالیسی"],
  BRIEF: ["Assessment brief", "موجز التقييم", "امتحان کا خاکہ"],
  PRACTICE: ["Practice set", "مجموعة تدريبية", "مشقی مجموعہ"],
  changed: ["Changed", "تغيّر", "بدلا"],
  added: ["Added", "أُضيف", "شامل ہوا"],
  removed: ["Removed", "أُزيل", "ہٹایا گیا"],
  changeCount: ["Changed fields: {count}", "الحقول المتغيرة: {count}", "بدلے ہوئے خانے: {count}"],
  unchanged: ["The selected snapshots have the same content and status.", "للنسختين المحددتين المحتوى والحالة نفسيهما.", "منتخب نسخوں کا مواد اور حالت یکساں ہیں۔"],
  moreChanges: ["Show more changes", "عرض المزيد من التغييرات", "مزید تبدیلیاں دکھائیں"],
  moreHistory: ["Load earlier history", "تحميل سجل أقدم", "پہلی تاریخ لوڈ کریں"],
  showFull: ["Show full text", "عرض النص كاملًا", "پورا متن دکھائیں"],
  showLess: ["Show less", "عرض أقل", "کم دکھائیں"],
  notPresent: ["Not present in this version", "غير موجود في هذه النسخة", "اس نسخے میں موجود نہیں"],
  empty: ["Empty", "فارغ", "خالی"],
  yes: ["Yes", "نعم", "ہاں"],
  no: ["No", "لا", "نہیں"],
  restore: ["Restore as a new draft", "استعادة كمسودة جديدة", "نئے مسودے کے طور پر بحال کریں"],
  restoreTitle: ["Create a draft from this version?", "إنشاء مسودة من هذه النسخة؟", "اس نسخے سے نیا مسودہ بنائیں؟"],
  restoreDescription: ["Content from version {source} will become a new draft after current version {current}. Existing history, approvals and applied school changes stay unchanged. Review the new draft before approving it.", "سيصبح محتوى النسخة {source} مسودة جديدة بعد النسخة الحالية {current}. يبقى السجل والاعتمادات والتغييرات المطبّقة دون تغيير. راجع المسودة الجديدة قبل اعتمادها.", "نسخہ {source} کا مواد موجودہ نسخہ {current} کے بعد نیا مسودہ بنے گا۔ سابقہ تاریخ، منظوریاں اور نافذ شدہ تبدیلیاں برقرار رہیں گی۔ نئے مسودے کا منظوری سے پہلے جائزہ لیں۔"],
  restored: ["Version {source} was restored as draft version {version}.", "استُعيدت النسخة {source} كمسودة برقم {version}.", "نسخہ {source} نئے مسودہ نسخہ {version} کے طور پر بحال ہوا۔"],
  reviewConfirm: ["I reviewed this saved version and the changes shown against the selected comparison.", "راجعت هذه النسخة المحفوظة والتغييرات الظاهرة مقارنةً بالنسخة المحددة.", "میں نے محفوظ نسخے اور منتخب موازنے کے مقابل دکھائی گئی تبدیلیوں کا جائزہ لیا ہے۔"],
  approveCurrent: ["Approve reviewed current version", "اعتماد النسخة الحالية بعد مراجعتها", "جائزہ شدہ موجودہ نسخہ منظور کریں"],
  currentOnly: ["Approval applies to the current saved version. Select the latest version to approve it.", "يُطبّق الاعتماد على النسخة الحالية المحفوظة. اختر أحدث نسخة لاعتمادها.", "منظوری موجودہ محفوظ نسخے پر لاگو ہوتی ہے۔ منظوری کے لیے تازہ نسخہ منتخب کریں۔"],
  sourceVersion: ["Source text version {version}", "نسخة نص المصدر {version}", "ماخذ متن کا نسخہ {version}"],
  originalFileHint: ["The original file is immutable. This history compares the saved extraction and reviewed text.", "الملف الأصلي ثابت. يقارن هذا السجل النص المستخرج والمراجَع المحفوظ.", "اصل فائل مستقل ہے۔ یہ تاریخ محفوظ نکالے گئے اور جائزہ شدہ متن کا موازنہ کرتی ہے۔"],
  staffPaper: ["Staff assessment content, including answer keys and marking criteria", "محتوى التقييم للموظفين، بما فيه الإجابات ومعايير التصحيح", "عملے کا امتحانی مواد، بشمول جوابات اور جانچ کے معیار"],
  limitedHistory: ["Only versions available within your current permissions are shown.", "تُعرض النسخ المتاحة ضمن صلاحياتك الحالية فقط.", "صرف موجودہ اجازت کے مطابق دستیاب نسخے دکھائے گئے ہیں۔"],
  noVersions: ["No accessible saved revisions were found on this page.", "لم تُعثر على نسخ محفوظة متاحة في هذه الصفحة.", "اس صفحے پر کوئی قابلِ رسائی محفوظ نسخہ نہیں ملا۔"],
  sameVersion: ["Choose two different versions to compare their content.", "اختر نسختين مختلفتين لمقارنة محتواهما.", "مواد کے موازنے کے لیے دو الگ نسخے منتخب کریں۔"],
  item: ["Item {number}", "العنصر {number}", "اندراج {number}"],
  recordDetails: ["Record details", "تفاصيل السجل", "ریکارڈ کی تفصیل"],
} as const;

const fields: Record<string, readonly [string, string, string]> = {
  classIds: ["Audience classes", "الصفوف المستهدفة", "وصول کنندگان کی جماعتیں"], channel: ["Delivery channel", "قناة الإرسال", "ارسال کا ذریعہ"], messages: ["Exact language variants", "النسخ اللغوية الدقيقة", "زبانوں کے اصل نسخے"], en: ["English", "الإنجليزية", "انگریزی"], ar: ["Arabic", "العربية", "عربی"], ur: ["Urdu", "الأردية", "اردو"], subject: ["Email subject", "عنوان البريد", "ای میل کا موضوع"], body: ["Email message", "نص البريد", "ای میل کا پیغام"], fallbackLanguage: ["Fallback language", "اللغة البديلة", "متبادل زبان"],
  term: ["Term", "الفصل الدراسي", "تعلیمی مدت"], slots: ["Timetable entries", "حصص الجدول", "نظام الاوقات کے اندراجات"], dayOfWeek: ["School day", "اليوم الدراسي", "اسکول کا دن"], periodNumber: ["Period number", "رقم الحصة", "پیریڈ نمبر"], startTime: ["Start time", "وقت البداية", "آغاز کا وقت"], endTime: ["End time", "وقت النهاية", "اختتام کا وقت"], slotType: ["Entry type", "نوع الحصة", "اندراج کی قسم"], teacherId: ["Teacher reference", "مرجع المعلم", "استاد کا حوالہ"], roomId: ["Room reference", "مرجع الغرفة", "کمرے کا حوالہ"],
  bankMetadata: ["Question bank details", "تفاصيل بنك الأسئلة", "سوالات کے ذخیرے کی تفصیل"], tags: ["Tags", "الوسوم", "ٹیگ"], difficulty: ["Difficulty", "الصعوبة", "مشکل کی سطح"], reusedFrom: ["Reused question source", "مصدر السؤال المعاد استخدامه", "دوبارہ استعمال شدہ سوال کا ماخذ"], paperId: ["Paper reference", "مرجع الورقة", "پرچے کا حوالہ"], paperVersion: ["Paper version", "نسخة الورقة", "پرچے کا نسخہ"], questionId: ["Question reference", "مرجع السؤال", "سوال کا حوالہ"],
  title: ["Title", "العنوان", "عنوان"], status: ["Status", "الحالة", "حالت"], path: ["Starting route", "مسار البداية", "ابتدائی راستہ"],
  answers: ["School facts", "معلومات المدرسة", "اسکول کی معلومات"], confirmedKeys: ["Confirmed facts", "المعلومات المؤكدة", "تصدیق شدہ معلومات"], step: ["Setup stage", "مرحلة الإعداد", "ترتیب کا مرحلہ"], currentQuestion: ["Current question", "السؤال الحالي", "موجودہ سوال"],
  schoolName: ["School name", "اسم المدرسة", "اسکول کا نام"], country: ["Country", "البلد", "ملک"], timezone: ["Time zone", "المنطقة الزمنية", "ٹائم زون"], campuses: ["Campuses", "الفروع", "شاخیں"], grades: ["Grades", "الصفوف", "جماعتیں"], academicYear: ["Academic year", "العام الدراسي", "تعلیمی سال"], startDate: ["Start date", "تاريخ البداية", "آغاز کی تاریخ"], endDate: ["End date", "تاريخ النهاية", "اختتام کی تاریخ"], workingDays: ["School days", "أيام الدراسة", "اسکول کے دن"], firstOutcome: ["First outcome", "النتيجة الأولى", "پہلا نتیجہ"], curriculum: ["Curriculum", "المنهج", "نصاب"], assessmentPolicy: ["Assessment policy", "سياسة التقييم", "امتحانی پالیسی"], feePolicy: ["Fee policy", "سياسة الرسوم", "فیس کی پالیسی"], communications: ["Communications", "التواصل", "اطلاعات"], resources: ["Resources", "الموارد", "وسائل"], staff: ["Staff", "الموظفون", "عملہ"], students: ["Students", "الطلاب", "طلبہ"], migrationSource: ["Existing records", "السجلات الحالية", "موجودہ ریکارڈ"],
  extractedText: ["Source text", "نص المصدر", "ماخذ کا متن"], fileName: ["File name", "اسم الملف", "فائل کا نام"], mimeType: ["File format", "صيغة الملف", "فائل کی قسم"], documentKind: ["Document type", "نوع المستند", "دستاویز کی قسم"], sourcePages: ["Source pages", "صفحات المصدر", "ماخذ کے صفحات"], page: ["Page", "الصفحة", "صفحہ"], text: ["Text", "النص", "متن"], origin: ["Input method", "طريقة الإدخال", "درج کرنے کا طریقہ"], extractionStatus: ["Extraction review", "مراجعة الاستخراج", "متن نکالنے کا جائزہ"], uncertainties: ["Uncertainties", "مواضع الشك", "غیر یقینی باتیں"], sha256: ["Original file fingerprint", "بصمة الملف الأصلي", "اصل فائل کا شناختی نشان"], extractionModel: ["Extraction model", "نموذج الاستخراج", "متن نکالنے کا ماڈل"], extractedAt: ["Extracted at", "وقت الاستخراج", "متن نکالنے کا وقت"], sourceLanguage: ["Source language", "لغة المصدر", "ماخذ کی زبان"],
  classId: ["Class reference", "مرجع الصف", "جماعت کا حوالہ"], subjectId: ["Subject reference", "مرجع المادة", "مضمون کا حوالہ"], board: ["Board or curriculum", "الجهة التعليمية أو المنهج", "بورڈ یا نصاب"], sources: ["Evidence sources", "مصادر الأدلة", "ثبوت کے ماخذ"], id: ["Reference", "المرجع", "حوالہ"], kind: ["Type", "النوع", "قسم"], reference: ["Source reference", "مرجع المصدر", "ماخذ کا حوالہ"], excerpt: ["Quoted source text", "نص مقتبس من المصدر", "ماخذ سے اقتباس"], approved: ["Reviewed source", "مصدر مراجَع", "جائزہ شدہ ماخذ"], outcomes: ["Learning outcomes", "نواتج التعلم", "تعلیمی نتائج"], sourceId: ["Source reference", "مرجع المصدر", "ماخذ کا حوالہ"], sourcePage: ["Source page", "صفحة المصدر", "ماخذ کا صفحہ"], taught: ["Taught", "تم تدريسه", "پڑھایا گیا"], included: ["Included", "مضمّن", "شامل"],
  curriculumId: ["Curriculum reference", "مرجع المنهج", "نصاب کا حوالہ"], curriculumVersion: ["Curriculum version", "نسخة المنهج", "نصاب کا نسخہ"], language: ["Language", "اللغة", "زبان"], blueprint: ["Paper blueprint", "مخطط الورقة", "پرچے کا خاکہ"], durationMinutes: ["Duration in minutes", "المدة بالدقائق", "دورانیہ منٹ میں"], totalMarks: ["Total marks", "الدرجة الكلية", "کل نمبر"], instructions: ["Instructions", "التعليمات", "ہدایات"], sections: ["Sections", "الأقسام", "حصے"], questionCount: ["Questions available", "عدد الأسئلة", "دستیاب سوالات"], answerCount: ["Answers required", "الإجابات المطلوبة", "مطلوبہ جوابات"], marksPerQuestion: ["Marks per question", "درجة السؤال", "فی سوال نمبر"], type: ["Question type", "نوع السؤال", "سوال کی قسم"], outcomeIds: ["Learning outcome references", "مراجع نواتج التعلم", "تعلیمی نتائج کے حوالے"], questions: ["Questions", "الأسئلة", "سوالات"], sectionId: ["Section reference", "مرجع القسم", "حصے کا حوالہ"], prompt: ["Question text", "نص السؤال", "سوال کا متن"], marks: ["Marks", "الدرجات", "نمبر"], options: ["Answer options", "خيارات الإجابة", "جواب کے اختیارات"], correctOptionId: ["Correct answer option", "خيار الإجابة الصحيحة", "درست جواب کا اختیار"], modelAnswer: ["Model answer", "الإجابة النموذجية", "نمونہ جواب"], rubric: ["Marking criteria", "معايير التصحيح", "جانچ کے معیار"], criterion: ["Criterion", "المعيار", "معیار"], sourceRefs: ["Source evidence", "أدلة المصدر", "ماخذ کے ثبوت"], locked: ["Protected question", "سؤال محمي", "محفوظ سوال"], generation: ["Creation details", "تفاصيل الإنشاء", "تخلیق کی تفصیل"], model: ["Model", "النموذج", "ماڈل"], generatedAt: ["Created at", "وقت الإنشاء", "بنانے کا وقت"],
  goal: ["Desired outcome", "النتيجة المطلوبة", "مطلوبہ نتیجہ"], steps: ["Proposed steps", "الخطوات المقترحة", "مجوزہ مراحل"], module: ["School module", "وحدة المدرسة", "اسکول کا شعبہ"], sourceIds: ["Evidence references", "مراجع الأدلة", "ثبوت کے حوالے"], missingInformation: ["Missing information", "المعلومات الناقصة", "درکار معلومات"], proposal: ["Operational proposal", "المقترح التنفيذي", "عملی تجویز"], operation: ["Operation", "العملية", "کارروائی"], label: ["Name", "الاسم", "نام"], classes: ["Classes", "الصفوف", "جماعتیں"], name: ["Name", "الاسم", "نام"], section: ["Section", "الشعبة", "سیکشن"], teachingMode: ["Teaching arrangement", "نظام التدريس", "تدریسی انتظام"], mode: ["Automation mode", "وضع الأتمتة", "خودکاری کی صورت"], scope: ["Policy scope", "نطاق السياسة", "پالیسی کا دائرہ"], requiresApproval: ["Approval required", "يتطلب اعتمادًا", "منظوری درکار"],
};

export type RevisionCopy = Record<keyof typeof messages, string>;
export function revisionCopy(language: Language): RevisionCopy {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  return Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[index]])) as RevisionCopy;
}
export function revisionFieldLabel(path: (string | number)[], language: Language): string {
  const c = revisionCopy(language), index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  return path.filter(key => key !== "data").map(key => typeof key === "number" ? c.item.replace("{number}", new Intl.NumberFormat(language).format(key + 1)) : fields[key]?.[index] || c.recordDetails).join(" · ");
}
