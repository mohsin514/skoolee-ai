import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { schoolToday } from "@/lib/datetime";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The receptionist's first-login sheet (Appendix D, RECEPTIONIST): carry today's paper desk into
 * Skoolee. Callbacks owed, post waiting and enquiries being followed up are typed as rows; nothing is
 * invented and nothing is sent. Visitors still on site and complaints are entered on their own screens
 * (a visitor needs a host, a complaint may be confidential or a care matter, never typed through AI).
 */
export interface ReceptionistPrefill { language: string | null; today: string }

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const DOCUMENTS = { BONAFIDE: l("Enrolment (bonafide) certificate", "شهادة قيد", "بونافائیڈ سرٹیفکیٹ"), CHARACTER: l("Character certificate", "شهادة حسن سيرة", "کریکٹر سرٹیفکیٹ"), LEAVING: l("School leaving certificate", "شهادة مغادرة", "اسکول لیونگ سرٹیفکیٹ"), FEE: l("Fee paid letter", "خطاب سداد الرسوم", "فیس ادائیگی کا خط") } as const;
const ROUTINE = ["Check the visitor book is closed", "Return keys", "Hand over post", "Callbacks for tomorrow", "Lock the front office"];

async function prefill(ctx: CapabilityContext): Promise<ReceptionistPrefill> {
  const { user } = ctx;
  const [profile, today] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
    schoolToday(user.schoolId, ctx.campusId),
  ]);
  return { language: profile?.preferredLanguage ?? null, today };
}

export const RECEPTIONIST_QUESTIONNAIRE: QuestionnaireDefinition<ReceptionistPrefill> = {
  key: "receptionist", roles: ["RECEPTIONIST"], version: 1,
  title: l("Your front desk, today", "مكتب الاستقبال اليوم", "آپ کا استقبالیہ، آج"),
  sheets: [l("You", "أنت", "آپ"), l("Today's desk", "مكتب اليوم", "آج کا ڈیسک")],
  prefill,
  known: (p) => [{ label: l("Today", "اليوم", "آج"), value: p.today }],
  questions: [
    {
      key: "language", sheet: 0, required: true, drives: ["profile.update"], cls: "A",
      prompt: l("Which language should your desk use?", "بأي لغة يعمل مكتبك؟", "آپ کا ڈیسک کس زبان میں ہو؟"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("en", l("English", "الإنجليزية", "انگریزی"), locale), opt("ar", l("Arabic", "العربية", "عربی"), locale), opt("ur", l("Urdu", "الأردية", "اردو"), locale)] }),
      answer: () => z.enum(["en", "ar", "ur"]),
      initial: p => p.language ?? undefined,
    },
    {
      key: "openCallbacks", sheet: 1, required: false, drives: ["front_desk.call_log"], cls: "A",
      prompt: l("Any callbacks you still owe?", "مكالمات عليك ردّها؟", "کوئی کال جس کا جواب دینا باقی ہے؟"),
      view: (_p, locale) => ({ kind: "table", maxRows: 30, columns: [
        { key: "name", label: l("Caller", "المتصل", "کال کرنے والا")[locale], type: "text" },
        { key: "phone", label: l("Phone", "الهاتف", "فون")[locale], type: "tel" },
        { key: "purpose", label: l("About", "الموضوع", "بارے میں")[locale], type: "text" },
      ] }),
      answer: () => z.array(z.record(z.string(), z.string().max(200))).max(30),
    },
    {
      key: "openPost", sheet: 1, required: false, drives: ["front_desk.postal_log"], cls: "A",
      prompt: l("Post or parcels at the desk, not handed over yet", "بريد أو طرود لم تُسلَّم بعد", "ڈاک یا پارسل جو ابھی حوالے نہیں ہوئے"),
      view: (_p, locale) => ({ kind: "table", maxRows: 30, columns: [
        { key: "addressee", label: l("For", "إلى", "کس کے لیے")[locale], type: "text" },
        { key: "sender", label: l("From", "من", "کس کی طرف سے")[locale], type: "text" },
        { key: "kind", label: l("Type", "النوع", "قسم")[locale], type: "choice", options: [opt("LETTER", l("Letter", "رسالة", "خط"), locale), opt("PARCEL", l("Parcel", "طرد", "پارسل"), locale)] },
      ] }),
      answer: () => z.array(z.record(z.string(), z.string().max(200))).max(30),
    },
    {
      key: "openEnquiries", sheet: 1, required: false, drives: ["enquiries.create"], cls: "B",
      prompt: l("Admission enquiries you are following up", "استفسارات قبول تتابعها", "داخلے کی انکوائریاں جن کا فالو اپ کر رہے ہیں"),
      view: (_p, locale) => ({ kind: "table", maxRows: 30, columns: [
        { key: "parentName", label: l("Parent", "ولي الأمر", "والدین")[locale], type: "text" },
        { key: "phone", label: l("Phone", "الهاتف", "فون")[locale], type: "tel" },
        { key: "childName", label: l("Child", "الطفل", "بچہ")[locale], type: "text" },
        { key: "grade", label: l("Grade wanted", "الصف المطلوب", "مطلوبہ جماعت")[locale], type: "text" },
      ] }),
      answer: () => z.array(z.record(z.string(), z.string().max(200))).max(30),
    },
    {
      key: "documentTypes", sheet: 1, required: false, drives: [], cls: "A",
      prompt: l("Which documents do families ask the desk for?", "ما الوثائق التي تطلبها الأسر؟", "والدین ڈیسک سے کون سے کاغذات مانگتے ہیں؟"),
      hint: l("You write each template's wording in Certificates; your administrator approves it before any is issued.", "تكتب نص كل قالب في الشهادات ويعتمده المدير.", "ہر سانچے کی عبارت آپ سرٹیفکیٹس میں لکھیں گے؛ منتظم منظور کرے گا۔"),
      view: (_p, locale) => ({ kind: "multi", options: (Object.keys(DOCUMENTS) as Array<keyof typeof DOCUMENTS>).map(value => opt(value, DOCUMENTS[value], locale)) }),
      answer: () => z.array(z.enum(Object.keys(DOCUMENTS) as [keyof typeof DOCUMENTS, ...Array<keyof typeof DOCUMENTS>])).max(4),
    },
    {
      key: "deskRoutine", sheet: 1, required: false, drives: ["personal.save_plan"], cls: "A",
      prompt: l("Your opening and closing checks", "فحوصات الافتتاح والإغلاق", "کھولنے اور بند کرنے کی جانچ"),
      view: () => ({ kind: "tags", max: 12, placeholder: "Return keys", suggestions: ROUTINE }),
      answer: () => z.array(z.string().trim().min(2).max(120)).max(12),
    },
  ],
  compile: compileReceptionist,
  remains: remainingReceptionist,
};

