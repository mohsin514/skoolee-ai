const en = {
  title: "Objective map", eyebrow: "Curriculum", summary: "Learning objectives with what is planned, what teachers confirmed as taught and what was assessed — each with its evidence.",
  loading: "Loading the objective map…", failed: "The objective map could not be loaded.", saved: "Saved.", noCurricula: "No approved curriculum is available for your subjects yet. Approve one in the School AI workspace first.",
  curriculum: "Curriculum", version: "Version", pack: "Curriculum pack", authority: "Authority", edition: "Edition", language: "Language", board: "Board", year: "Academic year", sources: "Sources",
  rights: { APPROVED: "Source rights approved", UNDER_REVIEW: "Under evaluation", MANUAL: "Manual — not validated" }, rightsUnknown: "Pack details not recorded — treat as manual",
  structure: "Fix before approving", search: "Find objective", filter: "Show", filters: { all: "All objectives", notTaught: "Not yet taught", notAssessed: "Not yet assessed" },
  objectives: "Objectives", code: "Code", objective: "Objective", prerequisites: "Prerequisites", planned: "Planned", taught: "Taught", assessed: "Assessed", resources: "Resources",
  none: "None", topics: "Topics: {n}", lessons: "Confirmed: {n}", releases: "Released: {n}", resourceCount: "Linked: {n}", notIncluded: "Not included",
  evidence: "Evidence", plannedEvidence: "Planned syllabus topics", taughtEvidence: "Teacher-confirmed teaching", assessedEvidence: "Released assessments", resourceEvidence: "Linked resources", draftEvidence: "Draft papers (not evidence yet)",
  taughtOn: "taught {date}", questions: "questions: {n}", paperVersion: "paper v{n}",
  statusLine: { both: "Taught and assessed.", taughtOnly: "Taught (confirmed lessons: {n}); assessment evidence is still missing.", assessedOnly: "Assessed, but no teacher-confirmed teaching is recorded.", plannedOnly: "Planned only — not yet confirmed as taught.", nothing: "No teaching or assessment evidence yet." },
  noMastery: "Coverage shows what happened, not what learners mastered.",
  compare: "Compare versions", compareWith: "Compare with version", noCompare: "This is the first approved version.", added: "Added", changed: "Changed", retired: "Retired",
  impact: "Affected work", affectedPapers: "Unreleased papers that need review", noAffected: "No unreleased paper uses a changed objective.", preserved: "Released papers keep their original version",
  unmapped: "Unmapped — needs review", unmappedQuestions: "Questions without a valid objective", unmappedResources: "Class resources not linked to this curriculum", allMapped: "Everything is mapped.",
  mappings: "Mapping to other curricula", mappingHelp: "Objectives are never merged by matching titles or codes. Record an explicit decision.", from: "Objective here", target: "Other curriculum", targetObjective: "Objective there",
  relation: "Decision", relations: { SAME: "Same objective", PARTIAL: "Partly overlaps", NOT_EQUIVALENT: "Not equivalent" }, note: "Reason (optional)", record: "Record decision", decisions: "Current decisions", noDecisions: "No decisions recorded.", leadOnly: "Only a curriculum lead can record mapping decisions.",
  choose: "Choose…",
};
export type ObjectiveMapCopy = typeof en;

