import type { HandoffPrepared } from "./registry/types";

/**
 * The closed set of codes the AI Workflows engine reports (control P11). Clients localise by code;
 * no English-only server sentence reaches the user. `params` carry ids and counts, never free text.
 */
export const WORKFLOW_ERROR_CODES = {
  ACCESS_CHANGED: 403,
  ROLE_NOT_ALLOWED: 403,
  SEAT_HELD: 403,
  SCOPE_DENIED: 403,
  SUSPENDED: 403,
  NOT_FOUND: 404,
  STALE_VERSION: 409,
  LEASED: 409,
  KEY_CONFLICT: 409,
  CONFIRM_REQUIRED: 409,
  SUPERSEDED: 409,
  UNCERTAIN: 409,
  INVALID_INPUT: 422,
  NOT_CONNECTED: 422,
  BUDGET_EXHAUSTED: 402,
  CREDITS_EXHAUSTED: 402,
  PROVIDER_UNAVAILABLE: 503,
  DEADLINE: 504,
  DOMAIN_REFUSED: 422,
  PRACTICE_MODE: 423,
  INTERNAL: 500,
} as const;
export type WorkflowErrorCode = keyof typeof WORKFLOW_ERROR_CODES;

export class WorkflowError extends Error {
  readonly status: number;
  constructor(readonly code: WorkflowErrorCode, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = "WorkflowError";
    this.status = WORKFLOW_ERROR_CODES[code];
  }
}

/** A typed operation whose approval policy needs another person; carries the already saved proposal. */
export class EscalationRequired extends Error {
  constructor(readonly prepared: HandoffPrepared) { super("ESCALATED"); this.name = "EscalationRequired"; }
}

/**
 * A resolver or preview could not bind the step to records without asking: a name matched no pupil or
 * several, a quote was negated, a date is ambiguous. Nothing ran; each field becomes a question.
 */
export interface RequiredField { pointer: string; promptKey: string; params?: Record<string, string | number>; options?: Array<{ value: string; label: string }> }
export class InputRequired extends Error {
  constructor(readonly fields: RequiredField[]) { super("INPUT_REQUIRED"); this.name = "InputRequired"; }
}

/** Maps any thrown value to a code. Domain messages are kept server-side (logged by kind only). */
export function toWorkflowError(error: unknown): WorkflowError {
  if (error instanceof WorkflowError) return error;
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
  if (status === 402) return new WorkflowError("CREDITS_EXHAUSTED");
  if (status === 403) return new WorkflowError("SCOPE_DENIED");
  if (status === 404) return new WorkflowError("NOT_FOUND");
  if (status === 409) return new WorkflowError("STALE_VERSION");
  if (status === 400 || status === 422) return new WorkflowError("DOMAIN_REFUSED");
  if (status === 503) return new WorkflowError("PROVIDER_UNAVAILABLE");
  return new WorkflowError("INTERNAL");
}
