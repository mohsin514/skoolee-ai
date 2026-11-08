import type { AssessmentLocale, CurriculumData, PaperData } from "./assessment";

/** Entirely local, fictional examples. Never pass these identifiers into a school write API. */
export type SchoolAiDemoWorkflow = "assistant" | "curriculum" | "paper";
export type SchoolAiDemoInput = { workflow: SchoolAiDemoWorkflow; language: AssessmentLocale; message?: string };
export type SchoolAiDemoResult = {
  mode: "demo";
  model: "demo:school-workflow-v1";
  tokensUsed: 0;
  notice: string;
  reply: string;
  curriculum?: CurriculumData;
  paper?: PaperData;
};

const copy = {
  en: {
    notice: "Sample demo · fictional data · no live AI request, saved records or credits used.",
    sourceTitle: "Sample teacher plan: fractions",
    reference: "Fictional classroom example, page 1",
    excerpt: "A fraction represents equal parts of a whole. Equivalent fractions have the same value. For example, 1/2 = 2/4. Fractions with equal denominators are added by adding their numerators: 1/4 + 2/4 = 3/4.",
    equivalent: "Recognize equivalent fractions", add: "Add fractions with equal denominators",
    title: "Sample Grade 5 fractions check", instructions: "Answer both questions. Show your working. This is a fictional sample for exploring the workflow.",
    section: "Fractions", firstQuestion: "Write an equivalent fraction for 1/2 with denominator 4.", firstAnswer: "1/2 = 2/4 because both numerator and denominator are multiplied by 2.",
    firstCriterion: "Give the equivalent fraction 2/4", secondQuestion: "Calculate 1/4 + 2/4.", secondAnswer: "1/4 + 2/4 = 3/4.", secondCriterion: "Add the numerators and retain the denominator to give 3/4",
    curriculum: "This sample curriculum contains two fractions objectives and a fictional teacher source. Both objectives are marked taught only within this demo. In your school workspace, choose a real class and subject, add your evidence, and confirm coverage before approval.",
    paper: "Here is a two-question, four-mark sample with answers, rubric criteria and source references. Review the questions below to explore the paper workflow. The sample is not saved, approved or assigned to students.",
    assistant: "Sample plan for a fractions lesson:\n1. Review equal parts using a paper circle.\n2. Demonstrate that 1/2 and 2/4 represent the same amount.\n3. Practise adding 1/4 and 2/4.\n4. Check understanding with the sample paper.\nOpen the Curriculum or Paper sample to inspect the supporting material.",
    communication: "Sample announcement draft:\nDear families, our fictional Grade 5 class will practise fractions this week. Please ask your child to describe one example of equal parts at home.\nNext in the real workflow: select the audience, review the wording and delivery channel, then approve the message. This sample has not been sent.",
    timetable: "Sample timetable plan:\nMonday, 09:00–09:30: fractions introduction.\nWednesday, 09:00–09:30: equivalent fractions.\nFriday, 09:00–09:20: practice and a short check.\nNext in the real workflow: select actual classes, staff and rooms, check clashes, then review a draft before publishing. These example times reserve nothing.",
    finance: "Sample fee workflow:\nA fictional class has three pupils and a sample tuition amount of 100 each: proposed total 300.\nNext in the real workflow: select the billing period, approved fee structure and actual pupils; inspect the invoice preview before applying it. No invoice, payment or ledger entry was created.",
    attendance: "Sample attendance workflow:\nA fictional register contains three pupils: two marked present and one absent.\nNext in the real workflow: choose the class and date, enter observed attendance, inspect the register preview, then save it. No pupil attendance has been changed.",
    setup: "Sample school setup plan:\n1. Choose an academic year and campus.\n2. Create a Grade 5 class and Mathematics subject.\n3. Add staff assignments and teaching days.\n4. Review the setup before applying it.\nThese are fictional examples; no school settings were changed.",
  },
  ur: {
    notice: "نمونہ ڈیمو · فرضی ڈیٹا · لائیو AI، محفوظ ریکارڈ یا کریڈٹ استعمال نہیں ہوئے۔",
    sourceTitle: "نمونہ تدریسی منصوبہ: کسر", reference: "فرضی جماعتی مثال، صفحہ 1",
    excerpt: "کسر کسی مکمل چیز کے برابر حصوں کو ظاہر کرتی ہے۔ مساوی کسروں کی قیمت ایک جیسی ہوتی ہے۔ مثلاً 1/2 = 2/4۔ یکساں مخرج والی کسروں کو جمع کرتے وقت شمار کنندگان کو جمع کیا جاتا ہے: 1/4 + 2/4 = 3/4۔",
    equivalent: "مساوی کسروں کو پہچاننا", add: "یکساں مخرج والی کسروں کو جمع کرنا",
    title: "جماعت پنجم: کسر کا نمونہ جائزہ", instructions: "دونوں سوالوں کے جواب دیں اور حل دکھائیں۔ یہ طریقۂ کار سمجھنے کے لیے فرضی نمونہ ہے۔",
    section: "کسر", firstQuestion: "1/2 کی مساوی کسر لکھیں جس کا مخرج 4 ہو۔", firstAnswer: "1/2 = 2/4 کیونکہ شمار کنندہ اور مخرج دونوں کو 2 سے ضرب دی گئی ہے۔",
    firstCriterion: "مساوی کسر 2/4 لکھیں", secondQuestion: "1/4 + 2/4 کا جواب معلوم کریں۔", secondAnswer: "1/4 + 2/4 = 3/4۔", secondCriterion: "شمار کنندگان کو جمع کرکے اور مخرج برقرار رکھ کر 3/4 حاصل کریں",
    curriculum: "اس نمونے میں کسر کے دو مقاصد اور ایک فرضی تدریسی حوالہ شامل ہیں۔ پڑھائے جانے کی تصدیق صرف اس ڈیمو کی مثال ہے۔ اصل کام کے لیے جماعت، مضمون اور معتبر مواد منتخب کریں۔",
    paper: "دو سوالوں اور چار نمبروں کا نمونہ، جوابات، معیار اور حوالوں کے ساتھ تیار ہے۔ یہ محفوظ، منظور یا طلبہ کو تفویض نہیں کیا گیا۔",
    assistant: "کسر کے سبق کا نمونہ منصوبہ:\n1. کاغذی دائرے سے برابر حصے دکھائیں۔\n2. سمجھائیں کہ 1/2 اور 2/4 برابر ہیں۔\n3. 1/4 اور 2/4 جمع کرنے کی مشق کریں۔\n4. نمونہ پرچے سے سمجھ کا جائزہ لیں۔\nمزید مواد دیکھنے کے لیے نصاب یا پرچے کا نمونہ کھولیں۔",
    communication: "اعلان کا نمونہ:\nمحترم والدین، ہماری فرضی جماعت پنجم اس ہفتے کسر کی مشق کرے گی۔ بچے سے گھر میں برابر حصوں کی ایک مثال پوچھیں۔\nاصل کام میں سامعین اور ذریعہ منتخب کرکے متن کا جائزہ اور منظوری دیں۔ یہ پیغام بھیجا نہیں گیا۔",
    timetable: "اوقات کا نمونہ:\nپیر 09:00–09:30: کسر کا تعارف۔\nبدھ 09:00–09:30: مساوی کسر۔\nجمعہ 09:00–09:20: مشق اور مختصر جائزہ۔\nاصل کام میں جماعت، اساتذہ اور کمرے منتخب کریں اور تضادات جانچیں۔ کوئی وقت مختص نہیں ہوا۔",
    finance: "فیس کا نمونہ:\nتین فرضی طلبہ، ہر ایک کی نمونہ فیس 100، کل مجوزہ رقم 300۔\nاصل کام میں مدت، منظور شدہ فیس اور طلبہ منتخب کرکے پیش منظر کا جائزہ لیں۔ کوئی بل یا ادائیگی نہیں بنی۔",
    attendance: "حاضری کا نمونہ:\nتین فرضی طلبہ میں دو حاضر اور ایک غیر حاضر۔\nاصل کام میں جماعت اور تاریخ منتخب کرکے مشاہدہ شدہ حاضری درج کریں اور جائزے کے بعد محفوظ کریں۔ کسی طالب علم کی حاضری نہیں بدلی۔",
    setup: "اسکول کی ترتیب کا نمونہ:\n1. تعلیمی سال اور کیمپس منتخب کریں۔\n2. جماعت پنجم اور ریاضی شامل کریں۔\n3. اساتذہ اور تدریسی دن مقرر کریں۔\n4. اطلاق سے پہلے جائزہ لیں۔\nکوئی حقیقی ترتیب تبدیل نہیں ہوئی۔",
  },
  ar: {
    notice: "عرض تجريبي · بيانات خيالية · لم يُستخدم ذكاء اصطناعي مباشر أو تُحفظ سجلات أو تُستهلك أرصدة.",
    sourceTitle: "خطة تدريس نموذجية: الكسور", reference: "مثال صفي خيالي، الصفحة 1",
    excerpt: "يمثل الكسر أجزاء متساوية من الكل. للكسور المتكافئة القيمة نفسها. مثلًا 1/2 = 2/4. تُجمع الكسور ذات المقامات المتساوية بجمع البسطين: 1/4 + 2/4 = 3/4.",
    equivalent: "التعرف على الكسور المتكافئة", add: "جمع الكسور ذات المقامات المتساوية",
    title: "اختبار نموذجي للكسور للصف الخامس", instructions: "أجب عن السؤالين ووضح خطوات الحل. هذا مثال خيالي لاستكشاف سير العمل.",
    section: "الكسور", firstQuestion: "اكتب كسرًا مكافئًا للكسر 1/2 مقامه 4.", firstAnswer: "1/2 = 2/4 لأن البسط والمقام ضُربا في 2.",
    firstCriterion: "كتابة الكسر المكافئ 2/4", secondQuestion: "احسب 1/4 + 2/4.", secondAnswer: "1/4 + 2/4 = 3/4.", secondCriterion: "جمع البسطين مع إبقاء المقام للحصول على 3/4",
    curriculum: "يتضمن هذا المنهج النموذجي هدفين عن الكسور ومصدرًا تعليميًا خياليًا. تأكيد تدريس الأهداف يخص هذا المثال فقط. في العمل الفعلي، اختر الصف والمادة وأضف مصادر موثوقة قبل الاعتماد.",
    paper: "هذا نموذج من سؤالين بأربع درجات، مع الإجابات ومعايير التصحيح والمراجع. لم يُحفظ أو يُعتمد أو يُسند إلى الطلاب.",
    assistant: "خطة نموذجية لدرس الكسور:\n1. استخدم دائرة ورقية لتوضيح الأجزاء المتساوية.\n2. بيّن أن 1/2 و2/4 لهما القيمة نفسها.\n3. تدرب على جمع 1/4 و2/4.\n4. تحقق من الفهم باستخدام الاختبار النموذجي.\nافتح نموذج المنهج أو الاختبار للاطلاع على المحتوى.",
    communication: "إعلان نموذجي:\nأعزاءنا أولياء الأمور، سيتدرب صفنا الخامس الخيالي على الكسور هذا الأسبوع. اطلبوا من أطفالكم وصف مثال لأجزاء متساوية في المنزل.\nفي العمل الفعلي، اختر الجمهور وقناة الإرسال وراجع النص قبل اعتماده. لم تُرسل هذه الرسالة.",
    timetable: "جدول نموذجي:\nالاثنين 09:00–09:30: مقدمة عن الكسور.\nالأربعاء 09:00–09:30: الكسور المتكافئة.\nالجمعة 09:00–09:20: تدريب وتقييم قصير.\nاختر الصفوف والمعلمين والغرف الفعلية وتحقق من التعارضات قبل النشر. لم تُحجز أي مواعيد.",
    finance: "سير عمل نموذجي للرسوم:\nثلاثة طلاب خياليين، رسوم نموذجية قدرها 100 لكل طالب، بإجمالي مقترح 300.\nاختر الفترة وهيكل الرسوم المعتمد والطلاب الفعليين ثم راجع المعاينة. لم تُنشأ فواتير أو مدفوعات.",
    attendance: "سير عمل نموذجي للحضور:\nسجل خيالي لثلاثة طلاب: اثنان حاضران وواحد غائب.\nاختر الصف والتاريخ وأدخل الحضور الملاحظ وراجعه قبل الحفظ. لم يتغير حضور أي طالب.",
    setup: "خطة إعداد مدرسية نموذجية:\n1. اختر السنة الدراسية والحرم.\n2. أضف الصف الخامس ومادة الرياضيات.\n3. حدد المعلمين وأيام التدريس.\n4. راجع الخطة قبل التطبيق.\nلم تتغير أي إعدادات فعلية.",
  },
} as const;

