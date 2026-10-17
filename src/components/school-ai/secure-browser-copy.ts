import type { AssessmentLocale } from "@/lib/school-ai/assessment";

// SKO-449 copy. Precise about what Safe Exam Browser checks and what it cannot do.
const en = {
  required: "This exam must be opened in Safe Exam Browser", admittedSeb: "Opened in Safe Exam Browser with the approved configuration",
  admittedAlternative: "Supervised alternative approved for you — sit this exam under staff supervision",
  reasons: { MISSING_HEADERS: "This browser is not Safe Exam Browser, or it did not send its configuration check.", CONFIG_MISMATCH: "This Safe Exam Browser configuration is not approved for this exam. Download the exam configuration and open it again.", CLIENT_MISMATCH: "This Safe Exam Browser version or device is not approved for this exam.", NO_EVIDENCE: "The configuration could not be checked. Reload the exam in Safe Exam Browser." },
  noTimer: "No timer has started. Your exam time begins only after the check passes.", profile: "Approved profile", minVersion: "Minimum client version",
  download: "Download exam configuration (.seb)", help: "If your device or assistive tool is not supported, ask the invigilator for a supervised alternative.",
  limits: "Safe Exam Browser restricts this device only. It does not control other devices, phones or the physical room, and a passed check is not proof that nobody cheated.",
  // coordinator
  title: "Exam delivery profiles", summary: "Tested Safe Exam Browser profiles for secure exams. Only keys reported by a tested client are trusted.",
  name: "Profile name", minClient: "Minimum SEB version", configKeys: "Config Keys (one per line)", examKeys: "Browser Exam Keys (one per line)", keysHelp: "Copy the 64-character keys from the SEB Config Tool after testing this configuration.",
  resources: "Allowed resources (https, one per line)", devices: "Tested devices", platform: "Platform", clientVersion: "Client version", testedOn: "Tested on", result: "Result", tools: "Assistive tools tested (comma-separated)", addDevice: "Add tested device",
  cancel: "Cancel", save: "Save draft version", approve: "Approve", retire: "Retire", statuses: { DRAFT: "Draft", APPROVED: "Approved", RETIRED: "Retired" }, version: "Version", none: "No profiles yet.", newProfile: "New profile", edit: "New version",
  noKeys: "No keys recorded", saved: "Saved.", failed: "Could not complete the request.",
  mode: "Delivery", modes: { STANDARD: "Standard browser", SECURE_BROWSER: "Safe Exam Browser (approved profile)" }, chooseProfile: "Secure browser profile",
  alternative: "Supervised alternative", alternativeHelp: "For an unsupported device or assistive tool. Recorded with your name and reason; never a silent downgrade.", reason: "Reason", grant: "Approve supervised alternative", granted: "Supervised alternative approved",
};
type Copy = typeof en;
const ar: Copy = {
  required: "يجب فتح هذا الامتحان في متصفح الامتحان الآمن (Safe Exam Browser)", admittedSeb: "فُتح في Safe Exam Browser بالإعداد المعتمد",
  admittedAlternative: "تمت الموافقة على بديل تحت الإشراف — قدّم هذا الامتحان بإشراف الموظفين",
  reasons: { MISSING_HEADERS: "هذا المتصفح ليس Safe Exam Browser، أو لم يرسل فحص الإعداد.", CONFIG_MISMATCH: "إعداد Safe Exam Browser هذا غير معتمد لهذا الامتحان. نزّل إعداد الامتحان وافتحه مجدداً.", CLIENT_MISMATCH: "إصدار Safe Exam Browser أو الجهاز غير معتمد لهذا الامتحان.", NO_EVIDENCE: "تعذّر فحص الإعداد. أعد تحميل الامتحان في Safe Exam Browser." },
  noTimer: "لم يبدأ أي مؤقت. يبدأ وقت امتحانك فقط بعد نجاح الفحص.", profile: "الملف المعتمد", minVersion: "أدنى إصدار للعميل",
  download: "تنزيل إعداد الامتحان (.seb)", help: "إن لم يكن جهازك أو أداتك المساعدة مدعوماً، اطلب من المراقب بديلاً تحت الإشراف.",
  limits: "يقيّد Safe Exam Browser هذا الجهاز فقط. لا يتحكم في الأجهزة الأخرى أو الهواتف أو القاعة، ونجاح الفحص ليس دليلاً على عدم الغش.",
  title: "ملفات تقديم الامتحان", summary: "ملفات Safe Exam Browser مُختبرة للامتحانات الآمنة. لا يُوثق إلا بالمفاتيح التي يبلغ عنها عميل مُختبر.",
  name: "اسم الملف", minClient: "أدنى إصدار SEB", configKeys: "مفاتيح الإعداد (سطر لكل مفتاح)", examKeys: "مفاتيح امتحان المتصفح (سطر لكل مفتاح)", keysHelp: "انسخ المفاتيح المكونة من 64 حرفاً من أداة إعداد SEB بعد اختبار هذا الإعداد.",
  resources: "الموارد المسموحة (https، سطر لكل مورد)", devices: "الأجهزة المُختبرة", platform: "النظام", clientVersion: "إصدار العميل", testedOn: "تاريخ الاختبار", result: "النتيجة", tools: "الأدوات المساعدة المُختبرة (مفصولة بفواصل)", addDevice: "إضافة جهاز مُختبر",
  cancel: "إلغاء", save: "حفظ إصدار مسودة", approve: "اعتماد", retire: "إيقاف", statuses: { DRAFT: "مسودة", APPROVED: "معتمد", RETIRED: "موقوف" }, version: "الإصدار", none: "لا توجد ملفات بعد.", newProfile: "ملف جديد", edit: "إصدار جديد",
  noKeys: "لا توجد مفاتيح مسجلة", saved: "تم الحفظ.", failed: "تعذّر إكمال الطلب.",
  mode: "طريقة التقديم", modes: { STANDARD: "متصفح عادي", SECURE_BROWSER: "Safe Exam Browser (ملف معتمد)" }, chooseProfile: "ملف المتصفح الآمن",
  alternative: "بديل تحت الإشراف", alternativeHelp: "لجهاز أو أداة مساعدة غير مدعومة. يُسجَّل باسمك والسبب؛ وليس خفضاً صامتاً للمستوى.", reason: "السبب", grant: "اعتماد بديل تحت الإشراف", granted: "تم اعتماد بديل تحت الإشراف",
};
const ur: Copy = {
  required: "یہ امتحان Safe Exam Browser میں کھولنا لازمی ہے", admittedSeb: "منظور شدہ ترتیب کے ساتھ Safe Exam Browser میں کھولا گیا",
  admittedAlternative: "آپ کے لیے نگرانی میں متبادل منظور — یہ امتحان عملے کی نگرانی میں دیں",
  reasons: { MISSING_HEADERS: "یہ براؤزر Safe Exam Browser نہیں، یا اس نے اپنی ترتیب کی جانچ نہیں بھیجی۔", CONFIG_MISMATCH: "یہ Safe Exam Browser ترتیب اس امتحان کے لیے منظور نہیں۔ امتحان کی ترتیب ڈاؤن لوڈ کر کے دوبارہ کھولیں۔", CLIENT_MISMATCH: "یہ Safe Exam Browser ورژن یا ڈیوائس اس امتحان کے لیے منظور نہیں۔", NO_EVIDENCE: "ترتیب کی جانچ نہ ہو سکی۔ امتحان Safe Exam Browser میں دوبارہ لوڈ کریں۔" },
  noTimer: "کوئی ٹائمر شروع نہیں ہوا۔ جانچ کامیاب ہونے کے بعد ہی آپ کا وقت شروع ہوگا۔", profile: "منظور شدہ پروفائل", minVersion: "کم از کم کلائنٹ ورژن",
  download: "امتحان کی ترتیب ڈاؤن لوڈ کریں (.seb)", help: "اگر آپ کی ڈیوائس یا معاون آلہ سپورٹ نہیں تو نگران سے نگرانی میں متبادل کی درخواست کریں۔",
  limits: "Safe Exam Browser صرف اسی ڈیوائس کو محدود کرتا ہے۔ یہ دوسری ڈیوائسز، فون یا کمرے کو کنٹرول نہیں کرتا، اور کامیاب جانچ اس بات کا ثبوت نہیں کہ کسی نے نقل نہیں کی۔",
  title: "امتحان کی ترسیل کے پروفائل", summary: "محفوظ امتحانات کے لیے آزمودہ Safe Exam Browser پروفائل۔ صرف آزمودہ کلائنٹ کی بتائی گئی کیز پر اعتماد کیا جاتا ہے۔",
  name: "پروفائل کا نام", minClient: "کم از کم SEB ورژن", configKeys: "کنفیگ کیز (ہر لائن میں ایک)", examKeys: "براؤزر ایگزام کیز (ہر لائن میں ایک)", keysHelp: "اس ترتیب کو آزمانے کے بعد SEB Config Tool سے 64 حروف والی کیز نقل کریں۔",
  resources: "اجازت یافتہ وسائل (https، ہر لائن میں ایک)", devices: "آزمودہ ڈیوائسز", platform: "پلیٹ فارم", clientVersion: "کلائنٹ ورژن", testedOn: "تاریخِ جانچ", result: "نتیجہ", tools: "آزمودہ معاون آلات (کاما سے الگ)", addDevice: "آزمودہ ڈیوائس شامل کریں",
  cancel: "منسوخ", save: "مسودہ ورژن محفوظ کریں", approve: "منظور کریں", retire: "ریٹائر کریں", statuses: { DRAFT: "مسودہ", APPROVED: "منظور شدہ", RETIRED: "ریٹائرڈ" }, version: "ورژن", none: "ابھی کوئی پروفائل نہیں۔", newProfile: "نیا پروفائل", edit: "نیا ورژن",
  noKeys: "کوئی کیز درج نہیں", saved: "محفوظ ہو گیا۔", failed: "درخواست مکمل نہ ہو سکی۔",
  mode: "ترسیل", modes: { STANDARD: "عام براؤزر", SECURE_BROWSER: "Safe Exam Browser (منظور شدہ پروفائل)" }, chooseProfile: "محفوظ براؤزر پروفائل",
  alternative: "نگرانی میں متبادل", alternativeHelp: "غیر سپورٹڈ ڈیوائس یا معاون آلے کے لیے۔ آپ کے نام اور وجہ کے ساتھ درج ہوتا ہے؛ خاموش تنزلی کبھی نہیں۔", reason: "وجہ", grant: "نگرانی میں متبادل منظور کریں", granted: "نگرانی میں متبادل منظور",
};
export const secureBrowserCopy = (locale: AssessmentLocale | string): Copy => locale === "ar" ? ar : locale === "ur" ? ur : en;
