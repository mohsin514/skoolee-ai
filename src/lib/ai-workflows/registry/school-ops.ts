import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { getWorkspaceCapabilities } from "@/lib/school-ai/access";
import { createWorkspaceRecord, updateWorkspaceRecord } from "@/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool, type SchoolAiOperation } from "@/lib/school-ai/execution";
import { academicSetupProposalSchema } from "@/lib/school-ai/academic-setup";
import { schoolSetupProposalSchema } from "@/lib/school-ai/school-setup";
import { schoolTimetableProposalSchema, attendanceProposalSchema, substituteProposalSchema } from "@/lib/school-ai/school-operations";
import { publishTimetablesProposalSchema } from "@/lib/school-ai/school-operations-publish";
import { academicLifecycleProposalSchema, promotionProposalSchema } from "@/lib/school-ai/school-operations-lifecycle";
import { riskDecisionProposalSchema } from "@/lib/school-ai/school-operations-risk";
import { financeOperationProposalSchema } from "@/lib/school-ai/finance-operations";
import { timetableSetupProposalSchema } from "@/lib/school-ai/timetable-setup";
import { announcementProposalSchema } from "@/lib/school-ai/announcements";
import { examSessionPlanProposalSchema } from "@/lib/school-ai/exam-session-plan";
import { feeInvoiceProposalSchema } from "@/lib/school-ai/fee-invoices";
import { curriculumDataSchema } from "@/lib/school-ai/assessment";
import { defineCapability } from "./define";
import { EscalationRequired } from "../errors";
import { ownCampus } from "./gates";
import type { CapabilityEntry, CapabilityContext, ConfirmationClass, EntryCopy, Gate, PreviewModel, Receipt, Risk } from "./types";

/**
 * The 15 reviewed school operations (src/lib/school-ai/execution.ts:33-49) as registry entries. They
 * keep SKO-470's guarantees: a versioned WORKFLOW record, a preview hash recomputed inside the
 * transaction, seat and matrix checks in `authorize()`, and one effect per approved version.
 * One allow-list stays the choke point: an operation is offered only if getWorkspaceCapabilities
 * (matrix ∩ seats) lists it, exactly what execution enforces again.
 */
function typedOperationGate(operation: SchoolAiOperation): Gate {
  return {
    id: `typed-operation:${operation}`, provenance: ["getWorkspaceCapabilities", "allowedSchoolAiOperations", "hasMatrixToolPermission"],
    async check(ctx) {
      const caps = await getWorkspaceCapabilities(ctx.user).catch(() => null);
      return caps?.tools?.some(tool => tool.operation === operation) ? { ok: true } : { ok: false, code: "SEAT" };
    },
  };
}

const WORKFLOW_TAB: Record<SchoolAiOperation, string> = {
  "academics.setup_year": "academicSetup", "setup.apply_changes": "schoolSetup", "timetable.create_draft": "timetableSetup",
  "timetable.create_school_drafts": "schoolOperations", "timetable.publish_reviewed": "schoolOperations", "timetable.assign_substitutes": "schoolOperations",
  "attendance.record_register": "schoolOperations", "academics.transition_year": "schoolOperations", "students.promote_enrollment": "schoolOperations",
  "operations.record_risk_decision": "schoolOperations", "communications.queue_announcement": "announcements", "exams.create_session_plan": "examPlanning",
  "fees.generate_invoices": "feeInvoices", "finance.apply_operation": "financeOperations", "curriculum.import_topics": "curriculum",
};

const workflowRecord = (title: string, proposal: { operation: string }) => ({
  goal: title, sourceIds: [], missingInformation: [], steps: [{ id: "apply", title, status: "ready" as const, module: "school" as const }], proposal,
});

/** Saves the exact proposal as a versioned record so the screen that decides it shows the same thing. */
async function saveProposal(ctx: CapabilityContext, operation: SchoolAiOperation, title: string, proposal: Record<string, unknown>, idempotencyKey: string) {
  return createWorkspaceRecord(ctx.user, { kind: operation === "curriculum.import_topics" ? "CURRICULUM" : "WORKFLOW", title, campusId: ctx.campusId, idempotencyKey, data: operation === "curriculum.import_topics" ? proposal : workflowRecord(title, proposal as { operation: string }) });
}