const ar: ObjectiveMapCopy = {
  title: "خريطة الأهداف", eyebrow: "المنهج", summary: "أهداف التعلّم مع ما خُطِّط له وما أكّد المعلمون تدريسه وما تم تقييمه — مع الدليل لكلٍّ منها.",
  loading: "جارٍ تحميل خريطة الأهداف…", failed: "تعذّر تحميل خريطة الأهداف.", saved: "تم الحفظ.", noCurricula: "لا يوجد منهج معتمد لموادك بعد. اعتمد منهجاً في مساحة الذكاء الاصطناعي أولاً.",
  curriculum: "المنهج", version: "الإصدار", pack: "حزمة المنهج", authority: "الجهة", edition: "الطبعة", language: "اللغة", board: "المجلس", year: "العام الدراسي", sources: "المصادر",
  rights: { APPROVED: "حقوق المصدر معتمدة", UNDER_REVIEW: "قيد التقييم", MANUAL: "يدوي — غير مُتحقَّق منه" }, rightsUnknown: "تفاصيل الحزمة غير مسجلة — تعامل معها كيدوية",
  structure: "يجب الإصلاح قبل الاعتماد", search: "ابحث عن هدف", filter: "عرض", filters: { all: "كل الأهداف", notTaught: "لم يُدرَّس بعد", notAssessed: "لم يُقيَّم بعد" },
  objectives: "الأهداف", code: "الرمز", objective: "الهدف", prerequisites: "المتطلبات السابقة", planned: "مخطط", taught: "مُدرَّس", assessed: "مُقيَّم", resources: "المصادر",
  none: "لا شيء", topics: "الموضوعات: {n}", lessons: "المؤكدة: {n}", releases: "المنشورة: {n}", resourceCount: "المرتبطة: {n}", notIncluded: "غير مُدرج",
  evidence: "الدليل", plannedEvidence: "موضوعات المنهج المخططة", taughtEvidence: "تدريس أكّده المعلم", assessedEvidence: "تقييمات منشورة", resourceEvidence: "مصادر مرتبطة", draftEvidence: "اختبارات مسودة (ليست دليلاً بعد)",
  taughtOn: "دُرِّس {date}", questions: "الأسئلة: {n}", paperVersion: "إصدار الاختبار {n}",
  statusLine: { both: "دُرِّس وقُيِّم.", taughtOnly: "دُرِّس (الدروس المؤكدة: {n})؛ لا يوجد دليل تقييم بعد.", assessedOnly: "قُيِّم، لكن لا يوجد تدريس مؤكد من المعلم.", plannedOnly: "مخطط فقط — لم يتأكد تدريسه بعد.", nothing: "لا يوجد دليل تدريس أو تقييم بعد." },
  noMastery: "التغطية تُظهر ما حدث، لا ما أتقنه الطلاب.",
  compare: "مقارنة الإصدارات", compareWith: "قارن مع الإصدار", noCompare: "هذا أول إصدار معتمد.", added: "مُضاف", changed: "مُعدَّل", retired: "متقاعد",
  impact: "الأعمال المتأثرة", affectedPapers: "اختبارات غير منشورة تحتاج إلى مراجعة", noAffected: "لا يستخدم أي اختبار غير منشور هدفاً معدلاً.", preserved: "تحتفظ الاختبارات المنشورة بإصدارها الأصلي",
  unmapped: "غير مربوط — يحتاج إلى مراجعة", unmappedQuestions: "أسئلة بلا هدف صالح", unmappedResources: "مصادر الصف غير المرتبطة بهذا المنهج", allMapped: "كل شيء مربوط.",
  mappings: "الربط بمناهج أخرى", mappingHelp: "لا تُدمج الأهداف أبداً بسبب تطابق العناوين أو الرموز. سجّل قراراً صريحاً.", from: "الهدف هنا", target: "المنهج الآخر", targetObjective: "الهدف هناك",
  relation: "القرار", relations: { SAME: "الهدف نفسه", PARTIAL: "تداخل جزئي", NOT_EQUIVALENT: "غير مكافئ" }, note: "السبب (اختياري)", record: "سجّل القرار", decisions: "القرارات الحالية", noDecisions: "لا توجد قرارات مسجلة.", leadOnly: "يمكن لقائد المنهج فقط تسجيل قرارات الربط.",
  choose: "اختر…",
};

