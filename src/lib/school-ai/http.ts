import { ApiError, errorResponse } from "@/lib/api/scope";
import { ZodError } from "zod";
import { SchoolAiError } from "./access";
import { AICreditError, AIProviderQuotaError } from "@/lib/ai/openai";
import { BillingAccessError } from "@/lib/billing/entitlements";
import { AccessDenied } from "@/lib/auth/policy";
import { PIILeakError } from "@/lib/ai/pseudonymize";

export async function readBoundedBytes(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ApiError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError("Request is too large.", 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function readBoundedJson(request: Request, maxBytes = 500000) {
  const bytes = await readBoundedBytes(request, maxBytes);
  try { return JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new ApiError("Invalid JSON request.", 400); }
}

export async function readBoundedForm(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) throw new ApiError("A multipart file upload is required.", 400);
  const bytes = await readBoundedBytes(request, maxBytes);
  try { return await new Response(new Uint8Array(bytes), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new ApiError("The upload could not be read.", 400); }
}

export function schoolAiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
  // Never serialize provider responses, source text or credentials into a browser error.
  if (error instanceof AIProviderQuotaError) return Response.json({ error: "The configured AI provider has exhausted its API quota.", code: error.code }, { status: error.status });
  if (error instanceof PIILeakError) return Response.json({ error: "Review the source text and remove personal identifiers before asking the AI provider to process it.", code: "AI_SENSITIVE_CONTENT_BLOCKED" }, { status: 422 });
  // SKO-500: keep the machine code beside the message so a surface can react (stale, refused, rate limited).
  if (error instanceof SchoolAiError && error.code && error.status < 500) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof ApiError || error instanceof SchoolAiError || error instanceof AICreditError || error instanceof BillingAccessError || error instanceof AccessDenied) return errorResponse(error);
  return Response.json({ error: "This service is unavailable. Your saved work is unchanged; please try again." }, { status: 503 });
}
