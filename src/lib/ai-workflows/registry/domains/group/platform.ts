import { z } from "zod";
import { PLAN_ORDER, PLANS } from "@/config/plans";
import {
  updateDefaultPlanPrices, PLATFORM_UNSCOPED_REASON, activeSessionsForEmail, createPilotDraft, defaultPlanPricing, findSchools, paymentGatewayState,
  pendingSubscriptionRequests, schoolContactTaken, schoolCountry, waitingProviderEvents, type PlatformSchool,
} from "../../../adapters/platform";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { defineCapability } from "../../define";
import { predicate, roles } from "../../gates";
import type { CapabilityContext, CapabilityEntry, EntryCopy, HandoffPrepared, L10n, ScopeRule } from "../../types";

/**
 * The APP_OWNER platform desk (Slice 8, RT9). The owner is platform-scoped: every entry declares
 * `{kind:"platform", unscopedReason}` and every cross-tenant read or write goes through
 * adapters/platform.ts under that stated reason (the only file allowed to leave the tenant guard).
 *
 * - Default catalogue pricing executes after an explicit in-chat confirmation.
 * - Another B write: `platform.pilot_create` records a pilot charter as a draft (status PLANNED, no consent;
 *   ACTIVE needs the school's consent reference on the Pilot evidence screen).
 * - Billing, capacity, provisioning, plan/status, gateway and session changes are class C. Each
 *   one binds what the owner named, checks what the domain would refuse, and opens the owner's own screen
 *   with a prefill and `stepUp: true`. Nothing here writes; the screen's route applies it under
 *   requirePlatformOwner. Owner jobs never run in the background worker (jobs/worker.ts).
 * - Never a credential: no password, temporary password, token, account number or IBAN is an input,
 *   prefill or detail value. Payment gateway state is booleans only.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const t = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;

const OWNER = ["APP_OWNER"] as const;
const REASON = PLATFORM_UNSCOPED_REASON;
const SCOPE: ScopeRule = { kind: "platform", unscopedReason: REASON };
const GATES = [roles(OWNER), predicate("requirePlatformOwner", user => user.role === "APP_OWNER", OWNER)];
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NAME = z.string().trim().min(1).max(160);
const PLAN = z.enum(PLAN_ORDER as ["FREE", "BASIC", "PRO", "ENTERPRISE"]);
const EMAIL = z.string().trim().toLowerCase().email().max(254);
const handoffSource = (route: string, kind: string) => ({ route, service: `src/lib/ai-workflows/executor/step-runner.ts:openHandoff (${kind}; reads via adapters/platform.ts)`, reuse: "handoff-only" as const });
const ownerScreen = (view: string, query: Record<string, string> = {}) => `/owner?${new URLSearchParams({ view, ...query }).toString()}`;
function prepared(kind: HandoffPrepared["kind"], link: string, prefill: Record<string, unknown>, detail: Record<string, unknown> = {}): HandoffPrepared {
  return { kind, targetRoles: OWNER, link, prefill, detail: { ...detail, stepUp: true, appliesOnOwnerScreen: true } };
}

/** Binds a school the owner named (registration id, slug or name). Canonical form: its registration id. */
async function bindSchool(ctx: CapabilityContext, text: string, pointer = "/school"): Promise<PlatformSchool> {
  const found = await findSchools(ctx.user, REASON, text);
  if (found.length === 1) return found[0];
  if (!found.length) throw new InputRequired([{ pointer, promptKey: "platform.school_not_found", params: { text: text.slice(0, 80) } }]);
  throw new InputRequired([{ pointer, promptKey: "platform.school_ambiguous", options: found.map(school => ({ value: school.regId, label: `${school.name} · ${school.city || "—"} · ${school.plan}` })) }]);
}

