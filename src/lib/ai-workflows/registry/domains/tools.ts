import { prisma } from "@/lib/db/prisma";
import { USER_ROLES } from "@/lib/roles";
import { isCampusOperator } from "@/lib/auth/institution";
import { SCHOOL_AI_STAFF_ROLES } from "@/lib/school-ai/access";
import { getAssistantCatalog } from "@/lib/school-ai/assistant-catalog-service";
import { assistantCatalogQuerySchema } from "@/lib/school-ai/assistant-catalog";
import { createWorkspaceRecord } from "@/lib/school-ai/repository";
import { workspaceIdSchema, workflowModuleSchema } from "@/lib/school-ai/schemas";
import { executeRoleAction } from "../../adapters/tool-actions";
import { personalPlanSchema, phoneCallSchema, platformInspectSchema, platformUpdateSchema, profileActionSchema, studentsCreateSchema, type ToolAction } from "../../adapters/tool-schemas";
import { z } from "zod";
import { defineCapability } from "../define";
import { ownCampus, permission, predicate, roles } from "../gates";
import type { CapabilityContext, CapabilityEntry, EntryCopy, Receipt } from "../types";

/**
 * The first tool entries (formerly the automation engine's catalog). Their adapters live in
 * src/lib/ai-workflows/adapters and keep the original receipts and replay rules.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}

/** Adapts a legacy role-action receipt to the registry receipt. */
async function legacy(ctx: CapabilityContext, tool: ToolAction["tool"], title: string, data: unknown, idempotencyKey: string, link: string | null): Promise<Receipt> {
  const detail = await executeRoleAction(ctx.user, ctx.campusId, idempotencyKey, { tool, title, data } as ToolAction);
  const ids = Array.isArray(detail.ids) ? detail.ids.map(String) : detail.id ? [String(detail.id)] : [];
  return { kind: "write", capability: tool, entities: ids.map(id => ({ model: tool.split(".")[0], id })), counts: typeof detail.createdCount === "number" ? { created: detail.createdCount } : {}, link, replayed: false, detail };
}

const ALL = USER_ROLES;
/** A saved draft plan: the workflow record shape without `proposal`, so a draft can never carry an executable operation. */
const draftPlanSchema = z.strictObject({
  goal: z.string().trim().min(1).max(4000),
  steps: z.array(z.strictObject({ id: workspaceIdSchema, title: z.string().trim().min(1).max(500), status: z.enum(["proposed", "blocked", "ready"]), module: workflowModuleSchema.optional() })).min(1).max(30),
  sourceIds: z.array(workspaceIdSchema).max(40).default([]),
  missingInformation: z.array(z.string().max(1000)).max(50).default([]),
  // A teacher's plan belongs to one of their own subjects (school-ai access: assigned subject and class).
  classId: z.string().min(1).max(128).optional(),
  subjectId: z.string().min(1).max(128).optional(),
}).refine(value => new Set(value.steps.map(step => step.id)).size === value.steps.length, "Workflow step IDs must be unique.");
const STAFF = SCHOOL_AI_STAFF_ROLES;

