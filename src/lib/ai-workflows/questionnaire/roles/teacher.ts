import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { capabilitiesFor } from "@/lib/navigation/capabilities";
import { schoolToday } from "@/lib/datetime";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import { classLabel } from "../../resolve/scope";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The teacher's first-login questionnaire (Appendix D, TEACHER): "Your week, built live". Allocations
 * come from records only; a teacher with none sees "Not assigned yet" and the academic lead gets a task.
 * Every answer compiles to a registry step without a model call.
 */
export interface TeacherPrefill {
  today: string;
  profile: { preferredLanguage: string | null; qualification: string | null; experience: string | null; subjectSpecialties: string[] };
  classTeacherOf: Array<{ id: string; label: string }>;
  subjects: Array<{ id: string; name: string; classId: string; classLabel: string; totalMarks: number; topics: Array<{ id: string; title: string }> }>;
  /** Weekday → periods with the teacher's own busy ones marked (1 = Monday). */
  week: Array<{ day: number; periods: Array<{ number: number; start: string; end: string; busy: boolean }> }>;
  activityStaff: boolean;
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const DAYS: Record<number, L10n> = { 1: l("Monday", "الاثنين", "پیر"), 2: l("Tuesday", "الثلاثاء", "منگل"), 3: l("Wednesday", "الأربعاء", "بدھ"), 4: l("Thursday", "الخميس", "جمعرات"), 5: l("Friday", "الجمعة", "جمعہ"), 6: l("Saturday", "السبت", "ہفتہ"), 7: l("Sunday", "الأحد", "اتوار") };

const FOCUS: Array<{ value: string; label: L10n; link: string; title: L10n }> = [
  { value: "REGISTER", label: l("Register", "سجل الحضور", "حاضری رجسٹر"), link: "/teacher/attendance", title: l("Take the register each morning", "تسجيل الحضور كل صباح", "ہر صبح حاضری لیں") },
  { value: "HOMEWORK", label: l("Homework", "الواجبات", "ہوم ورک"), link: "/teacher/homework", title: l("Set the first homework", "إعداد أول واجب", "پہلا ہوم ورک دیں") },
  { value: "TESTS", label: l("Class tests and marks", "الاختبارات والدرجات", "کلاس ٹیسٹ اور نمبر"), link: "/teacher/marks", title: l("Plan a class test and enter its marks", "خطط لاختبار وأدخل درجاته", "کلاس ٹیسٹ اور اس کے نمبر") },
  { value: "REMARKS", label: l("Report remarks", "ملاحظات التقارير", "رپورٹ کے تبصرے"), link: "/teacher/report-cards", title: l("Draft report remarks", "صياغة ملاحظات التقارير", "رپورٹ تبصرے لکھیں") },
  { value: "PAPERS", label: l("Papers (Exam Studio)", "الأوراق (استوديو الامتحانات)", "پرچے (ایگزام اسٹوڈیو)"), link: "/ai/studio", title: l("Prepare a paper in Exam Studio", "إعداد ورقة في الاستوديو", "ایگزام اسٹوڈیو میں پرچہ بنائیں") },
  { value: "MEETINGS", label: l("Parent meetings", "لقاءات أولياء الأمور", "والدین سے ملاقاتیں"), link: "/teacher/meetings", title: l("Open parent meeting slots", "فتح مواعيد لقاءات", "ملاقات کے سلاٹ کھولیں") },
  { value: "RESOURCES", label: l("Resources", "المصادر", "وسائل"), link: "/teacher/resources", title: l("Share resources with classes", "مشاركة المصادر", "کلاسوں کے ساتھ وسائل") },
];
const LANGUAGES = [{ value: "en", label: l("English", "الإنجليزية", "انگریزی") }, { value: "ar", label: l("Arabic", "العربية", "عربی") }, { value: "ur", label: l("Urdu", "الأردية", "اردو") }];
const QUALIFICATIONS = ["Matric", "Intermediate", "Bachelor's", "B.Ed", "Master's", "M.Ed", "M.Phil", "PhD"];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

async function prefill(ctx: CapabilityContext): Promise<TeacherPrefill> {
  const { user } = ctx;
  const campusId = ctx.campusId ?? "";
  const scope = { schoolId: user.schoolId, campusId, archivedAt: null };
  const [profile, classes, subjects, periods, slots, today, caps] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true, qualification: true, experience: true, subjectSpecialties: true } }),
    prisma.class.findMany({ where: { ...scope, classTeacherId: user.userId }, select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }, { section: "asc" }], take: 20 }),
    prisma.subject.findMany({ where: { teacherId: user.userId, class: scope }, select: { id: true, name: true, classId: true, totalMarks: true, class: { select: { name: true, section: true } }, syllabusTopics: { select: { id: true, title: true }, orderBy: { order: "asc" }, take: 30 } }, orderBy: { name: "asc" }, take: 40 }),
    prisma.periodDefinition.findMany({ where: { schoolId: user.schoolId, campusId, timeType: "CLASS" }, select: { periodNumber: true, startTime: true, endTime: true }, orderBy: { periodNumber: "asc" } }),
    prisma.timetableSlot.findMany({ where: { schoolId: user.schoolId, teacherId: user.userId, timetable: { campusId } }, select: { dayOfWeek: true, periodNumber: true } }),
    schoolToday(user.schoolId, campusId || null),
    capabilitiesFor(user, new Map(ctx.permissions)).catch(() => null),
  ]);
  const busy = new Set(slots.map(slot => `${slot.dayOfWeek}:${slot.periodNumber}`));
  const days = [...new Set([1, 2, 3, 4, 5, ...slots.map(slot => slot.dayOfWeek)])].sort();
  return {
    today,
    profile: { preferredLanguage: profile?.preferredLanguage ?? null, qualification: profile?.qualification ?? null, experience: profile?.experience ?? null, subjectSpecialties: profile?.subjectSpecialties ?? [] },
    classTeacherOf: classes.map(row => ({ id: row.id, label: classLabel(row) })),
    subjects: subjects.map(row => ({ id: row.id, name: row.name, classId: row.classId, classLabel: classLabel(row.class), totalMarks: row.totalMarks, topics: row.syllabusTopics })),
    week: days.map(day => ({ day, periods: periods.map(period => ({ number: period.periodNumber, start: period.startTime, end: period.endTime, busy: busy.has(`${day}:${period.periodNumber}`) })) })),
    activityStaff: Boolean(caps?.activityStaff),
  };
}

