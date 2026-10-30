// SKAI-165: one file policy for student documents, shared by the upload panel
// (checked before any bytes leave the browser) and the record route (checked
// again on the server). Mirrors the presign allow-list and its 10 MB cap.

export const STUDENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const STUDENT_DOCUMENT_KINDS = ["BIRTH_CERTIFICATE", "TRANSFER_CERTIFICATE", "PHOTO", "OTHER"] as const;
export const STUDENT_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type StudentDocumentFileProblem = "empty" | "too_large" | "unsupported_type";

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** Browsers sometimes leave `type` blank (notably for .docx); fall back to the extension. */
export function studentDocumentContentType(file: { name: string; type?: string }): string | null {
  const expected = TYPE_BY_EXTENSION[extensionOf(file.name)];
  if (!expected) return null;
  const declared = (file.type ?? "").trim().toLowerCase();
  return !declared || declared === "application/octet-stream" || declared === expected ? expected : null;
}

export function checkStudentDocumentFile(file: { name: string; type?: string; size: number }): StudentDocumentFileProblem | null {
  if (!studentDocumentContentType(file)) return "unsupported_type";
  if (!(file.size > 0)) return "empty";
  if (file.size > STUDENT_DOCUMENT_MAX_BYTES) return "too_large";
  return null;
}

/** Safe display/storage name: no path parts or control characters, bounded, extension kept. */
export function cleanStudentDocumentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ]/g, "_").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned;
  const ext = extensionOf(cleaned);
  return `${cleaned.slice(0, 119 - ext.length)}.${ext}`;
}

export function isStudentDocumentKind(kind: unknown): kind is (typeof STUDENT_DOCUMENT_KINDS)[number] {
  return typeof kind === "string" && (STUDENT_DOCUMENT_KINDS as readonly string[]).includes(kind);
}
