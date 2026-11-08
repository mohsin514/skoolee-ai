import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { canManageCampusOps } from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { assertRosterPermission } from "@/lib/imports/roster-access";
import { importReviewToken } from "@/lib/imports/review-token";
import { summarizeImportRows } from "@/lib/imports/batch";
import { classifyStructuredRoster, findImportBatch, importBatchView, stageStructuredRoster, type StructuredRosterInput } from "@/lib/imports/stage-batch-command";
import { normalizeAcademicName } from "@/lib/school-ai/academic-setup";
import { writeAcademicCycle } from "@/lib/school-ai/school-operations-cycle-write";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles } from "../../gates";
import { InputRequired, WorkflowError } from "../../../errors";
import { classLabel } from "../../../resolve/scope";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * Campus-operator (ADMIN / CAMPUS_ADMIN) roster import and academic-year capabilities.
 *  - Typed roster rows are STAGED for review with the import screen's duplicate matching; nothing is
 *    committed to students from AI. Committing is a hand-off to the import review screen (rule 8: no
 *    account invitations, guardians stay unverified).
 *  - A DRAFT academic cycle is created only for a campus that has none; activating it and choosing class
 *    teachers are the academic lead's calls (PRINCIPAL while that seat is held, else the operator's screen).
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const OPERATORS: readonly UserRole[] = ["ADMIN", "CAMPUS_ADMIN"];
/** Every route here starts with canManageCampusOps on the actor's own campus (resolveCampusId). */
const OPERATOR_GATES = [roles(OPERATORS), predicate("canManageCampusOps", canManageCampusOps, OPERATORS), ownCampus()] as const;

function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}
/** A live class of this campus; anything else (another campus, another school, archived) is out of scope. */
async function campusClass(ctx: CapabilityContext, classId: string) {
  const campusId = ownCampusId(ctx);
  const klass = await prisma.class.findFirst({ where: { id: classId, schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true, name: true, section: true, status: true, classTeacherId: true } });
  if (!klass) throw new WorkflowError("SCOPE_DENIED");
  return klass;
}

/** The import review screen (AI workspace → Sources → roster import, which lists staged batches by name). */
const IMPORT_REVIEW_LINK = "/ai?workflow=sources";
const YEAR_LINK = "/admin?view=year-cycle";

// ─── imports.stage_batch ──────────────────────────────────────────────────

const rosterRow = z.strictObject({
  fullName: z.string().trim().min(1).max(160),
  rollNo: z.string().trim().min(1).max(40),
  /** Required by the roster (as are address, city and medical notes); a row without it is staged as needing correction, never guessed. */
  guardianPhone: z.string().trim().min(3).max(40).optional(),
  /** Only when the user names a class other than the default one ("Grade 6", "B"). */
  className: z.string().trim().min(1).max(80).optional(),
  classSection: z.string().trim().min(1).max(40).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: DAY.optional(),
  guardianName: z.string().trim().min(1).max(160).optional(),
  guardianRelationship: z.enum(["FATHER", "MOTHER", "UNCLE", "AUNT", "SIBLING", "OTHER"]).optional(),
  guardianEmail: z.string().trim().email().max(200).optional(),
  address: z.string().trim().min(1).max(300).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  /** The roster requires it ("None" when nothing applies); a row without it is staged as needing correction. */
  medicalNotes: z.string().trim().min(1).max(500).optional(),
});
const stageInput = z.strictObject({
  /** The default class for rows that do not name one (the import screen's "Choose a class"). */
  classId: z.string().min(1),
  rows: z.array(rosterRow).min(1).max(30),
  sourceName: z.string().trim().min(1).max(120).optional(),
});
type StageInput = z.infer<typeof stageInput>;

function structured(ctx: CapabilityContext, input: StageInput): StructuredRosterInput {
  return {
    campusId: ownCampusId(ctx), defaultClassId: input.classId,
    sourceName: input.sourceName ?? `AI roster ${ctx.now.toISOString().slice(0, 10)}`,
    rows: input.rows.map(row => ({ ...row, guardianRelationship: row.guardianRelationship?.toLowerCase() ?? null })),
  };
}