const assigned = (p: TeacherPrefill) => p.classTeacherOf.length + p.subjects.length > 0;
const subjectLabel = (subject: TeacherPrefill["subjects"][number]) => `${subject.name} · ${subject.classLabel}`;

/** The next date (from today, inclusive) that falls on an ISO weekday. */
export function nextWeekday(from: string, weekday: number, weeksAhead = 0) {
  const start = new Date(`${from}T00:00:00Z`);
  const current = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + ((weekday - current + 7) % 7) + weeksAhead * 7);
  return start.toISOString().slice(0, 10);
}

const meetingSchema = z.strictObject({ slots: z.array(z.string().regex(/^\d:\d{1,2}$/)).min(1).max(20), weeks: z.number().int().min(1).max(6) });
const POLICIES = { H24: l("Cancel or change up to 24 hours before", "الإلغاء أو التغيير قبل 24 ساعة", "24 گھنٹے پہلے تک منسوخ یا تبدیل کریں"), H2: l("Cancel or change up to 2 hours before", "الإلغاء أو التغيير قبل ساعتين", "2 گھنٹے پہلے تک منسوخ یا تبدیل کریں"), OFFICE: l("Call the school office to cancel or change", "الاتصال بمكتب المدرسة للإلغاء أو التغيير", "منسوخی یا تبدیلی کے لیے اسکول دفتر فون کریں") };
const detailsSchema = z.strictObject({ mode: z.enum(["IN_PERSON", "REMOTE", "EITHER"]), slotMinutes: z.enum(["10", "15", "20"]), location: z.string().trim().min(1).max(120).optional(), policy: z.enum(["H24", "H2", "OFFICE"]) }).refine(value => value.mode === "REMOTE" || Boolean(value.location), { path: ["location"], message: "Where families meet you" });

