import type { Language } from "@/lib/locale/package";
import type { StudioCopyArea } from "./exam-studio-copy";

/**
 * Exam Studio shell copy (R22.1, R22.8, R22.9).
 *
 * The per-area convention established by task 1.4: this file is the shell's own table, so no two UI
 * tasks ever edit one copy module. It is registered once in `exam-studio-copy.ts`, and both
 * `exam-studio-copy.test.ts` and Property 37 enumerate it through that registry without being
 * edited.
 *
 * Three rules are load-bearing rather than stylistic:
 *
 * - **English, Arabic and Urdu arrive together.** `type Copy = typeof en` makes a missing or
 *   misspelled key a TypeScript error rather than a blank pill on an Arabic screen.
 * - **Numbered placeholders only.** `{0}`, `{1}` … are filled in place by `useUiText` in the
 *   browser and by `fillStudioCopy` on a server-rendered path, so Arabic and Urdu may move the
 *   parts around the sentence. No message is assembled by concatenating English fragments.
 * - **Nothing that is not interface copy lives here.** A person name, a record identifier, an
 *   authored item text, a server code and a candidate response are never translated (R22.3); they
 *   reach a message as a placeholder value and the shell wraps them in `<bdi dir="auto">`.
 *
 * The `action*` keys name a `StudioAction` in words, which is what lets the `empty` state name the
 * next action (R24.1) and the `permission` state name the permission required (R24.5) without
 * leaking the matrix's identifiers onto the screen.
 */
const en = {
  // Chrome
  title: "Exam Studio",
  scope: "Assessment authoring and delivery",
  description: "Seven connected spaces carry an assessment from its brief to a reviewed result.",
  rail: "Studio spaces",
  openSpace: "Open {0}",
  workspaceLink: "School AI workspace",
  examsLink: "Delivery and results",

  // The seven frozen spaces
  briefSpace: "Syllabus and brief",
  blueprintSpace: "Blueprint",
  reviewSpace: "Review desk",
  rehearsalSpace: "Rehearsal",
  examRoomSpace: "Exam Room",
  controlRoomSpace: "Control room",
  improveSpace: "Results and improvement",
  briefHint: "Mark what is taught, then answer one open decision at a time.",
  blueprintHint: "Sections, coverage, form set and languages.",
  reviewHint: "Items, keys, rubrics and their evidence.",
  rehearsalHint: "Checks, blockers and the repair path.",
  examRoomHint: "Release, sealed hash and assignment.",
  controlRoomHint: "Live sitting, as the server records it.",
  improveHint: "Results, feedback, practice and follow-up.",

  // Scope banner (R21.1: school, campus, class, subject, sitting)
  scopeTitle: "Current scope",
  scopeSchool: "School",
  scopeCampus: "Campus",
  scopeClass: "Class",
  scopeSubject: "Subject",
  scopeSitting: "Sitting",
  scopeMissing: "Not recorded yet",
  scopeChange: "Change scope",
  scopeDialogTitle: "Choose this studio's scope",
  scopeDialogHint: "Records you create stay attached to this campus, class and subject.",
  scopeApply: "Use this scope",
  scopeKeep: "Keep editing",
  scopeCampusField: "Campus for this studio",
  scopeSubjectField: "Class and subject",
  scopeAnyCampus: "Every campus you may read",
  scopeAnySubject: "Every subject you teach",

  // The eight interface states of Requirement 24
  loadingLabel: "Loading your studio scope",
  emptyTitle: "No saved assessment work in this scope",
  emptyBody: "Your next step is {0}.",
  errorTitle: "Your studio scope could not be loaded",
  retry: "Try again",
  retained: "Kept what you entered: {0}",
  permissionTitle: "This space needs a permission you do not hold",
  permissionBody: "Ask an administrator to grant {0}.",
  reconnectTitle: "Reconnecting to the studio",
  reconnectBody: "Last successful exchange at {0}.",
  reconnectNever: "No successful exchange yet in this session.",
  recoveredTitle: "Reconnected to the studio",
  recoveredBody: "Restored revision {0}.",
  recoveredRefused: "Refused by the server: {0}",
  recoveredClean: "Nothing you entered was refused.",
  partialTitle: "Studio readiness, space by space",
  outcomeReady: "Open now",
  outcomePending: "Arrives in a later slice",
  pendingTitle: "{0} is not available yet",
  pendingBody: "Nothing is lost. Every other space stays open, and this one appears as soon as its slice lands.",
  recordsLabel: "Saved records in this scope",

  // The persistent save-state region (R24.8) — never a transient notification alone
  saveTitle: "Unsaved studio scope",
  saveFields: "Not saved: {0}",
  saveFailedTitle: "This device refused to remember your scope",
  saveFailedBody: "Your scope still applies on this screen; it will not survive a reload.",
  discardMessage: "These fields are not saved: {0}",

  // Studio actions, named in words for the empty and permission states
  actionAuthorItem: "authoring an item",
  actionRunRehearsal: "running a rehearsal",
  actionApproveVersion: "approving a version",
  actionReadActiveAttempt: "reading a live attempt",
  actionReadUnreleasedResult: "reading an unreleased result",
};