export const TOOL_ENTRIES: readonly CapabilityEntry[] = [
  defineCapability({
    key: "assistant.app_knowledge", version: 1, cluster: "PERSONAL", inventoryKeys: ["assistant.app_knowledge"], risk: "READ", roles: ALL, class: "A",
    input: z.strictObject({ query: z.string().trim().max(1000).default("") }), evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Explain app features", "Explain how to use Skoolee, what your role can do, available workflows, approval requirements, published school policies, handbooks and documents. Retrieves permission-filtered knowledge with sources, not live school data.", "What can you do for my role?"], ["شرح ميزات التطبيق", "إرشادات موثقة عن استخدام سكولي وإجراءات دورك ومتطلبات الموافقة، وليست بيانات المدرسة الحالية.", "ماذا يمكنك أن تفعل لدوري؟"], ["ایپ کی خصوصیات سمجھائیں", "سکولی کے استعمال، آپ کے کردار کے کاموں اور منظوری کی تصدیق شدہ رہنمائی؛ اسکول کے موجودہ ریکارڈ نہیں۔", "آپ میرے کردار کے لیے کیا کر سکتے ہیں؟"]),
    idempotency: { mode: "convergent" }, source: { service: "src/lib/ai-workflows/planner/app-knowledge.ts:retrieveAppKnowledge", reuse: "direct" },
    execute: async (ctx, input) => {
      const { answerKnowledge } = await import("@/lib/rag/answer");
      const knowledge = input.query.length >= 3 ? await answerKnowledge(ctx.user, input.query, ctx.locale) : null;
      if (knowledge && (knowledge.sources.length || /\b(policy|policies|handbook|document|manual|rules|procedure)\b|پالیسی|دستاویز|سياسة|وثيقة/i.test(input.query) || knowledge.mode === "REFUSED" || knowledge.generation === "STALE")) {
        return { kind: "read", capability: "assistant.app_knowledge", entities: [], counts: { sources: knowledge.sources.length }, link: "/ai/knowledge", replayed: false, detail: knowledge };
      }
      const { retrieveAppKnowledge } = await import("../../planner/app-knowledge");
      const result = await retrieveAppKnowledge(ctx, input.query);
      return { kind: "read", capability: "assistant.app_knowledge", entities: [], counts: { sources: result.sources.length }, link: "/ai/can-do", replayed: false, detail: result };
    },
  }),
  defineCapability({
    key: "profile.update", version: 1, cluster: "PERSONAL", inventoryKeys: ["profile.update", "profile.update_own"], risk: "UPDATE", roles: ALL, class: "A",
    classOverride: "Own profile only.", input: profileActionSchema, evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Update my profile", "Change your own name, language, city or (teachers) teaching details.", "Set my language to Urdu"], ["تحديث ملفي", "تغيير اسمك أو لغتك أو مدينتك.", "اجعل لغتي العربية"], ["میری پروفائل اپ ڈیٹ کریں", "اپنا نام، زبان، شہر یا تدریسی تفصیل بدلیں۔", "میری زبان اردو کر دیں"]),
    idempotency: { mode: "tx-receipt" }, source: { service: "src/lib/ai-workflows/adapters/tool-actions.ts:executeRoleAction", reuse: "automation-tool" },
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "profile.update", "Update my profile", input, idempotencyKey, null),
  }),
  defineCapability({
    key: "personal.save_plan", version: 1, cluster: "PERSONAL", inventoryKeys: ["personal.save_plan"], risk: "CREATE", roles: ALL, class: "A",
    classOverride: "Private to its author.", input: personalPlanSchema, evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Save a private plan", "Save a personal study plan, checklist or schedule only you can see.", "Make me a revision plan for the maths test on Friday"], ["حفظ خطة خاصة", "حفظ خطة شخصية لا يراها غيرك.", "اصنع لي خطة مراجعة لاختبار الرياضيات"], ["نجی منصوبہ محفوظ کریں", "ذاتی منصوبہ جو صرف آپ دیکھ سکیں۔", "جمعہ کے ریاضی کے ٹیسٹ کی دہرائی کا منصوبہ بنائیں"]),
    idempotency: { mode: "tx-receipt" }, source: { service: "src/lib/ai-workflows/adapters/tool-actions.ts:executeRoleAction", reuse: "automation-tool" },
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "personal.save_plan", input.title, input, idempotencyKey, null),
  }),
  defineCapability({
    key: "students.create", version: 1, cluster: "C3", inventoryKeys: ["students.create"], risk: "CREATE", roles: ["ADMIN", "CAMPUS_ADMIN"], class: "B",
    input: studentsCreateSchema, evidence: ["/students"], gates: [roles(["ADMIN", "CAMPUS_ADMIN"]), ownCampus(), permission("students", "add")], scope: { kind: "own-campus" },
    copy: c(["Add students to the roster", "Create student records with their class and guardian contact; no accounts are invited.", "Add Ayesha Khan to 7B, roll 12, guardian phone 0300 1234567"], ["إضافة طلاب", "إنشاء سجلات طلاب مع الفصل وجهة اتصال ولي الأمر؛ دون دعوات حسابات.", "أضف عائشة خان إلى 7ب"], ["طلبہ شامل کریں", "کلاس اور سرپرست رابطے کے ساتھ طالب علم کے ریکارڈ؛ کوئی اکاؤنٹ دعوت نہیں۔", "عائشہ خان کو 7بی میں رول 12 پر شامل کریں"]),
    idempotency: { mode: "native" }, source: { route: "POST /api/students", service: "src/lib/students/create.ts:createStudentRecords", reuse: "wrapper" },
    preview: async (_ctx, input) => ({ title: "Add students", lines: input.students.map(row => ({ label: row.rollNo, value: row.fullName })), counts: { students: input.students.length }, basis: input }),
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "students.create", "Add students", input, idempotencyKey, "/admin?view=students"),
  }),
  // campus.create moved to domains/group/group.ts (Slice 8: rebuilt on addCampus, plan capacity, calendar seeding).
  defineCapability({
    key: "front_desk.call_log", version: 1, cluster: "C7", inventoryKeys: ["front_desk.call_log", "front_desk.log_call"], risk: "CREATE", roles: ["RECEPTIONIST", "ADMIN", "CAMPUS_ADMIN"], class: "A",
    classOverride: "Append-only record; nothing is sent.", input: phoneCallSchema, evidence: ["/name", "/phone", "/purpose"],
    gates: [predicate("canManageFrontDesk|isCampusOperator", user => user.role === "RECEPTIONIST" || isCampusOperator(user), ["RECEPTIONIST", "ADMIN", "CAMPUS_ADMIN"]), ownCampus(), permission("front-desk", "add")], scope: { kind: "own-campus" },
    copy: c(["Log a phone call", "Record an incoming or outgoing call with its purpose.", "Log a call from Mr Ahmed about admission at 10:30"], ["تسجيل مكالمة", "تسجيل مكالمة واردة أو صادرة مع الغرض.", "سجّل مكالمة من السيد أحمد عن القبول"], ["فون کال درج کریں", "آنے والی یا جانے والی کال مقصد کے ساتھ درج کریں۔", "داخلے کے بارے میں احمد صاحب کی کال درج کریں"]),
    idempotency: { mode: "native" }, source: { route: "POST /api/front-desk/phone-calls", service: "src/lib/front-desk/phone-calls.ts:logCall", reuse: "direct" },
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "front_desk.log_call", "Log a phone call", input, idempotencyKey, "/receptionist?view=phone-calls"),
  }),
  defineCapability({
    key: "platform.inspect", version: 1, cluster: "C8", inventoryKeys: ["platform.inspect"], risk: "READ", roles: ["APP_OWNER"], class: "A",
    input: platformInspectSchema, evidence: [], gates: [roles(["APP_OWNER"])], scope: { kind: "platform", unscopedReason: "authorized automatic platform administration" },
    copy: c(["Look up institutions", "Search institutions by name, or list schools missing a city using missingCity=true without a name search.", "List schools missing a city"], ["البحث عن المؤسسات", "البحث في مؤسسات المنصة.", "اعرض المدارس باسم النور"], ["ادارے تلاش کریں", "پلیٹ فارم کے ادارے تلاش کریں۔", "النور نام کے اسکول دکھائیں"]),
    idempotency: { mode: "convergent" }, source: { service: "src/lib/ai-workflows/adapters/platform.ts:executePlatformAction", reuse: "automation-tool" },
    execute: async (ctx, input, { idempotencyKey }) => {
      const receipt = await legacy(ctx, "platform.inspect", "Look up institutions", input, idempotencyKey, "/owner?view=schools");
      const detail = receipt.detail as { schools: Array<{ id: string; name: string; city: string }>; truncated: boolean };
      const empty = { en: "No schools match this filter.", ar: "لا توجد مدارس تطابق هذا المرشح.", ur: "اس فلٹر سے کوئی اسکول نہیں ملا۔" };
      const more = { en: "Showing the first 50 matches. Narrow the search for more specific results.", ar: "عرض أول 50 نتيجة. حدّد البحث للحصول على نتائج أدق.", ur: "پہلے 50 نتائج دکھائے گئے ہیں۔ مزید مخصوص نتائج کے لیے تلاش محدود کریں۔" };
      const text = detail.schools.length ? detail.schools.map(school => `${school.name}${school.city ? ` — ${school.city}` : ""}`).join("\n") : empty[ctx.locale];
      return { ...receipt, kind: "read", entities: detail.schools.map(school => ({ model: "school", id: school.id })), counts: { schools: detail.schools.length }, detail: { ...detail, text: detail.truncated ? `${text}\n${more[ctx.locale]}` : text } };
    },
  }),
  defineCapability({
    key: "platform.update_institution", version: 1, cluster: "C8", inventoryKeys: ["platform.update_institution"], risk: "UPDATE", roles: ["APP_OWNER"], class: "B",
    input: platformUpdateSchema, evidence: ["/name", "/city", "/website"], gates: [roles(["APP_OWNER"])], scope: { kind: "platform", unscopedReason: "authorized automatic platform administration" },
    copy: c(["Update an institution's profile", "Change an institution's name, city or website.", "Change Al-Noor's city to Lahore"], ["تحديث ملف مؤسسة", "تغيير اسم المؤسسة أو مدينتها أو موقعها.", "غيّر مدينة النور إلى جدة"], ["ادارے کی پروفائل اپ ڈیٹ کریں", "ادارے کا نام، شہر یا ویب سائٹ بدلیں۔", "النور کا شہر لاہور کریں"]),
    idempotency: { mode: "tx-receipt" }, source: { service: "src/lib/ai-workflows/adapters/platform.ts:executePlatformAction", reuse: "automation-tool" },
    preview: async (_ctx, input) => ({ title: "Update institution", lines: Object.entries(input).filter(([key]) => key !== "schoolId").map(([label, value]) => ({ label, value: String(value) })), counts: { institutions: 1 }, basis: input }),
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "platform.update_institution", "Update institution", input, idempotencyKey, "/owner?view=schools"),
  }),
  defineCapability({
    key: "school.inspect", version: 1, cluster: "C9", inventoryKeys: ["school.inspect"], risk: "READ", roles: ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT"], class: "A",
    input: z.union([assistantCatalogQuerySchema, z.strictObject({ entity: z.literal("classes") })]), evidence: [], gates: [roles(["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT"]), ownCampus()], scope: { kind: "own-campus" },
    copy: c(["Look up current school records", "For a campus class count use entity: classes. Otherwise read the current classes, teachers, rooms or other records an operation needs.", "Which classes have no timetable yet?"], ["الاطلاع على السجلات", "قراءة الفصول والمعلمين والقاعات الحالية.", "أي الفصول بلا جدول؟"], ["موجودہ ریکارڈ دیکھیں", "موجودہ کلاسیں، اساتذہ، کمرے وغیرہ پڑھیں۔", "کن کلاسوں کا ٹائم ٹیبل ابھی نہیں بنا؟"]),
    idempotency: { mode: "convergent" }, source: { service: "src/lib/school-ai/assistant-catalog-service.ts:getAssistantCatalog", reuse: "direct" },
    execute: async (ctx, input): Promise<Receipt> => {
      if ("entity" in input) {
        const classes = await prisma.class.count({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId!, archivedAt: null, status: "ACTIVE" } });
        return { kind: "read", capability: "school.inspect", entities: [], counts: { classes }, link: null, replayed: false, detail: { totalClasses: classes } };
      }
      const catalog = await getAssistantCatalog(ctx.user, ctx.campusId, input);
      return { kind: "read", capability: "school.inspect", entities: [], counts: { entities: catalog.entities.length }, link: null, replayed: false, detail: { operation: "school.inspect", ...catalog } };
    },
  }),
  defineCapability({
    key: "work.save", version: 1, cluster: "PERSONAL", inventoryKeys: ["work.save"], risk: "CREATE", roles: STAFF, class: "A",
    classOverride: "Saves an unapproved draft plan; no operational record changes.", input: draftPlanSchema, evidence: [], gates: [roles(STAFF), permission("ai", "add")], scope: { kind: "own-campus" },
    copy: c(["Save a work plan", "Save a draft work or teaching plan for later review; it changes no school records.", "Save a plan for next week's science lessons"], ["حفظ خطة عمل", "حفظ مسودة خطة عمل للمراجعة؛ لا تغير السجلات.", "احفظ خطة دروس العلوم للأسبوع القادم"], ["کام کا منصوبہ محفوظ کریں", "جائزے کے لیے مسودہ منصوبہ؛ اسکول ریکارڈ نہیں بدلتا۔", "اگلے ہفتے کے سائنس اسباق کا منصوبہ محفوظ کریں"]),
    idempotency: { mode: "native" }, source: { service: "src/lib/school-ai/repository.ts:createWorkspaceRecord", reuse: "direct" },
    execute: async (ctx, input, { idempotencyKey }) => {
      const record = await createWorkspaceRecord(ctx.user, { kind: "WORKFLOW", title: input.goal.slice(0, 180), campusId: ctx.campusId, idempotencyKey, data: input });
      return { kind: "draft", capability: "work.save", entities: [{ model: "schoolAiRecord", id: record.id }], counts: {}, link: "/ai?workflow=work", replayed: false };
    },
  }),
  defineCapability({
    key: "assistant.conversation", version: 1, cluster: "PERSONAL", inventoryKeys: ["assistant.answer"], risk: "READ", roles: ALL, class: "A",
    input: z.strictObject({ text: z.string().trim().min(1).max(1200) }), evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Conversation", "Talk with Skoolee about your goals. Conversation does not read or change records.", "I want to talk with you"], ["محادثة", "تحدث مع سكولي عن أهدافك دون تغيير السجلات.", "أريد التحدث معك"], ["گفتگو", "سکولی سے اپنے مقاصد پر بات کریں، ریکارڈ تبدیل نہیں ہوتا۔", "میں آپ سے بات کرنا چاہتا ہوں"]),
    idempotency: { mode: "convergent" }, source: { service: "bounded conversation", reuse: "automation-tool" },
    execute: async (_ctx, input) => ({ kind: "read", capability: "assistant.conversation", entities: [], counts: {}, link: null, replayed: false, detail: { text: input.text, conversational: true } }),
  }),
  defineCapability({
    key: "assistant.answer", version: 1, cluster: "PERSONAL", inventoryKeys: ["assistant.answer"], risk: "READ", roles: ALL, class: "A",
    input: z.strictObject({ text: z.string().trim().min(1).max(1200) }), evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Answer a question", "Answer from the records shown to you; nothing is changed.", "How many classes do we have?"], ["الإجابة عن سؤال", "إجابة من السجلات المعروضة؛ لا يتغير شيء.", "كم فصلاً لدينا؟"], ["سوال کا جواب", "دکھائے گئے ریکارڈ سے جواب؛ کچھ نہیں بدلتا۔", "ہماری کتنی کلاسیں ہیں؟"]),
    idempotency: { mode: "convergent" }, source: { service: "planner answer", reuse: "automation-tool" },
    execute: async (_ctx, input) => ({ kind: "read", capability: "assistant.answer", entities: [], counts: {}, link: null, replayed: false, detail: { text: input.text } }),
  }),
];
