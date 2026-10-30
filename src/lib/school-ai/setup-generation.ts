import { z } from "zod";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord, OnboardingData, PolicyData, WorkflowData } from "./types";
import { validateSetupAnswer, type SetupAnswerKey } from "./onboarding";
import type { AcademicSetupProposal } from "./academic-setup";

export const setupGenerationInputSchema = z.strictObject({
  recordId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  expectedVersion: z.number().int().min(1).max(2147483646),
  language: z.enum(["en", "ar", "ur"]),
});
export type SetupGenerationInput = z.infer<typeof setupGenerationInputSchema>;
export type SetupGeneratedDraft = { key: string; title: string } & (
  { kind: "WORKFLOW"; data: WorkflowData } | { kind: "POLICY"; data: PolicyData }
);
export type SetupGenerationResult = {
  records: AiWorkspaceRecord[];
  mode: "live" | "prototype";
  reason: string | null;
  summary: string;
  sourceRecordId: string;
  sourceVersion: number;
  currentSourceVersion: number;
  matchesCurrentAnswers: true;
  replay: boolean;
};

const copy = {
  en: {
    overview: "School launch plan", academics: "Academic year and classes", calendar: "Working days and calendar", curriculum: "Curriculum and assessment preparation", timetable: "Timetable preparation", records: "Student and staff records plan", fees: "Fee policy draft", assessment: "Assessment policy draft", communications: "Communications policy draft",
    source: "Based on saved setup answers", review: "Draft for review. Saved plans do not apply settings, publish schedules, create invoices or send messages.", missing: "Provide and confirm", confirm: "Review and confirm", unknown: "Not supplied", proposed: "Proposed next work",
    mode: "Confirm the teaching mode for each class. SUBJECT is a draft suggestion until the class teacher or subject-teacher model is confirmed.", classes: "List each grade and section explicitly (for example: Grade 1 A, Grade 1 B).", year: "Supply one academic-year label such as 2026–2027.", days: "List the exact working days or a day range, for example Monday–Friday. Include at least one open and one closed day.",
    profileStep: "Review the school name, campus, country and time zone against the saved facts.", academicStep: "Review the year, dates, classes and teaching modes, then preview the proposed academic setup.", calendarStep: "Review the proposed closed days against existing lessons and the school calendar before applying them.",
    curriculumStep: "Attach the official syllabus, choose actual classes and subjects, and map learning outcomes to source pages.", assessmentStep: "Review assessment rules, total marks, paper format and taught coverage before drafting an exam.", timetableStep: "Choose actual classes, assigned subject teachers, rooms and period times; check capacity and clashes before preparing a timetable draft.", recordsStep: "Map the actual student and staff source columns, resolve duplicates, and review a dry run before importing records.", feesStep: "Review fee amounts, currency, billing frequency, due dates and concession rules before preparing invoices.", communicationStep: "Review the message wording, audience, approved channel and guardian access before sending any announcement.",
    missingTimetable: "Select the actual class, subject, assigned teacher, room and period IDs. The questionnaire alone does not establish a clash-free schedule.", missingCurriculum: "Choose actual class and subject records and attach approved curriculum evidence; confirm taught outcomes before paper generation.", missingRecords: "Supply the actual source file, identity mapping and duplicate-resolution decisions before importing people.", migration: "Reconcile the source records and balances before approving migration cutover.",
    policyReview: "Review the supplied rules for completeness and obtain school approval before use. Missing amounts, dates, recipients or legal requirements must be supplied by the school, not invented.",
  },
  ur: {
    overview: "اسکول کے آغاز کا منصوبہ", academics: "تعلیمی سال اور جماعتیں", calendar: "کام کے دن اور تقویم", curriculum: "نصاب اور امتحان کی تیاری", timetable: "ٹائم ٹیبل کی تیاری", records: "طلبہ اور عملے کے ریکارڈ کا منصوبہ", fees: "فیس پالیسی کا مسودہ", assessment: "امتحانی پالیسی کا مسودہ", communications: "رابطے کی پالیسی کا مسودہ",
    source: "محفوظ جوابات کی بنیاد پر", review: "جائزے کے لیے مسودہ۔ منصوبہ محفوظ کرنے سے ترتیبات، شیڈول، بل یا پیغامات خود بخود نافذ نہیں ہوتے۔", missing: "درج کریں اور تصدیق کریں", confirm: "جائزہ لیں اور تصدیق کریں", unknown: "فراہم نہیں کیا گیا", proposed: "مجوزہ اگلا کام",
    mode: "ہر جماعت کا تدریسی طریقہ تصدیق کریں۔ SUBJECT صرف ابتدائی تجویز ہے، جب تک جماعتی یا مضمون کے استاد کا طریقہ تصدیق نہ ہو۔", classes: "ہر جماعت اور سیکشن الگ درج کریں، مثلاً Grade 1 A, Grade 1 B۔", year: "ایک تعلیمی سال درج کریں، مثلاً 2026–2027۔", days: "کام کے دن واضح درج کریں، مثلاً پیر تا جمعہ۔ کم از کم ایک کھلا اور ایک بند دن ضروری ہے۔",
    profileStep: "اسکول کا نام، کیمپس، ملک اور ٹائم زون محفوظ معلومات سے ملا کر دیکھیں۔", academicStep: "سال، تاریخیں، جماعتیں اور تدریسی طریقے دیکھ کر تعلیمی ترتیب کا پیش منظر کھولیں۔", calendarStep: "موجودہ اسباق اور اسکول کی تقویم کے مطابق بند دنوں کا جائزہ لے کر اطلاق کریں۔",
    curriculumStep: "اصل نصاب شامل کریں، حقیقی جماعت اور مضمون منتخب کریں، اور تعلیمی نتائج کو حوالہ صفحات سے جوڑیں۔", assessmentStep: "امتحانی قواعد، کل نمبر، پرچے کی ساخت اور پڑھائے گئے حصوں کا جائزہ لیں۔", timetableStep: "حقیقی جماعتیں، مقرر اساتذہ، کمرے اور اوقات منتخب کریں؛ گنجائش اور ٹکراؤ جانچیں۔", recordsStep: "اصل طلبہ اور عملے کے کالم ملائیں، نقل ریکارڈ حل کریں اور درآمد سے پہلے پیش منظر دیکھیں۔", feesStep: "بل بنانے سے پہلے فیس، کرنسی، مدت، آخری تاریخ اور رعایت کے قواعد دیکھیں۔", communicationStep: "اعلان بھیجنے سے پہلے متن، سامعین، منظور شدہ ذریعہ اور سرپرست کی رسائی دیکھیں۔",
    missingTimetable: "حقیقی جماعت، مضمون، مقرر استاد، کمرے اور پیریڈ کے ریکارڈ منتخب کریں۔ صرف جوابات سے درست شیڈول ثابت نہیں ہوتا۔", missingCurriculum: "حقیقی جماعت اور مضمون منتخب کرکے نصاب کا منظور شدہ ثبوت شامل کریں؛ پرچہ بنانے سے پہلے تدریس کی تصدیق کریں۔", missingRecords: "افراد کی درآمد سے پہلے اصل فائل، شناخت کی مطابقت اور نقل ریکارڈ کے فیصلے فراہم کریں۔", migration: "منتقلی کی منظوری سے پہلے اصل ریکارڈ اور بیلنس ملائیں۔",
    policyReview: "فراہم کردہ قواعد مکمل ہونے کا جائزہ لیں اور استعمال سے پہلے اسکول کی منظوری حاصل کریں۔ غائب رقم، تاریخ، وصول کنندہ یا قانونی شرط اسکول فراہم کرے۔",
  },
  ar: {
    overview: "خطة بدء المدرسة", academics: "السنة الدراسية والصفوف", calendar: "أيام العمل والتقويم", curriculum: "إعداد المنهج والتقييم", timetable: "إعداد الجدول الدراسي", records: "خطة سجلات الطلاب والموظفين", fees: "مسودة سياسة الرسوم", assessment: "مسودة سياسة التقييم", communications: "مسودة سياسة التواصل",
    source: "استنادًا إلى إجابات الإعداد المحفوظة", review: "مسودة للمراجعة. حفظ الخطة لا يطبق الإعدادات أو ينشر الجداول أو ينشئ الفواتير أو يرسل الرسائل.", missing: "أدخل وأكد", confirm: "راجع وأكد", unknown: "غير متوفر", proposed: "العمل التالي المقترح",
    mode: "أكد نمط التدريس لكل صف. SUBJECT اقتراح أولي حتى تأكيد التدريس بمعلم الصف أو معلمي المواد.", classes: "أدرج كل صف وشعبة بصورة واضحة، مثل Grade 1 A, Grade 1 B.", year: "أدخل سنة دراسية واحدة مثل 2026–2027.", days: "أدرج أيام العمل بدقة أو نطاقًا مثل الاثنين إلى الجمعة، مع يوم مفتوح وآخر مغلق على الأقل.",
    profileStep: "راجع اسم المدرسة والحرم والدولة والمنطقة الزمنية وفق المعلومات المحفوظة.", academicStep: "راجع السنة والتواريخ والصفوف وأنماط التدريس، ثم عاين الإعداد الأكاديمي المقترح.", calendarStep: "راجع أيام الإغلاق المقترحة مقابل الدروس الحالية وتقويم المدرسة قبل التطبيق.",
    curriculumStep: "أرفق المنهج الرسمي واختر الصفوف والمواد الفعلية واربط مخرجات التعلم بصفحات المصادر.", assessmentStep: "راجع قواعد التقييم والدرجات وشكل الورقة والتغطية المدروسة قبل إعداد الاختبار.", timetableStep: "اختر الصفوف ومعلمي المواد والغرف والأوقات الفعلية، ثم افحص السعة والتعارضات.", recordsStep: "طابق أعمدة مصادر الطلاب والموظفين وحل السجلات المكررة وراجع تجربة الاستيراد أولًا.", feesStep: "راجع الرسوم والعملة ودورية الفوترة والاستحقاق وقواعد الخصم قبل إعداد الفواتير.", communicationStep: "راجع النص والجمهور والقناة المعتمدة وصلاحيات أولياء الأمور قبل إرسال أي إعلان.",
    missingTimetable: "اختر سجلات الصف والمادة والمعلم والغرفة والحصة الفعلية. الإجابات وحدها لا تثبت خلو الجدول من التعارضات.", missingCurriculum: "اختر سجلات الصف والمادة وأرفق أدلة المنهج المعتمدة، ثم أكد المخرجات المدروسة قبل توليد الورقة.", missingRecords: "وفر الملف الأصلي ومطابقة الهويات وقرارات معالجة التكرار قبل استيراد الأشخاص.", migration: "طابق سجلات المصدر والأرصدة قبل اعتماد الانتقال.",
    policyReview: "راجع اكتمال القواعد المقدمة واحصل على اعتماد المدرسة قبل الاستخدام. على المدرسة توفير المبالغ والتواريخ والمستلمين والمتطلبات القانونية المفقودة دون اختلاقها.",
  },
} as const;

