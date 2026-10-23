import { USER_ROLES } from "@/lib/roles";
import { isCampusOperator } from "@/lib/auth/institution";
import { SCHOOL_AI_STAFF_ROLES } from "@/lib/school-ai/access";
import { getAssistantCatalog } from "@/lib/school-ai/assistant-catalog-service";
import { assistantCatalogQuerySchema } from "@/lib/school-ai/assistant-catalog";
import { createWorkspaceRecord } from "@/lib/school-ai/repository";
import { workspaceIdSchema, workflowModuleSchema } from "@/lib/school-ai/schemas";
import { executeRoleAction } from "@/lib/automation/role-action-service";
import type { AutomaticAction } from "@/lib/automation/schema";
import { profileActionSchema } from "@/lib/automation/schema";
import { campusCreateSchema, libraryCreateSchema, personalPlanSchema, phoneCallSchema, platformInspectSchema, platformUpdateSchema, studentsCreateSchema } from "@/lib/automation/role-actions";
import { z } from "zod";
import { defineCapability } from "../define";
import { ownCampus, permission, predicate, roles } from "../gates";
import type { CapabilityContext, CapabilityEntry, EntryCopy, Receipt } from "../types";

/**
 * Today's automation tools (src/lib/automation/catalog.ts) as registry entries. They call the same
 * adapters, so behaviour and receipts are unchanged; Slice 1h moves the adapter code here and
 * deletes the old catalog.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}

/** Adapts a legacy role-action receipt to the registry receipt. */
async function legacy(ctx: CapabilityContext, tool: AutomaticAction["tool"], title: string, data: unknown, idempotencyKey: string, link: string | null): Promise<Receipt> {
  const detail = await executeRoleAction(ctx.user, ctx.campusId, idempotencyKey, { tool, title, data } as AutomaticAction) ?? {};
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
}).refine(value => new Set(value.steps.map(step => step.id)).size === value.steps.length, "Workflow step IDs must be unique.");
const STAFF = SCHOOL_AI_STAFF_ROLES;