const ur: ObjectiveMapCopy = {
  title: "مقاصد کا نقشہ", eyebrow: "نصاب", summary: "تعلیمی مقاصد: کیا منصوبہ بند ہے، اساتذہ نے کیا پڑھانے کی تصدیق کی اور کیا جانچا گیا — ہر ایک کے ثبوت کے ساتھ۔",
  loading: "مقاصد کا نقشہ لوڈ ہو رہا ہے…", failed: "مقاصد کا نقشہ لوڈ نہ ہو سکا۔", saved: "محفوظ ہو گیا۔", noCurricula: "آپ کے مضامین کے لیے ابھی کوئی منظور شدہ نصاب نہیں۔ پہلے اسکول AI ورک اسپیس میں منظور کریں۔",
  curriculum: "نصاب", version: "ورژن", pack: "نصابی پیک", authority: "ادارہ", edition: "ایڈیشن", language: "زبان", board: "بورڈ", year: "تعلیمی سال", sources: "ماخذ",
  rights: { APPROVED: "ماخذ کے حقوق منظور", UNDER_REVIEW: "جائزہ جاری", MANUAL: "دستی — تصدیق شدہ نہیں" }, rightsUnknown: "پیک کی تفصیل درج نہیں — دستی سمجھیں",
  structure: "منظوری سے پہلے درست کریں", search: "مقصد تلاش کریں", filter: "دکھائیں", filters: { all: "تمام مقاصد", notTaught: "ابھی نہیں پڑھایا گیا", notAssessed: "ابھی نہیں جانچا گیا" },
  objectives: "مقاصد", code: "کوڈ", objective: "مقصد", prerequisites: "پیشگی ضروریات", planned: "منصوبہ بند", taught: "پڑھایا گیا", assessed: "جانچا گیا", resources: "وسائل",
  none: "کوئی نہیں", topics: "موضوعات: {n}", lessons: "تصدیق شدہ: {n}", releases: "جاری شدہ: {n}", resourceCount: "منسلک: {n}", notIncluded: "شامل نہیں",
  evidence: "ثبوت", plannedEvidence: "منصوبہ بند نصابی موضوعات", taughtEvidence: "استاد کی تصدیق شدہ تدریس", assessedEvidence: "جاری شدہ جانچ", resourceEvidence: "منسلک وسائل", draftEvidence: "مسودہ پرچے (ابھی ثبوت نہیں)",
  taughtOn: "پڑھایا {date}", questions: "سوالات: {n}", paperVersion: "پرچہ ورژن {n}",
  statusLine: { both: "پڑھایا اور جانچا گیا۔", taughtOnly: "پڑھایا گیا (تصدیق شدہ اسباق: {n})؛ جانچ کا ثبوت ابھی باقی ہے۔", assessedOnly: "جانچا گیا، مگر استاد کی تصدیق شدہ تدریس درج نہیں۔", plannedOnly: "صرف منصوبہ بند — پڑھانے کی تصدیق نہیں ہوئی۔", nothing: "ابھی تدریس یا جانچ کا کوئی ثبوت نہیں۔" },
  noMastery: "کوریج بتاتی ہے کیا ہوا، یہ نہیں کہ طلبہ نے کیا سیکھ لیا۔",
  compare: "ورژن کا موازنہ", compareWith: "اس ورژن سے موازنہ", noCompare: "یہ پہلا منظور شدہ ورژن ہے۔", added: "شامل", changed: "تبدیل", retired: "ختم",
  impact: "متاثرہ کام", affectedPapers: "غیر جاری پرچے جن کا جائزہ ضروری ہے", noAffected: "کوئی غیر جاری پرچہ تبدیل شدہ مقصد استعمال نہیں کرتا۔", preserved: "جاری شدہ پرچے اپنا اصل ورژن برقرار رکھتے ہیں",
  unmapped: "غیر منسلک — جائزہ درکار", unmappedQuestions: "درست مقصد کے بغیر سوالات", unmappedResources: "کلاس کے وسائل جو اس نصاب سے منسلک نہیں", allMapped: "سب کچھ منسلک ہے۔",
  mappings: "دوسرے نصاب سے ربط", mappingHelp: "مقاصد کو عنوان یا کوڈ ملنے پر کبھی ضم نہیں کیا جاتا۔ واضح فیصلہ درج کریں۔", from: "یہاں کا مقصد", target: "دوسرا نصاب", targetObjective: "وہاں کا مقصد",
  relation: "فیصلہ", relations: { SAME: "ایک ہی مقصد", PARTIAL: "جزوی مماثلت", NOT_EQUIVALENT: "مساوی نہیں" }, note: "وجہ (اختیاری)", record: "فیصلہ درج کریں", decisions: "موجودہ فیصلے", noDecisions: "کوئی فیصلہ درج نہیں۔", leadOnly: "صرف نصاب کے سربراہ ربط کے فیصلے درج کر سکتے ہیں۔",
  choose: "منتخب کریں…",
};

export function getObjectiveMapCopy(language: string): ObjectiveMapCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
export const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key) => key in values ? String(values[key]) : match);
