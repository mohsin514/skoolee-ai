/** Strings for the AI workflows home (AiWorkflowsHome) and the shared AI composer (AiActionPanel). */
export type AiStageKey = "understand" | "plan" | "write" | "review";

export type AiFeatureCopy = { label: string; why: string; placeholder: string };

export type AiWorkflowsCopy = {
  eyebrow: string;
  titles: Record<string, string>;
  headline: string;
  intro: string;
  privacy: string;
  stats: { workflows: string; waiting: string; drafts: string };
  workspace: string;
  sectionsLabel: string;
  nav: { workflows: string; composer: string; review: string; drafts: string };
  nextEyebrow: string;
  reviewTitle: string;          // "{0} drafts are waiting for your decision"
  reviewWhy: string;
  reviewOpen: string;
  startTitle: string;           // "Start with {0}"
  start: string;
  stages: Record<AiStageKey, { title: string; hint: string }>;
  selected: string;
  composerTitle: string;
  composerHint: string;
  reviewHeading: string;
  reviewHelp: string;
  reviewEmpty: string;
  draftsHeading: string;
  draftsHelp: string;
  draftsEmpty: string;
  showAll: string;              // "View all ({0})"
  showLess: string;
  approve: string;
  reject: string;
  approved: string;
  rejected: string;
  reviewFailed: string;
  panel: {
    action: string;
    context: string;            // "Context for {0}"
    optional: string;
    run: string;
    running: string;
    runHint: string;
    sample: string;
    retryHint: string;
    failed: string;
    saved: string;
    savedTag: string;
    sampleTag: string;
    copy: string;
    copied: string;
    copyHint: string;
    clipboard: string;
    redo: string;
    redoHint: string;
    sampleFoot: string;
    words: string;              // "{0} words · always review an AI draft before using it"
  };
  features: Record<string, AiFeatureCopy>;
};

