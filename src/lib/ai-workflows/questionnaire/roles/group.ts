import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { PLANS, normalizePlan } from "@/config/plans";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The group owner's first-login sheet (Appendix D, SUPER_ADMIN): the group path that was a dead end
 * (setup-role.ts sent group owners to a readiness page with no questionnaire). Campuses inside the plan,
 * the people who run each one, staff ranks and group-wide messaging rules. Group standards are drafted
 * and submitted, never live until the named reviewer approves; each campus admin then answers their own
 * sheet, tracked on the launch board.
 */
export interface GroupPrefill {
  language: string | null;
  campuses: Array<{ id: string; name: string; city: string }>;
  maxCampuses: number;
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const STRUCTURES = { SCHOOL: l("School (K–12)", "مدرسة", "اسکول (K–12)"), COLLEGE: l("College", "كلية", "کالج"), UNIVERSITY: l("University", "جامعة", "یونیورسٹی"), ACADEMY: l("Academy", "أكاديمية", "اکیڈمی") } as const;

async function prefill(ctx: CapabilityContext): Promise<GroupPrefill> {
  const { user } = ctx;
  const [profile, school, campuses] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
    prisma.school.findUnique({ where: { id: user.schoolId }, select: { plan: true } }),
    prisma.campus.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true, city: true }, orderBy: { createdAt: "asc" }, take: 50 }),
  ]);
  return { language: profile?.preferredLanguage ?? null, campuses: campuses.map(row => ({ id: row.id, name: row.name, city: row.city ?? "" })), maxCampuses: PLANS[normalizePlan(school?.plan)].maxCampuses };
}

const room = (p: GroupPrefill) => (p.maxCampuses < 0 ? Infinity : Math.max(0, p.maxCampuses - p.campuses.length));

export const GROUP_QUESTIONNAIRE: QuestionnaireDefinition<GroupPrefill> = {
  key: "group", roles: ["SUPER_ADMIN"], version: 1,
  title: l("Your group, built live", "مجموعتك، تُبنى أمامك", "آپ کا گروپ، ابھی تیار"),
  sheets: [l("Campuses", "الفروع", "کیمپس"), l("Group rules", "قواعد المجموعة", "گروپ کے قواعد")],
  prefill,
  known: (p, locale) => [
    { label: l("Campuses", "الفروع", "کیمپس"), value: p.campuses.map(row => row.name).join(", ") || "—" },
    { label: l("Your plan allows", "تسمح خطتك بـ", "آپ کا پلان اجازت دیتا ہے"), value: p.maxCampuses < 0 ? l("Unlimited campuses", "فروع غير محدودة", "لامحدود کیمپس")[locale] : `${p.maxCampuses}` },
  ],
  questions: [
    {
      key: "newCampuses", sheet: 0, required: false, drives: ["campus.create"], cls: "B",
      prompt: l("Any campus you'll open this year that isn't listed?", "فروع ستفتح هذا العام غير مدرجة؟", "اس سال کوئی نیا کیمپس جو فہرست میں نہیں؟"),
      hint: l("Only as many as your plan covers are created; extra ones become a plan-change request.", "يُنشأ ما تسمح به خطتك فقط.", "صرف پلان کی حد تک بنیں گے؛ زائد کے لیے پلان بدلنے کی درخواست۔"),
      view: (_p, locale) => ({ kind: "table", maxRows: 20, columns: [
        { key: "name", label: l("Campus name", "اسم الفرع", "کیمپس کا نام")[locale], type: "text" },
        { key: "city", label: l("City", "المدينة", "شہر")[locale], type: "text" },
      ] }),
      answer: () => z.array(z.record(z.string(), z.string().max(120))).max(20),
    },
    {
      key: "staffStructure", sheet: 1, required: false, drives: ["staff.apply_hierarchy_preset"], cls: "B",
      prompt: l("What kind of institution are you? We'll set up the staff ranks.", "ما نوع مؤسستك؟ سنعد الرتب.", "آپ کا ادارہ کس قسم کا ہے؟ ہم عملے کے درجے بنائیں گے۔"),
      view: (_p, locale) => ({ kind: "choice", options: (Object.keys(STRUCTURES) as Array<keyof typeof STRUCTURES>).map(value => opt(value, STRUCTURES[value], locale)) }),
      answer: () => z.enum(Object.keys(STRUCTURES) as [keyof typeof STRUCTURES, ...Array<keyof typeof STRUCTURES>]),
    },
    {
      key: "messagingRules", sheet: 1, required: false, drives: ["chat.update_school_settings"], cls: "B",
      prompt: l("When can families message staff, across the group?", "متى يمكن للأسر مراسلة الموظفين؟", "پورے گروپ میں والدین کب پیغام بھیج سکتے ہیں؟"),
      view: (_p, locale) => ({ kind: "group", fields: [
        { key: "quietFrom", label: l("Quiet from", "هدوء من", "خاموشی از")[locale], view: { kind: "text", placeholder: "20:00", time: true } },
        { key: "quietTo", label: l("Quiet until", "هدوء حتى", "خاموشی تا")[locale], view: { kind: "text", placeholder: "07:00", time: true } },
        { key: "parentToParent", label: l("Parents can message each other", "مراسلة بين الأسر", "والدین آپس میں پیغام")[locale], view: { kind: "choice", options: [opt("NO", l("No", "لا", "نہیں"), locale), opt("YES", l("Yes", "نعم", "ہاں"), locale)] } },
      ] }),
      answer: () => z.strictObject({ quietFrom: z.string().regex(/^\d{2}:\d{2}$/), quietTo: z.string().regex(/^\d{2}:\d{2}$/), parentToParent: z.enum(["NO", "YES"]) }),
      initial: () => ({ quietFrom: "20:00", quietTo: "07:00", parentToParent: "NO" }),
    },
  ],
  compile: compileGroup,
  remains: remainingGroup,
};