const labels: Record<SetupAnswerKey, [string, string, string]> = {
  schoolName: ["School", "اسکول", "المدرسة"], country: ["Country", "ملک", "الدولة"], timezone: ["Time zone", "ٹائم زون", "المنطقة الزمنية"], campuses: ["Campuses", "کیمپس", "الأحرام"], grades: ["Grades and sections", "جماعتیں اور سیکشن", "الصفوف والشعب"], academicYear: ["Academic year", "تعلیمی سال", "السنة الدراسية"], startDate: ["Start date", "آغاز", "تاريخ البدء"], endDate: ["End date", "اختتام", "تاريخ الانتهاء"], workingDays: ["Working days", "کام کے دن", "أيام العمل"], firstOutcome: ["First outcome", "پہلا ہدف", "الهدف الأول"], curriculum: ["Curriculum", "نصاب", "المنهج"], assessmentPolicy: ["Assessment rules", "امتحانی قواعد", "قواعد التقييم"], feePolicy: ["Fee rules", "فیس کے قواعد", "قواعد الرسوم"], communications: ["Communications", "رابطہ", "التواصل"], resources: ["Rooms and resources", "کمرے اور وسائل", "الغرف والموارد"], staff: ["Staff information", "عملے کی معلومات", "معلومات الموظفين"], students: ["Student information", "طلبہ کی معلومات", "معلومات الطلاب"], migrationSource: ["Migration source", "منتقلی کا ماخذ", "مصدر النقل"],
};

