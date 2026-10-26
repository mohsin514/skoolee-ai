import type { AssessmentLocale } from "@/lib/school-ai/assessment";

// SKO-408: item review desk, rehearsal and release readiness.
const en = {
  solverTitle: "Independent review findings", solverRepair: "Correct the affected item in Create & review, then recheck and complete its review. Unchanged items keep their findings. A new independent check can replace an earlier finding.",
  regenerate: "Regenerate this item", regenerating: "Regenerating…", compareTitle: "Compare before you choose", previousItem: "Current item", candidateItem: "Regenerated item", changedFields: "Changed", noChange: "No field changed", acceptCandidate: "Use the regenerated item", keepPrevious: "Keep the current item",
  fieldLabels: { prompt: "Question", modelAnswer: "Model answer", options: "Options", correctOptionId: "Answer key", correctOptionIds: "Answer keys", numericKey: "Numeric key", marks: "Marks", rubric: "Rubric", figures: "Figures", outcomeIds: "Outcomes", sourceRefs: "Sources" },
  title: "Review, rehearse and release", intro: "Approve each item against its cited evidence, rehearse the exact version a learner will receive, then release. Nothing here publishes anything.",
  legacy: "This paper has not entered item review. It can still be assigned, sealed by its content hash, but without a recorded rehearsal.",
  states: { DRAFT: "Draft", NEEDS_SOURCE: "Needs source", NEEDS_CORRECTION: "Needs correction", READY_FOR_REVIEW: "Ready for review", APPROVED: "Approved", CHANGED_AFTER_APPROVAL: "Changed after approval" },
  recheck: "This item changed. I rechecked for this revision", artifacts: { KEY: "answer key", RUBRIC: "rubric", SEMANTIC_REVIEW: "independent review", FIGURE_CHECK: "figure", ITEM_APPROVAL: "approval", COVERAGE_CHECK: "coverage" },
  question: "Question", evidence: "Cited evidence", page: "page", ready: "Mark ready for review", correction: "Needs correction", approve: "Approve item", revision: "revision",
  hash: "Content hash", preview: "What the learner receives (no keys)", rehearse: "Rehearsal of this version", noRehearsal: "Not rehearsed yet.",
  report: "Report a defect", severity: "Severity", blocking: "Blocking", advisory: "Advisory", detail: "What is wrong", add: "Add finding", record: "Record rehearsal", findings: "Findings to record",
  results: "Rehearsal results", clean: "Rehearsal found no blocking issue.", blockers: "Release blockers", ready2: "Ready to release: every item approved and this version rehearsed clean.",
  saved: "Saved.", blockerText: { SOLVER_DISAGREEMENT: "Resolve the independent review disagreement", ITEM_NOT_APPROVED: "Approve every item before release", REHEARSAL_INVALID: "The recorded rehearsal no longer matches. Rehearse again", REHEARSAL_BLOCKER: "Blocking rehearsal finding", NOT_REHEARSED: "Rehearse this exact version before release" }, failed: "Could not complete the request.", checks: { SOLVER_DISAGREEMENT: "Independent review finding", KEY_MISSING: "Missing key", OPTIONS_TOO_FEW: "Too few options", PROJECTION_LEAK: "Key in learner paper", SECTION_COUNT: "Section count", REPORTED_DEFECT: "Reported defect", MARKS_DO_NOT_ADD_UP: "Marks do not add up", OPTION_TEXT_EMPTY: "Empty option text", PRINT_LENGTH: "Long when printed", TAUGHT_AFTER_SITTING: "Not taught by the sitting" },
  // exam
  sealed: "Sealed paper", exitSeb: "Exit Safe Exam Browser", releaseResults: "Release results to learners", released: "Results released", releaseHint: "Learners and families see moderated results only after this release.",
};
type Copy = typeof en;
const ar: Copy = {
  solverTitle: "نتائج المراجعة المستقلة", solverRepair: "صحّح السؤال المعني في الإنشاء والمراجعة، ثم أعد فحصه وأكمل مراجعته. تحتفظ الأسئلة غير المعدّلة بملاحظاتها. يمكن لفحص مستقل جديد أن يحل محل ملاحظة سابقة.",
  regenerate: "أعد توليد هذا البند", regenerating: "جارٍ إعادة التوليد…", compareTitle: "قارن قبل أن تختار", previousItem: "البند الحالي", candidateItem: "البند المُعاد توليده", changedFields: "ما تغيّر", noChange: "لم يتغيّر أي حقل", acceptCandidate: "استخدم البند المُعاد توليده", keepPrevious: "أبقِ البند الحالي",
  fieldLabels: { prompt: "السؤال", modelAnswer: "الإجابة النموذجية", options: "الخيارات", correctOptionId: "مفتاح الإجابة", correctOptionIds: "مفاتيح الإجابة", numericKey: "المفتاح الرقمي", marks: "الدرجات", rubric: "سلم التقدير", figures: "الأشكال", outcomeIds: "نواتج التعلم", sourceRefs: "المصادر" },
  title: "المراجعة والتجربة والإصدار", intro: "اعتمد كل سؤال مقابل الدليل المستشهد به، وجرّب النسخة نفسها التي سيستلمها الطالب، ثم أصدرها. لا شيء هنا يُنشر.",
  legacy: "لم تدخل هذه الورقة مراجعة الأسئلة. يمكن إسنادها ومختومة ببصمة المحتوى، لكن دون تجربة مسجلة.",
  states: { DRAFT: "مسودة", NEEDS_SOURCE: "يحتاج مصدراً", NEEDS_CORRECTION: "يحتاج تصحيحاً", READY_FOR_REVIEW: "جاهز للمراجعة", APPROVED: "معتمد", CHANGED_AFTER_APPROVAL: "تغيّر بعد الاعتماد" },
  recheck: "تغيّر هذا السؤال. أعدتُ التحقق لهذه المراجعة من", artifacts: { KEY: "مفتاح الإجابة", RUBRIC: "معايير التصحيح", SEMANTIC_REVIEW: "المراجعة المستقلة", FIGURE_CHECK: "الشكل", ITEM_APPROVAL: "الاعتماد", COVERAGE_CHECK: "التغطية" },
  question: "السؤال", evidence: "الدليل المستشهد به", page: "صفحة", ready: "جاهز للمراجعة", correction: "يحتاج تصحيحاً", approve: "اعتماد السؤال", revision: "مراجعة",
  hash: "بصمة المحتوى", preview: "ما يستلمه الطالب (دون مفاتيح)", rehearse: "تجربة هذه النسخة", noRehearsal: "لم تُجرَّب بعد.",
  report: "الإبلاغ عن خلل", severity: "الخطورة", blocking: "مانع", advisory: "استشاري", detail: "ما المشكلة", add: "إضافة ملاحظة", record: "تسجيل التجربة", findings: "ملاحظات للتسجيل",
  results: "نتائج التجربة", clean: "لم تجد التجربة أي مشكلة مانعة.", blockers: "موانع الإصدار", ready2: "جاهز للإصدار: كل الأسئلة معتمدة وهذه النسخة جُرّبت دون موانع.",
  saved: "تم الحفظ.", blockerText: { SOLVER_DISAGREEMENT: "عالج الاختلاف في المراجعة المستقلة", ITEM_NOT_APPROVED: "اعتمد كل سؤال قبل الإصدار", REHEARSAL_INVALID: "التجربة المسجلة لم تعد مطابقة. أعد التجربة", REHEARSAL_BLOCKER: "ملاحظة تجربة مانعة", NOT_REHEARSED: "جرّب هذه النسخة نفسها قبل الإصدار" }, failed: "تعذّر إكمال الطلب.", checks: { SOLVER_DISAGREEMENT: "ملاحظة المراجعة المستقلة", KEY_MISSING: "مفتاح مفقود", OPTIONS_TOO_FEW: "خيارات قليلة", PROJECTION_LEAK: "مفتاح في ورقة الطالب", SECTION_COUNT: "عدد أسئلة القسم", REPORTED_DEFECT: "خلل مُبلغ عنه", MARKS_DO_NOT_ADD_UP: "الدرجات غير متطابقة", OPTION_TEXT_EMPTY: "خيار بلا نص", PRINT_LENGTH: "طويلة عند الطباعة", TAUGHT_AFTER_SITTING: "لم يُدرَّس قبل الامتحان" },
  sealed: "ورقة مختومة", exitSeb: "الخروج من Safe Exam Browser", releaseResults: "إصدار النتائج للطلاب", released: "صدرت النتائج", releaseHint: "يرى الطلاب والأسر النتائج المراجعة فقط بعد هذا الإصدار.",
};
const ur: Copy = {
  solverTitle: "آزاد جائزے کے مشاہدات", solverRepair: "متعلقہ سوال کو تخلیق و جائزہ میں درست کریں، پھر دوبارہ جانچ کر جائزہ مکمل کریں۔ غیر تبدیل شدہ سوالات کے مشاہدات برقرار رہتے ہیں۔ نیا آزاد جائزہ پچھلے مشاہدے کی جگہ لے سکتا ہے۔",
  regenerate: "یہ سوال دوبارہ بنائیں", regenerating: "دوبارہ بنایا جا رہا ہے…", compareTitle: "انتخاب سے پہلے موازنہ کریں", previousItem: "موجودہ سوال", candidateItem: "دوبارہ بنایا گیا سوال", changedFields: "کیا بدلا", noChange: "کوئی خانہ نہیں بدلا", acceptCandidate: "دوبارہ بنایا گیا سوال استعمال کریں", keepPrevious: "موجودہ سوال رکھیں",
  fieldLabels: { prompt: "سوال", modelAnswer: "نمونہ جواب", options: "انتخابات", correctOptionId: "جوابی کلید", correctOptionIds: "جوابی کلیدیں", numericKey: "عددی کلید", marks: "نمبر", rubric: "روبرک", figures: "اشکال", outcomeIds: "تعلیمی نتائج", sourceRefs: "ماخذ" },
  title: "جائزہ، مشق اور اجرا", intro: "ہر سوال کو اس کے حوالہ شدہ ثبوت کے مقابل منظور کریں، وہی ورژن آزمائیں جو طالب علم کو ملے گا، پھر جاری کریں۔ یہاں سے کچھ شائع نہیں ہوتا۔",
  legacy: "یہ پرچہ سوالات کے جائزے میں داخل نہیں ہوا۔ اسے تفویض کیا جا سکتا ہے اور مواد کی شناخت سے مہر بند ہوگا، مگر درج شدہ مشق کے بغیر۔",
  states: { DRAFT: "مسودہ", NEEDS_SOURCE: "ماخذ درکار", NEEDS_CORRECTION: "درستی درکار", READY_FOR_REVIEW: "جائزے کے لیے تیار", APPROVED: "منظور شدہ", CHANGED_AFTER_APPROVAL: "منظوری کے بعد تبدیل" },
  recheck: "یہ سوال بدل گیا۔ میں نے اس نظرثانی کے لیے دوبارہ جانچا", artifacts: { KEY: "جواب کی کلید", RUBRIC: "روبرک", SEMANTIC_REVIEW: "آزاد جائزہ", FIGURE_CHECK: "شکل", ITEM_APPROVAL: "منظوری", COVERAGE_CHECK: "کوریج" },
  question: "سوال", evidence: "حوالہ شدہ ثبوت", page: "صفحہ", ready: "جائزے کے لیے تیار", correction: "درستی درکار", approve: "سوال منظور کریں", revision: "نظرثانی",
  hash: "مواد کی شناخت", preview: "طالب علم کو کیا ملے گا (بغیر جوابات)", rehearse: "اس ورژن کی مشق", noRehearsal: "ابھی مشق نہیں ہوئی۔",
  report: "خرابی کی اطلاع دیں", severity: "شدت", blocking: "رکاوٹ", advisory: "مشاورتی", detail: "کیا غلط ہے", add: "مشاہدہ شامل کریں", record: "مشق درج کریں", findings: "درج کرنے کے مشاہدات",
  results: "مشق کے نتائج", clean: "مشق میں کوئی رکاوٹ نہیں ملی۔", blockers: "اجرا کی رکاوٹیں", ready2: "اجرا کے لیے تیار: ہر سوال منظور اور یہ ورژن بغیر رکاوٹ آزمایا گیا۔",
  saved: "محفوظ ہو گیا۔", blockerText: { SOLVER_DISAGREEMENT: "آزاد جائزے کا اختلاف حل کریں", ITEM_NOT_APPROVED: "اجرا سے پہلے ہر سوال منظور کریں", REHEARSAL_INVALID: "ریکارڈ شدہ مشق اب مطابقت نہیں رکھتی۔ دوبارہ مشق کریں", REHEARSAL_BLOCKER: "مشق کا رکاوٹی مشاہدہ", NOT_REHEARSED: "اجرا سے پہلے بالکل اسی ورژن کی مشق کریں" }, failed: "درخواست مکمل نہ ہو سکی۔", checks: { SOLVER_DISAGREEMENT: "آزاد جائزے کا مشاہدہ", KEY_MISSING: "جواب کی کلید غائب", OPTIONS_TOO_FEW: "بہت کم اختیارات", PROJECTION_LEAK: "طالب علم کے پرچے میں کلید", SECTION_COUNT: "حصے کے سوالات", REPORTED_DEFECT: "اطلاع شدہ خرابی", MARKS_DO_NOT_ADD_UP: "نمبر پورے نہیں", OPTION_TEXT_EMPTY: "خالی اختیار", PRINT_LENGTH: "پرنٹ میں طویل", TAUGHT_AFTER_SITTING: "امتحان تک نہیں پڑھایا گیا" },
  sealed: "مہر بند پرچہ", exitSeb: "Safe Exam Browser سے باہر نکلیں", releaseResults: "طلبہ کے لیے نتائج جاری کریں", released: "نتائج جاری ہو گئے", releaseHint: "طلبہ اور والدین جائزہ شدہ نتائج صرف اس اجرا کے بعد دیکھتے ہیں۔",
};
export const examReleaseCopy = (locale: AssessmentLocale): Copy => locale === "ar" ? ar : locale === "ur" ? ur : en;