// ─── B: pilot charter draft ─────────────────────────────────────────────────
const WORKFLOW_KEY = /^[A-Z][A-Z0-9_]{1,40}$/;
const PRESETS: Record<string, { definition: string; successDefinition: string }> = {
  MARKS_ENTRY: { definition: "A teacher enters one class's marks for one assessment.", successDefinition: "Every pupil's mark for the assessment is saved with no correction needed afterwards." },
  EXAM_PAPER: { definition: "A teacher prepares one exam paper from the class syllabus.", successDefinition: "The paper is ready for review with every question linked to a syllabus topic." },
  ATTENDANCE: { definition: "A teacher marks one class register for the school day.", successDefinition: "The register is saved for every pupil before the end of the first period." },
  FEE_REMINDER: { definition: "The accountant prepares reminders for overdue fee invoices.", successDefinition: "A reminder with the correct amount is prepared for every overdue invoice." },
};
const pilotInput = z.strictObject({
  school: NAME,
  startsOn: DAY,
  endsOn: DAY.nullable().optional(),
  workflows: z.array(z.strictObject({
    key: z.string().trim().regex(WORKFLOW_KEY),
    definition: z.string().trim().min(10).max(400).optional(),
    successDefinition: z.string().trim().min(10).max(400).optional(),
  })).min(1).max(12),
  championName: z.string().trim().min(2).max(120).optional(),
  curriculum: z.string().trim().min(2).max(80).optional(),
  language: z.enum(["en", "ar", "ur", "other"]).optional(),
  country: z.string().trim().regex(/^[A-Z]{2}$/).optional(),
  name: z.string().trim().min(3).max(120).optional(),
  useCase: z.string().trim().min(3).max(160).optional(),
});
type PilotInput = z.infer<typeof pilotInput>;

const PILOT_CREATE = defineCapability<PilotInput>({
  key: "platform.pilot_create", version: 1, cluster: "C8", inventoryKeys: ["platform.pilot_create"], risk: "CREATE", roles: OWNER, class: "B",
  input: pilotInput, evidence: ["/school", "/startsOn", "/championName"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Draft a pilot charter", "Record a LEAP pilot with a school as a draft: its start, the workflows to measure and the school's champion. It goes live only after the school's consent is recorded.", "Create a LEAP pilot for Al-Noor from 1 November measuring marks entry and attendance; the champion is Ms Hina"],
    ["مسودة ميثاق تجربة", "تسجيل تجربة LEAP مع مدرسة كمسودة: موعد البدء وسير العمل المراد قياسه ومنسق المدرسة. لا تبدأ إلا بعد تسجيل موافقة المدرسة.", "أنشئ تجربة LEAP لمدرسة النور من ١ نوفمبر لقياس إدخال الدرجات والحضور؛ المنسقة الأستاذة هند"],
    ["پائلٹ چارٹر کا مسودہ", "کسی اسکول کے ساتھ LEAP پائلٹ مسودے کے طور پر درج کریں: آغاز کی تاریخ، ناپے جانے والے کام اور اسکول کا نمائندہ۔ اسکول کی رضامندی درج ہونے کے بعد ہی شروع ہوگا۔", "النور اسکول کے لیے یکم نومبر سے LEAP پائلٹ بنا دیں، مارکس انٹری اور حاضری ناپنی ہے، نمائندہ مس حنا ہیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/owner/pilots", service: "src/lib/pilots/service.ts:createPilot (via adapters/platform.ts:createPilotDraft)", reuse: "direct" },
  async resolve(ctx, input) {
    const school = await bindSchool(ctx, input.school);
    const missing: RequiredField[] = [];
    const country = input.country ?? await schoolCountry(ctx.user, REASON, school.id);
    if (!country) missing.push({ pointer: "/country", promptKey: "platform.pilot_country", options: ["PK", "AE", "SA", "QA", "KW", "OM", "BH", "GB"].map(value => ({ value, label: value })) });
    if (!input.championName) missing.push({ pointer: "/championName", promptKey: "platform.pilot_champion" });
    if (!input.curriculum) missing.push({ pointer: "/curriculum", promptKey: "platform.pilot_curriculum" });
    if (input.endsOn && input.endsOn < input.startsOn) missing.push({ pointer: "/endsOn", promptKey: "platform.pilot_ends_before_start" });
    if (new Set(input.workflows.map(row => row.key)).size !== input.workflows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "DUPLICATE_WORKFLOW" });
    const workflows = input.workflows.map((row, index) => {
      const preset = PRESETS[row.key];
      const definition = row.definition ?? preset?.definition, successDefinition = row.successDefinition ?? preset?.successDefinition;
      if (!definition) missing.push({ pointer: `/workflows/${index}/definition`, promptKey: "platform.pilot_workflow_definition", params: { key: row.key } });
      if (!successDefinition) missing.push({ pointer: `/workflows/${index}/successDefinition`, promptKey: "platform.pilot_workflow_success", params: { key: row.key } });
      return { key: row.key, ...(definition ? { definition } : {}), ...(successDefinition ? { successDefinition } : {}) };
    });
    if (missing.length) throw new InputRequired(missing);
    return {
      ...input, school: school.regId, country: country!, workflows, language: input.language ?? ctx.locale,
      name: input.name ?? `LEAP pilot from ${input.startsOn}`, useCase: input.useCase ?? `Measure ${workflows.map(row => row.key).join(", ")}`,
    };
  },
  async preview(ctx, input) {
    const school = await bindSchool(ctx, input.school);
    return {
      title: t(ctx, { en: "Draft a pilot charter", ar: "مسودة ميثاق تجربة", ur: "پائلٹ چارٹر کا مسودہ" }),
      lines: [
        { label: t(ctx, { en: "School", ar: "المدرسة", ur: "اسکول" }), value: school.regId },
        { label: t(ctx, { en: "Starts", ar: "البدء", ur: "آغاز" }), value: input.startsOn },
        ...(input.endsOn ? [{ label: t(ctx, { en: "Ends", ar: "الانتهاء", ur: "اختتام" }), value: input.endsOn }] : []),
        { label: t(ctx, { en: "Workflows measured", ar: "سير العمل المقاس", ur: "ناپے جانے والے کام" }), value: input.workflows.map(row => row.key).join(", ") },
        { label: t(ctx, { en: "Status", ar: "الحالة", ur: "حیثیت" }), value: t(ctx, { en: "Draft: goes live only after the school's consent is recorded", ar: "مسودة: لا تبدأ إلا بعد تسجيل موافقة المدرسة", ur: "مسودہ: اسکول کی رضامندی درج ہونے کے بعد ہی شروع ہوگا" }) },
      ],
      counts: { pilots: 1, workflows: input.workflows.length },
      confirmLabel: t(ctx, { en: "Save the draft charter", ar: "حفظ مسودة الميثاق", ur: "مسودہ چارٹر محفوظ کریں" }),
      basis: { input, schoolId: school.id },
    };
  },
  async execute(ctx, input, { idempotencyKey }) {
    const school = await bindSchool(ctx, input.school);
    const name = input.name ?? `LEAP pilot from ${input.startsOn}`;
    const result = await createPilotDraft(ctx.user, REASON, {
      name, targetSchoolId: school.id, country: input.country, curriculum: input.curriculum, language: input.language ?? ctx.locale,
      useCase: input.useCase ?? `Measure ${input.workflows.map(row => row.key).join(", ")}`, startsOn: input.startsOn, endsOn: input.endsOn ?? null,
      championName: input.championName, measurementOwnerId: ctx.user.userId, workflows: input.workflows, synthetic: false,
    }, idempotencyKey);
    return { kind: "draft", capability: "platform.pilot_create", entities: [{ model: "pilot", id: result.id }], counts: { workflows: result.workflows.length }, link: ownerScreen("pilots"), replayed: result.replayed, detail: { status: result.status, workflows: result.workflows, consentRequiredBeforeActive: true } };
  },
});