/** Stable facts only: moving between questions does not change the answer fingerprint. */
export function setupFactsFingerprint(data: OnboardingData) {
  return JSON.stringify({ path: data.path, answers: Object.fromEntries(Object.entries(data.answers).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value?.trim() ?? ""])), confirmedKeys: [...new Set(data.confirmedKeys)].sort() });
}

const asciiDigits = (value: string) => value.normalize("NFKC").replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 15));

function academicClasses(value: string): AcademicSetupProposal["classes"] | null {
  const names: string[] = [];
  for (const part of asciiDigits(value).split(/[,،;؛\n]+/).map(item => item.trim()).filter(Boolean)) {
    const range = /^(?:(?:grades?|classes?|جماعت|الصفوف)\s+)?(\d{1,2})\s*(?:-|–|to|تا|إلى)\s*(\d{1,2})$/i.exec(part);
    if (range) {
      const from = Number(range[1]), to = Number(range[2]);
      if (from < 1 || to < from || to > 13) return null;
      for (let number = from; number <= to; number++) names.push(`Grade ${number}`);
    } else {
      const name = /^\d{1,2}$/.test(part) ? `Grade ${part}` : part;
      if (name.length > 80 || !/^(?:(?:grades?|class|year|جماعت|الصف)\s*\d{1,2}|kindergarten|nursery|reception|pre[- ]?k|kg|prep|preschool)(?:\s+(?:(?:section|شعبہ|الشعبة)\s+)?[a-z0-9]{1,4})?$/i.test(name)) return null;
      names.push(name);
    }
  }
  if (!names.length || names.length > 50) return null;
  const classes = names.map((name, index) => {
    const section = /^((?:grades?|class|year|جماعت|الصف)\s*\d+)\s+(?:(?:section|شعبہ|الشعبة)\s+)?([a-z0-9]{1,4})$/i.exec(name);
    return { id: `setup-class-${index + 1}`, name: section?.[1] ?? name, section: section?.[2].toUpperCase() ?? null, teachingMode: "SUBJECT" as const };
  });
  return new Set(classes.map(row => `${row.name.normalize("NFKC").trim().toLowerCase()}:${row.section ?? ""}`)).size === classes.length ? classes : null;
}

