/**
 * Decides whether the composer can send. A failed attachment blocks Send until it is retried or removed, so a
 * message is never sent without a file the user still sees as selected. Editing an existing message sends no files.
 */
export type SendGateFile = { name: string; uploaded?: unknown; error?: string };
export type SendGate = { canSend: boolean; blockedBy: "uploading" | "failed" | null; failedNames: string[] };

export function sendGate(input: { text: string; files: SendGateFile[]; isSending: boolean; editing: boolean }): SendGate {
  const uploading = input.files.some((f) => !f.uploaded && !f.error);
  const failedNames = input.editing ? [] : input.files.filter((f) => f.error).map((f) => f.name);
  const hasContent = input.text.trim().length > 0 || input.files.some((f) => f.uploaded);
  const blockedBy = uploading ? "uploading" : failedNames.length > 0 ? "failed" : null;
  return { canSend: hasContent && blockedBy === null && !input.isSending, blockedBy, failedNames };
}
