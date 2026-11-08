import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { explainClosed } from "@/lib/attendance/rule";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The parent's first-login sheet (Appendix D, PARENT): about a minute. Children come only from active,
 * verified guardian links; invitations and trip consents stay the parent's own native taps (linked,
 * never answered here). Phone and channel changes go to the profile screens with step-up (RT15).
 * Open absences can be explained in one tap and read "pending school review".
 */
export interface ParentPrefill {
  language: string | null;
  children: Array<{ id: string; name: string; className: string }>;
  pendingInvitations: number;
  absences: Array<{ id: string; childId: string; childName: string; date: string }>;
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const REASONS = { ILL: l("Unwell", "مريض", "بیمار"), FAMILY: l("Family matter", "ظرف عائلي", "خاندانی مصروفیت"), TRAVEL: l("Travelling", "سفر", "سفر"), APPOINTMENT: l("Doctor's appointment", "موعد طبي", "ڈاکٹر سے ملاقات") } as const;
const GOALS = { HOMEWORK: l("Homework and deadlines", "الواجبات والمواعيد", "ہوم ورک اور آخری تاریخیں"), FEES: l("Fee due dates", "مواعيد الرسوم", "فیس کی تاریخیں"), TESTS: l("Tests and results", "الاختبارات والنتائج", "ٹیسٹ اور نتائج"), MEETINGS: l("Parent meetings", "لقاءات أولياء الأمور", "والدین کی ملاقاتیں"), ATTENDANCE: l("Attendance", "الحضور", "حاضری") } as const;

async function prefill(ctx: CapabilityContext): Promise<ParentPrefill> {
  const { user } = ctx;
  const [profile, links, invited] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
    prisma.guardianRelationship.findMany({ where: { schoolId: user.schoolId, guardianUserId: user.userId, status: "ACTIVE" }, select: { studentId: true, student: { select: { fullName: true, class: { select: { name: true, section: true } } } } }, take: 10 }),
    prisma.guardianRelationship.count({ where: { schoolId: user.schoolId, guardianUserId: user.userId, status: "INVITED" } }),
  ]);
  const children = [...new Map(links.map(link => [link.studentId, { id: link.studentId, name: link.student.fullName, className: [link.student.class.name, link.student.class.section].filter(Boolean).join(" ") }])).values()];
  // Only children whose attendance this guardian may see, only days still inside the explain window, only rows nobody explained.
  const visible = (await Promise.all(children.map(async child => ((await guardianHasAccess({ schoolId: user.schoolId, studentId: child.id, guardianUserId: user.userId, permission: "attendance" })) ? child : null)))).filter((child): child is ParentPrefill["children"][number] => Boolean(child));
  const rows = visible.length ? await prisma.attendance.findMany({ where: { schoolId: user.schoolId, studentId: { in: visible.map(child => child.id) }, status: "ABSENT", date: { gte: new Date(Date.now() - 21 * 86_400_000) }, explanations: { none: {} } }, select: { id: true, studentId: true, date: true }, orderBy: { date: "desc" }, take: 6 }) : [];
  return {
    language: profile?.preferredLanguage ?? null, children, pendingInvitations: invited,
    absences: rows.filter(row => !explainClosed(row.date)).map(row => ({ id: row.id, childId: row.studentId, childName: visible.find(child => child.id === row.studentId)!.name, date: row.date.toISOString().slice(0, 10) })),
  };
}