export function compileGroup(answers: Record<string, unknown>, p: GroupPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  const known = new Set(p.campuses.map(row => row.name.toLowerCase()));
  const wanted = ((answers.newCampuses ?? []) as Array<Record<string, string>>).filter(row => (row.name ?? "").trim().length >= 2 && (row.city ?? "").trim().length >= 2 && !known.has(row.name.trim().toLowerCase()));
  // Within the plan only; the rest is a plan-change request the owner decides on the Subscription screen.
  for (const row of wanted.slice(0, room(p) === Infinity ? wanted.length : room(p))) add("newCampuses", "campus.create", { name: row.name.trim(), city: row.city.trim() });
  if (typeof answers.staffStructure === "string") add("staffStructure", "staff.apply_hierarchy_preset", { type: answers.staffStructure });
  const messaging = answers.messagingRules as { quietFrom: string; quietTo: string; parentToParent: "NO" | "YES" } | undefined;
  if (messaging) add("messagingRules", "chat.update_school_settings", { quietHoursEnabled: true, quietHoursStart: messaging.quietFrom, quietHoursEnd: messaging.quietTo, parentToParent: messaging.parentToParent === "YES" });
  return steps;
}

function remainingGroup(answers: Record<string, unknown>, p: GroupPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  const wanted = ((answers.newCampuses ?? []) as Array<Record<string, string>>).filter(row => (row.name ?? "").trim().length >= 2);
  if (room(p) !== Infinity && wanted.length > room(p)) tasks.push({ title: l(`Request a bigger plan for ${wanted.length - room(p)} more campus(es)`, "اطلب خطة أكبر لفروع إضافية", "مزید کیمپس کے لیے بڑا پلان مانگیں"), who: l("You, on Subscription", "أنت، في الاشتراك", "آپ، سبسکرپشن میں"), link: "/super?view=subscription" });
  tasks.push(
    { title: l("Invite each campus's administrator and principal (sent with your sign-in check)", "دعوة مدير ومدير مدرسة لكل فرع", "ہر کیمپس کے منتظم اور پرنسپل کو مدعو کریں"), who: l("You, in People & access", "أنت، في الأشخاص", "آپ، افراد اور رسائی میں"), link: "/super?view=people" },
    { title: l("Group grading and calendar standards (submitted, not live, until reviewed)", "معايير المجموعة (مقدمة وغير نافذة حتى المراجعة)", "گروپ معیارات (جمع شدہ، جائزے تک نافذ نہیں)"), who: l("You, then your named reviewer", "أنت ثم المراجع", "آپ، پھر نامزد جائزہ کار"), link: "/super?view=standards" },
    { title: l("Each campus admin answers their own setup sheet", "يجيب كل مدير فرع عن ورقته", "ہر کیمپس منتظم اپنی شیٹ مکمل کرے"), who: l("Campus administrators (tracked on your launch board)", "مديرو الفروع", "کیمپس منتظمین (آپ کے لانچ بورڈ پر)") },
  );
  return tasks;
}
