import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { listSchoolsMissingCity } from "../../adapters/platform";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The platform owner's first-login sheet (Appendix D, APP_OWNER): an operator desk, not a school.
 * A private daily checklist and audited fixes to institutions missing a city. Pricing, capacity,
 * provisioning, payment onboarding and plan changes are never compiled: they stay prepared items on
 * the owner's own screens with step-up MFA (RT9).
 */
export interface OwnerPrefill { language: string | null; missingCity: Array<{ id: string; name: string }> }

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const FOCUS = { SUBSCRIPTIONS: l("Subscription requests", "طلبات الاشتراك", "سبسکرپشن درخواستیں"), PAYMENTS: l("Payment provider events", "أحداث مزود الدفع", "ادائیگی کے واقعات"), SUPPORT: l("Support access requests", "طلبات الدعم", "سپورٹ رسائی کی درخواستیں"), CAPACITY: l("Platform capacity", "سعة المنصة", "پلیٹ فارم کی گنجائش"), PILOTS: l("Pilots", "التجارب", "پائلٹ") } as const;

async function prefill(ctx: CapabilityContext): Promise<OwnerPrefill> {
  const [profile, missing] = await Promise.all([
    prisma.user.findFirst({ where: { id: ctx.user.userId }, select: { preferredLanguage: true } }),
    // Across schools, so only through the platform adapter's audited unscoped path (lint: runUnscoped lives there).
    listSchoolsMissingCity(ctx.user, 10).catch(() => []),
  ]);
  return { language: profile?.preferredLanguage ?? null, missingCity: missing };
}

export const OWNER_QUESTIONNAIRE: QuestionnaireDefinition<OwnerPrefill> = {
  key: "owner", roles: ["APP_OWNER"], version: 1,
  title: l("Your owner desk", "مكتب المالك", "آپ کا مالک ڈیسک"),
  sheets: [l("Your desk", "مكتبك", "آپ کا ڈیسک")],
  prefill,
  known: (p, locale) => [{ label: l("Schools missing a city", "مدارس بلا مدينة", "شہر کے بغیر اسکول"), value: String(p.missingCity.length) || l("None", "لا يوجد", "کوئی نہیں")[locale] }],
  questions: [
    {
      key: "language", sheet: 0, required: true, drives: ["profile.update"], cls: "A",
      prompt: l("Which language should your console use?", "بأي لغة تعمل وحدتك؟", "آپ کا کنسول کس زبان میں ہو؟"),
      view: (_p, locale) => ({ kind: "choice", options: [opt("en", l("English", "الإنجليزية", "انگریزی"), locale), opt("ar", l("Arabic", "العربية", "عربی"), locale), opt("ur", l("Urdu", "الأردية", "اردو"), locale)] }),
      answer: () => z.enum(["en", "ar", "ur"]),
      initial: p => p.language ?? undefined,
    },
    {
      key: "focusAreas", sheet: 0, required: true, drives: ["personal.save_plan"], cls: "A",
      prompt: l("What do you look after first each day?", "ماذا تتابع أولاً كل يوم؟", "روزانہ سب سے پہلے کیا دیکھتے ہیں؟"),
      view: (_p, locale) => ({ kind: "multi", min: 1, options: (Object.keys(FOCUS) as Array<keyof typeof FOCUS>).map(value => opt(value, FOCUS[value], locale)) }),
      answer: () => z.array(z.enum(Object.keys(FOCUS) as [keyof typeof FOCUS, ...Array<keyof typeof FOCUS>])).min(1),
    },
    {
      key: "institutionFixes", sheet: 0, required: false, drives: ["platform.update_institution"], cls: "B",
      prompt: l("These schools have no city. Add it now?", "هذه المدارس بلا مدينة. أضفها الآن؟", "ان اسکولوں کا شہر نہیں۔ ابھی شامل کریں؟"),
      appliesWhen: p => p.missingCity.length > 0,
      view: (p, locale) => ({ kind: "group", fields: p.missingCity.map(school => ({ key: school.id, label: school.name, view: { kind: "text" as const, placeholder: l("City", "المدينة", "شہر")[locale] }, optional: true })) }),
      answer: p => z.record(z.string(), z.string().trim().min(2).max(120)).refine(value => Object.keys(value).every(id => p.missingCity.some(school => school.id === id)), "Only listed schools"),
    },
  ],
  compile: compileOwner,
  remains: () => [
    { title: l("Default plan prices", "أسعار الخطط الافتراضية", "پلانز کی طے شدہ قیمتیں"), who: l("You, on Pricing (with a sign-in check)", "أنت، في التسعير", "آپ، قیمتوں میں (سائن ان تصدیق کے ساتھ)"), link: "/owner?view=pricing" },
    { title: l("Payment gateway onboarding", "ربط بوابة الدفع", "ادائیگی گیٹ وے"), who: l("You, on Payment settings", "أنت، في إعدادات الدفع", "آپ، ادائیگی سیٹنگز میں"), link: "/owner?view=payments" },
    { title: l("Provision new schools", "تجهيز مدارس جديدة", "نئے اسکول فراہم کریں"), who: l("You, on Schools", "أنت، في المدارس", "آپ، اسکولز میں"), link: "/owner?view=schools" },
  ] as RemainingTask[],
};

export function compileOwner(answers: Record<string, unknown>, p: OwnerPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  if (typeof answers.language === "string" && answers.language !== p.language) add("language", "profile.update", { preferredLanguage: answers.language });
  const focus = (answers.focusAreas as Array<keyof typeof FOCUS> | undefined) ?? [];
  if (focus.length) add("focusAreas", "personal.save_plan", { title: "My owner desk, each day", goal: "What I look after first", steps: focus.map(item => ({ title: FOCUS[item].en, detail: "/owner", dueDate: null })) });
  for (const [schoolId, city] of Object.entries((answers.institutionFixes as Record<string, string> | undefined) ?? {})) if (p.missingCity.some(school => school.id === schoolId)) add("institutionFixes", "platform.update_institution", { schoolId, city });
  return steps;
}
