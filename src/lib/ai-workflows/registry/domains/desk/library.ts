import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { canManageLibrary } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { addCopies, currentRules, issueCopy, renewLoan, reserveTitle, returnCopy, saveRules } from "@/lib/library/desk";
import { dueDate, finePreview, ymd, type LoanRules } from "@/lib/library/rules";
import { createBook, createCategory, createMember, updateBook } from "@/lib/library/catalogue-command";
import { saveRequest } from "@/lib/purchasing/service";
import type { PermissionAction } from "@/lib/permissions";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles, seatVacantForOperator } from "../../gates";
import { InputRequired, WorkflowError, toWorkflowError, type RequiredField } from "../../../errors";
import { assignedClass } from "../../../resolve/scope";
import { matchPupil } from "../../../resolve/pupils";
import {
  BARCODE, bindCategory, bindCopy, bindMember, bindTitle, copyById, libraryCampus, libraryMembers, memberById, memberLabel, normalIsbn, titleById, titleLabel,
  type LibraryMemberRow,
} from "../../../resolve/library";
import type { CapabilityContext, CapabilityEntry, EntryCopy, HandoffPrepared, L10n, Receipt } from "../../types";

/**
 * The librarian's desk (Slice 6): lend, return, renew and reserve physical copies, register copies, the
 * circulation loan rules, members, catalogue titles and sections, a purchase-request draft, and the overdue
 * list. Each write calls the desk service or the extracted catalogue command its route calls.
 *
 * - Money is never AI's to decide (RT12). A return preview SHOWS the fine the loan's own rules compute; the
 *   input has no fine or date field, so it cannot be edited. Fine and lost-book amounts, marking a copy lost
 *   and waiving or handing a charge to fees are class C hand-offs to the campus administrator.
 * - The circulation rules entry has no money field; a save keeps the money fields exactly as they are.
 * - Members, copies and titles are typed by the user and bound here on this campus (resolve/library.ts).
 * - Services without a key reconcile on the domain (RT17): an issue replay matches only an open loan of the
 *   same copy to the same reader that this actor made; a renewal replay reconciles on the renewal count.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
const say = (ctx: CapabilityContext, text: L10n, params: Record<string, string | number> = {}) => fill(text[ctx.locale] ?? text.en, params);
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const domain = (error: unknown): never => { throw toWorkflowError(error); };

const NAME = z.string().trim().min(1).max(120);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ID = z.string().min(1).max(128);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Desk routes: canManageLibrary (+ the library module); PRINCIPAL is not offered library writes (Appendix D, rule 19). */
const ROLES: readonly UserRole[] = ["LIBRARIAN", "ADMIN", "CAMPUS_ADMIN"];
const OPERATORS: readonly UserRole[] = ["CAMPUS_ADMIN", "ADMIN"];
const deskGates = (action: PermissionAction, seat = true) => [
  roles(ROLES), predicate("canManageLibrary", canManageLibrary, ROLES), permission("library", action), ownCampus(),
  ...(seat ? [seatVacantForOperator("librarian", "LIBRARIAN")] : []),
];

const deskLink = (ctx: CapabilityContext) => ctx.user.role === "LIBRARIAN" ? "/librarian?view=lending" : "/admin?view=library&tab=lending";
const catalogueLink = (ctx: CapabilityContext, tab: "books" | "members" | "categories") => ctx.user.role === "LIBRARIAN" ? `/librarian?view=catalogue&tab=${tab}` : "/admin?view=library&tab=catalogue";
const OPERATOR_DESK = "/admin?view=library&tab=lending";
const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-US")}`;

async function campusToday(ctx: CapabilityContext, campusId: string) {
  const { timezone } = await getLocalePackage(ctx.user.schoolId, campusId, ctx.now);
  return calendarDateIn(timezone, ctx.now);
}
const rulesOf = async (campusId: string, ctx: CapabilityContext, snapshot: Prisma.JsonValue | null): Promise<LoanRules> =>
  (snapshot as LoanRules | null) ?? currentRules(prisma, ctx.user.schoolId, campusId);

const alreadyLine = (ctx: CapabilityContext, text: L10n) => ({ label: say(ctx, l("Already done", "تم مسبقاً", "پہلے سے ہو چکا")), value: say(ctx, text) });

function receipt(capability: string, entities: Receipt["entities"], counts: Record<string, number>, link: string | null, detail: Record<string, unknown>, reconciled = false, kind: Receipt["kind"] = "write"): Receipt {
  return { kind, capability, entities, counts, link, replayed: false, detail: reconciled ? { reconciled: true, ...detail } : detail };
}

async function openLoanOf(copyId: string, schoolId: string) {
  return prisma.bookIssue.findFirst({ where: { copyId, schoolId, returnedAt: null } });
}

// ─── library.desk_issue_copy ──────────────────────────────────────────────

const issueInput = z.strictObject({
  /** The reader as the user said it: a member number ("M-0012") or a name ("Ayesha Khan"). */
  member: NAME,
  /** The copy as the user said it: its label ("LB-0042") or the title ("Atlas of the World"). */
  copy: NAME,
  /** Narrows the reader to pupils of one class (a class handle), e.g. "Ayesha Khan (7B)". */
  classId: ID.optional(),
  /** Bound by the server; never taken from the model. */
  memberId: ID.optional(),
  copyId: ID.optional(),
});
type IssueInput = z.infer<typeof issueInput>;

async function bindIssue(ctx: CapabilityContext, input: IssueInput) {
  const campusId = libraryCampus(ctx);
  if (input.classId) await assignedClass(ctx, input.classId);
  const member = input.memberId ? await memberById(ctx, input.memberId) : await bindMember(ctx, input.member, "/member", input.classId);
  const copy = input.copyId ? await copyById(ctx, input.copyId) : await bindCopy(ctx, input.copy, "/copy", "AVAILABLE");
  const rules = await currentRules(prisma, ctx.user.schoolId, campusId);
  const open = await prisma.bookIssue.count({ where: { memberId: member.id, returnedAt: null } });
  const loan = copy.status === "ON_LOAN" ? await openLoanOf(copy.id, ctx.user.schoolId) : null;
  // Only a loan of this copy to this reader that this actor made counts as this step's own earlier write (RT17).
  const mine = !!loan && loan.memberId === member.id && (loan.policySnapshot as unknown as { issuedById?: string } | null)?.issuedById === ctx.user.userId ? loan : null;
  const hold = copy.status === "RESERVED_HOLD" && copy.holdFor ? await prisma.bookReservation.findFirst({ where: { id: copy.holdFor, status: "READY" }, select: { memberId: true } }) : null;
  return { campusId, member, copy, rules, open, mine, holdForReader: hold?.memberId === member.id };
}

function refuseIssue(state: Awaited<ReturnType<typeof bindIssue>>) {
  if (state.mine) return;
  if (state.copy.status === "ON_LOAN") throw new WorkflowError("DOMAIN_REFUSED", { reason: "COPY_ON_LOAN" });
  // Releasing a copy held for another reader needs a person's reason at the desk, never the AI's.
  if (state.copy.status === "RESERVED_HOLD" && !state.holdForReader) throw new WorkflowError("DOMAIN_REFUSED", { reason: "COPY_HELD_FOR_RESERVATION" });
  if (state.copy.status !== "AVAILABLE" && state.copy.status !== "RESERVED_HOLD") throw new WorkflowError("DOMAIN_REFUSED", { reason: "COPY_NOT_LENDABLE" });
  if (state.open >= state.rules.maxLoans) throw new WorkflowError("DOMAIN_REFUSED", { reason: "LOAN_LIMIT", open: state.open, max: state.rules.maxLoans });
}