// ─── C: capacity policy ─────────────────────────────────────────────────────
const capacityInput = z.strictObject({
  school: NAME.nullable().optional(),
  scope: z.enum(["BACKGROUND_REQUESTS", "BACKGROUND_JOBS"]),
  limitValue: z.number().int().min(0).max(1000),
  reason: z.string().trim().min(10).max(2000),
  expiresAt: z.union([DAY, z.string().datetime({ offset: true })]).nullable().optional(),
});
type CapacityInput = z.infer<typeof capacityInput>;
const expiryOf = (value: string | null | undefined) => (value ? (DAY.safeParse(value).success ? `${value}T23:59:59.000Z` : value) : null);

const CAPACITY_APPLY = defineCapability<CapacityInput>({
  key: "platform.capacity_apply_policy", version: 1, cluster: "C8", inventoryKeys: ["platform.capacity_apply_policy"], risk: "UPDATE", roles: OWNER, class: "C",
  input: capacityInput, evidence: ["/limitValue", "/reason"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Prepare a capacity limit", "Prepare a background-work limit, platform-wide or for one school until an expiry; you apply it on the Capacity screen.", "Lower Al-Riyada's background request limit to 20 until tonight because of the incident"],
    ["تجهيز حد للسعة", "تجهيز حد للعمل في الخلفية للمنصة كلها أو لمدرسة واحدة حتى موعد انتهاء؛ تطبقه من شاشة السعة.", "خفّض حد الطلبات الخلفية لمدرسة الريادة إلى ٢٠ حتى نهاية اليوم بسبب الحادث"],
    ["گنجائش کی حد تیار کریں", "پس منظر کے کام کی حد پورے پلیٹ فارم یا ایک اسکول کے لیے میعاد تک تیار کریں؛ آپ اسے کیپیسٹی اسکرین پر لاگو کریں گے۔", "واقعے کی وجہ سے الریادہ اسکول کی بیک گراؤنڈ درخواستوں کی حد آج رات تک 20 کر دیں"],
  ),
  source: handoffSource("POST /api/owner/capacity (action: apply)", "DOMAIN_SCREEN; src/lib/capacity/service.ts:applyPolicy"),
  async resolve(ctx, input) {
    if (!input.school) return { ...input, school: null };
    const school = await bindSchool(ctx, input.school);
    // A school-scoped change is an incident measure: it must end on its own (capacity/service.ts:applyPolicy).
    if (!input.expiresAt) throw new InputRequired([{ pointer: "/expiresAt", promptKey: "platform.capacity_expiry" }]);
    return { ...input, school: school.regId };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const school = input.school ? await bindSchool(ctx, input.school) : null;
      const expiresAt = expiryOf(input.expiresAt);
      if (school && !expiresAt) throw new WorkflowError("DOMAIN_REFUSED", { reason: "SCHOOL_LIMIT_NEEDS_EXPIRY" });
      if (expiresAt && new Date(expiresAt) <= ctx.now) throw new WorkflowError("DOMAIN_REFUSED", { reason: "EXPIRY_IN_PAST" });
      return prepared("DOMAIN_SCREEN", ownerScreen("capacity"),
        { action: "apply", targetSchoolId: school?.id ?? null, scope: input.scope, limitValue: input.limitValue, reason: input.reason, expiresAt },
        { target: school ? "school" : "platform", revertWith: "platform.capacity_revert_policy" });
    },
  },
});