const dayNames = [
  ["monday", "mon", "پیر", "الاثنين", "الإثنين"], ["tuesday", "tue", "tues", "منگل", "الثلاثاء"], ["wednesday", "wed", "بدھ", "الأربعاء", "الاربعاء"], ["thursday", "thu", "thur", "thurs", "جمعرات", "الخميس"], ["friday", "fri", "جمعہ", "الجمعة"], ["saturday", "sat", "ہفتہ", "السبت"], ["sunday", "sun", "اتوار", "الأحد", "الاحد"],
];
function workingDays(value: string): number[] | null {
  const day = (text: string) => dayNames.findIndex(names => names.includes(text.trim().toLowerCase()));
  const range = value.trim().split(/\s*(?:–|-|\bto\b|\bthrough\b|تا|إلى)\s*/i);
  let days: number[];
  if (range.length === 2 && range.every(part => day(part) >= 0)) {
    const first = day(range[0]), last = day(range[1]); days = [first];
    while (days.at(-1) !== last && days.length < 7) days.push((days.at(-1)! + 1) % 7);
  } else {
    const entries = value.split(/[,،;؛\n]+/).map(text => day(text));
    if (!entries.length || entries.some(index => index < 0)) return null;
    days = [...new Set(entries)];
  }
  return days.length > 0 && days.length < 7 ? days.map(index => index + 1) : null;
}

