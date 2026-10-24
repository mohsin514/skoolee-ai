import type { AiWorkflowHandoff, AiWorkflowJob, AiWorkflowQuestion, AiWorkflowStep } from "@prisma/client";
import { capability } from "./registry";
import type { ConfirmationClass, Locale, PreviewModel, Receipt } from "./registry/types";
import type { StepStatus } from "./executor/scheduler";

/**
 * The one projection the UI renders (control P8). Every engine step status maps to exactly one UI
 * state through an exhaustive switch; "saved" is only ever derived from a receipt. Ids appear only
 * where a command needs them (step ids, hashes); domain record ids stay in links.
 */
export type StepUiState = "planned" | "needs_input" | "awaiting_confirm" | "running" | "saved" | "looked_up" | "draft" | "handed_off" | "approved_elsewhere" | "skipped" | "uncertain" | "failed" | "stale" | "cancelled" | "practice";

export function uiState(status: StepStatus, receipt: Receipt | null, errorCode: string | null): StepUiState {
  switch (status) {
    case "PENDING": case "READY": return "planned";
    case "NEEDS_INPUT": return "needs_input";
    case "WAITING_CONFIRM": return "awaiting_confirm";
    case "RUNNING": return "running";
    case "SUCCEEDED": return !receipt ? "uncertain" : receipt.kind === "read" ? "looked_up" : receipt.kind === "draft" ? "draft" : "saved";
    case "WAITING_HANDOFF": return "handed_off";
    case "HANDED_OFF_DONE": return "approved_elsewhere";
    case "SKIPPED": return "skipped";
    case "UNCERTAIN": case "FAILED_UNVERIFIED": return "uncertain";
    case "FAILED": return errorCode === "PRACTICE_MODE" ? "practice" : "failed";
    case "BLOCKED": return "failed";
    case "STALE": return "stale";
    case "CANCELLED": return "cancelled";
    default: { const unreachable: never = status; throw new Error(`Unrendered step status ${String(unreachable)}`); }
  }
}

export interface StepView {
  id: string; key: string; capabilityKey: string; cls: ConfirmationClass; state: StepUiState;
  title: string; dependsOn: string[]; missingFields: string[];
  preview: (PreviewModel & { code: string; version: number; hash: string; inputHash: string }) | null;
  receipt: Pick<Receipt, "kind" | "counts" | "link" | "replayed"> & { entities: number; decidedBy?: string; text?: string } | null;
  handoff: { id: string; kind: string; status: string; link: string; roles: string[] } | null;
  errorCode: string | null;
}
export interface RunView {
  id: string; version: number; language: Locale; status: string; outcome: string | null; errorCode: string | null;
  createdAt: string; updatedAt: string; eventSeq: number;
  steps: StepView[]; questions: Array<{ id: string; promptKey: string; text: string | null; pointer: string | null; capabilityTitle: string | null; params: Record<string, string | number>; options: Array<{ value: string; label: string }> }>;
  credits: { used: number };
}

type JobWithParts = AiWorkflowJob & { steps: AiWorkflowStep[]; handoffs: AiWorkflowHandoff[]; questions: AiWorkflowQuestion[] };

export function toRunView(job: JobWithParts): RunView {
  const language = job.language as Locale;
  const steps = job.steps.filter(step => step.planVersion === job.planVersion).map((step): StepView => {
    const entry = capability(step.capabilityKey);
    const receipt = step.receipt as unknown as Receipt | null;
    const preview = step.preview as unknown as PreviewModel | null;
    const handoff = job.handoffs.find(item => item.id === step.handoffId) ?? null;
    return {
      id: step.id, key: step.stepKey, capabilityKey: step.capabilityKey, cls: step.effectiveClass as ConfirmationClass,
      state: uiState(step.status as StepStatus, receipt, step.errorCode), title: entry?.copy.title[language] ?? step.capabilityKey,
      dependsOn: step.dependsOn, missingFields: step.missingFields,
      preview: preview && step.previewHash && step.inputHash ? { ...preview, code: step.previewHash.slice(0, 4).toUpperCase(), version: step.previewVersion, hash: step.previewHash, inputHash: step.inputHash } : null,
      receipt: receipt ? { kind: receipt.kind, counts: receipt.counts, link: receipt.link, replayed: receipt.replayed, entities: receipt.entities.length, decidedBy: (receipt.detail as { decidedBy?: string } | undefined)?.decidedBy, text: receipt.kind === "read" ? (receipt.detail as { text?: string } | undefined)?.text : undefined } : null,
      handoff: handoff ? { id: handoff.id, kind: handoff.kind, status: handoff.status, link: handoff.targetRoute, roles: handoff.targetRoles } : null,
      errorCode: step.errorCode,
    };
  });
  const questions = job.questions.filter(question => question.status === "OPEN").map(question => {
    const params = question.promptParams as { text?: string; capability?: string } & Record<string, string | number>;
    const { text, capability: capabilityKey, ...rest } = params;
    return { id: question.id, promptKey: question.promptKey, text: text ?? null, pointer: question.pointer, capabilityTitle: capabilityKey ? capability(capabilityKey)?.copy.title[language] ?? null : null, params: rest, options: Array.isArray(question.options) ? question.options as Array<{ value: string; label: string }> : [] };
  });
  return {
    id: job.id, version: job.version, language, status: job.status, outcome: job.outcome, errorCode: job.errorCode,
    createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), eventSeq: job.eventSeq,
    steps, questions, credits: { used: job.creditsCharged },
  };
}