export const TEACHER_QUESTIONNAIRE: QuestionnaireDefinition<TeacherPrefill> = {
  key: "teacher", roles: ["TEACHER"], version: 1,
  title: l("Your week, built live", "أسبوعك، يُبنى أمامك", "آپ کا ہفتہ، ابھی تیار"),
  sheets: [l("About you", "عنك", "آپ کے بارے میں"), l("Your classes", "فصولك", "آپ کی کلاسیں"), l("Your first weeks", "أسابيعك الأولى", "آپ کے پہلے ہفتے")],
  prefill,
  known: (p, locale) => [
    { label: l("Class teacher of", "معلم الفصل", "کلاس ٹیچر"), value: p.classTeacherOf.map(row => row.label).join(", ") || NOT_ASSIGNED[locale] },
    { label: l("Subjects you teach", "المواد التي تدرسها", "آپ کے مضامین"), value: p.subjects.map(subjectLabel).join(", ") || NOT_ASSIGNED[locale] },
    { label: l("Free periods this week", "الحصص الحرة هذا الأسبوع", "اس ہفتے فارغ پیریڈ"), value: String(p.week.reduce((sum, day) => sum + day.periods.filter(period => !period.busy).length, 0)) },
  ],
  questions: [
    {
      key: "assignmentCheck", sheet: 0, required: true, drives: ["readiness.update_task"], cls: "B",
      prompt: l("These are the classes and subjects the school gave you. Is this right?", "هذه الفصول والمواد التي أسندتها لك المدرسة. هل هذا صحيح؟", "اسکول نے آپ کو یہ کلاسیں اور مضامین دیے ہیں۔ کیا یہ درست ہے؟"),
      hint: l("If something is missing or wrong, your academic lead gets a task to fix it. You never assign yourself.", "إن كان هناك نقص أو خطأ، يتلقى المسؤول الأكاديمي مهمة لإصلاحه.", "اگر کچھ کم یا غلط ہے تو تعلیمی سربراہ کو درستی کا کام ملے گا۔ آپ خود کو تفویض نہیں کرتے۔"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("CORRECT", l("Correct", "صحيح", "درست"), locale), opt("MISSING", l("Something is missing", "هناك نقص", "کچھ کم ہے"), locale), opt("WRONG", l("Something is wrong", "هناك خطأ", "کچھ غلط ہے"), locale)] }),
      answer: () => z.enum(["CORRECT", "MISSING", "WRONG"]),
      initial: p => (assigned(p) ? undefined : "MISSING"),
    },
    {
      key: "preferredLanguage", sheet: 0, required: true, drives: ["profile.update"], cls: "A",
      prompt: l("Which language should Skoolee use with you?", "بأي لغة يتحدث معك Skoolee؟", "اسکولی آپ سے کس زبان میں بات کرے؟"),
      view: (_p, locale) => ({ kind: "choice", options: LANGUAGES.map(item => opt(item.value, item.label, locale)) }),
      answer: () => z.enum(["en", "ar", "ur"]),
      initial: p => p.profile.preferredLanguage ?? undefined,
    },
    {
      key: "professionalGaps", sheet: 0, required: false, drives: ["profile.update"], cls: "A",
      prompt: l("Add what's missing from your teaching profile.", "أضف ما ينقص ملفك التدريسي.", "اپنی تدریسی پروفائل میں جو کمی ہے وہ شامل کریں۔"),
      appliesWhen: p => !p.profile.qualification || !p.profile.experience || p.profile.subjectSpecialties.length === 0,
      view: (p, locale) => ({ kind: "group", fields: [
        ...(!p.profile.qualification ? [{ key: "qualification", label: l("Highest qualification", "أعلى مؤهل", "اعلیٰ ترین تعلیم")[locale], view: { kind: "choice" as const, options: QUALIFICATIONS.map(value => ({ value, label: value })) }, optional: true }] : []),
        ...(!p.profile.experience ? [{ key: "experienceYears", label: l("Years of teaching", "سنوات التدريس", "تدریس کے سال")[locale], view: { kind: "stepper" as const, min: 0, max: 45, step: 1 }, optional: true }] : []),
        ...(!p.profile.subjectSpecialties.length ? [{ key: "specialties", label: l("Subjects you specialise in", "تخصصك", "آپ کی مہارت کے مضامین")[locale], view: { kind: "tags" as const, max: 12, placeholder: "Mathematics", suggestions: [...new Set(p.subjects.map(subject => subject.name))] }, optional: true }] : []),
      ] }),
      answer: () => z.strictObject({ qualification: z.enum(QUALIFICATIONS as [string, ...string[]]).optional(), experienceYears: z.number().int().min(0).max(45).optional(), specialties: z.array(z.string().trim().min(1).max(100)).max(12).optional() }),
    },
    {
      key: "focusAreas", sheet: 0, required: true, drives: ["personal.save_plan"], cls: "A",
      prompt: l("What do you want ready first?", "ما الذي تريده جاهزاً أولاً؟", "سب سے پہلے کیا تیار چاہیے؟"),
      hint: l("This orders your first-fortnight checklist and the questions that follow.", "يرتب قائمة أسبوعيك الأولين والأسئلة التالية.", "اس سے پہلے دو ہفتوں کی فہرست اور اگلے سوالات ترتیب پاتے ہیں۔"),
      view: (_p, locale) => ({ kind: "multi", min: 1, options: FOCUS.map(item => opt(item.value, item.label, locale)) }),
      answer: () => z.array(z.enum(FOCUS.map(item => item.value) as [string, ...string[]])).min(1).max(FOCUS.length),
      initial: p => (p.classTeacherOf.length ? ["REGISTER"] : undefined),
    },
    {
      key: "startingUnits", sheet: 1, required: false, drives: ["work.save"], cls: "A",
      prompt: l("For each subject, which unit are you teaching first?", "لكل مادة، أي وحدة ستبدأ بها؟", "ہر مضمون میں آپ پہلے کون سا یونٹ پڑھائیں گے؟"),
      appliesWhen: p => p.subjects.some(subject => subject.topics.length > 0),
      view: p => ({ kind: "per-row-choice", rows: p.subjects.filter(subject => subject.topics.length).map(subject => ({ id: subject.id, label: subjectLabel(subject), options: subject.topics.map(topic => ({ value: topic.id, label: topic.title })) })) }),
      answer: p => z.record(z.string(), z.string()).refine(value => Object.entries(value).every(([subjectId, topicId]) => p.subjects.find(subject => subject.id === subjectId)?.topics.some(topic => topic.id === topicId)), "Unknown unit"),
    },
    {
      key: "meetingHours", sheet: 1, required: false, drives: ["meetings.open_window"], cls: "B",
      prompt: l("When can families book a meeting with you?", "متى يمكن للأسر حجز لقاء معك؟", "والدین آپ سے کب ملاقات بک کر سکتے ہیں؟"),
      hint: l("Only your free periods are offered. Each window is shown to you before it opens.", "تُعرض حصصك الحرة فقط، وتراجع كل نافذة قبل فتحها.", "صرف فارغ پیریڈ دکھائے گئے ہیں۔ ہر وقت کھلنے سے پہلے آپ کو دکھایا جائے گا۔"),
      appliesWhen: (p, answers) => assigned(p) && wants(answers, "MEETINGS"),
      view: (p, locale) => ({ kind: "schedule", weeks: { min: 1, max: 6 }, days: p.week.map(day => ({ day: day.day, label: DAYS[day.day][locale], slots: day.periods.map(period => ({ id: `${day.day}:${period.number}`, label: `${period.start}–${period.end}`, free: !period.busy })) })) }),
      answer: p => meetingSchema.refine(value => value.slots.every(id => { const [day, number] = id.split(":").map(Number); return p.week.find(row => row.day === day)?.periods.some(period => period.number === number && !period.busy); }), "Only free periods can be offered"),
    },
    {
      key: "meetingDetails", sheet: 1, required: false, drives: ["meetings.open_window"], cls: "B",
      prompt: l("How should those meetings run?", "كيف تُعقد هذه اللقاءات؟", "یہ ملاقاتیں کیسے ہوں؟"),
      appliesWhen: (_p, answers) => Boolean((answers.meetingHours as { slots?: unknown[] } | undefined)?.slots?.length),
      view: (_p, locale) => ({ kind: "group", fields: [
        { key: "mode", label: l("Meeting type", "نوع اللقاء", "ملاقات کی قسم")[locale], view: { kind: "choice", options: [opt("IN_PERSON", l("In person", "حضورياً", "بالمشافہ"), locale), opt("REMOTE", l("Online", "عبر الإنترنت", "آن لائن"), locale), opt("EITHER", l("Either", "أيهما", "دونوں"), locale)] } },
        { key: "slotMinutes", label: l("Minutes per family", "دقائق لكل أسرة", "فی خاندان منٹ")[locale], view: { kind: "choice", options: [10, 15, 20].map(value => ({ value: String(value), label: String(value) })) } },
        { key: "location", label: l("Where (not needed for online)", "المكان (غير مطلوب عبر الإنترنت)", "جگہ (آن لائن کے لیے ضروری نہیں)")[locale], view: { kind: "text", placeholder: "Room 12" }, optional: true },
        { key: "policy", label: l("How families cancel", "طريقة الإلغاء", "والدین کیسے منسوخ کریں")[locale], view: { kind: "choice", options: Object.entries(POLICIES).map(([value, label]) => opt(value, label, locale)) } },
      ] }),
      answer: () => detailsSchema,
      initial: () => ({ mode: "IN_PERSON", slotMinutes: "15", policy: "H24" }),
    },
    {
      key: "classTests", sheet: 2, required: false, drives: ["exams.create"], cls: "B",
      prompt: l("Create a first class test for which subjects?", "لأي مواد تنشئ اختباراً أول؟", "کن مضامین کا پہلا کلاس ٹیسٹ بنائیں؟"),
      hint: l("Each test is shown before it is created, with who will be notified. Its total comes from the subject.", "يُعرض كل اختبار قبل إنشائه مع من سيُبلَّغ.", "ہر ٹیسٹ بننے سے پہلے دکھایا جائے گا، اور کسے اطلاع جائے گی۔"),
      appliesWhen: (p, answers) => p.subjects.length > 0 && wants(answers, "TESTS"),
      view: p => ({ kind: "multi", options: p.subjects.map(subject => ({ value: subject.id, label: subjectLabel(subject) })) }),
      answer: p => z.array(z.string()).max(40).refine(value => value.every(id => p.subjects.some(subject => subject.id === id)), "Only your own subjects"),
    },
    {
      key: "marksEntry", sheet: 2, required: false, drives: ["marks_scan.create_template"], cls: "A",
      prompt: l("How will you enter marks for these tests?", "كيف ستدخل درجات هذه الاختبارات؟", "ان ٹیسٹوں کے نمبر کیسے درج کریں گے؟"),
      appliesWhen: (_p, answers) => Array.isArray(answers.classTests) && answers.classTests.length > 0,
      view: (_p, locale) => ({ kind: "choice", options: [opt("TYPE", l("Type them", "كتابتها", "ٹائپ کروں گا"), locale), opt("SCAN", l("Scan paper mark sheets", "مسح أوراق الدرجات", "کاغذی شیٹ اسکین کروں گا"), locale)] }),
      answer: () => z.enum(["TYPE", "SCAN"]),
    },
    {
      key: "weeklyDigest", sheet: 2, required: false, drives: ["digests.prepare"], cls: "A",
      prompt: l("Prepare a weekly update for your class's families?", "إعداد تحديث أسبوعي لأسر فصلك؟", "اپنی کلاس کے والدین کے لیے ہفتہ وار خبرنامہ تیار کریں؟"),
      hint: l("Only a draft is prepared. You read and send it yourself.", "تُجهَّز مسودة فقط، وأنت ترسلها بنفسك.", "صرف مسودہ تیار ہوگا، بھیجیں گے آپ خود۔"),
      appliesWhen: p => p.classTeacherOf.length > 0,
      view: (_p, locale) => ({ kind: "choice", options: [opt("NO", l("No", "لا", "نہیں"), locale), ...[4, 5, 6].map(day => opt(String(day), l(`Yes, on ${DAYS[day].en}`, `نعم، يوم ${DAYS[day].ar}`, `ہاں، ${DAYS[day].ur} کو`), locale))] }),
      answer: () => z.enum(["NO", "4", "5", "6"]),
    },
    {
      key: "resourceLinks", sheet: 2, required: false, drives: ["resources.create"], cls: "A",
      prompt: l("Any links you already use with these classes?", "روابط تستخدمها مع هذه الفصول؟", "کوئی لنک جو آپ ان کلاسوں کے ساتھ استعمال کرتے ہیں؟"),
      hint: l("Saved as drafts for staff only; you publish them to pupils later.", "تُحفظ مسودات للمعلمين فقط، وتنشرها لاحقاً.", "صرف اساتذہ کے لیے مسودہ؛ طلبہ کو بعد میں آپ شائع کریں گے۔"),
      appliesWhen: (p, answers) => p.subjects.length > 0 && wants(answers, "RESOURCES"),
      view: (p, locale) => ({ kind: "group", fields: [
        { key: "subjectId", label: l("For", "لمادة", "کس کے لیے")[locale], view: { kind: "choice", options: p.subjects.map(subject => ({ value: subject.id, label: subjectLabel(subject) })) } },
        { key: "urls", label: l("Links", "الروابط", "لنکس")[locale], view: { kind: "tags", max: 10, placeholder: "https://", url: true } },
      ] }),
      answer: p => z.strictObject({ subjectId: z.string().refine(id => p.subjects.some(subject => subject.id === id)), urls: z.array(z.string().url().startsWith("https://").max(500)).min(1).max(10) }),
    },
    {
      key: "activityLead", sheet: 2, required: false, drives: ["activities.create"], cls: "B",
      prompt: l("Do you run a club or activity this term?", "هل تدير نادياً أو نشاطاً هذا الفصل؟", "کیا آپ اس ٹرم کوئی کلب یا سرگرمی چلاتے ہیں؟"),
      hint: l("Its first session is shown to you before families can see it.", "تُعرض الجلسة الأولى عليك قبل أن تراها الأسر.", "پہلا سیشن والدین کو دکھنے سے پہلے آپ کو دکھایا جائے گا۔"),
      appliesWhen: p => p.activityStaff,
      view: (p, locale) => ({ kind: "group", fields: [
        { key: "title", label: l("Name", "الاسم", "نام")[locale], view: { kind: "text", placeholder: "Debate club" } },
        { key: "kind", label: l("Type", "النوع", "قسم")[locale], view: { kind: "choice", options: [opt("CLUB", l("Club", "نادٍ", "کلب"), locale), opt("SPORT", l("Sport", "رياضة", "کھیل"), locale)] } },
        { key: "date", label: l("First session", "الجلسة الأولى", "پہلا سیشن")[locale], view: { kind: "text", placeholder: p.today } },
        { key: "startTime", label: l("Starts", "يبدأ", "شروع")[locale], view: { kind: "text", placeholder: "14:00", time: true } },
        { key: "endTime", label: l("Ends", "ينتهي", "ختم")[locale], view: { kind: "text", placeholder: "15:00", time: true } },
        { key: "location", label: l("Where", "المكان", "جگہ")[locale], view: { kind: "text", placeholder: "Hall" } },
        { key: "capacity", label: l("Places", "المقاعد", "نشستیں")[locale], view: { kind: "stepper", min: 1, max: 200, step: 1 } },
        { key: "policy", label: l("How families cancel", "طريقة الإلغاء", "والدین کیسے منسوخ کریں")[locale], view: { kind: "choice", options: Object.entries(POLICIES).map(([value, label]) => opt(value, label, locale)) } },
      ] }),
      answer: p => z.strictObject({ title: z.string().trim().min(2).max(120), kind: z.enum(["CLUB", "SPORT"]), date: date.refine(value => value >= p.today, "From today"), startTime: time, endTime: time, location: z.string().trim().min(1).max(160), capacity: z.number().int().min(1).max(200), policy: z.enum(["H24", "H2", "OFFICE"]) }).refine(value => value.endTime > value.startTime, { path: ["endTime"], message: "Ends after it starts" }),
      initial: () => ({ kind: "CLUB", capacity: 20, policy: "H24" }),
    },
  ],
  compile: compileTeacher,
  remains: remainingTeacher,
};