// ─── C: provider event review ───────────────────────────────────────────────
const providerEventInput = z.strictObject({ event: NAME, note: z.string().trim().min(8).max(2000) });
type ProviderEventInput = z.infer<typeof providerEventInput>;

async function bindProviderEvent(ctx: CapabilityContext, text: string) {
  const exact = await waitingProviderEvents(ctx.user, REASON, { eventId: text.trim() });
  if (exact.length === 1) return exact[0];
  const schools = await findSchools(ctx.user, REASON, text).catch(() => []);
  const events = schools.length ? await waitingProviderEvents(ctx.user, REASON, { schoolIds: schools.map(school => school.id) }) : [];
  if (events.length === 1) return events[0];
  if (!events.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_EVENT_WAITING" });
  throw new InputRequired([{ pointer: "/event", promptKey: "platform.provider_event_ambiguous", options: events.map(event => ({ value: event.eventId, label: `${event.provider} ${event.eventType} · ${event.state} · ${event.receivedAt.toISOString().slice(0, 10)}` })) }]);
}

const RESOLVE_PROVIDER_EVENT = defineCapability<ProviderEventInput>({
  key: "platform.resolve_provider_event", version: 1, cluster: "C8", inventoryKeys: ["platform.resolve_provider_event"], risk: "UPDATE", roles: OWNER, class: "C",
  input: providerEventInput, evidence: ["/event", "/note"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Prepare a provider-event note", "Find the parked payment-provider event and prepare your note; you close it on its screen. Closing records the note and never applies the event.", "Mark the failed Stripe event for Beacon Valley resolved: refund already done manually"],
    ["تجهيز ملاحظة حدث مزود الدفع", "إيجاد حدث مزود الدفع المعلّق وتجهيز ملاحظتك؛ تغلقه من شاشته. الإغلاق يسجل الملاحظة ولا يطبق الحدث.", "اعتبر حدث Stripe الفاشل لمدرسة بيكن فالي محلولاً: تم الاسترداد يدوياً"],
    ["پرووائیڈر ایونٹ کا نوٹ تیار کریں", "رکا ہوا پیمنٹ پرووائیڈر ایونٹ ڈھونڈ کر آپ کا نوٹ تیار کریں؛ آپ اسے اس کی اسکرین پر بند کریں گے۔ بند کرنا صرف نوٹ درج کرتا ہے، ایونٹ لاگو نہیں کرتا۔", "بیکن ویلی کا ناکام Stripe ایونٹ حل شدہ کر دیں، ریفنڈ ہاتھ سے ہو چکا ہے"],
  ),
  source: handoffSource("POST /api/owner/provider-events", "DOMAIN_SCREEN; src/lib/billing/provider-events.ts:resolveProviderEvent"),
  async resolve(ctx, input) { return { ...input, event: (await bindProviderEvent(ctx, input.event)).eventId }; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const event = await bindProviderEvent(ctx, input.event);
      return prepared("DOMAIN_SCREEN", ownerScreen("subscription-requests", { event: event.eventId }), { eventId: event.eventId, note: input.note },
        { provider: event.provider, eventType: event.eventType, state: event.state, appliesEvent: false });
    },
  },
});