type Copy = typeof en;

const ar: Copy = {
  title: "استوديو الامتحانات",
  scope: "تأليف التقييم وتقديمه",
  description: "سبع مساحات متصلة تنقل التقييم من موجزه إلى نتيجة مراجَعة.",
  rail: "مساحات الاستوديو",
  openSpace: "افتح {0}",
  workspaceLink: "مساحة المدرسة الذكية",
  examsLink: "التقديم والنتائج",

  briefSpace: "المنهج والموجز",
  blueprintSpace: "مخطط التقييم",
  reviewSpace: "مكتب المراجعة",
  rehearsalSpace: "التجربة",
  examRoomSpace: "قاعة الامتحان",
  controlRoomSpace: "غرفة المتابعة",
  improveSpace: "النتائج والتحسين",
  briefHint: "حدّد ما دُرِّس، ثم أجب عن قرار مفتوح واحد في كل مرة.",
  blueprintHint: "الأقسام والتغطية ومجموعة النماذج واللغات.",
  reviewHint: "العناصر والمفاتيح ومعايير التصحيح وأدلتها.",
  rehearsalHint: "الفحوص والعوائق ومسار الإصلاح.",
  examRoomHint: "الإصدار والبصمة المختومة والتكليف.",
  controlRoomHint: "الجلسة الجارية كما يسجلها الخادم.",
  improveHint: "النتائج والتغذية الراجعة والتدريب والمتابعة.",

  scopeTitle: "النطاق الحالي",
  scopeSchool: "المدرسة",
  scopeCampus: "الفرع",
  scopeClass: "الصف",
  scopeSubject: "المادة",
  scopeSitting: "الجلسة",
  scopeMissing: "لم يُسجَّل بعد",
  scopeChange: "تغيير النطاق",
  scopeDialogTitle: "اختر نطاق هذا الاستوديو",
  scopeDialogHint: "تبقى السجلات التي تنشئها مرتبطة بهذا الفرع والصف والمادة.",
  scopeApply: "استخدم هذا النطاق",
  scopeKeep: "تابع التعديل",
  scopeCampusField: "فرع هذا الاستوديو",
  scopeSubjectField: "الصف والمادة",
  scopeAnyCampus: "كل فرع يمكنك قراءته",
  scopeAnySubject: "كل مادة تدرّسها",

  loadingLabel: "جارٍ تحميل نطاق الاستوديو",
  emptyTitle: "لا يوجد عمل تقييم محفوظ في هذا النطاق",
  emptyBody: "خطوتك التالية هي {0}.",
  errorTitle: "تعذّر تحميل نطاق الاستوديو",
  retry: "أعد المحاولة",
  retained: "تم الاحتفاظ بما أدخلته: {0}",
  permissionTitle: "تحتاج هذه المساحة إلى صلاحية لا تملكها",
  permissionBody: "اطلب من المسؤول منحك {0}.",
  reconnectTitle: "جارٍ إعادة الاتصال بالاستوديو",
  reconnectBody: "آخر تبادل ناجح في {0}.",
  reconnectNever: "لا تبادل ناجح بعد في هذه الجلسة.",
  recoveredTitle: "تم استعادة الاتصال بالاستوديو",
  recoveredBody: "تمت استعادة المراجعة {0}.",
  recoveredRefused: "رفض الخادم: {0}",
  recoveredClean: "لم يُرفض أي شيء أدخلته.",
  partialTitle: "جاهزية الاستوديو مساحةً بمساحة",
  outcomeReady: "متاحة الآن",
  outcomePending: "تصل في مرحلة لاحقة",
  pendingTitle: "{0} غير متاحة بعد",
  pendingBody: "لا شيء يُفقد. تبقى كل مساحة أخرى مفتوحة، وتظهر هذه بمجرد وصول مرحلتها.",
  recordsLabel: "السجلات المحفوظة في هذا النطاق",

  saveTitle: "نطاق استوديو غير محفوظ",
  saveFields: "غير محفوظ: {0}",
  saveFailedTitle: "رفض هذا الجهاز تذكّر نطاقك",
  saveFailedBody: "لا يزال نطاقك ساريًا على هذه الشاشة، لكنه لن يبقى بعد إعادة التحميل.",
  discardMessage: "هذه الحقول غير محفوظة: {0}",

  actionAuthorItem: "تأليف عنصر",
  actionRunRehearsal: "تشغيل تجربة",
  actionApproveVersion: "اعتماد إصدار",
  actionReadActiveAttempt: "قراءة محاولة جارية",
  actionReadUnreleasedResult: "قراءة نتيجة غير معلنة",
};