const STAGE_BATCH = defineCapability<StageInput>({
  key: "imports.stage_batch", version: 1, cluster: "C3", inventoryKeys: ["imports.stage_batch"], risk: "CREATE", roles: OPERATORS, class: "B",
  input: stageInput, evidence: ["/rows/*/fullName", "/rows/*/rollNo"], limits: { maxItems: 30 },
  gates: [...OPERATOR_GATES, permission("students", "add")], scope: { kind: "own-campus" },
  copy: c(
    ["Stage students for import review", "Put typed student rows into an import batch with duplicate checks. Nothing is added to the roster until you review and commit it on the import screen.", "Add these to 5A for review: Ayesha Khan roll 12, guardian 0300 1234567; Bilal Ahmed roll 13, guardian 0321 7654321"],
    ["تجهيز طلاب لمراجعة الاستيراد", "وضع صفوف الطلاب المكتوبة في دفعة استيراد مع فحص التكرار. لا يُضاف أحد إلى السجل حتى تراجعها وتعتمدها في شاشة الاستيراد.", "أضف هؤلاء إلى 5أ للمراجعة: عائشة خان رقم 12، ولي الأمر 0501234567؛ بلال أحمد رقم 13"],
    ["طلبہ کو درآمد کے جائزے کے لیے تیار کریں", "لکھی ہوئی طلبہ کی قطاریں ڈپلیکیٹ جانچ کے ساتھ درآمدی بیچ میں رکھیں۔ جب تک آپ درآمد اسکرین پر جائزہ لے کر محفوظ نہ کریں، کوئی طالب علم رجسٹر میں شامل نہیں ہوگا۔", "یہ 5اے میں جائزے کے لیے ڈال دیں: عائشہ خان رول 12، سرپرست 0300 1234567؛ بلال احمد رول 13، سرپرست 0321 7654321"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/import-batches", service: "src/lib/imports/stage-batch-command.ts:stageStructuredRoster", reuse: "extracted" },
  async resolve(ctx, input) {
    await campusClass(ctx, input.classId);
    return input;
  },
  async preview(ctx, input) {
    const klass = await campusClass(ctx, input.classId);
    const roster = structured(ctx, input);
    const classified = await classifyStructuredRoster(ctx.user, roster);
    const existing = await findImportBatch(ctx.user, { campusId: roster.campusId, kind: "STUDENT_ROSTER", fingerprint: classified.fingerprint, targetScope: classified.targetScope });
    const summary = summarizeImportRows(classified.rows);
    const n = (value: number) => String(value);
    return {
      title: say(ctx, l("Stage students for review", "تجهيز الطلاب للمراجعة", "طلبہ کو جائزے کے لیے تیار کریں")),
      lines: [
        { label: say(ctx, l("Default class", "الفصل الافتراضي", "طے شدہ کلاس")), value: classLabel(klass) },
        { label: say(ctx, l("Rows", "الصفوف", "قطاریں")), value: n(summary.total) },
        { label: say(ctx, l("Ready to import", "جاهز للاستيراد", "درآمد کے لیے تیار")), value: n(summary.accepted) },
        { label: say(ctx, l("Already on the roster (kept as is)", "موجود في السجل (يبقى كما هو)", "پہلے سے رجسٹر میں (جیسے ہیں ویسے رہیں گے)")), value: n(summary.skipped) },
        { label: say(ctx, l("Roll number used in another class", "رقم مستخدم في فصل آخر", "رول نمبر کسی اور کلاس میں ہے")), value: n(summary.unresolved) },
        { label: say(ctx, l("Need correcting", "تحتاج تصحيحاً", "درستی درکار")), value: n(summary.rejected) },
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: existing && existing.state !== "EXPIRED"
          ? say(ctx, l("These rows are already staged; the same batch is reopened. Nothing is added to the roster.", "هذه الصفوف مجهزة مسبقاً؛ تُفتح الدفعة نفسها. لا يُضاف شيء إلى السجل.", "یہ قطاریں پہلے سے تیار ہیں؛ وہی بیچ کھلے گا۔ رجسٹر میں کچھ شامل نہیں ہوگا۔"))
          : say(ctx, l("Staged, not committed. No student is added and no account or guardian is invited until you commit it on the import review screen.", "مجهزة دون اعتماد. لا يُضاف طالب ولا تُرسل دعوة لحساب أو ولي أمر حتى تعتمدها في شاشة مراجعة الاستيراد.", "صرف تیار، محفوظ نہیں۔ جب تک آپ درآمدی جائزہ اسکرین پر محفوظ نہ کریں، نہ کوئی طالب علم شامل ہوگا نہ کسی اکاؤنٹ یا سرپرست کو دعوت جائے گی۔")) },
      ],
      counts: summary,
      confirmLabel: `${say(ctx, l("Stage for review", "تجهيز للمراجعة", "جائزے کے لیے تیار کریں"))} · ${summary.total}`,
      basis: { input, rows: classified.rows.map(row => [row.rowNumber, row.state, row.matchKey]), existing: existing ? [existing.id, existing.state] : null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    // The route's live checks: the operator's membership and the students.add grant, re-read now.
    if (!canManageCampusOps(ctx.user)) throw new WorkflowError("ROLE_NOT_ALLOWED");
    await assertRosterPermission(ctx.user, "add");
    await campusClass(ctx, input.classId);
    const { batch, created, view } = await stageStructuredRoster(ctx.user, structured(ctx, input));
    const summary = view.summary as Record<string, number>;
    return {
      kind: "draft", capability: "imports.stage_batch", entities: [{ model: "importBatch", id: batch.id }],
      counts: { total: summary.total ?? 0, accepted: summary.accepted ?? 0, skipped: summary.skipped ?? 0, unresolved: summary.unresolved ?? 0, rejected: summary.rejected ?? 0, committed: 0 },
      link: IMPORT_REVIEW_LINK, replayed: false,
      detail: { status: "STAGED_NOT_COMMITTED", state: batch.state, committed: false, sourceName: batch.sourceName, expiresAt: batch.expiresAt.toISOString(), ...(created ? {} : { reconciled: true }) },
    };
  },
});

// ─── imports.commit_batch ─────────────────────────────────────────────────

const commitInput = z.strictObject({
  /** The staged batch's name as the user calls it ("the roster I just staged"); omitted means the latest. */
  batch: z.string().trim().min(1).max(180).optional(),
  /** Bound by the server from `batch`; never taken from the model. */
  importBatchId: z.string().min(1).max(64).optional(),
});
type CommitInput = z.infer<typeof commitInput>;

async function stagedRosters(ctx: CapabilityContext) {
  return prisma.importBatch.findMany({
    where: { schoolId: ctx.user.schoolId, campusId: ownCampusId(ctx), kind: "STUDENT_ROSTER", state: "STAGED", expiresAt: { gt: ctx.now } },
    orderBy: { createdAt: "desc" }, take: 20, select: { id: true, sourceName: true, createdAt: true },
  });
}

const COMMIT_BATCH = defineCapability<CommitInput>({
  key: "imports.commit_batch", version: 1, cluster: "C3", inventoryKeys: ["students.create"], risk: "CREATE", roles: OPERATORS, class: "C",
  input: commitInput, evidence: [], humanFields: ["importBatchId"],
  gates: [...OPERATOR_GATES, permission("students", "add")], scope: { kind: "own-campus" },
  copy: c(
    ["Commit a staged roster", "Open the import review screen for a staged roster, where you check the rows and add the students. AI never commits it.", "Commit the roster I staged for 5A"],
    ["اعتماد قائمة طلاب مجهزة", "فتح شاشة مراجعة الاستيراد لدفعة مجهزة، حيث تتحقق من الصفوف وتضيف الطلاب. الذكاء الاصطناعي لا يعتمدها.", "اعتمد قائمة طلاب 5أ التي جهزتها"],
    ["تیار شدہ رجسٹر محفوظ کریں", "تیار شدہ بیچ کی درآمدی جائزہ اسکرین کھولیں جہاں آپ قطاریں دیکھ کر طلبہ شامل کرتے ہیں۔ اے آئی خود محفوظ نہیں کرتا۔", "5اے کا جو رجسٹر تیار کیا تھا وہ محفوظ کر دیں"],
  ),
  source: { route: "POST /api/students (_importBatchId)", service: "src/lib/students/create.ts:createStudentRecords", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const staged = await stagedRosters(ctx);
    if (!staged.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_STAGED_ROSTER" });
    const said = input.batch?.toLocaleLowerCase();
    const matched = input.importBatchId ? staged.filter(row => row.id === input.importBatchId)
      : said ? staged.filter(row => row.id === input.batch || row.sourceName.toLocaleLowerCase().includes(said))
      : staged.slice(0, 1);
    if (matched.length !== 1) throw new InputRequired([{ pointer: "/batch", promptKey: matched.length ? "ROSTER_BATCH_AMBIGUOUS" : "ROSTER_BATCH_NOT_FOUND", params: { count: staged.length }, options: (matched.length ? matched : staged).slice(0, 8).map(row => ({ value: row.id, label: `${row.sourceName} · ${row.createdAt.toISOString().slice(0, 10)}` })) }]);
    return { batch: matched[0].sourceName, importBatchId: matched[0].id };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const campusId = ownCampusId(ctx);
      if (!input.importBatchId) throw new WorkflowError("INVALID_INPUT");
      const batch = await prisma.importBatch.findFirst({ where: { id: input.importBatchId, schoolId: ctx.user.schoolId, campusId, kind: "STUDENT_ROSTER" } });
      if (!batch) throw new WorkflowError("NOT_FOUND");
      if (batch.state !== "STAGED" || batch.expiresAt <= ctx.now) throw new WorkflowError("STALE_VERSION");
      const view = importBatchView(batch);
      // The screen's commit requires the review token of exactly these rows; it is shown here, never used.
      return {
        kind: "DOMAIN_SCREEN", targetRoles: [], link: IMPORT_REVIEW_LINK,
        prefill: { importBatchId: batch.id, reviewToken: importReviewToken(batch), sourceName: batch.sourceName, inviteAccounts: false, guardiansVerified: false },
        detail: { summary: view.summary, expiresAt: batch.expiresAt.toISOString(), committedByAi: false },
      };
    },
  },
});

// ─── academic.cycle.create ────────────────────────────────────────────────

const cycleInput = z.strictObject({
  /** The year the cycle starts in (2026 for "2026-27"). */
  academicYear: z.number().int().min(2000).max(2100),
  /** The name the school uses ("2026-27"); defaults to the year. */
  label: z.string().trim().min(1).max(180).optional(),
});
type CycleInput = z.infer<typeof cycleInput>;
const cycleLabel = (input: CycleInput) => input.label ?? String(input.academicYear);

const CYCLE_CREATE = defineCapability<CycleInput>({
  key: "academic.cycle.create", version: 1, cluster: "C1", inventoryKeys: ["academic.cycle.create"], risk: "CREATE", roles: OPERATORS, class: "B",
  input: cycleInput, evidence: ["/academicYear"],
  // writeAcademicCycle: campus operations, plus the exams view and edit grants.
  gates: [...OPERATOR_GATES, permission("exams", "view"), permission("exams", "edit")], scope: { kind: "own-campus" },
  copy: c(
    ["Create the academic year (draft)", "Create this campus's first academic year as a draft. It is not started: the principal (or you, when there is no principal) activates it.", "Set up the 2026-27 academic year for this campus"],
    ["إنشاء العام الدراسي (مسودة)", "إنشاء أول عام دراسي لهذا الحرم كمسودة. لا يبدأ: يفعّله المدير (أو أنت عند عدم وجود مدير).", "أنشئ العام الدراسي 2026-27 لهذا الفرع"],
    ["تعلیمی سال بنائیں (مسودہ)", "اس کیمپس کا پہلا تعلیمی سال مسودے کے طور پر بنائیں۔ یہ شروع نہیں ہوگا: پرنسپل (یا پرنسپل نہ ہو تو آپ) اسے فعال کریں گے۔", "اس کیمپس کے لیے 2026-27 کا تعلیمی سال بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/academic-cycle (action: create)", service: "src/lib/school-ai/school-operations-cycle-write.ts:writeAcademicCycle", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    const existing = await prisma.academicCycle.findFirst({ where: { schoolId: ctx.user.schoolId, campusId }, orderBy: { academicYear: "desc" }, select: { academicYear: true, status: true } });
    // This tool never adds a second cycle or overwrites one (academic-setup-service CYCLE_DETAILS_CONFLICT).
    if (existing) throw new WorkflowError("DOMAIN_REFUSED", { reason: "CYCLE_EXISTS", academicYear: existing.academicYear, status: existing.status });
    return { ...input, label: cycleLabel(input) };
  },
  async preview(ctx, input) {
    ownCampusId(ctx);
    return {
      title: say(ctx, l("Create the academic year as a draft", "إنشاء العام الدراسي كمسودة", "تعلیمی سال مسودے کے طور پر بنائیں")),
      lines: [
        { label: say(ctx, l("Year", "العام", "سال")), value: String(input.academicYear) },
        { label: say(ctx, l("Name", "الاسم", "نام")), value: cycleLabel(input) },
        { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, l("Draft (not started)", "مسودة (لم يبدأ)", "مسودہ (شروع نہیں ہوا)")) },
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: say(ctx, l("Attendance, marks and timetables wait until the year is activated. Activation is a separate step for the principal, or for you when there is no principal.", "الحضور والدرجات والجداول تنتظر تفعيل العام. التفعيل خطوة منفصلة للمدير، أو لك عند عدم وجود مدير.", "حاضری، نمبر اور ٹائم ٹیبل سال فعال ہونے تک رکے رہیں گے۔ فعال کرنا الگ قدم ہے، پرنسپل کا، یا پرنسپل نہ ہو تو آپ کا۔")) },
      ],
      counts: { cycles: 1 },
      confirmLabel: `${say(ctx, l("Create draft year", "إنشاء عام كمسودة", "مسودہ سال بنائیں"))} · ${cycleLabel(input)}`,
      basis: { input },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const label = cycleLabel(input);
    const cycles = await prisma.academicCycle.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { id: true, academicYear: true, label: true, status: true } });
    const same = cycles.length === 1 && cycles[0].academicYear === input.academicYear && cycles[0].status === "DRAFT" && normalizeAcademicName(cycles[0].label) === normalizeAcademicName(label) ? cycles[0] : null;
    if (same) return { kind: "write", capability: "academic.cycle.create", entities: [{ model: "academicCycle", id: same.id }], counts: { cycles: 0 }, link: YEAR_LINK, replayed: false, detail: { status: same.status, activated: false, reconciled: true } };
    if (cycles.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "CYCLE_EXISTS", academicYear: cycles[0].academicYear, status: cycles[0].status });
    const cycle = await writeAcademicCycle(ctx.user, campusId, { action: "create", label, academicYear: input.academicYear });
    if (cycle.status !== "DRAFT") throw new WorkflowError("INTERNAL");
    notify("ACADEMIC_CYCLE_CHANGED", { schoolId: ctx.user.schoolId, campusId, actorId: ctx.user.userId, actorName: ctx.user.fullName, label: cycle.label, status: cycle.status });
    return { kind: "write", capability: "academic.cycle.create", entities: [{ model: "academicCycle", id: cycle.id }], counts: { cycles: 1 }, link: YEAR_LINK, replayed: false, detail: { status: cycle.status, activated: false } };
  },
});