// ─── C: subscription request review ─────────────────────────────────────────
const KINDS = ["GRACE_EXTENSION", "CANCELLATION", "REFUND", "PLAN_CHANGE"] as const;
const subscriptionInput = z.strictObject({ school: NAME, decision: z.enum(["APPROVE_REQUEST", "DECLINE_REQUEST"]), reason: z.string().trim().min(8).max(1000), kind: z.enum(KINDS).optional() });
type SubscriptionInput = z.infer<typeof subscriptionInput>;

async function bindRequest(ctx: CapabilityContext, input: SubscriptionInput) {
  const school = await bindSchool(ctx, input.school);
  const requests = await pendingSubscriptionRequests(ctx.user, REASON, school.id, input.kind);
  if (!requests.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_PENDING_REQUEST" });
  if (requests.length > 1) {
    const kinds = [...new Set(requests.map(row => row.kind))];
    throw new InputRequired([kinds.length > 1 && !input.kind
      ? { pointer: "/kind", promptKey: "platform.subscription_kind", options: kinds.map(kind => ({ value: kind, label: kind })) }
      : { pointer: "/school", promptKey: "platform.subscription_several", params: { count: requests.length } }]);
  }
  return { school, request: requests[0] };
}

const SUBSCRIPTION_REVIEW = defineCapability<SubscriptionInput>({
  key: "platform.subscription_request_review", version: 1, cluster: "C8", inventoryKeys: ["platform.subscription_request_review"], risk: "APPROVAL_DECISION", roles: OWNER, class: "C",
  input: subscriptionInput, evidence: ["/school", "/reason"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Prepare a subscription decision", "Find the school's waiting subscription request and prepare your decision and reason; you decide it on Subscription requests.", "Approve Al-Noor's grace extension request, they paid by bank transfer on Monday"],
    ["تجهيز قرار طلب اشتراك", "إيجاد طلب الاشتراك المعلّق للمدرسة وتجهيز قرارك وسببه؛ تقرره من شاشة طلبات الاشتراك.", "وافق على طلب تمديد المهلة لمدرسة النور، دفعوا بتحويل بنكي يوم الاثنين"],
    ["سبسکرپشن درخواست کا فیصلہ تیار کریں", "اسکول کی زیرِ التوا سبسکرپشن درخواست ڈھونڈ کر آپ کا فیصلہ اور وجہ تیار کریں؛ آپ سبسکرپشن درخواستوں کی اسکرین پر فیصلہ کریں گے۔", "النور کی گریس بڑھانے کی درخواست منظور کر دیں، انہوں نے پیر کو بینک ٹرانسفر کر دیا تھا"],
  ),
  source: handoffSource("POST /api/owner/subscription-requests", "RECORD_APPROVAL"),
  async resolve(ctx, input) { const { school, request } = await bindRequest(ctx, input); return { ...input, school: school.regId, kind: request.kind as SubscriptionInput["kind"] }; },
  handoff: {
    kind: "RECORD_APPROVAL",
    async prepare(ctx, input) {
      const { school, request } = await bindRequest(ctx, input);
      const until = (request.details as { requestedUntil?: unknown } | null)?.requestedUntil;
      if (input.decision === "APPROVE_REQUEST" && request.kind === "GRACE_EXTENSION" && !(typeof until === "string" && new Date(until) > ctx.now)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "GRACE_DATE_PASSED" });
      return prepared("RECORD_APPROVAL", ownerScreen("subscription-requests", { request: request.id }), { requestId: request.id, decision: input.decision, reason: input.reason },
        { schoolId: school.id, kind: request.kind, requestedPlan: request.requestedPlan, refundSubmitted: false });
    },
  },
});

// ─── C: provision a school ──────────────────────────────────────────────────
const provisionInput = z.strictObject({
  schoolName: NAME, kind: z.enum(["GROUP", "STANDALONE"]), city: NAME, plan: PLAN.optional(),
  ownerName: NAME, ownerEmail: EMAIL, contactEmail: EMAIL.optional(), campusName: NAME.optional(),
});
type ProvisionInput = z.infer<typeof provisionInput>;