const ur: Copy = {
  title: "امتحان اسٹوڈیو",
  scope: "جائزے کی تیاری اور انعقاد",
  description: "سات منسلک حصے جائزے کو اس کے خاکے سے جانچے گئے نتیجے تک لے جاتے ہیں۔",
  rail: "اسٹوڈیو کے حصے",
  openSpace: "{0} کھولیں",
  workspaceLink: "اسکول اے آئی ورک اسپیس",
  examsLink: "انعقاد اور نتائج",

  briefSpace: "نصاب اور خاکہ",
  blueprintSpace: "جائزے کا نقشہ",
  reviewSpace: "جائزہ میز",
  rehearsalSpace: "مشق",
  examRoomSpace: "امتحانی کمرہ",
  controlRoomSpace: "نگرانی کا کمرہ",
  improveSpace: "نتائج اور بہتری",
  briefHint: "پڑھایا گیا حصہ نشان زد کریں، پھر ایک وقت میں ایک کھلا فیصلہ طے کریں۔",
  blueprintHint: "حصے، احاطہ، پرچوں کا مجموعہ اور زبانیں۔",
  reviewHint: "سوالات، کلیدیں، معیارات اور ان کے شواہد۔",
  rehearsalHint: "جانچ، رکاوٹیں اور درستی کا راستہ۔",
  examRoomHint: "اجرا، مہر شدہ نشان اور تفویض۔",
  controlRoomHint: "جاری نشست، جیسا سرور درج کرتا ہے۔",
  improveHint: "نتائج، رائے، مشق اور آئندہ قدم۔",

  scopeTitle: "موجودہ دائرہ",
  scopeSchool: "اسکول",
  scopeCampus: "کیمپس",
  scopeClass: "کلاس",
  scopeSubject: "مضمون",
  scopeSitting: "نشست",
  scopeMissing: "ابھی درج نہیں",
  scopeChange: "دائرہ تبدیل کریں",
  scopeDialogTitle: "اس اسٹوڈیو کا دائرہ منتخب کریں",
  scopeDialogHint: "آپ کے بنائے ہوئے ریکارڈ اسی کیمپس، کلاس اور مضمون سے جڑے رہتے ہیں۔",
  scopeApply: "یہی دائرہ استعمال کریں",
  scopeKeep: "ترمیم جاری رکھیں",
  scopeCampusField: "اس اسٹوڈیو کا کیمپس",
  scopeSubjectField: "کلاس اور مضمون",
  scopeAnyCampus: "ہر وہ کیمپس جو آپ دیکھ سکتے ہیں",
  scopeAnySubject: "ہر وہ مضمون جو آپ پڑھاتے ہیں",

  loadingLabel: "اسٹوڈیو کا دائرہ لوڈ ہو رہا ہے",
  emptyTitle: "اس دائرے میں محفوظ جائزہ کام نہیں",
  emptyBody: "آپ کا اگلا قدم {0} ہے۔",
  errorTitle: "اسٹوڈیو کا دائرہ لوڈ نہیں ہو سکا",
  retry: "دوبارہ کوشش کریں",
  retained: "آپ کا درج کردہ محفوظ رہا: {0}",
  permissionTitle: "اس حصے کے لیے وہ اجازت درکار ہے جو آپ کے پاس نہیں",
  permissionBody: "منتظم سے {0} کی اجازت لیں۔",
  reconnectTitle: "اسٹوڈیو سے دوبارہ رابطہ ہو رہا ہے",
  reconnectBody: "آخری کامیاب رابطہ {0} پر ہوا۔",
  reconnectNever: "اس نشست میں ابھی کوئی کامیاب رابطہ نہیں ہوا۔",
  recoveredTitle: "اسٹوڈیو سے رابطہ بحال ہو گیا",
  recoveredBody: "نسخہ {0} بحال ہو گیا۔",
  recoveredRefused: "سرور نے مسترد کیا: {0}",
  recoveredClean: "آپ کا درج کردہ کچھ بھی مسترد نہیں ہوا۔",
  partialTitle: "اسٹوڈیو کی تیاری، ہر حصہ الگ",
  outcomeReady: "ابھی کھلا ہے",
  outcomePending: "آگے کے مرحلے میں آئے گا",
  pendingTitle: "{0} ابھی دستیاب نہیں",
  pendingBody: "کچھ ضائع نہیں ہوتا۔ باقی ہر حصہ کھلا رہتا ہے، اور یہ حصہ اپنے مرحلے کے آتے ہی ظاہر ہو جائے گا۔",
  recordsLabel: "اس دائرے کے محفوظ ریکارڈ",

  saveTitle: "غیر محفوظ اسٹوڈیو دائرہ",
  saveFields: "محفوظ نہیں: {0}",
  saveFailedTitle: "اس ڈیوائس نے آپ کا دائرہ یاد رکھنے سے انکار کیا",
  saveFailedBody: "آپ کا دائرہ اس اسکرین پر لاگو ہے، مگر دوبارہ لوڈ کرنے پر باقی نہیں رہے گا۔",
  discardMessage: "یہ خانے محفوظ نہیں: {0}",

  actionAuthorItem: "سوال تیار کرنا",
  actionRunRehearsal: "مشق چلانا",
  actionApproveVersion: "نسخہ منظور کرنا",
  actionReadActiveAttempt: "جاری کوشش دیکھنا",
  actionReadUnreleasedResult: "غیر جاری نتیجہ دیکھنا",
};

export const STUDIO_SHELL_COPY: StudioCopyArea<Copy> = { area: "shell", en, ar, ur };
/**
 * Resolved inline rather than through the index's `pickStudioCopy`, so this module imports only a
 * type from the index and the registry's import of this file stays a one-way edge. The index
 * evaluates `EXAM_STUDIO_COPY_AREAS` at module initialization, and a runtime cycle there would make
 * the registry's contents depend on which file a caller imported first.
 */
export const studioShellSpaceCopy = (language: Language): Copy => (language === "ar" ? ar : language === "ur" ? ur : en);
export type StudioShellCopy = Copy;