const en: AiWorkflowsCopy = {
  eyebrow: "AI workflows",
  titles: { "Campus AI": "Campus AI", "Principal AI": "Principal AI", "Teacher AI": "Teacher AI" },
  headline: "Draft in minutes. You decide what is used.",
  intro: "Each workflow reads your school's own records, writes a draft and saves it here. Nothing reaches a family, a report card or a timetable until a person approves it.",
  privacy: "Student names are pseudonymised before any prompt is sent.",
  stats: { workflows: "workflows", waiting: "waiting for review", drafts: "saved drafts" },
  workspace: "Open School AI workspace",
  sectionsLabel: "AI workflow sections",
  nav: { workflows: "Workflows", composer: "Run", review: "Review", drafts: "Drafts" },
  nextEyebrow: "Most useful next step",
  reviewTitle: "{0} AI drafts are waiting for your decision",
  reviewWhy: "Approved drafts become visible to the people they were written for; rejected ones are kept out of reports.",
  reviewOpen: "Review drafts",
  startTitle: "Start with {0}",
  start: "Start",
  stages: {
    understand: { title: "Understand", hint: "See where results, attendance or campuses need attention." },
    plan: { title: "Plan the response", hint: "Turn a concern into lessons, homework or an intervention." },
    write: { title: "Write and explain", hint: "Remarks, translations and plain-language explanations." },
    review: { title: "Review and approve", hint: "Decide which drafts are used." },
  },
  selected: "Selected",
  composerTitle: "Run a workflow",
  composerHint: "Add optional context, then run. Each run uses AI credits and is saved as a draft.",
  reviewHeading: "Review queue",
  reviewHelp: "Drafts that need a person's decision before anyone else sees them.",
  reviewEmpty: "No AI drafts are waiting for review.",
  draftsHeading: "Recent drafts",
  draftsHelp: "What the workflows have written for this campus.",
  draftsEmpty: "Class summaries, risk reviews and intervention drafts will appear here after the first run.",
  showAll: "View all ({0})",
  showLess: "Show less",
  approve: "Approve",
  reject: "Reject",
  approved: "AI draft approved",
  rejected: "AI draft rejected",
  reviewFailed: "The review could not be saved. Try again.",
  panel: {
    action: "AI workflow",
    context: "Context for {0}",
    optional: "Optional context",
    run: "Run AI",
    running: "Drafting",
    runHint: "Run this workflow (⌘↵ from the context box)",
    sample: "Try with sample data",
    retryHint: "You can retry or explore the sample preview.",
    failed: "AI could not complete this request. Check the context and try again.",
    saved: "AI draft saved",
    savedTag: "Draft saved",
    sampleTag: "Sample preview · not saved",
    copy: "Copy",
    copied: "Copied",
    copyHint: "Copy this draft to the clipboard",
    clipboard: "Your browser blocked clipboard access — select the text and copy it manually.",
    redo: "Redo",
    redoHint: "Draft this again with the same context",
    sampleFoot: "Fictional sample · no AI credits used · no school records changed",
    words: "{0} words · always review an AI draft before using it",
  },
  features: {
    at_risk_students: { label: "At-risk students", why: "Finds learners slipping on marks or attendance early enough to help.", placeholder: "Class, exam, or attendance focus" },
    class_performance_summary: { label: "Class summary", why: "A one-page read of how a class is doing, ready for a staff meeting.", placeholder: "Class or term" },
    teacher_class_comparison: { label: "Class comparison", why: "Compares sections side by side so support goes where the gap is.", placeholder: "Classes or teachers to compare" },
    intervention_suggestions: { label: "Intervention plan", why: "Concrete next steps for a student or class you are worried about.", placeholder: "Student or class concern" },
    pending_review_queue: { label: "Review queue summary", why: "Sorts waiting drafts so the most important decisions come first.", placeholder: "Optional priority note" },
    generate_remarks: { label: "Generate remarks", why: "First-draft report-card remarks from entered results.", placeholder: "Class, exam or tone" },
    rewrite_remark: { label: "Rewrite remark", why: "Turns a blunt note into kind, specific report-card language.", placeholder: "Paste the remark draft" },
    translate_remark: { label: "Translate remark", why: "Renders a remark in the family's language.", placeholder: "Paste the remark text" },
    weak_topics: { label: "Weak topics", why: "Shows where a class is losing marks, from your entered results.", placeholder: "Subject or exam context" },
    homework_suggestions: { label: "Homework", why: "Practice aimed at the weak area, not more of the same.", placeholder: "Student group or weak area" },
    lesson_plan: { label: "Lesson plan", why: "A structured plan for one topic and period length.", placeholder: "Topic, class, duration" },
    campus_comparison: { label: "Campus comparison", why: "Puts campuses side by side on results and attendance.", placeholder: "Optional academic year or term" },
    weak_campuses: { label: "Weak campuses", why: "Flags the campuses that need support first.", placeholder: "Support focus or threshold" },
    ai_usage_by_campus: { label: "AI usage", why: "Shows how each campus uses AI credits, for governance.", placeholder: "Optional governance focus" },
    fee_recovery_insights: { label: "Fee recovery", why: "Where unpaid fees sit and which follow-ups recover most.", placeholder: "Optional date or campus focus" },
    academic_trend_summary: { label: "Academic trends", why: "How results are moving across terms.", placeholder: "Optional exam or term focus" },
    explain_report_card: { label: "Explain report", why: "The latest report card in plain words.", placeholder: "Optional question about the latest report" },
    study_plan: { label: "Study plan", why: "A realistic plan for the time you have before an exam.", placeholder: "Goal, exam, or available study time" },
    school_faq: { label: "School FAQ", why: "Answers from the school's approved information only.", placeholder: "Ask an approved school question" },
  },
};