const ISSUE = defineCapability<IssueInput>({
  key: "library.desk_issue_copy", version: 1, cluster: "C7", inventoryKeys: ["library.desk_issue_copy"], risk: "CREATE", roles: ROLES, class: "B",
  input: issueInput, evidence: ["/member", "/copy"], humanFields: ["memberId", "copyId"],
  gates: deskGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Issue a book", "Lend one copy to a reader at the desk; the due date follows your loan rules.", "Issue LB-0042 to Ayesha Khan (7B)"],
    ["إعارة كتاب", "إعارة نسخة لقارئ من مكتب الإعارة؛ تاريخ الإرجاع حسب قواعد الإعارة.", "أعر النسخة LB-0042 لعائشة خان (7ب)"],
    ["کتاب جاری کریں", "ڈیسک سے ایک نسخہ قاری کو جاری کریں؛ واپسی کی تاریخ اجرا کے قواعد کے مطابق ہوگی۔", "ایل بی 0042 عائشہ خان (7بی) کو جاری کر دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/desk (action=issue)", service: "src/lib/library/desk.ts:issueCopy", reuse: "direct" },
  async resolve(ctx, input) {
    const state = await bindIssue(ctx, { ...input, memberId: undefined, copyId: undefined });
    refuseIssue(state);
    return { ...input, member: state.member.name, copy: state.copy.barcode, memberId: state.member.id, copyId: state.copy.id };
  },
  async preview(ctx, input) {
    const state = await bindIssue(ctx, input);
    refuseIssue(state);
    const due = state.mine ? ymd(state.mine.dueAt) : ymd(dueDate(ctx.now, state.rules));
    return {
      title: say(ctx, l("Issue a book", "إعارة كتاب", "کتاب جاری کریں")),
      lines: [
        { label: say(ctx, l("Reader", "القارئ", "قاری")), value: memberLabel(state.member) },
        { label: say(ctx, l("Copy", "النسخة", "نسخہ")), value: `${state.copy.barcode} · ${state.copy.title}` },
        { label: say(ctx, l("Due back", "تاريخ الإرجاع", "واپسی کی تاریخ")), value: due },
        { label: say(ctx, l("Books on loan", "الكتب المعارة", "جاری کتابیں")), value: `${state.mine ? state.open : state.open + 1} / ${state.rules.maxLoans}` },
        ...(state.mine ? [alreadyLine(ctx, l("This copy is already on loan to this reader; nothing new is issued.", "هذه النسخة معارة لهذا القارئ؛ لن تُعار مرة أخرى.", "یہ نسخہ پہلے ہی اسی قاری کو جاری ہے؛ دوبارہ جاری نہیں ہوگا۔"))] : []),
      ],
      counts: { loans: state.mine ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Issue", "إعارة", "جاری کریں"))} · ${say(ctx, l("due {due}", "الإرجاع {due}", "واپسی {due}"), { due })}`,
      basis: { memberId: state.member.id, copyId: state.copy.id, status: state.copy.status, copyVersion: state.copy.updatedAt.toISOString(), rulesVersion: state.rules.version, due, open: state.open, mine: state.mine?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const state = await bindIssue(ctx, input);
    const detail = (loan: { id: string; dueAt: Date }) => ({ dueAt: ymd(loan.dueAt), barcode: state.copy.barcode, memberNo: state.member.memberNo, title: state.copy.title });
    if (state.mine) return receipt("library.desk_issue_copy", [{ model: "bookIssue", id: state.mine.id }], { issued: 0 }, deskLink(ctx), detail(state.mine), true);
    refuseIssue(state);
    const loan = await issueCopy(ctx.user, { memberId: state.member.id, barcode: state.copy.barcode }).catch(domain);
    return receipt("library.desk_issue_copy", [{ model: "bookIssue", id: loan.id }], { issued: 1 }, deskLink(ctx), detail(loan));
  },
});

// ─── library.desk_return_copy ─────────────────────────────────────────────

const returnInput = z.strictObject({
  /** The copy as the user said it: its label ("LB-0042") or the title when one copy of it is on loan. */
  copy: NAME,
  /** The condition the user reported ("cover damaged" → DAMAGED); GOOD when they said nothing. */
  condition: z.enum(["GOOD", "WORN", "DAMAGED"]).optional(),
  /** Bound by the server: the copy, its open loan and the return day (today on this campus). */
  copyId: ID.optional(),
  loanId: ID.optional(),
  returnedOn: DAY.optional(),
});
type ReturnInput = z.infer<typeof returnInput>;
const CONDITION_LABEL: Record<"GOOD" | "WORN" | "DAMAGED", L10n> = { GOOD: l("Good", "جيدة", "اچھی"), WORN: l("Worn", "مستهلكة", "پرانی"), DAMAGED: l("Damaged", "تالفة", "خراب") };

async function bindReturn(ctx: CapabilityContext, input: ReturnInput) {
  const campusId = libraryCampus(ctx);
  const copy = input.copyId ? await copyById(ctx, input.copyId) : await bindCopy(ctx, input.copy, "/copy", "ON_LOAN");
  const loan = input.loanId
    ? await prisma.bookIssue.findFirst({ where: { id: input.loanId, schoolId: ctx.user.schoolId, copyId: copy.id } })
    : await openLoanOf(copy.id, ctx.user.schoolId);
  if (!loan) throw new WorkflowError(input.loanId ? "SCOPE_DENIED" : "DOMAIN_REFUSED", input.loanId ? {} : { reason: "NOT_ON_LOAN" });
  const returnedOn = input.returnedOn ?? await campusToday(ctx, campusId);
  const rules = await rulesOf(campusId, ctx, loan.policySnapshot);
  const policy = await currentRules(prisma, ctx.user.schoolId, campusId);
  const fine = finePreview(loan.dueAt, new Date(`${returnedOn}T12:00:00Z`), rules);
  const member = await prisma.libraryMember.findFirst({ where: { id: loan.memberId }, select: { memberNo: true, user: { select: { fullName: true } } } });
  return { campusId, copy, loan, returnedOn, rules, policy, fine, reader: member ? `${member.user.fullName} · ${member.memberNo}` : "—" };
}

const RETURN = defineCapability<ReturnInput>({
  key: "library.desk_return_copy", version: 1, cluster: "C7", inventoryKeys: ["library.desk_return_copy"], risk: "UPDATE", roles: ROLES, class: "B",
  input: returnInput, evidence: ["/copy"], humanFields: ["copyId", "loanId", "returnedOn"],
  gates: deskGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Return a book", "Check a copy back in. Any late fine is worked out from the loan's own rules and shown before you confirm; it cannot be changed here.", "Return LB-0042, cover damaged"],
    ["إرجاع كتاب", "استلام نسخة. أي غرامة تأخير تُحسب من قواعد الإعارة نفسها وتظهر قبل التأكيد؛ ولا يمكن تغييرها هنا.", "أرجع النسخة LB-0042، الغلاف تالف"],
    ["کتاب واپس لیں", "نسخہ واپس درج کریں۔ اگر لیٹ جرمانہ بنتا ہے تو وہ اجرا کے اپنے قواعد سے نکلتا ہے اور تصدیق سے پہلے دکھایا جاتا ہے؛ یہاں بدلا نہیں جا سکتا۔", "ایل بی 0042 واپس آ گئی، جلد خراب ہے"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/desk (action=return)", service: "src/lib/library/desk.ts:returnCopy", reuse: "direct" },
  async resolve(ctx, input) {
    const state = await bindReturn(ctx, { ...input, copyId: undefined, loanId: undefined, returnedOn: undefined });
    if (state.loan.returnedAt) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NOT_ON_LOAN" });
    return { ...input, copy: state.copy.barcode, copyId: state.copy.id, loanId: state.loan.id, returnedOn: state.returnedOn };
  },
  async preview(ctx, input) {
    const state = await bindReturn(ctx, input);
    const { fine } = state;
    const done = !!state.loan.returnedAt;
    return {
      title: say(ctx, l("Return a book", "إرجاع كتاب", "کتاب واپس لیں")),
      lines: [
        { label: say(ctx, l("Copy", "النسخة", "نسخہ")), value: `${state.copy.barcode} · ${state.copy.title}` },
        { label: say(ctx, l("Reader", "القارئ", "قاری")), value: state.reader },
        { label: say(ctx, l("Was due", "كان موعد الإرجاع", "واپسی کی تاریخ تھی")), value: ymd(state.loan.dueAt) },
        { label: say(ctx, l("Returned on", "تاريخ الإرجاع", "واپسی کا دن")), value: state.returnedOn },
        { label: say(ctx, l("Condition", "الحالة", "حالت")), value: say(ctx, CONDITION_LABEL[input.condition ?? "GOOD"]) },
        {
          label: say(ctx, l("Late fine", "غرامة التأخير", "لیٹ جرمانہ")),
          value: fine.amount > 0
            ? say(ctx, l("{amount} for {days} chargeable days (loan rules v{version}). It cannot be changed here; a waiver is decided by your campus administrator.", "{amount} عن {days} أيام محتسبة (قواعد الإعارة الإصدار {version}). لا يمكن تغييرها هنا؛ الإعفاء يقرره مدير الحرم.", "{amount}، {days} قابلِ جرمانہ دنوں کا (اجرا کے قواعد v{version})۔ یہاں بدلا نہیں جا سکتا؛ معافی کا فیصلہ کیمپس منتظم کریں گے۔"), { amount: money(fine.amount, fine.currency), days: fine.chargeableDays, version: state.rules.version })
            : say(ctx, l("No fine", "لا غرامة", "کوئی جرمانہ نہیں")),
        },
        ...(done ? [alreadyLine(ctx, l("This loan is already returned; nothing changes.", "هذه الإعارة مُرجعة مسبقاً؛ لا تغيير.", "یہ کتاب پہلے ہی واپس ہو چکی؛ کچھ نہیں بدلے گا۔"))] : []),
      ],
      counts: { returns: done ? 0 : 1, fine: done ? 0 : fine.amount },
      confirmLabel: fine.amount > 0 && !done
        ? `${say(ctx, l("Return", "إرجاع", "واپس لیں"))} · ${say(ctx, l("fine {amount}", "غرامة {amount}", "جرمانہ {amount}"), { amount: money(fine.amount, fine.currency) })}`
        : say(ctx, l("Return", "إرجاع", "واپس لیں")),
      // The live policy version is part of the hash: a rule change between preview and confirm makes it stale.
      basis: { loanId: state.loan.id, copyId: state.copy.id, dueAt: state.loan.dueAt.toISOString(), returnedOn: state.returnedOn, rulesVersion: state.rules.version, policyVersion: state.policy.version, fine: fine.amount, currency: fine.currency, condition: input.condition ?? "GOOD", done },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const state = await bindReturn(ctx, input);
    const entities = [{ model: "bookIssue", id: state.loan.id }];
    if (state.loan.returnedAt) return receipt("library.desk_return_copy", entities, { returned: 0 }, deskLink(ctx), { barcode: state.copy.barcode, fine: state.loan.fine }, true);
    const open = await openLoanOf(state.copy.id, ctx.user.schoolId);
    if (!open || open.id !== state.loan.id) throw new WorkflowError("STALE_VERSION");
    const result = await returnCopy(ctx.user, { barcode: state.copy.barcode, condition: input.condition ?? "GOOD", returnedOn: state.returnedOn }).catch(domain);
    if (result.alreadyReturned) return receipt("library.desk_return_copy", entities, { returned: 0 }, deskLink(ctx), { barcode: state.copy.barcode }, true);
    const fine = "fine" in result ? result.fine : null;
    return receipt("library.desk_return_copy", entities, { returned: 1, fine: fine?.amount ?? 0 }, deskLink(ctx), { barcode: state.copy.barcode, fine, heldForNextReservation: "heldForNextReservation" in result ? result.heldForNextReservation : false });
  },
});

// ─── library.desk_renew_loan ──────────────────────────────────────────────

const renewInput = z.strictObject({
  /** The copy on loan, by its label or title. */
  copy: NAME,
  /** Bound by the server: the loan and its renewal count when the user asked. */
  loanId: ID.optional(),
  renewals: int(0, 50).optional(),
});
type RenewInput = z.infer<typeof renewInput>;

async function bindRenew(ctx: CapabilityContext, input: RenewInput) {
  const campusId = libraryCampus(ctx);
  let loan;
  if (input.loanId) {
    loan = await prisma.bookIssue.findFirst({ where: { id: input.loanId, schoolId: ctx.user.schoolId, book: { campusId } } });
    if (!loan) throw new WorkflowError("SCOPE_DENIED");
  } else {
    const copy = await bindCopy(ctx, input.copy, "/copy", "ON_LOAN");
    loan = await openLoanOf(copy.id, ctx.user.schoolId);
    if (!loan) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NOT_ON_LOAN" });
  }
  const copy = loan.copyId ? await copyById(ctx, loan.copyId) : null;
  const rules = await rulesOf(campusId, ctx, loan.policySnapshot);
  const waiting = await prisma.bookReservation.count({ where: { bookId: loan.bookId, status: "WAITING" } });
  return { loan, copy, rules, waiting };
}

function refuseRenew(state: Awaited<ReturnType<typeof bindRenew>>) {
  if (state.loan.returnedAt) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NOT_ON_LOAN" });
  if (state.loan.renewals >= state.rules.maxRenewals) throw new WorkflowError("DOMAIN_REFUSED", { reason: "RENEWALS_USED", max: state.rules.maxRenewals });
  if (state.waiting) throw new WorkflowError("DOMAIN_REFUSED", { reason: "TITLE_RESERVED" });
}

const RENEW = defineCapability<RenewInput>({
  key: "library.desk_renew_loan", version: 1, cluster: "C7", inventoryKeys: ["library.desk_renew_loan"], risk: "UPDATE", roles: ROLES, class: "B",
  input: renewInput, evidence: ["/copy"], humanFields: ["loanId", "renewals"],
  gates: deskGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Renew a loan", "Give a reader more time with a book, within the renewals your rules allow and only when no one is waiting for it.", "Renew LB-0042"],
    ["تجديد إعارة", "منح القارئ وقتاً إضافياً للكتاب، ضمن مرات التجديد المسموحة وما لم يكن هناك من ينتظره.", "جدّد إعارة النسخة LB-0042"],
    ["اجرا کی تجدید", "قاری کو کتاب کے لیے مزید وقت دیں، قواعد میں اجازت شدہ تجدید کے اندر اور جب کوئی اور انتظار میں نہ ہو۔", "ایل بی 0042 کی تجدید کر دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/desk (action=renew)", service: "src/lib/library/desk.ts:renewLoan", reuse: "direct" },
  async resolve(ctx, input) {
    const state = await bindRenew(ctx, { ...input, loanId: undefined, renewals: undefined });
    refuseRenew(state);
    return { ...input, copy: state.copy?.barcode ?? input.copy, loanId: state.loan.id, renewals: state.loan.renewals };
  },
  async preview(ctx, input) {
    const state = await bindRenew(ctx, input);
    const done = input.renewals !== undefined && state.loan.renewals === input.renewals + 1;
    if (!done) refuseRenew(state);
    const next = ymd(done ? state.loan.dueAt : dueDate(ctx.now, state.rules));
    return {
      title: say(ctx, l("Renew a loan", "تجديد إعارة", "اجرا کی تجدید")),
      lines: [
        { label: say(ctx, l("Copy", "النسخة", "نسخہ")), value: state.copy ? `${state.copy.barcode} · ${state.copy.title}` : input.copy },
        { label: say(ctx, l("Due back", "تاريخ الإرجاع", "واپسی کی تاریخ")), value: `${ymd(state.loan.dueAt)} → ${next}` },
        { label: say(ctx, l("Renewals", "مرات التجديد", "تجدید")), value: `${done ? state.loan.renewals : state.loan.renewals + 1} / ${state.rules.maxRenewals}` },
        ...(done ? [alreadyLine(ctx, l("This loan was already renewed; nothing changes.", "جُددت هذه الإعارة مسبقاً؛ لا تغيير.", "اس کی تجدید پہلے ہو چکی؛ کچھ نہیں بدلے گا۔"))] : []),
      ],
      counts: { renewals: done ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Renew", "تجديد", "تجدید کریں"))} · ${next}`,
      basis: { loanId: state.loan.id, renewals: state.loan.renewals, dueAt: state.loan.dueAt.toISOString(), next, rulesVersion: state.rules.version },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const state = await bindRenew(ctx, input);
    const entities = [{ model: "bookIssue", id: state.loan.id }];
    const detail = (dueAt: Date, renewals: number) => ({ dueAt: ymd(dueAt), renewals, barcode: state.copy?.barcode ?? null });
    // Reconciled on the count: one more renewal than when the user asked is this step's own renewal.
    if (input.renewals !== undefined && state.loan.renewals === input.renewals + 1) return receipt("library.desk_renew_loan", entities, { renewed: 0 }, deskLink(ctx), detail(state.loan.dueAt, state.loan.renewals), true);
    if (input.renewals !== undefined && state.loan.renewals !== input.renewals) throw new WorkflowError("STALE_VERSION");
    refuseRenew(state);
    const renewed = await renewLoan(ctx.user, { issueId: state.loan.id }).catch(domain);
    return receipt("library.desk_renew_loan", entities, { renewed: 1 }, deskLink(ctx), detail(renewed.dueAt, renewed.renewals));
  },
});

// ─── library.desk_reserve_title ───────────────────────────────────────────

const reserveInput = z.strictObject({
  /** The reader as the user said it (member number or name). */
  member: NAME,
  /** The title (or ISBN) the reader wants. */
  title: NAME,
  /** Narrows the reader to pupils of one class (a class handle). */
  classId: ID.optional(),
  memberId: ID.optional(),
  bookId: ID.optional(),
});
type ReserveInput = z.infer<typeof reserveInput>;

async function bindReserve(ctx: CapabilityContext, input: ReserveInput) {
  if (input.classId) await assignedClass(ctx, input.classId);
  const member = input.memberId ? await memberById(ctx, input.memberId) : await bindMember(ctx, input.member, "/member", input.classId);
  const book = input.bookId ? await titleById(ctx, input.bookId) : await bindTitle(ctx, input.title, "/title");
  const existing = await prisma.bookReservation.findFirst({ where: { bookId: book.id, memberId: member.id, status: { in: ["WAITING", "READY"] } }, select: { id: true, status: true } });
  const shelf = await prisma.bookCopy.count({ where: { bookId: book.id, status: "AVAILABLE" } });
  const waiting = await prisma.bookReservation.count({ where: { bookId: book.id, status: "WAITING" } });
  return { member, book, existing, shelf, waiting };
}
function refuseReserve(state: Awaited<ReturnType<typeof bindReserve>>) {
  if (!state.existing && state.shelf) throw new WorkflowError("DOMAIN_REFUSED", { reason: "COPY_ON_SHELF" });
}

const RESERVE = defineCapability<ReserveInput>({
  key: "library.desk_reserve_title", version: 1, cluster: "C7", inventoryKeys: ["library.desk_reserve_title"], risk: "CREATE", roles: ROLES, class: "B",
  input: reserveInput, evidence: ["/member", "/title"], humanFields: ["memberId", "bookId"],
  gates: deskGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Reserve a title", "Put a reader in the queue for a title that has no copy on the shelf; the next returned copy is held for them.", "Reserve Harry Potter for Ali Raza"],
    ["حجز عنوان", "وضع القارئ في قائمة الانتظار لعنوان لا توجد منه نسخة على الرف؛ تُحجز له أول نسخة تُرجع.", "احجز هاري بوتر لعلي رضا"],
    ["کتاب محفوظ کریں", "جس کتاب کا کوئی نسخہ شیلف پر نہ ہو اس کے لیے قاری کو قطار میں لگائیں؛ اگلا واپس آنے والا نسخہ اس کے لیے رکھا جائے گا۔", "علی رضا کے لیے ہیری پوٹر محفوظ کر دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/desk (action=reserve)", service: "src/lib/library/desk.ts:reserveTitle", reuse: "direct" },
  async resolve(ctx, input) {
    libraryCampus(ctx);
    const state = await bindReserve(ctx, { ...input, memberId: undefined, bookId: undefined });
    refuseReserve(state);
    return { ...input, member: state.member.name, title: state.book.title, memberId: state.member.id, bookId: state.book.id };
  },
  async preview(ctx, input) {
    libraryCampus(ctx);
    const state = await bindReserve(ctx, input);
    refuseReserve(state);
    const rules = await currentRules(prisma, ctx.user.schoolId, libraryCampus(ctx));
    return {
      title: say(ctx, l("Reserve a title", "حجز عنوان", "کتاب محفوظ کریں")),
      lines: [
        { label: say(ctx, l("Reader", "القارئ", "قاری")), value: memberLabel(state.member) },
        { label: say(ctx, l("Title", "العنوان", "عنوان")), value: titleLabel(state.book) },
        { label: say(ctx, l("Place in queue", "الترتيب في الانتظار", "قطار میں نمبر")), value: String(state.existing ? state.waiting : state.waiting + 1) },
        { label: say(ctx, l("Held for", "مدة الحجز", "رکھا جائے گا")), value: say(ctx, l("{days} days once a copy is back", "{days} أيام بعد عودة نسخة", "نسخہ واپس آنے پر {days} دن"), { days: rules.holdDays }) },
        ...(state.existing ? [alreadyLine(ctx, l("This reader is already in the queue; nothing new is added.", "هذا القارئ في الانتظار مسبقاً.", "یہ قاری پہلے سے قطار میں ہے۔"))] : []),
      ],
      counts: { reservations: state.existing ? 0 : 1 },
      confirmLabel: say(ctx, l("Reserve", "حجز", "محفوظ کریں")),
      basis: { memberId: state.member.id, bookId: state.book.id, existing: state.existing?.id ?? null, waiting: state.waiting, shelf: state.shelf },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    libraryCampus(ctx);
    const state = await bindReserve(ctx, input);
    if (state.existing) return receipt("library.desk_reserve_title", [{ model: "bookReservation", id: state.existing.id }], { reserved: 0 }, deskLink(ctx), { status: state.existing.status }, true);
    refuseReserve(state);
    const created = await reserveTitle(ctx.user, { memberId: state.member.id, bookId: state.book.id }).catch(domain);
    return receipt("library.desk_reserve_title", [{ model: "bookReservation", id: created.id }], { reserved: 1 }, deskLink(ctx), { position: created.position });
  },
});

// ─── library.desk_add_copies ──────────────────────────────────────────────

const addCopiesInput = z.strictObject({
  /** The title (or ISBN) the copies belong to. */
  title: NAME,
  /** The labels on the copies, as the user listed them ("LB-0042", "LB-0043"). */
  barcodes: z.array(z.string().trim().regex(BARCODE)).min(1).max(100).optional(),
  /** "Number them for me from LB-0042": the first label and how many copies. */
  numberFrom: z.string().trim().regex(/^[A-Za-z0-9-]{0,36}\d{1,8}$/u).optional(),
  count: int(1, 100).optional(),
  bookId: ID.optional(),
}).refine(value => Boolean(value.barcodes?.length) !== Boolean(value.numberFrom && value.count), "Give the labels, or the first label and a count.");
type AddCopiesInput = z.infer<typeof addCopiesInput>;

/** "LB-0042" × 3 → LB-0042, LB-0043, LB-0044 (keeps the zero padding). */
export function numberLabels(from: string, count: number) {
  const [, prefix, digits] = from.match(/^(.*?)(\d+)$/u)!;
  const start = Number.parseInt(digits, 10);
  return Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(digits.length, "0")}`);
}

async function bindCopies(ctx: CapabilityContext, input: AddCopiesInput) {
  const campusId = libraryCampus(ctx);
  const book = input.bookId ? await titleById(ctx, input.bookId) : await bindTitle(ctx, input.title, "/title");
  const labels = input.barcodes?.length ? input.barcodes : numberLabels(input.numberFrom!, input.count!);
  if (new Set(labels).size !== labels.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "BARCODE_REPEATED" });
  const taken = await prisma.bookCopy.findMany({ where: { campusId, barcode: { in: labels } }, select: { barcode: true, bookId: true } });
  const elsewhere = taken.filter(row => row.bookId !== book.id);
  if (elsewhere.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "BARCODE_IN_USE", count: elsewhere.length });
  const already = new Set(taken.map(row => row.barcode));
  return { book, labels, fresh: labels.filter(code => !already.has(code)), already: [...already] };
}

const ADD_COPIES = defineCapability<AddCopiesInput>({
  key: "library.desk_add_copies", version: 1, cluster: "C7", inventoryKeys: ["library.desk_add_copies"], risk: "CREATE", roles: ROLES, class: "B",
  input: addCopiesInput, evidence: ["/title"], humanFields: ["bookId"], limits: { maxItems: 100 },
  gates: deskGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Register copies", "Register the labelled copies of a title so each one can be lent and returned at the desk.", "Add copies LB-0042 to LB-0045 of Oxford English Grammar"],
    ["تسجيل نسخ", "تسجيل النسخ المرقّمة لعنوان حتى تُعار وتُرجع كل نسخة من المكتب.", "سجّل النسخ من LB-0042 إلى LB-0045 لكتاب قواعد اللغة الإنجليزية"],
    ["نسخے درج کریں", "کسی کتاب کے نمبر لگے نسخے درج کریں تاکہ ہر نسخہ ڈیسک سے جاری اور واپس ہو سکے۔", "آکسفورڈ انگلش گرامر کے نسخے LB-0042 سے LB-0045 تک درج کر دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/desk (action=copies)", service: "src/lib/library/desk.ts:addCopies", reuse: "direct" },
  async resolve(ctx, input) {
    const state = await bindCopies(ctx, { ...input, bookId: undefined });
    return { title: state.book.title, barcodes: state.labels, bookId: state.book.id };
  },
  async preview(ctx, input) {
    const state = await bindCopies(ctx, input);
    const shown = (codes: string[]) => (codes.length > 10 ? `${codes.slice(0, 10).join(", ")} …` : codes.join(", ")) || "—";
    return {
      title: say(ctx, l("Register copies", "تسجيل نسخ", "نسخے درج کریں")),
      lines: [
        { label: say(ctx, l("Title", "العنوان", "عنوان")), value: titleLabel(state.book) },
        { label: say(ctx, l("New copies", "نسخ جديدة", "نئے نسخے")), value: `${state.fresh.length} · ${shown(state.fresh)}` },
        ...(state.already.length ? [{ label: say(ctx, l("Already registered", "مسجلة مسبقاً", "پہلے سے درج")), value: shown(state.already) }] : []),
      ],
      counts: { copies: state.fresh.length, alreadyRegistered: state.already.length },
      confirmLabel: `${say(ctx, l("Register", "تسجيل", "درج کریں"))} · ${state.fresh.length}`,
      basis: { bookId: state.book.id, fresh: state.fresh, already: [...state.already].sort() },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const state = await bindCopies(ctx, input);
    if (!state.fresh.length) {
      const rows = await prisma.bookCopy.findMany({ where: { bookId: state.book.id, barcode: { in: state.labels } }, select: { id: true } });
      return receipt("library.desk_add_copies", rows.map(row => ({ model: "bookCopy", id: row.id })), { added: 0, alreadyRegistered: state.already.length }, deskLink(ctx), { bookId: state.book.id }, true);
    }
    const rows = await addCopies(ctx.user, { bookId: state.book.id, barcodes: state.fresh }).catch(domain);
    const created = rows.filter(row => state.fresh.includes(row.barcode));
    return receipt("library.desk_add_copies", created.map(row => ({ model: "bookCopy", id: row.id })), { added: created.length, alreadyRegistered: state.already.length }, deskLink(ctx), { bookId: state.book.id });
  },
});

// ─── library.desk_save_rules (circulation only) ───────────────────────────

/** Circulation fields only. Money (fines, grace, cap, lost charge) is not in this input; a save keeps it as it is. */
const rulesInput = z.strictObject({
  loanDays: int(1, 120).optional(),
  maxLoans: int(1, 20).optional(),
  maxRenewals: int(0, 10).optional(),
  holdDays: int(1, 14).optional(),
  /** Extra closure days (no due dates, no fines). Replaces the list when given. */
  closures: z.array(DAY).max(400).optional(),
}).refine(value => Object.values(value).some(field => field !== undefined), "Say which loan rule to change.");
type RulesInput = z.infer<typeof rulesInput>;
const CIRCULATION = ["loanDays", "maxLoans", "maxRenewals", "holdDays"] as const;
const RULE_LABEL: Record<(typeof CIRCULATION)[number] | "closures", L10n> = {
  loanDays: l("Days per loan", "أيام الإعارة", "اجرا کے دن"), maxLoans: l("Books per reader", "كتب لكل قارئ", "فی قاری کتابیں"),
  maxRenewals: l("Renewals allowed", "مرات التجديد", "تجدید کی اجازت"), holdDays: l("Days a reserved book waits", "أيام انتظار الحجز", "محفوظ کتاب کتنے دن رکے"),
  closures: l("Closure days", "أيام الإغلاق", "بندش کے دن"),
};

async function bindRules(ctx: CapabilityContext, input: RulesInput) {
  const campusId = libraryCampus(ctx);
  const current = await currentRules(prisma, ctx.user.schoolId, campusId);
  const currency = current.version ? current.currency : (await getLocalePackage(ctx.user.schoolId, campusId)).currency;
  const closures = input.closures ? [...new Set(input.closures)].sort() : [...current.closures].sort();
  const next = { loanDays: input.loanDays ?? current.loanDays, maxLoans: input.maxLoans ?? current.maxLoans, maxRenewals: input.maxRenewals ?? current.maxRenewals, holdDays: input.holdDays ?? current.holdDays, closures };
  const unchanged = current.version > 0 && CIRCULATION.every(key => next[key] === current[key]) && next.closures.join() === [...current.closures].sort().join();
  return { current, currency, next, unchanged };
}

const SAVE_RULES = defineCapability<RulesInput>({
  key: "library.desk_save_rules", version: 1, cluster: "C7", inventoryKeys: ["library.desk_save_rules"], risk: "UPDATE", roles: ROLES, class: "B",
  input: rulesInput, evidence: [],
  gates: deskGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Set the loan rules", "Change how long books are lent, how many a reader holds, renewals, hold days and closure days. Fines are not changed here.", "Make the loan period 21 days and allow 3 books per reader"],
    ["ضبط قواعد الإعارة", "تغيير مدة الإعارة وعدد الكتب لكل قارئ ومرات التجديد وأيام الحجز وأيام الإغلاق. لا تتغير الغرامات هنا.", "اجعل مدة الإعارة 21 يوماً و3 كتب لكل قارئ"],
    ["اجرا کے قواعد طے کریں", "کتاب کتنے دن کے لیے، فی قاری کتنی، تجدید، محفوظ رکھنے کے دن اور بندش کے دن بدلیں۔ جرمانے یہاں نہیں بدلتے۔", "اجرا کی مدت 21 دن کر دیں اور ہر قاری کو 3 کتابیں دیں"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/library/desk (action=rules)", service: "src/lib/library/desk.ts:saveRules", reuse: "direct" },
  async resolve(ctx, input) {
    if (input.closures?.some(day => Number.isNaN(new Date(`${day}T00:00:00Z`).getTime()))) throw new InputRequired([{ pointer: "/closures", promptKey: "DATE_INVALID" }]);
    libraryCampus(ctx);
    return input;
  },
  async preview(ctx, input) {
    const { current, next, unchanged } = await bindRules(ctx, input);
    const lines = CIRCULATION.filter(key => input[key] !== undefined).map(key => ({ label: say(ctx, RULE_LABEL[key]), value: `${current[key]} → ${next[key]}` }));
    if (input.closures) lines.push({ label: say(ctx, RULE_LABEL.closures), value: `${current.closures.length} → ${next.closures.length}` });
    lines.push({
      label: say(ctx, l("Fines and lost-book charges", "الغرامات ورسوم الكتب المفقودة", "جرمانے اور گمشدہ کتاب کی رقم")),
      value: say(ctx, l("Unchanged ({fine} a day, lost book {lost}). Changing them goes to your campus administrator.", "دون تغيير ({fine} يومياً، الكتاب المفقود {lost}). تغييرها يذهب إلى مدير الحرم.", "بغیر تبدیلی ({fine} فی دن، گمشدہ کتاب {lost})۔ انہیں بدلنا کیمپس منتظم کے پاس جاتا ہے۔"), { fine: money(current.finePerDay, current.currency), lost: money(current.lostCharge, current.currency) }),
    });
    if (unchanged) lines.push(alreadyLine(ctx, l("These are already the loan rules; no new version is saved.", "هذه هي القواعد الحالية؛ لن يُحفظ إصدار جديد.", "یہی موجودہ قواعد ہیں؛ نیا ورژن محفوظ نہیں ہوگا۔")));
    return {
      title: say(ctx, l("Set the loan rules", "ضبط قواعد الإعارة", "اجرا کے قواعد")),
      lines, counts: { versions: unchanged ? 0 : 1 },
      confirmLabel: say(ctx, l("Save loan rules", "حفظ القواعد", "قواعد محفوظ کریں")),
      basis: { currentVersion: current.version, next },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { current, currency, next, unchanged } = await bindRules(ctx, input);
    const link = deskLink(ctx);
    if (unchanged) {
      const row = await prisma.libraryLoanPolicy.findFirst({ where: { schoolId: ctx.user.schoolId, campusId: libraryCampus(ctx), version: current.version }, select: { id: true } });
      return receipt("library.desk_save_rules", row ? [{ model: "libraryLoanPolicy", id: row.id }] : [], { versions: 0 }, link, { version: current.version }, true);
    }
    // Money fields are copied from the live version unchanged (0 when none was ever approved).
    const saved = await saveRules(ctx.user, { ...next, graceDays: current.graceDays, finePerDay: current.finePerDay, fineCap: current.fineCap, lostCharge: current.lostCharge, currency }).catch(domain);
    return receipt("library.desk_save_rules", [{ model: "libraryLoanPolicy", id: saved.id }], { versions: 1 }, link, { version: saved.version, finePerDay: saved.finePerDay, lostCharge: saved.lostCharge });
  },
});

// ─── library.desk_save_rules_money (class C) ──────────────────────────────

const moneyRulesInput = z.strictObject({
  /** Late fine per open day, in whole currency units, as the user said it. */
  finePerDay: int(0, 100000).optional(),
  graceDays: int(0, 30).optional(),
  /** Most a single late return can be charged. */
  fineCap: int(0, 10000000).optional(),
  /** Charged when a copy is lost. */
  lostCharge: int(0, 10000000).optional(),
}).refine(value => Object.values(value).some(field => field !== undefined), "Say which charge to change.");
type MoneyRulesInput = z.infer<typeof moneyRulesInput>;
const MONEY_FIELDS = ["finePerDay", "graceDays", "fineCap", "lostCharge"] as const;

const SAVE_RULES_MONEY = defineCapability<MoneyRulesInput>({
  key: "library.desk_save_rules_money", version: 1, cluster: "C7", inventoryKeys: ["library.desk_save_rules"], risk: "FINANCIAL", roles: ROLES, class: "C",
  input: moneyRulesInput, evidence: [],
  // The campus administrator decides money rules whoever asks, so there is no seat gate here.
  gates: deskGates("edit", false), scope: { kind: "own-campus" },
  copy: c(
    ["Propose late fines or a lost-book charge", "Propose a late fine, grace days, a fine cap or a lost-book charge. Your campus administrator decides and saves it; until then nothing is charged.", "Charge Rs 10 a day for late books, at most Rs 200"],
    ["اقتراح غرامة تأخير أو رسم كتاب مفقود", "اقترح غرامة تأخير أو أيام سماح أو حداً أعلى أو رسماً للكتاب المفقود. يقرره مدير الحرم ويحفظه؛ ولا يُحصّل شيء قبل ذلك.", "غرامة ريالين يومياً للكتب المتأخرة وبحد أقصى 50"],
    ["لیٹ جرمانے یا گمشدہ کتاب کی رقم کی تجویز", "لیٹ جرمانہ، رعایتی دن، زیادہ سے زیادہ حد یا گمشدہ کتاب کی رقم تجویز کریں۔ فیصلہ اور محفوظ کرنا کیمپس منتظم کا ہے؛ تب تک کچھ وصول نہیں ہوگا۔", "دیر سے واپسی پر 10 روپے روزانہ جرمانہ، زیادہ سے زیادہ 200 روپے"],
  ),
  source: { route: "POST /api/library/desk (action=rules)", service: "DOMAIN_SCREEN; src/lib/library/desk.ts:saveRules", reuse: "handoff-only" },
  async resolve(ctx, input) { libraryCampus(ctx); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const campusId = libraryCampus(ctx);
      const current = await currentRules(prisma, ctx.user.schoolId, campusId);
      const currency = current.version ? current.currency : (await getLocalePackage(ctx.user.schoolId, campusId)).currency;
      const proposed = Object.fromEntries(MONEY_FIELDS.map(key => [key, input[key] ?? current[key]])) as Record<(typeof MONEY_FIELDS)[number], number>;
      if (MONEY_FIELDS.every(key => proposed[key] === current[key])) throw new WorkflowError("DOMAIN_REFUSED", { reason: "RULES_UNCHANGED" });
      const base = { loanDays: current.loanDays, maxLoans: current.maxLoans, maxRenewals: current.maxRenewals, holdDays: current.holdDays, closures: current.closures };
      return {
        kind: "DOMAIN_SCREEN", targetRoles: OPERATORS, link: OPERATOR_DESK,
        prefill: { action: "rules", rules: { ...base, ...proposed, currency } },
        detail: { currentVersion: current.version, current: Object.fromEntries(MONEY_FIELDS.map(key => [key, current[key]])), proposed, currency, requesterId: ctx.user.userId, decidedBy: OPERATORS, applied: false },
      };
    },
  },
});

// ─── library.desk_mark_lost (class C) ─────────────────────────────────────

const lostInput = z.strictObject({
  /** The copy the user says is lost, by its label or title. */
  copy: NAME,
  copyId: ID.optional(),
  loanId: ID.optional(),
});
type LostInput = z.infer<typeof lostInput>;

const MARK_LOST = defineCapability<LostInput>({
  key: "library.desk_mark_lost", version: 1, cluster: "C7", inventoryKeys: ["library.desk_mark_lost"], risk: "FINANCIAL", roles: ROLES, class: "C",
  input: lostInput, evidence: ["/copy"], humanFields: ["copyId", "loanId"],
  gates: deskGates("edit", false), scope: { kind: "own-campus" },
  copy: c(
    ["Report a lost copy", "Prepare marking a borrowed copy as lost. The lost-book charge is recorded by your campus administrator on the lending desk.", "Mark LB-0042 as lost"],
    ["الإبلاغ عن نسخة مفقودة", "تجهيز تسجيل نسخة معارة كمفقودة. يسجّل مدير الحرم رسم الكتاب المفقود من مكتب الإعارة.", "سجّل النسخة LB-0042 كمفقودة"],
    ["گمشدہ نسخے کی اطلاع", "جاری شدہ نسخے کو گمشدہ درج کرنے کی تیاری۔ گمشدہ کتاب کی رقم کیمپس منتظم لینڈنگ ڈیسک پر درج کریں گے۔", "ایل بی 0042 کو گمشدہ درج کر دیں"],
  ),
  source: { route: "POST /api/library/desk (action=lost)", service: "DOMAIN_SCREEN; src/lib/library/desk.ts:markLost", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const copy = await bindCopy(ctx, input.copy, "/copy", "ON_LOAN");
    const loan = await openLoanOf(copy.id, ctx.user.schoolId);
    if (!loan) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NOT_ON_LOAN" });
    return { copy: copy.barcode, copyId: copy.id, loanId: loan.id };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const campusId = libraryCampus(ctx);
      const copy = input.copyId ? await copyById(ctx, input.copyId) : await bindCopy(ctx, input.copy, "/copy", "ON_LOAN");
      const loan = await openLoanOf(copy.id, ctx.user.schoolId);
      if (!loan || (input.loanId && loan.id !== input.loanId)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NOT_ON_LOAN" });
      const rules = await rulesOf(campusId, ctx, loan.policySnapshot);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: OPERATORS, link: `${OPERATOR_DESK}&code=${encodeURIComponent(copy.barcode)}`,
        prefill: { action: "lost", issueId: loan.id, barcode: copy.barcode },
        detail: { title: copy.title, lostCharge: rules.lostCharge, currency: rules.currency, rulesVersion: rules.version, requesterId: ctx.user.userId, decidedBy: OPERATORS, applied: false },
      };
    },
  },
});

// ─── library.desk_decide_charge (class C) ─────────────────────────────────

const chargeInput = z.strictObject({
  /** The copy the charge is for (label or title), if the user named one. */
  copy: NAME.optional(),
  /** The reader the charge is for (member number or name), if the user named one. */
  member: NAME.optional(),
  /** WAIVE the charge, or HAND_TO_FEES to send it to the fees office. */
  decision: z.enum(["WAIVE", "HAND_TO_FEES"]),
  /** Why, in the user's words (at least a short sentence). */
  reason: z.string().trim().min(8).max(500),
  chargeId: ID.optional(),
}).refine(value => Boolean(value.copy || value.member || value.chargeId), "Name the copy or the reader.");
type ChargeInput = z.infer<typeof chargeInput>;

async function bindCharge(ctx: CapabilityContext, input: ChargeInput) {
  const campusId = libraryCampus(ctx);
  const where: Prisma.LibraryChargeWhereInput = { schoolId: ctx.user.schoolId, campusId, status: "OPEN" };
  if (input.chargeId) {
    const charge = await prisma.libraryCharge.findFirst({ where: { ...where, id: input.chargeId } });
    if (!charge) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_OPEN_CHARGE" });
    return charge;
  }
  const issueWhere: Prisma.BookIssueWhereInput = { schoolId: ctx.user.schoolId };
  if (input.member) issueWhere.memberId = (await bindMember(ctx, input.member, "/member")).id;
  if (input.copy) {
    const label = input.copy.trim();
    const byLabel = BARCODE.test(label) ? await prisma.bookCopy.findMany({ where: { campusId, barcode: { equals: label, mode: "insensitive" } }, select: { id: true } }) : [];
    if (byLabel.length) issueWhere.copyId = { in: byLabel.map(row => row.id) };
    else issueWhere.bookId = (await bindTitle(ctx, label, "/copy")).id;
  }
  const loans = await prisma.bookIssue.findMany({ where: issueWhere, select: { id: true, copyId: true } });
  const charges = await prisma.libraryCharge.findMany({ where: { ...where, issueId: { in: loans.map(row => row.id) } }, orderBy: { createdAt: "asc" } });
  if (charges.length === 1) return charges[0];
  if (!charges.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_OPEN_CHARGE" });
  const labels = new Map((await prisma.bookCopy.findMany({ where: { id: { in: loans.map(row => row.copyId).filter((id): id is string => !!id) } }, select: { id: true, barcode: true } })).map(row => [row.id, row.barcode]));
  const copyOf = (issueId: string) => labels.get(loans.find(row => row.id === issueId)?.copyId ?? "") ?? "—";
  throw new InputRequired([{ pointer: input.copy ? "/copy" : "/member", promptKey: "LIBRARY_CHARGE_AMBIGUOUS", params: { count: charges.length }, options: charges.slice(0, 8).map(row => ({ value: copyOf(row.issueId), label: `${copyOf(row.issueId)} · ${row.kind} · ${money(row.amount, row.currency)}` })) }]);
}

const DECIDE_CHARGE = defineCapability<ChargeInput>({
  key: "library.desk_decide_charge", version: 1, cluster: "C7", inventoryKeys: ["library.desk_decide_charge"], risk: "FINANCIAL", roles: ROLES, class: "C",
  input: chargeInput, evidence: ["/decision", "/reason"], humanFields: ["chargeId"],
  gates: deskGates("edit", false), scope: { kind: "own-campus" },
  copy: c(
    ["Waive a fine or send it to fees", "Prepare waiving a library fine or sending it to the fees office, with your reason. A waiver is decided by your campus administrator; nothing changes until then.", "Waive the fine on LB-0042, the book was returned late because the library was shut"],
    ["إعفاء غرامة أو تحويلها للرسوم", "تجهيز الإعفاء من غرامة مكتبة أو تحويلها لمكتب الرسوم مع السبب. الإعفاء يقرره مدير الحرم؛ ولا يتغير شيء قبل ذلك.", "اعفُ من غرامة النسخة LB-0042 لأن المكتبة كانت مغلقة"],
    ["جرمانہ معاف کریں یا فیس کو بھیجیں", "لائبریری جرمانہ معاف کرنے یا فیس آفس بھیجنے کی تیاری، وجہ کے ساتھ۔ معافی کا فیصلہ کیمپس منتظم کریں گے؛ تب تک کچھ نہیں بدلے گا۔", "ایل بی 0042 کا جرمانہ معاف کر دیں، لائبریری بند تھی اس لیے دیر ہوئی"],
  ),
  source: { route: "POST /api/library/desk (action=charge)", service: "DOMAIN_SCREEN; src/lib/library/desk.ts:decideCharge", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const charge = await bindCharge(ctx, { ...input, chargeId: undefined });
    return { ...input, chargeId: charge.id };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input): Promise<HandoffPrepared> {
      const charge = await bindCharge(ctx, input);
      // A waiver is the campus operator's decision (desk.ts canWaiveCharge); handing to fees is the desk's.
      const targetRoles: UserRole[] = input.decision === "WAIVE" ? [...OPERATORS] : (await ctx.seats()).librarian ? ["LIBRARIAN"] : [...OPERATORS];
      return {
        kind: "DOMAIN_SCREEN", targetRoles, link: targetRoles.includes("LIBRARIAN") ? "/librarian?view=lending" : OPERATOR_DESK,
        prefill: { action: "charge", chargeId: charge.id, decision: input.decision, reason: input.reason.trim() },
        detail: { kind: charge.kind, amount: charge.amount, currency: charge.currency, requesterId: ctx.user.userId, decidedBy: targetRoles, applied: false },
      };
    },
  },
});

// ─── library.member_create ────────────────────────────────────────────────

const STAFF_ROLES = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;
const memberInput = z.strictObject({
  /** Every pupil of one class (a class handle) who has a Skoolee account. */
  classId: ID.optional(),
  /** People the user named (pupils or staff), with a member number if they said one. */
  people: z.array(z.strictObject({ name: NAME, memberNo: z.string().trim().min(1).max(40).optional() })).max(100).optional(),
  /** How member numbers are made when none is given: AUTO (LIB-0001…) or the pupil's ADMISSION number. */
  numbering: z.enum(["AUTO", "ADMISSION"]).optional(),
  /** Bound by the server: who is enrolled and with which number. */
  enrol: z.array(z.strictObject({ userId: ID, memberNo: z.string().trim().min(1).max(40) })).max(200).optional(),
}).refine(value => Boolean(value.classId || value.people?.length || value.enrol?.length), "Name a class or the people to enrol.");
type MemberInput = z.infer<typeof memberInput>;
interface Candidate { userId: string | null; name: string; admissionNo: string | null; pupil: boolean }

async function memberCandidates(ctx: CapabilityContext, classId?: string): Promise<Candidate[]> {
  const campusId = libraryCampus(ctx);
  const pupils = await prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null, ...(classId ? { classId } : {}) }, select: { fullName: true, admissionNo: true, studentUserId: true, studentUser: { select: { isActive: true } } }, orderBy: { fullName: "asc" } });
  const staff = classId ? [] : await prisma.user.findMany({ where: { schoolId: ctx.user.schoolId, campusId, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  return [
    ...pupils.map(row => ({ userId: row.studentUserId && row.studentUser?.isActive ? row.studentUserId : null, name: row.fullName, admissionNo: row.admissionNo, pupil: true })),
    ...staff.map(row => ({ userId: row.id, name: row.fullName, admissionNo: null, pupil: false })),
  ];
}

async function planMembers(ctx: CapabilityContext, input: MemberInput) {
  const campusId = libraryCampus(ctx);
  if (input.classId) await assignedClass(ctx, input.classId);
  const candidates = await memberCandidates(ctx, input.classId);
  const existing = await prisma.libraryMember.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { userId: true, memberNo: true } });
  const memberOf = new Map(existing.map(row => [row.userId, row.memberNo]));
  const usedNumbers = new Set(existing.map(row => row.memberNo.toLowerCase()));
  if (input.enrol) {
    // Execute and preview re-check every bound user against this campus now.
    const reachable = new Map(candidates.filter(row => row.userId).map(row => [row.userId!, row]));
    const enrol = input.enrol.map(row => { const who = reachable.get(row.userId); if (!who) throw new WorkflowError("SCOPE_DENIED"); return { ...row, name: who.name }; });
    return { enrol: enrol.filter(row => !memberOf.has(row.userId)), already: enrol.filter(row => memberOf.has(row.userId)), noAccount: [] as string[] };
  }
  const picked: Array<{ who: Candidate; memberNo?: string }> = [];
  const unclear: RequiredField[] = [];
  if (input.people?.length) {
    const shaped = candidates.map((row, index) => ({ id: String(index), fullName: row.name, nameUr: null, rollNo: row.admissionNo ?? "" }));
    input.people.forEach((person, index) => {
      const found = matchPupil(shaped, person.name).map(row => candidates[Number(row.id)]);
      if (found.length === 1) picked.push({ who: found[0], memberNo: person.memberNo });
      else unclear.push(found.length
        ? { pointer: `/people/${index}/name`, promptKey: "PERSON_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.name, label: `${row.name}${row.pupil ? "" : " · staff"}` })) }
        : { pointer: `/people/${index}/name`, promptKey: "PERSON_NOT_FOUND" });
    });
  } else picked.push(...candidates.map(who => ({ who })));
  if (unclear.length) throw new InputRequired(unclear);
  let next = existing.reduce((max, row) => Math.max(max, Number(row.memberNo.match(/^LIB-(\d+)$/i)?.[1] ?? 0)), 0);
  const auto = () => { let code; do code = `LIB-${String(++next).padStart(4, "0")}`; while (usedNumbers.has(code.toLowerCase())); return code; };
  const enrol: Array<{ userId: string; memberNo: string; name: string }> = [], already: typeof enrol = [], noAccount: string[] = [];
  const seen = new Set<string>();
  for (const { who, memberNo } of picked) {
    // Pupils without an account cannot be members; accounts are created by the campus administrator (rule 8).
    if (!who.userId) { noAccount.push(who.name); continue; }
    if (seen.has(who.userId)) continue;
    seen.add(who.userId);
    if (memberOf.has(who.userId)) { already.push({ userId: who.userId, memberNo: memberOf.get(who.userId)!, name: who.name }); continue; }
    const wanted = memberNo ?? (input.numbering === "ADMISSION" && who.admissionNo ? who.admissionNo : null);
    if (wanted && usedNumbers.has(wanted.toLowerCase())) throw new WorkflowError("DOMAIN_REFUSED", { reason: "MEMBER_NO_IN_USE" });
    const code = wanted ?? auto();
    usedNumbers.add(code.toLowerCase());
    enrol.push({ userId: who.userId, memberNo: code, name: who.name });
  }
  return { enrol, already, noAccount };
}

const MEMBER_CREATE = defineCapability<MemberInput>({
  key: "library.member_create", version: 1, cluster: "C7", inventoryKeys: ["library.member_create"], risk: "CREATE", roles: ROLES, class: "B",
  input: memberInput, evidence: [], humanFields: ["enrol"], limits: { maxItems: 200 },
  gates: deskGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Enrol library members", "Make pupils (by class or name) and staff library members. Only people who already have a Skoolee account can be enrolled; the rest are listed for your administrator.", "Make every pupil of class 8A a library member"],
    ["تسجيل أعضاء المكتبة", "جعل الطلاب (حسب الفصل أو الاسم) والموظفين أعضاء في المكتبة. يُسجَّل فقط من لديه حساب؛ والبقية تُرسل قائمتهم للمسؤول.", "اجعل كل طلاب الصف 8أ أعضاء في المكتبة"],
    ["لائبریری ممبر بنائیں", "طلبہ (کلاس یا نام سے) اور عملے کو لائبریری ممبر بنائیں۔ صرف وہی ممبر بنیں گے جن کا اسکولی اکاؤنٹ ہے؛ باقی کی فہرست منتظم کو دی جائے گی۔", "کلاس 8 کے تمام بچوں کو لائبریری ممبر بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/members", service: "src/lib/library/catalogue-command.ts:createMember", reuse: "extracted" },
  async resolve(ctx, input) {
    const plan = await planMembers(ctx, { ...input, enrol: undefined });
    if (!plan.enrol.length && !plan.already.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ACCOUNTS_TO_ENROL", noAccount: plan.noAccount.length });
    return { ...input, enrol: [...plan.enrol, ...plan.already].map(row => ({ userId: row.userId, memberNo: row.memberNo })) };
  },
  async preview(ctx, input) {
    const plan = await planMembers(ctx, input);
    const names = (rows: Array<{ name: string; memberNo: string }>) => rows.slice(0, 12).map(row => `${row.name} · ${row.memberNo}`).join("; ") + (rows.length > 12 ? " …" : "");
    return {
      title: say(ctx, l("Enrol library members", "تسجيل أعضاء", "لائبریری ممبر بنائیں")),
      lines: [
        { label: say(ctx, l("New members", "أعضاء جدد", "نئے ممبر")), value: plan.enrol.length ? names(plan.enrol) : "—" },
        ...(plan.already.length ? [{ label: say(ctx, l("Already members", "أعضاء مسبقاً", "پہلے سے ممبر")), value: String(plan.already.length) }] : []),
      ],
      counts: { members: plan.enrol.length, alreadyMembers: plan.already.length },
      confirmLabel: `${say(ctx, l("Enrol", "تسجيل", "ممبر بنائیں"))} · ${plan.enrol.length}`,
      basis: { enrol: plan.enrol.map(row => [row.userId, row.memberNo]), already: plan.already.map(row => row.userId).sort() },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const plan = await planMembers(ctx, input);
    const entities: Receipt["entities"] = [];
    let created = 0;
    for (const row of plan.enrol) {
      const member = await createMember(ctx.user, { userId: row.userId, memberNo: row.memberNo }).catch(domain);
      created++; entities.push({ model: "libraryMember", id: member.id });
    }
    if (plan.already.length) {
      const rows = await prisma.libraryMember.findMany({ where: { campusId: libraryCampus(ctx), userId: { in: plan.already.map(row => row.userId) } }, select: { id: true } });
      entities.push(...rows.map(row => ({ model: "libraryMember", id: row.id })));
    }
    return receipt("library.member_create", entities, { created, alreadyMembers: plan.already.length }, catalogueLink(ctx, "members"), {}, created === 0);
  },
});

// ─── library.book_update ──────────────────────────────────────────────────

const bookUpdateInput = z.strictObject({
  /** The title (or ISBN) to change, as the user said it. */
  book: NAME,
  title: z.string().trim().min(1).max(200).optional(),
  author: z.string().trim().max(160).optional(),
  isbn: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(120).optional(),
  /** The shelf section by name ("Children's books"); "" takes the title out of its section. */
  category: z.string().trim().max(60).optional(),
  bookId: ID.optional(),
}).refine(value => ["title", "author", "isbn", "subject", "category"].some(key => value[key as keyof typeof value] !== undefined), "Say what to change.");
type BookUpdateInput = z.infer<typeof bookUpdateInput>;
const BOOK_FIELDS = ["title", "author", "isbn", "subject"] as const;

async function bindBookUpdate(ctx: CapabilityContext, input: BookUpdateInput) {
  const campusId = libraryCampus(ctx);
  const book = input.bookId ? await titleById(ctx, input.bookId) : await bindTitle(ctx, input.book, "/book");
  let categoryId: string | null | undefined;
  let categoryName: string | null = null;
  if (input.category !== undefined) {
    if (!input.category) categoryId = null;
    else {
      const found = await bindCategory(ctx, input.category, "/category");
      if (!found) {
        const options = await prisma.bookCategory.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { name: true }, take: 8, orderBy: { name: "asc" } });
        throw new InputRequired([{ pointer: "/category", promptKey: "BOOK_CATEGORY_NOT_FOUND", options: options.map(row => ({ value: row.name, label: row.name })) }]);
      }
      categoryId = found.id; categoryName = found.name;
    }
  }
  if (input.isbn) {
    const others = await prisma.book.findMany({ where: { schoolId: ctx.user.schoolId, campusId, id: { not: book.id }, isbn: { not: null } }, select: { isbn: true } });
    if (others.some(row => normalIsbn(row.isbn) === normalIsbn(input.isbn))) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ISBN_IN_USE" });
  }
  const changes = BOOK_FIELDS.filter(key => input[key] !== undefined && (input[key] || null) !== (book[key] ?? null));
  const categoryChanged = categoryId !== undefined && categoryId !== book.categoryId;
  const before = book.categoryId ? (await prisma.bookCategory.findFirst({ where: { id: book.categoryId }, select: { name: true } }))?.name ?? null : null;
  return { book, categoryId, categoryName, before, changes, categoryChanged, unchanged: !changes.length && !categoryChanged };
}

const BOOK_UPDATE = defineCapability<BookUpdateInput>({
  key: "library.book_update", version: 1, cluster: "C7", inventoryKeys: ["library.book_update"], risk: "UPDATE", roles: ROLES, class: "B",
  input: bookUpdateInput, evidence: ["/book"], humanFields: ["bookId"],
  gates: deskGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Edit a catalogue title", "Correct a title's name, author, ISBN or subject, or move it to a shelf section. Copies are registered at the desk.", "Move Harry Potter to the Children's books section"],
    ["تعديل عنوان في الفهرس", "تصحيح اسم العنوان أو المؤلف أو الرقم الدولي أو الموضوع، أو نقله إلى قسم رف. النسخ تُسجَّل من المكتب.", "انقل هاري بوتر إلى قسم كتب الأطفال"],
    ["کیٹلاگ میں کتاب کی تفصیل بدلیں", "کتاب کا نام، مصنف، آئی ایس بی این یا مضمون درست کریں، یا اسے کسی شیلف حصے میں منتقل کریں۔ نسخے ڈیسک پر درج ہوتے ہیں۔", "ہیری پوٹر کو بچوں کی کتابوں والے حصے میں ڈال دیں"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "PATCH /api/library/books", service: "src/lib/library/catalogue-command.ts:updateBook", reuse: "extracted" },
  async resolve(ctx, input) {
    const state = await bindBookUpdate(ctx, { ...input, bookId: undefined });
    return { ...input, book: state.book.title, bookId: state.book.id, ...(state.categoryName ? { category: state.categoryName } : {}) };
  },
  async preview(ctx, input) {
    const state = await bindBookUpdate(ctx, input);
    const label: Record<(typeof BOOK_FIELDS)[number], L10n> = { title: l("Title", "العنوان", "عنوان"), author: l("Author", "المؤلف", "مصنف"), isbn: l("ISBN", "الرقم الدولي", "آئی ایس بی این"), subject: l("Subject", "الموضوع", "مضمون") };
    return {
      title: say(ctx, l("Edit a catalogue title", "تعديل عنوان", "کتاب کی تفصیل بدلیں")),
      lines: [
        { label: say(ctx, l("Book", "الكتاب", "کتاب")), value: titleLabel(state.book) },
        ...state.changes.map(key => ({ label: say(ctx, label[key]), value: `${state.book[key] ?? "—"} → ${input[key] || "—"}` })),
        ...(state.categoryChanged ? [{ label: say(ctx, l("Section", "القسم", "حصہ")), value: `${state.before ?? "—"} → ${state.categoryName ?? "—"}` }] : []),
        ...(state.unchanged ? [alreadyLine(ctx, l("The title already has these details; nothing changes.", "هذه التفاصيل موجودة مسبقاً؛ لا تغيير.", "یہ تفصیل پہلے سے درج ہے؛ کچھ نہیں بدلے گا۔"))] : []),
      ],
      counts: { books: state.unchanged ? 0 : 1 },
      confirmLabel: say(ctx, l("Save changes", "حفظ التغييرات", "تبدیلیاں محفوظ کریں")),
      basis: { bookId: state.book.id, changes: state.changes, categoryId: state.categoryId ?? null, before: { title: state.book.title, author: state.book.author, isbn: state.book.isbn, subject: state.book.subject, categoryId: state.book.categoryId } },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const state = await bindBookUpdate(ctx, input);
    const entities = [{ model: "book", id: state.book.id }];
    if (state.unchanged) return receipt("library.book_update", entities, { updated: 0 }, catalogueLink(ctx, "books"), {}, true);
    const data: Record<string, unknown> = { id: state.book.id };
    for (const key of state.changes) data[key] = input[key];
    if (state.categoryChanged) data.categoryId = state.categoryId ?? "";
    await updateBook(ctx.user, data).catch(domain);
    return receipt("library.book_update", entities, { updated: 1 }, catalogueLink(ctx, "books"), { fields: [...state.changes, ...(state.categoryChanged ? ["category"] : [])] });
  },
});

// ─── purchasing.save_request (DRAFT) ──────────────────────────────────────

const purchaseInput = z.strictObject({
  /** A short name for the request ("Books for this term"). */
  title: z.string().trim().min(3).max(200),
  /** The budget's cost centre as the user said it ("Library"); optional when the campus has one budget. */
  budget: NAME.optional(),
  /** What to buy: each line in the user's words, with quantity and estimated unit price (whole currency units). */
  lines: z.array(z.strictObject({ description: z.string().trim().min(2).max(200), quantity: int(1, 100000), unitPrice: int(0, 100_000_000) })).min(1).max(50),
  budgetId: ID.optional(),
});
type PurchaseInput = z.infer<typeof purchaseInput>;

async function bindPurchase(ctx: CapabilityContext, input: PurchaseInput) {
  const campusId = libraryCampus(ctx);
  const budgets = await prisma.purchaseBudget.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { id: true, costCenter: true, period: true, currency: true }, orderBy: [{ period: "desc" }, { costCenter: "asc" }] });
  let budget: (typeof budgets)[number] | undefined;
  if (input.budgetId) {
    budget = budgets.find(row => row.id === input.budgetId);
    if (!budget) throw new WorkflowError("SCOPE_DENIED");
  } else {
    if (!budgets.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_BUDGET" });
    const found = input.budget ? budgets.filter(row => fold(row.costCenter) === fold(input.budget!) || fold(`${row.costCenter} ${row.period}`) === fold(input.budget!)) : budgets;
    // The newest period of a cost centre wins when the user named only the centre.
    const latest = found.filter(row => row.costCenter === found[0]?.costCenter && row.period === found[0]?.period);
    const distinct = new Set(found.map(row => row.costCenter)).size;
    if (found.length && (found.length === 1 || (input.budget && distinct === 1))) budget = latest[0];
    else throw new InputRequired([{ pointer: "/budget", promptKey: found.length ? "BUDGET_AMBIGUOUS" : "BUDGET_NOT_FOUND", options: (found.length ? found : budgets).slice(0, 8).map(row => ({ value: row.costCenter, label: `${row.costCenter} · ${row.period}` })) }]);
  }
  const lines = input.lines.map(row => ({ description: row.description, quantity: row.quantity, unitPrice: row.unitPrice }));
  const total = lines.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  // This actor's own identical draft is this step's earlier write (RT17).
  const drafts = await prisma.purchaseRequest.findMany({ where: { schoolId: ctx.user.schoolId, campusId, budgetId: budget.id, requestedById: ctx.user.userId, status: "DRAFT", title: input.title.trim() }, select: { id: true, lines: true } });
  const same = drafts.find(row => JSON.stringify((row.lines as Array<Record<string, unknown>>).map(line => [line.description, line.quantity, line.unitPrice])) === JSON.stringify(lines.map(line => [line.description, line.quantity, line.unitPrice])));
  return { budget, lines, total, existing: same ?? null };
}
const purchaseLink = (ctx: CapabilityContext) => (OPERATORS.includes(ctx.user.role) ? "/admin?view=inventory" : null);

const PURCHASE_DRAFT = defineCapability<PurchaseInput>({
  key: "purchasing.save_request", version: 1, cluster: "C6", inventoryKeys: ["purchasing.save_request"], risk: "CREATE", roles: ROLES, class: "B",
  input: purchaseInput, evidence: ["/lines/*/description"], humanFields: ["budgetId"], limits: { maxItems: 50 },
  // saveRequest: school staff on their own campus; the route checks no module.
  gates: [roles(ROLES), ownCampus()], scope: { kind: "own-campus" },
  copy: c(
    ["Draft a purchase request", "Save a purchase request as a draft against a budget. It is never submitted from here; you submit it in Purchasing and an administrator decides.", "Draft a request for 10 copies of Oxford English Grammar at Rs 950 each"],
    ["مسودة طلب شراء", "حفظ طلب شراء كمسودة على ميزانية. لا يُقدَّم من هنا؛ تقدّمه من شاشة المشتريات ويقرره المسؤول.", "مسودة طلب 10 نسخ من قواعد اللغة الإنجليزية بسعر 40 ريالاً للنسخة"],
    ["خریداری کی درخواست کا مسودہ", "بجٹ کے تحت خریداری کی درخواست مسودے کے طور پر محفوظ کریں۔ یہاں سے جمع نہیں ہوتی؛ آپ پرچیزنگ میں جمع کریں گے اور فیصلہ منتظم کریں گے۔", "آکسفورڈ انگلش گرامر کی 10 کاپیاں، 950 روپے فی کاپی، کی درخواست کا مسودہ بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/purchasing (action=save)", service: "src/lib/purchasing/service.ts:saveRequest", reuse: "direct" },
  async resolve(ctx, input) {
    const state = await bindPurchase(ctx, { ...input, budgetId: undefined });
    return { ...input, budget: state.budget.costCenter, budgetId: state.budget.id };
  },
  async preview(ctx, input) {
    const state = await bindPurchase(ctx, input);
    const cur = state.budget.currency;
    return {
      title: say(ctx, l("Draft a purchase request", "مسودة طلب شراء", "خریداری کا مسودہ")),
      lines: [
        { label: say(ctx, l("Request", "الطلب", "درخواست")), value: input.title },
        { label: say(ctx, l("Budget", "الميزانية", "بجٹ")), value: `${state.budget.costCenter} · ${state.budget.period}` },
        ...state.lines.map(row => ({ label: row.description, value: `${row.quantity} × ${money(row.unitPrice, cur)}` })),
        { label: say(ctx, l("Estimated total", "الإجمالي التقديري", "اندازاً کل")), value: money(state.total, cur) },
        { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, l("Draft only. Submit it in Purchasing; an administrator decides.", "مسودة فقط. قدّمه من المشتريات؛ ويقرره المسؤول.", "صرف مسودہ۔ پرچیزنگ میں جمع کریں؛ فیصلہ منتظم کریں گے۔")) },
        ...(state.existing ? [alreadyLine(ctx, l("This draft is already saved; nothing new is created.", "هذه المسودة محفوظة مسبقاً.", "یہ مسودہ پہلے سے محفوظ ہے۔"))] : []),
      ],
      counts: { drafts: state.existing ? 0 : 1, lines: state.lines.length },
      confirmLabel: say(ctx, l("Save draft", "حفظ المسودة", "مسودہ محفوظ کریں")),
      basis: { budgetId: state.budget.id, lines: state.lines, total: state.total, existing: state.existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const state = await bindPurchase(ctx, input);
    const detail = { status: "DRAFT", total: state.total, currency: state.budget.currency, next: "SUBMIT_IN_PURCHASING" };
    if (state.existing) return receipt("purchasing.save_request", [{ model: "purchaseRequest", id: state.existing.id }], { created: 0 }, purchaseLink(ctx), detail, true, "draft");
    const saved = await saveRequest(ctx.user, { budgetId: state.budget.id, title: input.title, lines: state.lines.map(row => ({ ...row, asset: false })) }).catch(domain);
    return receipt("purchasing.save_request", [{ model: "purchaseRequest", id: saved.id }], { created: 1 }, purchaseLink(ctx), { ...detail, poNumber: saved.poNumber }, false, "draft");
  },
});

// ─── library.category_create (A) ──────────────────────────────────────────

const categoryInput = z.strictObject({
  /** The shelf section's name ("Children's books"). */
  name: z.string().trim().min(2).max(60),
});
type CategoryInput = z.infer<typeof categoryInput>;

const CATEGORY_CREATE = defineCapability<CategoryInput>({
  key: "library.category_create", version: 1, cluster: "C7", inventoryKeys: ["library.category_create"], risk: "CREATE", roles: ROLES, class: "A",
  classOverride: "Append-only shelf section; the same name on the campus is reported as already there, never added twice.",
  input: categoryInput, evidence: ["/name"],
  gates: deskGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Add a shelf section", "Add a catalogue section (category) such as Fiction or Reference.", "Add a section called Children's books"],
    ["إضافة قسم رف", "إضافة قسم في الفهرس مثل القصص أو المراجع.", "أضف قسماً جديداً باسم كتب الأطفال"],
    ["شیلف کا نیا حصہ", "کیٹلاگ میں نیا حصہ (زمرہ) جیسے فکشن یا ریفرنس شامل کریں۔", "بچوں کی کتابوں کے نام سے نیا حصہ بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/categories", service: "src/lib/library/catalogue-command.ts:createCategory", reuse: "extracted" },
  async resolve(ctx, input) { libraryCampus(ctx); return input; },
  async execute(ctx, input): Promise<Receipt> {
    libraryCampus(ctx);
    const existing = await bindCategory(ctx, input.name, "/name");
    if (existing) return receipt("library.category_create", [{ model: "bookCategory", id: existing.id }], { created: 0 }, catalogueLink(ctx, "categories"), { name: existing.name }, true);
    const created = await createCategory(ctx.user, { name: input.name }).catch(domain);
    return receipt("library.category_create", [{ model: "bookCategory", id: created.id }], { created: 1 }, catalogueLink(ctx, "categories"), { name: created.name });
  },
});

// ─── library.book_create (A; ISBN merge) ──────────────────────────────────

/** The tools.ts `libraryCreateSchema` shape, widened with the shelf section by name. */
const bookCreateInput = z.strictObject({
  books: z.array(z.strictObject({
    title: z.string().trim().min(1).max(200),
    author: z.string().trim().max(160).optional(),
    isbn: z.string().trim().max(40).optional(),
    subject: z.string().trim().max(120).optional(),
    /** The shelf section by name; it must already exist (an earlier step may add it). */
    category: z.string().trim().max(60).optional(),
    copiesTotal: int(0, 10000),
  })).min(1).max(100),
});
type BookCreateInput = z.infer<typeof bookCreateInput>;

async function bindBooks(ctx: CapabilityContext, input: BookCreateInput) {
  const campusId = libraryCampus(ctx);
  const catalogue = await prisma.book.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { id: true, title: true, author: true, isbn: true } });
  const byIsbn = new Map(catalogue.filter(row => row.isbn).map(row => [normalIsbn(row.isbn), row.id]));
  const byName = new Map(catalogue.map(row => [`${fold(row.title)}|${fold(row.author ?? "")}`, row.id]));
  const unclear: RequiredField[] = [];
  const categories = new Map<string, string>();
  for (const [index, row] of input.books.entries()) {
    if (!row.category || categories.has(fold(row.category))) continue;
    const found = await bindCategory(ctx, row.category, `/books/${index}/category`);
    if (found) categories.set(fold(row.category), found.id);
    else unclear.push({ pointer: `/books/${index}/category`, promptKey: "BOOK_CATEGORY_NOT_FOUND" });
  }
  if (unclear.length) throw new InputRequired(unclear);
  const seen = new Set<string>();
  const rows = input.books.map(row => {
    const isbn = normalIsbn(row.isbn);
    const nameKey = `${fold(row.title)}|${fold(row.author ?? "")}`;
    // A title already in the catalogue with this ISBN (or, with none, the same title and author) is merged, never added twice.
    const existingId = (isbn && byIsbn.get(isbn)) || (!isbn && byName.get(nameKey)) || null;
    const batchKey = isbn ? `isbn:${isbn}` : `name:${nameKey}`;
    const repeat = seen.has(batchKey);
    seen.add(batchKey);
    return { row, existingId, repeat, categoryId: row.category ? categories.get(fold(row.category)) ?? null : null };
  });
  return { rows };
}

const BOOK_CREATE = defineCapability<BookCreateInput>({
  key: "library.book_create", version: 2, cluster: "C7", inventoryKeys: ["library.book_create", "library.create_books"], risk: "CREATE", roles: ROLES, class: "A",
  classOverride: "Append-only catalogue titles; an ISBN already in the catalogue is merged, never duplicated.",
  input: bookCreateInput, evidence: ["/books/*/title"], limits: { maxItems: 100 },
  gates: deskGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Add books to the catalogue", "Add titles with their copy counts (and shelf section) to the catalogue. A title whose ISBN is already there is merged, not added again.", "Add 'Atlas of the World' by Collins, 2 copies, in Reference"],
    ["إضافة كتب للفهرس", "إضافة عناوين مع عدد النسخ (وقسم الرف) إلى الفهرس. العنوان الموجود بنفس الرقم الدولي يُدمج ولا يُضاف مرة أخرى.", "أضف أطلس العالم لكولينز، نسختان، في قسم المراجع"],
    ["کیٹلاگ میں کتابیں شامل کریں", "کتابیں نسخوں کی تعداد (اور شیلف حصے) کے ساتھ کیٹلاگ میں شامل کریں۔ جس کتاب کا آئی ایس بی این پہلے سے ہو وہ ملا دی جاتی ہے، دوبارہ نہیں بنتی۔", "اٹلس آف دی ورلڈ کی 2 کاپیاں ریفرنس حصے میں شامل کریں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/library/books", service: "src/lib/library/catalogue-command.ts:createBook", reuse: "extracted" },
  async resolve(ctx, input) { await bindBooks(ctx, input); return input; },
  async execute(ctx, input): Promise<Receipt> {
    const { rows } = await bindBooks(ctx, input);
    const entities: Receipt["entities"] = [];
    let created = 0, merged = 0;
    for (const { row, existingId, repeat, categoryId } of rows) {
      if (existingId || repeat) { merged++; if (existingId) entities.push({ model: "book", id: existingId }); continue; }
      const book = await createBook(ctx.user, { title: row.title, author: row.author, isbn: row.isbn, subject: row.subject, categoryId: categoryId ?? undefined, copiesTotal: row.copiesTotal }).catch(domain);
      created++; entities.push({ model: "book", id: book.id });
    }
    return receipt("library.book_create", entities, { created, merged }, catalogueLink(ctx, "books"), {}, created === 0);
  },
});

// ─── read.library.overdue (A) ─────────────────────────────────────────────

const overdueInput = z.strictObject({
  /** Only readers who are pupils of this class (a class handle). */
  classId: ID.optional(),
});
type OverdueInput = z.infer<typeof overdueInput>;

const READ_OVERDUE = defineCapability<OverdueInput>({
  key: "read.library.overdue", version: 1, cluster: "C7", inventoryKeys: ["read.library.overdue"], risk: "READ", roles: ROLES, class: "A",
  input: overdueInput, evidence: [],
  gates: [roles(ROLES), predicate("canManageLibrary", canManageLibrary, ROLES), permission("library", "view"), ownCampus()], scope: { kind: "own-campus" },
  idempotency: { mode: "convergent" },
  copy: c(
    ["Who has overdue books", "See which loans on this campus are past their due date, optionally for one class.", "Who has overdue books in class 9?"],
    ["من لديه كتب متأخرة", "اعرف الإعارات المتأخرة عن موعدها في هذا الحرم، ولفصل واحد إن أردت.", "من لديه كتب متأخرة في الصف التاسع؟"],
    ["کس کے پاس دیر والی کتابیں ہیں", "اس کیمپس کی وہ کتابیں دیکھیں جن کی واپسی کی تاریخ گزر چکی ہے، چاہیں تو ایک کلاس کی۔", "کلاس 9 میں کس کے پاس دیر والی کتابیں ہیں؟"],
  ),
  source: { route: "GET /api/library/issues?status=issued", service: "src/app/api/library/issues/route.ts (same open-loan rows, campus-scoped, past due)", reuse: "direct" },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = libraryCampus(ctx);
    let members: LibraryMemberRow[] | null = null;
    if (input.classId) {
      await assignedClass(ctx, input.classId);
      members = await libraryMembers(ctx, input.classId);
    }
    const today = await campusToday(ctx, campusId);
    const loans = await prisma.bookIssue.findMany({
      where: { schoolId: ctx.user.schoolId, returnedAt: null, dueAt: { lt: new Date(`${today}T00:00:00Z`) }, book: { campusId }, ...(members ? { memberId: { in: members.map(row => row.id) } } : {}) },
      select: { id: true, dueAt: true, copyId: true, book: { select: { title: true } }, member: { select: { memberNo: true, user: { select: { fullName: true } } } } },
      orderBy: { dueAt: "asc" },
    });
    const labels = new Map((await prisma.bookCopy.findMany({ where: { id: { in: loans.map(row => row.copyId).filter((id): id is string => !!id) } }, select: { id: true, barcode: true } })).map(row => [row.id, row.barcode]));
    const day = 86_400_000;
    const list = loans.map(row => ({ loanId: row.id, reader: row.member.user.fullName, memberNo: row.member.memberNo, title: row.book.title, barcode: row.copyId ? labels.get(row.copyId) ?? null : null, dueAt: ymd(row.dueAt), daysOverdue: Math.round((new Date(`${today}T00:00:00Z`).getTime() - row.dueAt.getTime()) / day) }));
    const head = list.length
      ? say(ctx, l("{count} loans are overdue.", "{count} إعارة متأخرة.", "{count} کتابیں دیر سے ہیں۔"), { count: list.length })
      : say(ctx, l("No loans are overdue.", "لا توجد إعارات متأخرة.", "کوئی کتاب دیر سے نہیں۔"));
    const names = list.slice(0, 10).map(row => `${row.reader} — ${row.title} (${row.daysOverdue})`).join(ctx.locale === "en" ? "; " : "؛ ");
    return {
      kind: "read", capability: "read.library.overdue", entities: list.map(row => ({ model: "bookIssue", id: row.loanId })), counts: { overdue: list.length },
      link: deskLink(ctx), replayed: false,
      // Reader names stay in the receipt for the person's own screen; they are never sent to a model.
      detail: { today, loans: list, text: names ? `${head} ${names}${list.length > 10 ? " …" : ""}` : head },
    };
  },
});

export const LIBRARY_ENTRIES: readonly CapabilityEntry[] = [
  ISSUE, RETURN, RENEW, RESERVE, ADD_COPIES, SAVE_RULES, MEMBER_CREATE, BOOK_UPDATE, PURCHASE_DRAFT,
  CATEGORY_CREATE, BOOK_CREATE, READ_OVERDUE,
  SAVE_RULES_MONEY, MARK_LOST, DECIDE_CHARGE,
];