const NOT_ASSIGNED = l("Not assigned yet", "لم يُسند بعد", "ابھی تفویض نہیں");
function wants(answers: Record<string, unknown>, focus: string) { return Array.isArray(answers.focusAreas) && answers.focusAreas.includes(focus); }

/** Answers → registry steps. Pure: the same confirmed answers always give the same steps and inputs. */
export function compileTeacher(answers: Record<string, unknown>, p: TeacherPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });

  const gaps = answers.professionalGaps as { qualification?: string; experienceYears?: number; specialties?: string[] } | undefined;
  const profile = {
    ...(typeof answers.preferredLanguage === "string" && answers.preferredLanguage !== p.profile.preferredLanguage ? { preferredLanguage: answers.preferredLanguage } : {}),
    ...(gaps?.qualification ? { qualification: gaps.qualification } : {}),
    ...(gaps?.experienceYears !== undefined ? { experience: `${gaps.experienceYears} years` } : {}),
    ...(gaps?.specialties?.length ? { subjectSpecialties: gaps.specialties } : {}),
  };
  if (Object.keys(profile).length) add("preferredLanguage", "profile.update", profile);

  if (answers.assignmentCheck === "MISSING" || answers.assignmentCheck === "WRONG") add("assignmentCheck", "readiness.update_task", {
    topic: "CLASS_ASSIGNMENT",
    request: `${answers.assignmentCheck === "MISSING" ? "Something is missing from" : "Something is wrong in"} my classes and subjects. Classes: ${p.classTeacherOf.map(row => row.label).join(", ") || "none"}; subjects: ${p.subjects.map(subjectLabel).join(", ") || "none"}.`,
  });

  const focus = Array.isArray(answers.focusAreas) ? (answers.focusAreas as string[]) : [];
  if (focus.length) add("focusAreas", "personal.save_plan", {
    title: "My first fortnight", goal: "Get my classes running in the first two weeks",
    steps: FOCUS.filter(item => focus.includes(item.value)).map(item => ({ title: item.title.en, detail: item.link, dueDate: null })),
  });

  for (const [subjectId, topicId] of Object.entries((answers.startingUnits as Record<string, string> | undefined) ?? {})) {
    const subject = p.subjects.find(row => row.id === subjectId);
    const topic = subject?.topics.find(row => row.id === topicId);
    if (!subject || !topic) continue;
    const start = subject.topics.indexOf(topic);
    add("startingUnits", "work.save", {
      goal: `Teaching plan: ${subject.name} ${subject.classLabel}, starting with ${topic.title}`,
      steps: subject.topics.slice(start, start + 6).map((row, index) => ({ id: `u${index + 1}`, title: row.title, status: "proposed", module: "curriculum" })),
      sourceIds: [], missingInformation: [], classId: subject.classId, subjectId: subject.id,
    });
  }

  const hours = answers.meetingHours as z.infer<typeof meetingSchema> | undefined;
  const details = answers.meetingDetails as z.infer<typeof detailsSchema> | undefined;
  if (hours && details) for (let week = 0; week < hours.weeks; week++) for (const id of [...hours.slots].sort()) {
    const [day, number] = id.split(":").map(Number);
    const period = p.week.find(row => row.day === day)?.periods.find(row => row.number === number);
    if (!period) continue;
    add("meetingHours", "meetings.open_window", { date: nextWeekday(p.today, day, week), start: period.start, end: period.end, slotMinutes: Number(details.slotMinutes), mode: details.mode, cancellationPolicy: POLICIES[details.policy].en, ...(details.location ? { location: details.location } : {}) });
  }

  for (const subjectId of (answers.classTests as string[] | undefined) ?? []) {
    const subject = p.subjects.find(item => item.id === subjectId);
    if (!subject) continue;
    const title = `${subject.name} class test 1`;
    add("classTests", "exams.create", { classId: subject.classId, subjectId, title, examType: "CLASS_TEST" });
    // The sheet can only be printed once the teacher has saved the test it belongs to.
    if (answers.marksEntry === "SCAN") { const test = steps[steps.length - 1].stepKey; add("marksEntry", "marks_scan.create_template", { exam: title, subjectId }); steps[steps.length - 1].dependsOn = [test]; }
  }

  if (typeof answers.weeklyDigest === "string" && answers.weeklyDigest !== "NO") for (const cls of p.classTeacherOf) add("weeklyDigest", "digests.prepare", { classId: cls.id });

  const links = answers.resourceLinks as { subjectId: string; urls: string[] } | undefined;
  const linkSubject = links && p.subjects.find(row => row.id === links.subjectId);
  if (links && linkSubject) for (const url of links.urls) add("resourceLinks", "resources.create", { classId: linkSubject.classId, subjectId: linkSubject.id, title: new URL(url).hostname, url });

  const activity = answers.activityLead as { title: string; kind: "CLUB" | "SPORT"; date: string; startTime: string; endTime: string; location: string; capacity: number; policy: keyof typeof POLICIES } | undefined;
  if (activity) add("activityLead", "activities.create", { kind: activity.kind, title: activity.title, location: activity.location, date: activity.date, startTime: activity.startTime, endTime: activity.endTime, capacity: activity.capacity, cancellationTerms: POLICIES[activity.policy].en });
  return steps;
}