async function runApproved(ctx: CapabilityContext, operation: SchoolAiOperation, title: string, proposal: Record<string, unknown>, idempotencyKey: string): Promise<Receipt> {
  let record = await saveProposal(ctx, operation, title, proposal, idempotencyKey);
  // Reached only from the user's confirming request for this exact input and preview (control P5).
  // The repository still runs approval role, separation of duties and approval issues on approve;
  // when policy needs a second person, the saved proposal is handed to an eligible approver instead.
  if (record.status !== "APPROVED") {
    try { record = await updateWorkspaceRecord(ctx.user, record.id, { version: record.version, action: "approve" }); }
    catch (error) {
      if ((error as { code?: string }).code === "APPROVAL_SEPARATION_REQUIRED") throw new EscalationRequired({ kind: "RECORD_APPROVAL", targetRoles: ACADEMIC_OR_OPERATOR, link: `/ai?workflow=${WORKFLOW_TAB[operation]}`, prefill: { recordId: record.id, version: record.version }, detail: { recordId: record.id } });
      throw error;
    }
  }
  const preview = await previewSchoolAiExecution(ctx.user, record.id, operation, record.version);
  const receipt = await executeSchoolAiTool(ctx.user, record.id, { operation, version: record.version, previewHash: preview.previewHash, idempotencyKey });
  const detail = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
  return { kind: "write", capability: operation, entities: [{ model: "schoolAiRecord", id: record.id }], counts: {}, link: `/ai?workflow=${WORKFLOW_TAB[operation]}`, replayed: false, detail };
}

async function previewOf(title: string, input: Record<string, unknown>): Promise<PreviewModel> {
  const rows = Array.isArray(input.rows) ? input.rows.length : Array.isArray(input.classes) ? input.classes.length : Array.isArray(input.entries) ? input.entries.length : 1;
  return { title, lines: [], counts: { items: rows }, basis: input };
}

interface TypedOp {
  key: string; operation: SchoolAiOperation; class: ConfirmationClass; risk: Risk; roles: readonly UserRole[];
  schema: z.ZodTypeAny; copy: EntryCopy; classOverride?: string;
}

const OPERATORS: readonly UserRole[] = ["ADMIN", "CAMPUS_ADMIN"];
const ACADEMIC_OR_OPERATOR: readonly UserRole[] = ["PRINCIPAL", "ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"];
const ACADEMIC_LEADS: readonly UserRole[] = ["PRINCIPAL", "ADMIN", "CAMPUS_ADMIN"];
const FINANCE_DESK: readonly UserRole[] = ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"];

function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}

const setupVariant = (action: string) => schoolSetupProposalSchema.options.find(option => (option.shape.action as z.ZodLiteral<string>).value === action)!;
// Deleting a holiday is destructive (class C); creating or moving one is a reviewed change (class B).
const holidayRows = (deleting: boolean) => (setupVariant("HOLIDAYS") as z.ZodType<{ rows: Array<{ calendarAction?: string }> }>).refine(
  proposal => proposal.rows.every(row => (row.calendarAction === "DELETE") === deleting),
  deleting ? "Only holiday deletions belong here." : "Holiday deletions are confirmed on the calendar screen.",
);

