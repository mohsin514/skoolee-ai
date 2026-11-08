import type { ConfirmationClass } from "../registry/types";

/**
 * Pure step and job state rules. No I/O: the runner asks what to do next and the UI renders the same
 * status enum (control P8), so a state the engine can reach always has a rendering.
 */
export const STEP_STATUSES = ["PENDING", "NEEDS_INPUT", "READY", "WAITING_CONFIRM", "RUNNING", "SUCCEEDED", "WAITING_HANDOFF", "HANDED_OFF_DONE", "BLOCKED", "STALE", "UNCERTAIN", "FAILED", "FAILED_UNVERIFIED", "SKIPPED", "CANCELLED"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export const JOB_STATUSES = ["PLANNING", "NEEDS_INPUT", "PLAN_REVIEW", "RUNNING", "WAITING_CONFIRM", "WAITING_HANDOFF", "PAUSED", "BLOCKED", "FAILED", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobOutcome = "EXECUTED" | "PARTIAL" | "ANSWERED" | "PLAN_SAVED" | "AWAITING_APPROVAL" | "NOT_SUPPORTED" | "NOTHING_DONE";

/** A finished step that later steps may build on. */
const SATISFIED: ReadonlySet<StepStatus> = new Set(["SUCCEEDED", "HANDED_OFF_DONE"]);
/** A step that will not run again without a person (dependants cannot proceed). */
const DEAD: ReadonlySet<StepStatus> = new Set(["BLOCKED", "STALE", "UNCERTAIN", "FAILED", "FAILED_UNVERIFIED", "SKIPPED", "CANCELLED"]);
const TERMINAL: ReadonlySet<StepStatus> = new Set([...SATISFIED, ...DEAD]);

export interface StepState {
  status: StepStatus; effectiveClass: ConfirmationClass; dependsOn: readonly string[]; missingFields: readonly string[];
  /** A confirmation exists for the step's current preview version and input. */
  confirmed: boolean;
}
export type NextAction = "wait" | "skip" | "ask" | "run" | "await-confirm" | "handoff" | "none";

export function nextStepAction(step: StepState, dependencies: ReadonlyMap<string, StepStatus>): NextAction {
  if (TERMINAL.has(step.status) || step.status === "RUNNING" || step.status === "WAITING_HANDOFF") return "none";
  const deps = step.dependsOn.map(key => dependencies.get(key));
  if (deps.some(status => status === undefined || DEAD.has(status))) return "skip";
  if (!deps.every(status => SATISFIED.has(status!))) return "wait";
  if (step.missingFields.length) return "ask";
  switch (step.effectiveClass) {
    case "A": return "run";
    case "B": return step.confirmed ? "run" : "await-confirm";
    case "C": return "handoff";
  }
}

export interface StepSummary { status: StepStatus; kind: "write" | "read" | "draft" | "handoff" | null }

/** The job's status from its steps; COMPLETED only when every step is terminal. */
export function deriveJobStatus(steps: readonly StepSummary[]): JobStatus {
  if (!steps.length) return "PLANNING";
  if (steps.some(step => step.status === "NEEDS_INPUT")) return "NEEDS_INPUT";
  if (steps.some(step => step.status === "WAITING_CONFIRM")) return "WAITING_CONFIRM";
  if (steps.some(step => ["PENDING", "READY", "RUNNING"].includes(step.status))) return "RUNNING";
  if (steps.some(step => step.status === "WAITING_HANDOFF")) return "WAITING_HANDOFF";
  // SKAI-1378: a failed step is never a successful completion, even when other steps finished.
  if (steps.some(step => step.status === "FAILED" || step.status === "FAILED_UNVERIFIED")) return "FAILED";
  return "COMPLETED";
}

/**
 * Honest outcome: EXECUTED needs a verified write receipt; a read never proves a write; a saved draft
 * or a hand-off is never reported as done.
 */
export function deriveOutcome(steps: readonly StepSummary[]): JobOutcome {
  const done = steps.filter(step => SATISFIED.has(step.status));
  const writes = done.filter(step => step.kind === "write").length;
  const failed = steps.some(step => DEAD.has(step.status) && step.status !== "SKIPPED");
  const waiting = steps.some(step => step.status === "WAITING_HANDOFF");
  if (writes && (failed || waiting)) return "PARTIAL";
  if (writes) return "EXECUTED";
  if (waiting || done.some(step => step.kind === "handoff")) return "AWAITING_APPROVAL";
  if (done.some(step => step.kind === "draft")) return "PLAN_SAVED";
  if (done.length && done.every(step => step.kind === "read")) return "ANSWERED";
  return "NOTHING_DONE";
}
