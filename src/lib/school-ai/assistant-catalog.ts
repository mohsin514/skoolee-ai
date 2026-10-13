import { z } from "zod";
import type { AssistantFocus } from "./assistant-focus";
export const assistantCatalogOperations = ["academics.setup_year", "timetable.create_draft", "timetable.create_school_drafts", "timetable.publish_reviewed", "attendance.record_register", "timetable.assign_substitutes", "academics.transition_year", "students.promote_enrollment", "communications.queue_announcement", "exams.create_session_plan", "fees.generate_invoices", "finance.apply_operation", "setup.apply_changes", "operations.record_risk_decision"] as const;
export const assistantEntityKinds = ["class", "subject", "teacher", "room", "period", "student", "enrollment", "cycle", "timetable", "riskScope", "owner", "invoice", "payment", "bank", "account", "ledger", "feeGroup", "feeLine", "source", "lesson", "template", "holiday"] as const;
export type AssistantEntityKind = typeof assistantEntityKinds[number];
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const assistantCatalogQuerySchema = z.strictObject({ operation: z.enum(assistantCatalogOperations), classId: id.optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value).optional(), indicator: z.enum(["ATTENDANCE_GAPS", "UNCOVERED_LESSONS", "UNRELEASED_RESULTS"]).optional(), scopeId: id.optional() });
export const assistantCatalogSelectionSchema = z.strictObject({ query: assistantCatalogQuerySchema, snapshot: z.string().regex(/^[a-f0-9]{64}$/), selected: z.array(z.strictObject({ kind: z.enum(assistantEntityKinds), id })).max(200) }).refine(value => new Set(value.selected.map(item => `${item.kind}:${item.id}`)).size === value.selected.length, "Choose each current item once.");
export type AssistantCatalogQuery = z.infer<typeof assistantCatalogQuerySchema>;
export type AssistantCatalogSelection = z.infer<typeof assistantCatalogSelectionSchema>;
export type AssistantEntity = { kind: AssistantEntityKind; id: string; label: string; facts: Record<string, string | number | boolean | null | string[]> };
export type AssistantCatalog = { query: AssistantCatalogQuery; entities: AssistantEntity[]; snapshot: string; truncated: boolean; facts: Record<string, unknown> };
export const catalogOperationsForFocus: Partial<Record<AssistantFocus["domain"], readonly typeof assistantCatalogOperations[number][]>> = {
  academicSetup: ["academics.setup_year"], timetableSetup: ["timetable.create_draft"], announcements: ["communications.queue_announcement"], feeInvoices: ["fees.generate_invoices"], examPlanning: ["exams.create_session_plan"], financeOperations: ["finance.apply_operation"], schoolSetup: ["setup.apply_changes"], schoolOperations: ["timetable.create_school_drafts", "attendance.record_register", "timetable.assign_substitutes", "academics.transition_year", "students.promote_enrollment", "operations.record_risk_decision", "timetable.publish_reviewed"],
};
const referenceKinds: Record<string, AssistantEntityKind> = { classId: "class", fromClassId: "class", targetClassId: "class", classIds: "class", subjectId: "subject", teacherId: "teacher", invigilatorId: "teacher", roomId: "room", separateRoomId: "room", periodDefinitionId: "period", studentId: "student", studentIds: "student", fromEnrollmentId: "enrollment", cycleId: "cycle", timetableIds: "timetable", scopeId: "riskScope", ownerId: "owner", invoiceId: "invoice", paymentId: "payment", bankAccountId: "bank", accountId: "account", ledgerId: "ledger", feeGroupId: "feeGroup", feeLineIds: "feeLine", sourceIds: "source", slotId: "lesson", holidayId: "holiday", expectedTeacherId: "teacher" };
/** Proposed row IDs are new identities; only domain-reference fields are bound to chosen current entities. */
export function proposalCatalogReferences(proposal: unknown): Array<{ kind: AssistantEntityKind; id: string }> {
  const refs: Array<{ kind: AssistantEntityKind; id: string }> = [];
  const visit = (value: unknown) => { if (Array.isArray(value)) { value.forEach(visit); return; } if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { const kind = referenceKinds[key]; if (kind) { for (const id of Array.isArray(child) ? child : [child]) if (typeof id === "string") refs.push({ kind, id }); } else visit(child); } };
  visit(proposal); return refs;
}