const ar: AiWorkflowsCopy = {
  eyebrow: "مسارات الذكاء الاصطناعي",
  titles: { "Campus AI": "ذكاء الفرع", "Principal AI": "ذكاء المدير", "Teacher AI": "ذكاء المعلم" },
  headline: "مسودة خلال دقائق، والقرار لك.",
  intro: "يقرأ كل مسار سجلات مدرستك ويكتب مسودة ويحفظها هنا. لا يصل شيء إلى الأسرة أو بطاقة التقرير أو الجدول قبل أن يعتمده شخص.",
  privacy: "تُستبدل أسماء الطلاب بأسماء مستعارة قبل إرسال أي طلب.",
  stats: { workflows: "مسارات", waiting: "بانتظار المراجعة", drafts: "مسودات محفوظة" },
  workspace: "افتح مساحة المدرسة الذكية",
  sectionsLabel: "أقسام مسارات الذكاء الاصطناعي",
  nav: { workflows: "المسارات", composer: "تشغيل", review: "المراجعة", drafts: "المسودات" },
  nextEyebrow: "الخطوة التالية الأكثر فائدة",
  reviewTitle: "{0} مسودات بانتظار قرارك",
  reviewWhy: "المسودات المعتمدة تظهر لمن كُتبت لهم، والمرفوضة تُستبعد من التقارير.",
  reviewOpen: "راجع المسودات",
  startTitle: "ابدأ بـ {0}",
  start: "ابدأ",
  stages: {
    understand: { title: "افهم", hint: "اعرف أين تحتاج النتائج أو الحضور أو الفروع إلى اهتمام." },
    plan: { title: "خطط للاستجابة", hint: "حوّل المخاوف إلى دروس أو واجبات أو تدخل." },
    write: { title: "اكتب واشرح", hint: "ملاحظات وترجمات وشروح بلغة بسيطة." },
    review: { title: "راجع واعتمد", hint: "قرّر أي المسودات تُستخدم." },
  },
  selected: "محدد",
  composerTitle: "شغّل مساراً",
  composerHint: "أضف سياقاً اختيارياً ثم شغّل. كل تشغيل يستهلك أرصدة ذكاء اصطناعي ويُحفظ كمسودة.",
  reviewHeading: "قائمة المراجعة",
  reviewHelp: "مسودات تحتاج قرار شخص قبل أن يراها أحد.",
  reviewEmpty: "لا توجد مسودات بانتظار المراجعة.",
  draftsHeading: "أحدث المسودات",
  draftsHelp: "ما كتبته المسارات لهذا الفرع.",
  draftsEmpty: "ستظهر هنا ملخصات الصفوف ومراجعات المخاطر وخطط التدخل بعد أول تشغيل.",
  showAll: "عرض الكل ({0})",
  showLess: "عرض أقل",
  approve: "اعتماد",
  reject: "رفض",
  approved: "تم اعتماد المسودة",
  rejected: "تم رفض المسودة",
  reviewFailed: "تعذر حفظ المراجعة. حاول مجدداً.",
  panel: {
    action: "مسار الذكاء الاصطناعي",
    context: "سياق {0}",
    optional: "سياق اختياري",
    run: "شغّل",
    running: "جارٍ الكتابة",
    runHint: "شغّل هذا المسار (⌘↵ من مربع السياق)",
    sample: "جرّب ببيانات نموذجية",
    retryHint: "يمكنك المحاولة مجدداً أو استعراض النموذج.",
    failed: "تعذر إكمال الطلب. راجع السياق وحاول مجدداً.",
    saved: "تم حفظ المسودة",
    savedTag: "تم حفظ المسودة",
    sampleTag: "معاينة نموذجية · غير محفوظة",
    copy: "نسخ",
    copied: "تم النسخ",
    copyHint: "انسخ المسودة إلى الحافظة",
    clipboard: "منع المتصفح الوصول إلى الحافظة — حدّد النص وانسخه يدوياً.",
    redo: "أعد",
    redoHint: "اكتب المسودة مجدداً بالسياق نفسه",
    sampleFoot: "نموذج خيالي · بلا أرصدة · لم تتغير أي سجلات",
    words: "{0} كلمة · راجع أي مسودة قبل استخدامها",
  },
  features: {
    at_risk_students: { label: "طلاب معرضون للخطر", why: "يكتشف مبكراً من يتراجع في الدرجات أو الحضور.", placeholder: "صف أو اختبار أو حضور" },
    class_performance_summary: { label: "ملخص الصف", why: "قراءة في صفحة واحدة لأداء الصف، جاهزة لاجتماع المعلمين.", placeholder: "الصف أو الفصل الدراسي" },
    teacher_class_comparison: { label: "مقارنة الصفوف", why: "يقارن الشعب جنباً إلى جنب ليذهب الدعم إلى الفجوة.", placeholder: "صفوف أو معلمون للمقارنة" },
    intervention_suggestions: { label: "خطة تدخل", why: "خطوات عملية لطالب أو صف يقلقك.", placeholder: "مصدر القلق" },
    pending_review_queue: { label: "ملخص قائمة المراجعة", why: "يرتب المسودات لتأتي القرارات الأهم أولاً.", placeholder: "ملاحظة أولوية اختيارية" },
    generate_remarks: { label: "إنشاء ملاحظات", why: "مسودة أولى لملاحظات التقرير من النتائج المدخلة.", placeholder: "الصف أو الاختبار أو الأسلوب" },
    rewrite_remark: { label: "إعادة صياغة ملاحظة", why: "يحوّل الملاحظة الجافة إلى لغة لطيفة ومحددة.", placeholder: "الصق مسودة الملاحظة" },
    translate_remark: { label: "ترجمة ملاحظة", why: "يقدّم الملاحظة بلغة الأسرة.", placeholder: "الصق نص الملاحظة" },
    weak_topics: { label: "موضوعات ضعيفة", why: "يبيّن أين يفقد الصف الدرجات من نتائجك.", placeholder: "المادة أو الاختبار" },
    homework_suggestions: { label: "واجبات", why: "تمارين موجهة لموضع الضعف.", placeholder: "مجموعة الطلاب أو موضع الضعف" },
    lesson_plan: { label: "خطة درس", why: "خطة منظمة لموضوع واحد ومدة حصة.", placeholder: "الموضوع والصف والمدة" },
    campus_comparison: { label: "مقارنة الفروع", why: "يضع الفروع جنباً إلى جنب في النتائج والحضور.", placeholder: "سنة أو فصل دراسي اختياري" },
    weak_campuses: { label: "فروع تحتاج دعماً", why: "يحدد الفروع الأولى بالدعم.", placeholder: "محور الدعم أو الحد" },
    ai_usage_by_campus: { label: "استخدام الذكاء الاصطناعي", why: "كيف يستخدم كل فرع الأرصدة، للحوكمة.", placeholder: "محور حوكمة اختياري" },
    fee_recovery_insights: { label: "تحصيل الرسوم", why: "أين الرسوم غير المدفوعة وأي متابعة تحصّل أكثر.", placeholder: "تاريخ أو فرع اختياري" },
    academic_trend_summary: { label: "الاتجاهات الأكاديمية", why: "كيف تتحرك النتائج عبر الفصول.", placeholder: "اختبار أو فصل اختياري" },
    explain_report_card: { label: "شرح التقرير", why: "آخر بطاقة تقرير بكلمات بسيطة.", placeholder: "سؤال اختياري عن التقرير" },
    study_plan: { label: "خطة مذاكرة", why: "خطة واقعية للوقت المتاح قبل الاختبار.", placeholder: "الهدف أو الاختبار أو الوقت المتاح" },
    school_faq: { label: "أسئلة المدرسة", why: "إجابات من معلومات المدرسة المعتمدة فقط.", placeholder: "اسأل سؤالاً معتمداً" },
  },
};