const PROVISION_SCHOOL = defineCapability<ProvisionInput>({
  key: "platform.provision_school", version: 1, cluster: "C8", inventoryKeys: ["platform.provision_school"], risk: "ACCESS_GRANT", roles: OWNER, class: "C",
  dialogueFields: [
    { key: "schoolName", labels: ["school name", "school's name", "name of school", "اسکول کا نام", "اسم المدرسة"] },
    { key: "city", labels: ["city", "شہر", "المدينة"] },
    { key: "ownerName", labels: ["owner name", "owner's name", "owner full name", "مالک کا نام", "اسم المالك"] },
    { key: "ownerEmail", labels: ["owner email", "owner's email", "email", "ای میل", "البريد الإلكتروني"] },
    { key: "kind", labels: ["type", "kind", "institution type"], choices: { STANDALONE: ["single", "single school", "standalone", "Single school (STANDALONE)"], GROUP: ["group", "school group", "School group (GROUP)"] } },
    { key: "plan", labels: ["plan"], choices: { FREE: ["free"], BASIC: ["basic"], PRO: ["pro"], ENTERPRISE: ["enterprise"] } },
  ],
  input: provisionInput, evidence: ["/schoolName", "/city", "/ownerName", "/ownerEmail"], literalEvidence: ["/schoolName", "/city", "/ownerName", "/ownerEmail"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Prepare a new school", "Fill the New school form with the school, its plan and its owner; you press Provision on the Schools screen, where the sign-in is shown once.", "Onboard Crescent Grammar in Karachi as a single school on BASIC; the owner is Sara Khan, sara@crescent.edu.pk"],
    ["تجهيز مدرسة جديدة", "تعبئة نموذج المدرسة الجديدة بالمدرسة وباقتها ومالكها؛ تضغط «تجهيز» من شاشة المدارس حيث تظهر بيانات الدخول مرة واحدة.", "أضف مدرسة كريسنت في جدة كمدرسة واحدة على باقة BASIC؛ المالكة سارة خان sara@crescent.edu.pk"],
    ["نیا اسکول تیار کریں", "نئے اسکول کا فارم اسکول، پلان اور مالک کے ساتھ بھریں؛ آپ اسکولز اسکرین پر پروویژن دبائیں گے، جہاں سائن ان ایک بار دکھایا جاتا ہے۔", "کریسنٹ گرامر کراچی کو BASIC پلان پر سنگل اسکول کے طور پر شامل کریں، مالک سارہ خان ہیں، sara@crescent.edu.pk"],
  ),
  source: handoffSource("POST /api/owner/schools", "DOMAIN_SCREEN"),
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const contact = input.contactEmail ?? input.ownerEmail;
      if (await schoolContactTaken(ctx.user, REASON, input.ownerEmail) || (contact !== input.ownerEmail && await schoolContactTaken(ctx.user, REASON, contact))) throw new InputRequired([{ pointer: "/ownerEmail", promptKey: "platform.owner_email_taken" }]);
      const plan = input.plan ?? "FREE";
      return prepared("DOMAIN_SCREEN", ownerScreen("schools", { new: "1" }),
        { schoolName: input.schoolName, kind: input.kind, city: input.city, plan, ownerName: input.ownerName, ownerEmail: input.ownerEmail, ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}), ...(input.campusName ? { campusName: input.campusName } : {}) },
        { ownerRole: input.kind === "GROUP" ? "SUPER_ADMIN" : "ADMIN", credentialShownOnScreenOnly: true, ownerQuestionnaireRemains: true });
    },
  },
});

// ─── C: plan or status change ───────────────────────────────────────────────
const planStatusInput = z.strictObject({ school: NAME, plan: PLAN.optional(), status: z.enum(["ACTIVE", "SUSPENDED"]).optional() });
type PlanStatusInput = z.infer<typeof planStatusInput>;

const UPDATE_PLAN_STATUS = defineCapability<PlanStatusInput>({
  key: "platform.update_school_plan_status", version: 1, cluster: "C8", inventoryKeys: ["platform.update_school_plan_status"], risk: "FINANCIAL", roles: OWNER, class: "C",
  input: planStatusInput, evidence: ["/school"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Prepare a plan or status change", "Prepare moving a school to another plan, or suspending or restoring it; you apply it on the school's page. A plan change resets its AI credits and contract.", "Move Beacon Valley to Enterprise"],
    ["تجهيز تغيير باقة أو حالة", "تجهيز نقل مدرسة إلى باقة أخرى أو إيقافها أو إعادتها؛ تطبقه من صفحة المدرسة. تغيير الباقة يعيد ضبط رصيد الذكاء الاصطناعي والعقد.", "انقل مدرسة بيكن فالي إلى باقة Enterprise"],
    ["پلان یا حیثیت کی تبدیلی تیار کریں", "اسکول کو دوسرے پلان پر لے جانا، معطل یا بحال کرنا تیار کریں؛ آپ اسے اسکول کے صفحے پر لاگو کریں گے۔ پلان بدلنے سے AI کریڈٹ اور معاہدہ نئے سرے سے بنتے ہیں۔", "بیکن ویلی کو انٹرپرائز پلان پر منتقل کر دیں"],
  ),
  source: handoffSource("PATCH /api/owner/schools/[id]", "DOMAIN_SCREEN"),
  async resolve(ctx, input) {
    if (!input.plan && !input.status) throw new InputRequired([{ pointer: "/plan", promptKey: "platform.plan_or_status", options: PLAN_ORDER.map(plan => ({ value: plan, label: plan })) }]);
    return { ...input, school: (await bindSchool(ctx, input.school)).regId };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const school = await bindSchool(ctx, input.school);
      const plan = input.plan && input.plan !== school.plan ? input.plan : undefined;
      const status = input.status && input.status !== school.status ? input.status : undefined;
      if (!plan && !status) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_CHANGE" });
      return prepared("DOMAIN_SCREEN", ownerScreen("schools", { school: school.id }), { schoolId: school.id, ...(plan ? { plan } : {}), ...(status ? { status } : {}) },
        { current: { plan: school.plan, status: school.status }, resetsAiCreditsAndContract: Boolean(plan) });
    },
  },
});

