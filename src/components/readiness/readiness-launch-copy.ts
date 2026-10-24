/** Strings for the readiness "launch control" layout (ReadinessHome); the base copy lives in readiness-copy.ts. */
type CheckKey = "campus" | "locale" | "academic" | "staff" | "roster" | "imports" | "guardians" | "fees" | "rehearsal";
type PhaseKey = "foundation" | "people" | "money" | "rehearse";

export type LaunchCopy = {
  progress: string;          // "{0} of {1} required checks done"
  percentLabel: string;      // "ready"
  nextEyebrow: string;
  allDoneTitle: string;
  allDoneBody: string;
  goApprove: string;
  phases: Record<PhaseKey, string>;
  why: Record<CheckKey, string>;
  delegated: string;          // group admin: campus-level work done by each campus admin
  handledElsewhere: string;   // any other viewer without a screen for the check
  optionalTag: string;
  doneTag: string;
  todoTag: string;
  liveTitle: string;
  liveBody: string;
  approveBar: string;
  practiceHint: string;
  sectionsLabel: string;
  nav: { checks: string; practice: string; reconcile: string; tasks: string };
};

const en: LaunchCopy = {
  progress: "{0} of {1} required checks done",
  percentLabel: "ready",
  nextEyebrow: "Next step",
  allDoneTitle: "Everything required is done",
  allDoneBody: "Review the follow-ups, then approve go-live. Your approval records the checks and every open follow-up.",
  goApprove: "Approve go-live",
  phases: { foundation: "Foundation", people: "People", money: "Money & data", rehearse: "Rehearse" },
  why: {
    campus: "Every class, pupil and fee belongs to a campus.",
    locale: "Dates, report cards and receipts follow the school's language, timezone and currency.",
    academic: "Attendance and marks are filed under an active session and a class.",
    staff: "A class needs a teacher before the first lesson can be taken.",
    roster: "Pupils on the roll are who attendance, marks and fees are for.",
    imports: "Staged imports are not in the system until someone accepts or rejects each row.",
    guardians: "Families only see attendance, results and fees through a verified guardian link.",
    fees: "Invoices and receipts need a fee structure to start from.",
    rehearsal: "A safe practice run of a real school day, with synthetic learners.",
  },
  delegated: "Done by each campus admin in their campus console. Open a campus from Campuses.",
  handledElsewhere: "Your campus admin completes this step in their console. It turns green here once it is done.",
  optionalTag: "Optional",
  doneTag: "Done",
  todoTag: "To do",
  liveTitle: "Your school is live",
  liveBody: "Readiness was approved. Follow-ups stay here until they are done.",
  approveBar: "All required checks are done.",
  practiceHint: "Runs on your real classes with synthetic learners. Nothing is saved, sent or charged.",
  sectionsLabel: "Readiness sections",
  nav: { checks: "Checks", practice: "Practice", reconcile: "Reconcile", tasks: "Follow-ups" },
};

const ar: LaunchCopy = {
  progress: "{0} من {1} فحوص مطلوبة مكتملة",
  percentLabel: "جاهز",
  nextEyebrow: "الخطوة التالية",
  allDoneTitle: "اكتمل كل ما هو مطلوب",
  allDoneBody: "راجع المتابعات ثم اعتمد التشغيل. يسجّل اعتمادك الفحوص وكل متابعة مفتوحة.",
  goApprove: "اعتماد التشغيل",
  phases: { foundation: "الأساس", people: "الأشخاص", money: "المال والبيانات", rehearse: "التدريب" },
  why: {
    campus: "كل صف وطالب ورسوم ينتمي إلى فرع.",
    locale: "التواريخ والشهادات والإيصالات تتبع لغة المدرسة ومنطقتها الزمنية وعملتها.",
    academic: "يُسجّل الحضور والدرجات ضمن دورة نشطة وصف.",
    staff: "يحتاج الصف إلى معلم قبل أول حصة.",
    roster: "الطلاب المسجّلون هم من يُسجّل لهم الحضور والدرجات والرسوم.",
    imports: "الاستيرادات المعلّقة ليست في النظام حتى يُقبل كل صف أو يُرفض.",
    guardians: "لا ترى الأسر الحضور والنتائج والرسوم إلا عبر ولي أمر موثّق.",
    fees: "تحتاج الفواتير والإيصالات إلى هيكل رسوم تبدأ منه.",
    rehearsal: "تدريب آمن على يوم دراسي حقيقي بطلاب افتراضيين.",
  },
  delegated: "يُنجزه مدير كل فرع في لوحة الفرع. افتح فرعاً من قائمة الفروع.",
  handledElsewhere: "يُكمل مدير الفرع هذه الخطوة في لوحته. تظهر هنا مكتملة بعد إنجازها.",
  optionalTag: "اختياري",
  doneTag: "مكتمل",
  todoTag: "مطلوب",
  liveTitle: "مدرستك تعمل الآن",
  liveBody: "تم اعتماد الجاهزية. تبقى المتابعات هنا حتى تكتمل.",
  approveBar: "اكتملت كل الفحوص المطلوبة.",
  practiceHint: "يعمل على صفوفك الحقيقية بطلاب افتراضيين. لا يُحفظ أو يُرسل أو يُحصَّل أي شيء.",
  sectionsLabel: "أقسام الجاهزية",
  nav: { checks: "الفحوص", practice: "التدريب", reconcile: "المطابقة", tasks: "المتابعات" },
};