function remainingTeacher(answers: Record<string, unknown>, p: TeacherPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  if (!assigned(p) || answers.assignmentCheck !== "CORRECT") tasks.push({ title: l("Correct your classes and subjects", "تصحيح فصولك وموادك", "اپنی کلاسیں اور مضامین درست کروائیں"), who: l("Your academic lead", "المسؤول الأكاديمي", "تعلیمی سربراہ") });
  if (typeof answers.weeklyDigest === "string" && answers.weeklyDigest !== "NO") tasks.push({ title: l("Read and send each weekly update", "مراجعة وإرسال كل تحديث أسبوعي", "ہر ہفتہ وار خبرنامہ پڑھ کر بھیجیں"), who: l("You, on the digest screen", "أنت، في شاشة التحديثات", "آپ، خبرنامہ اسکرین پر"), link: "/teacher/digests" });
  if (answers.resourceLinks) tasks.push({ title: l("Publish your links to pupils", "نشر الروابط للطلاب", "لنکس طلبہ کے لیے شائع کریں"), who: l("You, in Resources", "أنت، في المصادر", "آپ، وسائل میں"), link: "/teacher/resources" });
  tasks.push(
    { title: l("Release homework when it is ready", "إصدار الواجبات عند جاهزيتها", "ہوم ورک تیار ہو تو جاری کریں"), who: l("You, in Homework", "أنت، في الواجبات", "آپ، ہوم ورک میں"), link: "/teacher/homework" },
    { title: l("Write and seal papers", "كتابة الأوراق وختمها", "پرچے لکھیں اور سیل کریں"), who: l("Exam Studio", "استوديو الامتحانات", "ایگزام اسٹوڈیو"), link: "/ai/studio" },
    { title: l("Protect your account with two-step sign-in", "حماية حسابك بالتحقق بخطوتين", "دو مرحلہ سائن ان سے اکاؤنٹ محفوظ کریں"), who: l("You", "أنت", "آپ"), link: "/protect-account" },
  );
  return tasks;
}