// ─── C: default plan pricing ────────────────────────────────────────────────
const PRICE = z.number().min(0).max(100_000_000).nullable();
const pricingInput = z.strictObject({ prices: z.strictObject({ FREE: PRICE.optional(), BASIC: PRICE.optional(), PRO: PRICE.optional(), ENTERPRISE: PRICE.optional() }), selectedPlan: z.enum(["FREE", "BASIC", "PRO", "ENTERPRISE"]).optional(), expected: z.unknown().optional() });
type PricingInput = z.infer<typeof pricingInput>;

const SET_DEFAULT_PRICING = defineCapability<PricingInput>({
  key: "platform.set_default_plan_pricing", version: 2, cluster: "C8", inventoryKeys: ["platform.set_default_plan_pricing"], risk: "FINANCIAL", roles: OWNER, class: "B",
  input: pricingInput, evidence: ["/prices"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Update default package prices", "Update default monthly package prices for new schools after confirming the exact change in chat. Existing subscriptions are unchanged.", "Set the Pro package price to 4500"],
    ["تجهيز الأسعار الافتراضية للباقات", "تجهيز أسعار شهرية افتراضية جديدة للمدارس الجديدة؛ تؤكدها من شاشة الأسعار حيث يُسجَّل التغيير.", "اجعل السعر الافتراضي لباقة BASIC ٤٥٠٠ وPRO ٨٠٠٠"],
    ["پلان کی طے شدہ قیمتیں تیار کریں", "نئے اسکولوں کے لیے نئی ماہانہ طے شدہ قیمتیں تیار کریں؛ آپ انہیں پرائسنگ اسکرین پر کنفرم کریں گے، جہاں تبدیلی آڈٹ ہوتی ہے۔", "بیسک کی طے شدہ قیمت 4500 اور پرو کی 8000 کر دیں"],
  ),
  humanFields: ["expected"],
  refreshOnReconfirm: true,
  source: { route: "PUT /api/owner/platform-config", service: "src/lib/owner/default-pricing-service.ts:saveDefaultPlanPrices", reuse: "extracted" },
  idempotency: { mode: "native" },
  async resolve(ctx, input) {
    if (!Object.keys(input.prices).length) throw new InputRequired([{ pointer: "/prices", promptKey: "platform.pricing_amount" }]);
    return { ...input, expected: await defaultPlanPricing(ctx.user, REASON) };
  },
  async preview(ctx, input) {
    const current = await defaultPlanPricing(ctx.user, REASON);
    return {
      title: t(ctx, { en: "Review monthly package prices", ar: "مراجعة أسعار الباقات الشهرية", ur: "ماہانہ پیکیج قیمتوں کا جائزہ" }),
      lines: Object.entries(input.prices).map(([plan, price]) => ({ label: PLANS[plan as keyof typeof PLANS].name, value: `PKR ${current[plan]?.price ?? "Custom"} → ${price === null ? "Custom" : `PKR ${price}`} / month` })),
      counts: {}, basis: current,
      confirmLabel: t(ctx, { en: "Save package prices", ar: "حفظ أسعار الباقات", ur: "پیکیج قیمتیں محفوظ کریں" }),
    };
  },
  async execute(ctx, input, opts) {
    const pricing = await updateDefaultPlanPrices(ctx.user, input.prices, input.expected, opts.idempotencyKey);
    return { kind: "write", capability: "platform.set_default_plan_pricing", entities: [{ model: "PlatformConfig", id: "default_plan_pricing" }], counts: { updated: Object.keys(input.prices).length }, link: ownerScreen("pricing"), replayed: false, detail: { pricing } };
  },
});