function assistantTopic(message: string) {
  if (/fee|invoice|payment|finance|فیس|بل|رسوم|فواتير/i.test(message)) return "finance";
  if (/attendance|register|حاضری|حضور/i.test(message)) return "attendance";
  if (/timetable|schedule|اوقات|جدول/i.test(message)) return "timetable";
  if (/announce|message|parent|communication|اعلان|والدین|إعلان|أولياء|رسالة/i.test(message)) return "communication";
  if (/setup|onboard|new school|ترتیب|إعداد/i.test(message)) return "setup";
  if (/paper|exam|assessment|پرچہ|امتحان|اختبار/i.test(message)) return "paper";
  if (/curriculum|syllabus|نصاب|منهج/i.test(message)) return "curriculum";
  return "assistant";
}

export function buildSchoolAiDemo(input: SchoolAiDemoInput): SchoolAiDemoResult {
  const text = copy[input.language];
  const topic = input.workflow === "assistant" ? assistantTopic(input.message ?? "") : input.workflow;
  const result: SchoolAiDemoResult = { mode: "demo", model: "demo:school-workflow-v1", tokensUsed: 0, notice: text.notice, reply: text[topic] };
  if (topic !== "curriculum" && topic !== "paper") return result;

  const curriculum: CurriculumData = {
    subjectId: "demo-mathematics", classId: "demo-grade-5", academicYear: "2026–2027", board: "Fictional sample curriculum",
    sources: [{ id: "demo-source-fractions", title: text.sourceTitle, kind: "TEACHER_PLAN", reference: text.reference, excerpt: text.excerpt, approved: true }],
    outcomes: [
      { id: "demo-outcome-equivalent", title: text.equivalent, sourceId: "demo-source-fractions", sourcePage: "1", taught: true, included: true },
      { id: "demo-outcome-add", title: text.add, sourceId: "demo-source-fractions", sourcePage: "1", taught: true, included: true },
    ],
    sectionCoverage: [{ section: "demo-section-a", outcomeIds: ["demo-outcome-equivalent", "demo-outcome-add"], taughtOn: "2026-09-15", confirmed: true }],
  };
  result.curriculum = curriculum;
  if (topic !== "paper") return result;
  result.paper = {
    curriculumId: "demo-curriculum-fractions", curriculumVersion: 1,
    subjectId: curriculum.subjectId, classId: curriculum.classId, language: input.language, coverageSection: "demo-section-a",
    blueprint: { title: text.title, durationMinutes: 10, totalMarks: 4, instructions: text.instructions, sections: [{ id: "demo-paper-section", title: text.section, questionCount: 2, answerCount: 2, marksPerQuestion: 2, type: "SHORT_TEXT", outcomeIds: curriculum.outcomes.map(outcome => outcome.id) }] },
    questions: [
      { id: "demo-question-equivalent", sectionId: "demo-paper-section", type: "SHORT_TEXT", prompt: text.firstQuestion, marks: 2, options: [], correctOptionId: null, modelAnswer: text.firstAnswer, rubric: [{ id: "demo-rubric-equivalent", criterion: text.firstCriterion, marks: 2 }], outcomeIds: ["demo-outcome-equivalent"], sourceRefs: [{ sourceId: "demo-source-fractions", page: "1", excerpt: text.excerpt }], locked: false },
      { id: "demo-question-add", sectionId: "demo-paper-section", type: "SHORT_TEXT", prompt: text.secondQuestion, marks: 2, options: [], correctOptionId: null, modelAnswer: text.secondAnswer, rubric: [{ id: "demo-rubric-add", criterion: text.secondCriterion, marks: 2 }], outcomeIds: ["demo-outcome-add"], sourceRefs: [{ sourceId: "demo-source-fractions", page: "1", excerpt: text.excerpt }], locked: false },
    ],
    // The template is authored content, not a model generation or a real approval.
    generation: { kind: "MANUAL", model: "demo:school-workflow-v1", generatedAt: null },
  };
  return result;
}