export function compileReceptionist(answers: Record<string, unknown>, p: ReceptionistPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  if (typeof answers.language === "string" && answers.language !== p.language) add("language", "profile.update", { preferredLanguage: answers.language });
  for (const row of (answers.openCallbacks as Array<Record<string, string>> | undefined) ?? []) {
    if ((row.name ?? "").trim().length < 2 || (row.phone ?? "").replace(/\D/g, "").length < 6) continue;
    add("openCallbacks", "front_desk.call_log", { name: row.name.trim(), phone: row.phone.trim(), direction: "IN", date: `${p.today}T09:00`, purpose: (row.purpose ?? "").trim() || "Callback owed", note: "Callback owed (carried in at setup)", sensitive: false });
  }
  for (const row of (answers.openPost as Array<Record<string, string>> | undefined) ?? []) {
    if ((row.addressee ?? "").trim().length < 2) continue;
    add("openPost", "front_desk.postal_log", { direction: "RECEIVE", toName: row.addressee.trim(), ...(row.sender?.trim() ? { fromName: row.sender.trim() } : {}), note: row.kind === "PARCEL" ? "Parcel at the desk (carried in at setup)" : "Letter at the desk (carried in at setup)" });
  }
  for (const row of (answers.openEnquiries as Array<Record<string, string>> | undefined) ?? []) {
    if ((row.parentName ?? "").trim().length < 2 || (row.phone ?? "").replace(/\D/g, "").length < 6) continue;
    const note = [row.childName?.trim() ? `Child: ${row.childName.trim()}` : "", row.grade?.trim() ? `Grade wanted: ${row.grade.trim()}` : ""].filter(Boolean).join(" · ");
    add("openEnquiries", "enquiries.create", { name: row.parentName.trim(), phone: row.phone.trim(), source: "WALK_IN", ...(note ? { note } : {}) });
  }
  const routine = (answers.deskRoutine as string[] | undefined) ?? [];
  if (routine.length) add("deskRoutine", "personal.save_plan", { title: "My desk routine", goal: "Opening and closing checks", steps: routine.map(item => ({ title: item, detail: "", dueDate: null })) });
  return steps;
}

function remainingReceptionist(answers: Record<string, unknown>): RemainingTask[] {
  const tasks: RemainingTask[] = [
    { title: l("Sign in anyone still on site from the paper visitor book", "تسجيل الزوار الموجودين من الدفتر الورقي", "کاغذی رجسٹر سے موجود مہمانوں کا اندراج"), who: l("You, in Visitors (each needs a host)", "أنت، في الزوار", "آپ، مہمانوں میں (ہر ایک کا میزبان)"), link: "/receptionist?view=visitors" },
    { title: l("Enter paper complaints", "إدخال الشكاوى الورقية", "کاغذی شکایات درج کریں"), who: l("You, in Complaints (safeguarding matters go to Care)", "أنت، في الشكاوى", "آپ، شکایات میں (حفاظتی معاملات کیئر کو)"), link: "/receptionist?view=complaints" },
  ];
  for (const kind of (answers.documentTypes as Array<keyof typeof DOCUMENTS> | undefined) ?? []) tasks.push({ title: l(`Write the template: ${DOCUMENTS[kind].en}`, `اكتب القالب: ${DOCUMENTS[kind].ar}`, `سانچہ لکھیں: ${DOCUMENTS[kind].ur}`), who: l("You, then your administrator approves", "أنت ثم يعتمد المدير", "آپ، پھر منتظم منظوری دے"), link: "/receptionist?view=certificates" });
  return tasks;
}
