import { z } from "zod";

export interface AssistantTurn { role: "user" | "assistant"; text: string }
export const MAX_ASSISTANT_HISTORY_CHARACTERS = 32000;
export const assistantHistorySchema = z.array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(8000) })).max(8).superRefine((history, context) => {
  if (history.length % 2 !== 0 || history.some((turn, index) => turn.role !== (index % 2 === 0 ? "user" : "assistant"))) context.addIssue({ code: "custom", message: "Include only completed user and assistant exchanges in order." });
  if (history.reduce((sum, turn) => sum + turn.text.length, 0) > MAX_ASSISTANT_HISTORY_CHARACTERS) context.addIssue({ code: "custom", message: "Conversation context is too large." });
});

/** Keep complete, successful exchanges only. Conversation text remains in this browser session. */
export function boundedAssistantHistory(history: readonly AssistantTurn[]): AssistantTurn[] {
  const result: AssistantTurn[] = [];
  let size = 0;
  for (let end = history.length; end >= 2 && result.length < 8; end -= 2) {
    const user = history[end - 2], assistant = history[end - 1];
    if (user.role !== "user" || assistant.role !== "assistant" || !user.text || !assistant.text || user.text.length > 8000 || assistant.text.length > 8000) break;
    const nextSize = user.text.length + assistant.text.length;
    if (size + nextSize > MAX_ASSISTANT_HISTORY_CHARACTERS) break;
    result.unshift({ role: "user", text: user.text }, { role: "assistant", text: assistant.text });
    size += nextSize;
  }
  return result;
}
