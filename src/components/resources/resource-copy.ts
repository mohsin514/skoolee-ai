const en = {
  title: "Learning resources", eyebrow: "Class library", staffSummary: "Publish class material with an explicit audience. Learners only see the published version.",
  learnerSummary: "Notes, handouts and course routines your teachers shared with your class.", guardianSummary: "Material your child's teachers shared with families.",
  loading: "Loading resources…", failed: "Resources could not be loaded.", saved: "Saved.", empty: "No resources for this class yet.", learnerEmpty: "Nothing has been shared with you yet.",
  class: "Class", search: "Search titles", view: "View", viewStaff: "Staff view", viewClass: "As learners", viewGuardians: "As families",
  previewBanner: "Preview — exactly what this audience sees right now.",
  kinds: { HANDOUT: "Handout", NOTES: "Notes", ROUTINE: "Course routine", WORKSHEET: "Worksheet", ANSWER_KEY: "Answer key (staff only)", OTHER: "Other" },
  audiences: { CLASS: "Learners in this class", CLASS_AND_GUARDIANS: "Learners and their families", STAFF: "Staff only" },
  statuses: { DRAFT: "Draft", PUBLISHED: "Published", RETIRED: "Retired" },
  version: "Version", published: "Published version", latest: "Latest", notReady: "File not uploaded", open: "Open", download: "Download",
  add: "Add resource", addTitle: "New resource", resourceTitle: "Title", kind: "Type", audience: "Who can see it", language: "Language",
  description: "Description and accessible summary", descriptionHelp: "Shown to everyone; describes the content for anyone who cannot open the file.",
  sourceRights: "Source and sharing rights", sourceHelp: "e.g. Written by our maths department; may be shared with our learners.",
  file: "File", link: "Or an https link", fileHelp: "PDF, image, Word, Excel or text, up to 10 MB.", save: "Save draft", uploading: "Uploading…",
  publish: "Publish version", replace: "Upload a new version", replaceHelp: "Existing references keep the version they used.", retire: "Retire", cancel: "Cancel",
  answerKeyNote: "Answer keys are always staff only.", history: "Versions", changeAudience: "Change audience", moreActions: "More actions", moreActionsFor: "More actions for {title}",
  staffTitle: "Resources", retireTitle: "Retire this resource?", retireBody: "Learners and families stop seeing it straight away. Its versions stay in the history, and it cannot be published again.", retireConfirm: "Retire resource", keep: "Keep resource", errorTitle: "Couldn't load the resources", retry: "Try again",
};
export type ResourceCopy = typeof en;

const ar: ResourceCopy = {
  title: "مصادر التعلّم", eyebrow: "مكتبة الصف", staffSummary: "انشر مواد الصف مع تحديد الجمهور صراحةً. لا يرى الطلاب إلا النسخة المنشورة.",
  learnerSummary: "ملاحظات وأوراق وخطط دراسية شاركها معلموك مع صفك.", guardianSummary: "مواد شاركها معلمو طفلك مع الأسر.",
  loading: "جارٍ تحميل المصادر…", failed: "تعذّر تحميل المصادر.", saved: "تم الحفظ.", empty: "لا توجد مصادر لهذا الصف بعد.", learnerEmpty: "لم تتم مشاركة أي شيء معك بعد.",
  class: "الصف", search: "ابحث في العناوين", view: "العرض", viewStaff: "عرض الموظفين", viewClass: "كما يراه الطلاب", viewGuardians: "كما تراه الأسر",
  previewBanner: "معاينة — ما يراه هذا الجمهور الآن تماماً.",
  kinds: { HANDOUT: "ورقة عمل", NOTES: "ملاحظات", ROUTINE: "الخطة الدراسية", WORKSHEET: "تمارين", ANSWER_KEY: "مفتاح الإجابة (للموظفين فقط)", OTHER: "أخرى" },
  audiences: { CLASS: "طلاب هذا الصف", CLASS_AND_GUARDIANS: "الطلاب وأسرهم", STAFF: "الموظفون فقط" },
  statuses: { DRAFT: "مسودة", PUBLISHED: "منشور", RETIRED: "متقاعد" },
  version: "الإصدار", published: "الإصدار المنشور", latest: "الأحدث", notReady: "لم يُرفع الملف", open: "فتح", download: "تنزيل",
  add: "إضافة مصدر", addTitle: "مصدر جديد", resourceTitle: "العنوان", kind: "النوع", audience: "من يمكنه رؤيته", language: "اللغة",
  description: "الوصف وملخص ميسّر", descriptionHelp: "يظهر للجميع ويصف المحتوى لمن لا يستطيع فتح الملف.",
  sourceRights: "المصدر وحقوق المشاركة", sourceHelp: "مثال: من إعداد قسم الرياضيات؛ يجوز مشاركته مع طلابنا.",
  file: "الملف", link: "أو رابط https", fileHelp: "PDF أو صورة أو Word أو Excel أو نص، حتى 10 ميغابايت.", save: "حفظ كمسودة", uploading: "جارٍ الرفع…",
  publish: "نشر الإصدار", replace: "رفع إصدار جديد", replaceHelp: "تحتفظ المراجع الحالية بالإصدار الذي استخدمته.", retire: "إيقاف", cancel: "إلغاء",
  answerKeyNote: "مفاتيح الإجابة للموظفين فقط دائماً.", history: "الإصدارات", changeAudience: "تغيير الجمهور", moreActions: "إجراءات أخرى", moreActionsFor: "إجراءات أخرى لـ {title}",
  staffTitle: "المصادر", retireTitle: "إيقاف هذا المصدر؟", retireBody: "يتوقف الطلاب والأسر عن رؤيته فوراً. تبقى إصداراته في السجل، ولا يمكن نشره مرة أخرى.", retireConfirm: "إيقاف المصدر", keep: "الإبقاء على المصدر", errorTitle: "تعذّر تحميل المصادر", retry: "حاول مرة أخرى",
};

