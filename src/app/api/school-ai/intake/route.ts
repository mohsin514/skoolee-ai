import { queueDocumentJobInTransaction } from "@/lib/school-ai/document-jobs-service";
import { verifyCaptureTicket } from "@/lib/school-ai/capture-handoff";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser, resolveWorkspaceCampus, assertWorkspaceSubject, assertWorkspaceDomainPermission } from "@/lib/school-ai/access";
import { createWorkspaceRecord, findWorkspaceCreateByKey } from "@/lib/school-ai/repository";
import { documentKindSchema, languageSchema, MAX_DOCUMENT_BYTES, safeOriginalFileName, validateDocument } from "@/lib/school-ai/intake";
import { readBoundedForm, schoolAiError } from "@/lib/school-ai/http";
import { extractDocument, schoolAiProviderCapabilities } from "@/lib/school-ai/providers";
import { saveOriginal, removeOriginal, sourceStorageAvailable } from "@/lib/school-ai/source-storage";
import type { TxClient } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  let uploadedKey: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!(await authRateLimit(`school-ai:intake:${user.schoolId}:${user.userId}`, { limit: 20, windowMs: 300000 })).ok) throw new ApiError("Please wait before uploading another source.", 429);
    if (!sourceStorageAvailable()) throw new ApiError("Private source storage needs to be configured. You can still add source text manually.", 503);
    const form = await readBoundedForm(request, MAX_DOCUMENT_BYTES + 100000);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Choose a document to upload.", 400);
    const language = languageSchema.parse(form.get("language") || "en");
    const documentKind = documentKindSchema.parse(form.get("documentKind") || "other");
    const campusId = await resolveWorkspaceCampus(user, typeof form.get("campusId") === "string" && form.get("campusId") ? String(form.get("campusId")) : undefined);
    const scopedData: Record<string, unknown> = {
      documentKind,
      ...(form.get("subjectId") ? { subjectId: String(form.get("subjectId")), classId: String(form.get("classId") || "") } : {}),
    };
    if (form.get("captureTicket")) {
      const capture = await verifyCaptureTicket(user, String(form.get("captureTicket")));
      if (capture.campusId !== campusId || capture.documentKind !== documentKind || capture.language !== language || capture.subjectId !== scopedData.subjectId || capture.classId !== scopedData.classId) throw new ApiError("This upload differs from the reviewed capture scope.", 403);
    }
    await assertWorkspaceSubject(user, campusId, scopedData);
    await assertWorkspaceDomainPermission(user, "SOURCE", scopedData, "add");
    const bytes = Buffer.from(await file.arrayBuffer());
    let mimeType: string;
    try { mimeType = validateDocument(file.name, file.type, bytes); } catch (error) { throw new ApiError((error as Error).message, 400); }
    const fileName = safeOriginalFileName(file.name);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = createHash("sha256").update(JSON.stringify([sha256, documentKind, campusId, scopedData.subjectId, scopedData.classId])).digest("hex");
    const prior = await findWorkspaceCreateByKey(user, idempotencyKey);
    if (prior) return Response.json({ record: prior, requiresReview: prior.status !== "APPROVED", duplicate: true }, { headers: { "Cache-Control": "private, no-store" } });
    uploadedKey = await saveOriginal(user.schoolId, bytes, mimeType);
    const unavailable = { en: "Automatic extraction is unavailable. Review the original and enter its text.", ar: "الاستخراج التلقائي غير متاح. راجع الأصل وأدخل نصه.", ur: "خودکار متن اخذ کرنا دستیاب نہیں۔ اصل فائل دیکھ کر اس کا متن درج کریں۔" };
    const incomplete = { en: "Automatic extraction did not complete. The original is saved for manual review.", ar: "لم يكتمل الاستخراج التلقائي. تم حفظ الأصل للمراجعة اليدوية.", ur: "خودکار متن اخذ کرنا مکمل نہیں ہوا۔ اصل فائل دستی جائزے کے لیے محفوظ ہے۔" };
    let extraction: Awaited<ReturnType<typeof extractDocument>> = { text: "", pages: [] as Array<{ page: number; text: string }>, uncertainties: [unavailable[language]], model: "manual-review", tokensUsed: 0 };
    const nativeText = mimeType === "text/plain" || mimeType === "text/csv";
    const queuedExtraction = !nativeText && schoolAiProviderCapabilities().documentExtraction;
    if (nativeText) {
      try {
        extraction = await extractDocument(bytes, fileName, mimeType, language);
      } catch {
        extraction = { text: "", pages: [], uncertainties: [incomplete[language]], model: "manual-review", tokensUsed: 0 };
      }
    }
    const record = await createWorkspaceRecord(user, {
      kind: "SOURCE", title: fileName.slice(0, 180), campusId, idempotencyKey,
      data: { ...scopedData, fileName, mimeType, extractedText: extraction.text, sourcePages: extraction.pages,
        ...(extraction.expectedPageCount!==undefined?{expectedPageCount:extraction.expectedPageCount}:{}),...(extraction.missingPages?{missingPages:extraction.missingPages}:{}),...(extraction.structureReviewed!==undefined?{structureReviewed:extraction.structureReviewed}:{}),
        origin: form.get("origin") === "camera" ? "camera" : "upload", extractionStatus: "needs_review", uncertainties: extraction.uncertainties },
    }, {
      idempotencyFingerprint: idempotencyKey,
      trustedSourceMetadata: { storageKey: uploadedKey, sha256, extractionModel: extraction.model, extractedAt: new Date().toISOString(), sourceLanguage: language },
      ...(queuedExtraction ? { onCreate: async (tx: TxClient, saved: import("@/lib/school-ai/types").AiWorkspaceRecord) => { await queueDocumentJobInTransaction(user,saved,tx); } } : {}),
    });
    if (record.data.storageKey !== uploadedKey) await removeOriginal(uploadedKey).catch(() => {});
    uploadedKey = undefined;
    return Response.json({ record, requiresReview: true, processing: queuedExtraction }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (uploadedKey) await removeOriginal(uploadedKey).catch(() => {});
    return schoolAiError(error);
  }
}
