// SKO-411: honest per-answer save state and recovery of unsent edits.
// The server copy is authoritative; a local draft only holds edits the server has not acknowledged,
// and it is never applied without the learner choosing to restore it.

export type AnswerStatus = "CONFIRMED" | "PENDING" | "FAILED" | "EMPTY";
export type LocalDraft = { attemptId: string; baseSequence: number; responses: Record<string, string>; savedAt: string };
export type DraftDecision =
  | { kind: "NONE" }
  | { kind: "RESTORABLE"; changed: string[] }
  | { kind: "OUTDATED"; changed: string[] };

const norm = (value: string | undefined) => (value ?? "").trim();

/** Confirmed only when the server holds exactly this answer; otherwise pending while saving, failed after an error. */
export function answerStatus(local: string | undefined, server: string | undefined, state: { saving: boolean; failed: boolean }): AnswerStatus {
  if (norm(local) === norm(server)) return norm(local) ? "CONFIRMED" : "EMPTY";
  return state.failed && !state.saving ? "FAILED" : "PENDING";
}

/** Questions whose local value differs from the server copy. */
export function changedQuestions(local: Record<string, string>, server: Record<string, string>) {
  return [...new Set([...Object.keys(local), ...Object.keys(server)])].filter(id => norm(local[id]) !== norm(server[id])).sort();
}

/**
 * A draft written against the server's current version can be restored; one written against an older
 * version is shown as outdated so a newer acknowledged answer is never overwritten by older local work.
 */
export function reconcileDraft(draft: LocalDraft | null, attempt: { id: string; sequence: number; status: string; responses: Record<string, string> } | null): DraftDecision {
  if (!draft || !attempt || draft.attemptId !== attempt.id || attempt.status !== "IN_PROGRESS") return { kind: "NONE" };
  const changed = changedQuestions(draft.responses, attempt.responses);
  if (!changed.length) return { kind: "NONE" };
  return draft.baseSequence === attempt.sequence ? { kind: "RESTORABLE", changed } : { kind: "OUTDATED", changed };
}

export const draftKey = (attemptId: string) => `skoolee:exam-draft:${attemptId}`;
export function readDraft(storage: Pick<Storage, "getItem"> | null, attemptId: string): LocalDraft | null {
  try {
    const raw = storage?.getItem(draftKey(attemptId));
    const value = raw ? JSON.parse(raw) as LocalDraft : null;
    return value && value.attemptId === attemptId && typeof value.baseSequence === "number" && value.responses && typeof value.responses === "object" ? value : null;
  } catch { return null; }
}
export function writeDraft(storage: Pick<Storage, "setItem" | "removeItem"> | null, draft: LocalDraft | null, attemptId: string) {
  try { if (draft) storage?.setItem(draftKey(attemptId), JSON.stringify(draft)); else storage?.removeItem(draftKey(attemptId)); } catch { /* Storage may be blocked; the server copy remains authoritative. */ }
}

/** Retry delays for transient save failures; conflicts never retry automatically. */
export const retryDelay = (attempt: number) => Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt));