const ur: LaunchCopy = {
  progress: "{1} میں سے {0} لازمی جانچیں مکمل",
  percentLabel: "تیار",
  nextEyebrow: "اگلا قدم",
  allDoneTitle: "تمام لازمی کام مکمل",
  allDoneBody: "فالو اپس دیکھیں، پھر گو لائیو کی منظوری دیں۔ آپ کی منظوری جانچیں اور ہر کھلا فالو اپ ریکارڈ کرتی ہے۔",
  goApprove: "گو لائیو کی منظوری",
  phases: { foundation: "بنیاد", people: "لوگ", money: "رقم اور ڈیٹا", rehearse: "مشق" },
  why: {
    campus: "ہر جماعت، طالب علم اور فیس کسی کیمپس سے متعلق ہوتی ہے۔",
    locale: "تاریخیں، رپورٹ کارڈ اور رسیدیں اسکول کی زبان، ٹائم زون اور کرنسی پر چلتی ہیں۔",
    academic: "حاضری اور نمبر فعال سیشن اور جماعت میں درج ہوتے ہیں۔",
    staff: "پہلی کلاس سے پہلے جماعت کو استاد چاہیے۔",
    roster: "داخل طلبہ ہی کی حاضری، نمبر اور فیس ہوتی ہے۔",
    imports: "زیرِ التوا امپورٹس تب تک سسٹم میں نہیں جب تک ہر قطار قبول یا رد نہ ہو۔",
    guardians: "والدین حاضری، نتائج اور فیس صرف تصدیق شدہ سرپرست کے ذریعے دیکھتے ہیں۔",
    fees: "انوائس اور رسید کے لیے فیس کا ڈھانچہ ضروری ہے۔",
    rehearsal: "فرضی طلبہ کے ساتھ حقیقی اسکول کے دن کی محفوظ مشق۔",
  },
  delegated: "ہر کیمپس منتظم اپنے کیمپس کنسول میں کرتا ہے۔ کیمپسز سے کیمپس کھولیں۔",
  handledElsewhere: "آپ کا کیمپس منتظم یہ مرحلہ اپنے کنسول میں مکمل کرتا ہے۔ مکمل ہونے پر یہ یہاں سبز ہو جاتا ہے۔",
  optionalTag: "اختیاری",
  doneTag: "مکمل",
  todoTag: "باقی",
  liveTitle: "آپ کا اسکول فعال ہے",
  liveBody: "تیاری کی منظوری ہو چکی۔ فالو اپس مکمل ہونے تک یہاں رہیں گے۔",
  approveBar: "تمام لازمی جانچیں مکمل ہیں۔",
  practiceHint: "آپ کی حقیقی جماعتوں پر فرضی طلبہ کے ساتھ چلتی ہے۔ کچھ محفوظ، ارسال یا وصول نہیں ہوتا۔",
  sectionsLabel: "تیاری کے حصے",
  nav: { checks: "جانچیں", practice: "مشق", reconcile: "مطابقت", tasks: "فالو اپس" },
};

export function getLaunchCopy(language: string): LaunchCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
