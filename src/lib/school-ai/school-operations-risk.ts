import { z } from "zod";
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
export const riskIndicatorSchema = z.enum(["ATTENDANCE_GAPS", "UNCOVERED_LESSONS", "UNRELEASED_RESULTS"]);
export const riskScopeSchema = z.strictObject({ campusId: id, indicator: riskIndicatorSchema, scopeId: id, date });
export const riskDecisionProposalSchema = z.strictObject({ operation: z.literal("operations.record_risk_decision"), indicator: riskIndicatorSchema, scopeId: id, date, evidenceHash: z.string().regex(/^[a-f0-9]{64}$/), ownerId: id, dueDate: date, decision: z.enum(["MONITOR", "ACTION", "RESOLVE"]), note: z.string().trim().min(10).max(2000) });
export type RiskDecisionProposal = z.infer<typeof riskDecisionProposalSchema>;
export type RiskIndicator = z.infer<typeof riskIndicatorSchema>;
export type RiskEvidence = { indicator: RiskIndicator; scopeId: string; scopeName: string; date: string; count: number; total: number; evidenceHash: string; items: Array<{ id: string; label: string; detail: string }> };
export type RiskDecisionPreview = { operation: "operations.record_risk_decision"; recordId: string; version: number; campusId: string; previewHash: string; riskKey: string; evidence: RiskEvidence; ownerId: string; ownerName: string; dueDate: string; decision: RiskDecisionProposal["decision"]; note: string; previousDecisions: Array<{ id: string; actorName: string; at: string; decision: string; ownerName: string; dueDate: string; note: string; count: number }> };
export type RiskOptions = { classes: Array<{ id: string; name: string }>; cycles: Array<{ id: string; name: string }>; owners: Array<{ id: string; name: string }>; indicators: RiskIndicator[] };
export function riskModules(indicator: RiskIndicator) { return indicator === "ATTENDANCE_GAPS" ? ["attendance", "students"] as const : indicator === "UNCOVERED_LESSONS" ? ["timetable", "leave"] as const : ["exams", "reports"] as const; }
