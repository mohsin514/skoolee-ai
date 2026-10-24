import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { schoolToday } from "@/lib/datetime";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The student's first-login sheet (Appendix D, STUDENT): about 90 seconds, warm, private by default.
 * It builds "My study plan" from the student's own class subjects and free time, saves one private
 * goal (shared only if the student chooses an audience and confirms), and can ask for a counsellor
 * meeting, which stays "requested" until the counsellor accepts.
 */
export interface StudentPrefill {
  today: string;
  language: string | null;
  className: string | null;
  subjects: string[];
  weekend: number[];
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const DAYS: Record<number, L10n> = { 1: l("Monday", "الاثنين", "پیر"), 2: l("Tuesday", "الثلاثاء", "منگل"), 3: l("Wednesday", "الأربعاء", "بدھ"), 4: l("Thursday", "الخميس", "جمعرات"), 5: l("Friday", "الجمعة", "جمعہ"), 6: l("Saturday", "السبت", "ہفتہ"), 7: l("Sunday", "الأحد", "اتوار") };
const TIMES = [{ id: "16", label: "16:00–17:00" }, { id: "18", label: "18:00–19:00" }, { id: "20", label: "20:00–21:00" }];
const TARGETS = { NEXT_TEST: l("My next class test", "اختباري القادم", "میرا اگلا ٹیسٹ"), HOMEWORK: l("Keeping up with homework", "مواكبة الواجبات", "ہوم ورک وقت پر"), TERM_EXAMS: l("End-of-term exams", "امتحانات نهاية الفصل", "ٹرم کے امتحانات") } as const;

async function prefill(ctx: CapabilityContext): Promise<StudentPrefill> {
  const { user } = ctx;
  const [profile, student, today] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
    prisma.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { class: { select: { name: true, section: true, subjects: { select: { name: true }, orderBy: { name: "asc" }, take: 20 } } } } }),
    schoolToday(user.schoolId, user.campusId),
  ]);
  return {
    today, language: profile?.preferredLanguage ?? null,
    className: student ? [student.class.name, student.class.section].filter(Boolean).join(" ") : null,
    subjects: [...new Set(student?.class.subjects.map(subject => subject.name) ?? [])], weekend: [],
  };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const addDays = (day: string, days: number) => { const at = new Date(`${day}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10); };

export const STUDENT_QUESTIONNAIRE: QuestionnaireDefinition<StudentPrefill> = {
  key: "student", roles: ["STUDENT"], version: 1,
  title: l("My study plan", "خطتي الدراسية", "میرا مطالعہ منصوبہ"),
  sheets: [l("You", "أنت", "آپ"), l("Your plan", "خطتك", "آپ کا منصوبہ")],
  prefill,
  known: (p, locale) => [
    { label: l("Class", "الفصل", "کلاس"), value: p.className ?? l("Ask your school office", "اسأل مكتب المدرسة", "اسکول دفتر سے پوچھیں")[locale] },
    { label: l("Subjects", "المواد", "مضامین"), value: p.subjects.join(", ") || "—" },
  ],
  questions: [
    {
      key: "language", sheet: 0, required: true, drives: ["profile.update"], cls: "A",
      prompt: l("Which language should Skoolee use with you?", "بأي لغة يتحدث معك Skoolee؟", "اسکولی آپ سے کس زبان میں بات کرے؟"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("en", l("English", "الإنجليزية", "انگریزی"), locale), opt("ar", l("Arabic", "العربية", "عربی"), locale), opt("ur", l("Urdu", "الأردية", "اردو"), locale)] }),
      answer: () => z.enum(["en", "ar", "ur"]),
      initial: p => p.language ?? undefined,
    },
    {
      key: "focusSubjects", sheet: 0, required: true, drives: ["personal.save_plan"], cls: "A",
      prompt: l("Which subjects do you want help with first?", "ما المواد التي تريد المساعدة فيها أولاً؟", "کن مضامین میں پہلے مدد چاہیے؟"),
      appliesWhen: p => p.subjects.length > 0,
      view: p => ({ kind: "multi", min: 1, options: p.subjects.map(subject => ({ value: subject, label: subject })) }),
      answer: p => z.array(z.string()).min(1).max(6).refine(value => value.every(subject => p.subjects.includes(subject)), "Only your class subjects"),
    },
    {
      key: "studyTimes", sheet: 1, required: true, drives: ["personal.save_plan"], cls: "A",
      prompt: l("When can you study outside school?", "متى يمكنك المذاكرة خارج المدرسة؟", "اسکول کے بعد کب پڑھ سکتے ہیں؟"),
      appliesWhen: p => p.subjects.length > 0,
      view: (_p, locale) => ({ kind: "schedule", weeks: { min: 1, max: 4 }, days: [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, label: DAYS[day][locale], slots: TIMES.map(time => ({ id: `${day}:${time.id}`, label: time.label, free: true })) })) }),
      answer: () => z.strictObject({ slots: z.array(z.string().regex(/^[1-7]:(16|18|20)$/)).min(1).max(21), weeks: z.number().int().min(1).max(4) }),
      initial: () => ({ slots: [], weeks: 2 }),
    },
    {
      key: "planTarget", sheet: 1, required: true, drives: ["personal.save_plan"], cls: "A",
      prompt: l("What should your plan get you ready for?", "لماذا تجهزك خطتك؟", "آپ کا منصوبہ کس کی تیاری کرائے؟"),
      view: (_p, locale) => ({ kind: "choice", options: (Object.keys(TARGETS) as Array<keyof typeof TARGETS>).map(value => opt(value, TARGETS[value], locale)) }),
      answer: () => z.enum(["NEXT_TEST", "HOMEWORK", "TERM_EXAMS"]),
    },
    {
      key: "termGoal", sheet: 1, required: false, drives: ["pathways.save_goal_private"], cls: "A",
      prompt: l("One goal for this term? Only you will see it.", "هدف واحد لهذا الفصل؟ أنت فقط تراه.", "اس ٹرم کا ایک مقصد؟ صرف آپ دیکھیں گے۔"),
      view: () => ({ kind: "text", placeholder: "Score 80% in Maths" }),
      answer: () => z.string().trim().min(3).max(200),
    },
    {
      key: "counsellorMeeting", sheet: 1, required: false, drives: [], cls: "A",
      prompt: l("Would you like to meet a counsellor?", "هل تريد لقاء المرشد؟", "کیا آپ کاؤنسلر سے ملنا چاہیں گے؟"),
      hint: l("You choose a time in Pathways; it stays a request until the counsellor confirms.", "تختار الوقت في المسارات ويبقى طلباً حتى يؤكد المرشد.", "وقت آپ پاتھ ویز میں چنیں گے؛ کاؤنسلر کی تصدیق تک یہ درخواست رہے گی۔"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("NO", l("Not now", "ليس الآن", "ابھی نہیں"), locale), opt("YES", l("Yes, please", "نعم، من فضلك", "جی ہاں"), locale)] }),
      answer: () => z.enum(["NO", "YES"]),
    },
  ],
  compile: compileStudent,
  remains: remainingStudent,
};

/** Answers → steps; the plan's sessions are dated from today, in the times the student chose. */
export function compileStudent(answers: Record<string, unknown>, p: StudentPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  if (typeof answers.language === "string" && answers.language !== p.language) add("language", "profile.update", { preferredLanguage: answers.language });

  const subjects = (answers.focusSubjects as string[] | undefined) ?? [];
  const times = answers.studyTimes as { slots: string[]; weeks: number } | undefined;
  const target = answers.planTarget as keyof typeof TARGETS | undefined;
  if (subjects.length && times?.slots.length && target) {
    const sessions: Array<{ title: string; detail: string; dueDate: string }> = [];
    let turn = 0;
    for (let day = 0; day < times.weeks * 7 && sessions.length < 30; day++) {
      const dateText = addDays(p.today, day);
      const weekday = ((new Date(`${dateText}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      for (const slot of times.slots.filter(id => Number(id.split(":")[0]) === weekday).sort()) {
        if (sessions.length >= 30) break;
        const subject = subjects[turn++ % subjects.length];
        sessions.push({ title: `${subject} · ${slot.split(":")[1]}:00`, detail: TARGETS[target].en, dueDate: dateText });
      }
    }
    if (sessions.length) add("planTarget", "personal.save_plan", { title: "My study plan", goal: `${TARGETS[target].en}: ${subjects.join(", ")}`, steps: sessions });
  }
  if (typeof answers.termGoal === "string" && answers.termGoal.trim()) add("termGoal", "pathways.save_goal_private", { title: answers.termGoal.trim() });
  return steps;
}

function remainingStudent(answers: Record<string, unknown>, p: StudentPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  if (!p.className) tasks.push({ title: l("Get added to your class", "الإضافة إلى فصلك", "اپنی کلاس میں شامل ہوں"), who: l("Your school office", "مكتب المدرسة", "اسکول دفتر") });
  // A meeting needs a real time the student picks; the sheet never invents one.
  if (answers.counsellorMeeting === "YES") tasks.push({ title: l("Choose a time to meet a counsellor", "اختر موعداً مع المرشد", "کاؤنسلر سے ملاقات کا وقت چنیں"), who: l("You, in Pathways (the counsellor confirms)", "أنت، في المسارات", "آپ، پاتھ ویز میں (کاؤنسلر تصدیق کریں گے)"), link: "/student" });
  tasks.push({ title: l("Hand in homework on time", "تسليم الواجبات في وقتها", "ہوم ورک وقت پر جمع کریں"), who: l("You, in Homework", "أنت، في الواجبات", "آپ، ہوم ورک میں"), link: "/student/assignments" });
  return tasks;
}