// ─── academic.cycle.activate ──────────────────────────────────────────────

const activateInput = z.strictObject({ cycleId: z.string().min(1).optional() });
type ActivateInput = z.infer<typeof activateInput>;

async function draftCycle(ctx: CapabilityContext, cycleId: string | undefined) {
  const campusId = ownCampusId(ctx);
  const cycles = await prisma.academicCycle.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, orderBy: { academicYear: "asc" }, select: { id: true, academicYear: true, label: true, status: true } });
  if (cycleId && !cycles.some(cycle => cycle.id === cycleId)) throw new WorkflowError("SCOPE_DENIED");
  const active = cycles.find(cycle => cycle.status === "ACTIVE");
  if (active) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ACTIVE_CYCLE_EXISTS", academicYear: active.academicYear });
  const drafts = cycles.filter(cycle => cycle.status === "DRAFT" && (!cycleId || cycle.id === cycleId));
  if (!drafts.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_DRAFT_CYCLE" });
  if (drafts.length > 1) throw new InputRequired([{ pointer: "/cycleId", promptKey: "CYCLE_CHOOSE_DRAFT", params: { count: drafts.length }, options: drafts.map(cycle => ({ value: cycle.id, label: cycle.label })) }]);
  return drafts[0];
}

const CYCLE_ACTIVATE = defineCapability<ActivateInput>({
  key: "academic.cycle.activate", version: 1, cluster: "C1", inventoryKeys: ["academic.cycle.transition"], risk: "UPDATE", roles: OPERATORS, class: "C",
  input: activateInput, evidence: [],
  gates: [...OPERATOR_GATES], scope: { kind: "own-campus" },
  copy: c(
    ["Ask for the academic year to be started", "Send the draft year to the principal to activate; when there is no principal, it opens on your Academic year screen.", "Start the new academic year"],
    ["طلب بدء العام الدراسي", "إرسال العام المسودة إلى المدير لتفعيله؛ وعند عدم وجود مدير يفتح في شاشة العام الدراسي لديك.", "ابدأ العام الدراسي الجديد"],
    ["تعلیمی سال شروع کروائیں", "مسودہ سال پرنسپل کو فعال کرنے کے لیے بھیجیں؛ پرنسپل نہ ہو تو یہ آپ کی تعلیمی سال اسکرین پر کھلے گا۔", "نیا تعلیمی سال شروع کر دیں"],
  ),
  source: { route: "POST /api/academic-cycle (action: activate)", service: "src/lib/ai-workflows/executor/step-runner.ts:openHandoff (ROLE_TASK)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    return { cycleId: (await draftCycle(ctx, input.cycleId)).id };
  },
  handoff: {
    kind: "ROLE_TASK",
    async prepare(ctx, input) {
      const cycle = await draftCycle(ctx, input.cycleId);
      const seats = await ctx.seats();
      // Year activation is the academic lead's (PRINCIPAL, via the typed academics.transition_year review);
      // with that seat vacant it stays with the campus operator on the Academic year screen.
      return seats.principal
        ? { kind: "ROLE_TASK", targetRoles: ["PRINCIPAL"], link: "/ai?workflow=schoolOperations", prefill: { operation: "academics.transition_year", action: "activate", cycleId: cycle.id, academicYear: cycle.academicYear, label: cycle.label }, detail: { seat: "principal" } }
        : { kind: "ROLE_TASK", targetRoles: OPERATORS, link: YEAR_LINK, prefill: { action: "activate", cycleId: cycle.id, academicYear: cycle.academicYear, label: cycle.label }, detail: { seat: "vacant" } };
    },
  },
});