export const PARENT_QUESTIONNAIRE: QuestionnaireDefinition<ParentPrefill> = {
  key: "parent", roles: ["PARENT"], version: 1,
  title: l("Your family at school", "عائلتك في المدرسة", "اسکول میں آپ کا خاندان"),
  sheets: [l("Your family", "عائلتك", "آپ کا خاندان")],
  prefill,
  known: (p, locale) => [
    { label: l("Your children", "أطفالك", "آپ کے بچے"), value: p.children.map(child => `${child.name} · ${child.className}`).join(", ") || l("None linked yet: ask the school office", "لا يوجد ربط بعد: اسأل مكتب المدرسة", "ابھی کوئی منسلک نہیں: اسکول دفتر سے پوچھیں")[locale] },
    ...(p.pendingInvitations ? [{ label: l("Invitations to review", "دعوات للمراجعة", "جائزے کے لیے دعوت نامے"), value: String(p.pendingInvitations), editLink: "/parent" }] : []),
  ],
  questions: [
    {
      key: "childrenCheck", sheet: 0, required: true, drives: ["chat.message_office"], cls: "C",
      prompt: l("Are these your children and classes?", "هل هؤلاء أطفالك وفصولهم؟", "کیا یہ آپ کے بچے اور ان کی کلاسیں ہیں؟"),
      hint: l("If something is wrong, a note is prepared for the school office. Children are only ever linked by the school.", "إن كان هناك خطأ تُجهَّز رسالة لمكتب المدرسة.", "اگر کچھ غلط ہے تو اسکول دفتر کے لیے پیغام تیار ہوگا۔ بچوں کو صرف اسکول جوڑتا ہے۔"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("CORRECT", l("Yes, that's right", "نعم، صحيح", "جی، درست ہے"), locale), opt("MISSING", l("A child is missing", "طفل غير موجود", "ایک بچہ شامل نہیں"), locale), opt("WRONG", l("Something is wrong", "هناك خطأ", "کچھ غلط ہے"), locale)] }),
      answer: () => z.enum(["CORRECT", "MISSING", "WRONG"]),
    },
    {
      key: "language", sheet: 0, required: true, drives: ["profile.update"], cls: "A",
      prompt: l("Which language should Skoolee use with you?", "بأي لغة يتحدث معك Skoolee؟", "اسکولی آپ سے کس زبان میں بات کرے؟"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("en", l("English", "الإنجليزية", "انگریزی"), locale), opt("ar", l("Arabic", "العربية", "عربی"), locale), opt("ur", l("Urdu", "الأردية", "اردو"), locale)] }),
      answer: () => z.enum(["en", "ar", "ur"]),
      initial: p => p.language ?? undefined,
    },
    {
      key: "familyGoals", sheet: 0, required: false, drives: ["personal.save_plan"], cls: "A",
      prompt: l("What would you like help keeping on top of?", "ما الذي تريد المساعدة في متابعته؟", "کن باتوں پر نظر رکھنے میں مدد چاہیے؟"),
      appliesWhen: p => p.children.length > 0,
      view: (_p, locale) => ({ kind: "multi", options: (Object.keys(GOALS) as Array<keyof typeof GOALS>).map(value => opt(value, GOALS[value], locale)) }),
      answer: () => z.array(z.enum(Object.keys(GOALS) as [keyof typeof GOALS, ...Array<keyof typeof GOALS>])).max(5),
    },
    {
      key: "openAbsences", sheet: 0, required: false, drives: ["parent.explain_absence"], cls: "B",
      prompt: l("These absences have no reason yet. What happened?", "هذه الغيابات بلا سبب بعد. ماذا حدث؟", "ان غیر حاضریوں کی وجہ ابھی نہیں دی گئی۔ کیا ہوا تھا؟"),
      hint: l("Each note goes to the school for review; it does not change the register by itself.", "تذهب كل ملاحظة للمدرسة للمراجعة.", "ہر نوٹ جائزے کے لیے اسکول جائے گا؛ یہ خود رجسٹر نہیں بدلتا۔"),
      appliesWhen: p => p.absences.length > 0,
      view: (p, locale) => ({ kind: "per-row-choice", rows: p.absences.map(row => ({ id: row.id, label: `${row.childName} · ${row.date}`, options: (Object.keys(REASONS) as Array<keyof typeof REASONS>).map(value => opt(value, REASONS[value], locale)) })) }),
      answer: p => z.record(z.string(), z.enum(Object.keys(REASONS) as [keyof typeof REASONS, ...Array<keyof typeof REASONS>])).refine(value => Object.keys(value).every(id => p.absences.some(row => row.id === id)), "Only open absences"),
    },
  ],
  compile: compileParent,
  remains: remainingParent,
};

export function compileParent(answers: Record<string, unknown>, p: ParentPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  if (typeof answers.language === "string" && answers.language !== p.language) add("language", "profile.update", { preferredLanguage: answers.language });
  if (answers.childrenCheck === "MISSING" || answers.childrenCheck === "WRONG") add("childrenCheck", "chat.message_office", {
    message: `${answers.childrenCheck === "MISSING" ? "One of my children is missing from" : "Something is wrong in"} my linked children (${p.children.map(child => `${child.name}, ${child.className}`).join("; ") || "none linked"}). Please check.`,
  });
  const goals = (answers.familyGoals as Array<keyof typeof GOALS> | undefined) ?? [];
  if (goals.length) add("familyGoals", "personal.save_plan", { title: "Keeping on top of school", goal: "What I want to follow for my children", steps: goals.map(goal => ({ title: GOALS[goal].en, detail: "/parent", dueDate: null })) });
  for (const [attendanceId, reason] of Object.entries((answers.openAbsences as Record<string, keyof typeof REASONS> | undefined) ?? {})) {
    const row = p.absences.find(item => item.id === attendanceId);
    if (row) add("openAbsences", "parent.explain_absence", { child: row.childName, date: row.date, reason: REASONS[reason].en });
  }
  return steps;
}

function remainingParent(_answers: Record<string, unknown>, p: ParentPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  if (p.pendingInvitations) tasks.push({ title: l("Review your guardian invitations (Accept or Not me)", "راجع دعوات ولي الأمر", "سرپرست کے دعوت نامے دیکھیں (قبول یا میں نہیں)"), who: l("You, on your home screen", "أنت، في الشاشة الرئيسية", "آپ، ہوم اسکرین پر"), link: "/parent" });
  if (!p.children.length) tasks.push({ title: l("Get your children linked", "ربط أطفالك", "اپنے بچوں کو منسلک کروائیں"), who: l("Your school office", "مكتب المدرسة", "اسکول دفتر") });
  tasks.push(
    { title: l("Check your phone number and how updates reach you", "تحقق من رقمك وطريقة وصول التحديثات", "اپنا نمبر اور اطلاعات کا طریقہ دیکھیں"), who: l("You, in Profile (with a security check)", "أنت، في الملف الشخصي", "آپ، پروفائل میں (سیکیورٹی تصدیق کے ساتھ)"), link: "/parent?settings=profile" },
    { title: l("Answer trip consent requests", "الرد على طلبات موافقة الرحلات", "سفر کی اجازت کی درخواستوں کا جواب دیں"), who: l("You, when one arrives", "أنت عند وصولها", "آپ، جب آئے"), link: "/parent" },
  );
  return tasks;
}