const OPS: TypedOp[] = [
  { key: "academics.setup_year", operation: "academics.setup_year", class: "B", risk: "CREATE", roles: OPERATORS, schema: academicSetupProposalSchema,
    copy: c(["Create classes for the academic year", "Create new classes (grades) and their sections in the year's draft or active cycle, one class or many.", "Create classes 1 to 5 with sections A and B"],
      ["إنشاء فصول العام الدراسي", "إنشاء فصول (صفوف) جديدة وشعبها في دورة العام، فصلاً واحداً أو عدة فصول.", "أنشئ الصفوف من 1 إلى 5 بالشعبتين أ و ب"],
      ["تعلیمی سال کی کلاسیں بنائیں", "سال کے سائیکل میں نئی کلاسیں (گریڈ) اور ان کے سیکشن بنائیں، ایک کلاس یا کئی۔", "کلاس 1 سے 5 تک سیکشن اے اور بی کے ساتھ بنائیں"]) },
  { key: "setup.rooms", operation: "setup.apply_changes", class: "B", risk: "CREATE", roles: OPERATORS, schema: setupVariant("ROOMS"),
    copy: c(["Add classrooms", "Add rooms with their seating layout.", "Add rooms 101 to 104 with 6 rows of 5 benches"], ["إضافة قاعات", "إضافة قاعات بمخطط المقاعد.", "أضف القاعات 101 إلى 104"], ["کمرے شامل کریں", "کمرے نشستوں کی ترتیب کے ساتھ شامل کریں۔", "کمرے 101 سے 104 شامل کریں"]) },
  { key: "setup.periods", operation: "setup.apply_changes", class: "B", risk: "CREATE", roles: OPERATORS, schema: setupVariant("PERIODS"),
    copy: c(["Set the period bell times", "Define class or exam periods with start and end times.", "Eight 40-minute periods from 8:00"], ["تحديد أوقات الحصص", "تحديد حصص الدراسة أو الامتحان بأوقات البدء والانتهاء.", "ثماني حصص مدة كل منها 40 دقيقة من 8:00"], ["پیریڈ کے اوقات مقرر کریں", "کلاس یا امتحان کے پیریڈ شروع اور ختم ہونے کے اوقات کے ساتھ۔", "8 بجے سے آٹھ پیریڈ، ہر ایک 40 منٹ"]) },
  { key: "setup.subjects", operation: "setup.apply_changes", class: "B", risk: "CREATE", roles: OPERATORS, schema: setupVariant("SUBJECTS"),
    copy: c(["Add subjects to classes", "Add subjects with total marks to classes in the active year.", "Add Mathematics, English and Urdu to grade 3"], ["إضافة مواد للفصول", "إضافة مواد بالدرجة الكلية لفصول العام النشط.", "أضف الرياضيات والإنجليزية للصف الثالث"], ["کلاسوں میں مضامین شامل کریں", "فعال سال کی کلاسوں میں کل نمبروں کے ساتھ مضامین شامل کریں۔", "تیسری جماعت میں ریاضی، انگریزی اور اردو شامل کریں"]) },
  { key: "setup.teacher_allocations", operation: "setup.apply_changes", class: "B", risk: "UPDATE", roles: OPERATORS, schema: setupVariant("TEACHER_ALLOCATIONS"),
    copy: c(["Assign teachers to subjects or classes", "Set the subject teacher or class teacher for active teachers.", "Make Sana the Mathematics teacher of 7B"], ["تعيين المعلمين", "تحديد معلم المادة أو معلم الفصل.", "اجعل سناء معلمة الرياضيات للصف 7ب"], ["اساتذہ مقرر کریں", "مضمون یا کلاس کے استاد مقرر کریں۔", "ثنا کو 7بی کی ریاضی کی استاد بنائیں"]) },
  { key: "setup.weekends", operation: "setup.apply_changes", class: "B", risk: "UPDATE", roles: OPERATORS, schema: setupVariant("WEEKENDS"),
    copy: c(["Set the weekend days", "Replace the campus weekend days.", "Our weekend is Friday and Saturday"], ["تحديد أيام العطلة الأسبوعية", "استبدال أيام عطلة الحرم.", "عطلتنا الجمعة والسبت"], ["ہفتہ وار چھٹی مقرر کریں", "کیمپس کے چھٹی کے دن بدلیں۔", "ہماری چھٹی اتوار کو ہے"]) },
  { key: "setup.holidays", operation: "setup.apply_changes", class: "B", risk: "CREATE", roles: OPERATORS, schema: holidayRows(false),
    copy: c(["Add or change holidays", "Create or update holiday ranges in the active year (deleting goes to the calendar screen).", "Add a holiday on 12 November for Iqbal Day"], ["إضافة أو تعديل الإجازات", "إنشاء أو تعديل فترات الإجازات (الحذف من شاشة التقويم).", "أضف إجازة في 12 نوفمبر"], ["چھٹیاں شامل یا تبدیل کریں", "فعال سال میں چھٹیوں کے ایام بنائیں یا بدلیں (حذف کیلنڈر اسکرین سے)۔", "12 نومبر کو یوم اقبال کی چھٹی شامل کریں"]) },
  { key: "setup.holidays_delete", operation: "setup.apply_changes", class: "C", risk: "DESTRUCTIVE", roles: OPERATORS, schema: holidayRows(true),
    copy: c(["Remove holidays", "Removing a holiday changes the school calendar, so it is confirmed on the calendar screen.", "Remove the 12 November holiday"], ["حذف إجازات", "حذف الإجازة يغير التقويم، لذا يُؤكد في شاشة التقويم.", "احذف إجازة 12 نوفمبر"], ["چھٹیاں ختم کریں", "چھٹی ختم کرنے سے کیلنڈر بدلتا ہے، اس لیے تصدیق کیلنڈر اسکرین پر ہوتی ہے۔", "12 نومبر کی چھٹی ختم کریں"]) },
  { key: "setup.staff_invitations", operation: "setup.apply_changes", class: "B", risk: "CREATE", roles: OPERATORS, schema: setupVariant("STAFF"),
    copy: c(["Prepare staff invitations", "Create pending invitations for teachers and office staff; they become active only after acceptance.", "Invite Sana Malik as a teacher"], ["تحضير دعوات الموظفين", "إنشاء دعوات معلّقة؛ تُفعَّل بعد القبول فقط.", "ادعُ سناء مالك كمعلمة"], ["عملے کے دعوت نامے تیار کریں", "زیر التوا دعوت نامے بنائیں؛ قبول کرنے کے بعد ہی فعال ہوں گے۔", "ثنا ملک کو استاد کے طور پر مدعو کریں"]) },
  { key: "setup.guardians", operation: "setup.apply_changes", class: "C", risk: "ACCESS_GRANT", roles: OPERATORS, schema: setupVariant("GUARDIANS"),
    copy: c(["Link guardians to students", "Guardian links grant family access, so they are reviewed on the Guardians screen.", "Link Imran as Zainab's father"], ["ربط أولياء الأمور", "الربط يمنح وصول الأسرة، لذا يُراجع في شاشة أولياء الأمور.", "اربط عمران كوالد زينب"], ["سرپرست منسلک کریں", "یہ ربط خاندان کو رسائی دیتا ہے، اس لیے سرپرستوں کی اسکرین پر جائزہ ہوتا ہے۔", "عمران کو زینب کا والد منسلک کریں"]) },
  { key: "setup.transfers", operation: "setup.apply_changes", class: "C", risk: "UPDATE", roles: OPERATORS, schema: setupVariant("TRANSFERS"),
    copy: c(["Transfer students between classes", "Enrollment changes are reviewed in School setup.", "Move Ali from 6A to 6B"], ["نقل الطلاب بين الفصول", "تغييرات التسجيل تُراجع في إعداد المدرسة.", "انقل علي من 6أ إلى 6ب"], ["طلبہ کی کلاس تبدیل کریں", "داخلے کی تبدیلیوں کا جائزہ اسکول سیٹ اپ میں ہوتا ہے۔", "علی کو 6اے سے 6بی میں منتقل کریں"]) },
  { key: "setup.withdrawals", operation: "setup.apply_changes", class: "C", risk: "DESTRUCTIVE", roles: OPERATORS, schema: setupVariant("WITHDRAWALS"),
    copy: c(["Withdraw students", "Withdrawals end enrollment and are reviewed in School setup.", "Withdraw Hamza from the school from 1 December"], ["سحب الطلاب", "السحب ينهي التسجيل ويُراجع في إعداد المدرسة.", "اسحب حمزة من المدرسة"], ["طلبہ کا اخراج", "اخراج داخلہ ختم کرتا ہے اور اسکول سیٹ اپ میں جائزہ ہوتا ہے۔", "حمزہ کا یکم دسمبر سے اخراج کریں"]) },
  { key: "setup.migration_cutover", operation: "setup.apply_changes", class: "C", risk: "APPROVAL_DECISION", roles: OPERATORS, schema: setupVariant("MIGRATION_CUTOVER"),
    copy: c(["Accept a migration cutover", "Cutover reconciliation is accepted in School setup.", "Accept the migration from our old system"], ["قبول الانتقال من النظام القديم", "تُقبل المطابقة في إعداد المدرسة.", "اقبل الانتقال من نظامنا القديم"], ["پرانے نظام سے منتقلی قبول کریں", "مطابقت کی منظوری اسکول سیٹ اپ میں ہوتی ہے۔", "پرانے نظام سے منتقلی قبول کریں"]) },
  { key: "timetable.create_draft", operation: "timetable.create_draft", class: "B", risk: "CREATE", roles: ACADEMIC_LEADS, schema: timetableSetupProposalSchema,
    copy: c(["Draft a class timetable", "Create one draft timetable for a class with clash checks.", "Draft the 7B timetable for term 1"], ["مسودة جدول فصل", "إنشاء مسودة جدول لفصل مع فحص التعارض.", "أنشئ مسودة جدول 7ب للفصل الأول"], ["کلاس کا ٹائم ٹیبل ڈرافٹ", "تصادم کی جانچ کے ساتھ ایک کلاس کا ڈرافٹ ٹائم ٹیبل۔", "7بی کا پہلی ٹرم کا ٹائم ٹیبل بنائیں"]) },
  { key: "timetable.create_school_drafts", operation: "timetable.create_school_drafts", class: "B", risk: "CREATE", roles: ACADEMIC_LEADS, schema: schoolTimetableProposalSchema,
    copy: c(["Draft timetables for several classes", "Create draft timetables for up to 24 classes at once.", "Draft timetables for all grade 6 sections"], ["مسودات جداول لعدة فصول", "إنشاء مسودات حتى 24 فصلاً.", "أنشئ جداول كل شعب الصف السادس"], ["کئی کلاسوں کے ٹائم ٹیبل", "ایک ساتھ 24 کلاسوں تک کے ڈرافٹ۔", "چھٹی جماعت کے تمام سیکشنوں کے ٹائم ٹیبل بنائیں"]) },
  { key: "timetable.publish_reviewed", operation: "timetable.publish_reviewed", class: "C", risk: "PUBLISH", roles: ACADEMIC_LEADS, schema: publishTimetablesProposalSchema,
    copy: c(["Publish timetables", "Publication is decided on the timetable screen.", "Publish the grade 6 timetables"], ["نشر الجداول", "النشر يُقرر في شاشة الجدول.", "انشر جداول الصف السادس"], ["ٹائم ٹیبل شائع کریں", "اشاعت کا فیصلہ ٹائم ٹیبل اسکرین پر ہوتا ہے۔", "چھٹی جماعت کے ٹائم ٹیبل شائع کریں"]) },
  { key: "timetable.assign_substitutes", operation: "timetable.assign_substitutes", class: "B", risk: "UPDATE", roles: ACADEMIC_LEADS, schema: substituteProposalSchema,
    copy: c(["Assign cover teachers", "Reserve substitute duties for published lessons on a date.", "Cover Sana's lessons tomorrow with Bilal"], ["تعيين معلمين بدلاء", "حجز مهام البديل لحصص يوم محدد.", "غطِّ حصص سناء غداً ببلال"], ["متبادل استاد مقرر کریں", "کسی تاریخ کے شائع شدہ اسباق کے لیے متبادل ذمہ داری۔", "کل ثنا کے اسباق بلال لیں"]) },
  { key: "attendance.record_register_operator", operation: "attendance.record_register", class: "C", risk: "UPDATE", roles: OPERATORS, schema: attendanceProposalSchema,
    copy: c(["Record a class register for a teacher", "A register recorded by the office is reviewed on the attendance screen.", "Record yesterday's 5A register"], ["تسجيل حضور فصل", "سجل الحضور من المكتب يُراجع في شاشة الحضور.", "سجّل حضور 5أ ليوم أمس"], ["کلاس کی حاضری درج کریں", "دفتر سے درج حاضری کا جائزہ حاضری اسکرین پر ہوتا ہے۔", "کل کی 5اے کی حاضری درج کریں"]) },
  { key: "academics.transition_year", operation: "academics.transition_year", class: "C", risk: "APPROVAL_DECISION", roles: ACADEMIC_LEADS, schema: academicLifecycleProposalSchema,
    copy: c(["Activate, pause or close the academic year", "Year transitions are decided on the academic year screen.", "Activate the 2026-27 year"], ["تفعيل أو إغلاق العام الدراسي", "تُقرر في شاشة العام الدراسي.", "فعّل عام 2026-27"], ["تعلیمی سال فعال یا بند کریں", "یہ فیصلہ تعلیمی سال کی اسکرین پر ہوتا ہے۔", "2026-27 کا سال فعال کریں"]) },
  { key: "students.promote_enrollment", operation: "students.promote_enrollment", class: "C", risk: "UPDATE", roles: OPERATORS, schema: promotionProposalSchema,
    copy: c(["Promote students to the next year", "Promotion is reviewed on the year-end screen.", "Promote 5A to 6A"], ["ترفيع الطلاب", "يُراجع الترفيع في شاشة نهاية العام.", "رفّع 5أ إلى 6أ"], ["طلبہ کو اگلی جماعت میں ترقی", "ترقی کا جائزہ سال کے اختتام کی اسکرین پر ہوتا ہے۔", "5اے کو 6اے میں ترقی دیں"]) },
  { key: "operations.record_risk_decision", operation: "operations.record_risk_decision", class: "C", risk: "APPROVAL_DECISION", roles: ACADEMIC_LEADS, schema: riskDecisionProposalSchema,
    copy: c(["Record a decision on a school risk", "Risk decisions are recorded on the operations screen.", "Assign the attendance gap in 8B to Bilal by Friday"], ["تسجيل قرار بشأن مخاطرة", "تُسجل القرارات في شاشة العمليات.", "كلّف بلال بفجوة الحضور في 8ب"], ["خطرے پر فیصلہ درج کریں", "فیصلے آپریشنز اسکرین پر درج ہوتے ہیں۔", "8بی کی حاضری کا مسئلہ جمعہ تک بلال کو دیں"]) },
  { key: "communications.queue_announcement", operation: "communications.queue_announcement", class: "C", risk: "COMMUNICATION", roles: ACADEMIC_LEADS, schema: announcementProposalSchema,
    copy: c(["Send an announcement to families", "Family messages are reviewed and queued on the announcements screen.", "Tell grade 4 parents about the trip on Friday"], ["إرسال إعلان للأسر", "رسائل الأسر تُراجع وتُرسل من شاشة الإعلانات.", "أبلغ أولياء أمور الصف الرابع بالرحلة"], ["والدین کو اعلان بھیجیں", "خاندانوں کو پیغامات کا جائزہ اعلانات اسکرین پر ہوتا ہے۔", "چوتھی جماعت کے والدین کو جمعہ کے دورے کا بتائیں"]) },
  { key: "exams.create_session_plan", operation: "exams.create_session_plan", class: "B", risk: "CREATE", roles: ACADEMIC_LEADS, schema: examSessionPlanProposalSchema,
    copy: c(["Plan an exam session", "Create a draft exam session with datesheet, seating and invigilators.", "Plan the mid-term exams for grades 6 and 7"], ["تخطيط دورة امتحانات", "إنشاء مسودة جدول الامتحانات والمقاعد والمراقبين.", "خطط لامتحانات منتصف الفصل"], ["امتحانی سیشن کی منصوبہ بندی", "ڈیٹ شیٹ، نشستوں اور نگرانوں کے ساتھ ڈرافٹ سیشن۔", "چھٹی اور ساتویں کے وسط مدتی امتحانات کی منصوبہ بندی"]) },
  { key: "curriculum.import_topics", operation: "curriculum.import_topics", class: "A", risk: "CREATE", roles: ACADEMIC_LEADS, schema: curriculumDataSchema,
    copy: c(["Add syllabus topics", "Append missing topics from approved syllabus sources with page references; existing topics are kept.", "Add the chapter 3 topics from our approved maths syllabus"], ["إضافة موضوعات المنهج", "إضافة الموضوعات الناقصة من مصادر معتمدة مع أرقام الصفحات.", "أضف موضوعات الفصل الثالث من منهج الرياضيات"], ["نصاب کے موضوعات شامل کریں", "منظور شدہ ذرائع سے صفحات کے حوالوں کے ساتھ موضوعات شامل کریں۔", "منظور شدہ ریاضی کے نصاب سے باب 3 کے موضوعات شامل کریں"]) },
  { key: "fees.generate_invoices", operation: "fees.generate_invoices", class: "C", risk: "FINANCIAL", roles: FINANCE_DESK, schema: feeInvoiceProposalSchema,
    copy: c(["Generate fee invoices", "Invoices are reviewed and issued on the fee invoices screen.", "Generate October invoices for 5A"], ["إصدار فواتير الرسوم", "تُراجع الفواتير وتُصدر في شاشتها.", "أصدر فواتير أكتوبر لـ 5أ"], ["فیس کے انوائس بنائیں", "انوائس کا جائزہ اور اجرا انوائس اسکرین پر ہوتا ہے۔", "5اے کے اکتوبر کے انوائس بنائیں"]) },
  { key: "finance.apply_operation", operation: "finance.apply_operation", class: "C", risk: "FINANCIAL", roles: FINANCE_DESK, schema: financeOperationProposalSchema,
    copy: c(["Record a payment, refund or other finance entry", "Money is approved on the finance operations screen.", "Record Rs 12,000 cash for Bilal's October invoice"], ["تسجيل دفعة أو استرداد", "تُعتمد العمليات المالية في شاشة العمليات المالية.", "سجّل 12000 روبية نقداً لفاتورة أكتوبر"], ["ادائیگی یا رقم واپسی درج کریں", "رقم کی منظوری فنانس آپریشنز اسکرین پر ہوتی ہے۔", "بلال کے اکتوبر کے انوائس کے لیے 12,000 روپے نقد درج کریں"]) },
];