const ur: AiWorkflowsCopy = {
  eyebrow: "اے آئی ورک فلوز",
  titles: { "Campus AI": "کیمپس اے آئی", "Principal AI": "پرنسپل اے آئی", "Teacher AI": "استاد اے آئی" },
  headline: "منٹوں میں مسودہ، فیصلہ آپ کا۔",
  intro: "ہر ورک فلو آپ کے اسکول کے اپنے ریکارڈ پڑھ کر مسودہ لکھتا اور یہاں محفوظ کرتا ہے۔ کسی شخص کی منظوری کے بغیر کچھ بھی خاندان، رپورٹ کارڈ یا ٹائم ٹیبل تک نہیں پہنچتا۔",
  privacy: "کوئی بھی پرامپٹ بھیجنے سے پہلے طلبہ کے نام فرضی ناموں سے بدل دیے جاتے ہیں۔",
  stats: { workflows: "ورک فلوز", waiting: "جائزے کے منتظر", drafts: "محفوظ مسودے" },
  workspace: "اسکول اے آئی ورک اسپیس کھولیں",
  sectionsLabel: "اے آئی ورک فلو کے حصے",
  nav: { workflows: "ورک فلوز", composer: "چلائیں", review: "جائزہ", drafts: "مسودے" },
  nextEyebrow: "سب سے مفید اگلا قدم",
  reviewTitle: "{0} مسودے آپ کے فیصلے کے منتظر ہیں",
  reviewWhy: "منظور شدہ مسودے انہی کو نظر آتے ہیں جن کے لیے لکھے گئے؛ مسترد شدہ رپورٹس سے باہر رہتے ہیں۔",
  reviewOpen: "مسودوں کا جائزہ لیں",
  startTitle: "{0} سے شروع کریں",
  start: "شروع کریں",
  stages: {
    understand: { title: "سمجھیں", hint: "دیکھیں کہاں نتائج، حاضری یا کیمپس کو توجہ چاہیے۔" },
    plan: { title: "جواب کی منصوبہ بندی", hint: "تشویش کو اسباق، ہوم ورک یا مداخلت میں بدلیں۔" },
    write: { title: "لکھیں اور سمجھائیں", hint: "ریمارکس، ترجمے اور آسان وضاحتیں۔" },
    review: { title: "جائزہ اور منظوری", hint: "فیصلہ کریں کون سے مسودے استعمال ہوں۔" },
  },
  selected: "منتخب",
  composerTitle: "ورک فلو چلائیں",
  composerHint: "اختیاری سیاق شامل کریں، پھر چلائیں۔ ہر رن اے آئی کریڈٹس استعمال کرتا اور مسودے کے طور پر محفوظ ہوتا ہے۔",
  reviewHeading: "جائزہ قطار",
  reviewHelp: "وہ مسودے جنہیں کسی اور کے دیکھنے سے پہلے فیصلہ چاہیے۔",
  reviewEmpty: "کوئی مسودہ جائزے کا منتظر نہیں۔",
  draftsHeading: "حالیہ مسودے",
  draftsHelp: "ورک فلوز نے اس کیمپس کے لیے کیا لکھا۔",
  draftsEmpty: "پہلے رن کے بعد کلاس خلاصے، خطرے کے جائزے اور مداخلت کے مسودے یہاں نظر آئیں گے۔",
  showAll: "سب دیکھیں ({0})",
  showLess: "کم دکھائیں",
  approve: "منظور",
  reject: "مسترد",
  approved: "مسودہ منظور ہو گیا",
  rejected: "مسودہ مسترد ہو گیا",
  reviewFailed: "جائزہ محفوظ نہ ہو سکا۔ دوبارہ کوشش کریں۔",
  panel: {
    action: "اے آئی ورک فلو",
    context: "{0} کا سیاق",
    optional: "اختیاری سیاق",
    run: "چلائیں",
    running: "لکھا جا رہا ہے",
    runHint: "یہ ورک فلو چلائیں (سیاق باکس سے ⌘↵)",
    sample: "نمونہ ڈیٹا سے آزمائیں",
    retryHint: "دوبارہ کوشش کریں یا نمونہ دیکھیں۔",
    failed: "درخواست مکمل نہ ہو سکی۔ سیاق چیک کر کے دوبارہ کوشش کریں۔",
    saved: "مسودہ محفوظ ہو گیا",
    savedTag: "مسودہ محفوظ",
    sampleTag: "نمونہ پیش منظر · محفوظ نہیں",
    copy: "کاپی",
    copied: "کاپی ہو گیا",
    copyHint: "مسودہ کلپ بورڈ پر کاپی کریں",
    clipboard: "براؤزر نے کلپ بورڈ تک رسائی روک دی — متن منتخب کر کے خود کاپی کریں۔",
    redo: "دوبارہ",
    redoHint: "اسی سیاق کے ساتھ دوبارہ لکھیں",
    sampleFoot: "فرضی نمونہ · کوئی کریڈٹ استعمال نہیں · کوئی ریکارڈ نہیں بدلا",
    words: "{0} الفاظ · استعمال سے پہلے ہر مسودے کا جائزہ لیں",
  },
  features: {
    at_risk_students: { label: "خطرے میں طلبہ", why: "نمبروں یا حاضری میں پیچھے رہ جانے والوں کو بروقت پہچانتا ہے۔", placeholder: "کلاس، امتحان یا حاضری" },
    class_performance_summary: { label: "کلاس خلاصہ", why: "کلاس کی کارکردگی ایک صفحے میں، اسٹاف میٹنگ کے لیے تیار۔", placeholder: "کلاس یا ٹرم" },
    teacher_class_comparison: { label: "کلاس موازنہ", why: "سیکشنز کا ساتھ ساتھ موازنہ تاکہ مدد وہاں جائے جہاں کمی ہے۔", placeholder: "موازنے کے لیے کلاسیں یا اساتذہ" },
    intervention_suggestions: { label: "مداخلت کا منصوبہ", why: "فکر والے طالب علم یا کلاس کے لیے عملی اقدامات۔", placeholder: "طالب علم یا کلاس کی تشویش" },
    pending_review_queue: { label: "جائزہ قطار خلاصہ", why: "منتظر مسودوں کو ترتیب دیتا ہے تاکہ اہم فیصلے پہلے ہوں۔", placeholder: "اختیاری ترجیحی نوٹ" },
    generate_remarks: { label: "ریمارکس بنائیں", why: "درج نتائج سے رپورٹ کارڈ ریمارکس کا پہلا مسودہ۔", placeholder: "کلاس، امتحان یا انداز" },
    rewrite_remark: { label: "ریمارک دوبارہ لکھیں", why: "سخت نوٹ کو نرم اور واضح زبان میں بدلتا ہے۔", placeholder: "ریمارک کا مسودہ چسپاں کریں" },
    translate_remark: { label: "ریمارک ترجمہ", why: "ریمارک خاندان کی زبان میں۔", placeholder: "ریمارک کا متن چسپاں کریں" },
    weak_topics: { label: "کمزور موضوعات", why: "آپ کے نتائج سے دکھاتا ہے کہ کلاس کہاں نمبر کھو رہی ہے۔", placeholder: "مضمون یا امتحان" },
    homework_suggestions: { label: "ہوم ورک", why: "کمزور حصے کے لیے مشق۔", placeholder: "طلبہ کا گروپ یا کمزور حصہ" },
    lesson_plan: { label: "سبق کا منصوبہ", why: "ایک موضوع اور پیریڈ کے لیے منظم منصوبہ۔", placeholder: "موضوع، کلاس، دورانیہ" },
    campus_comparison: { label: "کیمپس موازنہ", why: "نتائج اور حاضری پر کیمپسز کا موازنہ۔", placeholder: "اختیاری تعلیمی سال یا ٹرم" },
    weak_campuses: { label: "کمزور کیمپس", why: "پہلے مدد کے مستحق کیمپس کی نشاندہی۔", placeholder: "مدد کا محور یا حد" },
    ai_usage_by_campus: { label: "اے آئی استعمال", why: "ہر کیمپس کریڈٹس کیسے استعمال کرتا ہے۔", placeholder: "اختیاری گورننس محور" },
    fee_recovery_insights: { label: "فیس وصولی", why: "واجب الادا فیس کہاں ہے اور کون سا فالو اپ زیادہ وصول کرتا ہے۔", placeholder: "اختیاری تاریخ یا کیمپس" },
    academic_trend_summary: { label: "تعلیمی رجحانات", why: "ٹرمز کے دوران نتائج کیسے بدل رہے ہیں۔", placeholder: "اختیاری امتحان یا ٹرم" },
    explain_report_card: { label: "رپورٹ کی وضاحت", why: "تازہ رپورٹ کارڈ آسان الفاظ میں۔", placeholder: "رپورٹ کے بارے میں اختیاری سوال" },
    study_plan: { label: "مطالعہ منصوبہ", why: "امتحان سے پہلے دستیاب وقت کے لیے حقیقت پسندانہ منصوبہ۔", placeholder: "ہدف، امتحان یا دستیاب وقت" },
    school_faq: { label: "اسکول سوالات", why: "صرف اسکول کی منظور شدہ معلومات سے جواب۔", placeholder: "منظور شدہ سوال پوچھیں" },
  },
};

const COPY = { en, ar, ur } as const;

export function getAiWorkflowsCopy(language: string): AiWorkflowsCopy {
  return COPY[language as keyof typeof COPY] ?? en;
}

export const AI_STAGE_OF: Record<string, AiStageKey> = {
  at_risk_students: "understand", class_performance_summary: "understand", teacher_class_comparison: "understand", weak_topics: "understand",
  campus_comparison: "understand", weak_campuses: "understand", ai_usage_by_campus: "understand", fee_recovery_insights: "understand", academic_trend_summary: "understand",
  intervention_suggestions: "plan", homework_suggestions: "plan", lesson_plan: "plan", study_plan: "plan",
  generate_remarks: "write", rewrite_remark: "write", translate_remark: "write", explain_report_card: "write", school_faq: "write",
  pending_review_queue: "review",
};

export const fillAi = (template: string, ...values: (string | number)[]) => template.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ""));
