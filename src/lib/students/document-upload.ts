import { checkStudentDocumentFile, cleanStudentDocumentName, studentDocumentContentType } from "./document-policy";

/**
 * SKAI-1890: the browser side of saving a student document: presign → private upload → record. Used by the
 * Scan sheets hub; every step is the same authenticated route the student profile uses, with its checks.
 */
export async function uploadStudentDocument(input: { studentId: string; kind: string; file: File }) {
  if (checkStudentDocumentFile(input.file)) throw new Error("Use a PDF, JPG, PNG, WebP or Word file up to 10 MB.");
  const fileName = cleanStudentDocumentName(input.file.name), contentType = studentDocumentContentType(input.file)!;
  const json = async (response: Response) => { const body = await response.json().catch(() => ({})); if (!response.ok || body.success === false) throw new Error(typeof body.error === "string" ? body.error : "The document could not be saved."); return body; };
  const presign = await json(await fetch("/api/uploads/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: input.studentId, fileName, contentType, sizeBytes: input.file.size }) }));
  const put = await fetch(presign.data.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: input.file });
  if (!put.ok) throw new Error("The file could not be stored. Try again.");
  await json(await fetch("/api/students/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: input.studentId, kind: input.kind, fileKey: presign.data.key, fileName }) }));
}