const ur: ResourceCopy = {
  title: "تعلیمی وسائل", eyebrow: "کلاس لائبریری", staffSummary: "کلاس کا مواد واضح سامعین کے ساتھ شائع کریں۔ طلبہ صرف شائع شدہ ورژن دیکھتے ہیں۔",
  learnerSummary: "نوٹس، ہینڈ آؤٹس اور کورس روٹین جو آپ کے اساتذہ نے آپ کی کلاس سے شیئر کیں۔", guardianSummary: "وہ مواد جو آپ کے بچے کے اساتذہ نے والدین سے شیئر کیا۔",
  loading: "وسائل لوڈ ہو رہے ہیں…", failed: "وسائل لوڈ نہ ہو سکے۔", saved: "محفوظ ہو گیا۔", empty: "اس کلاس کے لیے ابھی کوئی وسیلہ نہیں۔", learnerEmpty: "ابھی آپ سے کچھ شیئر نہیں کیا گیا۔",
  class: "کلاس", search: "عنوانات تلاش کریں", view: "منظر", viewStaff: "عملے کا منظر", viewClass: "طلبہ کی نظر سے", viewGuardians: "والدین کی نظر سے",
  previewBanner: "پیش نظارہ — یہ سامعین ابھی بالکل یہی دیکھتے ہیں۔",
  kinds: { HANDOUT: "ہینڈ آؤٹ", NOTES: "نوٹس", ROUTINE: "کورس روٹین", WORKSHEET: "ورک شیٹ", ANSWER_KEY: "جوابی کلید (صرف عملہ)", OTHER: "دیگر" },
  audiences: { CLASS: "اس کلاس کے طلبہ", CLASS_AND_GUARDIANS: "طلبہ اور ان کے والدین", STAFF: "صرف عملہ" },
  statuses: { DRAFT: "مسودہ", PUBLISHED: "شائع شدہ", RETIRED: "ریٹائرڈ" },
  version: "ورژن", published: "شائع شدہ ورژن", latest: "تازہ ترین", notReady: "فائل اپ لوڈ نہیں ہوئی", open: "کھولیں", download: "ڈاؤن لوڈ",
  add: "وسیلہ شامل کریں", addTitle: "نیا وسیلہ", resourceTitle: "عنوان", kind: "قسم", audience: "کون دیکھ سکتا ہے", language: "زبان",
  description: "تفصیل اور قابلِ رسائی خلاصہ", descriptionHelp: "سب کو نظر آتا ہے؛ جو فائل نہ کھول سکے اس کے لیے مواد بیان کرتا ہے۔",
  sourceRights: "ماخذ اور اشتراک کے حقوق", sourceHelp: "مثلاً: ہمارے ریاضی شعبے کی تیار کردہ؛ ہمارے طلبہ سے شیئر کی جا سکتی ہے۔",
  file: "فائل", link: "یا https لنک", fileHelp: "PDF، تصویر، Word، Excel یا متن، 10 MB تک۔", save: "مسودہ محفوظ کریں", uploading: "اپ لوڈ ہو رہا ہے…",
  publish: "ورژن شائع کریں", replace: "نیا ورژن اپ لوڈ کریں", replaceHelp: "موجودہ حوالے اپنا استعمال شدہ ورژن برقرار رکھتے ہیں۔", retire: "ریٹائر کریں", cancel: "منسوخ",
  answerKeyNote: "جوابی کلید ہمیشہ صرف عملے کے لیے ہے۔", history: "ورژن", changeAudience: "سامعین تبدیل کریں", moreActions: "مزید اقدامات", moreActionsFor: "{title} کے لیے مزید اقدامات",
  staffTitle: "وسائل", retireTitle: "یہ وسیلہ ریٹائر کریں؟", retireBody: "طلبہ اور والدین اسے فوراً دیکھنا بند کر دیں گے۔ اس کے ورژن ریکارڈ میں رہیں گے، اور اسے دوبارہ شائع نہیں کیا جا سکے گا۔", retireConfirm: "وسیلہ ریٹائر کریں", keep: "وسیلہ رکھیں", errorTitle: "وسائل لوڈ نہ ہو سکے", retry: "دوبارہ کوشش کریں",
};

export function getResourceCopy(language: string): ResourceCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