export const SCHOOL_OPERATION_ENTRIES: readonly CapabilityEntry[] = OPS.map(op => {
  const base = {
    key: op.key, version: 1, cluster: "C9" as const, inventoryKeys: [op.operation], risk: op.risk, roles: op.roles, copy: op.copy,
    input: op.schema, evidence: [] as string[], gates: [ownCampus(), typedOperationGate(op.operation)], scope: { kind: "own-campus" as const },
    source: { service: `src/lib/school-ai/execution.ts:executeSchoolAiTool (${op.operation})`, reuse: "typed-operation" as const },
  };
  if (op.class === "C") return defineCapability({
    ...base, class: "C",
    handoff: {
      kind: "RECORD_APPROVAL",
      async prepare(ctx, input: Record<string, unknown>, { idempotencyKey }) {
        const record = await saveProposal(ctx, op.operation, op.copy.title.en, input, idempotencyKey);
        return { kind: "RECORD_APPROVAL", targetRoles: op.roles, link: `/ai?workflow=${WORKFLOW_TAB[op.operation]}`, prefill: { recordId: record.id, version: record.version }, detail: { recordId: record.id } };
      },
    },
  });
  return defineCapability({
    ...base, class: op.class as "A" | "B", idempotency: { mode: "native" },
    preview: (_ctx, input: Record<string, unknown>) => previewOf(op.copy.title.en, input),
    execute: (ctx, input: Record<string, unknown>, { idempotencyKey }) => runApproved(ctx, op.operation, op.copy.title.en, input, idempotencyKey),
  });
});