/** Only explicit 24-hour teaching-period windows become a proposal; no invented school-day times. */
function teachingPeriods(value: string) {
  if (!/\b(?:periods?|lessons?)\b|پیریڈ|حصص|حصة/i.test(value)) return null;
  if (/\b(?:am|pm|break|lunch|assembly|prayer|exam|assessment)\b|وقفہ|نماز|امتحان|استراحة|غداء|صلاة|اختبار/i.test(value)) return null;
  const matches = [...value.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\s*(?:-|–|to|تا|إلى)\s*([01]\d|2[0-3]):([0-5]\d)\b/gi)];
  if (!matches.length || matches.length > 30 || (value.match(/\b\d{1,2}:\d{2}\b/g)?.length ?? 0) !== matches.length * 2) return null;
  const rows = matches.map((match, index) => ({ timeType: "CLASS" as const, periodNumber: index + 1, startTime: `${match[1]}:${match[2]}`, endTime: `${match[3]}:${match[4]}` }));
  if (rows.some((row, index) => row.endTime <= row.startTime || rows.slice(0, index).some(prior => prior.startTime < row.endTime && row.startTime < prior.endTime))) return null;
  return rows;
}

/** Deterministic drafts based on the actual saved answers, never dummy school records. */
export function buildSetupWorkflowDrafts(data: OnboardingData, language: Language, sourceRecordId: string, sourceVersion: number): SetupGeneratedDraft[] {
  const t = copy[language], languageIndex = language === "en" ? 0 : language === "ur" ? 1 : 2;
  const label = (key: SetupAnswerKey) => labels[key][languageIndex];
  const answer = (key: SetupAnswerKey) => data.answers[key]?.trim() ?? "";
  const missing = (keys: SetupAnswerKey[]) => keys.flatMap(key => !answer(key) || validateSetupAnswer(key, answer(key), data.answers) ? [`${t.missing}: ${label(key)}`] : !data.confirmedKeys.includes(key) ? [`${t.confirm}: ${label(key)}`] : []);
  const provenance = `${t.source} · v${sourceVersion}`;
  const sourceReference = `${t.source}: ${sourceRecordId} · v${sourceVersion}`;
  const facts = (keys: SetupAnswerKey[], budget = 2100) => keys.map(key => `${label(key)}: ${answer(key).slice(0, Math.floor(budget / Math.max(keys.length, 1))) || t.unknown}`).join("\n");
  const result: SetupGeneratedDraft[] = [];
  const workflow = (key: string, title: string, keys: SetupAnswerKey[], tasks: Array<[string, NonNullable<WorkflowData["steps"][number]["module"]>]>, extra: string[] = [], proposal?: WorkflowData["proposal"]) => {
    const missingInformation = [...new Set([...missing(keys), ...extra])];
    result.push({ key, title, kind: "WORKFLOW", data: { goal: `${title}\n${provenance}\n\n${facts(keys)}\n\n${t.review}`.slice(0, 4000), sourceIds: [], missingInformation, steps: tasks.map(([title, module], index) => ({ id: `${key}-${index + 1}`, title, module, status: missingInformation.length ? "blocked" : "proposed" })), ...(proposal ? { proposal } : {}) } });
  };

  const core: SetupAnswerKey[] = ["schoolName", "country", "timezone", "campuses", "grades", "academicYear", "startDate", "endDate", "workingDays", "firstOutcome"];
  const outcome = answer("firstOutcome");
  const wants = (value: string) => outcome === value || outcome === "complete";
  const overviewTasks: Array<[string, NonNullable<WorkflowData["steps"][number]["module"]>]> = [[t.profileStep, "school"], [t.academicStep, "academics"], [t.calendarStep, "timetable"]];
  if (wants("exams")) overviewTasks.push([t.curriculumStep, "curriculum"], [t.assessmentStep, "assessment"]);
  if (wants("timetable")) overviewTasks.push([t.timetableStep, "timetable"]);
  if (wants("fees")) overviewTasks.push([t.feesStep, "fees"]);
  if (wants("records") || data.path !== "new") overviewTasks.push([t.recordsStep, "students"]);
  overviewTasks.push([t.communicationStep, "communications"]);
  workflow("launch-plan", t.overview, core, overviewTasks, [...(!["exams", "timetable", "fees", "records", "complete"].includes(outcome) && answer("firstOutcome") ? [`${t.confirm}: ${label("firstOutcome")}`] : []), ...(data.path !== "new" ? [...missing(["migrationSource"]), t.migration] : [])]);

  const yearMatch = /^(20\d{2}|2100)(?:\s*[-–/]\s*(20\d{2}|2100|\d{2}))?$/.exec(asciiDigits(answer("academicYear")));
  const classes = academicClasses(answer("grades"));
  const validDates = answer("startDate") && answer("endDate") && !validateSetupAnswer("startDate", answer("startDate"), data.answers) && !validateSetupAnswer("endDate", answer("endDate"), data.answers);
  const startingYear = yearMatch ? Number(yearMatch[1]) : null;
  const endingYear = !yearMatch?.[2] ? null : yearMatch[2].length === 4 ? Number(yearMatch[2]) : Math.floor(startingYear! / 100) * 100 + Number(yearMatch[2]) + (Number(yearMatch[2]) < startingYear! % 100 ? 100 : 0);
  const year = startingYear && (endingYear === null || endingYear === startingYear + 1) ? startingYear : null;
  const datesWithinYear = year && validDates && ["startDate", "endDate"].every(key => Math.abs(Number(data.answers[key as SetupAnswerKey]?.slice(0, 4)) - year) <= 1);
  const academicProposal: AcademicSetupProposal | undefined = year && classes ? { operation: "academics.setup_year", academicYear: year, label: answer("academicYear").slice(0, 120), startDate: datesWithinYear ? answer("startDate") : null, endDate: datesWithinYear ? answer("endDate") : null, classes } : undefined;
  workflow("academic-setup", t.academics, ["grades", "academicYear", "startDate", "endDate"], [[t.academicStep, "academics"]], [...(!year ? [t.year] : []), ...(!classes ? [t.classes] : []), ...(validDates && !datesWithinYear ? [t.year] : [])], academicProposal);
  if (classes) {
    const academic = result.at(-1)!;
    if (academic.kind === "WORKFLOW") academic.data.goal = `${academic.data.goal}\n\n${t.mode}`.slice(0, 4000);
  }

  const days = workingDays(answer("workingDays"));
  const dayFields = ["mondayClosed", "tuesdayClosed", "wednesdayClosed", "thursdayClosed", "fridayClosed", "saturdayClosed", "sundayClosed"] as const;
  const dayProposal: WorkflowData["proposal"] | undefined = days ? { operation: "setup.apply_changes", action: "WEEKENDS", sourceReference, rows: [Object.fromEntries(dayFields.map((field, index) => [field, !days.includes(index + 1)])) as Record<typeof dayFields[number], boolean>] } : undefined;
  workflow("working-days", t.calendar, ["workingDays", "timezone"], [[t.calendarStep, "timetable"]], days ? [] : [t.days], dayProposal);

  if (wants("exams")) workflow("curriculum-preparation", t.curriculum, ["grades", "academicYear", "curriculum", "assessmentPolicy"], [[t.curriculumStep, "curriculum"], [t.assessmentStep, "assessment"]], [t.missingCurriculum]);
  if (wants("timetable")) workflow("timetable-preparation", t.timetable, ["grades", "academicYear", "workingDays", "resources", "staff"], [[t.timetableStep, "timetable"]], [t.missingTimetable]);
  const periods = wants("timetable") ? teachingPeriods(answer("resources")) : null;
  if (periods) workflow("teaching-periods", ["Teaching period draft", "تدریسی پیریڈ کا مسودہ", "مسودة الحصص الدراسية"][languageIndex], ["resources"], [[t.calendarStep, "timetable"]], [], { operation: "setup.apply_changes", action: "PERIODS", sourceReference, rows: periods });
  if (wants("records") || data.path !== "new") workflow("records-preparation", t.records, ["grades", "students", "staff", ...(data.path !== "new" ? ["migrationSource" as const] : [])], [[t.recordsStep, "students"]], [t.missingRecords]);

  const policy = (key: string, title: string, field: SetupAnswerKey, scope: PolicyData["scope"]) => {
    const unresolved = missing([field]);
    result.push({ key, title, kind: "POLICY", data: { mode: "approval_required", scope, requiresApproval: true, instructions: `${title}\n${provenance}\n\n${label(field)}:\n${answer(field) || t.unknown}\n\n${unresolved.join("\n")}\n\n${t.policyReview}\n\n${t.review}`.slice(0, 12000) } });
  };
  if (wants("fees")) policy("fee-policy", t.fees, "feePolicy", "finance");
  if (wants("exams")) policy("assessment-policy", t.assessment, "assessmentPolicy", "academics");
  policy("communications-policy", t.communications, "communications", "communications");
  return result;
}