export const TOOL_ENTRIES: readonly CapabilityEntry[] = [
  defineCapability({
    key: "profile.update", version: 1, cluster: "PERSONAL", inventoryKeys: ["profile.update"], risk: "UPDATE", roles: ALL, class: "A",
    classOverride: "Own profile only.", input: profileActionSchema, evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Update my profile", "Change your own name, language, city or (teachers) teaching details.", "Set my language to Urdu"], ["تحديث ملفي", "تغيير اسمك أو لغتك أو مدينتك.", "اجعل لغتي العربية"], ["میری پروفائل اپ ڈیٹ کریں", "اپنا نام، زبان، شہر یا تدریسی تفصیل بدلیں۔", "میری زبان اردو کر دیں"]),
    idempotency: { mode: "tx-receipt" }, source: { service: "src/lib/automation/role-action-service.ts:executeRoleAction", reuse: "automation-tool" },
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "profile.update", "Update my profile", input, idempotencyKey, null),
  }),
  defineCapability({
    key: "personal.save_plan", version: 1, cluster: "PERSONAL", inventoryKeys: ["personal.save_plan"], risk: "CREATE", roles: ALL, class: "A",
    classOverride: "Private to its author.", input: personalPlanSchema, evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Save a private plan", "Save a personal study plan, checklist or schedule only you can see.", "Make me a revision plan for the maths test on Friday"], ["حفظ خطة خاصة", "حفظ خطة شخصية لا يراها غيرك.", "اصنع لي خطة مراجعة لاختبار الرياضيات"], ["نجی منصوبہ محفوظ کریں", "ذاتی منصوبہ جو صرف آپ دیکھ سکیں۔", "جمعہ کے ریاضی کے ٹیسٹ کی دہرائی کا منصوبہ بنائیں"]),
    idempotency: { mode: "tx-receipt" }, source: { service: "src/lib/automation/role-action-service.ts:executeRoleAction", reuse: "automation-tool" },
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
  defineCapability({
    key: "campus.create", version: 1, cluster: "C8", inventoryKeys: ["campus.create"], risk: "CREATE", roles: ["SUPER_ADMIN"], class: "B",
    input: campusCreateSchema, evidence: ["/name", "/city"], gates: [roles(["SUPER_ADMIN"])], scope: { kind: "any-campus-of-school" },
    copy: c(["Add a campus", "Create a new campus in your group; a campus administrator is appointed separately.", "Add a campus called Gulberg in Lahore"], ["إضافة فرع", "إنشاء فرع جديد؛ يُعيَّن مديره بشكل منفصل.", "أضف فرع العليا في الرياض"], ["کیمپس شامل کریں", "گروپ میں نیا کیمپس؛ کیمپس منتظم الگ سے مقرر ہوتا ہے۔", "لاہور میں گلبرگ کیمپس شامل کریں"]),
    idempotency: { mode: "tx-receipt" }, source: { serverAction: "src/app/actions/addCampus.ts", service: "src/lib/automation/role-action-service.ts:executeRoleAction", reuse: "automation-tool" },
    preview: async (_ctx, input) => ({ title: "Add a campus", lines: [{ label: input.name, value: input.city }], counts: { campuses: 1 }, basis: input }),
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "campus.create", `Add campus ${input.name}`, input, idempotencyKey, "/super?view=campuses"),
  }),
  defineCapability({
    key: "library.book_create", version: 1, cluster: "C7", inventoryKeys: ["library.book_create", "library.create_books"], risk: "CREATE", roles: ["LIBRARIAN", "ADMIN", "CAMPUS_ADMIN"], class: "A",
    classOverride: "Append-only; duplicate ISBNs refused.", input: libraryCreateSchema, evidence: ["/books"],
    gates: [predicate("canManageLibrary|isCampusOperator", user => user.role === "LIBRARIAN" || isCampusOperator(user), ["LIBRARIAN", "ADMIN", "CAMPUS_ADMIN"]), ownCampus(), permission("library", "add")], scope: { kind: "own-campus" },
    copy: c(["Add books to the catalogue", "Add titles with their copy counts to the library catalogue.", "Add 'Atlas of the World' by Collins, 2 copies"], ["إضافة كتب للفهرس", "إضافة عناوين مع عدد النسخ.", "أضف أطلس العالم، نسختان"], ["کیٹلاگ میں کتابیں شامل کریں", "عنوانات نسخوں کی تعداد کے ساتھ شامل کریں۔", "اٹلس آف دی ورلڈ کی 2 کاپیاں شامل کریں"]),
    idempotency: { mode: "tx-receipt" }, source: { route: "POST /api/library", service: "src/lib/automation/role-action-service.ts:executeRoleAction", reuse: "automation-tool" },
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "library.create_books", "Add books", input, idempotencyKey, "/librarian?view=catalogue"),
  }),
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
    copy: c(["Look up institutions", "Search the institutions on the platform.", "Show schools named Al-Noor"], ["البحث عن المؤسسات", "البحث في مؤسسات المنصة.", "اعرض المدارس باسم النور"], ["ادارے تلاش کریں", "پلیٹ فارم کے ادارے تلاش کریں۔", "النور نام کے اسکول دکھائیں"]),
    idempotency: { mode: "convergent" }, source: { service: "src/lib/automation/platform.ts:executePlatformAction", reuse: "automation-tool" },
    execute: async (ctx, input, { idempotencyKey }) => ({ ...(await legacy(ctx, "platform.inspect", "Look up institutions", input, idempotencyKey, "/owner?view=schools")), kind: "read" }),
  }),
  defineCapability({
    key: "platform.update_institution", version: 1, cluster: "C8", inventoryKeys: ["platform.update_institution"], risk: "UPDATE", roles: ["APP_OWNER"], class: "B",
    input: platformUpdateSchema, evidence: ["/name", "/city", "/website"], gates: [roles(["APP_OWNER"])], scope: { kind: "platform", unscopedReason: "authorized automatic platform administration" },
    copy: c(["Update an institution's profile", "Change an institution's name, city or website.", "Change Al-Noor's city to Lahore"], ["تحديث ملف مؤسسة", "تغيير اسم المؤسسة أو مدينتها أو موقعها.", "غيّر مدينة النور إلى جدة"], ["ادارے کی پروفائل اپ ڈیٹ کریں", "ادارے کا نام، شہر یا ویب سائٹ بدلیں۔", "النور کا شہر لاہور کریں"]),
    idempotency: { mode: "tx-receipt" }, source: { service: "src/lib/automation/platform.ts:executePlatformAction", reuse: "automation-tool" },
    preview: async (_ctx, input) => ({ title: "Update institution", lines: Object.entries(input).filter(([key]) => key !== "schoolId").map(([label, value]) => ({ label, value: String(value) })), counts: { institutions: 1 }, basis: input }),
    execute: (ctx, input, { idempotencyKey }) => legacy(ctx, "platform.update_institution", "Update institution", input, idempotencyKey, "/owner?view=schools"),
  }),
  defineCapability({
    key: "school.inspect", version: 1, cluster: "C9", inventoryKeys: ["school.inspect"], risk: "READ", roles: ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT"], class: "A",
    input: assistantCatalogQuerySchema, evidence: [], gates: [roles(["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT"]), ownCampus()], scope: { kind: "own-campus" },
    copy: c(["Look up current school records", "Read the current classes, teachers, rooms or other records an operation needs.", "Which classes have no timetable yet?"], ["الاطلاع على السجلات", "قراءة الفصول والمعلمين والقاعات الحالية.", "أي الفصول بلا جدول؟"], ["موجودہ ریکارڈ دیکھیں", "موجودہ کلاسیں، اساتذہ، کمرے وغیرہ پڑھیں۔", "کن کلاسوں کا ٹائم ٹیبل ابھی نہیں بنا؟"]),
    idempotency: { mode: "convergent" }, source: { service: "src/lib/school-ai/assistant-catalog-service.ts:getAssistantCatalog", reuse: "direct" },
    execute: async (ctx, input) => {
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
    key: "assistant.answer", version: 1, cluster: "PERSONAL", inventoryKeys: ["assistant.answer"], risk: "READ", roles: ALL, class: "A",
    input: z.strictObject({ text: z.string().trim().min(1).max(1200) }), evidence: [], gates: [roles(ALL)], scope: { kind: "self" },
    copy: c(["Answer a question", "Answer from the records shown to you; nothing is changed.", "How many classes do we have?"], ["الإجابة عن سؤال", "إجابة من السجلات المعروضة؛ لا يتغير شيء.", "كم فصلاً لدينا؟"], ["سوال کا جواب", "دکھائے گئے ریکارڈ سے جواب؛ کچھ نہیں بدلتا۔", "ہماری کتنی کلاسیں ہیں؟"]),
    idempotency: { mode: "convergent" }, source: { service: "planner answer", reuse: "automation-tool" },
    execute: async (_ctx, input) => ({ kind: "read", capability: "assistant.answer", entities: [], counts: {}, link: null, replayed: false, detail: { text: input.text } }),
  }),
];
