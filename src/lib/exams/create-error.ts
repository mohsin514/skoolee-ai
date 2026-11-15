/** First user-facing reason in a create-exam 400 (`{ field: [msg] }`) or 409 (`"msg"`) body. */
export function createExamErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error.trim() || null;
  if (error && typeof error === "object") {
    for (const value of Object.values(error as Record<string, unknown>)) {
      if (Array.isArray(value) && typeof value[0] === "string" && value[0]) return value[0];
    }
  }
  return null;
}