// ─── C: Stripe Connect onboarding (deep link) ───────────────────────────────
const connectInput = z.strictObject({});
type ConnectInput = z.infer<typeof connectInput>;

const PAYMENT_CONNECT = defineCapability<ConnectInput>({
  key: "platform.payment_connect_onboarding", version: 1, cluster: "C8", inventoryKeys: ["platform.payment_connect_onboarding"], risk: "FINANCIAL", roles: OWNER, class: "C",
  input: connectInput, evidence: [], gates: GATES, scope: SCOPE,
  copy: c(
    ["Open card payment setup", "Open Payment gateways to connect Stripe; you start onboarding there and finish it on Stripe's own page. Bank details are entered only by you.", "Set up card payments through Stripe"],
    ["فتح إعداد الدفع بالبطاقة", "فتح بوابات الدفع لربط Stripe؛ تبدأ الإعداد هناك وتكمله على صفحة Stripe نفسها. بيانات البنك تدخلها أنت فقط.", "فعّل الدفع بالبطاقة عبر Stripe"],
    ["کارڈ ادائیگی کی سیٹ اپ کھولیں", "Stripe جوڑنے کے لیے پیمنٹ گیٹ ویز کھولیں؛ آپ وہاں آن بورڈنگ شروع کر کے Stripe کے اپنے صفحے پر مکمل کریں گے۔ بینک تفصیل صرف آپ درج کریں گے۔", "Stripe کے ذریعے کارڈ سے ادائیگی سیٹ اپ کر دیں"],
  ),
  source: handoffSource("POST /api/owner/payment-settings (action: start-connect-onboarding)", "DEEP_LINK"),
  handoff: {
    kind: "DEEP_LINK",
    async prepare(ctx) {
      const state = await paymentGatewayState(ctx.user, REASON);
      return prepared("DEEP_LINK", ownerScreen("payments"), { action: "start-connect-onboarding" }, { ...state, completesOnStripe: true, bankDetailsHumanOnly: true });
    },
  },
});

// ─── C: terminate sessions ──────────────────────────────────────────────────
const sessionInput = z.strictObject({ account: EMAIL });
type SessionInput = z.infer<typeof sessionInput>;

const SESSION_TERMINATE = defineCapability<SessionInput>({
  key: "platform.session_terminate", version: 1, cluster: "C8", inventoryKeys: ["platform.session_terminate"], risk: "ACCESS_GRANT", roles: OWNER, class: "C",
  input: sessionInput, evidence: ["/account"], gates: GATES, scope: SCOPE,
  copy: c(
    ["Prepare signing an account out", "Find the account's active sessions and open Sessions with them chosen; you end them there.", "Log out all sessions for bursar@alnoor.edu.pk, it may be compromised"],
    ["تجهيز إنهاء جلسات حساب", "إيجاد الجلسات النشطة للحساب وفتح شاشة الجلسات وهي محددة؛ تنهيها من هناك.", "أنهِ كل جلسات bursar@alnoor.edu.pk فقد يكون مخترقاً"],
    ["اکاؤنٹ سائن آؤٹ کرنا تیار کریں", "اکاؤنٹ کے فعال سیشن ڈھونڈ کر سیشنز اسکرین انہیں منتخب کر کے کھولیں؛ آپ وہیں ختم کریں گے۔", "bursar@alnoor.edu.pk کے سارے سیشن لاگ آؤٹ کر دیں، شاید اکاؤنٹ ہیک ہو گیا ہے"],
  ),
  source: handoffSource("DELETE /api/owner/sessions", "DOMAIN_SCREEN"),
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { accounts, sessions } = await activeSessionsForEmail(ctx.user, REASON, input.account);
      if (!accounts.length) throw new WorkflowError("NOT_FOUND");
      if (!sessions.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ACTIVE_SESSION" });
      const userIds = [...new Set(sessions.map(row => row.userId))];
      return prepared("DOMAIN_SCREEN", ownerScreen("sessions", userIds.length === 1 ? { userId: userIds[0] } : {}), { userIds, sessionIds: sessions.map(row => row.id) },
        { activeSessions: sessions.length, accounts: accounts.length, roles: [...new Set(accounts.map(row => row.role))] });
    },
  },
});

export const PLATFORM_ENTRIES: readonly CapabilityEntry[] = [
  PILOT_CREATE, CAPACITY_APPLY, RESOLVE_PROVIDER_EVENT, SUBSCRIPTION_REVIEW, PROVISION_SCHOOL, UPDATE_PLAN_STATUS, SET_DEFAULT_PRICING, PAYMENT_CONNECT, SESSION_TERMINATE,
];