// ─── academic.class_teacher.assign ────────────────────────────────────────

const classTeacherInput = z.strictObject({ classId: z.string().min(1), teacherId: z.string().min(1) });
type ClassTeacherInput = z.infer<typeof classTeacherInput>;

/** PATCH /api/classes assertTeacherInCampus: an active TEACHER or PRINCIPAL of this campus. */
async function campusTeacher(ctx: CapabilityContext, teacherId: string) {
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId: ctx.user.schoolId, campusId: ownCampusId(ctx), role: { in: ["TEACHER", "PRINCIPAL"] }, isActive: true }, select: { id: true, fullName: true } });
  if (!teacher) throw new WorkflowError("SCOPE_DENIED");
  return teacher;
}

const CLASS_TEACHER_ASSIGN = defineCapability<ClassTeacherInput>({
  key: "academic.class_teacher.assign", version: 1, cluster: "C1", inventoryKeys: ["academic.class.assign_teacher"], risk: "UPDATE", roles: OPERATORS, class: "C",
  input: classTeacherInput, evidence: [],
  gates: [...OPERATOR_GATES], scope: { kind: "own-campus" },
  copy: c(
    ["Choose a class teacher", "Prepare a class-teacher change for the academic lead: the principal decides it, or you on the Classes screen when there is no principal.", "Make Ms. Ayesha the class teacher of 6C"],
    ["اختيار معلم الفصل", "تجهيز تغيير معلم الفصل للقيادة الأكاديمية: يقرره المدير، أو أنت في شاشة الفصول عند عدم وجود مدير.", "اجعل الأستاذة عائشة معلمة الصف 6ج"],
    ["کلاس ٹیچر مقرر کریں", "کلاس ٹیچر کی تبدیلی تعلیمی سربراہ کے لیے تیار کریں: فیصلہ پرنسپل کا، یا پرنسپل نہ ہو تو آپ کلاسز اسکرین پر کریں۔", "مس عائشہ کو 6سی کی کلاس ٹیچر بنا دیں"],
  ),
  source: { route: "PATCH /api/classes (classTeacherId)", service: "src/lib/ai-workflows/executor/step-runner.ts:openHandoff (ROLE_TASK)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    await campusClass(ctx, input.classId);
    await campusTeacher(ctx, input.teacherId);
    return input;
  },
  handoff: {
    kind: "ROLE_TASK",
    async prepare(ctx, input) {
      const [klass, teacher, seats] = await Promise.all([campusClass(ctx, input.classId), campusTeacher(ctx, input.teacherId), ctx.seats()]);
      const prefill = { classId: klass.id, classTeacherId: teacher.id, currentClassTeacherId: klass.classTeacherId };
      // The class teacher is the academic lead's call (canLeadAcademics): the principal while that seat is held.
      return seats.principal
        ? { kind: "ROLE_TASK", targetRoles: ["PRINCIPAL"], link: "/principal?view=classes", prefill, detail: { seat: "principal", unchanged: klass.classTeacherId === teacher.id } }
        : { kind: "ROLE_TASK", targetRoles: OPERATORS, link: "/admin?view=classes", prefill, detail: { seat: "vacant", unchanged: klass.classTeacherId === teacher.id } };
    },
  },
});

export const ADMIN_ROSTER_ENTRIES: readonly CapabilityEntry[] = [STAGE_BATCH, COMMIT_BATCH, CYCLE_CREATE, CYCLE_ACTIVATE, CLASS_TEACHER_ASSIGN];
